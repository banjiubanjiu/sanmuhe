const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const STAFF_ORDER_TEMPLATE_ID = "FKt8thCe64EU6d-fLRnwWs2KtM86rVFFjQlP0gFgAKE";
const STAFF_ORDER_TEMPLATE_MAP = {
  character_string1: "orderNo",
  character_string3: "pickupNo",
  thing17: "itemSummary",
  thing9: "remark"
};

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
  orderStaffNew: {
    enabledKey: "staffOrderNoticeEnabled",
    templateKey: "staffOrderTemplateId",
    pageKey: "staffOrderPage",
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

function parseList(value) {
  return String(value || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getStaffOpenids() {
  const fromStaff = parseList(process.env.STAFF_OPENIDS);
  if (fromStaff.length) {
    return fromStaff;
  }
  return parseList(process.env.ADMIN_OPENIDS);
}

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

function fieldMaxLen(fieldKey) {
  const key = String(fieldKey || "");
  if (key.startsWith("phrase")) {
    return 5;
  }
  if (key.startsWith("amount")) {
    return 20;
  }
  if (key.startsWith("time") || key.startsWith("date")) {
    return 20;
  }
  if (key.startsWith("character_string")) {
    return 32;
  }
  return 20;
}

function parseTemplateMap(raw) {
  if (!raw) {
    return null;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw;
  }
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function nowWechatTime() {
  const date = new Date();
  const pad = (num) => String(num).padStart(2, "0");
  // 订阅消息 time/date 字段更稳妥的展示格式
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function sanitizeFieldValue(fieldKey, raw) {
  let text = String(raw == null ? "" : raw).trim();
  const key = String(fieldKey || "");

  // character_string / number / letter 不能含中文；部分模板对 character_string 更挑剔，优先纯数字/字母
  if (key.startsWith("character_string") || key.startsWith("number") || key.startsWith("letter")) {
    if (key.startsWith("number")) {
      text = text.replace(/\D/g, "");
    } else {
      text = text.replace(/[^A-Za-z0-9]/g, "");
    }
    if (!text) {
      text = String(Date.now());
    }
    text = text.slice(0, 32);
  }

  if (key.startsWith("phrase")) {
    // phrase 最多 5 个汉字字符
    text = Array.from(text).slice(0, 5).join("");
  }

  if (key.startsWith("amount")) {
    const num = Number(String(text).replace(/[^\d.]/g, ""));
    const fixed = (Number.isFinite(num) ? num : 0).toFixed(2);
    text = `${fixed}元`;
  }

  if (key.startsWith("time") || key.startsWith("date")) {
    if (!text) {
      text = nowWechatTime();
    }
  }

  return cleanText(text, fieldMaxLen(key));
}

function staffSourceValues(payload = {}) {
  const rawNo = cleanText(payload.orderNo || `SMH${Date.now()}`, 40);
  const orderNo = rawNo.replace(/[^A-Za-z0-9]/g, "") || `SMH${Date.now()}`;
  const orderDigits = (rawNo.replace(/\D/g, "") || String(Date.now())).slice(-20);
  return {
    orderNo: orderNo.slice(0, 32),
    orderDigits,
    pickupNo: orderDigits.slice(-6),
    itemSummary: cleanText(payload.itemSummary || payload.items || "现场点单", 20),
    total: payload.total,
    status: cleanText(payload.status || "待付款", 5),
    time: cleanText(payload.time || nowWechatTime(), 20),
    remark: cleanText(payload.remark || "柜台扫码付款", 20)
  };
}

function applyTemplateMap(map, sources) {
  const data = {};
  Object.keys(map || {}).forEach((fieldKey) => {
    const sourceKey = cleanText(map[fieldKey], 40);
    const raw = sources[sourceKey] !== undefined ? sources[sourceKey] : sourceKey;
    data[fieldKey] = { value: sanitizeFieldValue(fieldKey, raw) };
  });
  return data;
}

function getStaffTemplateMap(templateId, settings = {}) {
  if (templateId === STAFF_ORDER_TEMPLATE_ID) {
    return STAFF_ORDER_TEMPLATE_MAP;
  }
  const configured = parseTemplateMap(settings.staffOrderTemplateMap);
  return configured || STAFF_ORDER_TEMPLATE_MAP;
}

function buildStaffOrderData(payload = {}, templateId, settings = {}) {
  const sources = staffSourceValues(payload);
  const map = getStaffTemplateMap(templateId, settings);
  return applyTemplateMap(map, sources);
}

function buildData(kind, payload = {}, settings = {}, templateId = "") {
  if (kind === "orderPaid") {
    return {
      thing1: value(payload.orderNo || "禾煦订单", 20),
      amount2: value(money(payload.total), 20),
      phrase3: value(payload.status || "支付成功", 10),
      time4: value(payload.time || nowText(), 20)
    };
  }
  if (kind === "orderShipped") {
    return {
      thing1: value(payload.orderNo || "禾煦订单", 20),
      thing2: value(payload.trackingCompany || "门店配送", 20),
      character_string3: value(payload.trackingNo || "-", 20),
      phrase4: value(payload.status || "已发货", 10)
    };
  }
  if (kind === "orderStaffNew") {
    return buildStaffOrderData(payload, templateId, settings);
  }
  if (kind === "reservationStatus") {
    return {
      thing1: value(payload.room || "禾煦书茶空间", 20),
      time2: value(`${payload.day || ""} ${payload.time || ""}`.trim() || nowText(), 20),
      phrase3: value(payload.status || "待确认", 10),
      thing4: value(payload.note || "预约状态已更新", 20)
    };
  }
  if (kind === "eventStatus") {
    return {
      thing1: value(payload.title || "禾煦茶事活动", 20),
      time2: value(`${payload.date || ""} ${payload.time || ""}`.trim() || nowText(), 20),
      phrase3: value(payload.status || "待确认", 10),
      thing4: value(payload.place || "禾煦", 20)
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

  // 店员提醒：设置 → 硬编码店员模板 → 支付成功模板
  let templateId = cleanText(settings[config.templateKey], 80);
  if (!templateId && kind === "orderStaffNew") {
    templateId = STAFF_ORDER_TEMPLATE_ID || cleanText(settings.orderPaidTemplateId, 80);
  }
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
  const payload = event.payload || {};
  const miniprogramState = process.env.MINIPROGRAM_STATE || "formal";

  const data = buildData(kind, payload, settings, templateId);
  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId,
      page,
      data,
      miniprogramState
    });
    await decrementPreference(preference);
    await logNotice({ kind, openid, templateId, page, status: "sent", payload, result });
    return { ok: true, result };
  } catch (error) {
    await logNotice({
      kind,
      openid,
      templateId,
      page,
      status: "failed",
      payload,
      error: error.errMsg || error.message || String(error)
    });
    return { ok: false, message: error.errMsg || error.message || "订阅消息发送失败" };
  }
}

async function notifyStaff(event = {}) {
  const kind = cleanText(event.kind, 40) || "orderStaffNew";
  const openids = Array.isArray(event.openids) && event.openids.length
    ? event.openids.map((item) => cleanText(item, 80)).filter(Boolean)
    : getStaffOpenids();

  if (!openids.length) {
    await logNotice({
      kind,
      status: "skipped",
      reason: "no_staff_openids",
      message: "未配置 STAFF_OPENIDS / ADMIN_OPENIDS，无法推送店员微信提醒"
    });
    return {
      ok: true,
      skipped: true,
      reason: "no_staff_openids",
      staffCount: 0,
      results: []
    };
  }

  const results = [];
  for (const openid of openids) {
    // 串行发送，避免并发打满开放接口配额。
    // eslint-disable-next-line no-await-in-loop
    const result = await sendNotice({
      kind,
      openid,
      payload: event.payload || {}
    });
    results.push(Object.assign({ openid: `${openid.slice(0, 6)}...` }, result));
  }

  const sent = results.filter((item) => item.ok && !item.skipped).length;
  const skipped = results.filter((item) => item.skipped).length;
  const failed = results.filter((item) => item.ok === false).length;

  return {
    ok: true,
    staffCount: openids.length,
    sent,
    skipped,
    failed,
    results
  };
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    const settings = await readSettings();
    return {
      ok: true,
      name: "serviceNotify",
      staffOpenidCount: getStaffOpenids().length,
      staffTemplateId: cleanText(settings.staffOrderTemplateId, 80) || STAFF_ORDER_TEMPLATE_ID,
      staffNoticeEnabled: settings.staffOrderNoticeEnabled !== false,
      miniprogramState: process.env.MINIPROGRAM_STATE || "formal"
    };
  }

  try {
    if (event.action === "notifyStaff") {
      return await notifyStaff(event);
    }
    // 联调：在店员已授权后，直接发一条测试订阅消息
    if (event.action === "testStaffNotify") {
      return await notifyStaff({
        kind: "orderStaffNew",
        openids: event.openids,
        payload: {
          orderNo: cleanText(event.orderNo, 32) || `TEST${Date.now()}`,
          itemSummary: cleanText(event.itemSummary, 20) || "联调测试商品",
          remark: cleanText(event.remark, 20) || "订阅消息测试",
          status: cleanText(event.status, 5) || "测试",
          total: event.total != null ? event.total : 0.01,
          time: ""
        }
      });
    }
    return await sendNotice(event);
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_NOTIFY_ERROR",
      message: error.message || "通知服务异常"
    };
  }
};
