const { listMyRecords } = require("../../utils/cloudApi");

Page({
  data: {
    orders: [],
    reservations: [],
    signups: []
  },

  onShow() {
    listMyRecords().then((records) => {
      this.setData({
        orders: records.orders || [],
        reservations: records.reservations || [],
        signups: records.signups || []
      });
    });
  },

  goHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  goCloudStatus() {
    wx.navigateTo({ url: "/pages/cloud-status/index" });
  }
});
