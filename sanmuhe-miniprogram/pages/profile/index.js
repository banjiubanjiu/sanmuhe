const { listMyRecords } = require("../../utils/cloudApi");
const { getFavorites } = require("../../utils/favorites");

function normalizeRecords(records, type) {
  return (records || []).map((item, index) => {
    const fallback = `${type}-${index}`;
    return Object.assign({}, item, {
      id: item.id || item.orderNo || item._id || fallback
    });
  });
}

Page({
  data: {
    orders: [],
    reservations: [],
    signups: [],
    favorites: []
  },

  onShow() {
    this.setData({ favorites: getFavorites() });
    listMyRecords().then((records) => {
      this.setData({
        orders: normalizeRecords(records.orders, "order"),
        reservations: normalizeRecords(records.reservations, "reservation"),
        signups: normalizeRecords(records.signups, "signup"),
        favorites: getFavorites()
      });
    });
  },

  goHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  goCloudStatus() {
    wx.navigateTo({ url: "/pages/cloud-status/index" });
  },

  goProduct(event) {
    wx.navigateTo({ url: `/pages/product/index?id=${event.currentTarget.dataset.id}` });
  }
});
