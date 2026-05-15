const { drinks, teaProducts, rooms, events } = require("../data/catalog");

function getFallbackCatalog() {
  return {
    drinks,
    teaProducts,
    rooms,
    events
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

function enrichCatalog(catalog) {
  const source = catalog || {};
  return {
    drinks: mergeById(source.drinks && source.drinks.length ? source.drinks : drinks, drinks),
    teaProducts: mergeById(source.teaProducts && source.teaProducts.length ? source.teaProducts : teaProducts, teaProducts),
    rooms: mergeById(source.rooms && source.rooms.length ? source.rooms : rooms, rooms),
    events: mergeById(source.events && source.events.length ? source.events : events, events)
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
    .then((result) => enrichCatalog(result.catalog || getFallbackCatalog()))
    .catch(() => enrichCatalog(getFallbackCatalog()));
}

function listEvents() {
  return callCloud("listEvents")
    .then((result) => mergeById(result.events || events, events))
    .catch(() => {
      const customEvents = wx.getStorageSync("sanmuhe_custom_events") || [];
      return customEvents.concat(events);
    });
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
    orders: wx.getStorageSync("sanmuhe_orders") || [],
    reservations: wx.getStorageSync("sanmuhe_reservations") || [],
    signups: wx.getStorageSync("sanmuhe_event_signups") || []
  }));
}

module.exports = {
  createEvent,
  createOrder,
  createPayment,
  createReservation,
  getCatalog,
  isCloudReady,
  joinEvent,
  listEvents,
  listMyRecords,
  payOrder
};
