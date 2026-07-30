const { listMyRecords, payReservation } = require("../../utils/cloudApi");
const { displayReservationPlace } = require("../../data/store");

function isReservationPayable(item) {
  if (!item || item.status !== "待支付" || item.payStatus === "paid") {
    return false;
  }
  const lockedUntil = item.lockedUntil;
  if (!lockedUntil) {
    return true;
  }
  let time = lockedUntil;
  if (typeof lockedUntil === "object" && lockedUntil.seconds) {
    time = new Date(lockedUntil.seconds * 1000);
  } else if (typeof lockedUntil === "object" && lockedUntil.$date) {
    time = new Date(lockedUntil.$date);
  }
  const date = time instanceof Date ? time : new Date(time);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

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
    const status = item.status || "待确认";
    const statusLabel = status === "待支付" ? "待支付" : status;
    return Object.assign({}, item, {
      id: item.id || item._id,
      title: displayReservationPlace(item),
      meta: item.day && timeRange ? `${item.day} ${timeRange}` : (item.day || ""),
      subMeta: `${item.people || 1} 位 · ${item.phone || ""}`,
      image: item.image || "/assets/images/reservation-hero.jpg",
      status: statusLabel,
      payStatus: item.payStatus || "",
      payable: isReservationPayable(item)
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

  payReservation(event) {
    const id = event.currentTarget.dataset.id;
    const reservation = this.data.reservations.find((item) => item.id === id);
    if (!reservation || !reservation.payable) {
      wx.showToast({ title: "该预约不可支付", icon: "none" });
      return;
    }
    payReservation(reservation).then(() => {
      wx.showToast({ title: "支付成功", icon: "success" });
      this.needsRefresh = true;
      this.loadRecords(true);
    }).catch((error) => {
      const isUserCancel = error && error.raw && (error.raw.errCode === -2 || /cancel|fail/.test(error.raw.errMsg || ""));
      wx.showModal({
        title: isUserCancel ? "支付未完成" : "支付失败",
        content: isUserCancel
          ? "您取消了支付，请在 15 分钟内完成支付，逾期将自动取消预约。"
          : (error && error.message ? error.message : "支付失败，请稍后重试"),
        showCancel: false
      });
      this.loadRecords(true);
    });
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
