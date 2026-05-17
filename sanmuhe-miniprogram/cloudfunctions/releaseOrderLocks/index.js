const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

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

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return { ok: true, name: "releaseOrderLocks" };
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

    if (claim.updated === 0) {
      continue;
    }

    await releaseInventory(order.inventoryLocks, order.orderNo);
    await releaseUserCoupon(order.coupon);
    released += 1;
  }

  return {
    ok: true,
    scanned: expiredOrders.length,
    released
  };
};
