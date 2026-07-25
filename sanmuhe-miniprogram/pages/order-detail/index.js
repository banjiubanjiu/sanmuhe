const { getMyOrder, payOrder, updateMyOrder } = require("../../utils/cloudApi");
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

Page({
  data: {
    orderId: "",
    order: null,
    loading: true,
    error: "",
    submitting: false,
    afterSaleOpen: false,
    afterSaleReason: "",
    contactSessionFrom: "order-detail",
    contactMessageTitle: "订单咨询",
    contactMessagePath: "pages/orders/index",
    contactMessageImg: "/assets/images/contact-qr.jpg"
  },

  onLoad(options = {}) {
    const orderId = decodeURIComponent(options.id || "");
    this.setData(Object.assign({ orderId }, buildContactMeta(orderId)));
    this.loadOrder();
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
    if (!this.data.orderId) {
      this.setData({
        loading: false,
        error: "没有找到这笔订单"
      });
      return Promise.resolve();
    }
    if (!options.silent) {
      this.setData({ loading: true, error: "" });
    }
    return getMyOrder(this.data.orderId).then((result) => {
      const order = normalizeOrder(result.order);
      this.setData(Object.assign({
        order,
        loading: false,
        error: ""
      }, buildContactMeta(this.data.orderId, order)));
    }).catch((error) => {
      this.setData({
        loading: false,
        error: error && error.message ? error.message : "订单详情暂时加载失败"
      });
    });
  },

  continuePayment() {
    if (this.data.submitting || !this.data.order) {
      return;
    }
    this.setData({ submitting: true });
    payOrder(this.data.order).then(() => {
      wx.showToast({ title: "正在确认支付结果", icon: "none" });
      setTimeout(() => {
        this.setData({ submitting: false });
        this.loadOrder({ silent: true });
      }, 1200);
    }).catch((error) => {
      const message = error && error.errMsg && /cancel/.test(error.errMsg)
        ? "已取消支付，可稍后继续"
        : (error && error.message ? error.message : "暂时无法发起支付");
      wx.showToast({ title: message, icon: "none" });
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
