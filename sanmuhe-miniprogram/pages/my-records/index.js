const { listMyRecords, payReservation, cancelReservation } = require("../../utils/cloudApi");
const { displayReservationPlace } = require("../../data/store");

const CANCEL_ADVANCE_HOURS_DEFAULT = 12;

function parseMaybeDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "object" && value.seconds) {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === "object" && value.$date) {
    return new Date(value.$date);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isReservationPayable(item) {
  if (!item || item.status !== "待支付" || item.payStatus === "paid") {
    return false;
  }
  const lockedUntil = parseMaybeDate(item.lockedUntil);
  if (!lockedUntil) {
    return true;
  }
  return lockedUntil.getTime() > Date.now();
}

function getReservationStartMs(item) {
  const day = String((item && item.day) || "").trim();
  const time = String((item && item.time) || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{1,2}:\d{2}$/.test(time)) {
    return NaN;
  }
  const start = new Date(`${day}T${time.padStart(5, "0")}:00+08:00`);
  return start.getTime();
}

function isReservationCancelable(item, advanceHours) {
  if (!item) {
    return false;
  }
  const hours = Math.max(1, Number(advanceHours) || CANCEL_ADVANCE_HOURS_DEFAULT);
  const status = item.status || "";
  if (status === "已取消" || status === "未到店" || status === "已完成") {
    return false;
  }
  if (status === "待支付") {
    return true;
  }
  if (status === "已确认" || item.payStatus === "paid") {
    const startMs = getReservationStartMs(item);
    if (!Number.isFinite(startMs)) {
      return false;
    }
    return startMs - Date.now() >= hours * 60 * 60 * 1000;
  }
  return false;
}

function reservationCancelHint(item, advanceHours) {
  const hours = Math.max(1, Number(advanceHours) || CANCEL_ADVANCE_HOURS_DEFAULT);
  if (!item || item.status === "已取消") {
    return "";
  }
  if (item.status === "待支付") {
    return "未支付可随时取消";
  }
  if (item.status === "已确认" || item.payStatus === "paid") {
    if (isReservationCancelable(item, hours)) {
      return `可取消（须提前 ${hours} 小时）`;
    }
    return `距开场不足 ${hours} 小时，请联系门店`;
  }
  return "";
}

const tabs = [
  { key: "reservation", label: "我的预约" },
  { key: "event", label: "我的活动" }
];

function validTab(value) {
  return tabs.some((item) => item.key === value) ? value : "reservation";
}

function normalizeReservations(records, advanceHours) {
  const hours = Math.max(1, Number(advanceHours) || CANCEL_ADVANCE_HOURS_DEFAULT);
  return (records || []).map((item) => {
    const timeRange = item.endTime ? `${item.time || ""}–${item.endTime}` : (item.time || "");
    const status = item.status || "待确认";
    const payStatus = item.payStatus || "";
    let statusLabel = status;
    if (status === "已取消" && (payStatus === "refunding" || payStatus === "refunded" || payStatus === "partial_refunded")) {
      statusLabel = payStatus === "refunded"
        ? "已取消·已退款"
        : payStatus === "partial_refunded"
          ? "已取消·部分退款"
          : "已取消·退款中";
    } else if (status === "待支付") {
      statusLabel = "待支付";
    } else if (status === "已完成" && payStatus === "partial_refunded") {
      statusLabel = "已完成·部分退款";
    } else if (status === "已完成" && payStatus === "refunded") {
      statusLabel = "已完成·已退款";
    }
    const price = Number(item.total != null ? item.total : item.price) || 0;
    return Object.assign({}, item, {
      id: item.id || item._id,
      title: displayReservationPlace(item),
      meta: item.day && timeRange ? `${item.day} ${timeRange}` : (item.day || ""),
      subMeta: `${item.people || 1} 位 · ${item.phone || ""}${price > 0 ? ` · ¥${price}` : ""}`,
      image: item.image || "/assets/images/reservation-hero.jpg",
      status: statusLabel,
      rawStatus: status,
      payStatus,
      payable: isReservationPayable(item),
      cancelable: isReservationCancelable(item, hours),
      cancelHint: reservationCancelHint(item, hours)
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
    error: "",
    cancelAdvanceHours: CANCEL_ADVANCE_HOURS_DEFAULT
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
      const isUserCancel = error && error.raw && (error.raw.errCode === -2 || /cancel|取消/i.test(error.raw.errMsg || error.message || ""));
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

  cancelReservation(event) {
    const id = event.currentTarget.dataset.id;
    const reservation = this.data.reservations.find((item) => item.id === id);
    if (!reservation) {
      wx.showToast({ title: "预约不存在", icon: "none" });
      return;
    }
    const advanceHours = this.data.cancelAdvanceHours || CANCEL_ADVANCE_HOURS_DEFAULT;
    if (!reservation.cancelable) {
      wx.showModal({
        title: "暂不可取消",
        content: reservation.cancelHint || `已支付预约须提前 ${advanceHours} 小时取消，或联系门店处理。`,
        showCancel: false
      });
      return;
    }

    const isPaid = reservation.rawStatus === "已确认" || reservation.payStatus === "paid";
    const content = isPaid
      ? `确认取消该预约？费用将原路退回（通常 1–3 个工作日）。须至少提前 ${advanceHours} 小时。`
      : "确认取消该待支付预约？取消后时段将释放。";

    wx.showModal({
      title: "取消预约",
      content,
      confirmText: "确认取消",
      confirmColor: "#8b4a3a",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        wx.showLoading({ title: "取消中", mask: true });
        cancelReservation({
          reservationId: reservation.id || reservation._id,
          reservationNo: reservation.reservationNo
        }).then((result) => {
          wx.hideLoading();
          if (!result || result.ok === false) {
            wx.showModal({
              title: "无法取消",
              content: (result && result.message) || "取消失败，请稍后重试或联系门店",
              showCancel: false
            });
            this.loadRecords(true);
            return;
          }
          wx.showModal({
            title: "已取消",
            content: result.message || (isPaid ? "预约已取消，退款处理中" : "预约已取消"),
            showCancel: false
          });
          this.loadRecords(true);
        }).catch((error) => {
          wx.hideLoading();
          wx.showModal({
            title: "取消失败",
            content: (error && error.message) || "请稍后重试",
            showCancel: false
          });
        });
      }
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
        const advanceHours = Math.max(
          1,
          Number(records && records.cancelAdvanceHours) || this.data.cancelAdvanceHours || CANCEL_ADVANCE_HOURS_DEFAULT
        );
        this.setData({
          cancelAdvanceHours: advanceHours,
          reservations: normalizeReservations(records.reservations, advanceHours),
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
