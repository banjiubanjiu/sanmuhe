#!/usr/bin/env node
/**
 * sync-app-secrets.mjs —— 把 .secrets/wechat-pay.env + keys/*.pem 同步到云数据库 app_secrets/live
 *
 * 用途：方案 B 密钥托管。函数从数据库读密钥，env 只是兜底。
 * 换密钥/改配置后，运行本脚本把最新值写入数据库（与 .secrets 保持一致）。
 *
 * 用法（在仓库根目录执行）：
 *   node scripts/sync-app-secrets.mjs
 *
 * 依赖：tcb CLI 已登录（tcb login），环境 cloudbase-d2gq023qn50e9d82f
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ENV_ID = process.env.ENV_ID || "cloudbase-d2gq023qn50e9d82f";
const SECRETS_ENV = join(ROOT, ".secrets", "wechat-pay.env");

function parseEnv(file) {
  const env = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

function readPem(p) {
  if (!p) return "";
  let abs = resolve(ROOT, p);
  if (!existsSync(abs)) abs = join(ROOT, ".secrets", p);
  if (!existsSync(abs)) abs = join(ROOT, ".secrets", "keys", p.split("/").pop());
  return existsSync(abs) ? readFileSync(abs, "utf8").trim() : "";
}

const env = parseEnv(SECRETS_ENV);
const doc = {
  REAL_PAYMENT_ENABLED: env.REAL_PAYMENT_ENABLED || "true",
  WECHAT_PAY_APPID: env.WECHAT_PAY_APPID || "",
  WECHAT_PAY_MCH_ID: env.WECHAT_PAY_MCH_ID || "",
  WECHAT_PAY_CERT_SERIAL_NO: env.WECHAT_PAY_CERT_SERIAL_NO || "",
  WECHAT_PAY_API_V3_KEY: env.WECHAT_PAY_API_V3_KEY || "",
  WECHAT_PAY_PRIVATE_KEY: readPem(env.WECHAT_PAY_PRIVATE_KEY_PATH || ""),
  WECHAT_PAY_PLATFORM_PUBLIC_KEY: readPem(env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH || ""),
  WECHAT_PAY_PLATFORM_CERTIFICATE: readPem(env.WECHAT_PAY_PLATFORM_CERTIFICATE_PATH || ""),
  WECHAT_PAY_PUBLIC_KEY_ID: env.WECHAT_PAY_PUBLIC_KEY_ID || "",
  WECHAT_PAY_NOTIFY_URL: env.WECHAT_PAY_NOTIFY_URL || "",
  WX_MP_APPID: env.WX_MP_APPID || env.WECHAT_PAY_APPID || "",
  WX_MP_APPSECRET: env.WX_MP_APPSECRET || "",
  WECOM_ORDER_WEBHOOK: env.WECOM_ORDER_WEBHOOK || "",
  WECOM_MENTIONED_MOBILES: env.WECOM_MENTIONED_MOBILES || ""
};

const missing = Object.entries(doc)
  .filter(([, v]) => !v && !["WECHAT_PAY_PLATFORM_CERTIFICATE", "WECOM_MENTIONED_MOBILES"].includes(undefined) && !v)
  .map(([k]) => k);
if (doc.WECHAT_PAY_PLATFORM_CERTIFICATE) delete doc.WECHAT_PAY_PLATFORM_CERTIFICATE;
if (!doc.WECOM_MENTIONED_MOBILES) delete doc.WECOM_MENTIONED_MOBILES;

const set = Object.entries(doc).filter(([, v]) => v);
if (!doc.WECHAT_PAY_PLATFORM_PUBLIC_KEY && !doc.WECHAT_PAY_PLATFORM_CERTIFICATE) {
  console.error("缺少平台公钥/证书，无法写入");
  process.exit(1);
}

// upsert: 用 UPDATE 全量覆盖（若文档不存在则用 insert）
const command = JSON.stringify([{
  TableName: "app_secrets",
  CommandType: "UPDATE",
  Command: JSON.stringify({
    update: "app_secrets",
    updates: [{
      q: { _id: "live" },
      u: { $set: Object.fromEntries(set.map(([k, v]) => [k, v])) }
    }]
  })
}]);

try {
  execSync(`tcb db nosql execute --command '${command.replace(/'/g, "'\\''")}' --json -e ${ENV_ID}`, { stdio: "inherit" });
  console.log(`\n✅ app_secrets/live 已同步（${set.length} 个字段）：`, set.map(([k]) => k).join(", "));
} catch (error) {
  console.error("更新失败，尝试插入（首次创建）...");
  const ins = JSON.stringify([{
    TableName: "app_secrets",
    CommandType: "INSERT",
    Command: JSON.stringify({ insert: "app_secrets", documents: [{ _id: "live", ...Object.fromEntries(set) }] })
  }]);
  execSync(`tcb db nosql execute --command '${ins.replace(/'/g, "'\\''")}' --json -e ${ENV_ID}`, { stdio: "inherit" });
  console.log(`✅ app_secrets/live 已插入（${set.length} 个字段）`);
}
