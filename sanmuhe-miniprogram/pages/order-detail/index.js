const { getMyOrder, payOrder, updateMyOrder, queryLogistics } = require("../../utils/cloudApi");
const { addToCart } = require("../../utils/cart");
const { normalizeOrder } = require("../../utils/orderCenter");

function buildContactMeta(orderId, order) {
  const id = orderId || (order && (order._id || order.id)) || "";
  const orderNo = order && order.orderNo ? String(order.orderNo) : "";
  return {
    contactSessionFrom: id ? `order:${id}` : "order-detail",
    contactMessageTitle: orderNo ? `订单 ${orderNo}`.slice(0, 20) : "订单咨询",
    contactMessagePath: id ? `pages/order-detail/index?id=${encodeURIComponent(id)}` : "pages/orders/index",
    contactMessageImg: "/assets/images/contact-qr.jpg"
  };
}

function logisticsStateText(state) {
  const map = {
    "0": "在途",
    "1": "揽收",
    "2": "疑难",
    "3": "已签收",
    "4": "退签",
    "5": "派件",
    "6": "退回",
    "7": "转投",
    "8": "清关",
    "10": "待清关",
    "11": "清关中",
    "12": "已清关",
    "13": "清关异常",
    "14": "拒签"
  };
  const key = String(state == null ? "" : state);
  return map[key] || (key ? `状态 ${key}` : "");
}

function safeDecode(value) {
  if (!value) {
    return "";
  }
  try {
    return decodeURIComponent(String(value));
  } catch (error) {
    return String(value);
  }
}

Page({
  data: {
    orderId: "",
    order: null,
    loading: true,
    error: "",
    submitting: false,
    afterSaleOpen: false,
    afterSaleReason: "",
    logisticsLoading: false,
    logisticsError: "",
    logisticsTraces: [],
    logisticsStateLabel: "",
    contactSessionFrom: "order-detail",
    contactMessageTitle: "订单咨询",
    contactMessagePath: "pages/orders/index",
    contactMessageImg: "/assets/images/contact-qr.jpg"
  },

  onLoad(options = {}) {
    const orderId = safeDecode(options.id);
    // 微信跳转进入的场景有两种，均按参数反查本地订单：
    // 1) 「订单发货通知」/「确认收货提醒」（set_msg_jump_path）附加
    //    transaction_id、merchant_id、merchant_trade_no（二级商户还有 sub_merchant_id）；
    // 2) 开发平台「订单详情页 PATH」用 out_trade_no 替换 ${商品订单号}，
    //    out_trade_no 即本地 orderNo。
    const lookup = {};
    if (!orderId) {
      const transactionId = safeDecode(options.transaction_id || options.transactionId);
      const orderNo = safeDecode(
        options.orderNo ||
          options.merchant_trade_no ||
          options.merchantTradeNo ||
          options.out_trade_no ||
          options.outTradeNo
      );
      if (transactionId) {
        lookup.transactionId = transactionId;
      }
      if (orderNo) {
        lookup.orderNo = orderNo;
      }
    }
    this.setData(Object.assign({ orderId }, buildContactMeta(orderId)));
    this.loadOrder(lookup);
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.navigateTo({ url: "/pages/orders/index" });
  },

  retry() {
    this.loadOrder();
  },

  loadOrder(options = {}) {
    const silent = options.silent === true;
    // 记住本次解析依据：微信跳转进入时没有本地 id，后续静默刷新也要能反查
    const lookup = {
      transactionId: options.transactionId || "",
      orderNo: options.orderNo || ""
    };
    this._lookup = Object.assign({}, this._lookup || {}, lookup);
    if (!this.data.orderId && !this._lookup.transactionId && !this._lookup.orderNo) {
      this.setData({
        loading: false,
        error: "没有找到这笔订单"
      });
      return Promise.resolve();
    }
    if (!silent) {
      this.setData({ loading: true, error: "" });
    }
    return getMyOrder(this.data.orderId, {
      transactionId: this._lookup.transactionId || "",
      orderNo: this._lookup.orderNo || ""
    }).then((result) => {
      const order = normalizeOrder(result.order);
      const cachedTraces = Array.isArray(order.logisticsTraces) ? order.logisticsTraces : [];
      this.setData(Object.assign({
        order,
        loading: false,
        error: "",
        logisticsTraces: cachedTraces,
        logisticsStateLabel: logisticsStateText(order.logisticsState),
        logisticsError: ""
      }, buildContactMeta(this.data.orderId, order)));
      if (order.canViewLogistics || (order.deliveryMethod === "shipping" && order.trackingNo)) {
        this.loadLogistics({ silent: true });
      }
    }).catch((error) => {
      this.setData({
        loading: false,
        error: error && error.message ? error.message : "订单详情暂时加载失败"
      });
    });
  },

  loadLogistics(options = {}) {
    if (!this.data.orderId) {
      return;
    }
    if (!options.silent) {
      this.setData({ logisticsLoading: true, logisticsError: "" });
    } else {
      this.setData({ logisticsLoading: true });
    }
    queryLogistics(this.data.orderId, { force: !!options.force }).then((result) => {
      if (!result) {
        return;
      }
      if (result.ok === false) {
        this.setData({
          logisticsLoading: false,
          logisticsError: result.message || "暂时查不到轨迹",
          logisticsTraces: Array.isArray(result.traces) ? result.traces : this.data.logisticsTraces
        });
        return;
      }
      this.setData({
        logisticsLoading: false,
        logisticsError: result.pending ? (result.message || "") : "",
        logisticsTraces: Array.isArray(result.traces) ? result.traces : [],
        logisticsStateLabel: logisticsStateText(result.state)
      });
    }).catch((error) => {
      this.setData({
        logisticsLoading: false,
        logisticsError: (error && error.message) || "物流查询失败"
      });
    });
  },

  refreshLogistics() {
    this.loadLogistics({ force: true });
  },

  continuePayment() {
    if (this.data.submitting || !this.data.order) {
      return;
    }
    this.setData({ submitting: true });
    const order = this.data.order;
    payOrder({
      _id: order._id || order.id,
      orderId: order._id || order.id,
      orderNo: order.orderNo
    }).then(() => {
      wx.showModal({
        title: "支付成功",
        content: "付款成功，订单已付款，门店已收到。",
        showCancel: false,
        success: () => {
          this.setData({ submitting: false });
          this.loadOrder({ silent: true });
        }
      });
    }).catch((error) => {
      const raw = (error && (error.errMsg || error.message)) || "";
      const cancelled = /cancel|取消/i.test(raw);
      const alreadyPaid = error && error.code === "ALREADY_PAID_ON_WECHAT";
      const message = cancelled
        ? "已取消支付，订单尚未成功，可再次点「继续支付」"
        : (alreadyPaid
          ? "微信已收款，正在同步为已支付订单"
          : (error && error.message ? error.message : "暂时无法发起支付"));
      if (alreadyPaid) {
        wx.showToast({ title: message, icon: "none" });
      } else {
        wx.showModal({
          title: cancelled ? "支付已取消" : "请先完成支付",
          content: message,
          showCancel: false
        });
      }
      this.setData({ submitting: false });
      this.loadOrder({ silent: true });
    });
  },

  cancelOrder() {
    if (this.data.submitting || !this.data.order) {
      return;
    }
    wx.showModal({
      title: "取消这笔订单？",
      content: "取消后，已锁定的库存和优惠券会自动释放。",
      confirmText: "确认取消",
      confirmColor: "#A64B3C",
      success: (result) => {
        if (!result.confirm) {
          return;
        }
        this.runAction("cancelOrder", {}, "订单已取消");
      }
    });
  },

  confirmReceipt() {
    if (this.data.submitting || !this.data.order) {
      return;
    }
    wx.showModal({
      title: "确认已经收到商品？",
      content: "确认后订单将完成，如商品存在问题请先申请售后。",
      confirmText: "确认收货",
      confirmColor: "#173B2A",
      success: (result) => {
        if (result.confirm) {
          this.runAction("confirmReceipt", {}, "已确认收货");
        }
      }
    });
  },

  toggleAfterSale() {
    this.setData({
      afterSaleOpen: !this.data.afterSaleOpen,
      afterSaleReason: this.data.afterSaleOpen ? "" : this.data.afterSaleReason
    });
  },

  onAfterSaleReason(event) {
    this.setData({ afterSaleReason: event.detail.value });
  },

  submitAfterSale() {
    const reason = String(this.data.afterSaleReason || "").trim();
    if (!reason) {
      wx.showToast({ title: "请说明需要门店协助的问题", icon: "none" });
      return;
    }
    this.runAction("applyAfterSale", { reason }, "售后申请已提交", () => {
      this.setData({ afterSaleOpen: false, afterSaleReason: "" });
    });
  },

  runAction(action, payload, successMessage, onSuccess) {
    this.setData({ submitting: true });
    updateMyOrder(action, this.data.orderId, payload).then(() => {
      if (onSuccess) {
        onSuccess();
      }
      wx.showToast({ title: successMessage, icon: "success" });
      return this.loadOrder({ silent: true });
    }).catch((error) => {
      wx.showToast({
        title: error && error.message ? error.message : "操作没有完成，请稍后重试",
        icon: "none"
      });
    }).finally(() => {
      this.setData({ submitting: false });
    });
  },

  copyOrderNo() {
    const orderNo = this.data.order && this.data.order.displayId;
    if (orderNo) {
      wx.setClipboardData({ data: orderNo });
    }
  },

  copyTrackingNo() {
    const trackingNo = this.data.order && this.data.order.trackingNo;
    if (trackingNo) {
      wx.setClipboardData({ data: trackingNo });
    }
  },

  handleContact(event) {
    const detail = (event && event.detail) || {};
    if (!detail.path) {
      return;
    }
    const path = detail.path.startsWith("/") ? detail.path : `/${detail.path}`;
    const query = detail.query || {};
    const qs = Object.keys(query)
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(query[key]))}`)
      .join("&");
    const url = qs ? `${path}${path.indexOf("?") >= 0 ? "&" : "?"}${qs}` : path;
    wx.navigateTo({ url, fail: () => {} });
  },

  buyAgain() {
    const order = this.data.order;
    if (!order || !order.items || !order.items.length) {
      wx.showToast({ title: "这笔订单暂无可再次购买的商品", icon: "none" });
      return;
    }
    const onlyDineIn = order.items.every((item) => item.type === "drink");
    order.items.forEach((item) => {
      addToCart({
        id: item.id,
        type: item.type || "tea",
        name: item.name,
        image: item.image,
        price: Number(item.price) || 0,
        quantity: item.quantity,
        options: item.options || {}
      });
    });
    wx.showToast({
      title: onlyDineIn ? "已加入茶单" : "已加入购物车",
      icon: "success",
      success: () => wx.navigateTo({
        url: onlyDineIn ? "/pages/cart/index?mode=dinein" : "/pages/cart/index?mode=retail"
      })
    });
  }
});
