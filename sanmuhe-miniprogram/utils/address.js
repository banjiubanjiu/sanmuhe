/**
 * 用户收货地址簿。
 *
 * - 云端：addressBook 云函数按 OPENID 隔离 user_addresses 集合
 * - 本地：仅缓存地址列表与当前选择，供结算页首屏同步展示
 * - 迁移：旧版单地址首次同步时自动写入云端一次
 */

const SHIPPING_ADDRESS_KEY = "sanmuhe_shipping_address";
const ADDRESS_BOOK_CACHE_KEY = "sanmuhe_address_book_v2";
const SELECTED_ADDRESS_ID_KEY = "sanmuhe_selected_address_id_v2";
const ADDRESS_MIGRATED_KEY = "sanmuhe_address_migrated_v2";

const PRIVACY_PURPOSE = "我们需要读取你的微信收货地址，用于茶叶快递配送、物流与售后联系。";

function clean(value, max) {
  const text = String(value || "").trim();
  return max ? text.slice(0, max) : text;
}

function emptyAddress() {
  return {
    id: "",
    consignee: "",
    phone: "",
    province: "",
    city: "",
    district: "",
    street: "",
    detailAddress: "",
    postalCode: "",
    nationalCode: "",
    address: "",
    source: "manual",
    isDefault: false,
    hasAddress: false,
    createdAt: 0,
    updatedAt: 0
  };
}

function buildFullAddress(parts = {}) {
  const region = [parts.province, parts.city, parts.district, parts.street]
    .map((item) => clean(item))
    .filter(Boolean)
    .join("");
  const detail = clean(parts.detailAddress || parts.detailInfo);
  if (detail && region && detail.indexOf(clean(parts.province)) === 0) {
    return detail;
  }
  return `${region}${detail}`.trim();
}

function normalizeAddress(raw = {}) {
  const consignee = clean(raw.consignee || raw.userName, 40);
  const phone = clean(raw.phone || raw.telNumber, 20);
  const province = clean(raw.province || raw.provinceName, 40);
  const city = clean(raw.city || raw.cityName, 40);
  const district = clean(raw.district || raw.countyName, 40);
  const street = clean(raw.street || raw.streetName, 60);
  const detailAddress = clean(raw.detailAddress || raw.detailInfoNew || raw.detailInfo, 120);
  const postalCode = clean(raw.postalCode, 12);
  const nationalCode = clean(raw.nationalCode, 20);
  const address = clean(raw.address, 180) || buildFullAddress({
    province,
    city,
    district,
    street,
    detailAddress
  });
  return {
    id: clean(raw.id || raw._id, 80),
    consignee,
    phone,
    province,
    city,
    district,
    street,
    detailAddress,
    postalCode,
    nationalCode,
    address,
    source: raw.source === "wechat" ? "wechat" : "manual",
    isDefault: raw.isDefault === true,
    hasAddress: Boolean(consignee && phone && address),
    createdAt: Number(raw.createdAt) || 0,
    updatedAt: Number(raw.updatedAt) || 0
  };
}

function fromChooseAddressResult(res = {}) {
  return normalizeAddress({
    userName: res.userName,
    telNumber: res.telNumber,
    provinceName: res.provinceName,
    cityName: res.cityName,
    countyName: res.countyName,
    streetName: res.streetName,
    detailInfo: res.detailInfo,
    detailInfoNew: res.detailInfoNew,
    postalCode: res.postalCode,
    nationalCode: res.nationalCode,
    source: "wechat"
  });
}

function readStorage(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value === undefined || value === null || value === "" ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (error) {
    // 本地缓存不可用时不阻断云端地址簿
  }
}

function removeStorage(key) {
  try {
    wx.removeStorageSync(key);
  } catch (error) {
    // ignore
  }
}

function loadCachedAddresses() {
  const cached = readStorage(ADDRESS_BOOK_CACHE_KEY, []);
  if (!Array.isArray(cached)) {
    return [];
  }
  return cached.map(normalizeAddress).filter((item) => item.hasAddress && item.id);
}

function getSelectedAddressId() {
  return clean(readStorage(SELECTED_ADDRESS_ID_KEY, ""), 80);
}

function chooseCurrentAddress(addresses, preferredId) {
  const list = Array.isArray(addresses) ? addresses : [];
  return list.find((item) => item.id === preferredId)
    || list.find((item) => item.isDefault)
    || list[0]
    || emptyAddress();
}

function cacheAddresses(rawAddresses, preferredId) {
  const addresses = (Array.isArray(rawAddresses) ? rawAddresses : [])
    .map(normalizeAddress)
    .filter((item) => item.hasAddress && item.id);
  const current = chooseCurrentAddress(addresses, clean(preferredId, 80) || getSelectedAddressId());

  writeStorage(ADDRESS_BOOK_CACHE_KEY, addresses);
  if (current.id) {
    writeStorage(SELECTED_ADDRESS_ID_KEY, current.id);
    writeStorage(SHIPPING_ADDRESS_KEY, current);
  } else {
    removeStorage(SELECTED_ADDRESS_ID_KEY);
    removeStorage(SHIPPING_ADDRESS_KEY);
  }
  return addresses;
}

function loadLegacyAddress() {
  const saved = readStorage(SHIPPING_ADDRESS_KEY, null);
  if (!saved || typeof saved !== "object") {
    return emptyAddress();
  }
  return normalizeAddress(saved);
}

function loadSavedAddress() {
  const addresses = loadCachedAddresses();
  if (addresses.length) {
    return chooseCurrentAddress(addresses, getSelectedAddressId());
  }
  return loadLegacyAddress();
}

function selectAddress(addressOrId) {
  const addresses = loadCachedAddresses();
  const id = typeof addressOrId === "string"
    ? clean(addressOrId, 80)
    : clean(addressOrId && addressOrId.id, 80);
  const selected = chooseCurrentAddress(addresses, id);
  if (selected.id) {
    writeStorage(SELECTED_ADDRESS_ID_KEY, selected.id);
    writeStorage(SHIPPING_ADDRESS_KEY, selected);
  }
  return selected;
}

function saveAddress(raw) {
  const item = normalizeAddress(Object.assign({}, raw, { updatedAt: Date.now() }));
  const addresses = loadCachedAddresses();
  const id = item.id || `local_${Date.now()}`;
  const next = Object.assign({}, item, { id });
  const index = addresses.findIndex((address) => address.id === id);
  if (index >= 0) {
    addresses[index] = next;
  } else {
    addresses.unshift(next);
  }
  cacheAddresses(addresses, id);
  return next;
}

function clearAddress() {
  removeStorage(ADDRESS_BOOK_CACHE_KEY);
  removeStorage(SELECTED_ADDRESS_ID_KEY);
  removeStorage(SHIPPING_ADDRESS_KEY);
  return emptyAddress();
}

function isCloudReady() {
  const app = getApp({ allowDefault: true });
  return Boolean(wx.cloud && app && app.globalData && app.globalData.cloudReady);
}

function callAddressBook(action, payload = {}) {
  if (!isCloudReady()) {
    const error = new Error("暂时无法连接地址簿，请稍后重试");
    error.cloudUnavailable = true;
    return Promise.reject(error);
  }
  return wx.cloud.callFunction({
    name: "addressBook",
    data: Object.assign({ action }, payload)
  }).then((res) => {
    const result = (res && res.result) || {};
    if (!result || result.ok === false) {
      const error = new Error(result.message || "地址操作失败，请稍后重试");
      error.code = result.code || "ADDRESS_BOOK_ERROR";
      throw error;
    }
    return result;
  });
}

function syncAddressBook(options = {}) {
  const legacy = loadLegacyAddress();
  const migrated = readStorage(ADDRESS_MIGRATED_KEY, false) === true;
  return callAddressBook("list").then((result) => {
    const addresses = Array.isArray(result.addresses) ? result.addresses : [];
    if (!addresses.length && legacy.hasAddress && !legacy.id && !migrated && options.migrateLocal !== false) {
      return callAddressBook("save", {
        address: Object.assign({}, legacy, { isDefault: true, source: legacy.source || "manual" })
      }).then((savedResult) => {
        writeStorage(ADDRESS_MIGRATED_KEY, true);
        return cacheAddresses(savedResult.addresses, savedResult.address && savedResult.address.id);
      });
    }
    writeStorage(ADDRESS_MIGRATED_KEY, true);
    return cacheAddresses(addresses);
  });
}

function saveCloudAddress(raw, options = {}) {
  return callAddressBook("save", { address: normalizeAddress(raw) }).then((result) => {
    const selectedId = options.select === true && result.address ? result.address.id : "";
    cacheAddresses(result.addresses, selectedId);
    return {
      address: normalizeAddress(result.address),
      addresses: loadCachedAddresses()
    };
  });
}

function removeCloudAddress(id) {
  return callAddressBook("remove", { id: clean(id, 80) }).then((result) => {
    return cacheAddresses(result.addresses);
  });
}

function setDefaultCloudAddress(id) {
  const safeId = clean(id, 80);
  return callAddressBook("setDefault", { id: safeId }).then((result) => {
    cacheAddresses(result.addresses, safeId);
    return loadCachedAddresses();
  });
}

function classifyChooseAddressError(err) {
  const msg = String((err && err.errMsg) || err || "");
  const error = new Error(msg || "未能获取收货地址");
  error.rawMessage = msg;

  if (/:\s*fail\s+cancel|fail cancel|cancel$/i.test(msg) || /用户取消|取消选择/i.test(msg)) {
    error.cancelled = true;
    error.message = "cancelled";
    return error;
  }
  if (/auth deny|authorize no|scope\.address|没有权限|未授权/i.test(msg)) {
    error.authDenied = true;
    error.message = "需要授权收货地址";
    return error;
  }
  if (/privacy|隐私/i.test(msg)) {
    error.privacyBlocked = true;
    error.message = "需同意隐私协议后选择地址";
    return error;
  }
  if (/requiredPrivateInfos|not declared|未声明|declare|no permission|not authorized|接口未|未开通|api scope|disabled|banned/i.test(msg)) {
    error.apiDisabled = true;
    error.message = "暂时无法读取微信地址";
    return error;
  }
  return error;
}

function chooseWechatAddress() {
  return new Promise((resolve, reject) => {
    if (typeof wx.chooseAddress !== "function") {
      const error = new Error("当前微信版本暂不支持读取地址");
      error.apiDisabled = true;
      reject(error);
      return;
    }
    wx.chooseAddress({
      success: (res) => {
        const address = fromChooseAddressResult(res);
        if (!address.hasAddress) {
          reject(new Error("地址信息不完整"));
          return;
        }
        resolve(address);
      },
      fail: (err) => reject(classifyChooseAddressError(err))
    });
  });
}

function handleChooseAddressError(error, options = {}) {
  if (!error || error.cancelled) {
    return;
  }
  const offerManual = typeof options.onManual === "function";

  if (error.authDenied) {
    wx.showModal({
      title: "需要地址权限",
      content: "请允许使用微信收货地址，或改为手动填写。",
      confirmText: offerManual ? "手动填写" : "去设置",
      cancelText: offerManual ? "去设置" : "取消",
      success: (res) => {
        if (res.confirm && offerManual) {
          options.onManual();
          return;
        }
        if ((res.confirm || res.cancel) && typeof wx.openSetting === "function") {
          wx.openSetting({});
        }
      }
    });
    return;
  }

  if (error.privacyBlocked) {
    wx.showToast({ title: "请先同意隐私协议", icon: "none" });
    return;
  }

  if (error.apiDisabled) {
    wx.showModal({
      title: "暂时无法读取微信地址",
      content: "你可以先手动填写收货信息。",
      showCancel: offerManual,
      confirmText: offerManual ? "手动填写" : "知道了",
      cancelText: "取消",
      success: (res) => {
        if (res.confirm && offerManual) {
          options.onManual();
        }
      }
    });
    return;
  }

  wx.showModal({
    title: "未能读取微信地址",
    content: "请稍后重试，或改为手动填写。",
    showCancel: offerManual,
    confirmText: offerManual ? "手动填写" : "知道了",
    cancelText: "取消",
    success: (res) => {
      if (res.confirm && offerManual) {
        options.onManual();
      }
    }
  });
}

function phoneMasked(phone) {
  const text = clean(phone);
  if (/^1\d{10}$/.test(text)) {
    return `${text.slice(0, 3)}****${text.slice(7)}`;
  }
  return text;
}

module.exports = {
  SHIPPING_ADDRESS_KEY,
  ADDRESS_BOOK_CACHE_KEY,
  PRIVACY_PURPOSE,
  buildFullAddress,
  cacheAddresses,
  chooseWechatAddress,
  clearAddress,
  emptyAddress,
  fromChooseAddressResult,
  getSelectedAddressId,
  handleChooseAddressError,
  loadCachedAddresses,
  loadSavedAddress,
  normalizeAddress,
  phoneMasked,
  removeCloudAddress,
  saveAddress,
  saveCloudAddress,
  selectAddress,
  setDefaultCloudAddress,
  syncAddressBook
};
