#!/usr/bin/env bash
# 安全部署云函数：默认不冲掉云端支付密钥。
#
# 用法：
#   ./scripts/deploy-cloudfunctions-safe.sh                  # 部署全部：支付函数仅 code update
#   ./scripts/deploy-cloudfunctions-safe.sh memberCenter    # 指定函数
#   ./scripts/deploy-cloudfunctions-safe.sh createPayment   # 仅更新代码，保留云端 env
#   ./scripts/deploy-cloudfunctions-safe.sh --with-pay-secrets createPayment wechatPayNotify
#   ./scripts/deploy-cloudfunctions-safe.sh --with-pay-secrets   # 全部 + 支付密钥从 .secrets 写回
#   ./scripts/deploy-cloudfunctions-safe.sh --dry-run
#
# 说明：
# - createPayment / wechatPayNotify 的 tcb 全量 deploy 会用配置里的 envVariables
#   **整份覆盖**云端环境变量。仓库里的 cloudbaserc.json 不含私钥，直接 deploy 会弄丢支付。
# - 默认对这两个函数走 `tcb fn code update`（只更代码）。
# - 需要改密钥/补密钥时加 --with-pay-secrets，从 .secrets/wechat-pay.env + keys/*.pem 组装后部署。
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP="${ROOT}/sanmuhe-miniprogram"
CFG_MAIN="${MP}/cloudbaserc.json"
SECRETS_ENV="${ROOT}/.secrets/wechat-pay.env"
ENV_ID="${ENV_ID:-}"
DRY_RUN=0
WITH_PAY_SECRETS=0
NAMES=()

PAY_FNS=(createPayment wechatPayNotify)

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage 0 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --with-pay-secrets) WITH_PAY_SECRETS=1; shift ;;
    -e|--env) ENV_ID="${2:-}"; shift 2 ;;
    --) shift; break ;;
    -*)
      echo "未知参数: $1" >&2
      usage 1
      ;;
    *)
      NAMES+=("$1"); shift ;;
  esac
done

if [[ -z "${ENV_ID}" ]]; then
  ENV_ID="$(node -e "
    const fs=require('fs');
    const p='${CFG_MAIN}';
    const j=JSON.parse(fs.readFileSync(p,'utf8'));
    process.stdout.write(j.envId||'');
  ")"
fi

if [[ -z "${ENV_ID}" ]]; then
  echo "无法解析 envId，请传 --env <envId>" >&2
  exit 1
fi

if ! command -v tcb >/dev/null 2>&1; then
  echo "未找到 tcb CLI，请先安装 @cloudbase/cli" >&2
  exit 1
fi

if [[ ! -f "${CFG_MAIN}" ]]; then
  echo "缺少 ${CFG_MAIN}" >&2
  exit 1
fi

is_pay_fn() {
  local n="$1"
  local p
  for p in "${PAY_FNS[@]}"; do
    [[ "$n" == "$p" ]] && return 0
  done
  return 1
}

# 未指定名字 → 读 cloudbaserc 全部函数名
if [[ ${#NAMES[@]} -eq 0 ]]; then
  mapfile -t NAMES < <(node -e "
    const j=require('${CFG_MAIN}');
    (j.functions||[]).forEach(f => console.log(f.name));
  ")
fi

if [[ ${#NAMES[@]} -eq 0 ]]; then
  echo "没有要部署的函数" >&2
  exit 1
fi

echo "Project:  ${MP}"
echo "Env:      ${ENV_ID}"
echo "Functions:${NAMES[*]}"
echo "Pay mode: $([[ ${WITH_PAY_SECRETS} -eq 1 ]] && echo 'code+secrets from .secrets' || echo 'code-only for pay fns')"
echo "Dry-run:  ${DRY_RUN}"
echo

run() {
  if [[ ${DRY_RUN} -eq 1 ]]; then
    echo "[dry-run] $*"
    return 0
  fi
  "$@"
}

TMP_PAY_CFG=""
cleanup() {
  if [[ -n "${TMP_PAY_CFG}" && -f "${TMP_PAY_CFG}" ]]; then
    rm -f "${TMP_PAY_CFG}"
  fi
}
trap cleanup EXIT

build_pay_config() {
  if [[ ! -f "${SECRETS_ENV}" ]]; then
    echo "缺少 ${SECRETS_ENV}，无法 --with-pay-secrets" >&2
    exit 1
  fi
  TMP_PAY_CFG="$(mktemp /tmp/cloudbaserc.pay.XXXXXX.json)"
  chmod 600 "${TMP_PAY_CFG}"
  # 通过环境变量传路径，避免 heredoc 泄漏密钥
  export TMP_PAY_CFG ROOT SECRETS_ENV
  export ENV_ID
  node << 'NODE'
const fs = require("fs");
const path = require("path");
const root = process.env.ROOT;
const envPath = process.env.SECRETS_ENV;
const outPath = process.env.TMP_PAY_CFG;
const envId = process.env.ENV_ID;

const envText = fs.readFileSync(envPath, "utf8");
const env = {};
for (const line of envText.split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  env[k] = v;
}

function readPem(p) {
  if (!p) return "";
  const abs = path.isAbsolute(p) ? p : path.join(root, p);
  if (!fs.existsSync(abs)) {
    throw new Error("缺少密钥文件: " + abs);
  }
  return fs.readFileSync(abs, "utf8").trim();
}

const privateKey = readPem(env.WECHAT_PAY_PRIVATE_KEY_PATH);
const platformPub = env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH
  ? readPem(env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH)
  : "";
const platformCert = env.WECHAT_PAY_PLATFORM_CERTIFICATE_PATH
  ? readPem(env.WECHAT_PAY_PLATFORM_CERTIFICATE_PATH)
  : "";

function stripEmpty(obj) {
  for (const k of Object.keys(obj)) {
    if (obj[k] === "" || obj[k] == null) delete obj[k];
  }
  return obj;
}

const createPaymentEnv = stripEmpty({
  REAL_PAYMENT_ENABLED: env.REAL_PAYMENT_ENABLED || "true",
  WECHAT_PAY_APPID: env.WECHAT_PAY_APPID,
  WECHAT_PAY_MCH_ID: env.WECHAT_PAY_MCH_ID,
  WECHAT_PAY_CERT_SERIAL_NO: env.WECHAT_PAY_CERT_SERIAL_NO,
  WECHAT_PAY_API_V3_KEY: env.WECHAT_PAY_API_V3_KEY || "",
  WECHAT_PAY_PRIVATE_KEY: privateKey,
  WECHAT_PAY_PLATFORM_PUBLIC_KEY: platformPub,
  WECHAT_PAY_PLATFORM_CERTIFICATE: platformCert,
  WECHAT_PAY_NOTIFY_URL: env.WECHAT_PAY_NOTIFY_URL,
  WECHAT_PAY_PUBLIC_KEY_ID: env.WECHAT_PAY_PUBLIC_KEY_ID || "",
  WECOM_ORDER_WEBHOOK: env.WECOM_ORDER_WEBHOOK || "",
  WECOM_MENTIONED_MOBILES: env.WECOM_MENTIONED_MOBILES || ""
});

const notifyEnv = stripEmpty({
  WECHAT_PAY_API_V3_KEY: env.WECHAT_PAY_API_V3_KEY || "",
  WECHAT_PAY_PLATFORM_PUBLIC_KEY: platformPub,
  WECHAT_PAY_PLATFORM_CERTIFICATE: platformCert,
  WECHAT_PAY_PUBLIC_KEY_ID: env.WECHAT_PAY_PUBLIC_KEY_ID || "",
  WECHAT_PAY_MCH_ID: env.WECHAT_PAY_MCH_ID,
  WECHAT_PAY_APPID: env.WECHAT_PAY_APPID,
  WECOM_ORDER_WEBHOOK: env.WECOM_ORDER_WEBHOOK || "",
  WECOM_MENTIONED_MOBILES: env.WECOM_MENTIONED_MOBILES || ""
});

if (!createPaymentEnv.WECHAT_PAY_PRIVATE_KEY || !createPaymentEnv.WECHAT_PAY_CERT_SERIAL_NO) {
  throw new Error("支付密钥不完整：需要 CERT_SERIAL + PRIVATE_KEY");
}
if (!createPaymentEnv.WECHAT_PAY_PLATFORM_PUBLIC_KEY && !createPaymentEnv.WECHAT_PAY_PLATFORM_CERTIFICATE) {
  throw new Error("支付密钥不完整：需要 PLATFORM_PUBLIC_KEY 或 PLATFORM_CERTIFICATE");
}

const cfg = {
  version: "2.0",
  envId,
  functionRoot: path.join(root, "sanmuhe-miniprogram/cloudfunctions"),
  functions: [
    {
      name: "createPayment",
      runtime: "Nodejs16.13",
      handler: "index.main",
      timeout: 30,
      installDependency: true,
      envVariables: createPaymentEnv
    },
    {
      name: "wechatPayNotify",
      runtime: "Nodejs16.13",
      handler: "index.main",
      timeout: 30,
      installDependency: true,
      envVariables: notifyEnv
    }
  ]
};

fs.writeFileSync(outPath, JSON.stringify(cfg, null, 2), { mode: 0o600 });
// 只打印 key 名，不打印值
console.log("pay-config keys createPayment:", Object.keys(createPaymentEnv).join(", "));
console.log("pay-config keys wechatPayNotify:", Object.keys(notifyEnv).join(", "));
console.log("privateKey length:", privateKey.length);
NODE
}

failed=0
code_only_pay=()
full_deploy=()
pay_secret_deploy=()

for name in "${NAMES[@]}"; do
  if is_pay_fn "$name"; then
    if [[ ${WITH_PAY_SECRETS} -eq 1 ]]; then
      pay_secret_deploy+=("$name")
    else
      code_only_pay+=("$name")
    fi
  else
    full_deploy+=("$name")
  fi
done

# 1) 非支付函数：正常 deploy（用主 cloudbaserc）
for name in "${full_deploy[@]+"${full_deploy[@]}"}"; do
  [[ -z "${name:-}" ]] && continue
  echo ">>> deploy (config+code)  ${name}"
  if ! run bash -c "cd '${MP}' && yes | tcb fn deploy '${name}' --force -e '${ENV_ID}'"; then
    echo "FAIL: ${name}" >&2
    failed=1
  else
    echo "OK:   ${name}"
  fi
  echo
done

# 2) 支付函数：仅更新代码
for name in "${code_only_pay[@]+"${code_only_pay[@]}"}"; do
  [[ -z "${name:-}" ]] && continue
  echo ">>> code update only   ${name}  (保留云端环境变量)"
  if ! run bash -c "cd '${MP}' && tcb fn code update '${name}' -e '${ENV_ID}'"; then
    echo "FAIL: ${name} code update" >&2
    echo "  若函数尚不存在，请先执行: $0 --with-pay-secrets ${name}" >&2
    failed=1
  else
    echo "OK:   ${name} (code only)"
  fi
  echo
done

# 3) 支付函数：带 .secrets 全量部署
if [[ ${#pay_secret_deploy[@]} -gt 0 ]]; then
  echo ">>> build pay config from .secrets (values not printed)"
  if [[ ${DRY_RUN} -eq 1 ]]; then
    echo "[dry-run] would load ${SECRETS_ENV} and deploy: ${pay_secret_deploy[*]}"
  else
    build_pay_config
    for name in "${pay_secret_deploy[@]}"; do
      echo ">>> deploy + pay secrets ${name}"
      if ! run bash -c "cd '${ROOT}' && yes | tcb fn deploy '${name}' --force -e '${ENV_ID}' --config-file '${TMP_PAY_CFG}'"; then
        echo "FAIL: ${name} with secrets" >&2
        failed=1
      else
        echo "OK:   ${name} (with secrets)"
      fi
      echo
    done
  fi
fi

# 健康检查（不打印密钥）
if [[ ${DRY_RUN} -eq 0 ]] && [[ ${failed} -eq 0 ]]; then
  if printf '%s\n' "${NAMES[@]}" | grep -qx 'createPayment' || [[ ${WITH_PAY_SECRETS} -eq 1 ]]; then
    echo ">>> health check createPayment"
    if out="$(tcb fn invoke createPayment -e "${ENV_ID}" --params '{"action":"health"}' 2>&1)"; then
      if echo "$out" | grep -q '"ready":true'; then
        echo "OK:   paymentConfig.ready=true"
      else
        echo "WARN: paymentConfig 可能未就绪，请检查输出中的 ready/missing（勿粘贴密钥到群聊）"
        echo "$out" | grep -E 'ready|missing|message|RetMsg' | head -10 || true
      fi
    else
      echo "WARN: health invoke 失败"
    fi
  fi
fi

if [[ ${failed} -ne 0 ]]; then
  echo
  echo "部分函数部署失败。"
  exit 1
fi

echo
echo "全部完成。"
echo "提示：日常改代码请用本脚本；只有换密钥时才加 --with-pay-secrets。"
echo "禁止：tcb fn deploy createPayment --force 仅用仓库 cloudbaserc.json（会冲掉私钥）。"
