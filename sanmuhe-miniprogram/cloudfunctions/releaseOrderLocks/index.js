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

async function releaseInventory(locks) {
  for (const lock of locks || []) {
    if (!lock.docId || lock.quantity <= 0) {
      continue;
    }
    try {
      await db.collection(lock.collection).doc(lock.docId).update({
        data: {
          lockedStock: _.inc(-lock.quantity),
          updatedAt: db.serverDate()
        }
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

exports.main = async () => {
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

    await releaseInventory(order.inventoryLocks);
    await releaseUserCoupon(order.coupon);
    released += 1;
  }

  return {
    ok: true,
    scanned: expiredOrders.length,
    released
  };
};
