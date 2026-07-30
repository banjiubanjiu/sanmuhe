const { listMyRecords } = require("../../utils/cloudApi");
const { displayReservationPlace } = require("../../data/store");

const tabs = [
  { key: "reservation", label: "我的预约" },
  { key: "event", label: "我的活动" }
];

function validTab(value) {
  return tabs.some((item) => item.key === value) ? value : "reservation";
}

function normalizeReservations(records) {
  return (records || []).map((item) => {
    const timeRange = item.endTime ? `${item.time || ""}–${item.endTime}` : (item.time || "");
    return Object.assign({}, item, {
      id: item.id || item._id,
      title: displayReservationPlace(item),
      meta: item.day && timeRange ? `${item.day} ${timeRange}` : (item.day || ""),
      subMeta: `${item.people || 1} 位 · ${item.phone || ""}`,
      image: item.image || "/assets/images/reservation-hero.jpg",
      status: item.status || "待确认"
    });
  });
}

function normalizeSignups(records) {
  return (records || []).map((item) => Object.assign({}, item, {
    id: item.id || item._id,
    title: item.title || "活动报名",
    meta: item.date && item.time ? `${item.date} ${item.time}` : (item.date || ""),
    subMeta: item.place || "禾煦",
    image: item.image || "/assets/images/event-yangxin-tea.jpg",
    status: item.status || "待确认"
  }));
}

Page({
  data: {
    tabs,
    activeTab: "reservation",
    reservations: [],
    signups: [],
    loading: false,
    loaded: false,
    error: ""
  },

  onLoad(options = {}) {
    this.setData({ activeTab: validTab(options.tab) });
    this.loadRecords(true);
  },

  onShow() {
    if (this.needsRefresh) {
      this.needsRefresh = false;
      this.loadRecords(true);
    }
  },

  onPullDownRefresh() {
    this.loadRecords(true);
  },

  switchTab(event) {
    const tab = validTab(event.currentTarget.dataset.tab);
    if (tab === this.data.activeTab) {
      return;
    }
    this.setData({ activeTab: tab });
    this.loadRecords(true);
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: "/pages/profile/index" });
  },

  retry() {
    this.loadRecords(true);
  },

  loadRecords(reset) {
    if (this.data.loading) {
      wx.stopPullDownRefresh();
      return;
    }
    this.setData({ loading: true, error: reset ? "" : this.data.error });

    listMyRecords()
      .then((records) => {
        this.setData({
          reservations: normalizeReservations(records.reservations),
          signups: normalizeSignups(records.signups),
          loading: false,
          loaded: true,
          error: ""
        });
        wx.stopPullDownRefresh();
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: error && error.message ? error.message : "记录加载失败"
        });
        wx.stopPullDownRefresh();
      });
  }
});
