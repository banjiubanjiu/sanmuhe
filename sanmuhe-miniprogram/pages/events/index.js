const { events } = require("../../data/catalog");
const { joinEvent, listEvents } = require("../../utils/cloudApi");

const categories = ["全部", "茶会", "讲座", "体验", "展览"];

function normalizeEvents(items) {
  return items.map((item) => {
    const signed = Number(item.signed || 0);
    const quota = Number(item.quota || 0);
    const isFull = quota > 0 && signed >= quota;
    return Object.assign({
    category: "茶会",
    image: "/assets/images/design-event-spring.jpg",
    signed,
    quota,
    canJoin: !isFull,
    joinText: isFull ? "已满" : "报名中"
    }, item, {
      signed,
      quota,
      canJoin: !isFull,
      joinText: isFull ? "已满" : "报名中"
    });
  });
}

Page({
  data: {
    categories,
    activeCategory: "全部",
    allEvents: [],
    events: []
  },

  onShow() {
    listEvents().then((nextEvents) => {
      const allEvents = normalizeEvents(nextEvents && nextEvents.length ? nextEvents : events);
      this.setData({ allEvents }, () => this.applyFilter());
    });
  },

  applyFilter() {
    const { activeCategory, allEvents } = this.data;
    const filtered = activeCategory === "全部"
      ? allEvents
      : allEvents.filter((item) => item.category === activeCategory);
    this.setData({ events: filtered });
  },

  changeCategory(event) {
    this.setData({ activeCategory: event.currentTarget.dataset.category }, () => this.applyFilter());
  },

  publishEvent() {
    wx.navigateTo({ url: "/pages/event-edit/index" });
  },

  goBack() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  joinEvent(event) {
    const id = event.currentTarget.dataset.id;
    const target = this.data.events.find((item) => item.id === id);
    if (!target || !target.canJoin) {
      wx.showToast({ title: "名额已满", icon: "none" });
      return;
    }
    joinEvent({
      eventId: target.id,
      title: target.title
    }).then((result) => {
      if (result && result.ok === false) {
        wx.showToast({ title: result.message || "报名失败", icon: "none" });
        return;
      }
      this.markJoined(target.id);
      wx.showToast({ title: "已报名" });
    }).catch(() => {
      const signups = wx.getStorageSync("sanmuhe_event_signups") || [];
      const alreadyJoined = signups.some((item) => item.eventId === target.id);
      if (alreadyJoined) {
        wx.showToast({ title: "你已经报名过该活动", icon: "none" });
        return;
      }
      signups.unshift({
        id: `JOIN${Date.now()}`,
        eventId: target.id,
        title: target.title,
        createdAt: new Date().toISOString(),
        status: "待确认"
      });
      wx.setStorageSync("sanmuhe_event_signups", signups);
      this.markJoined(target.id);
      wx.showToast({ title: "已报名" });
    });
  },

  markJoined(eventId) {
    const allEvents = this.data.allEvents.map((item) => {
      if (item.id !== eventId) {
        return item;
      }
      const signed = Number(item.signed || 0) + 1;
      const quota = Number(item.quota || 0);
      const isFull = quota > 0 && signed >= quota;
      return Object.assign({}, item, {
        signed,
        canJoin: false,
        joinText: isFull ? "已满" : "已报名"
      });
    });
    this.setData({ allEvents }, () => this.applyFilter());
  }
});
