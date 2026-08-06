/**
 * 禾煦门店主数据（Single-store first）
 *
 * 产品当前只有一家实体店。预约、联系、首页茶室入口都应消费这里，
 * 而不是各自硬编码，更不要用多店演示名（观山/听雨…）冒充门店。
 *
 * 以后若开分店：mode 改为 multi，并按 storeId 扩展列表即可。
 */

const STORE_MODE = "single";

const store = {
  id: "store-hexi",
  name: "禾煦茶书房",
  city: "佛山・禅城",
  address: "佛山市禅城区石湾镇街道怡翠宏璟P9铺禾煦茶书房",
  shortAddress: "石湾镇街道怡翠宏璟P9铺禾煦茶书房",
  phone: "18038768716",
  wechat: "smhmy716",
  businessHours: "周一～周日 9:00～21:30",
  heroImage: "/assets/images/reservation-hero.jpg"
};

/** 本店可预约茶席（单店阶段与门店同一展示名） */
const teaRoom = {
  id: "room-001",
  storeId: store.id,
  name: store.name,
  capacity: "6人以内",
  priceFrom: 188,
  floor: "满 2 小时起 ｜ 半小时加时 ｜ 6 位以内",
  features: ["满 2 小时起", "半小时加时", "6 位以内"],
  image: store.heroImage,
  color: "#5a844c",
  status: "可预定"
};

/**
 * 预约规则
 * - 半小时一格，顾客点「开始」再点「结束」
 * - 无论是否用满，至少锁定 2 小时（归顾客）
 * - 计费：前 2 小时按场次基础价，之后每 30 分钟加价
 */
const booking = {
  slotStepMinutes: 30,
  minDurationMinutes: 120,
  maxPeople: 6,
  /** 营业可约窗口（结束时刻为最晚离席） */
  openTime: "10:00",
  closeTime: "21:30",
  giftTea: {
    cups: 2,
    valueYuan: 78,
    copy: "含赠 2 泡茶（价值 ¥78）"
  },
  /**
   * 价带：以开始时刻落入的价带计基础价
   * basePrice = 满 2 小时
   * halfHourPrice = 超出后每 30 分钟
   */
  periods: [
    { id: "day", label: "日间", start: "10:00", end: "19:30", basePrice: 188, halfHourPrice: 30 },
    { id: "evening", label: "晚间", start: "19:30", end: "21:30", basePrice: 208, halfHourPrice: 30 }
  ]
};

function toMinutes(hhmm) {
  const parts = String(hhmm || "").split(":");
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return NaN;
  }
  return hour * 60 + minute;
}

function fromMinutes(total) {
  const safe = Math.max(0, Number(total) || 0);
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isHalfHourAligned(hhmm) {
  const mins = toMinutes(hhmm);
  if (!Number.isFinite(mins)) {
    return false;
  }
  return mins % booking.slotStepMinutes === 0;
}

function getPeriodForStart(startTime) {
  const startMins = toMinutes(startTime);
  if (!Number.isFinite(startMins)) {
    return booking.periods[0];
  }
  // 从后往前：命中晚间起点则归晚间
  for (let i = booking.periods.length - 1; i >= 0; i -= 1) {
    const period = booking.periods[i];
    if (startMins >= toMinutes(period.start)) {
      return period;
    }
  }
  return booking.periods[0];
}

/**
 * 生成半小时时间点列表（含 open，含 close 作为可选结束点）
 */
function buildSlotTimes() {
  const open = toMinutes(booking.openTime);
  const close = toMinutes(booking.closeTime);
  const step = booking.slotStepMinutes;
  const times = [];
  for (let m = open; m <= close; m += step) {
    times.push(fromMinutes(m));
  }
  return times;
}

/**
 * 计费：满 2 小时基础价 + 每超出 30 分钟加价
 * @returns {{ ok, price, basePrice, extraHalfHours, halfHourPrice, durationMinutes, period, periodLabel, feeLabel } | { ok:false, message }}
 */
function calculateReservationPrice(startTime, endTime) {
  const startMins = toMinutes(startTime);
  const endMins = toMinutes(endTime);
  if (!Number.isFinite(startMins) || !Number.isFinite(endMins)) {
    return { ok: false, message: "请选择开始与结束时间" };
  }
  if (!isHalfHourAligned(startTime) || !isHalfHourAligned(endTime)) {
    return { ok: false, message: "时间需按半小时选择" };
  }
  if (endMins <= startMins) {
    return { ok: false, message: "结束时间需晚于开始时间" };
  }

  const durationMinutes = endMins - startMins;
  if (durationMinutes < booking.minDurationMinutes) {
    return {
      ok: false,
      message: `每场至少预订 ${booking.minDurationMinutes / 60} 小时（无论是否用满均归您）`
    };
  }

  const open = toMinutes(booking.openTime);
  const close = toMinutes(booking.closeTime);
  if (startMins < open || endMins > close) {
    return { ok: false, message: "所选时间不在可预约营业时段内" };
  }

  const period = getPeriodForStart(startTime);
  const extraMinutes = durationMinutes - booking.minDurationMinutes;
  const extraHalfHours = Math.round(extraMinutes / booking.slotStepMinutes);
  const halfHourPrice = Number(period.halfHourPrice) || 0;
  const basePrice = Number(period.basePrice) || 0;
  const price = basePrice + extraHalfHours * halfHourPrice;

  const hours = durationMinutes / 60;
  const hoursLabel = Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);
  let feeLabel = `${period.label} · ${hoursLabel} 小时`;
  if (extraHalfHours > 0) {
    feeLabel += ` · 基础¥${basePrice}+加时¥${extraHalfHours * halfHourPrice}`;
  } else {
    feeLabel += ` · 满 2 小时`;
  }

  return {
    ok: true,
    price,
    basePrice,
    extraHalfHours,
    halfHourPrice,
    durationMinutes,
    period: period.id,
    periodLabel: period.label,
    feeLabel,
    selectedSlotLabel: `${startTime}–${endTime}`
  };
}

function getStore() {
  return store;
}

function getTeaRoom() {
  return Object.assign({}, teaRoom, {
    displayName: teaRoom.name,
    city: store.city,
    address: store.shortAddress || store.address
  });
}

/** 兼容旧 catalog.rooms 消费方：始终返回本店茶席列表 */
function getRooms() {
  const room = getTeaRoom();
  return [Object.assign({}, room)];
}

function getBookingPolicy() {
  return booking;
}

function isSingleStore() {
  return STORE_MODE === "single";
}

/**
 * 列表展示用：单店模式下统一出门店名；
 * 多店模式再用记录里的 storeName / room。
 */
function displayReservationPlace(record = {}) {
  if (isSingleStore()) {
    return store.name;
  }
  return record.storeName || record.room || store.name;
}

module.exports = {
  STORE_MODE,
  store,
  teaRoom,
  booking,
  getStore,
  getTeaRoom,
  getRooms,
  getBookingPolicy,
  isSingleStore,
  displayReservationPlace,
  toMinutes,
  fromMinutes,
  pad2,
  isHalfHourAligned,
  getPeriodForStart,
  buildSlotTimes,
  calculateReservationPrice
};
