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

  return (remoteItems || []).map((item) => Object.assign({}, localMap[item.id] || {}, item));
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
  createReservation,
  getCatalog,
  isCloudReady,
  joinEvent,
  listEvents,
  listMyRecords
};
