const { getStore, getTeaRoom, getBookingPolicy } = require("../../data/store");
const { createReservation, payReservation, getCatalog, listReservedSlots } = require("../../utils/cloudApi");
const { getBookingDays } = require("../../utils/date");
const { withPrivacy } = require("../../utils/privacy");

const CONTACT_KEY = "sanmuhe_contact";
const STORE = getStore();
const TEA_ROOM = getTeaRoom();
const BOOKING = getBookingPolicy();
const SESSION_MINUTES = BOOKING.sessionMinutes;
const MAX_PEOPLE = BOOKING.maxPeople;
const PERIODS = BOOKING.periods;

function toMinutes(hhmm) {
  const parts = String(hhmm || "").split(":");
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return 0;
  }
  return hour * 60 + minute;
}

function fromMinutes(total) {
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function getPeriod(periodId) {
  return PERIODS.find((item) => item.id === periodId) || PERIODS[0];
}

function isSlotReserved(startTime, endTime, reservedSlots) {
  const startMins = toMinutes(startTime);
  const endMins = endTime ? toMinutes(endTime) : startMins + SESSION_MINUTES;
  if (startMins >= endMins) {
    return false;
  }
  return (reservedSlots || []).some((slot) => {
    const s = toMinutes(slot.time);
    const e = slot.endTime ? toMinutes(slot.endTime) : s + (slot.durationMinutes || SESSION_MINUTES);
    if (s >= e) {
      return false;
    }
    return startMins < e && endMins > s;
  });
}

function earliestStart(period) {
  return toMinutes(period.start);
}

function latestStart(period) {
  return toMinutes(period.end) - SESSION_MINUTES;
}

function buildHourList(period, reservedSlots) {
  const start = earliestStart(period);
  const latest = latestStart(period);
  if (latest < start) {
    return [];
  }
  const hours = [];
  for (let h = Math.floor(start / 60); h <= Math.floor(latest / 60); h += 1) {
    const hourStr = pad2(h);
    // 只要该小时内存在任意可用分钟，就保留该小时列
    const minutes = buildMinuteList(period, hourStr, reservedSlots);
    if (minutes.length) {
      hours.push(hourStr);
    }
  }
  return hours;
}

function buildMinuteList(period, hourStr, reservedSlots) {
  const hour = Number(hourStr);
  const start = earliestStart(period);
  const latest = latestStart(period);
  const minutes = [];
  for (let m = 0; m < 60; m += 1) {
    const total = hour * 60 + m;
    if (total >= start && total <= latest) {
      const time = `${pad2(hour)}:${pad2(m)}`;
      const end = fromMinutes(total + SESSION_MINUTES);
      if (!isSlotReserved(time, end, reservedSlots)) {
        minutes.push(pad2(m));
      }
    }
  }
  return minutes;
}

function buildTimePicker(periodId, preferredTime, reservedSlots) {
  const period = getPeriod(periodId);
  const hours = buildHourList(period, reservedSlots);
  if (!hours.length) {
    return {
      periodId: period.id,
      timeRange: [[], []],
      timeIndex: [0, 0],
      selectedTime: "",
      selectedEnd: "",
      selectedPeriod: period.id,
      selectedPeriodLabel: period.label,
      selectedPrice: period.price,
      selectedSlotLabel: ""
    };
  }

  let preferredHour = hours[0];
  let preferredMinute = "00";
  if (preferredTime && /^\d{1,2}:\d{2}$/.test(preferredTime)) {
    const parts = preferredTime.split(":");
    preferredHour = pad2(Number(parts[0]));
    preferredMinute = pad2(Number(parts[1]));
  }

  let hourIndex = hours.indexOf(preferredHour);
  if (hourIndex < 0) {
    hourIndex = 0;
  }
  let minutes = buildMinuteList(period, hours[hourIndex], reservedSlots);

  // 若首选小时已约满，跳到下一个有可用分钟的小时
  let fallbackHourIndex = hourIndex;
  while (!minutes.length && fallbackHourIndex < hours.length - 1) {
    fallbackHourIndex += 1;
    minutes = buildMinuteList(period, hours[fallbackHourIndex], reservedSlots);
  }
  if (minutes.length) {
    hourIndex = fallbackHourIndex;
  }

  let minuteIndex = minutes.indexOf(preferredMinute);
  if (minuteIndex < 0) {
    minuteIndex = 0;
  }

  const start = minutes.length ? `${hours[hourIndex]}:${minutes[minuteIndex]}` : "";
  const end = start ? fromMinutes(toMinutes(start) + SESSION_MINUTES) : "";
  return {
    periodId: period.id,
    timeRange: [hours, minutes],
    timeIndex: minutes.length ? [hourIndex, minuteIndex] : [0, 0],
    selectedTime: start,
    selectedEnd: end,
    selectedPeriod: period.id,
    selectedPeriodLabel: period.label,
    selectedPrice: period.price,
    selectedSlotLabel: start ? `${start}–${end}` : ""
  };
}

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
    // 仅状态可被运营侧覆盖；名称/地址以门店主数据为准
    status: remoteRoom.status || base.status,
    image: remoteRoom.image || base.image
  });
}

const defaultPicker = buildTimePicker("day", "10:00", []);

Page(withPrivacy({
  data: {
    days: [],
    visibleDays: [],
    periods: PERIODS,
    maxPeople: MAX_PEOPLE,
    selectedRoom: resolveTeaRoom(),
    selectedDay: "",
    selectedDayText: "",
    periodId: defaultPicker.periodId,
    timeRange: defaultPicker.timeRange,
    timeIndex: defaultPicker.timeIndex,
    selectedTime: defaultPicker.selectedTime,
    selectedEnd: defaultPicker.selectedEnd,
    selectedPeriod: defaultPicker.selectedPeriod,
    selectedPeriodLabel: defaultPicker.selectedPeriodLabel,
    selectedPrice: defaultPicker.selectedPrice,
    selectedSlotLabel: defaultPicker.selectedSlotLabel,
    reservedSlots: [],
    people: 2,
    name: "",
    phone: "",
    note: "",
    bookingOpen: false
  },

  onLoad() {
    const days = decorateDays(getBookingDays());
    const contact = wx.getStorageSync(CONTACT_KEY) || {};
    const selectedDay = days[0].value;
    const picker = buildTimePicker("day", "10:00");
    this.setData(Object.assign({
      days,
      visibleDays: days.slice(0, 5),
      selectedDay,
      selectedDayText: getDayText(days, selectedDay),
      name: contact.consignee || contact.name || "",
      phone: contact.phone || ""
    }, picker));
    this.loadCatalog();
    this.loadReservedSlots(selectedDay);
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
      // 用当前时段和已预约记录重建时间选择器，自动跳过被占用的时段
      const picker = buildTimePicker(this.data.periodId, this.data.selectedTime, reservedSlots);
      this.setData(Object.assign({ reservedSlots }, picker));
    }).catch(() => {
      // 读取失败不影响现有选择，仅不做禁用
    });
  },

  loadCatalog() {
    getCatalog().then((catalog) => {
      const settings = catalog.settings || {};
      const remoteRoom = catalog.rooms && catalog.rooms[0] ? catalog.rooms[0] : null;
      // settings 可补充地址等运营字段，但不改门店身份名
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

  applyPicker(periodId, preferredTime) {
    this.setData(buildTimePicker(periodId, preferredTime, this.data.reservedSlots));
  },

  choosePeriod(event) {
    const periodId = event.currentTarget.dataset.id;
    if (!periodId || periodId === this.data.periodId) {
      return;
    }
    this.applyPicker(periodId, this.data.selectedTime);
  },

  onTimeColumnChange(event) {
    const column = Number(event.detail.column);
    const row = Number(event.detail.value);
    const period = getPeriod(this.data.periodId);
    const hours = this.data.timeRange[0] || [];
    const reservedSlots = this.data.reservedSlots;
    let hourIndex = this.data.timeIndex[0] || 0;
    let minuteIndex = this.data.timeIndex[1] || 0;

    if (column === 0) {
      hourIndex = row;
      const minutes = buildMinuteList(period, hours[hourIndex], reservedSlots);
      minuteIndex = Math.min(minuteIndex, Math.max(0, minutes.length - 1));
      this.setData({
        timeRange: [hours, minutes],
        timeIndex: [hourIndex, minuteIndex]
      });
      return;
    }

    if (column === 1) {
      minuteIndex = row;
      this.setData({
        timeIndex: [hourIndex, minuteIndex]
      });
    }
  },

  onTimeChange(event) {
    const indexes = event.detail.value || [0, 0];
    const hours = this.data.timeRange[0] || [];
    const minutes = this.data.timeRange[1] || [];
    const hour = hours[indexes[0]] || hours[0];
    const minute = minutes[indexes[1]] || minutes[0];
    if (!hour || minute === undefined) {
      return;
    }
    this.applyPicker(this.data.periodId, `${hour}:${minute}`);
  },

  openBooking() {
    if (this.data.selectedRoom.status === "已订满") {
      wx.showToast({ title: "该茶室已订满", icon: "none" });
      return;
    }
    if (!this.data.selectedTime || !this.data.selectedEnd) {
      wx.showToast({ title: "请选择开始时间", icon: "none" });
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

  chooseDay(event) {
    const selectedDay = event.currentTarget.dataset.value;
    this.setData({
      selectedDay,
      selectedDayText: getDayText(this.data.days, selectedDay)
    });
    this.loadReservedSlots(selectedDay);
  },

  showMoreDates() {
    this.setData({ visibleDays: this.data.days });
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
      selectedPrice,
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
    if (!selectedTime || !selectedEnd) {
      wx.showToast({ title: "请选择开始时间", icon: "none" });
      return;
    }

    const period = getPeriod(selectedPeriod);
    const startMins = toMinutes(selectedTime);
    if (startMins < earliestStart(period) || startMins > latestStart(period)) {
      wx.showToast({ title: "该开始时间不在可预约范围内", icon: "none" });
      return;
    }
    if (isSlotReserved(selectedTime, selectedEnd, this.data.reservedSlots)) {
      wx.showToast({ title: "该时段已被预约，请重新选择", icon: "none" });
      this.loadReservedSlots(selectedDay);
      return;
    }

    // 客户端只传时段与联系人；门店身份由云函数按 store 主数据落库
    const payload = {
      storeId: STORE.id,
      roomId: TEA_ROOM.id,
      day: selectedDay,
      time: selectedTime,
      endTime: selectedEnd,
      period: selectedPeriod,
      periodLabel: selectedPeriodLabel,
      price: selectedPrice,
      durationMinutes: SESSION_MINUTES,
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
