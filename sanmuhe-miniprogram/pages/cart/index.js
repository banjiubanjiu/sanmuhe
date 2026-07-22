const { getCart, getTotal, setCart, updateQuantity } = require("../../utils/cart");
const { createOrder } = require("../../utils/cloudApi");

const SHOP_CATEGORY_KEY = "sanmuhe_shop_category";

function getOptionText(item) {
  const options = item.options || {};
  if (item.type === "drink") {
    return ["大杯", options.temp || "冷饮", options.sugar || "正常糖", options.table ? `桌${options.table}` : ""]
      .filter(Boolean)
      .join(" / ");
  }
  return [options.unit || item.unit || "默认", item.category || "茶品"].filter(Boolean).join(" / ");
}

function enrichCart(cart) {
  return cart.map((item) => Object.assign({}, item, {
    optionText: getOptionText(item),
    lineTotal: Number(item.price || 0) * Number(item.quantity || 1)
  }));
}

Page({
  data: {
    cart: [],
    items: [],
    total: 0,
    count: 0,
    tableNo: "",
    remark: "",
    submitting: false
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const cart = getCart();
    const items = enrichCart(cart);
    this.setData({
      cart,
      items,
      total: getTotal(cart),
      count: cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0)
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

  removeItem(event) {
    updateQuantity(event.currentTarget.dataset.key, 0);
    this.refresh();
    wx.showToast({ title: "已移除" });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
  },

  goShop() {
    wx.setStorageSync(SHOP_CATEGORY_KEY, "全部");
    wx.switchTab({ url: "/pages/shop/index" });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: "/pages/shop/index" });
  },

  submitOrder() {
    const { cart, total, tableNo, remark, submitting } = this.data;
    if (submitting) {
      return;
    }
    if (!cart.length) {
      wx.showToast({ title: "购物车是空的", icon: "none" });
      return;
    }

    const table = String(tableNo || "").trim();
    const note = String(remark || "").trim();
    const payload = {
      items: cart,
      total,
      deliveryMethod: "onsite",
      payMode: "manual",
      skipPayment: true,
      source: "onsite-cart",
      // 现场点单无需真实联系方式；占位值兼容尚未部署的旧版 createOrder 校验。
      consignee: "到店顾客",
      phone: "现场",
      pickupNote: table ? `桌号 ${table}` : "",
      remark: [table ? `桌号 ${table}` : "", note].filter(Boolean).join("；")
    };

    this.setData({ submitting: true });
    createOrder(payload).then((result) => {
      if (result && result.ok === false) {
        wx.showToast({ title: result.message || "提交失败", icon: "none" });
        this.setData({ submitting: false });
        return;
      }
      setCart([]);
      this.setData({
        cart: [],
        items: [],
        total: 0,
        count: 0,
        tableNo: "",
        remark: "",
        submitting: false
      });
      wx.showModal({
        title: "下单成功",
        content: `订单 ${result.orderNo || ""} 已通知门店。请到柜台扫码付款。`,
        showCancel: false,
        success: () => wx.switchTab({ url: "/pages/profile/index" })
      });
    }).catch(() => {
      wx.showModal({
        title: "订单未提交",
        content: "当前网络或云服务不可用，请稍后重试。购物车内容已保留。",
        showCancel: false
      });
      this.setData({ submitting: false });
    });
  }
});
