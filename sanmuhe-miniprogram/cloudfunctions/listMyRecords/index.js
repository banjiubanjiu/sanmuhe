const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected after first setup.
  }
}

async function getMine(collection, openid) {
  await ensureCollection(collection);
  try {
    const result = await db.collection(collection)
      .where({ _openid: openid })
      .orderBy("createdAt", "desc")
      .limit(30)
      .get();
    return result.data || [];
  } catch (error) {
    return [];
  }
}

async function getActiveCoupons() {
  await ensureCollection("coupons");
  try {
    const result = await db.collection("coupons")
      .where({
        visible: true,
        status: "领取中"
      })
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();
    return result.data || [];
  } catch (error) {
    return [];
  }
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const [orders, reservations, signups, coupons] = await Promise.all([
    getMine("orders", OPENID),
    getMine("reservations", OPENID),
    getMine("event_signups", OPENID),
    getActiveCoupons()
  ]);

  return {
    ok: true,
    orders: orders.map((item) => Object.assign({ id: item.orderNo || item._id }, item)),
    reservations: reservations.map((item) => Object.assign({ id: item._id }, item)),
    signups: signups.map((item) => Object.assign({ id: item._id }, item)),
    coupons
  };
};
