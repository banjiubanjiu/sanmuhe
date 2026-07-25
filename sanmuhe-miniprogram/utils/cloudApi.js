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

// 云端记录覆盖本地，但用本地补齐缺失字段（如 teaGroups / tagline）
function fillFromLocal(remoteItems, localItems) {
  const localMap = localItems.reduce((map, item) => {
    map[item.id] = item;
    return map;
  }, {});
  return (remoteItems || []).map((item) => {
    const local = localMap[item.id];
    if (!local) {
      return item;
    }
    const merged = Object.assign({}, local, item);
    // 云端缺结构化茶款时，保留本地 teaGroups
    if ((!Array.isArray(item.teaGroups) || !item.teaGroups.length) && local.teaGroups) {
      merged.teaGroups = local.teaGroups;
    }
    if (!merged.tagline && local.tagline) {
      merged.tagline = local.tagline;
    }
    if (!merged.brewStyle && local.brewStyle) {
      merged.brewStyle = local.brewStyle;
    }
    if (!merged.serviceType && local.serviceType) {
      merged.serviceType = local.serviceType;
    }
    if (!merged.unit && local.unit) {
      merged.unit = local.unit;
    }
    if (!merged.image && local.image) {
      merged.image = local.image;
    }
    return merged;
  });
}

function normalizeCatalogList(source, key, localItems, trustRemote) {
  const remote = Array.isArray(source[key]) ? source[key] : [];
  if (trustRemote) {
    // 云端可见列表为空时回退本地，避免前台被刷成空白
    if (!remote.length) {
      return localItems.slice();
    }
    return fillFromLocal(remote, localItems);
  }
  return mergeById(remote.length ? remote : localItems, localItems);
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

function requireOk(result, fallbackMessage) {
  if (!result || result.ok === false) {
    throw new Error(result && result.message ? result.message : fallbackMessage);
  }
  return result;
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
  return callCloud("listMyRecords").then((result) => requireOk(result, "读取个人记录失败"));
}

function listMyOrders(payload) {
  return callCloud("listMyRecords", Object.assign({
    action: "listOrders",
    tab: "all",
    page: 1,
    pageSize: 10
  }, payload || {})).then((result) => requireOk(result, "读取订单失败"));
}

function getMyOrder(orderId) {
  return callCloud("listMyRecords", {
    action: "getOrder",
    orderId
  }).then((result) => requireOk(result, "读取订单详情失败"));
}

function updateMyOrder(action, orderId, payload) {
  return callCloud("listMyRecords", Object.assign({
    action,
    orderId
  }, payload || {})).then((result) => requireOk(result, "订单操作失败"));
}

function getMemberCenter() {
  return callCloud("memberCenter", { action: "getMemberCenter" }).catch(() => ({
    member: null,
    wallet: null,
    plans: [],
    payment: {
      realPaymentReady: false,
      testRechargeEnabled: false
    },
    userCoupons: [],
    availableCoupons: [],
    subscriptionTemplates: []
  }));
}

function activateMember(payload) {
  return callCloud("memberCenter", Object.assign({ action: "activateMember" }, payload || {}));
}

function simulateMemberRecharge(payload) {
  return callCloud("memberCenter", Object.assign({ action: "simulateRecharge" }, payload || {}));
}

function rechargeMember(planId) {
  return createPayment({
    action: "createRechargePayment",
    kind: "memberRecharge",
    planId
  }).then((result) => {
    if (!result || result.ok === false) {
      throw new Error(result && result.message ? result.message : "发起充值失败");
    }
    return requestPayment(result.payment).then((paymentResult) => ({
      paymentResult,
      recharge: result
    }));
  });
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
  activateMember,
  createEvent,
  createOrder,
  createPayment,
  createReservation,
  getCatalog,
  getMemberCenter,
  getMyOrder,
  isCloudReady,
  joinEvent,
  claimCoupon,
  listEvents,
  listMyOrders,
  listMyRecords,
  payOrder,
  rechargeMember,
  saveSubscription,
  simulateMemberRecharge,
  updateMyOrder
};
