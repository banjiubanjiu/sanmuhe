const { events } = require("../../data/catalog");
const { joinEvent, listEvents } = require("../../utils/cloudApi");

const categories = ["全部", "茶会", "讲座", "体验", "展览"];

function normalizeEvents(items) {
  return items.map((item) => Object.assign({
    category: "茶会",
    image: "/assets/images/design-event-spring.jpg",
    signed: 0,
    quota: 0
  }, item));
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
    joinEvent({
      eventId: target.id,
      title: target.title
    }).then((result) => {
      if (result && result.ok === false) {
        wx.showToast({ title: result.message || "报名失败", icon: "none" });
        return;
      }
      wx.showToast({ title: "已报名" });
    }).catch(() => {
      const signups = wx.getStorageSync("sanmuhe_event_signups") || [];
      signups.unshift({
        id: `JOIN${Date.now()}`,
        eventId: target.id,
        title: target.title,
        createdAt: new Date().toISOString(),
        status: "待确认"
      });
      wx.setStorageSync("sanmuhe_event_signups", signups);
      wx.showToast({ title: "已报名" });
    });
  }
});
