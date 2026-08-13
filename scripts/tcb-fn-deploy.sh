#!/usr/bin/env bash
# 云函数部署入口。支付相关函数禁止直接 tcb fn deploy --force。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SAFE="${ROOT}/scripts/deploy-cloudfunctions-safe.sh"

if [[ $# -lt 1 ]]; then
  echo "用法: $0 <functionName> [更多函数名...]" >&2
  echo "支付函数请走: $SAFE createPayment" >&2
  exit 1
fi

pay=0
other=()
for name in "$@"; do
  case "$name" in
    createPayment|wechatPayNotify) pay=1 ;;
    *) other+=("$name") ;;
  esac
done

if [[ $pay -eq 1 ]]; then
  echo "支付函数改走安全脚本（自动带 .secrets，避免冲掉密钥）"
  exec "$SAFE" "$@"
fi

exec "$SAFE" "${other[@]}"
