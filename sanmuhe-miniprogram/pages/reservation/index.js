const {
  getStore,
  getTeaRoom,
  getBookingPolicy,
  bookingPolicyFromSettings,
  buildSlotTimes,
  calculateReservationPrice,
  toMinutes
} = require("../../data/store");
const { createReservation, payReservation, getCatalog, getMemberCenter, listReservedSlots, resolvePhoneNumber } = require("../../utils/cloudApi");
const { resolveCloudImage } = require("../../config/assets");
const { getBookingDays } = require("../../utils/date");
const { withPrivacy } = require("../../utils/privacy");

const CONTACT_KEY = "sanmuhe_contact";
const LOCAL_FALLBACK_STORE = getStore();
const LOCAL_FALLBACK_ROOM = getTeaRoom();
/** 运行时策略：默认本地，loadCatalog 后被 store_settings 覆盖 */
let activePolicy = getBookingPolicy();
let allSlotTimes = buildSlotTimes(activePolicy);

function policyMaxPeople() {
  return Math.max(1, Number(activePolicy.maxPeople) || 6);
}
function policyMinDuration() {
  return Math.max(30, Number(activePolicy.minDurationMinutes) || 120);
}
function policySlotStep() {
  return Math.max(15, Number(activePolicy.slotStepMinutes) || 30);
}
function setActivePolicy(policy) {
  activePolicy = policy || getBookingPolicy();
  allSlotTimes = buildSlotTimes(activePolicy);
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

function formatFen(value) {
  return (Math.max(0, Math.round(Number(value) || 0)) / 100).toFixed(2);
}

/**
 * 把后台 rooms 文档映射为预约页展示结构。
 * 名称/容量/图片/状态以后台为准；地址/城市可来自 store_settings。
 */
function mapCatalogRoom(item, settings = {}) {
  if (!item) return null;
  const name = String(item.name || item.title || "").trim() || "茶室";
  const features = Array.isArray(item.features)
    ? item.features.map((f) => String(f || "").trim()).filter(Boolean)
    : String(item.floor || "")
      .split(/[｜|·,/，]/)
      .map((s) => s.trim())
      .filter(Boolean);
  const capacityText = String(item.capacity || "").trim();
  const maxPeopleMatch = capacityText.match(/(\d+)\s*人/);
  const maxPeople = maxPeopleMatch
    ? Math.max(1, Number(maxPeopleMatch[1]) || policyMaxPeople())
    : policyMaxPeople();
  const unavailable = item.visible === false
    || item.removed === true
    || /订满|暂停|下架|不可/.test(String(item.status || ""));

  return {
    id: String(item.id || "").trim(),
    storeId: String(item.storeId || settings.storeId || LOCAL_FALLBACK_STORE.id || "").trim(),
    name,
    displayName: name,
    capacity: capacityText || `${maxPeople}人以内`,
    maxPeople,
    floor: String(item.floor || "").trim(),
    features: features.length ? features.slice(0, 4) : ["满 2 小时起", "半小时加时"],
    image: resolveCloudImage(item.image || item.thumb, LOCAL_FALLBACK_ROOM.image),
    price: Number(item.price) || 0,
    status: String(item.status || (unavailable ? "已订满" : "可预定")).trim() || "可预定",
    available: !unavailable,
    city: String(settings.city || item.city || LOCAL_FALLBACK_STORE.city || "").trim(),
    address: String(settings.address || item.place || item.address || LOCAL_FALLBACK_STORE.address || "").trim()
  };
}

function placeholderRoom(label, settings = {}) {
  return {
    id: "",
    storeId: String(settings.storeId || LOCAL_FALLBACK_STORE.id || "").trim(),
    name: label,
    displayName: label,
    capacity: "",
    maxPeople: policyMaxPeople(),
    floor: "",
    features: [],
    image: "/assets/images/reservation-hero.jpg",
    price: 0,
    status: "暂不可约",
    available: false,
    city: String(settings.city || LOCAL_FALLBACK_STORE.city || "").trim(),
    address: String(settings.address || LOCAL_FALLBACK_STORE.address || "").trim()
  };
}

function isSlotReserved(startTime, endTime, reservedSlots) {
  const startMins = toMinutes(startTime);
  const endMins = endTime ? toMinutes(endTime) : startMins + policyMinDuration();
  if (!(startMins < endMins)) {
    return false;
  }
  return (reservedSlots || []).some((slot) => {
    const s = toMinutes(slot.time);
    const e = slot.endTime ? toMinutes(slot.endTime) : s + (slot.durationMinutes || policyMinDuration());
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
    const e = slot.endTime ? toMinutes(slot.endTime) : s + (slot.durationMinutes || policyMinDuration());
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
  const quote = calculateReservationPrice(startTime, endTime, activePolicy);
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

  return allSlotTimes.map((time) => {
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
    maxPeople: policyMaxPeople(),
    minHours: policyMinDuration() / 60,
    slotStepMinutes: policySlotStep(),
    giftTeaCopy: (activePolicy.giftTea && activePolicy.giftTea.copy) || "",
    dayBasePrice: (activePolicy.periods && activePolicy.periods[0] && activePolicy.periods[0].basePrice) || 188,
    rooms: [],
    selectedRoomId: "",
    selectedRoom: placeholderRoom("茶室加载中"),
    roomPerks: [],
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
    phoneResolving: false,
    isMember: false,
    walletBalance: "0.00",
    walletBalanceFen: 0,
    balanceAvailable: false,
    payMode: "wechat",
    showManualPhone: false,
    bookingOpen: false,
    pickMode: "start", // start | end — 提示下一步要点什么
    lockMinutes: 15,
    cancelAdvanceHours: 12
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
    this.loadMemberPayment();
    this.loadReservedSlots(selectedDay);
  },

  loadMemberPayment() {
    getMemberCenter().then((result) => {
      const isMember = Boolean(result && result.member && result.member.isMember);
      const walletBalanceFen = Math.max(0, Number(result && result.wallet && result.wallet.balanceFen) || 0);
      const balanceAvailable = isMember && walletBalanceFen >= Math.round(Number(this.data.selectedPrice || 0) * 100);
      this.setData({
        isMember,
        walletBalance: result && result.wallet && result.wallet.balance || formatFen(walletBalanceFen),
        walletBalanceFen,
        balanceAvailable
      });
    }).catch(() => {
      this.setData({ isMember: false, walletBalance: "0.00", walletBalanceFen: 0, balanceAvailable: false, payMode: "wechat" });
    });
  },

  choosePayMode(event) {
    const payMode = event.currentTarget.dataset.mode === "balance" ? "balance" : "wechat";
    if (payMode === "balance" && !this.data.balanceAvailable) {
      wx.showToast({ title: "会员余额不足", icon: "none" });
      return;
    }
    this.setData({ payMode });
  },

  refreshCells(startTime, endTime, reservedSlots) {
    const reserved = reservedSlots !== undefined ? reservedSlots : this.data.reservedSlots;
    const start = startTime !== undefined ? startTime : this.data.selectedTime;
    const end = endTime !== undefined ? endTime : this.data.selectedEnd;
    let cells = buildSlotCells(reserved, start, end);
    cells = markPastCells(cells, this.data.selectedDay);
    return cells;
  },

  currentRoomId() {
    return (this.data.selectedRoom && this.data.selectedRoom.id)
      || this.data.selectedRoomId
      || "";
  },

  currentStoreId() {
    return (this.data.selectedRoom && this.data.selectedRoom.storeId)
      || LOCAL_FALLBACK_STORE.id;
  },

  loadReservedSlots(day) {
    if (!day || !this.currentRoomId()) {
      return;
    }
    listReservedSlots({
      day,
      roomId: this.currentRoomId(),
      storeId: this.currentStoreId()
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
      // 计价规则以后台设置为准
      setActivePolicy(bookingPolicyFromSettings(settings));

      const remoteRooms = Array.isArray(catalog.rooms) ? catalog.rooms : [];
      let rooms = remoteRooms
        .map((item) => mapCatalogRoom(item, settings))
        .filter((item) => item && item.id);

      if (!rooms.length) {
        const label = catalog.source === "error" ? "茶室暂时无法加载" : "暂无可预约茶室";
        rooms = [placeholderRoom(label, settings)];
      }

      const prevId = this.data.selectedRoomId || (this.data.selectedRoom && this.data.selectedRoom.id);
      const selected = rooms.find((item) => item.id === prevId && item.available)
        || rooms.find((item) => item.available)
        || rooms[0];
      const cap = selected.maxPeople || policyMaxPeople();

      this.setData({
        rooms,
        selectedRoomId: selected.id,
        selectedRoom: selected,
        roomPerks: (selected.features || []).slice(0, 3),
        maxPeople: cap,
        minHours: policyMinDuration() / 60,
        slotStepMinutes: policySlotStep(),
        giftTeaCopy: (activePolicy.giftTea && activePolicy.giftTea.copy) || "",
        dayBasePrice: (activePolicy.periods && activePolicy.periods[0] && activePolicy.periods[0].basePrice) || 188,
        people: Math.min(this.data.people || 2, cap),
        slotCells: this.refreshCells(this.data.selectedTime, this.data.selectedEnd, this.data.reservedSlots)
      }, () => {
        if (this.data.selectedDay) {
          this.loadReservedSlots(this.data.selectedDay);
        }
      });
    });
  },

  selectRoom(event) {
    const roomId = event.currentTarget.dataset.id;
    const room = (this.data.rooms || []).find((item) => item.id === roomId);
    if (!room || !room.available) {
      wx.showToast({ title: "该茶室暂不可约", icon: "none" });
      return;
    }
    if (room.id === this.data.selectedRoomId) {
      return;
    }
    this.setData(Object.assign({
      selectedRoomId: room.id,
      selectedRoom: room,
      roomPerks: (room.features || []).slice(0, 3),
      maxPeople: room.maxPeople || policyMaxPeople(),
      people: Math.min(this.data.people || 2, room.maxPeople || policyMaxPeople()),
      pickMode: "start"
    }, emptySelection(), {
      slotCells: this.refreshCells("", "", this.data.reservedSlots)
    }));
    if (this.data.selectedDay) {
      this.loadReservedSlots(this.data.selectedDay);
    }
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
        feeLabel: `请再选结束时间（至少满 ${policyMinDuration() / 60} 小时）`,
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
        feeLabel: `请再选结束时间（至少满 ${policyMinDuration() / 60} 小时）`,
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
        feeLabel: `请再选结束时间（至少满 ${policyMinDuration() / 60} 小时）`,
        priceReady: false,
        selectedPrice: 0,
        pickMode: "end",
        slotCells: this.refreshCells(time, "", reservedSlots)
      });
      return;
    }

    const duration = endMins - startMins;
    if (duration < policyMinDuration()) {
      wx.showToast({
        title: `至少预订 ${policyMinDuration() / 60} 小时`,
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
          ? `请再选结束时间（满 ${policyMinDuration() / 60} 小时）`
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
    const balanceAvailable = this.data.isMember
      && this.data.walletBalanceFen >= Math.round(Number(this.data.selectedPrice || 0) * 100);
    this.setData({
      bookingOpen: true,
      balanceAvailable,
      payMode: this.data.payMode === "balance" && !balanceAvailable ? "wechat" : this.data.payMode
    });
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
    this.setData({ people: Math.max(1, Math.min(policyMaxPeople(), next)) });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
  },

  /** 微信手机号一键填入；输入框常显，仍可手动修改 */
  handlePhoneAuth(event) {
    if (this.data.phoneResolving) {
      return;
    }
    const detail = (event && event.detail) || {};
    const phoneCode = detail.code;
    if (!phoneCode) {
      wx.showToast({ title: "请手动填写手机号", icon: "none" });
      return;
    }
    this.setData({ phoneResolving: true });
    resolvePhoneNumber(phoneCode).then((result) => {
      const phone = String(result.phone || "").trim();
      this.setData({ phone, phoneResolving: false });
      if (phone) wx.showToast({ title: "手机号已填入", icon: "success" });
    }).catch(() => {
      this.setData({ phoneResolving: false });
      wx.showToast({ title: "未获取到，请手动填写", icon: "none" });
    });
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
    const room = this.data.selectedRoom || {};
    const maxPeople = Number(room.maxPeople || this.data.maxPeople || policyMaxPeople()) || policyMaxPeople();
    if (!room.id || room.available === false) {
      wx.showToast({ title: "请选择可预约茶室", icon: "none" });
      return;
    }
    if (people > maxPeople) {
      wx.showToast({ title: `每场限 ${maxPeople} 位以内`, icon: "none" });
      return;
    }

    const quote = calculateReservationPrice(selectedTime, selectedEnd, activePolicy);
    if (!quote.ok) {
      wx.showToast({ title: quote.message || "请重新选择时段", icon: "none" });
      return;
    }
    if (rangeHasBusy(selectedTime, selectedEnd, this.data.reservedSlots)) {
      wx.showToast({ title: "该时段已被预约，请重新选择", icon: "none" });
      this.loadReservedSlots(selectedDay);
      return;
    }

    let payMode = this.data.payMode === "balance" ? "balance" : "wechat";
    if (payMode === "balance" && !this.data.balanceAvailable) {
      payMode = "wechat";
    }
    const payload = {
      storeId: room.storeId || this.currentStoreId(),
      roomId: room.id,
      roomName: room.displayName || room.name,
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
        if (result && result.lockMinutes) {
          this.setData({ lockMinutes: Number(result.lockMinutes) || 15 });
        }
        if (result && result.cancelAdvanceHours) {
          this.setData({ cancelAdvanceHours: Number(result.cancelAdvanceHours) || 12 });
        }
        // 茶室预约必须在线支付后生效
        if (result && (result.status === "待支付" || result.needPayment || result.requiresPayment)) {
          this.handleReservationPayment(result, payMode);
          return;
        }
        wx.showModal({
          title: "预约已提交",
          content: "请尽快完成支付以确认预约。",
          showCancel: false,
          success: () => {
            this.setData({ bookingOpen: false });
            wx.navigateTo({ url: "/pages/my-records/index?tab=reservation" });
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

  handleReservationPayment(reservation, payMode) {
    const lockMinutes = this.data.lockMinutes || 15;
    const cancelHours = this.data.cancelAdvanceHours || 12;
    payReservation(reservation, payMode).then(() => {
      wx.showModal({
        title: "预约已确认",
        content: `支付成功，茶室预约已确认。如需取消请至少提前 ${cancelHours} 小时操作，费用将原路退回。`,
        showCancel: false,
        success: () => {
          this.setData({ bookingOpen: false });
          wx.navigateTo({ url: "/pages/my-records/index?tab=reservation" });
        }
      });
    }).catch((error) => {
      const isUserCancel = error && error.raw && (error.raw.errCode === -2 || /cancel|取消/i.test(error.raw.errMsg || error.message || ""));
      wx.showModal({
        title: isUserCancel ? "支付未完成" : "支付失败",
        content: isUserCancel
          ? `您取消了支付。请在 ${lockMinutes} 分钟内于「我的记录」完成支付，逾期将自动取消并释放时段。`
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
