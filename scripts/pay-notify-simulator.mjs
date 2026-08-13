#!/usr/bin/env node
/**
 * 微信支付回调模拟与自检工具（零第三方依赖，Node >= 18，内置 fetch）
 *
 * 用途（详见 docs/上线前支付测试清单.md）：
 *  1. self-check-encrypt  校验 API v3 密钥与 AES-256-GCM 加解密实现
 *                         默认用随机密钥自检算法；--use-real-key 用真实密钥验证配置
 *  2. build-payload       生成一份结构正确、已加密的 TRANSACTION.SUCCESS 回调报文
 *                         （存到文件供人工核对 / 对照真机回调报文结构）
 *  3. send-fake           伪造签名回调 POST 到回调 URL，断言被拒（线上负向安全测试）
 *
 * 安全约定：
 *  - 不打印密钥明文；签名永远用假值，本工具无法伪造微信平台的合法签名
 *    （验签需要微信平台私钥，只有微信侧持有），所以正向验签只能靠真机支付验证
 *  - 真实密钥只从环境变量或 .secrets/wechat-pay.env 读取（该目录已被 .gitignore 忽略）
 *
 * 用法示例：
 *   node scripts/pay-notify-simulator.mjs self-check-encrypt
 *   node scripts/pay-notify-simulator.mjs self-check-encrypt --use-real-key
 *   node scripts/pay-notify-simulator.mjs build-payload \
 *       --out-trade-no T20260701000001 --total 100 --openid oXxx --mchid 1900000000 \
 *       --appid wx47e7cc7143682291 --out /tmp/notify.json
 *   node scripts/pay-notify-simulator.mjs send-fake --url https://cloudbase-xxx.service.tcloudbase.com/wechatPayNotify
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRETS_DIR = path.resolve(__dirname, "../.secrets");

// ---------------------------------------------------------------------------
// 配置读取（只读 .secrets，绝不输出密钥值）
// ---------------------------------------------------------------------------

function parseEnvText(text) {
  const result = {};
  String(text || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) return;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key) result[key] = value;
    });
  return result;
}

function loadSecrets() {
  const file = path.join(SECRETS_DIR, "wechat-pay.env");
  if (!fs.existsSync(file)) return {};
  return parseEnvText(fs.readFileSync(file, "utf8"));
}

function getSecret(name) {
  if (process.env[name]) return process.env[name];
  return loadSecrets()[name] || "";
}

function requireApiV3Key(useRealKey) {
  // 随机测试密钥用 32 个 ASCII 字符（base64 切片），保证 utf8 字节数恒为 32
  const key = useRealKey ? getSecret("WECHAT_PAY_API_V3_KEY") : crypto.randomBytes(32).toString("base64").slice(0, 32);
  if (useRealKey && !key) {
    die(`未找到 WECHAT_PAY_API_V3_KEY：请先设置环境变量或填写 .secrets/wechat-pay.env`);
  }
  if (Buffer.byteLength(key, "utf8") !== 32) {
    die(`API v3 密钥必须是 32 字节（当前 ${Buffer.byteLength(key, "utf8")} 字节）`);
  }
  return key;
}

// ---------------------------------------------------------------------------
// AES-256-GCM（与云函数 wechatPayNotify decryptResource 的算法完全一致）
// ---------------------------------------------------------------------------

function encryptResource(plainObject, apiV3Key, associatedData = "transaction") {
  const nonce = crypto.randomBytes(12).toString("utf8");
  const plain = Buffer.from(JSON.stringify(plainObject), "utf8");
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), Buffer.from(nonce, "utf8"));
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const data = cipher.update(plain);
  const final = cipher.final();
  const authTag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([data, final, authTag]);
  return {
    algorithm: "AEAD_AES_256_GCM",
    ciphertext: ciphertext.toString("base64"),
    associated_data: associatedData,
    nonce
  };
}

function decryptResource(resource, apiV3Key) {
  if (!resource || resource.algorithm !== "AEAD_AES_256_GCM") {
    throw new Error("不支持的加密算法");
  }
  const ciphertext = Buffer.from(resource.ciphertext, "base64");
  const authTag = ciphertext.slice(ciphertext.length - 16);
  const data = ciphertext.slice(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(apiV3Key, "utf8"),
    Buffer.from(resource.nonce, "utf8")
  );
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
  }
  decipher.setAuthTag(authTag);
  const decoded = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return JSON.parse(decoded);
}

// ---------------------------------------------------------------------------
// 子命令：self-check-encrypt
// ---------------------------------------------------------------------------

function cmdSelfCheckEncrypt(useRealKey) {
  const key = requireApiV3Key(useRealKey);
  const transaction = {
    mchid: "test-mchid",
    appid: "test-appid",
    out_trade_no: "T20260701000001",
    transaction_id: "4200000000000000000000000000000000",
    trade_type: "JSAPI",
    trade_state: "SUCCESS",
    amount: { total: 100, payer_total: 100, currency: "CNY", payer_currency: "CNY" },
    success_time: new Date().toISOString().replace("T", " ").slice(0, 19),
    payer: { openid: "test-openid" }
  };
  const resource = encryptResource(transaction, key);
  const decrypted = decryptResource(resource, key);
  const ok =
    decrypted.out_trade_no === transaction.out_trade_no &&
    decrypted.amount.total === transaction.amount.total &&
    decrypted.trade_state === "SUCCESS";

  console.log(`[self-check-encrypt] AES-256-GCM 往返：${ok ? "✓ 通过" : "✗ 失败"}`);
  console.log(`[self-check-encrypt] 密钥来源：${useRealKey ? ".secrets/wechat-pay.env / 环境变量" : "随机测试密钥（未验证真实配置）"}`);
  console.log(`[self-check-encrypt] 加密报文 resource 字段：algorithm / ciphertext / associated_data / nonce`);
  console.log(`[self-check-encrypt] 明文示例（脱敏）out_trade_no=${transaction.out_trade_no} amount.total=${transaction.amount.total}`);

  if (!ok) {
    die("加解密往返不一致，请检查 API v3 密钥是否填错");
  }

  if (useRealKey) {
    console.log("");
    console.log("[self-check-encrypt] 真实密钥验证通过：说明 .secrets 里填的 WECHAT_PAY_API_V3_KEY");
    console.log("[self-check-encrypt] 与云函数 decryptResource 使用的算法/密钥一致，回调密文可正常解开。");
    console.log("[self-check-encrypt] 注意：这不代表线上环境变量已配置，线上配置需 tcb 登录后核对。");
  }
  return 0;
}

// ---------------------------------------------------------------------------
// 子命令：build-payload
// ---------------------------------------------------------------------------

function cmdBuildPayload(opts, useRealKey) {
  const key = requireApiV3Key(useRealKey);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const successTime = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const outTradeNo = opts["out-trade-no"] || `T${successTime.replace(/[^\d]/g, "")}${Math.floor(Math.random() * 9000 + 1000)}`;
  const totalFen = Math.round(Number(opts.total || 100) * 100);

  const transaction = {
    mchid: opts.mchid || "请填商户号",
    appid: opts.appid || "请填小程序 AppID",
    out_trade_no: outTradeNo,
    transaction_id: opts.transactionId || `42000${Date.now()}${Math.floor(Math.random() * 1000)}`,
    trade_type: "JSAPI",
    trade_state: "SUCCESS",
    trade_state_desc: "支付成功",
    bank_type: "OTHERS",
    attach: "",
    success_time: successTime,
    payer: { openid: opts.openid || "请填支付者 openid" },
    amount: {
      total: totalFen,
      payer_total: totalFen,
      currency: "CNY",
      payer_currency: "CNY"
    }
  };

  const notify = {
    id: `evt_${Date.now()}`,
    create_time: successTime,
    event_type: "TRANSACTION.SUCCESS",
    resource_type: "encrypt-resource",
    summary: "支付成功",
    resource: encryptResource(transaction, key)
  };

  const output = opts.out ? path.resolve(opts.out) : "";
  const text = JSON.stringify(notify, null, 2);
  if (output) {
    fs.writeFileSync(output, text + "\n");
    console.log(`[build-payload] 已生成加密回调报文 → ${output}`);
  } else {
    console.log(text);
  }
  console.log(`[build-payload] 明文 out_trade_no=${outTradeNo} amount.total(分)=${totalFen} trade_state=SUCCESS`);
  console.log("[build-payload] 注意：报文签名无法伪造（需要微信平台私钥），本文件仅供核对结构与对照真机报文。");
  return 0;
}

// ---------------------------------------------------------------------------
// 子命令：send-fake（伪造签名负向测试）
// ---------------------------------------------------------------------------

async function cmdSendFake(opts) {
  const url = opts.url || "";
  if (!/^https?:\/\//.test(url)) {
    die("请用 --url 传入回调 URL（http:// 本地或 https:// 线上）");
  }

  const now = new Date();
  const payload = {
    id: `fake_${Date.now()}`,
    create_time: now.toISOString(),
    event_type: "TRANSACTION.SUCCESS",
    resource_type: "encrypt-resource",
    summary: "伪造回调",
    resource: {
      algorithm: "AEAD_AES_256_GCM",
      ciphertext: Buffer.from("fake-data").toString("base64"),
      associated_data: "transaction",
      nonce: "fakenonce"
    }
  };

  const headers = {
    "Content-Type": "application/json",
    "Wechatpay-Timestamp": String(Math.floor(now.getTime() / 1000)),
    "Wechatpay-Nonce": "fake-nonce",
    "Wechatpay-Signature": Buffer.from("fake-signature-for-negative-test").toString("base64"),
    "Wechatpay-Serial": "FAKESERIAL"
  };

  console.log(`[send-fake] POST ${url}`);
  console.log(`[send-fake] 签名头（伪造）：timestamp=${headers["Wechatpay-Timestamp"]} nonce=${headers["Wechatpay-Nonce"]} signature=假值`);
  console.log("[send-fake] 预期：验签失败，应返回 401 / FAIL（伪造回调被拒）");

  const expectReject = opts["expect-reject"] !== "false";
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
  } catch (error) {
    die(`请求失败：${error.message}\n（本地测试请先起一个假回调服务，或确认 URL 可达）`);
  }

  const body = await res.text();
  const bodyMsg = body.slice(0, 300);
  const rejectedBySignature = res.status === 401 || /签名错误/.test(body);
  const configMissing = res.status >= 500 && /未配置|平台公钥|平台证书|platform/i.test(body);
  const accepted = res.status === 200 && !/签名错误/.test(body);
  console.log(`[send-fake] HTTP ${res.status}`);
  console.log(`[send-fake] 响应体：${bodyMsg}`);

  if (expectReject) {
    if (rejectedBySignature) {
      console.log(`[send-fake] ✓ 伪造回调被拒（${res.status}），验签防线有效`);
      return 0;
    }
    if (configMissing) {
      die(`✗ 线上返回 5xx 且提示支付配置缺失（${bodyMsg}）——伪造被拒只是因为验签无法执行，` +
        "真实支付回调同样会被拒、订单无法入账！请核对线上 wechatPayNotify 是否配置了 " +
        "WECHAT_PAY_PLATFORM_PUBLIC_KEY 或 WECHAT_PAY_PLATFORM_CERTIFICATE");
    }
    if (accepted) {
      die(`✗ 伪造回调被接受（HTTP 200）！若这是线上环境，说明验签没有生效，立即停用支付排查`);
    }
    console.log(`[send-fake] ⚠ 返回 ${res.status}，无法确认验签防线，请人工核对线上环境变量`);
    return 2;
  }
  console.log(`[send-fake] 观测模式（--expect-reject=false）：HTTP ${res.status}`);
  return 0;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function die(message) {
  console.error(`\n错误：${message}\n`);
  process.exit(1);
}

function printUsage() {
  console.log(`微信支付回调模拟与自检工具

用法：
  node scripts/pay-notify-simulator.mjs self-check-encrypt [--use-real-key]
  node scripts/pay-notify-simulator.mjs build-payload [--out-trade-no ...] [--total 元] [--openid ...] [--mchid ...] [--appid ...] [--out 文件路径]
  node scripts/pay-notify-simulator.mjs send-fake --url <回调URL> [--expect-reject=false]

子命令：
  self-check-encrypt   AES-256-GCM 加解密往返自检。
                       --use-real-key 时读取 .secrets/wechat-pay.env 的真实 API v3 密钥验证配置；
                       默认用随机密钥只验证算法实现。
  build-payload        生成一份结构正确、已加密的 TRANSACTION.SUCCESS 回调报文。
  send-fake            伪造签名回调 POST 到指定 URL，断言被拒（线上负向安全测试）。

真实密钥来源：环境变量或 .secrets/wechat-pay.env（不提交 git，不会被打印）。`);
}

const [, , command, ...rest] = process.argv;
const flags = {};
for (let i = 0; i < rest.length; i += 1) {
  const arg = rest[i];
  if (arg === "--use-real-key") {
    flags.useRealKey = true;
  } else if (arg.startsWith("--")) {
    const eq = arg.indexOf("=");
    if (eq > 0) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else if (rest[i + 1] && !rest[i + 1].startsWith("--")) {
      flags[arg.slice(2)] = rest[i + 1];
      i += 1;
    } else {
      flags[arg.slice(2)] = true;
    }
  }
}

try {
  switch (command) {
    case "self-check-encrypt":
      process.exitCode = cmdSelfCheckEncrypt(Boolean(flags.useRealKey));
      break;
    case "build-payload":
      process.exitCode = cmdBuildPayload(flags, Boolean(flags.useRealKey));
      break;
    case "send-fake":
      await cmdSendFake(flags);
      break;
    default:
      printUsage();
      process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  die(error && error.message ? error.message : String(error));
}
