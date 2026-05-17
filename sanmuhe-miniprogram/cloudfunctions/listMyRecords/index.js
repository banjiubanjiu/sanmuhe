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

async function getMyCoupons(openid) {
  await ensureCollection("user_coupons");
  try {
    const result = await db.collection("user_coupons")
      .where({ _openid: openid })
      .orderBy("claimedAt", "desc")
      .limit(20)
      .get();
    return (result.data || []).map((item) => Object.assign({ id: item._id }, item));
  } catch (error) {
    return [];
  }
}

async function getMember(openid) {
  await ensureCollection("members");
  try {
    const result = await db.collection("members").where({ _openid: openid }).limit(1).get();
    return result.data && result.data[0] ? result.data[0] : null;
  } catch (error) {
    return null;
  }
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return { ok: true, name: "listMyRecords" };
  }

  const { OPENID } = cloud.getWXContext();
  const [orders, reservations, signups, coupons, member] = await Promise.all([
    getMine("orders", OPENID),
    getMine("reservations", OPENID),
    getMine("event_signups", OPENID),
    getMyCoupons(OPENID),
    getMember(OPENID)
  ]);

  return {
    ok: true,
    orders: orders.map((item) => Object.assign({ id: item.orderNo || item._id }, item)),
    reservations: reservations.map((item) => Object.assign({ id: item._id }, item)),
    signups: signups.map((item) => Object.assign({ id: item._id }, item)),
    coupons,
    member
  };
};
