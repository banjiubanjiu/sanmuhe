const cloud = require("wx-server-sdk");
const { sendWeComReservationNotification, sendWeComTestNotification } = require("./wecomReservationNotify");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * 服务端门店主数据（与小程序 data/store.js 对齐）
 * 预约落库以服务端为准，不信任客户端传来的店名。
 */
const CANONICAL_STORE = {
  storeId: "store-hexi",
  storeName: "禾煦茶书房",
  roomId: "room-001",
  address: "佛山市禅城区石湾镇街道怡翠宏璟P9铺禾煦茶书房",
  maxPeople: 6,
  sessionMinutes: 120
};

/** 默认预约规则（仅作兜底；运行时优先读 store_settings） */
const DEFAULT_BOOKING_POLICY = {
  slotStepMinutes: 30,
  minDurationMinutes: 120,
  maxPeople: 6,
  openTime: "10:00",
  closeTime: "21:30",
  periods: [
    { id: "day", label: "日间", start: "10:00", end: "19:30", basePrice: 188, halfHourPrice: 30 },
    { id: "evening", label: "晚间", start: "19:30", end: "21:30", basePrice: 208, halfHourPrice: 30 }
  ]
};

function cleanTimeHHMM(value, fallback) {
  const text = cleanText(value, 8);
  if (/^\d{1,2}:\d{2}$/.test(text)) {
    const [h, m] = text.split(":");
    return `${String(Number(h)).padStart(2, "0")}:${m}`;
  }
  return fallback;
}

/** 从 store_settings 归一化计价/时段策略 */
function bookingPolicyFromSettings(row = {}) {
  const half = Math.max(0, Number(row.bookingHalfHourPrice));
  const halfHourPrice = Number.isFinite(half) ? half : DEFAULT_BOOKING_POLICY.periods[0].halfHourPrice;
  const dayBase = Math.max(0, Number(row.bookingDayBasePrice));
  const eveningBase = Math.max(0, Number(row.bookingEveningBasePrice));
  return {
    slotStepMinutes: Math.max(15, Math.min(60, Number(row.bookingSlotStepMinutes) || DEFAULT_BOOKING_POLICY.slotStepMinutes)),
    minDurationMinutes: Math.max(30, Math.min(480, Number(row.bookingMinDurationMinutes) || DEFAULT_BOOKING_POLICY.minDurationMinutes)),
    maxPeople: Math.max(1, Math.min(30, Number(row.bookingMaxPeople) || DEFAULT_BOOKING_POLICY.maxPeople)),
    openTime: cleanTimeHHMM(row.bookingOpenTime, DEFAULT_BOOKING_POLICY.openTime),
    closeTime: cleanTimeHHMM(row.bookingCloseTime, DEFAULT_BOOKING_POLICY.closeTime),
    periods: [
      {
        id: "day",
        label: cleanText(row.bookingDayLabel, 20) || "日间",
        start: cleanTimeHHMM(row.bookingDayStart, "10:00"),
        end: cleanTimeHHMM(row.bookingDayEnd, "19:30"),
        basePrice: Number.isFinite(dayBase) && dayBase >= 0 ? dayBase : 188,
        halfHourPrice
      },
      {
        id: "evening",
        label: cleanText(row.bookingEveningLabel, 20) || "晚间",
        start: cleanTimeHHMM(row.bookingEveningStart, "19:30"),
        end: cleanTimeHHMM(row.bookingEveningEnd, "21:30"),
        basePrice: Number.isFinite(eveningBase) && eveningBase >= 0 ? eveningBase : 208,
        halfHourPrice
      }
    ]
  };
}

const LOCK_MINUTES_FALLBACK = Math.max(1, Number(process.env.RESERVATION_LOCK_MINUTES || process.env.ORDER_LOCK_MINUTES || 15));
/** 已支付预约：须至少提前这么多小时取消，方可退款（运行时优先读 store_settings） */
const CANCEL_ADVANCE_HOURS_FALLBACK = Math.max(1, Number(process.env.RESERVATION_CANCEL_ADVANCE_HOURS || 12));

function createReservationNo() {
  return `SMH-R${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
}

/**
 * 从 store_settings 读取预约策略：取消/锁单 + 计价时段价带
 */
async function loadBookingPolicySettings() {
  try {
    const result = await db.collection("store_settings").where({ key: "store" }).limit(1).get();
    const row = result.data && result.data[0] ? result.data[0] : null;
    const cancelAdvanceHours = Math.max(
      1,
      Math.min(168, Number(row && row.reservationCancelAdvanceHours) || CANCEL_ADVANCE_HOURS_FALLBACK)
    );
    const lockMinutes = Math.max(
      1,
      Math.min(120, Number(row && row.reservationLockMinutes) || LOCK_MINUTES_FALLBACK)
    );
    return {
      cancelAdvanceHours,
      lockMinutes,
      policy: bookingPolicyFromSettings(row || {})
    };
  } catch (error) {
    return {
      cancelAdvanceHours: CANCEL_ADVANCE_HOURS_FALLBACK,
      lockMinutes: LOCK_MINUTES_FALLBACK,
      policy: Object.assign({}, DEFAULT_BOOKING_POLICY, {
        periods: DEFAULT_BOOKING_POLICY.periods.map((p) => Object.assign({}, p))
      })
    };
  }
}

/** 兼容 wx-server-sdk：update 结果可能是 stats.updated 或 updated */
function dbUpdatedCount(result) {
  if (!result) {
    return 0;
  }
  if (result.stats && result.stats.updated != null) {
    return Number(result.stats.updated) || 0;
  }
  if (result.updated != null) {
    return Number(result.updated) || 0;
  }
  return 0;
}

/**
 * 预约开始时刻（按中国时区 Asia/Shanghai）
 * day: YYYY-MM-DD, time: HH:mm
 */
function getReservationStartMs(reservation = {}) {
  const day = cleanText(reservation.day, 20);
  const time = cleanText(reservation.time, 12);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{1,2}:\d{2}$/.test(time)) {
    return NaN;
  }
  const start = new Date(`${day}T${time.padStart(5, "0")}:00+08:00`);
  return start.getTime();
}

function isPaidReservation(reservation = {}) {
  return reservation.payStatus === "paid" || reservation.status === "已确认";
}

function isCancellableStatus(reservation = {}) {
  const status = cleanText(reservation.status, 12);
  return status === "待支付" || status === "已确认";
}

/**
 * 计算是否允许取消。
 * - 待支付：随时可取消（不退款）
 * - 已确认/已支付：须距开始时间 ≥ advanceHours 小时
 * @param {number} [advanceHours] 取消提前小时，默认环境变量兜底
 */
function evaluateCancelPolicy(reservation = {}, nowMs = Date.now(), advanceHours = CANCEL_ADVANCE_HOURS_FALLBACK) {
  const hours = Math.max(1, Number(advanceHours) || CANCEL_ADVANCE_HOURS_FALLBACK);
  if (!isCancellableStatus(reservation)) {
    return {
      ok: false,
      code: "STATUS_NOT_CANCELLABLE",
      message: `当前状态不可取消（${reservation.status || "未知"}）`
    };
  }

  const paid = isPaidReservation(reservation);
  if (!paid) {
    return {
      ok: true,
      paid: false,
      needRefund: false,
      advanceHours: hours
    };
  }

  const startMs = getReservationStartMs(reservation);
  if (!Number.isFinite(startMs)) {
    return {
      ok: false,
      code: "INVALID_START",
      message: "预约开始时间无效，请联系门店处理"
    };
  }

  const advanceMs = hours * 60 * 60 * 1000;
  const remainMs = startMs - nowMs;
  if (remainMs < advanceMs) {
    const remainHours = Math.max(0, remainMs / (60 * 60 * 1000));
    return {
      ok: false,
      code: "WITHIN_CANCEL_WINDOW",
      message: remainMs <= 0
        ? "预约已开始或已过期，无法在线取消，请联系门店"
        : `已支付预约须提前 ${hours} 小时取消。距开场约 ${remainHours.toFixed(1)} 小时，请联系门店处理`,
      advanceHours: hours,
      remainHours: Number(remainHours.toFixed(2)),
      startMs
    };
  }

  return {
    ok: true,
    paid: true,
    needRefund: true,
    advanceHours: hours,
    remainHours: Number((remainMs / (60 * 60 * 1000)).toFixed(2)),
    startMs
  };
}

function isActiveHold(record = {}, nowMs = Date.now()) {
  const status = cleanText(record.status, 12);
  // 终态 / 已履约：不占时段（异常待处理仍占档，待人工处理）
  if (
    status === "已取消" ||
    status === "cancelled" ||
    status === "未到店" ||
    status === "已完成"
  ) {
    return false;
  }
  // 支付超时未改状态的待支付单：不占位
  if (status === "待支付" && record.payStatus === "pending" && record.lockedUntil) {
    const locked = new Date(record.lockedUntil);
    if (!Number.isNaN(locked.getTime()) && locked.getTime() <= nowMs) {
      return false;
    }
  }
  return true;
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected after first setup.
  }
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function number(value) {
  return Math.max(0, Number(value) || 0);
}

function parseList(value) {
  return String(value || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

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
  const hour = Math.floor(Math.max(0, total) / 60);
  const minute = Math.max(0, total) % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isStepAligned(hhmm, stepMinutes) {
  const mins = toMinutes(hhmm);
  const step = Math.max(1, Number(stepMinutes) || 30);
  if (!Number.isFinite(mins) || mins < 0) {
    return false;
  }
  return mins % step === 0;
}

function getPeriodForStart(startTime, policy) {
  const periods = (policy && policy.periods) || DEFAULT_BOOKING_POLICY.periods;
  const startMins = toMinutes(startTime);
  for (let i = periods.length - 1; i >= 0; i -= 1) {
    const period = periods[i];
    if (startMins >= toMinutes(period.start)) {
      return period;
    }
  }
  return periods[0];
}

/**
 * 服务端重算价格，不信任客户端 price
 * 规则来自 store_settings（无配置则默认价带）
 */
function calculateReservationPrice(startTime, endTime, policyInput) {
  const policy = policyInput || DEFAULT_BOOKING_POLICY;
  const step = Math.max(1, Number(policy.slotStepMinutes) || 30);
  const minDuration = Math.max(step, Number(policy.minDurationMinutes) || 120);
  if (!startTime || !endTime) {
    return { ok: false, message: "请选择开始与结束时间" };
  }
  if (!isStepAligned(startTime, step) || !isStepAligned(endTime, step)) {
    return { ok: false, message: `时间需按 ${step} 分钟选择` };
  }
  const startMins = toMinutes(startTime);
  const endMins = toMinutes(endTime);
  if (!(endMins > startMins)) {
    return { ok: false, message: "结束时间需晚于开始时间" };
  }
  const durationMinutes = endMins - startMins;
  if (durationMinutes < minDuration) {
    return {
      ok: false,
      message: `每场至少预订 ${minDuration / 60} 小时（无论是否用满均归您）`
    };
  }
  const open = toMinutes(policy.openTime || DEFAULT_BOOKING_POLICY.openTime);
  const close = toMinutes(policy.closeTime || DEFAULT_BOOKING_POLICY.closeTime);
  if (startMins < open || endMins > close) {
    return { ok: false, message: "所选时间不在可预约营业时段内" };
  }
  const period = getPeriodForStart(startTime, policy);
  const extraSteps = Math.round((durationMinutes - minDuration) / step);
  const price = Number(period.basePrice) + extraSteps * Number(period.halfHourPrice || 0);
  return {
    ok: true,
    price,
    durationMinutes,
    period: period.id,
    periodLabel: period.label,
    basePrice: Number(period.basePrice),
    extraHalfHours: extraSteps,
    halfHourPrice: Number(period.halfHourPrice || 0)
  };
}

function resolveReservationRange(record = {}, fallbackSessionMinutes = 120) {
  const start = cleanText(record.time, 12);
  let end = cleanText(record.endTime, 12);
  const session = Math.max(30, Number(record.durationMinutes) || fallbackSessionMinutes);
  if (!end && start) {
    end = fromMinutes(toMinutes(start) + session);
  }
  return {
    start,
    end,
    startMins: toMinutes(start),
    endMins: toMinutes(end)
  };
}

function rangesOverlap(aStartMins, aEndMins, bStartMins, bEndMins) {
  // 区间左闭右开：start <= x < end
  const aStart = Number(aStartMins) || 0;
  const aEnd = Number(aEndMins) || aStart;
  const bStart = Number(bStartMins) || 0;
  const bEnd = Number(bEndMins) || bStart;
  if (aStart >= aEnd || bStart >= bEnd) {
    return false;
  }
  return aStart < bEnd && aEnd > bStart;
}

async function findConflictingReservations(day, roomId, storeId, startTime, endTime, fallbackSessionMinutes) {
  const baseQuery = {
    day,
    status: _.nin(["已取消", "cancelled", "未到店", "已完成"])
  };
  if (storeId) {
    baseQuery.storeId = storeId;
  }
  if (roomId) {
    baseQuery.roomId = roomId;
  }

  const result = await db.collection("reservations").where(baseQuery).get();
  const records = result.data || [];

  const newStartMins = toMinutes(startTime);
  const newEndMins = endTime ? toMinutes(endTime) : newStartMins + fallbackSessionMinutes;

  const nowMs = Date.now();
  return records.filter((record) => {
    if (!isActiveHold(record, nowMs)) {
      return false;
    }
    const range = resolveReservationRange(record, fallbackSessionMinutes);
    if (!range.start) {
      return false;
    }
    return rangesOverlap(newStartMins, newEndMins, range.startMins, range.endMins);
  });
}

async function listReservedSlots(day, roomId, storeId, fallbackSessionMinutes) {
  const baseQuery = {
    day,
    status: _.nin(["已取消", "cancelled", "未到店", "已完成"])
  };
  if (storeId) {
    baseQuery.storeId = storeId;
  }
  if (roomId) {
    baseQuery.roomId = roomId;
  }

  const result = await db.collection("reservations").where(baseQuery).get();
  const records = result.data || [];

  const nowMs = Date.now();
  return records
    .map((record) => {
      if (!isActiveHold(record, nowMs)) {
        return null;
      }
      const range = resolveReservationRange(record, fallbackSessionMinutes);
      if (!range.start) {
        return null;
      }
      return {
        time: range.start,
        endTime: range.end,
        durationMinutes: Math.max(30, Number(record.durationMinutes) || fallbackSessionMinutes)
      };
    })
    .filter(Boolean);
}

async function notifyCancelAdmins(reservation = {}, cancelMeta = {}) {
  const notice = {
    type: "reservation_cancelled",
    reservationId: reservation._id || reservation.reservationId || "",
    reservationNo: cleanText(reservation.reservationNo, 40),
    storeName: cleanText(reservation.storeName, 40),
    roomId: cleanText(reservation.roomId, 40),
    day: cleanText(reservation.day, 20),
    time: cleanText(reservation.time, 12),
    endTime: cleanText(reservation.endTime, 12),
    people: number(reservation.people),
    name: cleanText(reservation.name, 40),
    phone: cleanText(reservation.phone, 30),
    status: "已取消",
    payStatus: cleanText(cancelMeta.payStatus || reservation.payStatus, 20),
    refund: Boolean(cancelMeta.needRefund),
    reason: cleanText(cancelMeta.reason, 80),
    read: false,
    createdAt: db.serverDate()
  };

  try {
    await ensureCollection("admin_notices");
    await db.collection("admin_notices").add({ data: notice });
  } catch (error) {
    // best-effort
  }

  try {
    await ensureCollection("notification_logs");
    await db.collection("notification_logs").add({
      data: Object.assign({}, notice, {
        channel: "admin_notice",
        target: "admin",
        message: cancelMeta.needRefund
          ? `茶室预约 ${notice.day} ${notice.time} 用户取消，已发起退款，${notice.name} ${notice.phone}`
          : `茶室预约 ${notice.day} ${notice.time} 用户取消（未支付），${notice.name} ${notice.phone}`
      })
    });
  } catch (error) {
    // best-effort
  }
}

async function requestReservationRefund(reservation, reason) {
  try {
    const result = await cloud.callFunction({
      name: "createPayment",
      data: {
        action: "refundReservation",
        reservationId: reservation._id,
        reservationNo: reservation.reservationNo,
        reason: reason || "用户取消预约"
      }
    });
    const body = result && result.result ? result.result : result;
    if (!body || body.ok === false) {
      return {
        ok: false,
        message: (body && body.message) || "退款发起失败"
      };
    }
    return Object.assign({ ok: true }, body);
  } catch (error) {
    return {
      ok: false,
      message: (error && error.message) || "退款调用失败"
    };
  }
}

async function cancelReservation(event, openid) {
  if (!openid) {
    return { ok: false, message: "请先登录后再取消预约" };
  }

  const reservationId = cleanText(event.reservationId || event.id, 80);
  const reservationNo = cleanText(event.reservationNo, 40);
  if (!reservationId && !reservationNo) {
    return { ok: false, message: "缺少预约编号" };
  }

  await ensureCollection("reservations");

  let reservation = null;
  if (reservationId) {
    try {
      const doc = await db.collection("reservations").doc(reservationId).get();
      if (doc.data) {
        reservation = Object.assign({ _id: reservationId }, doc.data);
      }
    } catch (error) {
      reservation = null;
    }
  }
  if (!reservation && reservationNo) {
    const result = await db.collection("reservations").where({
      reservationNo,
      _openid: openid
    }).limit(1).get();
    if (result.data && result.data[0]) {
      reservation = Object.assign({ _id: result.data[0]._id }, result.data[0]);
    }
  }

  if (!reservation) {
    return { ok: false, message: "预约不存在" };
  }
  if (reservation._openid && reservation._openid !== openid) {
    return { ok: false, message: "只能取消自己的预约" };
  }

  if (reservation.status === "已取消") {
    return {
      ok: true,
      alreadyCancelled: true,
      reservationId: reservation._id,
      status: "已取消",
      payStatus: reservation.payStatus || "",
      message: "预约已取消"
    };
  }

  const bookingPolicy = await loadBookingPolicySettings();
  const policy = evaluateCancelPolicy(reservation, Date.now(), bookingPolicy.cancelAdvanceHours);
  if (!policy.ok) {
    return {
      ok: false,
      code: policy.code,
      message: policy.message,
      advanceHours: policy.advanceHours,
      remainHours: policy.remainHours
    };
  }

  const reason = cleanText(event.reason, 80) || (policy.needRefund ? "用户取消（已支付，发起退款）" : "用户取消（未支付）");
  const nextPayStatus = policy.needRefund
    ? "refunding"
    : (reservation.payStatus === "pending" || !reservation.payStatus ? "cancelled" : reservation.payStatus);

  // 原子抢占，避免并发重复取消/退款
  const claimWhere = {
    _id: reservation._id,
    status: _.in(["待支付", "已确认"])
  };
  const claim = await db.collection("reservations").where(claimWhere).update({
    data: {
      status: "已取消",
      payStatus: nextPayStatus,
      cancellationReason: reason,
      cancelledBy: "customer",
      cancelledAt: db.serverDate(),
      cancelAdvanceHours: bookingPolicy.cancelAdvanceHours,
      updatedAt: db.serverDate()
    }
  });

  if (dbUpdatedCount(claim) <= 0) {
    const latest = await db.collection("reservations").doc(reservation._id).get();
    const latestData = latest.data || {};
    if (latestData.status === "已取消") {
      return {
        ok: true,
        alreadyCancelled: true,
        reservationId: reservation._id,
        status: "已取消",
        payStatus: latestData.payStatus || "",
        message: "预约已取消"
      };
    }
    return { ok: false, message: "取消失败，请刷新后重试" };
  }

  let refundResult = null;
  if (policy.needRefund) {
    refundResult = await requestReservationRefund(reservation, reason);
    if (!refundResult.ok) {
      // 预约已取消占位释放，但退款失败：保留 refunding 供重试/人工处理
      await db.collection("reservations").doc(reservation._id).update({
        data: {
          refundError: cleanText(refundResult.message, 300),
          refundLastAttemptAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      await notifyCancelAdmins(reservation, {
        needRefund: true,
        payStatus: "refunding",
        reason: `${reason}；退款失败：${refundResult.message || ""}`
      });
      await notifyWeCom(Object.assign({}, reservation, {
        status: "已取消",
        payStatus: "refunding",
        note: `用户取消，退款失败：${refundResult.message || "请人工处理"}`
      }));
      return {
        ok: true,
        reservationId: reservation._id,
        reservationNo: reservation.reservationNo,
        status: "已取消",
        payStatus: "refunding",
        refund: refundResult,
        message: "预约已取消，退款处理中，若金额未到账请联系门店",
        warning: refundResult.message
      };
    }
  }

  await notifyCancelAdmins(reservation, {
    needRefund: policy.needRefund,
    payStatus: policy.needRefund ? (refundResult && refundResult.refundStatus === "SUCCESS" ? "refunded" : "refunding") : nextPayStatus,
    reason
  });
  await notifyWeCom(Object.assign({}, reservation, {
    status: "已取消",
    payStatus: policy.needRefund ? "refunding" : nextPayStatus,
    note: policy.needRefund ? "用户取消，已发起退款" : "用户取消（未支付）"
  }));

  return {
    ok: true,
    reservationId: reservation._id,
    reservationNo: reservation.reservationNo,
    status: "已取消",
    payStatus: policy.needRefund
      ? (refundResult && (refundResult.payStatus || refundResult.refundStatus === "SUCCESS") ? "refunded" : "refunding")
      : nextPayStatus,
    refund: refundResult,
    advanceHours: bookingPolicy.cancelAdvanceHours,
    message: policy.needRefund
      ? "预约已取消，退款将原路返回（通常 1–3 个工作日）"
      : "预约已取消，时段已释放"
  };
}

async function notifyAdmins(reservation = {}) {
  const notice = {
    type: "reservation_created",
    reservationId: reservation.reservationId || "",
    reservationNo: cleanText(reservation.reservationNo, 40),
    storeName: cleanText(reservation.storeName, 40),
    roomId: cleanText(reservation.roomId, 40),
    day: cleanText(reservation.day, 20),
    time: cleanText(reservation.time, 12),
    endTime: cleanText(reservation.endTime, 12),
    people: number(reservation.people),
    name: cleanText(reservation.name, 40),
    phone: cleanText(reservation.phone, 30),
    note: cleanText(reservation.note, 160),
    status: cleanText(reservation.status, 12) || "待支付",
    payStatus: cleanText(reservation.payStatus, 12) || "pending",
    read: false,
    createdAt: db.serverDate()
  };

  try {
    await ensureCollection("admin_notices");
    await db.collection("admin_notices").add({ data: notice });
  } catch (error) {
    // Notice board is best-effort; reservation creation should still succeed.
  }

  try {
    await ensureCollection("notification_logs");
    await db.collection("notification_logs").add({
      data: Object.assign({}, notice, {
        channel: "admin_notice",
        target: "admin",
        message: reservation.payStatus === "paid" || reservation.status === "已确认"
          ? `茶室预约 ${notice.day} ${notice.time} 已支付确认，${notice.name} ${notice.phone}，${notice.people} 位。`
          : `茶室预约 ${notice.day} ${notice.time} 待支付，${notice.name} ${notice.phone}，${notice.people} 位，顾客需在限定时间内完成支付。`
      })
    });
  } catch (error) {
    // Logging is best-effort.
  }

  return {
    adminOpenids: parseList(process.env.ADMIN_OPENIDS).length,
    staffOpenids: parseList(process.env.STAFF_OPENIDS || process.env.ADMIN_OPENIDS).length,
    noticeWritten: true
  };
}

async function notifyWeCom(reservation = {}) {
  try {
    return await sendWeComReservationNotification(reservation);
  } catch (error) {
    console.warn(`[wecom-reservation] ${error.message || "发送失败"}`);
    return {
      ok: false,
      message: error.message || "企业微信茶室预约提醒发送失败"
    };
  }
}

async function resolveStore() {
  try {
    await ensureCollection("store_settings");
    const result = await db.collection("store_settings").where({ key: "store" }).limit(1).get();
    const row = result.data && result.data[0];
    if (row) {
      return {
        storeId: cleanText(row.storeId || row.id || CANONICAL_STORE.storeId, 40) || CANONICAL_STORE.storeId,
        storeName: cleanText(row.storeName || row.name || CANONICAL_STORE.storeName, 40) || CANONICAL_STORE.storeName,
        roomId: cleanText(row.roomId || CANONICAL_STORE.roomId, 40) || CANONICAL_STORE.roomId,
        address: cleanText(row.address || CANONICAL_STORE.address, 120) || CANONICAL_STORE.address,
        maxPeople: Math.max(1, Number(row.maxPeople) || CANONICAL_STORE.maxPeople),
        sessionMinutes: Math.max(30, Number(row.sessionMinutes) || CANONICAL_STORE.sessionMinutes)
      };
    }
  } catch (error) {
    // fall through to canonical
  }
  return Object.assign({}, CANONICAL_STORE);
}

/**
 * 预约茶室以后台 rooms 集合为准（名称/可约状态/容量），不再用硬编码覆盖。
 */
async function resolveRoom(roomId, store) {
  const preferredId = cleanText(roomId, 40);
  try {
    await ensureCollection("rooms");
    let row = null;
    if (preferredId) {
      const byId = await db.collection("rooms").where({ id: preferredId }).limit(1).get();
      row = byId.data && byId.data[0] ? byId.data[0] : null;
    }
    if (!row) {
      // 未指定或找不到：取第一条上架可见茶室
      const listed = await db.collection("rooms").where({ visible: true }).limit(20).get();
      const items = (listed.data || []).filter((item) => item && item.removed !== true);
      items.sort((a, b) => Number(a.sort || 9999) - Number(b.sort || 9999));
      row = items[0] || null;
    }
    if (row) {
      if (row.removed === true || row.visible === false) {
        return { ok: false, message: "该茶室已下架，请重新选择" };
      }
      if (/暂停|下架|不可/.test(String(row.status || ""))) {
        return { ok: false, message: "该茶室暂不可预约" };
      }
      const capacityText = cleanText(row.capacity, 40);
      const peopleMatch = capacityText.match(/(\d+)\s*人/);
      const maxPeople = peopleMatch
        ? Math.max(1, Number(peopleMatch[1]) || store.maxPeople)
        : store.maxPeople;
      return {
        ok: true,
        roomId: cleanText(row.id, 40) || preferredId || store.roomId,
        roomName: cleanText(row.name || row.title, 40) || store.storeName,
        storeId: cleanText(row.storeId, 40) || store.storeId,
        maxPeople,
        image: cleanText(row.image || row.thumb, 300)
      };
    }
  } catch (error) {
    // fall through
  }
  if (!preferredId) {
    return { ok: false, message: "暂无可预约茶室，请先在后台配置茶室" };
  }
  // 找不到文档时仍允许按客户端 roomId 落库（兼容过渡期），名称用门店名
  return {
    ok: true,
    roomId: preferredId,
    roomName: cleanText(store.storeName, 40) || CANONICAL_STORE.storeName,
    storeId: store.storeId,
    maxPeople: store.maxPeople,
    image: ""
  };
}

exports.main = async (event = {}) => {
  const bookingPolicy = await loadBookingPolicySettings();
  const lockMinutes = bookingPolicy.lockMinutes;
  const cancelAdvanceHours = bookingPolicy.cancelAdvanceHours;
  const pricingPolicy = bookingPolicy.policy || DEFAULT_BOOKING_POLICY;

  if (event.action === "health") {
    return {
      ok: true,
      name: "createReservation",
      lockMinutes,
      cancelAdvanceHours,
      bookingOpenTime: pricingPolicy.openTime,
      bookingCloseTime: pricingPolicy.closeTime,
      bookingDayBasePrice: pricingPolicy.periods && pricingPolicy.periods[0] ? pricingPolicy.periods[0].basePrice : 188,
      bookingEveningBasePrice: pricingPolicy.periods && pricingPolicy.periods[1] ? pricingPolicy.periods[1].basePrice : 208,
      initialStatus: "待支付",
      requiresPayment: true,
      wecomReservationNotifyConfigured: Boolean(process.env.WECOM_RESERVATION_WEBHOOK || process.env.WECOM_ORDER_WEBHOOK)
    };
  }

  if (event.action === "testWeComNotify") {
    try {
      const result = await sendWeComTestNotification();
      return Object.assign({ ok: true, name: "createReservation" }, result);
    } catch (error) {
      return {
        ok: false,
        code: "WECOM_TEST_FAILED",
        message: error && error.message ? error.message : "企业微信测试失败"
      };
    }
  }

  const store = await resolveStore();

  if (event.action === "listReservedSlots") {
    const day = cleanText(event.day, 20);
    if (!day) {
      return { ok: false, message: "请选择日期" };
    }
    const roomLookup = await resolveRoom(event.roomId, store);
    if (!roomLookup.ok) {
      return roomLookup;
    }
    try {
      const slots = await listReservedSlots(
        day,
        roomLookup.roomId,
        roomLookup.storeId || store.storeId,
        store.sessionMinutes
      );
      return {
        ok: true,
        day,
        roomId: roomLookup.roomId,
        slots
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message || "读取已预约时段失败"
      };
    }
  }

  const { OPENID } = cloud.getWXContext();

  if (event.action === "cancel" || event.action === "cancelReservation") {
    return cancelReservation(event, OPENID);
  }

  if (event.action === "cancelPolicy") {
    return {
      ok: true,
      advanceHours: cancelAdvanceHours,
      requiresPayment: true,
      lockMinutes,
      rules: [
        "茶室预约需在线支付后生效",
        `待支付预约 ${lockMinutes} 分钟内未付款将自动取消并释放时段`,
        `已支付预约须至少提前 ${cancelAdvanceHours} 小时取消，取消后费用原路退回`,
        "距开场不足规定时间请联系门店处理"
      ]
    };
  }

  const roomLookup = await resolveRoom(event.roomId, store);
  if (!roomLookup.ok) {
    return roomLookup;
  }
  // 名称以后台 rooms 为准；客户端 roomName 仅作兜底
  const roomId = roomLookup.roomId;
  const storeId = roomLookup.storeId || store.storeId;
  const roomName = roomLookup.roomName
    || cleanText(event.roomName, 40)
    || store.storeName;
  const maxPeople = Math.max(
    1,
    Number(roomLookup.maxPeople) || Number(pricingPolicy.maxPeople) || store.maxPeople
  );

  const day = cleanText(event.day, 20);
  const time = cleanText(event.time, 12);
  const endTime = cleanText(event.endTime, 12);
  const people = Math.max(1, Math.min(maxPeople, Number(event.people) || 1));
  const name = cleanText(event.name, 40);
  const phone = cleanText(event.phone, 30);
  const note = cleanText(event.note, 200);
  const source = cleanText(event.source, 40);

  const storeName = store.storeName;

  if (!day || !time || !endTime || !name || !phone) {
    return { ok: false, message: "请补全预约信息" };
  }
  if (people > maxPeople) {
    return { ok: false, message: `每场限 ${maxPeople} 位以内` };
  }

  const quote = calculateReservationPrice(time, endTime, pricingPolicy);
  if (!quote.ok) {
    return { ok: false, message: quote.message || "时段无效" };
  }

  const period = quote.period;
  const periodLabel = quote.periodLabel;
  const price = quote.price;
  const durationMinutes = quote.durationMinutes;

  await ensureCollection("reservations");

  const conflicting = await findConflictingReservations(
    day,
    roomId,
    storeId,
    time,
    endTime,
    pricingPolicy.minDurationMinutes
  );

  if (conflicting.length > 0) {
    return { ok: false, message: "该时段已被预约或与其他预约重叠" };
  }

  const reservationNo = createReservationNo();
  const lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
  const total = price;

  const addResult = await db.collection("reservations").add({
    data: {
      _openid: OPENID,
      storeId,
      storeName,
      roomId,
      roomName,
      // room 字段供列表/兼容展示：用后台茶室名
      room: roomName,
      address: store.address,
      reservationNo,
      day,
      time,
      endTime,
      period,
      periodLabel,
      price,
      total,
      durationMinutes,
      basePrice: quote.basePrice,
      extraHalfHours: quote.extraHalfHours,
      halfHourPrice: quote.halfHourPrice,
      people,
      name,
      phone,
      note,
      source,
      status: "待支付",
      payStatus: "pending",
      lockedUntil,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  const reservationSnapshot = {
    reservationId: addResult._id,
    reservationNo,
    storeName,
    roomId,
    day,
    time,
    endTime,
    periodLabel,
    price,
    total,
    durationMinutes,
    people,
    name,
    phone,
    note,
    status: "待支付",
    payStatus: "pending",
    lockedUntil
  };

  const [wecomNotify, adminNotify] = await Promise.all([
    notifyWeCom(reservationSnapshot),
    notifyAdmins(reservationSnapshot)
  ]);

  return {
    ok: true,
    id: addResult._id,
    reservationId: addResult._id,
    reservationNo,
    total,
    status: "待支付",
    payStatus: "pending",
    needPayment: true,
    requiresPayment: true,
    lockMinutes,
    cancelAdvanceHours,
    lockedUntil,
    storeName,
    roomId,
    day,
    time,
    endTime,
    periodLabel,
    people,
    price,
    wecomNotify,
    adminNotify
  };
};
