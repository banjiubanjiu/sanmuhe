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

function deliveryText(value, order = {}) {
  if (value === "shipping") {
    if (order.freightCollect || order.shippingPayMode === "collect") {
      return "快递到付（运费客户付快递）";
    }
    return "快递邮寄";
  }
  if (value === "onsite") {
    return "堂饮到店";
  }
  if (value === "pickup") {
    return "到店自提";
  }
  return cleanText(value, 20) || "待确认";
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

function payChannelLines(order = {}, isPaid) {
  const channel = normalizePayChannel(order);
  const orderNo = cleanText(order.orderNo, 40) || "见上";
  const txId = cleanText(order.transactionId || order.transaction_id, 48);
  const lines = [];

  if (channel === "wechat") {
    lines.push(isPaid ? "支付方式：微信支付（线上已付）" : "支付方式：微信支付（待顾客付）");
    lines.push(`查账入口：微信支付商户平台 → 交易中心 → 交易单`);
    lines.push(`商户单号：${orderNo}`);
    if (txId) {
      lines.push(`微信交易号：${txId}`);
    } else if (isPaid) {
      lines.push("查账提示：用商户单号搜索；交易号以商户平台为准");
    } else {
      lines.push("查账提示：顾客付款成功后，用商户单号在交易单中搜索");
    }
    return lines;
  }

  if (channel === "balance") {
    lines.push(isPaid ? "支付方式：会员余额（储值钱包已扣）" : "支付方式：会员余额（处理中）");
    lines.push("查账入口：经营后台订单详情 / 云开发 wallet_ledger");
    lines.push(`业务订单号：${orderNo}`);
    lines.push("查账提示：余额单不进微信交易流水，勿在商户平台按微信单查");
    return lines;
  }

  if (channel === "manual") {
    lines.push(isPaid ? "支付方式：柜台扫码/线下收款" : "支付方式：柜台扫码付款（待到店付）");
    lines.push("查账入口：门店收款码/收银记录 + 经营后台订单");
    lines.push(`业务订单号：${orderNo}`);
    lines.push("查账提示：线下款不在小程序自动对账，请柜台确认后改订单状态");
    return lines;
  }

  if (channel === "unknown_paid") {
    lines.push("支付方式：已支付（渠道未标注）");
    lines.push(`业务订单号：${orderNo}`);
    lines.push("查账提示：先看经营后台订单支付方式；微信付则去商户平台用商户单号查");
    return lines;
  }

  lines.push(`支付方式：${cleanText(order.payMode, 30) || "待确认"}`);
  lines.push(`业务订单号：${orderNo}`);
  return lines;
}

function itemSummary(items) {
  return (items || [])
    .slice(0, 20)
    .map((item) => {
      const kind = item && item.type === "tea" ? "茶叶" : (item && item.type === "drink" ? "堂饮" : "");
      const name = cleanText(item && item.name, 36) || "商品";
      const qty = Math.max(1, Number(item && item.quantity) || 1);
      return kind ? `[${kind}]${name}×${qty}` : `${name}×${qty}`;
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
    `类型：${biz}`,
    `订单：${cleanText(order.orderNo, 40) || "待查看"}`,
    `金额：¥${moneyYuan(order.total)}`,
    `状态：${cleanText(order.status, 20) || (isPaid ? "已支付" : "待处理")}`,
    `配送：${deliveryText(order.deliveryMethod)}`
  ];
  payChannelLines(order, isPaid).forEach((line) => lines.push(line));
  const tableNo = cleanText(order.tableNo, 20);
  const summary = itemSummary(order.items);
  const remark = cleanText(order.remark, 160);
  const consignee = cleanText(order.consignee, 40);
  const phone = cleanText(order.phone, 30);
  const address = cleanText(order.address, 120);
  if (tableNo) {
    lines.push(`桌号：${tableNo}`);
  }
  if (summary) {
    lines.push(`明细：${summary}`);
  }
  if (order.deliveryMethod === "shipping" && (consignee || phone || address)) {
    lines.push(`收件：${[consignee, phone].filter(Boolean).join(" ")}`);
    if (address) {
      lines.push(`地址：${address}`);
    }
  }
  if (order.deliveryMethod === "pickup" && (consignee || phone)) {
    lines.push(`自提人：${[consignee, phone].filter(Boolean).join(" ")}`);
  }
  if (remark) {
    lines.push(`备注：${remark}`);
  }
  if (biz === "堂饮茶单") {
    lines.push(isPaid ? "请安排备茶/出杯。" : "请及时接待处理。");
  } else if (biz === "茶叶商城") {
    lines.push(isPaid
      ? (order.deliveryMethod === "shipping" ? "请安排打包发货。" : "请安排备货自提。")
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
  const txId = cleanText(recharge.transactionId, 48);
  const lines = [
    "【禾煦会员充值】",
    `充值单号：${orderNo}`,
    `档位：${cleanText(recharge.planTitle || recharge.planId, 40) || "储值"}`,
    `实付：¥${payYuan}`,
    `到账：¥${creditYuan}`,
    `状态：已支付入账`,
    "支付方式：微信支付（线上充值）",
    "查账入口：微信支付商户平台 → 交易中心 → 交易单",
    `商户单号：${orderNo}`
  ];
  if (txId) {
    lines.push(`微信交易号：${txId}`);
  }
  lines.push("余额入账：经营后台会员钱包 / wallet_ledger");

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
