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

function deliveryText(value) {
  if (value === "shipping") {
    return "快递配送";
  }
  if (value === "onsite") {
    return "到店点单";
  }
  return "到店自提";
}

function itemSummary(items) {
  return (items || [])
    .slice(0, 20)
    .map((item) => `${cleanText(item.name, 40)}×${Math.max(1, Number(item.quantity) || 1)}`)
    .filter((item) => item.charAt(0) !== "×")
    .join("、")
    .slice(0, 360);
}

function buildWeComOrderPayload(order = {}, mentionedMobiles = []) {
  const lines = [
    "【禾煦新订单】",
    `订单：${cleanText(order.orderNo, 40) || "待查看"}`,
    `金额：¥${Math.max(0, Number(order.total) || 0).toFixed(2)}`,
    `状态：${cleanText(order.status, 20) || "待处理"}`,
    `方式：${deliveryText(order.deliveryMethod)}`
  ];
  const tableNo = cleanText(order.tableNo, 20);
  const summary = itemSummary(order.items);
  const remark = cleanText(order.remark, 160);
  if (tableNo) {
    lines.push(`桌号：${tableNo}`);
  }
  if (summary) {
    lines.push(`商品：${summary}`);
  }
  if (remark) {
    lines.push(`备注：${remark}`);
  }
  lines.push("请及时处理。");

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
      request.destroy(new Error("企业微信新订单提醒请求超时"));
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function sendWeComOrderNotification(order = {}, options = {}) {
  const webhook = options.webhook !== undefined
    ? options.webhook
    : process.env.WECOM_ORDER_WEBHOOK;
  const url = parseWebhook(webhook);
  if (!url) {
    return { ok: true, skipped: true, reason: "missing_wecom_webhook" };
  }

  const mentionedMobiles = options.mentionedMobiles || parseMentionedMobiles(process.env.WECOM_MENTIONED_MOBILES);
  const payload = buildWeComOrderPayload(order, mentionedMobiles);
  const response = await postJson(url, payload, options);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`企业微信新订单提醒请求失败（HTTP ${response.statusCode}）`);
  }

  let result;
  try {
    result = JSON.parse(response.body || "{}");
  } catch (error) {
    throw new Error("企业微信新订单提醒返回内容无法识别");
  }
  if (Number(result.errcode) !== 0) {
    throw new Error(`企业微信新订单提醒发送失败（${result.errcode || "unknown"}）`);
  }
  return { ok: true, skipped: false };
}

module.exports = {
  buildWeComOrderPayload,
  parseMentionedMobiles,
  parseWebhook,
  sendWeComOrderNotification
};
