const app = getApp({ allowDefault: true });
const { getCatalog } = require("../../utils/cloudApi");
const { getStore } = require("../../data/store");
const { buildShareMessage } = require("../../utils/share");

const STORE = getStore();
const fallbackContact = {
  phone: STORE.phone,
  serviceTime: STORE.businessHours,
  store: STORE.name,
  address: STORE.address,
  wechat: STORE.wechat,
  // 联系页专用无字背景，避免与页内「禾煦茶书房」文案叠字
  heroImage: "/assets/images/contact-hero.jpg",
  qrCode: "/assets/images/contact-qr.jpg"
};

function buildQueryString(query = {}) {
  return Object.keys(query)
    .filter((key) => query[key] !== undefined && query[key] !== null && query[key] !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(query[key]))}`)
    .join("&");
}

function navigateFromContactCard(path, query) {
  if (!path) {
    return;
  }
  const qs = buildQueryString(query || {});
  const url = path.startsWith("/") ? path : `/${path}`;
  const full = qs ? `${url}${url.indexOf("?") >= 0 ? "&" : "?"}${qs}` : url;
  wx.navigateTo({
    url: full,
    fail: () => {
      wx.switchTab({ url: full.split("?")[0], fail: () => {} });
    }
  });
}

Page({
  data: {
    contact: fallbackContact,
    sessionFrom: "contact-page",
    sendMessageTitle: "禾煦茶书房 · 在线客服",
    sendMessagePath: "pages/contact/index",
    sendMessageImg: "/assets/images/contact-qr.jpg",
    qrCells: [
      1, 1, 1, 0, 1,
      1, 0, 0, 1, 0,
      1, 0, 1, 1, 1,
      0, 1, 0, 0, 1,
      1, 0, 1, 1, 1
    ]
  },

  onLoad(options = {}) {
    const from = String(options.from || "").trim();
    const productId = String(options.productId || "").trim();
    const orderId = String(options.orderId || "").trim();
    const eventId = String(options.eventId || "").trim();

    let sessionFrom = "contact-page";
    let sendMessageTitle = "禾煦茶书房 · 在线客服";
    let sendMessagePath = "pages/contact/index";

    if (orderId) {
      sessionFrom = `order:${orderId}`;
      sendMessageTitle = "订单咨询";
      sendMessagePath = `pages/order-detail/index?id=${encodeURIComponent(orderId)}`;
    } else if (productId) {
      sessionFrom = `product:${productId}`;
      sendMessageTitle = "茶品咨询";
      sendMessagePath = `pages/product/index?id=${encodeURIComponent(productId)}`;
    } else if (eventId) {
      sessionFrom = `event:${eventId}`;
      sendMessageTitle = "活动咨询";
      sendMessagePath = `pages/event-detail/index?id=${encodeURIComponent(eventId)}`;
    } else if (from) {
      sessionFrom = from.slice(0, 100);
    }

    const globalData = app.globalData || {};
    this.setData({
      sessionFrom,
      sendMessageTitle,
      sendMessagePath,
      contact: Object.assign({}, fallbackContact, {
        address: globalData.storeAddress || fallbackContact.address
      })
    });

    getCatalog().then((catalog) => {
      const settings = catalog.settings || {};
      if (settings.storeName || settings.address || settings.businessHours || settings.phone) {
        this.setData({
          contact: Object.assign({}, this.data.contact, {
            store: settings.storeName || this.data.contact.store,
            address: settings.address || this.data.contact.address,
            serviceTime: settings.businessHours || this.data.contact.serviceTime,
            phone: settings.phone || this.data.contact.phone
          })
        });
      }
    });
  },

  onShareAppMessage() {
    const contact = this.data.contact || {};
    return buildShareMessage({
      title: contact.store ? `${contact.store}｜欢迎来坐坐` : "禾煦书茶空间",
      path: "/pages/contact/index",
      imageUrl: contact.heroImage || ""
    });
  },

  handleContact(event) {
    const detail = (event && event.detail) || {};
    if (detail.path) {
      navigateFromContactCard(detail.path, detail.query);
    }
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

  showQrCode() {
    wx.previewImage({
      urls: [this.data.contact.qrCode],
      current: this.data.contact.qrCode
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
