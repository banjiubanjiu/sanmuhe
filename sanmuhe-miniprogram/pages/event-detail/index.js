const { events: localEvents } = require("../../data/catalog");
const { listEvents } = require("../../utils/cloudApi");
const { decorateEventStatus } = require("../../utils/eventStatus");
const { localImage } = require("../../config/assets");

const detailImages = {
  "event-001": "/assets/images/event-detail-content-1.jpg",
  "event-002": "/assets/images/event-detail-content-2.jpg",
  "event-003": "/assets/images/event-detail-content-3.jpg"
};

function safeLocalImage(path, fallback) {
  try {
    const next = localImage(path || fallback || "");
    return next || fallback || "";
  } catch (error) {
    return fallback || path || "";
  }
}

function toViewEvent(raw, index) {
  const source = raw && typeof raw === "object" ? raw : {};
  const fallback = localEvents.find((item) => item.id === source.id)
    || localEvents[index]
    || localEvents[0]
    || {};
  const merged = Object.assign({}, fallback, source, {
    status: source.status || fallback.status || "敬请期待",
    image: safeLocalImage(source.image || fallback.image, "/assets/images/event-yangxin-tea.jpg"),
    detailImage: safeLocalImage(
      source.detailImage || fallback.detailImage || detailImages[source.id] || source.image || fallback.image,
      "/assets/images/event-detail-content-1.jpg"
    )
  });
  const decorated = decorateEventStatus(merged);
  return {
    id: decorated.id || "",
    title: decorated.title || decorated.name || "茶事活动",
    category: decorated.category || "",
    date: decorated.date || "",
    time: decorated.time || "",
    place: decorated.place || "",
    summary: decorated.summary || "",
    quota: Math.max(0, Number(decorated.quota) || 0),
    signed: Math.max(0, Number(decorated.signed) || 0),
    status: decorated.status || "敬请期待",
    displayStatus: decorated.displayStatus || "敬请期待",
    canJoin: !!decorated.canJoin,
    joinText: decorated.joinText || "敬请期待",
    joinClass: decorated.joinClass || "wait",
    image: decorated.image,
    detailImage: decorated.detailImage
  };
}

function findEvent(id, source) {
  const list = Array.isArray(source) && source.length ? source : localEvents;
  const target = id ? list.find((item) => item && item.id === id) : list[0];
  if (!target && source !== localEvents) {
    return findEvent(id, localEvents);
  }
  return target ? toViewEvent(target, list.indexOf(target)) : null;
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
    try {
      const fallback = findEvent(eventId, localEvents);
      this.setData(Object.assign({ event: fallback }, buildContactMeta(fallback)));
    } catch (error) {
      console.warn("[event-detail] local normalize failed", error);
      this.setData({ event: null });
    }

    listEvents()
      .then((remoteEvents) => {
        try {
          const event = findEvent(
            eventId,
            remoteEvents && remoteEvents.length ? remoteEvents : localEvents
          );
          if (event) {
            this.setData(Object.assign({ event }, buildContactMeta(event)));
          }
        } catch (error) {
          console.warn("[event-detail] remote normalize failed", error);
        }
      })
      .catch((error) => {
        console.warn("[event-detail] listEvents failed", error);
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
    wx.redirectTo({ url: "/pages/events/index" });
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
