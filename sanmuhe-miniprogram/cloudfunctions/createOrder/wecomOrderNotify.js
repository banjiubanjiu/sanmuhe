const https = require("https");

const WECOM_WEBHOOK_HOST = "qyapi.weixin.qq.com";
const DEFAULT_TIMEOUT_MS = 3000;

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function parseMentionedMobiles(value) {
  return String(value || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter((item) => /^\d{6,20}$/.test(item));
}

function moneyYuan(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "0.00";
  }
  // 兼容分：大于等于 1000 且为整数时不自动当「分」，只在显式 fen 字段使用
  return Math.max(0, num).toFixed(2);
}

function moneyFromFen(fen) {
  const num = Math.max(0, Math.round(Number(fen) || 0));
  return (num / 100).toFixed(2);
}

/**
 * 业务类型：堂饮茶单 vs 茶叶商城（优先 source，其次商品 type）
 */
function bizTypeText(order = {}) {
  const source = cleanText(order.source, 40).toLowerCase();
  if (source === "dinein-tea-menu" || source === "onsite-cart") {
    return "堂饮茶单";
  }
  if (source === "retail-tea-catalog") {
    return "茶叶商城";
  }
  const items = order.items || [];
  const hasDrink = items.some((item) => item && item.type === "drink");
  const hasTea = items.some((item) => item && item.type === "tea");
  if (hasDrink && !hasTea) {
    return "堂饮茶单";
  }
  if (hasTea && !hasDrink) {
    return "茶叶商城";
  }
  if (hasDrink && hasTea) {
    return "堂饮+茶叶";
  }
  if (order.deliveryMethod === "onsite") {
    return "堂饮茶单";
  }
  return "普通订单";
}

function titleByBiz(order = {}, isPaid) {
  const biz = bizTypeText(order);
  if (biz === "堂饮茶单") {
    return isPaid ? "【禾煦堂饮·已支付】" : "【禾煦堂饮·新单】";
  }
  if (biz === "茶叶商城") {
    return isPaid ? "【禾煦茶叶·已支付】" : "【禾煦茶叶·新单】";
  }
  return isPaid ? "【禾煦订单已支付】" : "【禾煦新订单】";
}

/**
 * 把 payMode / payStatus 归一成店员能看懂的「怎么付 + 去哪查」
 */
function normalizePayChannel(order = {}) {
  const raw = cleanText(order.payMode || order.payChannel || "", 40).toLowerCase();
  const payStatus = cleanText(order.payStatus, 30).toLowerCase();
  const event = cleanText(order.event || order.notifyType, 40);

  if (
    raw === "balance" ||
    raw === "wallet" ||
    raw.includes("余额") ||
    raw.includes("储值")
  ) {
    return "balance";
  }
  if (
    raw === "wechat" ||
    raw === "wx" ||
    raw === "wxpay" ||
    raw === "jsapi" ||
    raw.includes("微信")
  ) {
    return "wechat";
  }
  if (
    raw === "manual" ||
    raw === "offline" ||
    raw.includes("柜台") ||
    raw.includes("扫码") ||
    raw.includes("到店") ||
    raw.includes("线下")
  ) {
    return "manual";
  }
  // 已支付但未标明：优先看是否有微信交易号
  if (order.transactionId || order.transaction_id) {
    return "wechat";
  }
  if (payStatus === "paid" || event === "order_paid") {
    return "unknown_paid";
  }
  if (payStatus === "pending" || payStatus === "manual" || payStatus === "balance_processing") {
    if (payStatus === "pending") {
      return "wechat";
    }
    if (payStatus === "manual") {
      return "manual";
    }
    if (payStatus === "balance_processing") {
      return "balance";
    }
  }
  return "unknown";
}

function payLine(order = {}, isPaid) {
  const channel = normalizePayChannel(order);
  if (channel === "wechat") {
    return isPaid ? "支付：微信已付" : "支付：微信支付（待顾客付）";
  }
  if (channel === "balance") {
    return isPaid ? "支付：会员余额" : "支付：会员余额（处理中）";
  }
  if (channel === "manual") {
    return isPaid ? "支付：线下收款" : "支付：柜台扫码付款（待到店付）";
  }
  if (channel === "unknown_paid") {
    return "支付：已支付（渠道未标注）";
  }
  return `支付：${cleanText(order.payMode, 30) || "待确认"}`;
}

function itemSummary(items, prefixKind) {
  return (items || [])
    .slice(0, 20)
    .map((item) => {
      const kind = prefixKind && item && item.type === "tea" ? "茶叶" : (prefixKind && item && item.type === "drink" ? "堂饮" : "");
      const name = cleanText(item && item.name, 36) || "商品";
      const qty = Math.max(1, Number(item && item.quantity) || 1);
      const options = (item && item.options) || {};
      const spec = item && item.type === "tea"
        ? cleanText(options.unit, 24)
        : cleanText(options.teaChoice, 24);
      const label = spec ? `·${spec} ` : "";
      return kind ? `[${kind}]${name}${label}×${qty}` : `${name}${label}×${qty}`;
    })
    .filter((item) => item.charAt(0) !== "×")
    .join("、")
    .slice(0, 360);
}

function buildWeComOrderPayload(order = {}, mentionedMobiles = []) {
  const event = cleanText(order.event || order.notifyType, 40);
  const isPaid = event === "order_paid" || order.payStatus === "paid";
  const biz = bizTypeText(order);
  const title = titleByBiz(order, isPaid);
  const lines = [
    title,
    `订单号：${cleanText(order.orderNo, 40) || "待查看"}`,
    `金额：¥${moneyYuan(order.total)}`
  ];
  const items = Array.isArray(order.items) ? order.items : [];
  const hasDrink = items.some((item) => item && item.type === "drink");
  const hasTea = items.some((item) => item && item.type === "tea");
  const isMixed = hasDrink && hasTea;
  const summary = itemSummary(order.items, isMixed);
  if (summary) {
    lines.push(`明细：${summary}`);
  }
  const tableNo = cleanText(order.tableNo, 20);
  if (tableNo) {
    lines.push(`桌号：${tableNo}`);
  }
  const consignee = cleanText(order.consignee, 40);
  const phone = cleanText(order.phone, 30);
  const address = cleanText(order.address, 120);
  if (order.deliveryMethod === "shipping" && (consignee || phone || address)) {
    lines.push(`收件：${[consignee, phone].filter(Boolean).join(" ")}`);
    if (address) {
      lines.push(`地址：${address}`);
    }
  } else if (order.deliveryMethod === "pickup" && (consignee || phone)) {
    lines.push(`自提人：${[consignee, phone].filter(Boolean).join(" ")}`);
  }
  lines.push(payLine(order, isPaid));
  const remark = cleanText(order.remark, 160);
  if (remark) {
    lines.push(`备注：${remark}`);
  }
  if (biz === "堂饮茶单") {
    lines.push(isMixed
      ? (isPaid ? "请安排备茶/备货。" : "请及时处理。")
      : (isPaid ? "请安排备茶/出杯。" : "请及时接待处理。"));
  } else if (biz === "茶叶商城") {
    lines.push(isPaid
      ? (order.deliveryMethod === "shipping"
        ? (order.freightCollect || order.shippingPayMode === "collect"
          ? "请打包发货（运费到付，勿垫付）。"
          : "请安排打包发货。")
        : "请安排备货自提。")
      : "请及时处理订单。");
  } else {
    lines.push(isPaid ? "请安排制作/履约。" : "请及时处理。");
  }

  const text = { content: lines.join("\n").slice(0, 1900) };
  if (mentionedMobiles.length) {
    text.mentioned_mobile_list = mentionedMobiles;
  }
  return { msgtype: "text", text };
}

function buildWeComRechargePayload(recharge = {}, mentionedMobiles = []) {
  const payYuan = recharge.payAmountFen != null
    ? moneyFromFen(recharge.payAmountFen)
    : moneyYuan(recharge.payAmount);
  const creditYuan = recharge.creditFen != null
    ? moneyFromFen(recharge.creditFen)
    : moneyYuan(recharge.creditAmount);
  const orderNo = cleanText(recharge.orderNo, 40) || "待查看";
  const lines = [
    "【禾煦会员充值】",
    `充值单号：${orderNo}`,
    `档位：${cleanText(recharge.planTitle || recharge.planId, 40) || "储值"}`,
    `实付：¥${payYuan}`,
    `到账：¥${creditYuan}`,
    "状态：已支付入账"
  ];

  const text = { content: lines.join("\n").slice(0, 1900) };
  if (mentionedMobiles.length) {
    text.mentioned_mobile_list = mentionedMobiles;
  }
  return { msgtype: "text", text };
}

function parseWebhook(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    throw new Error("企业微信 Webhook 地址格式无效");
  }
  if (url.protocol !== "https:" || url.hostname !== WECOM_WEBHOOK_HOST) {
    throw new Error("企业微信 Webhook 必须使用 qyapi.weixin.qq.com 的 HTTPS 地址");
  }
  if (url.pathname !== "/cgi-bin/webhook/send" || !url.searchParams.get("key")) {
    throw new Error("企业微信 Webhook 缺少有效的消息推送 key");
  }
  return url;
}

function postJson(url, payload, options = {}) {
  const httpsModule = options.httpsModule || https;
  const timeoutMs = Math.max(500, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = httpsModule.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        if (raw.length < 65536) {
          raw += chunk;
        }
      });
      response.on("end", () => {
        resolve({
          statusCode: Number(response.statusCode) || 0,
          body: raw
        });
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("企业微信提醒请求超时"));
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function sendWeComPayload(payload, options = {}) {
  const webhook = options.webhook !== undefined
    ? options.webhook
    : process.env.WECOM_ORDER_WEBHOOK;
  const url = parseWebhook(webhook);
  if (!url) {
    return { ok: true, skipped: true, reason: "missing_wecom_webhook" };
  }

  const response = await postJson(url, payload, options);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`企业微信提醒请求失败（HTTP ${response.statusCode}）`);
  }

  let result;
  try {
    result = JSON.parse(response.body || "{}");
  } catch (error) {
    throw new Error("企业微信提醒返回内容无法识别");
  }
  if (Number(result.errcode) !== 0) {
    throw new Error(`企业微信提醒发送失败（${result.errcode || "unknown"}：${result.errmsg || ""}）`);
  }
  return { ok: true, skipped: false };
}

async function sendWeComOrderNotification(order = {}, options = {}) {
  const mentionedMobiles = options.mentionedMobiles || parseMentionedMobiles(process.env.WECOM_MENTIONED_MOBILES);
  const payload = buildWeComOrderPayload(order, mentionedMobiles);
  return sendWeComPayload(payload, options);
}

async function sendWeComRechargeNotification(recharge = {}, options = {}) {
  const mentionedMobiles = options.mentionedMobiles || parseMentionedMobiles(process.env.WECOM_MENTIONED_MOBILES);
  const payload = buildWeComRechargePayload(recharge, mentionedMobiles);
  return sendWeComPayload(payload, options);
}

async function sendWeComTestNotification(options = {}) {
  const mentionedMobiles = options.mentionedMobiles || parseMentionedMobiles(process.env.WECOM_MENTIONED_MOBILES);
  const lines = [
    "【禾煦企微联调】",
    "这是一条测试消息。",
    "若你能看到，说明群机器人 Webhook 已接通。"
  ];
  const text = { content: lines.join("\n") };
  if (mentionedMobiles.length) {
    text.mentioned_mobile_list = mentionedMobiles;
  }
  return sendWeComPayload({ msgtype: "text", text }, options);
}

module.exports = {
  buildWeComOrderPayload,
  buildWeComRechargePayload,
  parseMentionedMobiles,
  parseWebhook,
  sendWeComOrderNotification,
  sendWeComRechargeNotification,
  sendWeComTestNotification
};
