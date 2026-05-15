const { drinks, teaProducts, rooms, events } = require("../../data/catalog");
const { getCart, getTotal } = require("../../utils/cart");

Page({
  data: {
    featuredDrink: drinks[0],
    featuredTea: teaProducts[0],
    featuredRoom: rooms[0],
    nextEvent: events[0],
    recommendTeas: teaProducts.slice(0, 3),
    cartCount: 0,
    cartTotal: 0
  },

  onShow() {
    const cart = getCart();
    this.setData({
      cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      cartTotal: getTotal(cart)
    });
  },

  goOrder() {
    wx.navigateTo({ url: "/pages/order/index" });
  },

  goShop() {
    wx.switchTab({ url: "/pages/shop/index" });
  },

  goReservation() {
    wx.navigateTo({ url: "/pages/reservation/index" });
  },

  goEvents() {
    wx.switchTab({ url: "/pages/events/index" });
  },

  goCart() {
    wx.switchTab({ url: "/pages/cart/index" });
  },

  goCloudStatus() {
    wx.navigateTo({ url: "/pages/cloud-status/index" });
  }
});
