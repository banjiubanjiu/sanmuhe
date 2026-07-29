#!/usr/bin/env bash
# 从 .secrets/wechat-pay.env 读取配置并打印「将写入的变量名」（不打印密钥内容）
# 实际写入云函数请由助手执行 tcb，或你确认后运行完整部署脚本。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/.secrets/wechat-pay.env"
ENV_ID="${ENV_ID:-cloudbase-d2gq023qn50e9d82f}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
set -a
# 只 source 非注释行
source <(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$')
set +a

echo "env file: $ENV_FILE"
echo "cloud env: $ENV_ID"
echo "APPID: ${WECHAT_PAY_APPID:-}"
echo "MCH_ID: ${WECHAT_PAY_MCH_ID:-}"
echo "CERT_SERIAL set: $([[ -n "${WECHAT_PAY_CERT_SERIAL_NO:-}" ]] && echo yes || echo NO)"
echo "API_V3_KEY set: $([[ -n "${WECHAT_PAY_API_V3_KEY:-}" ]] && echo yes || echo NO)"
echo "PRIVATE_KEY_PATH: ${WECHAT_PAY_PRIVATE_KEY_PATH:-}"
echo "PRIVATE_KEY file exists: $([[ -f "${WECHAT_PAY_PRIVATE_KEY_PATH:-}" ]] && echo yes || echo NO)"
echo "PLATFORM_CERT_PATH: ${WECHAT_PAY_PLATFORM_CERTIFICATE_PATH:-}"
echo "PLATFORM_CERT file exists: $([[ -f "${WECHAT_PAY_PLATFORM_CERTIFICATE_PATH:-}" ]] && echo yes || echo NO)"
echo "PLATFORM_PUB_PATH: ${WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH:-}"
echo "PLATFORM_PUB file exists: $([[ -f "${WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH:-}" ]] && echo yes || echo NO)"
echo "NOTIFY_URL: ${WECHAT_PAY_NOTIFY_URL:-}"
echo "REAL_PAYMENT_ENABLED: ${REAL_PAYMENT_ENABLED:-false}"
echo "MEMBER_TEST_MODE: ${MEMBER_TEST_MODE:-true}"
echo ""
echo "检查通过后告诉助手「密钥已填好」，由助手写入云函数并部署。"
