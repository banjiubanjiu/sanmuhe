/**
 * 微信小程序「发货信息管理」upload_shipping_info
 * 文档: https://developers.weixin.qq.com/miniprogram/dev/server/API/order_shipping/api_uploadshippinginfo.html
 *
 * logistics_type:
 *   1 实体快递
 *   2 同城配送
 *   3 虚拟商品（充值、预约等）
 *   4 用户自提（到店自提、堂饮按自提）
 */

const LOGISTICS = {
  EXPRESS: 1,
  LOCAL: 2,
  VIRTUAL: 3,
  PICKUP: 4
};

/** 常见快递：中文名 / 别名 → 微信运力编码 */
const EXPRESS_COMPANY_MAP = {
  SF: "SF",
  顺丰: "SF",
  顺丰速运: "SF",
  顺丰快递: "SF",
  STO: "STO",
  申通: "STO",
  申通快递: "STO",
  YTO: "YTO",
  圆通: "YTO",
  圆通速递: "YTO",
  圆通快递: "YTO",
  ZTO: "ZTO",
  中通: "ZTO",
  中通快递: "ZTO",
  YD: "YD",
  韵达: "YD",
  韵达快递: "YD",
  韵达速递: "YD",
  EMS: "EMS",
  邮政: "EMS",
  邮政快递: "EMS",
  中国邮政: "EMS",
  JD: "JD",
  京东: "JD",
  京东快递: "JD",
  京东物流: "JD",
  HTKY: "HTKY",
  百世: "HTKY",
  百世快递: "HTKY",
  UC: "UC",
  优速: "UC",
  DBL: "DBL",
  德邦: "DBL",
  德邦快递: "DBL",
  JTSD: "JTSD",
  极兔: "JTSD",
  极兔速递: "JTSD",
  CNSD: "CNSD",
  菜鸟: "CNSD",
  菜鸟速递: "CNSD",
  ANE: "ANE",
  安能: "ANE"
};

const COMMON_EXPRESS_OPTIONS = [
  { code: "SF", label: "顺丰速运" },
  { code: "STO", label: "申通快递" },
  { code: "YTO", label: "圆通速递" },
  { code: "ZTO", label: "中通快递" },
  { code: "YD", label: "韵达速递" },
  { code: "JTSD", label: "极兔速递" },
  { code: "JD", label: "京东物流" },
  { code: "EMS", label: "邮政 EMS" },
  { code: "DBL", label: "德邦快递" },
  { code: "HTKY", label: "百世快递" }
];

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function resolveExpressCompanyCode(input) {
  const raw = cleanText(input, 40);
  if (!raw) {
    return "";
  }
  if (EXPRESS_COMPANY_MAP[raw]) {
    return EXPRESS_COMPANY_MAP[raw];
  }
  const upper = raw.toUpperCase();
  if (EXPRESS_COMPANY_MAP[upper]) {
    return EXPRESS_COMPANY_MAP[upper];
  }
  if (/^[A-Z0-9]{2,20}$/i.test(raw)) {
    return upper;
  }
  return raw;
}

function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length >= 7) {
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  }
  if (digits.length > 0) {
    return digits;
  }
  return "";
}

function formatUploadTime(date = new Date()) {
  const pad = (n, width = 2) => String(n).padStart(width, "0");
  const d = date instanceof Date ? date : new Date(date);
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  const cn = new Date(utcMs + 8 * 3600000);
  return (
    `${cn.getFullYear()}-${pad(cn.getMonth() + 1)}-${pad(cn.getDate())}` +
    `T${pad(cn.getHours())}:${pad(cn.getMinutes())}:${pad(cn.getSeconds())}` +
    `.${pad(cn.getMilliseconds(), 3)}+08:00`
  );
}

function buildItemDescFromItems(items, fallback = "禾煦商品") {
  const list = Array.isArray(items) ? items : [];
  const parts = list
    .map((item) => {
      const name = cleanText(item.name || item.title || item.productName, 40);
      const qty = Math.max(1, Number(item.quantity || item.qty) || 1);
      if (!name) {
        return "";
      }
      return `${name}*${qty}`;
    })
    .filter(Boolean);
  const text = parts.join("；") || cleanText(fallback, 120) || "禾煦商品";
  return text.slice(0, 120);
}

function buildOrderKey(record) {
  const transactionId = cleanText(record.transactionId || record.transaction_id, 64);
  if (transactionId) {
    return {
      order_number_type: 2,
      transaction_id: transactionId
    };
  }
  const outTradeNo = cleanText(
    record.orderNo || record.reservationNo || record.outTradeNo || record.out_trade_no,
    64
  );
  const mchid = cleanText(
    record.mchid ||
      record.mchId ||
      process.env.WECHAT_PAY_MCH_ID ||
      process.env.MCH_ID,
    32
  );
  if (outTradeNo && mchid) {
    return {
      order_number_type: 1,
      mchid,
      out_trade_no: outTradeNo
    };
  }
  return null;
}

function shouldSkipUpload(record, { force = false } = {}) {
  if (force) {
    return false;
  }
  if (record && record.wxShippingUploaded === true) {
    return true;
  }
  return false;
}

/**
 * 内存缓存 access_token（有效 7200s，这里 100 分钟提前刷新）。
 * 自换 token：WX_MP_APPID + WX_MP_APPSECRET 直调 /cgi-bin/token，绕开 CloudBase 云调用。
 */
let __wxTokenCache = "";
let __wxTokenCacheAt = 0;

async function fetchWxTokenWithSecret() {
  const appid = cleanText(process.env.WX_MP_APPID || process.env.WECHAT_PAY_APPID, 64);
  const secret = cleanText(process.env.WX_MP_APPSECRET, 128);
  if (!appid || !secret) {
    return "";
  }
  const now = Date.now();
  if (__wxTokenCache && __wxTokenCacheAt && now - __wxTokenCacheAt < 100 * 60 * 1000) {
    return __wxTokenCache;
  }
  const https = require("https");
  const path = `/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`;
  const token = await new Promise((resolve, reject) => {
    const req = https.get(
      { hostname: "api.weixin.qq.com", path, timeout: 8000 },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            const data = JSON.parse(raw || "{}");
            if (data.access_token) {
              __wxTokenCache = data.access_token;
              __wxTokenCacheAt = now;
              resolve(data.access_token);
            } else {
              reject(new Error(`gettoken 失败: ${data.errcode || ""} ${data.errmsg || ""}`));
            }
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => reject(new Error("gettoken 超时")));
  });
  return token;
}

/**
 * 解析 access_token：优先自换（可控），兜底云开发注入 / openapi auth。
 */
async function resolveAccessToken(cloud) {
  try {
    const token = await fetchWxTokenWithSecret();
    if (token) {
      return token;
    }
  } catch (error) {
    // 自换失败不阻断，继续尝试云开发注入
  }
  const wxContext = typeof cloud.getWXContext === "function" ? cloud.getWXContext() : {};
  if (wxContext.ACCESS_TOKEN) {
    return wxContext.ACCESS_TOKEN;
  }
  if (process.env.WX_ACCESS_TOKEN) {
    return process.env.WX_ACCESS_TOKEN;
  }
  if (cloud.openapi && cloud.openapi.auth && typeof cloud.openapi.auth.getAccessToken === "function") {
    try {
      const tokenRes = await cloud.openapi.auth.getAccessToken();
      const t = tokenRes && (tokenRes.accessToken || tokenRes.access_token);
      if (t) {
        return t;
      }
    } catch (error) {
      // ignore
    }
  }
  return "";
}

/**
 * HTTPS 直调「发货信息管理」接口（云函数内 ACCESS_TOKEN，云开发注入）。
 * @param {string} apiPath 接口路径名，如 upload_shipping_info / set_msg_jump_path
 * @param {object} payload 接口 body
 */
async function httpsPostWxaSecOrder(cloud, apiPath, payload) {
  const accessToken = await resolveAccessToken(cloud);

  if (!accessToken) {
    throw new Error("无法获取 access_token，请配置 WX_MP_APPSECRET 或确认云函数已开通 openapi 权限");
  }

  const https = require("https");
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.weixin.qq.com",
        path: `/wxa/sec/order/${apiPath}?access_token=${encodeURIComponent(accessToken)}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw || "{}"));
          } catch (parseError) {
            reject(new Error(`微信发货接口返回非 JSON: ${raw.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/** HTTPS GET 直调「发货信息管理」查询接口（is_trade_managed 等）。 */
async function httpsGetWxaSecOrder(cloud, apiPath) {
  const accessToken = await resolveAccessToken(cloud);

  if (!accessToken) {
    throw new Error("无法获取 access_token，请配置 WX_MP_APPSECRET 或确认云函数已开通 openapi 权限");
  }

  const https = require("https");
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: "api.weixin.qq.com",
        path: `/wxa/sec/order/${apiPath}?access_token=${encodeURIComponent(accessToken)}`
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw || "{}"));
          } catch (parseError) {
            reject(new Error(`微信发货接口返回非 JSON: ${raw.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
  });
}

/**
 * 调用微信 upload_shipping_info。
 * 仅走 HTTPS 直调（自换 access_token），不依赖 cloud.openapi：
 * cloud.openapi 在 access_token 无效时会抛 unhandled rejection 导致云函数崩溃。
 * @param {object} cloud wx-server-sdk cloud 实例
 * @param {object} payload 接口 body（snake_case）
 */
async function callUploadShippingInfo(cloud, payload) {
  const errors = [];

  // 唯一路径：HTTPS 直调（resolveAccessToken 优先 WX_MP_APPSECRET 自换 token）
  try {
    return await httpsPostWxaSecOrder(cloud, "upload_shipping_info", payload);
  } catch (error) {
    errors.push(`https: ${error.message || error}`);
  }

  throw new Error(`微信发货信息上传失败: ${errors.join(" | ") || "未知错误"}`);
}

function normalizeUploadResult(result) {
  const errcode = result && (result.errcode !== undefined ? result.errcode : result.errCode);
  const errmsg = (result && (result.errmsg || result.errMsg)) || "";
  const ok = Number(errcode) === 0 || errcode === undefined || errcode === null;
  // 部分 SDK 成功时无 errcode
  if (result && result.errMsg && /ok/i.test(result.errMsg) && errcode === undefined) {
    return { ok: true, errcode: 0, errmsg: "ok", raw: result };
  }
  return {
    ok: Number(errcode) === 0,
    errcode: errcode === undefined ? (ok ? 0 : -1) : Number(errcode),
    errmsg: errmsg || (ok ? "ok" : "upload failed"),
    raw: result
  };
}

/**
 * 上传发货信息（通用）
 * @returns {{ ok: boolean, skipped?: boolean, errcode?: number, errmsg?: string, payload?: object }}
 */
async function uploadShippingInfo(cloud, {
  record,
  logisticsType,
  trackingNo = "",
  expressCompany = "",
  itemDesc = "",
  force = false
} = {}) {
  if (!record) {
    return { ok: false, errmsg: "缺少业务单据" };
  }
  if (shouldSkipUpload(record, { force })) {
    return { ok: true, skipped: true, errmsg: "already uploaded" };
  }

  const openid = cleanText(record._openid || record.openid || record.payerOpenid, 128);
  if (!openid) {
    return { ok: false, errmsg: "缺少支付用户 openid" };
  }

  const orderKey = buildOrderKey(record);
  if (!orderKey) {
    return {
      ok: false,
      errmsg: "缺少微信支付单号（transactionId）或商户单号，无法同步微信发货"
    };
  }

  const type = Number(logisticsType);
  if (![1, 2, 3, 4].includes(type)) {
    return { ok: false, errmsg: `无效 logistics_type: ${logisticsType}` };
  }

  const desc =
    cleanText(itemDesc, 120) ||
    buildItemDescFromItems(record.items, record.planTitle || record.title || "禾煦商品");

  const shippingItem = {
    item_desc: desc
  };

  if (type === LOGISTICS.EXPRESS) {
    const companyCode = resolveExpressCompanyCode(expressCompany || record.trackingCompany || record.expressCompany);
    const waybill = cleanText(trackingNo || record.trackingNo, 128);
    if (!waybill) {
      return { ok: false, errmsg: "快递发货需填写快递单号" };
    }
    if (!companyCode) {
      return { ok: false, errmsg: "快递发货需选择快递公司" };
    }
    shippingItem.tracking_no = waybill;
    shippingItem.express_company = companyCode;
    // 顺丰要求联系方式（收件人掩码）
    if (companyCode === "SF") {
      const receiver = maskPhone(record.phone || record.receiverPhone || record.mobile);
      if (receiver) {
        shippingItem.contact = { receiver_contact: receiver };
      }
    }
  }

  const payload = {
    order_key: orderKey,
    logistics_type: type,
    delivery_mode: 1,
    shipping_list: [shippingItem],
    upload_time: formatUploadTime(),
    payer: { openid }
  };

  try {
    const raw = await callUploadShippingInfo(cloud, payload);
    const normalized = normalizeUploadResult(raw);
    // 10060002 已完成发货 → 视为成功（幂等）
    if (!normalized.ok && Number(normalized.errcode) === 10060002) {
      return {
        ok: true,
        skipped: true,
        errcode: 10060002,
        errmsg: "支付单已完成发货",
        payload,
        raw
      };
    }
    return {
      ok: normalized.ok,
      errcode: normalized.errcode,
      errmsg: normalized.errmsg,
      payload,
      raw
    };
  } catch (error) {
    return {
      ok: false,
      errmsg: error.message || String(error),
      payload
    };
  }
}

/** 快递：后台标记发货时调用 */
function uploadExpressShipping(cloud, order, { trackingNo, expressCompany, force } = {}) {
  return uploadShippingInfo(cloud, {
    record: order,
    logisticsType: LOGISTICS.EXPRESS,
    trackingNo,
    expressCompany,
    force
  });
}

/**
 * 自提 / 堂饮：支付成功时调用 logistics_type=4
 * 用户约定：自提支付成功就传；堂饮按自提
 */
function uploadPickupOrOnsiteShipping(cloud, order, options = {}) {
  const method = String(order.deliveryMethod || "");
  if (method !== "pickup" && method !== "onsite") {
    return Promise.resolve({ ok: true, skipped: true, errmsg: "not pickup/onsite" });
  }
  return uploadShippingInfo(cloud, {
    record: order,
    logisticsType: LOGISTICS.PICKUP,
    itemDesc: buildItemDescFromItems(
      order.items,
      method === "onsite" ? "禾煦堂饮" : "禾煦到店自提"
    ),
    force: options.force
  });
}

/** 虚拟：会员充值 / 茶室预约支付成功 logistics_type=3 */
function uploadVirtualShipping(cloud, record, itemDesc, options = {}) {
  return uploadShippingInfo(cloud, {
    record,
    logisticsType: LOGISTICS.VIRTUAL,
    itemDesc: itemDesc || record.planTitle || record.title || "禾煦服务",
    force: options.force
  });
}

/**
 * 将上传结果写回订单/预约/充值文档字段（调用方传入 db 与 collection）
 */
function shippingResultFields(result) {
  if (result && result.ok) {
    return {
      wxShippingUploaded: true,
      wxShippingUploadedAt: new Date(),
      wxShippingError: "",
      wxShippingLogisticsType: result.payload ? result.payload.logistics_type : null,
      wxShippingSkipped: Boolean(result.skipped)
    };
  }
  return {
    wxShippingUploaded: false,
    wxShippingError: cleanText((result && result.errmsg) || "上传失败", 300),
    wxShippingLastAttemptAt: new Date()
  };
}

/**
 * 消息跳转路径设置（全局配置，设置一次即可）。
 * 用户点击微信「订单发货通知」/「确认收货提醒」时，会进入该小程序页面；
 * 微信会自动在 path 后附加 transaction_id、merchant_id、merchant_trade_no
 * （存在二级商户号时还会附加 sub_merchant_id），落地页据此定位订单。
 * 若 path 为空或页面不存在，微信将跳转平台默认确认收货页。
 * 文档: https://developers.weixin.qq.com/miniprogram/dev/server/API/order_shipping/api_setmsgjumppath.html
 */
async function setMsgJumpPath(cloud, path) {
  const cleanPath = cleanText(path, 300).replace(/^\/+/, "");
  if (!cleanPath) {
    return { ok: false, errmsg: "跳转路径不能为空" };
  }
  const errors = [];

  // 唯一路径：HTTPS 直调（resolveAccessToken 优先 WX_MP_APPSECRET 自换 token）
  try {
    return await httpsPostWxaSecOrder(cloud, "set_msg_jump_path", { path: cleanPath });
  } catch (error) {
    errors.push(`https: ${error.message || error}`);
  }

  throw new Error(`微信发货通知跳转路径设置失败: ${errors.join(" | ") || "未知错误"}`);
}

/**
 * 查询小程序是否已开通「发货信息管理」服务。
 * 文档: https://developers.weixin.qq.com/miniprogram/dev/server/API/order_shipping/api_istrademanaged.html
 * @returns {{ ok: boolean, isTradeManaged: boolean, tradeManageAppid: string, isOfflineOrder: boolean, errmsg?: string }}
 */
async function queryIsTradeManaged(cloud) {
  const errors = [];
  const appid = cleanText(process.env.WX_MP_APPID || process.env.WECHAT_PAY_APPID, 64);
  try {
    const raw = await httpsPostWxaSecOrder(cloud, "is_trade_managed", { appid });
    return Object.assign({ ok: Number(raw.errcode) === 0 || raw.errcode === undefined }, raw);
  } catch (error) {
    errors.push(`https: ${error.message || error}`);
  }
  return { ok: false, errmsg: `查询发货信息管理开通状态失败: ${errors.join(" | ")}` };
}

/**
 * 查询是否已完成「交易结算管理确认」（商家侧授权）。
 * 文档: https://developers.weixin.qq.com/miniprogram/dev/server/API/order_shipping/api_istrademanagementconfirmationcompleted.html
 * @returns {{ ok: boolean, confirmationCompleted: boolean, errmsg?: string }}
 */
async function queryConfirmationCompleted(cloud) {
  const errors = [];
  const appid = cleanText(process.env.WX_MP_APPID || process.env.WECHAT_PAY_APPID, 64);
  try {
    const raw = await httpsPostWxaSecOrder(cloud, "is_trade_management_confirmation_completed", { appid });
    return Object.assign({ ok: Number(raw.errcode) === 0 || raw.errcode === undefined }, raw);
  } catch (error) {
    errors.push(`https: ${error.message || error}`);
  }
  return { ok: false, errmsg: `查询交易结算确认状态失败: ${errors.join(" | ")}` };
}

/**
 * 调 wxacode.getUnlimited 生成小程序码（扫码进点单页并带桌号）。
 * scene 传 t=<桌号>，page 指向点单页 pages/order/index。
 * 成功返回图片 Buffer；失败返回 JSON 错误。
 * @returns {{ ok: boolean, buffer?: Buffer, errcode?: number, errmsg?: string }}
 */
async function wxGetUnlimited(cloud, tableNo) {
  const accessToken = await resolveAccessToken(cloud);
  if (!accessToken) {
    return { ok: false, errmsg: "无法获取 access_token，请配置 WX_MP_APPSECRET" };
  }
  const https = require("https");
  const payload = JSON.stringify({
    scene: `t=${cleanText(tableNo, 32)}`,
    page: "pages/order/index",
    width: 430,
    is_hyaline: true,
    line_color: { r: 23, g: 59, b: 42 }
  });
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.weixin.qq.com",
        path: `/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
        timeout: 15000
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          const text = buffer.toString("utf8").trim();
          if (text.startsWith("{") && text.endsWith("}")) {
            try {
              const data = JSON.parse(text);
              return resolve({ ok: false, errcode: data.errcode, errmsg: data.errmsg || `生成失败 ${data.errcode}` });
            } catch (error) {
              return resolve({ ok: false, errmsg: "生成失败(响应解析错误)" });
            }
          }
          resolve({ ok: true, buffer });
        });
      }
    );
    req.on("error", (e) => resolve({ ok: false, errmsg: `网络错误: ${e.message}` }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, errmsg: "请求超时" });
    });
    req.write(payload);
    req.end();
  });
}

module.exports = {
  LOGISTICS,
  EXPRESS_COMPANY_MAP,
  COMMON_EXPRESS_OPTIONS,
  resolveExpressCompanyCode,
  maskPhone,
  formatUploadTime,
  buildItemDescFromItems,
  uploadShippingInfo,
  uploadExpressShipping,
  uploadPickupOrOnsiteShipping,
  uploadVirtualShipping,
  shippingResultFields,
  setMsgJumpPath,
  queryIsTradeManaged,
  queryConfirmationCompleted,
  wxGetUnlimited
};
