const { clearCart, getCart, getTotal, updateQuantity } = require("../../utils/cart");
const { createOrder } = require("../../utils/cloudApi");

Page({
  data: {
    cart: [],
    total: 0,
    remark: "",
    consignee: "",
    phone: "",
    address: ""
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const cart = getCart();
    this.setData({
      cart,
      total: getTotal(cart)
    });
  },

  decrease(event) {
    updateQuantity(event.currentTarget.dataset.key, Number(event.currentTarget.dataset.quantity) - 1);
    this.refresh();
  },

  increase(event) {
    updateQuantity(event.currentTarget.dataset.key, Number(event.currentTarget.dataset.quantity) + 1);
    this.refresh();
  },

  onInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  goOrder() {
    wx.navigateTo({ url: "/pages/order/index" });
  },

  chooseAddress() {
    wx.chooseAddress({
      success: (res) => {
        this.setData({
          consignee: res.userName || "",
          phone: res.telNumber || "",
          address: `${res.provinceName || ""}${res.cityName || ""}${res.countyName || ""}${res.detailInfo || ""}`
        });
      },
      fail: () => {
        wx.showToast({ title: "未选择地址", icon: "none" });
      }
    });
  },

  submitOrder() {
    const { cart, total, consignee, phone, address, remark } = this.data;
    if (!cart.length) {
      wx.showToast({ title: "还没有选择商品", icon: "none" });
      return;
    }

    const hasTea = cart.some((item) => item.type === "tea");
    if (hasTea && (!consignee || !phone || !address)) {
      wx.showToast({ title: "请填写收货信息", icon: "none" });
      return;
    }

    const payload = {
      items: cart,
      total,
      consignee,
      phone,
      address,
      remark
    };

    createOrder(payload).then((result) => {
      if (result && result.ok === false) {
        wx.showToast({ title: result.message || "提交失败", icon: "none" });
        return;
      }
      clearCart();
      this.refresh();
      wx.showModal({
        title: "订单已生成",
        content: "订单已写入云数据库，请到店支付或联系客服确认配送。",
        showCancel: false,
        success: () => wx.switchTab({ url: "/pages/profile/index" })
      });
    }).catch(() => {
      const orders = wx.getStorageSync("sanmuhe_orders") || [];
      orders.unshift({
        id: `SMH${Date.now()}`,
        createdAt: new Date().toISOString(),
        total,
        items: cart,
        consignee,
        phone,
        address,
        remark,
        status: "待支付"
      });
      wx.setStorageSync("sanmuhe_orders", orders);
      clearCart();
      this.refresh();
      wx.showModal({
        title: "订单已生成",
        content: "订单已临时保存在本机，云端恢复后请重新提交确认。",
        showCancel: false,
        success: () => wx.switchTab({ url: "/pages/profile/index" })
      });
    });
  }
});
