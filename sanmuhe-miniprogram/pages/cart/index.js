const { getCart, getTotal, setCart, updateQuantity } = require("../../utils/cart");
const { createOrder, getMemberCenter, payOrder, resolvePhoneNumber, saveContactPhone } = require("../../utils/cloudApi");
const { requestOrderSubscriptions } = require("../../utils/subscribe");
const tableUtil = require("../../utils/table");
const addressUtil = require("../../utils/address");
const { getStore } = require("../../data/store");
const { withPrivacy } = require("../../utils/privacy");

const SHOP_CATEGORY_KEY = "sanmuhe_shop_category";
const PICKUP_CONTACT_KEY = "sanmuhe_pickup_contact";

/**
 * 快递运费策略（与 createOrder 对齐）
 * shippingPayMode:
 *   collect  = 快递到付（在线只收货款，运费收件时付快递）—— 当前采用
 *   prepaid  = 下单预收运费（固定运费 + 满额包邮）
 */
const SHIPPING_PAY_MODE = "collect";
const SHIPPING_FEE = 0;
const FREE_SHIPPING_AMOUNT = 0;

function estimateShippingFee(deliveryMethod) {
  if (deliveryMethod !== "shipping") {
    return 0;
  }
  if (SHIPPING_PAY_MODE === "collect") {
    return 0;
  }
  return Math.max(0, SHIPPING_FEE);
}

function shippingHintText(deliveryMethod) {
  if (deliveryMethod !== "shipping") {
    return "到店自提免运费";
  }
  if (SHIPPING_PAY_MODE === "collect") {
    return "运费签收时付给快递员";
  }
  return `运费 ¥${SHIPPING_FEE}`;
}
const STORE = getStore();

function maskPhone(phone) {
  const value = String(phone || "").trim();
  if (value.length < 7) {
    return value;
  }
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function loadPickupContact() {
  try {
    const saved = wx.getStorageSync(PICKUP_CONTACT_KEY);
    if (saved && typeof saved === "object") {
      return {
        consignee: String(saved.consignee || "").trim(),
        phone: String(saved.phone || "").trim()
      };
    }
  } catch (error) {
    // ignore
  }
  return { consignee: "", phone: "" };
}

function savePickupContact(consignee, phone) {
  try {
    wx.setStorageSync(PICKUP_CONTACT_KEY, {
      consignee: String(consignee || "").trim(),
      phone: String(phone || "").trim()
    });
  } catch (error) {
    // ignore
  }
}

function formatFen(fen) {
  return (Math.max(0, Math.round(Number(fen) || 0)) / 100).toFixed(2);
}

function getOptionText(item) {
  const source = item || {};
  const options = source.options || {};
  if (source.type === "drink") {
    return [options.teaChoice || "茶品待选", options.unit || "道", options.table ? `桌号 ${options.table}` : ""]
      .filter(Boolean)
      .join(" · ");
  }
  return [options.unit || source.unit || "默认", source.category || "茶品"].filter(Boolean).join(" · ");
}

function enrichCart(cart) {
  return (Array.isArray(cart) ? cart : []).filter(Boolean).map((item) => Object.assign({}, item, {
    optionText: getOptionText(item),
    lineTotal: Number(item.price || 0) * Number(item.quantity || 1)
  }));
}

/** 与堂饮页一致：开发默认桌 1，正式扫码后会写入 storage */
const DEV_DEFAULT_TABLE = "1";

function resolveTableNo(cart) {
  const stored = tableUtil.getTableNo();
  if (stored) {
    return stored;
  }
  for (let i = 0; i < (cart || []).length; i += 1) {
    const table = tableUtil.normalizeTable(cart[i].options && cart[i].options.table);
    if (table) {
      tableUtil.setTableNo(table);
      return table;
    }
  }
  // 堂饮未绑定时用开发默认，避免再让用户手填
  tableUtil.setTableNo(DEV_DEFAULT_TABLE);
  return DEV_DEFAULT_TABLE;
}

function formatTableDisplay(table) {
  const value = tableUtil.normalizeTable(table);
  if (!value) {
    return "";
  }
  if (/^桌/.test(value)) {
    return value;
  }
  return `桌 ${value}`;
}

function resolveDefaultPayMode(balanceAvailable, currentMode) {
  // 小程序仅支持余额 / 微信；余额不足时从 balance 回退到 wechat
  if (currentMode === "wechat") {
    return "wechat";
  }
  if (currentMode === "balance" && balanceAvailable) {
    return "balance";
  }
  if (balanceAvailable) {
    return "balance";
  }
  return "wechat";
}

function payHintText() {
  // 底栏按钮已说明动作，页内不再堆解释文案
  return "";
}

function loadSavedAddress() {
  return addressUtil.loadSavedAddress();
}

function addressViewModel(saved) {
  const item = saved && saved.hasAddress ? saved : addressUtil.emptyAddress();
  const province = item.province || "";
  const city = item.city || "";
  const district = item.district || "";
  const regionValue = [province, city, district].filter(Boolean);
  const phone = item.phone || "";
  return {
    consignee: item.consignee || "",
    phone,
    phoneMasked: addressUtil.phoneMasked(phone) || phone,
    address: item.address || "",
    province,
    city,
    district,
    detailAddress: item.detailAddress || "",
    hasAddress: Boolean(item.hasAddress),
    regionValue: regionValue.length === 3 ? regionValue : [],
    regionText: regionValue.length ? regionValue.join(" ") : ""
  };
}

Page(withPrivacy({
  data: {
    statusBarHeight: 20,
    cart: [],
    items: [],
    total: 0,
    count: 0,
    tableNo: "",
    tableDisplay: "",
    remark: "",
    isMember: false,
    walletBalance: "0.00",
    walletBalanceFen: 0,
    balanceAfter: "0.00",
    balanceAvailable: false,
    payMode: "wechat",
    payHintText: "",
    mode: "retail",
    isDineIn: false,
    pageTitle: "确认茶品",
    emptyTitle: "还没有选择茶品",
    emptyCopy: "从茶叶商城选择喜欢的茶品，再来确认本次订单。",
    submitting: false,
    deliveryMethod: "pickup",
    goodsTotal: 0,
    shippingFee: 0,
    payableTotal: 0,
    shippingPayMode: SHIPPING_PAY_MODE,
    freightCollect: SHIPPING_PAY_MODE === "collect",
    freeShippingAmount: FREE_SHIPPING_AMOUNT,
    shippingFeeBase: SHIPPING_FEE,
    shippingHint: "",
    storeAddress: STORE.address || "",
    storeName: STORE.name || "禾煦茶书房",
    consignee: "",
    phone: "",
    phoneMasked: "",
    hasBoundPhone: false,
    phoneFromWechat: false,
    showManualPhone: false,
    phoneResolving: false,
    contactReady: false,
    address: "",
    hasAddress: false,
    regionValue: [],
    regionText: "",
    detailAddress: "",
    province: "",
    city: "",
    district: "",
    // 地址选择弹层
    addressSheetOpen: false,
    sheetHasAddress: false,
    sheetConsignee: "",
    sheetPhone: "",
    sheetPhoneMasked: "",
    sheetAddress: "",
    sheetIsDefault: true,
    // 新建/编辑表单
    addressFormOpen: false,
    formConsignee: "",
    formPhone: "",
    formDetailAddress: "",
    formProvince: "",
    formCity: "",
    formDistrict: "",
    formRegionValue: [],
    formRegionText: "",
    formIsDefault: true
  },

  onLoad(options = {}) {
    const systemInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const mode = options.mode === "dinein" ? "dinein" : "retail";
    const isDineIn = mode === "dinein";
    const saved = isDineIn ? addressViewModel(null) : addressViewModel(loadSavedAddress());
    // 本地缓存先铺底，避免先闪「未绑定」再跳成「已绑定」
    const pickup = loadPickupContact();
    const localPhone = !isDineIn && pickup.phone && /^1\d{10}$/.test(pickup.phone)
      ? pickup.phone
      : "";
    this.setData(Object.assign({
      statusBarHeight: (systemInfo && systemInfo.statusBarHeight) || 20,
      mode,
      isDineIn,
      pageTitle: isDineIn ? "确认茶单" : "确认茶品",
      emptyTitle: isDineIn ? "还没有选择堂饮茶品" : "还没有选择茶品",
      emptyCopy: isDineIn
        ? "返回堂饮茶单，选择品饮档位和本次茶品。"
        : "从茶叶商城选择喜欢的茶品，再来确认本次订单。",
      deliveryMethod: isDineIn ? "onsite" : "pickup",
      storeAddress: STORE.address || "",
      storeName: STORE.name || "禾煦茶书房",
      consignee: pickup.consignee || "",
      phone: localPhone,
      phoneMasked: maskPhone(localPhone),
      hasBoundPhone: Boolean(localPhone),
      phoneFromWechat: false,
      showManualPhone: false,
      // 有本地缓存可先展示；无缓存等云端再出绑定区
      contactReady: Boolean(localPhone) || isDineIn
    }, isDineIn ? {} : saved));
  },

  onShow() {
    // 仅快递模式同步已存地址；表单编辑中不覆盖
    if (!this.data.isDineIn && this.data.deliveryMethod === "shipping" && !this.data.addressFormOpen) {
      this.setData(addressViewModel(loadSavedAddress()));
    }
    this.refresh();
    this.loadMemberPayment();
  },

  refresh() {
    let cart = [];
    try {
      cart = getCart(this.data.mode);
    } catch (error) {
      cart = [];
    }
    const items = enrichCart(cart);
    // 堂饮：桌号只读，来自扫码/缓存/开发默认，不提供手填
    const tableNo = this.data.isDineIn
      ? (resolveTableNo(cart) || DEV_DEFAULT_TABLE)
      : "";
    const goodsTotal = getTotal(cart);
    const deliveryMethod = this.data.isDineIn ? "onsite" : this.data.deliveryMethod;
    const shippingFee = this.data.isDineIn ? 0 : estimateShippingFee(deliveryMethod);
    const payableTotal = Math.max(0, Number(goodsTotal) + Number(shippingFee));
    const shippingHint = this.data.isDineIn ? "" : shippingHintText(deliveryMethod);
    const balanceAvailable = this.data.isMember && this.data.walletBalanceFen >= Math.round(payableTotal * 100);
    const balanceAfter = formatFen(this.data.walletBalanceFen - Math.round(payableTotal * 100));
    const payMode = resolveDefaultPayMode(balanceAvailable, this.data.payMode);
    this.setData({
      cart,
      items,
      total: goodsTotal,
      goodsTotal,
      shippingFee,
      payableTotal,
      shippingHint,
      shippingPayMode: SHIPPING_PAY_MODE,
      freeShippingAmount: FREE_SHIPPING_AMOUNT,
      shippingFeeBase: SHIPPING_FEE,
      freightCollect: SHIPPING_PAY_MODE === "collect",
      count: cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
      tableNo,
      tableDisplay: tableNo ? formatTableDisplay(tableNo) : "",
      balanceAvailable,
      balanceAfter,
      payMode,
      payHintText: payHintText(payMode, balanceAfter, this.data.isDineIn, deliveryMethod)
    });
  },

  loadMemberPayment() {
    getMemberCenter().then((result) => {
      const isMember = !!(result.member && result.member.isMember);
      const walletBalanceFen = Math.max(0, Number(result.wallet && result.wallet.balanceFen) || 0);
      const payable = Math.max(0, Number(this.data.payableTotal != null ? this.data.payableTotal : this.data.total) || 0);
      const balanceAvailable = isMember && walletBalanceFen >= Math.round(payable * 100);
      const balanceAfter = formatFen(walletBalanceFen - Math.round(payable * 100));
      const payMode = resolveDefaultPayMode(balanceAvailable, this.data.payMode);
      // 已绑定手机号：自提无需再填（云端 openid 绑定）
      const contact = result.contact || {};
      // 云端绑定优先；本地已有号也算已绑定，避免云端慢/失败时来回跳
      const hasBoundPhone = contact.hasPhone === true
        || Boolean(contact.phoneMasked)
        || this.data.hasBoundPhone
        || Boolean(this.data.phone && /^1\d{10}$/.test(this.data.phone));
      const memberName = result.member && result.member.name ? String(result.member.name).trim() : "";
      const patch = {
        isMember,
        walletBalance: result.wallet && result.wallet.balance || "0.00",
        walletBalanceFen,
        balanceAfter,
        balanceAvailable,
        payMode,
        payHintText: payHintText(payMode, balanceAfter, this.data.isDineIn, this.data.deliveryMethod),
        hasBoundPhone,
        phoneMasked: contact.phoneMasked || this.data.phoneMasked || "",
        contactReady: true
      };
      if (hasBoundPhone) {
        patch.showManualPhone = false;
        // 云端已绑定时，不必再展示本地明文；提交走 openid 回填
        if (!this.data.phone) {
          patch.phone = "";
        }
      }
      if (!this.data.consignee && memberName && memberName !== "微信顾客" && isMember) {
        patch.consignee = memberName;
      }
      this.setData(patch);
    }).catch(() => {
      const payMode = this.data.payMode === "balance" ? "wechat" : (this.data.payMode || "wechat");
      const pickup = loadPickupContact();
      const localPhone = pickup.phone && /^1\d{10}$/.test(pickup.phone) ? pickup.phone : "";
      this.setData({
        isMember: false,
        walletBalance: "0.00",
        walletBalanceFen: 0,
        balanceAfter: "0.00",
        balanceAvailable: false,
        payMode,
        payHintText: payHintText(payMode, "0.00", this.data.isDineIn, this.data.deliveryMethod),
        hasBoundPhone: Boolean(localPhone),
        phone: localPhone,
        phoneMasked: maskPhone(localPhone),
        contactReady: true
      });
    });
  },

  chooseDelivery(event) {
    if (this.data.isDineIn) {
      return;
    }
    const method = event.currentTarget.dataset.method === "shipping" ? "shipping" : "pickup";
    const patch = {
      deliveryMethod: method,
      showManualPhone: false
    };
    if (method === "shipping") {
      Object.assign(patch, addressViewModel(loadSavedAddress()), {
        addressSheetOpen: false,
        addressFormOpen: false
      });
    } else {
      patch.addressSheetOpen = false;
      patch.addressFormOpen = false;
    }
    this.setData(patch, () => {
      this.refresh();
    });
  },

  noop() {},

  /** 订单区入口：请选择地址 / 已选地址卡片 */
  openAddressSheet() {
    const saved = loadSavedAddress();
    this.setData({
      addressSheetOpen: true,
      sheetHasAddress: !!saved.hasAddress,
      sheetConsignee: saved.consignee || "",
      sheetPhone: saved.phone || "",
      sheetPhoneMasked: addressUtil.phoneMasked(saved.phone) || saved.phone || "",
      sheetAddress: saved.address || "",
      sheetIsDefault: true
    });
  },

  closeAddressSheet() {
    this.setData({ addressSheetOpen: false });
  },

  /** 弹层内点已有地址 → 用于本单 */
  selectSheetAddress() {
    const saved = loadSavedAddress();
    if (!saved.hasAddress) {
      return;
    }
    this.setData(Object.assign({
      addressSheetOpen: false
    }, addressViewModel(saved)));
  },

  /** 新建地址：空白表单（与参考「地址管理」一致） */
  openAddressForm() {
    this.setData({
      addressSheetOpen: false,
      addressFormOpen: true,
      formConsignee: "",
      formPhone: "",
      formDetailAddress: "",
      formProvince: "",
      formCity: "",
      formDistrict: "",
      formRegionValue: [],
      formRegionText: "",
      formIsDefault: true
    });
  },

  closeAddressForm() {
    this.setData({ addressFormOpen: false });
    // 返回选择弹层，保持流程连贯
    this.openAddressSheet();
  },

  onFormInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!field) {
      return;
    }
    this.setData({ [field]: event.detail.value });
  },

  onFormRegionChange(event) {
    const value = (event.detail && event.detail.value) || [];
    this.setData({
      formRegionValue: value,
      formRegionText: value.filter(Boolean).join(" "),
      formProvince: value[0] || "",
      formCity: value[1] || "",
      formDistrict: value[2] || ""
    });
  },

  onFormDefaultChange(event) {
    this.setData({
      formIsDefault: !!(event.detail && event.detail.value)
    });
  },

  saveAddressForm() {
    const consignee = String(this.data.formConsignee || "").trim();
    const phone = String(this.data.formPhone || "").trim();
    const province = String(this.data.formProvince || "").trim();
    const city = String(this.data.formCity || "").trim();
    const district = String(this.data.formDistrict || "").trim();
    const detailAddress = String(this.data.formDetailAddress || "").trim();
    if (!consignee) {
      wx.showToast({ title: "请输入收货人姓名", icon: "none" });
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: "请输入正确手机号", icon: "none" });
      return;
    }
    if (!province || !city || !district) {
      wx.showToast({ title: "请选择所在地区", icon: "none" });
      return;
    }
    if (!detailAddress || detailAddress.length < 4) {
      wx.showToast({ title: "请输入详细地址", icon: "none" });
      return;
    }
    const saved = addressUtil.saveAddress({
      consignee,
      phone,
      province,
      city,
      district,
      detailAddress
    });
    this.setData(Object.assign({
      addressFormOpen: false,
      addressSheetOpen: false
    }, addressViewModel(saved)));
    wx.showToast({ title: "地址已保存", icon: "success" });
  },

  /**
   * 从微信获取收货地址（须在用户点击手势内同步调用）。
   */
  chooseAddressFromWechat() {
    this._pendingChooseAddress = true;
    this.data.privacyPurpose = addressUtil.PRIVACY_PURPOSE;
    this._runChooseAddress();
  },

  _runChooseAddress() {
    addressUtil.chooseWechatAddress().then((address) => {
      this._pendingChooseAddress = false;
      this.setData(Object.assign({
        addressSheetOpen: false,
        addressFormOpen: false,
        privacyPurpose: addressUtil.PRIVACY_PURPOSE
      }, addressViewModel(address)));
      wx.showToast({ title: "已获取地址", icon: "success" });
    }).catch((error) => {
      if (error && error.privacyBlocked && this._pendingChooseAddress) {
        return;
      }
      if (this.data.privacyGateOpen && this._pendingChooseAddress && !(error && error.cancelled)) {
        return;
      }
      this._pendingChooseAddress = false;
      addressUtil.handleChooseAddressError(error, {
        onManual: () => this.openAddressForm()
      });
    });
  },

  /** 必须在同意按钮同步栈内调用，不可 setTimeout */
  onPrivacyAuthorized() {
    if (!this._pendingChooseAddress) {
      return;
    }
    this._runChooseAddress();
  },

  choosePayMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode === "balance" && !this.data.balanceAvailable) {
      wx.showToast({ title: "会员余额不足", icon: "none" });
      return;
    }
    // 小程序只保留余额 / 微信
    if (mode !== "balance" && mode !== "wechat") {
      return;
    }
    const payMode = mode === "balance" ? "balance" : "wechat";
    this.setData({
      payMode,
      payHintText: payHintText(payMode, this.data.balanceAfter, this.data.isDineIn, this.data.deliveryMethod)
    });
  },

  decrease(event) {
    updateQuantity(event.currentTarget.dataset.key, Number(event.currentTarget.dataset.quantity) - 1, this.data.mode);
    this.refresh();
  },

  increase(event) {
    updateQuantity(event.currentTarget.dataset.key, Number(event.currentTarget.dataset.quantity) + 1, this.data.mode);
    this.refresh();
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    // 桌号不允许手填，只读展示
    if (field === "tableNo") {
      return;
    }
    const value = event.detail.value;
    if (field === "phone") {
      const next = String(value || "").trim();
      this.setData({
        phone: next,
        phoneMasked: maskPhone(next),
        phoneFromWechat: false
      });
      // 自提：手填满 11 位时绑定账号；快递手动填地址不走此绑定
      if (/^1\d{10}$/.test(next) && this.data.deliveryMethod === "pickup") {
        saveContactPhone(next).then((result) => {
          this.setData({
            hasBoundPhone: true,
            showManualPhone: false,
            phoneMasked: (result && result.phoneMasked) || maskPhone(next),
            phone: next
          });
          savePickupContact(this.data.consignee, next);
          wx.showToast({ title: "已保存", icon: "success" });
        }).catch((error) => {
          // 云失败仍可本单使用本地号
          this.setData({
            hasBoundPhone: true,
            showManualPhone: false
          });
          savePickupContact(this.data.consignee, next);
          wx.showToast({ title: (error && error.message) || "已用于本单", icon: "none" });
        });
      }
      return;
    }
    this.setData({ [field]: value });
  },

  /** 微信手机号绑定（一次绑定，后续自提复用） */
  handlePickupPhone(event) {
    if (this.data.phoneResolving) {
      return;
    }
    const detail = (event && event.detail) || {};
    const phoneCode = detail.code;
    if (!phoneCode) {
      this.setData({ showManualPhone: true, phoneFromWechat: false });
      wx.showToast({ title: "请填写取货手机号", icon: "none" });
      return;
    }
    this.setData({ phoneResolving: true });
    resolvePhoneNumber(phoneCode).then((result) => {
      const phone = String(result.phone || "").trim();
      this.setData({
        phone,
        phoneMasked: result.phoneMasked || maskPhone(phone),
        phoneFromWechat: true,
        hasBoundPhone: true,
        showManualPhone: false,
        phoneResolving: false
      });
      savePickupContact(this.data.consignee, phone);
      wx.showToast({ title: "已绑定手机号", icon: "success" });
    }).catch((error) => {
      this.setData({ phoneResolving: false, showManualPhone: true, phoneFromWechat: false });
      wx.showToast({
        title: (error && error.message) || "未获取到，请填写手机号",
        icon: "none"
      });
    });
  },

  goShop() {
    if (this.data.isDineIn) {
      wx.switchTab({ url: "/pages/order/index" });
      return;
    }
    wx.setStorageSync(SHOP_CATEGORY_KEY, "全部");
    wx.switchTab({ url: "/pages/shop/index" });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    if (this.data.isDineIn) {
      wx.switchTab({ url: "/pages/order/index" });
      return;
    }
    wx.switchTab({ url: "/pages/shop/index" });
  },

  submitOrder() {
    const {
      cart,
      total,
      tableNo,
      remark,
      submitting,
      isDineIn,
      mode,
      deliveryMethod,
      consignee,
      phone,
      address,
      hasAddress,
      balanceAvailable
    } = this.data;
    // 强制在线支付：余额不足时不允许提交 balance
    let payMode = this.data.payMode === "balance" ? "balance" : "wechat";
    if (payMode === "balance" && !balanceAvailable) {
      payMode = "wechat";
    }
    if (submitting) {
      return;
    }
    if (!cart.length) {
      wx.showToast({ title: "购物车是空的", icon: "none" });
      return;
    }

    const table = isDineIn ? (tableUtil.normalizeTable(tableNo) || resolveTableNo(cart)) : "";
    if (table) {
      tableUtil.setTableNo(table);
    }
    const note = String(remark || "").trim();
    const name = String(consignee || "").trim();
    const mobile = String(phone || "").trim();
    const fullAddress = String(address || "").trim();

    // 商城闭环校验：自提要联系人手机；邮寄要完整收货地址
    if (!isDineIn) {
      if (deliveryMethod !== "pickup" && deliveryMethod !== "shipping") {
        wx.showToast({ title: "请选择配送方式", icon: "none" });
        return;
      }
      if (deliveryMethod === "shipping") {
        if (this.data.addressFormOpen) {
          wx.showToast({ title: "请先保存收货地址", icon: "none" });
          return;
        }
        if (!hasAddress || !name || !mobile || !fullAddress) {
          this.openAddressSheet();
          wx.showToast({ title: "请选择收货地址", icon: "none" });
          return;
        }
      } else {
        // 自提：已绑定即可；未绑定须先完成微信手机号/手填绑定
        if (!this.data.hasBoundPhone) {
          if (!mobile || !/^1\d{10}$/.test(mobile)) {
            wx.showToast({ title: "请先授权取货手机号", icon: "none" });
            return;
          }
        }
        if (mobile && /^1\d{10}$/.test(mobile)) {
          savePickupContact(name, mobile);
        }
      }
    }

    const pickupName = name || "顾客";
    const savedAddress = !isDineIn && deliveryMethod === "shipping"
      ? addressUtil.loadSavedAddress()
      : addressUtil.emptyAddress();
    // 自提：手机号可空，由云函数按 openid 读取已绑定号
    const orderPhone = isDineIn
      ? "现场"
      : (deliveryMethod === "pickup"
        ? ((mobile && /^1\d{10}$/.test(mobile)) ? mobile : "")
        : mobile);
    const payload = {
      items: cart,
      total,
      deliveryMethod: isDineIn ? "onsite" : deliveryMethod,
      payMode,
      // 小程序不提供柜台付款，始终走在线支付
      skipPayment: false,
      source: isDineIn ? "dinein-tea-menu" : "retail-tea-catalog",
      bizType: isDineIn ? "dinein" : "retail",
      consignee: isDineIn ? "到店顾客" : (deliveryMethod === "pickup" ? pickupName : name),
      phone: orderPhone,
      address: !isDineIn && deliveryMethod === "shipping" ? fullAddress : "",
      province: !isDineIn && deliveryMethod === "shipping" ? (savedAddress.province || "") : "",
      city: !isDineIn && deliveryMethod === "shipping" ? (savedAddress.city || "") : "",
      district: !isDineIn && deliveryMethod === "shipping" ? (savedAddress.district || "") : "",
      detailAddress: !isDineIn && deliveryMethod === "shipping" ? (savedAddress.detailAddress || "") : "",
      postalCode: !isDineIn && deliveryMethod === "shipping" ? (savedAddress.postalCode || "") : "",
      tableNo: table,
      table: table,
      pickupNote: isDineIn
        ? (table ? `桌号 ${table}` : "")
        : (deliveryMethod === "pickup" ? `到店自提 · ${pickupName}` : ""),
      remark: isDineIn ? tableUtil.formatTableRemark(table, note) : note
    };

    this.setData({ submitting: true });
    createOrder(payload).then((result) => {
      if (result && result.ok === false) {
        wx.showToast({ title: result.message || "提交失败", icon: "none" });
        this.setData({ submitting: false });
        return null;
      }

      // 微信支付：技术上需先落「待支付」单号再调起收银台；业务上只有付成功才算订单成功
      if (payMode === "wechat") {
        return payOrder({
          _id: result.id,
          orderId: result.id,
          orderNo: result.orderNo
        }).then(() => ({ result, paid: "wechat" }))
          .catch((error) => {
            const msg = (error && error.errMsg) || (error && error.message) || "";
            const cancelled = /cancel|取消/i.test(msg);
            const alreadyPaid = error && error.code === "ALREADY_PAID_ON_WECHAT";
            if (alreadyPaid) {
              return { result, paid: "wechat" };
            }
            const detail = msg
              .replace(/^requestPayment:fail\s*/i, "")
              .replace(/^cloud\.callFunction:fail\s*/i, "")
              .trim();
            return {
              result,
              paid: "pending",
              cancelled,
              payError: cancelled
                ? "你已取消支付，订单尚未成功。可继续付款，或稍后在「我的订单」处理。"
                : (`${detail || "支付未完成"}。订单尚未成功，请继续完成付款。`)
            };
          });
      }

      // 余额支付：服务端应直接扣款成功
      if (result.payMode === "balance" && result.payStatus === "paid") {
        return { result, paid: "balance" };
      }
      return {
        result,
        paid: "pending",
        payError: result.message || "支付结果未确认，请在「我的订单」查看"
      };
    }).then((outcome) => {
      if (!outcome) {
        return;
      }
      const { result, paid, payError, cancelled } = outcome;
      const delivery = isDineIn
        ? (table ? `桌号 ${table}` : "堂饮")
        : (this.data.deliveryMethod === "shipping" ? "快递邮寄" : "到店自提");
      const orderId = result.id || result._id || "";

      // 支付未完成：不算订单成功；清空购物车避免重复下单，引导继续支付
      if (paid === "pending") {
        setCart([], mode);
        this.setData({
          cart: [],
          items: [],
          total: 0,
          count: 0,
          tableNo: table || "",
          remark: "",
          submitting: false
        });
        wx.showModal({
          title: cancelled ? "支付已取消" : "请先完成支付",
          content: `${payError || "支付未完成，订单尚未成功。"}\n单号 ${result.orderNo || ""}（${delivery}）`,
          confirmText: "继续支付",
          cancelText: "稍后再说",
          success: (modal) => {
            if (modal.confirm && orderId) {
              wx.navigateTo({
                url: `/pages/order-detail/index?id=${encodeURIComponent(orderId)}`
              });
              return;
            }
            wx.switchTab({ url: "/pages/profile/index" });
          }
        });
        return;
      }

      // 仅在线支付成功后提示成交
      setCart([], mode);
      const orderNo = result.orderNo || "";
      const deliveryMethod = isDineIn ? "onsite" : this.data.deliveryMethod;
      const payChannel = paid === "balance" ? "balance" : "wechat";
      const subKeys = isDineIn
        ? ["orderPaidTemplateId"]
        : ["orderPaidTemplateId", "orderShippedTemplateId"];

      // 付完立刻跳转（堂饮→茶单详情；商城→支付成功页），不等订阅授权，避免闪空购物车
      const jumpUrl = isDineIn && orderId
        ? `/pages/order-detail/index?id=${encodeURIComponent(orderId)}&from=paid`
        : `/pages/pay-success/index?orderId=${encodeURIComponent(orderId)}`
          + `&orderNo=${encodeURIComponent(orderNo)}`
          + `&total=${Number(result.total || 0)}`
          + `&delivery=${encodeURIComponent(deliveryMethod)}`
          + `&pay=${encodeURIComponent(payChannel)}`
          + `&mode=retail`;
      const fallbackTab = isDineIn ? "/pages/order/index" : "/pages/shop/index";
      wx.redirectTo({
        url: jumpUrl,
        fail: () => {
          wx.switchTab({ url: fallbackTab });
        }
      });
      requestOrderSubscriptions({ keys: subKeys }).catch(() => {});
    }).catch((error) => {
      wx.showModal({
        title: "订单未提交",
        content: (error && error.message) || "暂时未能提交，所选茶品已为你保留，请稍后重试。",
        showCancel: false
      });
      this.setData({ submitting: false });
    });
  }
}));
