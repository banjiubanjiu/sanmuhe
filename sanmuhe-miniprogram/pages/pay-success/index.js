const { money } = require("../../utils/orderCenter");

Page({
  data: {
    orderId: "",
    orderNo: "",
    totalText: "0.00",
    delivery: "",
    deliveryText: "",
    payText: "",
    fulfillmentText: "",
    mode: "retail"
  },

  onLoad(options) {
    const orderId = decodeURIComponent(options.orderId || "");
    const orderNo = decodeURIComponent(options.orderNo || "");
    const total = Number(options.total) || 0;
    const delivery = decodeURIComponent(options.delivery || "pickup");
    const pay = decodeURIComponent(options.pay || "wechat");
    const mode = options.mode === "dinein" ? "dinein" : "retail";
    this.setData({
      orderId,
      orderNo,
      totalText: money(total),
      delivery,
      deliveryText: delivery === "onsite"
        ? "堂饮到店"
        : (delivery === "shipping" ? "快递配送" : "到店自提"),
      payText: pay === "balance" ? "会员余额" : "微信支付",
      fulfillmentText: delivery === "onsite"
        ? "已通知门店备茶，凭桌号即可享用。"
        : (delivery === "shipping"
          ? "已通知门店备货，将尽快安排发出。"
          : "已通知门店备货，凭订单号到店自提。"),
      mode
    });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({
        delta: 1,
        fail: () => this.goShopping()
      });
      return;
    }
    this.goShopping();
  },

  goOrderDetail() {
    if (!this.data.orderId) {
      this.goShopping();
      return;
    }
    wx.navigateTo({
      url: `/pages/order-detail/index?id=${encodeURIComponent(this.data.orderId)}`
    });
  },

  goShopping() {
    if (this.data.mode === "dinein") {
      wx.switchTab({ url: "/pages/order/index" });
      return;
    }
    wx.switchTab({ url: "/pages/shop/index" });
  },

  copyOrderNo() {
    if (!this.data.orderNo) {
      return;
    }
    wx.setClipboardData({ data: this.data.orderNo });
  }
});
