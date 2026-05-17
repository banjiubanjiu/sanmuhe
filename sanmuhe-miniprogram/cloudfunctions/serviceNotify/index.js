const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const noticeConfig = {
  orderPaid: {
    enabledKey: "orderNoticeEnabled",
    templateKey: "orderPaidTemplateId",
    pageKey: "orderPaidPage",
    defaultPage: "pages/profile/index"
  },
  orderShipped: {
    enabledKey: "orderNoticeEnabled",
    templateKey: "orderShippedTemplateId",
    pageKey: "orderShippedPage",
    defaultPage: "pages/profile/index"
  },
  reservationStatus: {
    enabledKey: "reservationNoticeEnabled",
    templateKey: "reservationTemplateId",
    pageKey: "reservationNoticePage",
    defaultPage: "pages/reservation/index"
  },
  eventStatus: {
    enabledKey: "eventNoticeEnabled",
    templateKey: "eventTemplateId",
    pageKey: "eventNoticePage",
    defaultPage: "pages/events/index"
  }
};

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected.
  }
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function value(text, maxLength) {
  return { value: cleanText(text, maxLength || 20) };
}

function money(amount) {
  return `${(Number(amount) || 0).toFixed(2)}元`;
}

function nowText() {
  const date = new Date();
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function readSettings() {
  await ensureCollection("store_settings");
  const result = await db.collection("store_settings").where({ key: "store" }).limit(1).get();
  return result.data && result.data[0] ? result.data[0] : {};
}

function buildData(kind, payload = {}) {
  if (kind === "orderPaid") {
    return {
      thing1: value(payload.orderNo || "禾熙订单", 20),
      amount2: value(money(payload.total), 20),
      phrase3: value(payload.status || "支付成功", 10),
      time4: value(payload.time || nowText(), 20)
    };
  }
  if (kind === "orderShipped") {
    return {
      thing1: value(payload.orderNo || "禾熙订单", 20),
      thing2: value(payload.trackingCompany || "门店配送", 20),
      character_string3: value(payload.trackingNo || "-", 20),
      phrase4: value(payload.status || "已发货", 10)
    };
  }
  if (kind === "reservationStatus") {
    return {
      thing1: value(payload.room || "禾熙书茶空间", 20),
      time2: value(`${payload.day || ""} ${payload.time || ""}`.trim() || nowText(), 20),
      phrase3: value(payload.status || "待确认", 10),
      thing4: value(payload.note || "预约状态已更新", 20)
    };
  }
  if (kind === "eventStatus") {
    return {
      thing1: value(payload.title || "禾熙茶事活动", 20),
      time2: value(`${payload.date || ""} ${payload.time || ""}`.trim() || nowText(), 20),
      phrase3: value(payload.status || "待确认", 10),
      thing4: value(payload.place || "禾熙", 20)
    };
  }
  return {};
}

async function logNotice(data) {
  await ensureCollection("notification_logs");
  await db.collection("notification_logs").add({
    data: Object.assign({}, data, {
      createdAt: db.serverDate()
    })
  });
}

async function findPreference(openid, templateId) {
  await ensureCollection("subscription_preferences");
  const result = await db.collection("subscription_preferences")
    .where({ _openid: openid, templateId })
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function decrementPreference(pref) {
  if (!pref || !pref._id) {
    return;
  }
  await db.collection("subscription_preferences").doc(pref._id).update({
    data: {
      remaining: _.inc(-1),
      usedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });
}

async function sendNotice(event = {}) {
  const kind = cleanText(event.kind, 40);
  const openid = cleanText(event.openid, 80);
  const config = noticeConfig[kind];
  if (!config || !openid) {
    return { ok: false, message: "通知类型或用户无效" };
  }

  const settings = await readSettings();
  if (settings[config.enabledKey] === false) {
    await logNotice({ kind, openid, status: "skipped", reason: "notice_disabled" });
    return { ok: true, skipped: true, reason: "notice_disabled" };
  }

  const templateId = cleanText(settings[config.templateKey], 80);
  if (!templateId) {
    await logNotice({ kind, openid, status: "skipped", reason: "missing_template" });
    return { ok: true, skipped: true, reason: "missing_template" };
  }

  const preference = await findPreference(openid, templateId);
  if (!preference || Number(preference.remaining || 0) <= 0) {
    await logNotice({ kind, openid, templateId, status: "skipped", reason: "not_subscribed" });
    return { ok: true, skipped: true, reason: "not_subscribed" };
  }

  const page = cleanText(settings[config.pageKey], 120) || config.defaultPage;
  const data = buildData(kind, event.payload || {});
  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId,
      page,
      data,
      miniprogramState: process.env.MINIPROGRAM_STATE || "formal"
    });
    await decrementPreference(preference);
    await logNotice({ kind, openid, templateId, page, status: "sent", payload: event.payload || {}, result });
    return { ok: true, result };
  } catch (error) {
    await logNotice({
      kind,
      openid,
      templateId,
      page,
      status: "failed",
      payload: event.payload || {},
      error: error.message || String(error)
    });
    return { ok: false, message: error.message || "订阅消息发送失败" };
  }
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return { ok: true, name: "serviceNotify" };
  }

  try {
    return await sendNotice(event);
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_NOTIFY_ERROR",
      message: error.message || "通知服务异常"
    };
  }
};
