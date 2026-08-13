#!/usr/bin/env bash
# 安全部署云函数：默认不冲掉云端支付密钥 / 快递100密钥。
#
# 用法：
#   ./scripts/deploy-cloudfunctions-safe.sh                  # 部署全部：敏感函数仅 code update 或从 .secrets 注入
#   ./scripts/deploy-cloudfunctions-safe.sh memberCenter    # 指定函数
#   ./scripts/deploy-cloudfunctions-safe.sh createPayment   # 有 .secrets 则自动带密钥；否则只更代码
#   ./scripts/deploy-cloudfunctions-safe.sh listMyRecords   # 有 .secrets/kuaidi100.env 则注入密钥部署，否则只更代码
#   ./scripts/deploy-cloudfunctions-safe.sh --with-pay-secrets createPayment wechatPayNotify
#   ./scripts/deploy-cloudfunctions-safe.sh --no-pay-secrets createPayment   # 强制只更代码
#   ./scripts/deploy-cloudfunctions-safe.sh --with-kuaidi-secrets listMyRecords
#   ./scripts/deploy-cloudfunctions-safe.sh --dry-run
#
# 说明：
# - createPayment / wechatPayNotify 的 tcb 全量 deploy 会用配置里的 envVariables
#   **整份覆盖**云端环境变量。仓库里的 cloudbaserc.json 不含私钥，直接 deploy 会弄丢支付。
# - 有 .secrets/wechat-pay.env + pem 时：自动带密钥全量部署（与快递100相同策略）。
# - 没有本地密钥时：只走 `tcb fn code update`，保留云端 env。
# - --with-pay-secrets 强制要求本地密钥齐全；--no-pay-secrets 强制只更代码。
# - listMyRecords 含快递100密钥：仓库 cloudbaserc 保持空占位；
#   若存在 .secrets/kuaidi100.env（含 CUSTOMER+KEY）则自动注入全量部署，否则只更代码保留云端。
# - 强制要求注入快递密钥时加 --with-kuaidi-secrets（文件缺失则失败）。
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP="${ROOT}/sanmuhe-miniprogram"
CFG_MAIN="${MP}/cloudbaserc.json"
SECRETS_ENV="${ROOT}/.secrets/wechat-pay.env"
KUAIDI_ENV="${ROOT}/.secrets/kuaidi100.env"
ENV_ID="${ENV_ID:-}"
DRY_RUN=0
WITH_PAY_SECRETS=0
NO_PAY_SECRETS=0
WITH_KUAIDI_SECRETS=0
NAMES=()

PAY_FNS=(createPayment wechatPayNotify)
LOGISTICS_FNS=(listMyRecords)

usage() {
  sed -n '2,24p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage 0 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --with-pay-secrets) WITH_PAY_SECRETS=1; shift ;;
    --no-pay-secrets) NO_PAY_SECRETS=1; shift ;;
    --with-kuaidi-secrets) WITH_KUAIDI_SECRETS=1; shift ;;
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

if [[ ${WITH_PAY_SECRETS} -eq 1 && ${NO_PAY_SECRETS} -eq 1 ]]; then
  echo "不能同时使用 --with-pay-secrets 与 --no-pay-secrets" >&2
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

is_logistics_fn() {
  local n="$1"
  local p
  for p in "${LOGISTICS_FNS[@]}"; do
    [[ "$n" == "$p" ]] && return 0
  done
  return 1
}

# 读取 .secrets/wechat-pay.env；不打印密钥。返回码 0 = 可自动注入支付密钥
pay_secrets_ready() {
  [[ -f "${SECRETS_ENV}" ]] || return 1
  node -e "
    const fs=require('fs');
    const path=require('path');
    const root=process.argv[2];
    const text=fs.readFileSync(process.argv[1],'utf8');
    const env={};
    for (const line of text.split(/\\n/)) {
      const t=line.trim();
      if (!t || t.startsWith('#')) continue;
      const i=t.indexOf('=');
      if (i<0) continue;
      let v=t.slice(i+1).trim();
      if ((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\"))) v=v.slice(1,-1);
      env[t.slice(0,i).trim()]=v;
    }
    const resolve=(p)=>!p? '': (path.isAbsolute(p)? p: path.join(root,p));
    const priv=resolve(env.WECHAT_PAY_PRIVATE_KEY_PATH||'');
    const pub=resolve(env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH||'');
    const cert=resolve(env.WECHAT_PAY_PLATFORM_CERTIFICATE_PATH||'');
    const serial=String(env.WECHAT_PAY_CERT_SERIAL_NO||'').trim();
    if (!serial || !priv || !fs.existsSync(priv) || !fs.statSync(priv).isFile()) process.exit(2);
    const hasPub=pub && fs.existsSync(pub) && fs.statSync(pub).isFile();
    const hasCert=cert && fs.existsSync(cert) && fs.statSync(cert).isFile();
    if (!hasPub && !hasCert) process.exit(2);
    process.exit(0);
  " "${SECRETS_ENV}" "${ROOT}" 2>/dev/null
}

# 读取 .secrets/kuaidi100.env；stdout 仅打印 status 行，密钥不输出
# 返回码 0 = 两字段齐全
kuaidi_secrets_ready() {
  [[ -f "${KUAIDI_ENV}" ]] || return 1
  node -e "
    const fs=require('fs');
    const text=fs.readFileSync(process.argv[1],'utf8');
    const env={};
    for (const line of text.split(/\\n/)) {
      const t=line.trim();
      if (!t || t.startsWith('#')) continue;
      const i=t.indexOf('=');
      if (i<0) continue;
      let v=t.slice(i+1).trim();
      if ((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\"))) v=v.slice(1,-1);
      env[t.slice(0,i).trim()]=v;
    }
    const c=String(env.KUAIDI100_CUSTOMER||'').trim();
    const k=String(env.KUAIDI100_KEY||'').trim();
    if (!c || !k) process.exit(2);
    process.exit(0);
  " "${KUAIDI_ENV}" 2>/dev/null
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

KUAIDI_FILE_OK=0
if kuaidi_secrets_ready; then
  KUAIDI_FILE_OK=1
fi
PAY_FILE_OK=0
if pay_secrets_ready; then
  PAY_FILE_OK=1
fi

echo "Project:  ${MP}"
echo "Env:      ${ENV_ID}"
echo "Functions:${NAMES[*]}"
if [[ ${NO_PAY_SECRETS} -eq 1 ]]; then
  echo "Pay mode: code-only (--no-pay-secrets)"
elif [[ ${WITH_PAY_SECRETS} -eq 1 ]]; then
  echo "Pay mode: force inject from .secrets/wechat-pay.env"
elif [[ ${PAY_FILE_OK} -eq 1 ]]; then
  echo "Pay mode: auto inject from .secrets/wechat-pay.env when deploying pay fns"
else
  echo "Pay mode: code-only for pay fns (preserve cloud env; add .secrets/wechat-pay.env to inject)"
fi
if [[ ${WITH_KUAIDI_SECRETS} -eq 1 ]]; then
  echo "Kuaidi:   force inject from .secrets/kuaidi100.env"
elif [[ ${KUAIDI_FILE_OK} -eq 1 ]]; then
  echo "Kuaidi:   auto inject from .secrets/kuaidi100.env when deploying listMyRecords"
else
  echo "Kuaidi:   code-only for listMyRecords (preserve cloud env; add .secrets/kuaidi100.env to inject)"
fi
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
TMP_KUAIDI_CFG=""
cleanup() {
  if [[ -n "${TMP_PAY_CFG}" && -f "${TMP_PAY_CFG}" ]]; then
    rm -f "${TMP_PAY_CFG}"
  fi
  if [[ -n "${TMP_KUAIDI_CFG}" && -f "${TMP_KUAIDI_CFG}" ]]; then
    rm -f "${TMP_KUAIDI_CFG}"
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
  // 相对路径：必须在小程序根目录执行 tcb，避免 cwd+绝对路径拼成双前缀
  functionRoot: "cloudfunctions",
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
console.log("pay-config keys createPayment:", Object.keys(createPaymentEnv).join(", "));
console.log("pay-config keys wechatPayNotify:", Object.keys(notifyEnv).join(", "));
console.log("privateKey length:", privateKey.length);
NODE
}

# 从主 cloudbaserc 取 listMyRecords 定义，注入快递100密钥到临时配置
build_kuaidi_config() {
  if [[ ! -f "${KUAIDI_ENV}" ]]; then
    echo "缺少 ${KUAIDI_ENV}，无法注入快递100密钥" >&2
    exit 1
  fi
  TMP_KUAIDI_CFG="$(mktemp /tmp/cloudbaserc.kuaidi.XXXXXX.json)"
  chmod 600 "${TMP_KUAIDI_CFG}"
  export TMP_KUAIDI_CFG ROOT KUAIDI_ENV CFG_MAIN ENV_ID
  node << 'NODE'
const fs = require("fs");
const path = require("path");
const root = process.env.ROOT;
const envPath = process.env.KUAIDI_ENV;
const cfgMain = process.env.CFG_MAIN;
const outPath = process.env.TMP_KUAIDI_CFG;
const envId = process.env.ENV_ID;

const envText = fs.readFileSync(envPath, "utf8");
const env = {};
for (const line of envText.split(/\n/)) {
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

const customer = String(env.KUAIDI100_CUSTOMER || "").trim();
const key = String(env.KUAIDI100_KEY || "").trim();
if (!customer || !key) {
  throw new Error("kuaidi100.env 需同时填写 KUAIDI100_CUSTOMER 与 KUAIDI100_KEY");
}

const main = JSON.parse(fs.readFileSync(cfgMain, "utf8"));
const base = (main.functions || []).find((f) => f.name === "listMyRecords") || {
  name: "listMyRecords",
  runtime: "Nodejs16.13",
  handler: "index.main"
};

const envVariables = Object.assign({}, base.envVariables || {}, {
  KUAIDI100_CUSTOMER: customer,
  KUAIDI100_KEY: key
});
// 仓库占位空串不要覆盖
for (const k of Object.keys(envVariables)) {
  if (envVariables[k] === "" || envVariables[k] == null) {
    if (k !== "KUAIDI100_CUSTOMER" && k !== "KUAIDI100_KEY") {
      delete envVariables[k];
    }
  }
}

// functionRoot 相对「小程序根」：部署时必须 cd 到 sanmuhe-miniprogram
const cfg = {
  version: main.version || "2.0",
  envId: envId || main.envId,
  functionRoot: "cloudfunctions",
  functions: [
    Object.assign({}, base, {
      name: "listMyRecords",
      runtime: base.runtime || "Nodejs16.13",
      handler: base.handler || "index.main",
      installDependency: base.installDependency !== false,
      envVariables
    })
  ]
};

fs.writeFileSync(outPath, JSON.stringify(cfg, null, 2), { mode: 0o600 });
console.log("kuaidi-config: injected CUSTOMER+KEY (lens", customer.length + "," + key.length + ") into listMyRecords");
NODE
}

failed=0
code_only_pay=()
code_only_logistics=()
full_deploy=()
pay_secret_deploy=()
kuaidi_secret_deploy=()

for name in "${NAMES[@]}"; do
  if is_pay_fn "$name"; then
    if [[ ${NO_PAY_SECRETS} -eq 1 ]]; then
      code_only_pay+=("$name")
    elif [[ ${WITH_PAY_SECRETS} -eq 1 ]]; then
      pay_secret_deploy+=("$name")
    elif [[ ${PAY_FILE_OK} -eq 1 ]]; then
      # 有本地密钥 → 自动注入，避免用仓库 cloudbaserc 冲掉云端支付密钥
      pay_secret_deploy+=("$name")
    else
      code_only_pay+=("$name")
    fi
  elif is_logistics_fn "$name"; then
    if [[ ${WITH_KUAIDI_SECRETS} -eq 1 ]]; then
      kuaidi_secret_deploy+=("$name")
    elif [[ ${KUAIDI_FILE_OK} -eq 1 ]]; then
      # 有本地密钥文件 → 自动注入部署，避免用空 cloudbaserc 冲掉云端
      kuaidi_secret_deploy+=("$name")
    else
      code_only_logistics+=("$name")
    fi
  else
    full_deploy+=("$name")
  fi
done

# 1) 普通函数：正常 deploy（用主 cloudbaserc）
for name in "${full_deploy[@]+"${full_deploy[@]}"}"; do
  [[ -z "${name:-}" ]] && continue
  if is_pay_fn "$name"; then
    echo "REFUSE: ${name} 禁止用仓库 cloudbaserc 全量 deploy（会冲掉支付密钥）" >&2
    failed=1
    continue
  fi
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

# 2b) 物流函数：无本地密钥时只更代码
for name in "${code_only_logistics[@]+"${code_only_logistics[@]}"}"; do
  [[ -z "${name:-}" ]] && continue
  echo ">>> code update only   ${name}  (保留云端快递100密钥)"
  if [[ ${WITH_KUAIDI_SECRETS} -eq 1 ]]; then
    echo "FAIL: --with-kuaidi-secrets 但 ${KUAIDI_ENV} 不完整" >&2
    failed=1
    continue
  fi
  if ! run bash -c "cd '${MP}' && tcb fn code update '${name}' -e '${ENV_ID}'"; then
    echo "FAIL: ${name} code update" >&2
    echo "  可先准备 ${KUAIDI_ENV} 后执行: $0 --with-kuaidi-secrets ${name}" >&2
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
      if ! run bash -c "cd '${MP}' && yes | tcb fn deploy '${name}' --force -e '${ENV_ID}' --config-file '${TMP_PAY_CFG}'"; then
        echo "FAIL: ${name} with secrets" >&2
        failed=1
      else
        echo "OK:   ${name} (with secrets)"
      fi
      echo
    done
  fi
fi

# 4) 物流函数：从 .secrets/kuaidi100.env 注入后部署
if [[ ${#kuaidi_secret_deploy[@]} -gt 0 ]]; then
  echo ">>> build kuaidi config from .secrets (values not printed)"
  if [[ ${DRY_RUN} -eq 1 ]]; then
    echo "[dry-run] would load ${KUAIDI_ENV} and deploy: ${kuaidi_secret_deploy[*]}"
  else
    if [[ ${WITH_KUAIDI_SECRETS} -eq 1 ]] || [[ ${KUAIDI_FILE_OK} -eq 1 ]]; then
      build_kuaidi_config
    else
      echo "FAIL: 无法注入 kuaidi 密钥" >&2
      failed=1
    fi
    if [[ ${failed} -eq 0 ]]; then
      for name in "${kuaidi_secret_deploy[@]}"; do
        echo ">>> deploy + kuaidi secrets ${name}"
        # 配置里 functionRoot=cloudfunctions，必须在小程序根目录执行
        if ! run bash -c "cd '${MP}' && yes | tcb fn deploy '${name}' --force -e '${ENV_ID}' --config-file '${TMP_KUAIDI_CFG}'"; then
          echo "FAIL: ${name} with kuaidi secrets" >&2
          failed=1
        else
          echo "OK:   ${name} (with kuaidi secrets)"
        fi
        echo
      done
    fi
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
echo "提示：日常改代码请用本脚本。"
echo "  支付函数：有 .secrets/wechat-pay.env 会自动带密钥；禁止 tcb fn deploy --force"
echo "  快递100：密钥放 .secrets/kuaidi100.env，部署 listMyRecords 会自动注入；仓库 cloudbaserc 保持空"
echo "禁止：tcb fn deploy createPayment/listMyRecords --force 仅用仓库 cloudbaserc.json（会冲掉密钥）。"
