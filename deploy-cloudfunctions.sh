#!/usr/bin/env bash
# Deploy all Sanmuhe cloud functions via WeChat DevTools CLI (Linux).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PROJECT="${ROOT}/sanmuhe-miniprogram"
ENV_ID="${1:-}"
CLI="${WECHAT_DEVTOOLS_CLI:-wechat-devtools-cli}"

if [[ -z "${ENV_ID}" ]]; then
  ENV_ID="$(node -e "const m=require('fs').readFileSync('${PROJECT}/config/cloud.js','utf8').match(/envId:\\s*\\\"([^\\\"]+)\\\"/); process.stdout.write(m?m[1]:'')")"
fi

if [[ -z "${ENV_ID}" ]]; then
  echo "envId required: $0 <envId>" >&2
  exit 1
fi

if ! command -v "${CLI}" >/dev/null 2>&1; then
  echo "WeChat DevTools CLI not found: ${CLI}" >&2
  exit 1
fi

mapfile -t NAMES < <(find "${PROJECT}/cloudfunctions" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
echo "Project: ${PROJECT}"
echo "Env:     ${ENV_ID}"
echo "Functions (${#NAMES[@]}): ${NAMES[*]}"
echo

# Deploy in batches to keep CLI stable
batch_size=5
i=0
failed=0
while (( i < ${#NAMES[@]} )); do
  batch=("${NAMES[@]:i:batch_size}")
  echo ">>> Deploy batch: ${batch[*]}"
  if ! "${CLI}" cloud functions deploy \
    --project "${PROJECT}" \
    --env "${ENV_ID}" \
    --remote-npm-install \
    --names "${batch[@]}" \
    --lang zh; then
    failed=1
  fi
  i=$((i + batch_size))
done

if (( failed )); then
  echo
  echo "Some functions failed. Common fix for ResourceNotFound.Namespace:"
  echo "  1) Open WeChat DevTools cloud console for this env"
  echo "  2) Enter Cloud Functions once to initialize the namespace"
  echo "  3) Re-run: $0 ${ENV_ID}"
  exit 1
fi

echo
echo "All cloud function deploys finished."
