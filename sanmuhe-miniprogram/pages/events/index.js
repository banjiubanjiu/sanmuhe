const { events } = require("../../data/catalog");
const { listEvents } = require("../../utils/cloudApi");
const { syncTabBar } = require("../../utils/tabbar");

const categories = ["全部", "养心茶会", "学茶", "时令茶会"];

const eventDisplay = {
  "event-001": {
    title: "养心茶会",
    category: "养心茶会",
    date: "5月25日 周六",
    time: "14:00",
    place: "禾煦・佛山",
    quota: 12,
    image: "/assets/images/event-yangxin-tea.jpg",
    detailImage: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/event-detail-content-1.png",
    summary: "在茶香与静心中，慢慢安住自己"
  },
  "event-002": {
    title: "学茶入门",
    category: "学茶",
    date: "6月1日 周六",
    time: "10:00",
    place: "禾煦・佛山",
    quota: 10,
    image: "/assets/images/event-tea-class.jpg",
    detailImage: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/event-detail-content-2.png",
    summary: "从识香、泡茶到品饮，轻松了解基础茶知识"
  },
  "event-003": {
    title: "时令茶会",
    category: "时令茶会",
    date: "6月8日 周六",
    time: "15:00",
    place: "禾煦・佛山",
    quota: 8,
    image: "/assets/images/event-seasonal-tea.jpg",
    detailImage: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/event-detail-content-3.png",
    summary: "顺时品茶，感受节气与日常之美"
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

function normalizeEvents(items) {
  return items.map((raw, index) => {
    const fallbackKey = `event-00${index + 1}`;
    const display = eventDisplay[raw.id] || eventDisplay[fallbackKey] || {};
    const item = Object.assign({}, display, raw);
    const quota = Number(item.quota || raw.quota || 0);
    return Object.assign({}, item, {
      category: normalizeCategory(item.category),
      image: item.image || "/assets/images/event-yangxin-tea.jpg",
      quota,
      canJoin: false,
      joinText: "敬请期待",
      limitText: quota > 0 ? `限${quota}人` : "名额有限"
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
    syncTabBar(this);
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

  goBack() {
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
