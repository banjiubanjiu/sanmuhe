/**
 * 活动状态：后台 status 为主，前台只读展示。
 * 枚举：敬请期待 | 报名中 | 已满 | 已结束 | 已取消
 * 规则：名额满时「报名中」展示为「已满」；敬请期待/已结束/已取消不因人数改写。
 */

const EVENT_STATUS = {
  WAIT: "敬请期待",
  OPEN: "报名中",
  FULL: "已满",
  ENDED: "已结束",
  CANCELLED: "已取消"
};

function cleanText(value) {
  return String(value == null ? "" : value).trim();
}

function asEventItem(item) {
  return item && typeof item === "object" ? item : {};
}

function resolveEventStatus(item) {
  const safe = asEventItem(item);
  const raw = cleanText(safe.status) || EVENT_STATUS.WAIT;
  if (
    raw === EVENT_STATUS.CANCELLED
    || raw === EVENT_STATUS.ENDED
    || raw === EVENT_STATUS.WAIT
  ) {
    return raw;
  }
  const quota = Math.max(0, Number(safe.quota) || 0);
  const signed = Math.max(0, Number(safe.signed) || 0);
  if (quota > 0 && signed >= quota) {
    return EVENT_STATUS.FULL;
  }
  if (raw === EVENT_STATUS.FULL) {
    return EVENT_STATUS.FULL;
  }
  if (raw === EVENT_STATUS.OPEN) {
    return EVENT_STATUS.OPEN;
  }
  return EVENT_STATUS.WAIT;
}

function eventJoinMeta(status) {
  const value = cleanText(status) || EVENT_STATUS.WAIT;
  if (value === EVENT_STATUS.OPEN) {
    return { canJoin: true, joinText: "报名", joinClass: "open" };
  }
  if (value === EVENT_STATUS.FULL) {
    return { canJoin: false, joinText: "已满", joinClass: "full" };
  }
  if (value === EVENT_STATUS.ENDED) {
    return { canJoin: false, joinText: "已结束", joinClass: "ended" };
  }
  if (value === EVENT_STATUS.CANCELLED) {
    return { canJoin: false, joinText: "已取消", joinClass: "cancelled" };
  }
  return { canJoin: false, joinText: EVENT_STATUS.WAIT, joinClass: "wait" };
}

function decorateEventStatus(item) {
  const safe = asEventItem(item);
  const displayStatus = resolveEventStatus(safe);
  const meta = eventJoinMeta(displayStatus);
  return Object.assign({}, safe, {
    displayStatus,
    status: cleanText(safe.status) || EVENT_STATUS.WAIT,
    canJoin: !!meta.canJoin,
    joinText: meta.joinText || EVENT_STATUS.WAIT,
    joinClass: meta.joinClass || "wait"
  });
}

/** 前台列表是否展示（已取消不进列表） */
function isEventListVisible(item) {
  const safe = asEventItem(item);
  if (safe.removed === true || safe.deleted === true || safe.visible === false) {
    return false;
  }
  return resolveEventStatus(safe) !== EVENT_STATUS.CANCELLED;
}

module.exports = {
  EVENT_STATUS,
  resolveEventStatus,
  eventJoinMeta,
  decorateEventStatus,
  isEventListVisible
};
