/**
 * secrets.js —— 密钥注入器（支付密钥托管方案 B）
 *
 * 背景：云函数全量部署（--force）会用配置文件整份覆盖函数环境变量，
 * 历史上因此冲掉过 WX_MP_APPSECRET / 支付私钥，导致发货信息上传失败、资金冻结。
 * 本模块把密钥权威源放到云数据库集合 app_secrets（文档 _id=live），
 * 函数冷启动时把密钥注入 process.env —— 密钥不再依赖函数 env，
 * 任何部署方式都无法冲掉。env 已有值时保持原样（零回归），缺失时自动补。
 *
 * 用法（在 exports.main 最前面）：
 *   const { hydrateEnv } = require("./secrets");
 *   exports.main = async (event, context) => {
 *     await hydrateEnv(cloud);
 *     ...
 *   };
 *
 * 换密钥：同时更新 .secrets/wechat-pay.env 与数据库 app_secrets/live。
 */
const CACHE_TTL = 10 * 60 * 1000;

let cache = null;
let cacheAt = 0;

function apply(data) {
  for (const [key, value] of Object.entries(data || {})) {
    if (typeof value === "string" && value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function hydrateEnv(cloud) {
  try {
    const now = Date.now();
    if (cache && now - cacheAt < CACHE_TTL) {
      apply(cache);
      return true;
    }
    const db = cloud.database();
    const res = await db.collection("app_secrets").doc("live").get();
    cache = res.data || {};
    cacheAt = now;
    apply(cache);
    return true;
  } catch (error) {
    // 数据库不可读时静默降级为现有 env（如有）
    return false;
  }
}

module.exports = { hydrateEnv };
