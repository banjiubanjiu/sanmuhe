const { drinks, teaProducts, rooms, events } = require("../data/catalog");
const { localImage } = require("../config/assets");

const CATALOG_CACHE_KEY = "sanmuhe_catalog_cache_v1";
const EVENTS_CACHE_KEY = "sanmuhe_events_cache_v1";
/** 失败回落只用近期成功快照，避免刚下架的货长期留在本地 */
const CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;

function isCacheFresh(cachedAt) {
  const ts = Number(cachedAt) || 0;
  return ts > 0 && (Date.now() - ts) <= CATALOG_CACHE_TTL_MS;
}

function emptyCatalog() {
  return {
    drinks: [],
    teaProducts: [],
    rooms: [],
    events: [],
    productCategories: [],
    content: {
      homeSlides: []
    },
    settings: null
  };
}

function withCatalogMeta(catalog, source) {
  const next = catalog || emptyCatalog();
  return {
    drinks: Array.isArray(next.drinks) ? next.drinks : [],
    teaProducts: Array.isArray(next.teaProducts) ? next.teaProducts : [],
    rooms: Array.isArray(next.rooms) ? next.rooms : [],
    events: Array.isArray(next.events) ? next.events : [],
    productCategories: Array.isArray(next.productCategories) ? next.productCategories : [],
    content: next.content || { homeSlides: [] },
    settings: next.settings || null,
    fromCloud: source === "cloud",
    fromCache: source === "cache",
    source,
    catalogError: source === "error"
  };
}

function writeCatalogCache(catalog) {
  try {
    wx.setStorageSync(CATALOG_CACHE_KEY, {
      drinks: catalog.drinks || [],
      teaProducts: catalog.teaProducts || [],
      rooms: catalog.rooms || [],
      events: catalog.events || [],
      productCategories: catalog.productCategories || [],
      content: catalog.content || { homeSlides: [] },
      settings: catalog.settings || null,
      cachedAt: Date.now()
    });
  } catch (error) {
    // storage 满或不可用时忽略，不影响当次展示
  }
}

function readCatalogCache() {
  try {
    const cached = wx.getStorageSync(CATALOG_CACHE_KEY);
    if (!cached || typeof cached !== "object") {
      return null;
    }
    return {
      drinks: Array.isArray(cached.drinks) ? cached.drinks : [],
      teaProducts: Array.isArray(cached.teaProducts) ? cached.teaProducts : [],
      rooms: Array.isArray(cached.rooms) ? cached.rooms : [],
      events: Array.isArray(cached.events) ? cached.events : [],
      productCategories: Array.isArray(cached.productCategories) ? cached.productCategories : [],
      content: cached.content || { homeSlides: [] },
      settings: cached.settings || null,
      cachedAt: Number(cached.cachedAt) || 0
    };
  } catch (error) {
    return null;
  }
}

function writeEventsCache(list) {
  try {
    wx.setStorageSync(EVENTS_CACHE_KEY, {
      events: Array.isArray(list) ? list : [],
      cachedAt: Date.now()
    });
  } catch (error) {
    // ignore
  }
}

function readEventsCache() {
  try {
    const cached = wx.getStorageSync(EVENTS_CACHE_KEY);
    if (cached && typeof cached === "object" && Array.isArray(cached.events)) {
      return {
        events: cached.events,
        cachedAt: Number(cached.cachedAt) || 0
      };
    }
    // 旧版只存了数组，没有时间戳，不当作新鲜货架
    const catalog = readCatalogCache();
    if (catalog && Array.isArray(catalog.events)) {
      return {
        events: catalog.events,
        cachedAt: Number(catalog.cachedAt) || 0
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

function withCloudImages(item) {
  if (!item || typeof item !== "object") {
    return item;
  }
  const next = Object.assign({}, item);
  // localImage：云路径尽量映射回包内，避免 PRIVATE 存储裂图
  if (next.image) {
    next.image = localImage(next.image);
  }
  if (next.thumb) {
    next.thumb = localImage(next.thumb);
  }
  if (next.detailImage) {
    next.detailImage = localImage(next.detailImage);
  }
  return next;
}

// 只补同 id 缺失字段，绝不把本地演示商品加回货架
function fillFromLocal(remoteItems, localItems) {
  const localMap = localItems.reduce((map, item) => {
    map[item.id] = item;
    return map;
  }, {});
  return (remoteItems || []).map((item) => {
    const local = localMap[item.id];
    if (!local) {
      return withCloudImages(item);
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
    return withCloudImages(merged);
  });
}

function normalizeCatalogList(source, key, localItems) {
  const remote = Array.isArray(source[key]) ? source[key] : [];
  if (!remote.length) {
    return [];
  }
  return fillFromLocal(remote, localItems);
}

function enrichCatalog(catalog) {
  const source = catalog || {};
  return {
    drinks: normalizeCatalogList(source, "drinks", drinks),
    teaProducts: normalizeCatalogList(source, "teaProducts", teaProducts),
    rooms: normalizeCatalogList(source, "rooms", rooms),
    events: normalizeCatalogList(source, "events", events),
    productCategories: Array.isArray(source.productCategories) ? source.productCategories : [],
    content: source.content || { homeSlides: [] },
    settings: source.settings || null
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
    .then((result) => {
      const catalog = withCatalogMeta(enrichCatalog(result.catalog || {}), "cloud");
      writeCatalogCache(catalog);
      writeEventsCache(catalog.events);
      return catalog;
    })
    .catch(() => {
      const cached = readCatalogCache();
      if (cached && isCacheFresh(cached.cachedAt)) {
        return withCatalogMeta(enrichCatalog(cached), "cache");
      }
      return withCatalogMeta(emptyCatalog(), "error");
    });
}

function listEvents() {
  return callCloud("listEvents")
    .then((result) => {
      const nextEvents = Array.isArray(result.events) ? result.events : [];
      writeEventsCache(nextEvents);
      return nextEvents;
    })
    .catch(() => {
      const cached = readEventsCache();
      if (cached && isCacheFresh(cached.cachedAt)) {
        return cached.events;
      }
      return [];
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
      const err = new Error(result && result.message ? result.message : "发起支付失败");
      err.code = result && result.code;
      err.order = result;
      throw err;
    }
    if (!result.payment || !result.payment.timeStamp || !result.payment.paySign) {
      throw new Error("支付参数不完整，请稍后重试");
    }
    // package 关键字偶发丢失时回退 prepayPackage
    const packageValue = result.payment.package || result.payment.prepayPackage || "";
    if (!packageValue || !String(packageValue).startsWith("prepay_id=")) {
      throw new Error("支付参数缺少 prepay_id，请稍后重试");
    }
    // 小程序收银台要求字段均为字符串
    const payment = {
      timeStamp: String(result.payment.timeStamp),
      nonceStr: String(result.payment.nonceStr || ""),
      package: String(packageValue),
      signType: result.payment.signType || "RSA",
      paySign: String(result.payment.paySign || "")
    };
    return requestPayment(payment).then((paymentResult) => ({
      paymentResult,
      order: result
    })).catch((error) => {
      const msg = (error && (error.errMsg || error.message)) || "支付未完成";
      const err = new Error(msg);
      err.raw = error;
      err.order = result;
      throw err;
    });
  });
}

function createReservation(payload) {
  return callCloud("createReservation", payload);
}

function cancelReservation(payload) {
  return callCloud("createReservation", Object.assign({ action: "cancelReservation" }, payload || {}));
}

function createReservationPayment(payload) {
  return callCloud("createPayment", Object.assign({ action: "createReservationPayment" }, payload || {}));
}

function payReservation(reservation) {
  const payload = {
    reservationId: reservation && (reservation._id || reservation.reservationId || reservation.id),
    reservationNo: reservation && reservation.reservationNo
  };

  return createReservationPayment(payload).then((result) => {
    if (!result || result.ok === false) {
      const err = new Error(result && result.message ? result.message : "发起预约支付失败");
      err.code = result && result.code;
      err.reservation = result;
      throw err;
    }
    if (!result.payment || !result.payment.timeStamp || !result.payment.paySign) {
      throw new Error("支付参数不完整，请稍后重试");
    }
    const packageValue = result.payment.package || result.payment.prepayPackage || "";
    if (!packageValue || !String(packageValue).startsWith("prepay_id=")) {
      throw new Error("支付参数缺少 prepay_id，请稍后重试");
    }
    const payment = {
      timeStamp: String(result.payment.timeStamp),
      nonceStr: String(result.payment.nonceStr || ""),
      package: String(packageValue),
      signType: result.payment.signType || "RSA",
      paySign: String(result.payment.paySign || "")
    };
    return requestPayment(payment).then((paymentResult) => ({
      paymentResult,
      reservation: result
    })).catch((error) => {
      const msg = (error && (error.errMsg || error.message)) || "支付未完成";
      const err = new Error(msg);
      err.raw = error;
      err.reservation = result;
      throw err;
    });
  });
}

function listReservedSlots(payload) {
  return callCloud("createReservation", Object.assign({ action: "listReservedSlots" }, payload || {}));
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

function getMyOrder(orderId, lookup = {}) {
  return callCloud("listMyRecords", Object.assign({
    action: "getOrder",
    orderId
  }, lookup || {})).then((result) => requireOk(result, "读取订单详情失败"));
}

function updateMyOrder(action, orderId, payload) {
  return callCloud("listMyRecords", Object.assign({
    action,
    orderId
  }, payload || {})).then((result) => requireOk(result, "订单操作失败"));
}

function queryLogistics(orderId, options = {}) {
  return callCloud("listMyRecords", Object.assign({
    action: "queryLogistics",
    orderId
  }, options || {})).then((result) => {
    if (!result) {
      throw new Error("物流查询失败");
    }
    return result;
  });
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

/** 仅解析微信手机号授权 code，用于自提等履约联系，不开通会员 */
function resolvePhoneNumber(phoneCode) {
  return callCloud("memberCenter", {
    action: "resolvePhone",
    phoneCode: phoneCode || ""
  }).then((result) => {
    if (!result || result.ok === false) {
      throw new Error((result && result.message) || "手机号授权失败");
    }
    return result;
  });
}

/** 手填手机号并绑定到当前用户 */
function saveContactPhone(phone) {
  return callCloud("memberCenter", {
    action: "saveContactPhone",
    phone: phone || ""
  }).then((result) => {
    if (!result || result.ok === false) {
      throw new Error((result && result.message) || "保存手机号失败");
    }
    return result;
  });
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
    return requestPayment(result.payment).then((paymentResult) => {
      // 支付成功后主动查单补入账：回调偶发失败时仍能到账
      const orderNo = result.orderNo;
      if (!orderNo) {
        return { paymentResult, recharge: result };
      }
      return createPayment({
        action: "reconcileRecharge",
        orderNo
      }).then((reconcile) => ({
        paymentResult,
        recharge: result,
        reconcile
      })).catch(() => ({
        paymentResult,
        recharge: result
      }));
    });
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
  cancelReservation,
  createReservation,
  createReservationPayment,
  getCatalog,
  getMemberCenter,
  getMyOrder,
  isCloudReady,
  joinEvent,
  claimCoupon,
  listEvents,
  listMyOrders,
  listMyRecords,
  listReservedSlots,
  payOrder,
  payReservation,
  queryLogistics,
  rechargeMember,
  resolvePhoneNumber,
  saveContactPhone,
  saveSubscription,
  simulateMemberRecharge,
  updateMyOrder
};
