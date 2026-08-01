/**
 * 收货地址：优先 wx.chooseAddress，失败可手动填写。
 *
 * 官方能力：
 * - wx.chooseAddress 调起微信原生「收货地址」界面
 * - 须在 app.json requiredPrivateInfos 声明 chooseAddress
 * - 须在公众平台「开发 → 开发管理 → 接口设置」开通收货地址权限
 * - 须在隐私指引中声明「收货地址」
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
  if (/requiredPrivateInfos|not declared|未声明|declare/i.test(msg)) {
    error.notDeclared = true;
    error.message = "收货地址能力未声明";
    return error;
  }
  if (/no permission|not authorized|接口未|未开通|api scope|disabled|banned/i.test(msg)) {
    error.apiDisabled = true;
    error.message = "收货地址接口未开通";
    return error;
  }
  return error;
}

/**
 * 调起微信原生收货地址。
 * 必须在用户点击（或隐私同意按钮）的同步调用栈内发起，不可 setTimeout。
 */
function chooseWechatAddress() {
  return new Promise((resolve, reject) => {
    if (typeof wx.chooseAddress !== "function") {
      const error = new Error("当前基础库不支持选择收货地址");
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
        resolve(saveAddress(address));
      },
      fail: (err) => {
        reject(classifyChooseAddressError(err));
      }
    });
  });
}

/**
 * @param {Error} error
 * @param {{ onManual?: Function }} [options]
 */
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
        if (res.confirm) {
          if (offerManual) {
            options.onManual();
          } else if (typeof wx.openSetting === "function") {
            wx.openSetting({});
          }
          return;
        }
        if (res.cancel && offerManual && typeof wx.openSetting === "function") {
          wx.openSetting({});
        }
      }
    });
    return;
  }

  if (error.privacyBlocked) {
    // 隐私弹层应已处理；此处仅兜底
    wx.showToast({ title: "请先同意隐私协议", icon: "none" });
    return;
  }

  if (error.apiDisabled || error.notDeclared) {
    wx.showModal({
      title: "暂时无法调起微信地址",
      content: "可先手动填写收货信息。若需微信地址：公众平台 → 开发管理 → 接口设置中开通「收货地址」，并在隐私指引中声明。",
      showCancel: offerManual,
      confirmText: offerManual ? "手动填写" : "知道了",
      cancelText: "知道了",
      success: (res) => {
        if (res.confirm && offerManual) {
          options.onManual();
        }
      }
    });
    return;
  }

  const raw = String(error.rawMessage || error.message || "").replace(/^chooseAddress:fail\s*/i, "");
  if (offerManual) {
    wx.showModal({
      title: "未能选择微信地址",
      content: (raw || "请改用手动填写收货信息。").slice(0, 120),
      confirmText: "手动填写",
      cancelText: "取消",
      success: (res) => {
        if (res.confirm) {
          options.onManual();
        }
      }
    });
    return;
  }

  wx.showToast({
    title: (raw || "未选择地址").slice(0, 40),
    icon: "none"
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
  handleChooseAddressError,
  buildFullAddress,
  phoneMasked
};
