const { events } = require("../../data/catalog");
const { listEvents } = require("../../utils/cloudApi");
const { syncTabBar } = require("../../utils/tabbar");
const { decorateEventStatus, isEventListVisible } = require("../../utils/eventStatus");
const { localImage } = require("../../config/assets");

const categories = ["全部", "养心茶会", "学茶", "时令茶会"];

const eventDisplay = {
  "event-001": {
    title: "养心茶会",
    category: "养心茶会",
    date: "5月25日 周六",
    time: "14:00",
    place: "禾煦",
    quota: 12,
    image: "/assets/images/event-yangxin-tea.jpg",
    detailImage: "/assets/images/event-detail-content-1.jpg",
    summary: "在茶香与静心中，慢慢安住自己",
    status: "敬请期待"
  },
  "event-002": {
    title: "学茶入门",
    category: "学茶",
    date: "6月1日 周六",
    time: "10:00",
    place: "禾煦",
    quota: 10,
    image: "/assets/images/event-tea-class.jpg",
    detailImage: "/assets/images/event-detail-content-2.jpg",
    summary: "从识香、泡茶到品饮，轻松了解基础茶知识",
    status: "敬请期待"
  },
  "event-003": {
    title: "时令茶会",
    category: "时令茶会",
    date: "6月8日 周六",
    time: "15:00",
    place: "禾煦",
    quota: 8,
    image: "/assets/images/event-seasonal-tea.jpg",
    detailImage: "/assets/images/event-detail-content-3.jpg",
    summary: "顺时品茶，感受节气与日常之美",
    status: "敬请期待"
  }
};

function normalizeCategory(category) {
  if (category === "讲座" || category === "体验") {
    return "学茶";
  }
  if (category === "茶会" || category === "展览") {
    return "养心茶会";
  }
  return category || "养心茶会";
}

function safeLocalImage(path, fallback) {
  try {
    const next = localImage(path || fallback || "");
    return next || fallback || "/assets/images/event-yangxin-tea.jpg";
  } catch (error) {
    return fallback || "/assets/images/event-yangxin-tea.jpg";
  }
}

/** 只保留 setData 可用的纯字段，避免云端 Date 等导致渲染异常 */
function toViewEvent(item) {
  const source = item && typeof item === "object" ? item : {};
  const decorated = decorateEventStatus(source);
  return {
    id: source.id || "",
    title: source.title || source.name || "茶事活动",
    category: normalizeCategory(source.category),
    date: source.date || "",
    time: source.time || "",
    place: source.place || "禾煦",
    summary: source.summary || "",
    quota: Math.max(0, Number(source.quota) || 0),
    signed: Math.max(0, Number(source.signed) || 0),
    status: decorated.status,
    displayStatus: decorated.displayStatus,
    canJoin: decorated.canJoin,
    joinText: decorated.joinText,
    joinClass: decorated.joinClass || "wait",
    limitText: Number(source.quota) > 0 ? `限${Number(source.quota)}人` : "名额有限",
    image: safeLocalImage(source.image, "/assets/images/event-yangxin-tea.jpg"),
    detailImage: safeLocalImage(
      source.detailImage || source.image,
      "/assets/images/event-detail-content-1.jpg"
    )
  };
}

function normalizeEvents(items) {
  const list = Array.isArray(items) ? items : [];
  return list
    .filter((raw) => raw && typeof raw === "object")
    .map((raw, index) => {
      const fallbackKey = `event-00${index + 1}`;
      const display = eventDisplay[raw.id] || eventDisplay[fallbackKey] || {};
      return toViewEvent(Object.assign({}, display, raw, {
        status: raw.status || display.status || "敬请期待"
      }));
    })
    .filter(isEventListVisible);
}

function getEventSignature(items) {
  if (!Array.isArray(items)) {
    return "";
  }
  return items.map((item) => [
    item && item.id,
    item && item.title,
    item && item.category,
    item && item.date,
    item && item.time,
    item && item.place,
    item && item.quota,
    item && item.signed,
    item && item.status,
    item && item.displayStatus,
    item && item.joinText,
    item && item.image,
    item && item.summary
  ].join("|")).join("||");
}

let initialEvents = [];
try {
  initialEvents = normalizeEvents(events);
} catch (error) {
  console.warn("[events] normalize local failed", error);
  initialEvents = Array.isArray(events) ? events.map((item) => toViewEvent(item)) : [];
}
let cachedEvents = initialEvents.slice();

Page({
  data: {
    categories,
    activeCategory: "全部",
    allEvents: initialEvents,
    events: initialEvents
  },

  onShow() {
    try {
      syncTabBar(this);
    } catch (error) {
      console.warn("[events] syncTabBar", error);
    }

    try {
      if (getEventSignature(this.data.allEvents) !== getEventSignature(cachedEvents)) {
        this.applyEvents(cachedEvents);
      }
    } catch (error) {
      console.warn("[events] cache apply", error);
    }

    listEvents()
      .then((nextEvents) => {
        const source = Array.isArray(nextEvents) && nextEvents.length ? nextEvents : events;
        const allEvents = normalizeEvents(source);
        if (getEventSignature(allEvents) === getEventSignature(cachedEvents)) {
          return;
        }
        cachedEvents = allEvents;
        this.applyEvents(allEvents);
      })
      .catch((error) => {
        console.warn("[events] listEvents failed", error);
      });
  },

  applyEvents(allEvents) {
    const list = Array.isArray(allEvents) ? allEvents : [];
    const activeCategory = this.data.activeCategory || "全部";
    const filtered = activeCategory === "全部"
      ? list
      : list.filter((item) => item && item.category === activeCategory);
    this.setData({ allEvents: list, events: filtered });
  },

  applyFilter() {
    this.applyEvents(this.data.allEvents);
  },

  changeCategory(event) {
    const activeCategory = event.currentTarget.dataset.category || "全部";
    this.setData({ activeCategory }, () => this.applyFilter());
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({
        delta: 1,
        fail: () => {
          wx.switchTab({ url: "/pages/index/index" });
        }
      });
      return;
    }
    wx.switchTab({ url: "/pages/index/index" });
  },

  viewEvent(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) {
      return;
    }
    wx.navigateTo({ url: `/pages/event-detail/index?id=${id}` });
  }
});
