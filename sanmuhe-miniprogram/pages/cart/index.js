const { getCart, getTotal, setCart, updateQuantity } = require("../../utils/cart");
const { createOrder, getMemberCenter, payOrder } = require("../../utils/cloudApi");
const tableUtil = require("../../utils/table");
const { getStore } = require("../../data/store");
const { withPrivacy } = require("../../utils/privacy");

const SHOP_CATEGORY_KEY = "sanmuhe_shop_category";
const SHIPPING_ADDRESS_KEY = "sanmuhe_shipping_address";
const STORE = getStore();

function formatFen(fen) {
  return (Math.max(0, Math.round(Number(fen) || 0)) / 100).toFixed(2);
}

function getOptionText(item) {
  const options = item.options || {};
  if (item.type === "drink") {
    return [options.teaChoice || "茶品待选", options.unit || "道", options.table ? `桌号 ${options.table}` : ""]
      .filter(Boolean)
      .join(" · ");
  }
  return [options.unit || item.unit || "默认", item.category || "茶品"].filter(Boolean).join(" · ");
}

function enrichCart(cart) {
  return cart.map((item) => Object.assign({}, item, {
    optionText: getOptionText(item),
    lineTotal: Number(item.price || 0) * Number(item.quantity || 1)
  }));
}

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
  return "";
}

function resolveDefaultPayMode(balanceAvailable, currentMode) {
  // 用户已选手动/微信则保留；余额不足时从 balance 回退到 wechat
  if (currentMode === "manual" || currentMode === "wechat") {
    return currentMode;
  }
  if (balanceAvailable) {
    return "balance";
  }
  return "wechat";
}

function payHintText(payMode, balanceAfter, isDineIn, deliveryMethod) {
  if (payMode === "balance") {
    return `确认后将从会员余额扣除，预计剩余 ¥${balanceAfter}`;
  }
  if (payMode === "wechat") {
    if (isDineIn) {
      return "确认后调起微信支付，付款成功后通知门店备茶";
    }
    return deliveryMethod === "shipping"
      ? "确认后调起微信支付，付款成功后安排发货"
      : "确认后调起微信支付，付款成功后可到店自提";
  }
  if (isDineIn) {
    return "确认后通知门店备茶，请到柜台扫码付款";
  }
  return deliveryMethod === "shipping"
    ? "确认后通知门店备货，请到柜台完成付款后发货"
    : "确认后通知门店备货，请到柜台付款后自提";
}

function loadSavedAddress() {
  try {
    const saved = wx.getStorageSync(SHIPPING_ADDRESS_KEY) || {};
    if (saved && saved.consignee && saved.phone && saved.address) {
      return {
        consignee: String(saved.consignee || ""),
        phone: String(saved.phone || ""),
        address: String(saved.address || ""),
        hasAddress: true
      };
    }
  } catch (error) {
    // ignore
  }
  return { consignee: "", phone: "", address: "", hasAddress: false };
}

Page(withPrivacy({
  data: {
    cart: [],
    items: [],
    total: 0,
    count: 0,
    tableNo: "",
    remark: "",
    isMember: false,
    walletBalance: "0.00",
    walletBalanceFen: 0,
    balanceAfter: "0.00",
    balanceAvailable: false,
    payMode: "wechat",
    payHintText: "确认后调起微信支付，付款成功后通知门店备货",
    mode: "retail",
    isDineIn: false,
    pageTitle: "确认茶品",
    emptyTitle: "还没有选择茶品",
    emptyCopy: "从茶叶商城选择喜欢的茶品，再来确认本次订单。",
    submitting: false,
    deliveryMethod: "pickup",
    storeAddress: STORE.address || "",
    consignee: "",
    phone: "",
    address: "",
    hasAddress: false
  },

  onLoad(options = {}) {
    const mode = options.mode === "dinein" ? "dinein" : "retail";
    const isDineIn = mode === "dinein";
    const saved = isDineIn ? { consignee: "", phone: "", address: "", hasAddress: false } : loadSavedAddress();
    this.setData({
      mode,
      isDineIn,
      pageTitle: isDineIn ? "确认茶单" : "确认茶品",
      emptyTitle: isDineIn ? "还没有选择堂饮茶品" : "还没有选择茶品",
      emptyCopy: isDineIn
        ? "返回堂饮茶单，选择品饮档位和本次茶品。"
        : "从茶叶商城选择喜欢的茶品，再来确认本次订单。",
      deliveryMethod: isDineIn ? "onsite" : "pickup",
      storeAddress: STORE.address || "",
      consignee: saved.consignee,
      phone: saved.phone,
      address: saved.address,
      hasAddress: saved.hasAddress
    });
  },

  onShow() {
    this.refresh();
    this.loadMemberPayment();
  },

  refresh() {
    const cart = getCart(this.data.mode);
    const items = enrichCart(cart);
    const tableNo = resolveTableNo(cart) || this.data.tableNo || "";
    const total = getTotal(cart);
    const balanceAvailable = this.data.isMember && this.data.walletBalanceFen >= Math.round(total * 100);
    const balanceAfter = formatFen(this.data.walletBalanceFen - Math.round(total * 100));
    const payMode = resolveDefaultPayMode(balanceAvailable, this.data.payMode);
    this.setData({
      cart,
      items,
      total,
      count: cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
      tableNo,
      balanceAvailable,
      balanceAfter,
      payMode,
      payHintText: payHintText(payMode, balanceAfter, this.data.isDineIn, this.data.deliveryMethod)
    });
  },

  loadMemberPayment() {
    getMemberCenter().then((result) => {
      const isMember = !!(result.member && result.member.isMember);
      const walletBalanceFen = Math.max(0, Number(result.wallet && result.wallet.balanceFen) || 0);
      const balanceAvailable = isMember && walletBalanceFen >= Math.round(Number(this.data.total || 0) * 100);
      const balanceAfter = formatFen(walletBalanceFen - Math.round(Number(this.data.total || 0) * 100));
      const payMode = resolveDefaultPayMode(balanceAvailable, this.data.payMode);
      this.setData({
        isMember,
        walletBalance: result.wallet && result.wallet.balance || "0.00",
        walletBalanceFen,
        balanceAfter,
        balanceAvailable,
        payMode,
        payHintText: payHintText(payMode, balanceAfter, this.data.isDineIn, this.data.deliveryMethod)
      });
    }).catch(() => {
      const payMode = this.data.payMode === "balance" ? "wechat" : (this.data.payMode || "wechat");
      this.setData({
        isMember: false,
        walletBalance: "0.00",
        walletBalanceFen: 0,
        balanceAfter: "0.00",
        balanceAvailable: false,
        payMode,
        payHintText: payHintText(payMode, "0.00", this.data.isDineIn, this.data.deliveryMethod)
      });
    });
  },

  chooseDelivery(event) {
    if (this.data.isDineIn) {
      return;
    }
    const method = event.currentTarget.dataset.method === "shipping" ? "shipping" : "pickup";
    this.setData({
      deliveryMethod: method,
      payHintText: payHintText(this.data.payMode, this.data.balanceAfter, false, method)
    });
  },

  chooseAddress() {
    this.requestPrivacy("我们需要读取你的微信收货地址，用于茶叶邮寄配送与售后联系。").then((accepted) => {
      if (!accepted) {
        return;
      }
      wx.chooseAddress({
        success: (res) => {
          const consignee = String(res.userName || "").trim();
          const phone = String(res.telNumber || "").trim();
          const address = `${res.provinceName || ""}${res.cityName || ""}${res.countyName || ""}${res.detailInfo || ""}`.trim();
          const payload = { consignee, phone, address, hasAddress: !!(consignee && phone && address) };
          try {
            wx.setStorageSync(SHIPPING_ADDRESS_KEY, payload);
          } catch (error) {
            // ignore storage failures
          }
          this.setData(payload);
          if (!payload.hasAddress) {
            wx.showToast({ title: "地址信息不完整", icon: "none" });
          }
        },
        fail: () => {
          wx.showToast({ title: "未选择地址", icon: "none" });
        }
      });
    });
  },

  choosePayMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode === "balance" && !this.data.balanceAvailable) {
      wx.showToast({ title: "会员余额不足", icon: "none" });
      return;
    }
    const payMode = mode === "balance" ? "balance" : (mode === "wechat" ? "wechat" : "manual");
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

  removeItem(event) {
    updateQuantity(event.currentTarget.dataset.key, 0, this.data.mode);
    this.refresh();
    wx.showToast({ title: "已移除" });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.detail.value;
    this.setData({ [field]: value });
    if (field === "tableNo") {
      const table = tableUtil.normalizeTable(value);
      if (table) {
        tableUtil.setTableNo(table);
      }
    }
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
      payMode,
      submitting,
      isDineIn,
      mode,
      deliveryMethod,
      consignee,
      phone,
      address,
      hasAddress
    } = this.data;
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
        if (!hasAddress || !name || !mobile || !fullAddress) {
          wx.showToast({ title: "请选择收货地址", icon: "none" });
          return;
        }
      } else if (!name || !mobile) {
        wx.showToast({ title: "请填写自提联系人与手机号", icon: "none" });
        return;
      } else if (!/^1\d{10}$/.test(mobile)) {
        wx.showToast({ title: "请填写正确手机号", icon: "none" });
        return;
      }
    }

    const payload = {
      items: cart,
      total,
      deliveryMethod: isDineIn ? "onsite" : deliveryMethod,
      payMode,
      // 仅柜台付款跳过在线支付；微信/余额走对应支付链路
      skipPayment: payMode === "manual",
      source: isDineIn ? "dinein-tea-menu" : "retail-tea-catalog",
      consignee: isDineIn ? "到店顾客" : name,
      phone: isDineIn ? "现场" : mobile,
      address: !isDineIn && deliveryMethod === "shipping" ? fullAddress : "",
      tableNo: table,
      table: table,
      pickupNote: isDineIn
        ? (table ? `桌号 ${table}` : "")
        : (deliveryMethod === "pickup" ? `到店自提 · ${name} ${mobile}` : ""),
      remark: isDineIn ? tableUtil.formatTableRemark(table, note) : note
    };

    this.setData({ submitting: true });
    createOrder(payload).then((result) => {
      if (result && result.ok === false) {
        wx.showToast({ title: result.message || "提交失败", icon: "none" });
        this.setData({ submitting: false });
        return null;
      }

      // 微信支付：先落单再调起收银台
      if (payMode === "wechat") {
        return payOrder({
          _id: result.id,
          orderId: result.id,
          orderNo: result.orderNo
        }).then(() => ({ result, paid: "wechat" }))
          .catch((error) => {
            // 订单已创建，支付取消/失败仍可稍后在订单详情继续付
            const msg = (error && error.errMsg) || (error && error.message) || "";
            const cancelled = /cancel|取消/i.test(msg);
            return {
              result,
              paid: "pending",
              payError: cancelled ? "已取消支付，可在订单详情继续付款" : (msg || "支付未完成，可在订单详情继续付款")
            };
          });
      }

      return {
        result,
        paid: result.payMode === "balance" && result.payStatus === "paid" ? "balance" : "manual"
      };
    }).then((outcome) => {
      if (!outcome) {
        return;
      }
      const { result, paid, payError } = outcome;
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
      const delivery = isDineIn
        ? (table ? `桌号 ${table}` : "堂饮")
        : (this.data.deliveryMethod === "shipping" ? "快递邮寄" : "到店自提");
      let title = "下单成功";
      let content = `订单 ${result.orderNo || ""}（${delivery}）已通知门店。请到柜台扫码付款。`;
      if (paid === "balance") {
        title = "余额支付成功";
        content = `订单 ${result.orderNo || ""}（${delivery}）已从会员余额扣除 ¥${Number(result.total || 0).toFixed(2)}。`;
      } else if (paid === "wechat") {
        title = "支付成功";
        content = `订单 ${result.orderNo || ""}（${delivery}）已支付成功，门店将尽快处理。`;
      } else if (paid === "pending") {
        title = "订单已创建";
        content = `订单 ${result.orderNo || ""}（${delivery}）已生成。${payError || "可在订单详情继续微信支付。"}`;
      }
      wx.showModal({
        title,
        content,
        showCancel: false,
        success: () => wx.switchTab({ url: "/pages/profile/index" })
      });
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
