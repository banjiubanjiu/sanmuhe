/**
 * shippingWatchdog —— 微信「发货信息管理」自愈看门狗（定时触发）
 *
 * 背景：交易类小程序（禾煦）的资金结算依赖 upload_shipping_info 成功录入发货信息。
 * 历史上曾因云函数环境变量 WX_MP_APPID / WX_MP_APPSECRET 缺失，导致 access_token
 * 获取失败，上传静默失败（10060001 支付单不存在），会员充值/预约/快递订单的资金
 * 长期冻结在微信侧。本函数兜底：
 *   1) 定时扫描所有「已支付但 wxShippingUploaded != true」的订单/充值/预约，自动补传；
 *   2) 上传通道故障（拿不到 access_token）或某单连续失败时，企业微信告警。
 *
 * 部署（带密钥，勿用仓库 cloudbaserc 裸 deploy）：
 *   tcb fn deploy shippingWatchdog --force -e <env> --config-file <含 WX_MP_* 的配置>
 *   tcb fn trigger create shippingWatchdog --trigger-name shipping-watchdog --cron "0 0/10 * * * * *"（每 10 分钟）
 */
const cloud = require("wx-server-sdk");
const https = require("https");
const {
  uploadVirtualShipping,
  uploadExpressShipping,
  uploadPickupOrOnsiteShipping,
  shippingResultFields
} = require("./wechatShipping");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/** 每轮最多处理的单数（30s 超时保护） */
const RUN_LIMIT = 30;
/** 同一单连续失败达到该次数时告警一次 */
const ALERT_EVERY = 3;
/** 通道故障（token 拿不到）的最小告警间隔（毫秒） */
const TOKEN_ALERT_MIN_GAP = 30 * 60 * 1000;

const WECOM_WEBHOOK = process.env.WECOM_ORDER_WEBHOOK || "";

function sendWecom(text) {
  if (!WECOM_WEBHOOK) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    try {
      const url = new URL(WECOM_WEBHOOK);
      if (url.protocol !== "https:" || url.hostname !== "qyapi.weixin.qq.com") {
        resolve(false);
        return;
      }
      const body = JSON.stringify({
        msgtype: "text",
        text: { content: `[禾煦·发货看门狗] ${text}` }
      });
      const req = https.request(
        {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
          }
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode === 200));
        }
      );
      req.on("error", () => resolve(false));
      req.end(body);
    } catch (error) {
      resolve(false);
    }
  });
}

function timestamp() {
  return db.serverDate();
}

async function updateUploadResult(col, docId, result, failCountDelta = 0) {
  if (result && result.ok) {
    return db.collection(col).doc(docId).update({
      data: Object.assign({}, shippingResultFields(result), {
        wxShippingUploadedAt: timestamp(),
        wxShippingLastAttemptAt: timestamp(),
        wxShippingFailCount: 0,
        updatedAt: timestamp()
      })
    });
  }
  return db.collection(col).doc(docId).update({
    data: {
      wxShippingUploaded: false,
      wxShippingError: String((result && result.errmsg) || "上传失败").slice(0, 300),
      wxShippingLastAttemptAt: timestamp(),
      wxShippingFailCount: _.inc(failCountDelta),
      updatedAt: timestamp()
    }
  });
}

/** 查询某集合中「已微信支付、有交易号、但发货信息未上传成功」的单 */
async function scanCollection(col) {
  try {
    const rows = await db
      .collection(col)
      .where({
        transactionId: _.exists(true).and(_.neq("")),
        payStatus: "paid",
        wxShippingUploaded: _.neq(true)
      })
      .limit(RUN_LIMIT)
      .get();
    return rows.data || [];
  } catch (error) {
    return [];
  }
}

async function handleRow(col, row, report) {
  const docId = row._id;
  const label = row.orderNo || row.rechargeNo || row.reservationNo || row._id || "";
  // 显式跳过标记（测试单/不再重试）
  if (row.wxShippingSkip === true) {
    report.skipped += 1;
    return;
  }
  let result;
  let desc = "";

  if (col === "recharge_orders") {
    desc = row.planTitle || "会员储值";
    result = await uploadVirtualShipping(cloud, row, desc);
  } else if (col === "reservations") {
    desc = `茶室预约 ${row.day || ""} ${row.time || ""}`.trim() || "禾煦茶室预约";
    result = await uploadVirtualShipping(cloud, row, desc);
  } else {
    // orders：按交付方式选择
    const method = String(row.deliveryMethod || "");
    if (method === "pickup" || method === "onsite") {
      result = await uploadPickupOrOnsiteShipping(cloud, row);
    } else if (method === "shipping") {
      // 快递单只有「已发货」且已有运单号才能补传；待发货由 markShipped 触发，跳过
      if (row.status !== "已发货" || !row.trackingNo) {
        report.skipped += 1;
        return;
      }
      result = await uploadExpressShipping(cloud, row, {
        trackingNo: row.trackingNo,
        expressCompany: row.trackingCompanyCode || row.trackingCompany,
        force: true
      });
    } else {
      report.skipped += 1;
      return;
    }
  }

  report.scanned += 1;
  if (result && result.ok) {
    await updateUploadResult(col, docId, result);
    report.fixed += 1;
  } else {
    const failCount = Math.max(1, Number(row.wxShippingFailCount) || 0) + 1;
    await updateUploadResult(col, docId, result, failCount - Math.max(1, Number(row.wxShippingFailCount) || 0));
    report.failed += 1;
    if (failCount % ALERT_EVERY === 0) {
      report.alerts.push(`单号 ${label}（${col}）连续 ${failCount} 次上传失败：${(result && result.errmsg) || "未知错误"}`);
    }
  }
}

exports.main = async () => {
  const report = { scanned: 0, fixed: 0, failed: 0, skipped: 0, alerts: [] };

  // 通道自检：先验证能否拿到 access_token（WX_MP_APPSECRET 是否被部署冲掉）
  let tokenOk = false;
  try {
    const { resolveAccessToken } = require("./wechatShipping");
    const token = await resolveAccessToken(cloud);
    tokenOk = Boolean(token);
  } catch (error) {
    tokenOk = false;
  }

  if (!tokenOk) {
    // 通道故障：查上次告警时间，做频率抑制
    let shouldAlert = true;
    try {
      const stateDoc = await db.collection("watchdog_state").doc("token_alert").get();
      const last = stateDoc.data && stateDoc.data.at;
      if (last) {
        const lastMs =
          last instanceof Date ? last.getTime() : last.$date ? Number(last.$date.$numberLong) : 0;
        shouldAlert = Date.now() - lastMs > TOKEN_ALERT_MIN_GAP;
      }
    } catch (error) {
      shouldAlert = true;
    }
    if (shouldAlert) {
      await sendWecom(
        "发货信息上传通道故障：无法获取 access_token（WX_MP_APPSECRET 可能被部署冲掉）。资金结算将延迟，请检查云函数环境变量并立即修复。"
      );
      try {
        await db.collection("watchdog_state").doc("token_alert").set({
          data: { at: timestamp() }
        });
      } catch (error) {
        // ignore
      }
    }
    return { ok: false, reason: "token_unavailable", report };
  }

  for (const col of ["recharge_orders", "reservations", "orders"]) {
    const rows = await scanCollection(col);
    for (const row of rows) {
      if (report.scanned + report.failed + report.skipped >= RUN_LIMIT) {
        break;
      }
      try {
        await handleRow(col, row, report);
      } catch (error) {
        report.failed += 1;
        report.alerts.push(`单号 ${row.orderNo || row._id}（${col}）处理异常：${String((error && error.message) || error).slice(0, 200)}`);
      }
    }
  }

  // 有失败告警（每单最多一次/每 3 次失败）
  if (report.alerts.length > 0) {
    await sendWecom(report.alerts.slice(0, 5).join("\n"));
  }

  return { ok: report.failed === 0, report };
};
