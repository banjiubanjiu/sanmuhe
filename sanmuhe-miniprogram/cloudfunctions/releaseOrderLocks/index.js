const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/** 已发货后自动确认收货天数（默认 15，行业常见 7～15） */
const AUTO_CONFIRM_SHIPPED_DAYS = Math.max(
  1,
  Math.min(60, Number(process.env.AUTO_CONFIRM_SHIPPED_DAYS || 15))
);

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected after first setup.
  }
}

function inventorySnapshot(item = {}) {
  return {
    stock: Math.max(0, Number(item.stock) || 0),
    lockedStock: Math.max(0, Number(item.lockedStock) || 0),
    soldStock: Math.max(0, Number(item.soldStock) || 0)
  };
}

/** 兼容 wx-server-sdk：update 结果可能是 stats.updated 或 updated */
function dbUpdatedCount(result) {
  if (!result) {
    return 0;
  }
  if (result.stats && result.stats.updated != null) {
    return Number(result.stats.updated) || 0;
  }
  if (result.updated != null) {
    return Number(result.updated) || 0;
  }
  return 0;
}

async function writeInventoryLog(entry = {}) {
  try {
    await ensureCollection("inventory_logs");
    await db.collection("inventory_logs").add({
      data: Object.assign({
        collection: "",
        docId: "",
        itemId: "",
        itemName: "",
        type: "",
        quantity: 0,
        beforeStock: null,
        afterStock: null,
        beforeLockedStock: null,
        afterLockedStock: null,
        beforeSoldStock: null,
        afterSoldStock: null,
        orderNo: "",
        operator: "system",
        note: "",
        createdAt: db.serverDate()
      }, entry)
    });
  } catch (error) {
    // Timeout release should not be blocked by operation log writes.
  }
}

async function releaseInventory(locks, orderNo) {
  for (const lock of locks || []) {
    if (!lock.docId || lock.quantity <= 0) {
      continue;
    }
    try {
      const latest = await db.collection(lock.collection).doc(lock.docId).get();
      const before = inventorySnapshot(latest.data || {});
      await db.collection(lock.collection).doc(lock.docId).update({
        data: {
          lockedStock: _.inc(-lock.quantity),
          updatedAt: db.serverDate()
        }
      });
      await writeInventoryLog({
        collection: lock.collection,
        docId: lock.docId,
        itemId: lock.id || "",
        itemName: lock.name || "",
        type: "timeout_release",
        quantity: lock.quantity,
        beforeStock: before.stock,
        afterStock: before.stock,
        beforeLockedStock: before.lockedStock,
        afterLockedStock: Math.max(0, before.lockedStock - lock.quantity),
        beforeSoldStock: before.soldStock,
        afterSoldStock: before.soldStock,
        orderNo,
        operator: "releaseOrderLocks",
        note: "支付超时释放库存"
      });
    } catch (error) {
      // Continue releasing the remaining locks.
    }
  }
}

async function releaseUserCoupon(coupon) {
  if (!coupon || !coupon.userCouponId) {
    return;
  }
  try {
    await db.collection("user_coupons").doc(coupon.userCouponId).update({
      data: {
        status: "可使用",
        lockedOrderNo: "",
        lockedUntil: null,
        discount: 0,
        updatedAt: db.serverDate()
      }
    });
  } catch (error) {
    // Continue releasing other order resources.
  }
}

async function releaseExpiredReservations() {
  await ensureCollection("reservations");

  const result = await db.collection("reservations").where({
    status: "待支付",
    payStatus: "pending",
    lockedUntil: _.lte(new Date())
  }).limit(100).get();

  const expiredReservations = result.data || [];
  let released = 0;

  for (const reservation of expiredReservations) {
    const claim = await db.collection("reservations").where({
      _id: reservation._id,
      status: "待支付",
      payStatus: "pending"
    }).update({
      data: {
        status: "已取消",
        payStatus: "expired",
        cancellationReason: "支付超时",
        updatedAt: db.serverDate()
      }
    });

    if (dbUpdatedCount(claim) === 0) {
      continue;
    }
    released += 1;
  }

  return {
    scanned: expiredReservations.length,
    released
  };
}

/**
 * 快递「已发货」超过 N 天仍未确认收货 → 自动完成
 * 以 shippedAt 为准；无 shippedAt 时用 updatedAt 兜底
 */
async function autoConfirmShippedOrders() {
  await ensureCollection("orders");
  const deadline = new Date(Date.now() - AUTO_CONFIRM_SHIPPED_DAYS * 24 * 60 * 60 * 1000);

  // 先按 shippedAt 捞
  let rows = [];
  try {
    const byShipped = await db.collection("orders").where({
      status: "已发货",
      deliveryMethod: "shipping",
      shippedAt: _.lte(deadline)
    }).limit(50).get();
    rows = byShipped.data || [];
  } catch (error) {
    rows = [];
  }

  // 兼容历史单无 shippedAt：用 updatedAt
  if (rows.length < 50) {
    try {
      const byUpdated = await db.collection("orders").where({
        status: "已发货",
        deliveryMethod: "shipping",
        shippedAt: _.exists(false),
        updatedAt: _.lte(deadline)
      }).limit(50 - rows.length).get();
      rows = rows.concat(byUpdated.data || []);
    } catch (error) {
      // ignore
    }
  }

  let confirmed = 0;
  for (const order of rows) {
    const claim = await db.collection("orders").where({
      _id: order._id,
      status: "已发货"
    }).update({
      data: {
        status: "已完成",
        fulfillmentStatus: "delivered",
        completedBy: "system_auto",
        completedAt: db.serverDate(),
        autoConfirmed: true,
        autoConfirmDays: AUTO_CONFIRM_SHIPPED_DAYS,
        cancelReason: "",
        adminNote: cleanTextAppend(
          order.adminNote,
          `系统在发货 ${AUTO_CONFIRM_SHIPPED_DAYS} 天后自动确认收货`
        ),
        updatedAt: db.serverDate()
      }
    });
    if (dbUpdatedCount(claim) > 0) {
      confirmed += 1;
    }
  }

  return {
    scanned: rows.length,
    confirmed,
    days: AUTO_CONFIRM_SHIPPED_DAYS
  };
}

function cleanTextAppend(existing, note) {
  const base = String(existing || "").trim();
  const add = String(note || "").trim();
  if (!add) {
    return base;
  }
  if (!base) {
    return add.slice(0, 300);
  }
  if (base.indexOf(add) >= 0) {
    return base.slice(0, 300);
  }
  return `${base}；${add}`.slice(0, 300);
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return {
      ok: true,
      name: "releaseOrderLocks",
      autoConfirmShippedDays: AUTO_CONFIRM_SHIPPED_DAYS
    };
  }

  await ensureCollection("orders");

  const result = await db.collection("orders").where({
    status: "待支付",
    payStatus: "pending",
    lockReleased: _.neq(true),
    lockedUntil: _.lte(new Date())
  }).limit(100).get();

  const expiredOrders = result.data || [];
  let released = 0;

  for (const order of expiredOrders) {
    const claim = await db.collection("orders").where({
      _id: order._id,
      status: "待支付",
      payStatus: "pending",
      lockReleased: _.neq(true)
    }).update({
      data: {
        status: "已取消",
        payStatus: "expired",
        lockReleased: true,
        cancelReason: "支付超时，库存锁定已释放",
        updatedAt: db.serverDate()
      }
    });

    if (dbUpdatedCount(claim) === 0) {
      continue;
    }

    await releaseInventory(order.inventoryLocks, order.orderNo);
    await releaseUserCoupon(order.coupon);
    released += 1;
  }

  const reservationRelease = await releaseExpiredReservations();
  const autoConfirm = await autoConfirmShippedOrders();

  return {
    ok: true,
    scanned: expiredOrders.length,
    released,
    reservationsScanned: reservationRelease.scanned,
    reservationsReleased: reservationRelease.released,
    autoConfirmShipped: autoConfirm
  };
};
