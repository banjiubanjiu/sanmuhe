const { drinks, teaProducts, rooms, events, homeSlides } = require("../data/catalog");

function getFallbackCatalog() {
  return {
    drinks,
    teaProducts,
    rooms,
    events,
    content: {
      homeSlides
    },
    settings: null,
    fromCloud: false
  };
}

function mergeById(remoteItems, localItems) {
  const localMap = localItems.reduce((map, item) => {
    map[item.id] = item;
    return map;
  }, {});

  const remoteIds = {};
  const mergedRemote = (remoteItems || []).map((item) => {
    remoteIds[item.id] = true;
    return Object.assign({}, localMap[item.id] || {}, item);
  });
  const localOnly = localItems.filter((item) => !remoteIds[item.id]);
  return mergedRemote.concat(localOnly);
}

function normalizeCatalogList(source, key, localItems, trustRemote) {
  if (trustRemote) {
    return Array.isArray(source[key]) ? source[key] : [];
  }
  return mergeById(source[key] && source[key].length ? source[key] : localItems, localItems);
}

function enrichCatalog(catalog, options = {}) {
  const source = catalog || {};
  const trustRemote = options.trustRemote === true;
  return {
    drinks: normalizeCatalogList(source, "drinks", drinks, trustRemote),
    teaProducts: normalizeCatalogList(source, "teaProducts", teaProducts, trustRemote),
    rooms: normalizeCatalogList(source, "rooms", rooms, trustRemote),
    events: normalizeCatalogList(source, "events", events, trustRemote),
    content: source.content || { homeSlides: [] },
    settings: source.settings || null,
    fromCloud: trustRemote
  };
}

function isCloudReady() {
  const app = getApp({ allowDefault: true });
  return !!(wx.cloud && app.globalData && app.globalData.cloudReady);
}

function callCloud(name, data) {
  if (!isCloudReady()) {
    return Promise.reject({ localFallback: true, message: "cloud not configured" });
  }

  return wx.cloud.callFunction({
    name,
    data: data || {}
  }).then((res) => res.result || {});
}

function getCatalog() {
  return callCloud("getCatalog")
    .then((result) => enrichCatalog(result.catalog || {}, { trustRemote: true }))
    .catch(() => enrichCatalog(getFallbackCatalog()));
}

function listEvents() {
  return callCloud("listEvents")
    .then((result) => Array.isArray(result.events) ? result.events : [])
    .catch(() => events);
}

function createOrder(payload) {
  return callCloud("createOrder", payload);
}

function createPayment(payload) {
  return callCloud("createPayment", payload);
}

function requestPayment(payment) {
  return new Promise((resolve, reject) => {
    if (!wx.requestPayment) {
      reject(new Error("当前微信版本不支持支付"));
      return;
    }
    wx.requestPayment(Object.assign({}, payment, {
      success: resolve,
      fail: reject
    }));
  });
}

function payOrder(order) {
  const payload = {
    orderId: order && (order._id || order.orderId || order.id),
    orderNo: order && order.orderNo
  };

  return createPayment(payload).then((result) => {
    if (!result || result.ok === false) {
      throw new Error(result && result.message ? result.message : "发起支付失败");
    }
    return requestPayment(result.payment).then((paymentResult) => ({
      paymentResult,
      order: result
    }));
  });
}

function createReservation(payload) {
  return callCloud("createReservation", payload);
}

function createEvent(payload) {
  return callCloud("createEvent", payload);
}

function joinEvent(payload) {
  return callCloud("joinEvent", payload);
}

function listMyRecords() {
  return callCloud("listMyRecords").catch(() => ({
    orders: [],
    reservations: [],
    signups: [],
    coupons: [],
    member: null
  }));
}

function getMemberCenter() {
  return callCloud("memberCenter", { action: "getMemberCenter" }).catch(() => ({
    member: null,
    userCoupons: [],
    availableCoupons: [],
    subscriptionTemplates: []
  }));
}

function claimCoupon(couponId) {
  return callCloud("memberCenter", { action: "claimCoupon", couponId });
}

function saveSubscription(subscriptions, templates) {
  return callCloud("memberCenter", {
    action: "saveSubscription",
    subscriptions,
    templates
  });
}

module.exports = {
  createEvent,
  createOrder,
  createPayment,
  createReservation,
  getCatalog,
  getMemberCenter,
  isCloudReady,
  joinEvent,
  claimCoupon,
  listEvents,
  listMyRecords,
  payOrder,
  saveSubscription
};
