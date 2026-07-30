/**
 * 收货地址：优先走微信官方 wx.chooseAddress，不自造多地址 CRUD。
 *
 * 官方能力：
 * - wx.chooseAddress 调起微信原生「收货地址」界面，用户可在微信侧新增/编辑/选择
 * - 小程序侧无公开「地址列表 / 增删改」API；商户只需承接选中结果并用于下单
 *
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/api/open-api/address/wx.chooseAddress.html
 */

const SHIPPING_ADDRESS_KEY = "sanmuhe_shipping_address";

const PRIVACY_PURPOSE = "我们需要读取你的微信收货地址，用于茶叶快递配送、物流与售后联系。";

function clean(value, max) {
  const text = String(value || "").trim();
  return max ? text.slice(0, max) : text;
}

function emptyAddress() {
  return {
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
    hasAddress: false,
    updatedAt: 0
  };
}

/** 拼完整展示/下单用地址字符串 */
function buildFullAddress(parts = {}) {
  const region = [parts.province, parts.city, parts.district, parts.street]
    .map((item) => clean(item))
    .filter(Boolean)
    .join("");
  const detail = clean(parts.detailAddress || parts.detailInfo);
  // detailInfo 通常已含街道；避免与 street 硬拼重复时仍优先完整 detail
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
  const postalCode = clean(raw.postalCode || raw.postalCode, 12);
  const nationalCode = clean(raw.nationalCode, 20);
  const address = clean(raw.address, 180) || buildFullAddress({
    province,
    city,
    district,
    street,
    detailAddress
  });
  const hasAddress = Boolean(consignee && phone && address);
  return {
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
    hasAddress,
    updatedAt: Number(raw.updatedAt) || 0
  };
}

/** 从 wx.chooseAddress success 回调映射 */
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
    nationalCode: res.nationalCode
  });
}

function loadSavedAddress() {
  try {
    const saved = wx.getStorageSync(SHIPPING_ADDRESS_KEY);
    if (!saved || typeof saved !== "object") {
      return emptyAddress();
    }
    // 兼容旧版仅存 consignee/phone/address 扁平结构
    return normalizeAddress(saved);
  } catch (error) {
    return emptyAddress();
  }
}

function saveAddress(raw) {
  const next = normalizeAddress(Object.assign({}, raw, { updatedAt: Date.now() }));
  try {
    wx.setStorageSync(SHIPPING_ADDRESS_KEY, next);
  } catch (error) {
    // storage 满或禁用时仍返回规范化结果，便于当次下单
  }
  return next;
}

function clearAddress() {
  try {
    wx.removeStorageSync(SHIPPING_ADDRESS_KEY);
  } catch (error) {
    // ignore
  }
  return emptyAddress();
}

/**
 * 调起微信原生收货地址（官方唯一地址选择入口）
 * @returns {Promise<object>} 规范化地址；用户取消则 reject { cancelled: true }
 */
function chooseWechatAddress() {
  return new Promise((resolve, reject) => {
    wx.chooseAddress({
      success: (res) => {
        const address = fromChooseAddressResult(res);
        if (!address.hasAddress) {
          reject(new Error("地址信息不完整"));
          return;
        }
        resolve(saveAddress(address));
      },
      fail: (err) => {
        const msg = String((err && err.errMsg) || "");
        if (/cancel|fail cancel/i.test(msg)) {
          const error = new Error("cancelled");
          error.cancelled = true;
          reject(error);
          return;
        }
        // 未授权 / 未开通接口权限等
        reject(new Error(msg || "未能获取收货地址"));
      }
    });
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
  PRIVACY_PURPOSE,
  emptyAddress,
  normalizeAddress,
  fromChooseAddressResult,
  loadSavedAddress,
  saveAddress,
  clearAddress,
  chooseWechatAddress,
  buildFullAddress,
  phoneMasked
};
