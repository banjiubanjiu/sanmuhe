const app = getApp({ allowDefault: true });
const { getCatalog } = require("../../utils/cloudApi");

const fallbackContact = {
  phone: "0757-8888 8888",
  serviceTime: "10:00 - 21:00",
  store: "三木合・佛山",
  address: "广东省佛山市",
  wechat: "SANMUHE0757",
  heroImage: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/design-hero-tea.jpg"
};

Page({
  data: {
    contact: fallbackContact,
    qrCells: [
      1, 1, 1, 0, 1,
      1, 0, 0, 1, 0,
      1, 0, 1, 1, 1,
      0, 1, 0, 0, 1,
      1, 0, 1, 1, 1
    ]
  },

  onLoad() {
    const globalData = app.globalData || {};
    this.setData({
      contact: Object.assign({}, fallbackContact, {
        phone: globalData.servicePhone || fallbackContact.phone,
        address: globalData.storeAddress || fallbackContact.address
      })
    });
    getCatalog().then((catalog) => {
      const settings = catalog.settings || {};
      this.setData({
        contact: Object.assign({}, this.data.contact, {
          phone: settings.phone || this.data.contact.phone,
          serviceTime: settings.businessHours || this.data.contact.serviceTime,
          store: settings.storeName || this.data.contact.store,
          address: settings.address || this.data.contact.address
        })
      });
    });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: "/pages/profile/index" });
  },

  goTab(event) {
    const url = event.currentTarget.dataset.url;
    if (!url) {
      return;
    }
    if (url === "/pages/reservation/index") {
      wx.navigateTo({ url });
      return;
    }
    wx.switchTab({ url });
  },

  openOnlineService() {
    wx.showModal({
      title: "在线客服",
      content: "当前可通过电话或微信联系门店，微信号 SANMUHE0757 已为你准备好。",
      confirmText: "复制微信",
      success: (res) => {
        if (res.confirm) {
          this.copyWechat();
        }
      }
    });
  },

  callPhone() {
    const phoneNumber = this.data.contact.phone.replace(/\s/g, "");
    wx.makePhoneCall({
      phoneNumber,
      fail: () => {
        wx.showModal({
          title: "客服电话",
          content: this.data.contact.phone,
          showCancel: false
        });
      }
    });
  },

  copyWechat() {
    wx.setClipboardData({
      data: this.data.contact.wechat,
      success: () => {
        wx.showToast({ title: "微信号已复制" });
      }
    });
  },

  copyAddress() {
    wx.setClipboardData({
      data: `${this.data.contact.store} ${this.data.contact.address}`,
      success: () => {
        wx.showToast({ title: "地址已复制" });
      }
    });
  }
});
