const {
  getStore,
  getTeaRoom,
  getBookingPolicy,
  buildSlotTimes,
  calculateReservationPrice,
  toMinutes
} = require("../../data/store");
const { createReservation, payReservation, getCatalog, listReservedSlots } = require("../../utils/cloudApi");
const { getBookingDays } = require("../../utils/date");
const { withPrivacy } = require("../../utils/privacy");

const CONTACT_KEY = "sanmuhe_contact";
const STORE = getStore();
const TEA_ROOM = getTeaRoom();
const BOOKING = getBookingPolicy();
const MAX_PEOPLE = BOOKING.maxPeople;
const MIN_DURATION = BOOKING.minDurationMinutes;
const SLOT_STEP = BOOKING.slotStepMinutes;
const ALL_SLOT_TIMES = buildSlotTimes();

function getDayText(days, value) {
  const day = days.find((item) => item.value === value);
  return day ? `${day.display} ${day.label}` : value;
}

function decorateDays(days) {
  return days.map((item) => Object.assign({}, item, {
    slashDisplay: item.display.replace(".", "/")
  }));
}

/** 页面展示的茶席：永远锚定本店主数据；仅同步云端营业状态 */
function resolveTeaRoom(remoteRoom) {
  const base = getTeaRoom();
  if (!remoteRoom) {
    return base;
  }
  return Object.assign({}, base, {
    status: remoteRoom.status || base.status,
    image: remoteRoom.image || base.image
  });
}

function isSlotReserved(startTime, endTime, reservedSlots) {
  const startMins = toMinutes(startTime);
  const endMins = endTime ? toMinutes(endTime) : startMins + MIN_DURATION;
  if (!(startMins < endMins)) {
    return false;
  }
  return (reservedSlots || []).some((slot) => {
    const s = toMinutes(slot.time);
    const e = slot.endTime ? toMinutes(slot.endTime) : s + (slot.durationMinutes || MIN_DURATION);
    if (!(s < e)) {
      return false;
    }
    return startMins < e && endMins > s;
  });
}

/** 点位自身是否落在已约区间内（用于格子灰显） */
function isPointCovered(time, reservedSlots) {
  const point = toMinutes(time);
  if (!Number.isFinite(point)) {
    return false;
  }
  return (reservedSlots || []).some((slot) => {
    const s = toMinutes(slot.time);
    const e = slot.endTime ? toMinutes(slot.endTime) : s + (slot.durationMinutes || MIN_DURATION);
    // 左闭右开：结束点本身可作下一场开始
    return Number.isFinite(s) && Number.isFinite(e) && point >= s && point < e;
  });
}

function rangeHasBusy(startTime, endTime, reservedSlots) {
  return isSlotReserved(startTime, endTime, reservedSlots);
}

function emptySelection() {
  return {
    selectedTime: "",
    selectedEnd: "",
    selectedPrice: 0,
    selectedPeriod: "",
    selectedPeriodLabel: "",
    selectedSlotLabel: "",
    feeLabel: "",
    durationMinutes: 0,
    durationHoursLabel: "",
    priceReady: false
  };
}

function applyQuote(startTime, endTime) {
  if (!startTime || !endTime) {
    return emptySelection();
  }
  const quote = calculateReservationPrice(startTime, endTime);
  if (!quote.ok) {
    return Object.assign(emptySelection(), {
      selectedTime: startTime,
      selectedEnd: endTime,
      selectedSlotLabel: `${startTime}–${endTime}`,
      feeLabel: quote.message || ""
    });
  }
  const hours = quote.durationMinutes / 60;
  return {
    selectedTime: startTime,
    selectedEnd: endTime,
    selectedPrice: quote.price,
    selectedPeriod: quote.period,
    selectedPeriodLabel: quote.periodLabel,
    selectedSlotLabel: quote.selectedSlotLabel,
    feeLabel: quote.feeLabel,
    durationMinutes: quote.durationMinutes,
    durationHoursLabel: Number.isInteger(hours) ? `${hours}` : hours.toFixed(1),
    priceReady: true
  };
}

/**
 * 构建展示格子：每格是一个半小时「时刻」
 * 状态：past | busy | free | start | end | in-range
 */
function buildSlotCells(reservedSlots, startTime, endTime, now = new Date()) {
  const startMins = startTime ? toMinutes(startTime) : null;
  const endMins = endTime ? toMinutes(endTime) : null;

  return ALL_SLOT_TIMES.map((time) => {
    const mins = toMinutes(time);
    let status = "free";
    let tag = "";

    if (isPointCovered(time, reservedSlots)) {
      status = "busy";
      tag = "已约";
    }

    if (startMins !== null && mins === startMins) {
      status = "start";
      tag = "开始";
    } else if (endMins !== null && mins === endMins) {
      status = "end";
      tag = "结束";
    } else if (
      startMins !== null &&
      endMins !== null &&
      mins > startMins &&
      mins < endMins &&
      status !== "busy"
    ) {
      status = "in-range";
      tag = "";
    }

    return {
      time,
      status,
      tag,
      disabled: status === "busy"
    };
  });
}

function markPastCells(cells, selectedDay, now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const todayKey = `${y}-${m}-${d}`;
  if (selectedDay !== todayKey) {
    return cells;
  }
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return cells.map((cell) => {
    if (toMinutes(cell.time) < nowMins && cell.status === "free") {
      return Object.assign({}, cell, { status: "past", tag: "", disabled: true });
    }
    if (toMinutes(cell.time) < nowMins && cell.status === "busy") {
      return Object.assign({}, cell, { status: "past-busy", tag: "已约", disabled: true });
    }
    return cell;
  });
}

Page(withPrivacy({
  data: {
    days: [],
    visibleDays: [],
    maxPeople: MAX_PEOPLE,
    minHours: MIN_DURATION / 60,
    slotStepMinutes: SLOT_STEP,
    selectedRoom: resolveTeaRoom(),
    selectedDay: "",
    selectedDayText: "",
    slotCells: [],
    reservedSlots: [],
    selectedTime: "",
    selectedEnd: "",
    selectedPrice: 0,
    selectedPeriod: "",
    selectedPeriodLabel: "",
    selectedSlotLabel: "",
    feeLabel: "",
    durationMinutes: 0,
    durationHoursLabel: "",
    priceReady: false,
    people: 2,
    name: "",
    phone: "",
    note: "",
    bookingOpen: false,
    pickMode: "start" // start | end — 提示下一步要点什么
  },

  onLoad() {
    const days = decorateDays(getBookingDays());
    const contact = wx.getStorageSync(CONTACT_KEY) || {};
    const selectedDay = days[0].value;
    const cells = markPastCells(buildSlotCells([], "", ""), selectedDay);
    this.setData({
      days,
      visibleDays: days.slice(0, 5),
      selectedDay,
      selectedDayText: getDayText(days, selectedDay),
      slotCells: cells,
      name: contact.consignee || contact.name || "",
      phone: contact.phone || ""
    });
    this.loadCatalog();
    this.loadReservedSlots(selectedDay);
  },

  refreshCells(startTime, endTime, reservedSlots) {
    const reserved = reservedSlots !== undefined ? reservedSlots : this.data.reservedSlots;
    const start = startTime !== undefined ? startTime : this.data.selectedTime;
    const end = endTime !== undefined ? endTime : this.data.selectedEnd;
    let cells = buildSlotCells(reserved, start, end);
    cells = markPastCells(cells, this.data.selectedDay);
    return cells;
  },

  loadReservedSlots(day) {
    if (!day) {
      return;
    }
    listReservedSlots({
      day,
      roomId: TEA_ROOM.id,
      storeId: STORE.id
    }).then((result) => {
      if (!result || result.ok === false) {
        return;
      }
      const reservedSlots = Array.isArray(result.slots) ? result.slots : [];
      // 换日或占用更新后，若当前选区撞约则清空
      let next = {
        reservedSlots,
        slotCells: this.refreshCells(this.data.selectedTime, this.data.selectedEnd, reservedSlots)
      };
      if (
        this.data.selectedTime &&
        this.data.selectedEnd &&
        rangeHasBusy(this.data.selectedTime, this.data.selectedEnd, reservedSlots)
      ) {
        next = Object.assign(next, emptySelection(), {
          pickMode: "start",
          slotCells: this.refreshCells("", "", reservedSlots)
        });
        wx.showToast({ title: "原选时段已不可用，请重选", icon: "none" });
      }
      this.setData(next);
    }).catch(() => {
      // 读取失败不影响选择，仅不做禁用
    });
  },

  loadCatalog() {
    getCatalog().then((catalog) => {
      const settings = catalog.settings || {};
      const remoteRoom = catalog.rooms && catalog.rooms[0] ? catalog.rooms[0] : null;
      const room = resolveTeaRoom(remoteRoom);
      if (settings.address) {
        room.address = settings.address;
      }
      if (settings.city) {
        room.city = settings.city;
      }
      if (catalog.fromCloud && (!catalog.rooms || !catalog.rooms.length)) {
        room.status = "已订满";
        room.name = "暂无可预约茶室";
        room.displayName = "暂无可预约茶室";
      }
      this.setData({ selectedRoom: room });
    });
  },

  chooseDay(event) {
    const selectedDay = event.currentTarget.dataset.value;
    this.setData(Object.assign({
      selectedDay,
      selectedDayText: getDayText(this.data.days, selectedDay),
      pickMode: "start"
    }, emptySelection(), {
      slotCells: markPastCells(buildSlotCells(this.data.reservedSlots, "", ""), selectedDay)
    }));
    this.loadReservedSlots(selectedDay);
  },

  showMoreDates() {
    this.setData({ visibleDays: this.data.days });
  },

  onTapSlot(event) {
    const time = event.currentTarget.dataset.time;
    const status = event.currentTarget.dataset.status;
    if (!time) {
      return;
    }
    if (status === "busy" || status === "past" || status === "past-busy") {
      if (status === "busy" || status === "past-busy") {
        wx.showToast({ title: "该时刻已有预约", icon: "none" });
      } else {
        wx.showToast({ title: "该时刻已过", icon: "none" });
      }
      return;
    }

    const { selectedTime, selectedEnd, reservedSlots } = this.data;

    // 再次点开始：清空重选
    if (selectedTime && time === selectedTime && !selectedEnd) {
      this.setData(Object.assign(emptySelection(), {
        pickMode: "start",
        slotCells: this.refreshCells("", "", reservedSlots)
      }));
      return;
    }

    // 已有完整选区时再点：以新点作为新的开始
    if (selectedTime && selectedEnd) {
      this.setData(Object.assign(emptySelection(), {
        pickMode: "end",
        selectedTime: time,
        selectedEnd: "",
        selectedSlotLabel: `${time} 起`,
        feeLabel: `请再选结束时间（至少满 ${MIN_DURATION / 60} 小时）`,
        slotCells: this.refreshCells(time, "", reservedSlots)
      }));
      return;
    }

    // 选开始
    if (!selectedTime) {
      this.setData({
        selectedTime: time,
        selectedEnd: "",
        selectedSlotLabel: `${time} 起`,
        feeLabel: `请再选结束时间（至少满 ${MIN_DURATION / 60} 小时）`,
        priceReady: false,
        selectedPrice: 0,
        pickMode: "end",
        slotCells: this.refreshCells(time, "", reservedSlots)
      });
      return;
    }

    // 选结束
    const startMins = toMinutes(selectedTime);
    const endMins = toMinutes(time);

    if (endMins <= startMins) {
      // 点在开始之前：改把该点当作新的开始
      this.setData({
        selectedTime: time,
        selectedEnd: "",
        selectedSlotLabel: `${time} 起`,
        feeLabel: `请再选结束时间（至少满 ${MIN_DURATION / 60} 小时）`,
        priceReady: false,
        selectedPrice: 0,
        pickMode: "end",
        slotCells: this.refreshCells(time, "", reservedSlots)
      });
      return;
    }

    const duration = endMins - startMins;
    if (duration < MIN_DURATION) {
      wx.showToast({
        title: `至少预订 ${MIN_DURATION / 60} 小时`,
        icon: "none"
      });
      return;
    }

    if (rangeHasBusy(selectedTime, time, reservedSlots)) {
      wx.showToast({ title: "所选区间内已有预约", icon: "none" });
      return;
    }

    const quote = applyQuote(selectedTime, time);
    if (!quote.priceReady) {
      wx.showToast({ title: quote.feeLabel || "无法计价", icon: "none" });
      return;
    }

    this.setData(Object.assign({
      pickMode: "done",
      slotCells: this.refreshCells(selectedTime, time, reservedSlots)
    }, quote));
  },

  openBooking() {
    if (this.data.selectedRoom.status === "已订满") {
      wx.showToast({ title: "该茶室已订满", icon: "none" });
      return;
    }
    if (!this.data.priceReady || !this.data.selectedTime || !this.data.selectedEnd) {
      wx.showToast({
        title: this.data.selectedTime
          ? `请再选结束时间（满 ${MIN_DURATION / 60} 小时）`
          : "请先选择开始时间",
        icon: "none"
      });
      return;
    }
    if (rangeHasBusy(this.data.selectedTime, this.data.selectedEnd, this.data.reservedSlots)) {
      wx.showToast({ title: "该时段已被预约，请重选", icon: "none" });
      this.loadReservedSlots(this.data.selectedDay);
      return;
    }
    this.setData({ bookingOpen: true });
  },

  closeBooking() {
    this.setData({ bookingOpen: false });
  },

  noop() {},

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: "/pages/index/index" });
  },

  setPeople(event) {
    const next = this.data.people + Number(event.currentTarget.dataset.step);
    this.setData({ people: Math.max(1, Math.min(MAX_PEOPLE, next)) });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
  },

  submitReservation() {
    const {
      selectedDay,
      selectedTime,
      selectedEnd,
      selectedPeriod,
      selectedPeriodLabel,
      people,
      name,
      phone,
      note
    } = this.data;

    if (!name || !phone) {
      wx.showToast({ title: "请填写联系人", icon: "none" });
      return;
    }
    if (!/^1\d{10}$/.test(String(phone).trim())) {
      wx.showToast({ title: "请填写 11 位手机号", icon: "none" });
      return;
    }
    if (people > MAX_PEOPLE) {
      wx.showToast({ title: `每场限 ${MAX_PEOPLE} 位以内`, icon: "none" });
      return;
    }

    const quote = calculateReservationPrice(selectedTime, selectedEnd);
    if (!quote.ok) {
      wx.showToast({ title: quote.message || "请重新选择时段", icon: "none" });
      return;
    }
    if (rangeHasBusy(selectedTime, selectedEnd, this.data.reservedSlots)) {
      wx.showToast({ title: "该时段已被预约，请重新选择", icon: "none" });
      this.loadReservedSlots(selectedDay);
      return;
    }

    const payload = {
      storeId: STORE.id,
      roomId: TEA_ROOM.id,
      day: selectedDay,
      time: selectedTime,
      endTime: selectedEnd,
      period: selectedPeriod || quote.period,
      periodLabel: selectedPeriodLabel || quote.periodLabel,
      price: quote.price,
      durationMinutes: quote.durationMinutes,
      people,
      name,
      phone,
      note
    };

    this.requestPrivacy("我们需要收集预约联系人、手机号、到店人数、预约日期时段和备注，用于门店确认茶室预约和后续服务联系。").then((accepted) => {
      if (!accepted) {
        return;
      }
      wx.setStorageSync(CONTACT_KEY, {
        consignee: name,
        phone,
        address: (wx.getStorageSync(CONTACT_KEY) || {}).address || ""
      });
      createReservation(payload).then((result) => {
        if (result && result.ok === false) {
          wx.showToast({ title: result.message || "预约失败", icon: "none" });
          if (/时段|冲突|重叠|预约/.test(result.message || "")) {
            this.loadReservedSlots(selectedDay);
          }
          return;
        }
        if (result && result.status === "待支付" && result.needPayment !== false) {
          this.handleReservationPayment(result);
          return;
        }
        wx.showModal({
          title: "预约已提交",
          content: "门店确认后可通过服务通知或电话联系顾客。",
          showCancel: false,
          success: () => {
            this.setData({ bookingOpen: false });
            wx.switchTab({ url: "/pages/profile/index" });
          }
        });
      }).catch(() => {
        wx.showModal({
          title: "预约未提交",
          content: "预约服务暂时繁忙，请稍后重试。本次预约尚未提交成功。",
          showCancel: false
        });
      });
    });
  },

  handleReservationPayment(reservation) {
    payReservation(reservation).then(() => {
      wx.showModal({
        title: "预约已确认",
        content: "支付成功，茶室预约已确认。",
        showCancel: false,
        success: () => {
          this.setData({ bookingOpen: false });
          wx.navigateTo({ url: "/pages/my-records/index?tab=reservation" });
        }
      });
    }).catch((error) => {
      const isUserCancel = error && error.raw && (error.raw.errCode === -2 || /cancel|fail/.test(error.raw.errMsg || ""));
      wx.showModal({
        title: isUserCancel ? "支付未完成" : "支付失败",
        content: isUserCancel
          ? "您取消了支付，请在 15 分钟内完成支付，逾期将自动取消预约。"
          : (error && error.message ? error.message : "支付失败，请稍后重试"),
        showCancel: false,
        success: () => {
          this.setData({ bookingOpen: false });
          wx.navigateTo({ url: "/pages/my-records/index?tab=reservation" });
        }
      });
    });
  }
}));
