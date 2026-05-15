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

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const [orders, reservations, signups] = await Promise.all([
    getMine("orders", OPENID),
    getMine("reservations", OPENID),
    getMine("event_signups", OPENID)
  ]);

  return {
    ok: true,
    orders: orders.map((item) => Object.assign({ id: item.orderNo || item._id }, item)),
    reservations,
    signups
  };
};
