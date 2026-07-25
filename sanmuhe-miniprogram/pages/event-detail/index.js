const { events: localEvents } = require("../../data/catalog");
const { listEvents } = require("../../utils/cloudApi");

const detailImages = {
  "event-001": "/assets/images/event-yangxin-tea.jpg",
  "event-002": "/assets/images/event-tea-class.jpg",
  "event-003": "/assets/images/event-seasonal-tea.jpg"
};

function normalizeEvent(raw, index) {
  const fallback = localEvents.find((item) => item.id === raw.id) || localEvents[index] || localEvents[0] || {};
  const item = Object.assign({}, fallback, raw);
  return Object.assign({}, item, {
    canJoin: false,
    joinText: "敬请期待",
    detailImage: item.detailImage || detailImages[item.id] || item.image
  });
}

function findEvent(id, source) {
  const list = Array.isArray(source) && source.length ? source : localEvents;
  const target = id ? list.find((item) => item.id === id) : list[0];
  if (!target && source !== localEvents) {
    return findEvent(id, localEvents);
  }
  return target ? normalizeEvent(target, list.indexOf(target)) : null;
}

function buildContactMeta(event) {
  const id = event && event.id ? String(event.id) : "";
  const title = event && (event.title || event.name) ? String(event.title || event.name) : "活动咨询";
  const img = (event && (event.detailImage || event.image)) || "/assets/images/contact-qr.jpg";
  return {
    contactSessionFrom: id ? `event:${id}` : "event-detail",
    contactMessageTitle: title.slice(0, 20),
    contactMessagePath: id ? `pages/event-detail/index?id=${encodeURIComponent(id)}` : "pages/event-detail/index",
    contactMessageImg: img
  };
}

Page({
  data: {
    event: null,
    contactSessionFrom: "event-detail",
    contactMessageTitle: "活动咨询",
    contactMessagePath: "pages/event-detail/index",
    contactMessageImg: "/assets/images/contact-qr.jpg"
  },

  onLoad(options) {
    const eventId = options && options.id;
    this.eventId = eventId;
    const fallback = findEvent(eventId, localEvents);
    this.setData(Object.assign({ event: fallback }, buildContactMeta(fallback)));

    listEvents().then((remoteEvents) => {
      const event = findEvent(eventId, remoteEvents && remoteEvents.length ? remoteEvents : localEvents);
      if (event) {
        this.setData(Object.assign({ event }, buildContactMeta(event)));
      }
    });
  },

  onShareAppMessage() {
    const event = this.data.event || {};
    return {
      title: event.title || "禾煦茶事活动",
      path: `/pages/event-detail/index?id=${event.id || this.eventId || "event-001"}`,
      imageUrl: event.image || event.detailImage || ""
    };
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: "/pages/events/index" });
  },

  previewDesign() {
    const image = this.data.event && this.data.event.detailImage;
    if (!image) {
      return;
    }
    wx.previewImage({
      current: image,
      urls: [image]
    });
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
  }
});
