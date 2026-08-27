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
import { execFileSync } from "child_process";

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
  WECOM_RESERVATION_WEBHOOK: env.WECOM_RESERVATION_WEBHOOK || "",
  WECOM_MENTIONED_MOBILES: env.WECOM_MENTIONED_MOBILES || ""
};

if (!doc.WECHAT_PAY_PLATFORM_PUBLIC_KEY && !doc.WECHAT_PAY_PLATFORM_CERTIFICATE) {
  console.error("缺少平台公钥/证书，无法写入");
  process.exit(1);
}
const set = Object.fromEntries(Object.entries(doc).filter(([, value]) => value));

// Mongo UPDATE 的 upsert=true 同时覆盖已有 live 文档和首次创建场景。
const command = JSON.stringify([{
  TableName: "app_secrets",
  CommandType: "UPDATE",
  Command: JSON.stringify({
    update: "app_secrets",
    updates: [{
      q: { _id: "live" },
      u: { $set: set, $setOnInsert: { _id: "live" } },
      upsert: true,
      multi: false
    }]
  })
}]);

execFileSync(
  "tcb",
  ["db", "nosql", "execute", "--command", command, "--json", "-e", ENV_ID],
  { stdio: "inherit" }
);
const fieldNames = Object.keys(set);
console.log(`\n✅ app_secrets/live 已同步（${fieldNames.length} 个字段）：`, fieldNames.join(", "));
