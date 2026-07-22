const { events: localEvents } = require("../../data/catalog");
const { listEvents } = require("../../utils/cloudApi");

const detailImages = {
  "event-001": "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/event-detail-content-1.png",
  "event-002": "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/event-detail-content-2.png",
  "event-003": "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/event-detail-content-3.png"
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

Page({
  data: {
    event: null
  },

  onLoad(options) {
    const eventId = options && options.id;
    this.eventId = eventId;
    const fallback = findEvent(eventId, localEvents);
    this.setData({ event: fallback });

    listEvents().then((remoteEvents) => {
      const event = findEvent(eventId, remoteEvents && remoteEvents.length ? remoteEvents : localEvents);
      if (event) {
        this.setData({ event });
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

  contactService() {
    wx.navigateTo({ url: "/pages/contact/index" });
  }
});
