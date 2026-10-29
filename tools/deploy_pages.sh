#!/usr/bin/env bash
# 把源仓库发布到 Cloudflare Pages（自建线路）。
#
# 用法：
#   BASE=https://sources.example.com/ bash tools/deploy_pages.sh
#   BASE=... PAGES_PROJECT=lume-sources bash tools/deploy_pages.sh
#   BASE=... DRY_RUN=1 bash tools/deploy_pages.sh     # 只生成本地目录，不上传
#
# 需要：Node（npx wrangler）+ Cloudflare 账号。
# 非交互环境（CI）改为设置 CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID。
set -euo pipefail
cd "$(dirname "$0")/.."

: "${BASE:?请设置 BASE，例如 BASE=https://sources.example.com/}"
PROJECT="${PAGES_PROJECT:-lume-sources}"
OUT="${OUT:-public}"

python tools/build_catalog.py
python tools/build_catalog.py --check
python tools/build_selfhost.py --base "$BASE" --out "$OUT" --clean

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "DRY_RUN=1：已生成 $OUT（$BASE），跳过上传"
  exit 0
fi

npx --yes wrangler pages deploy "$OUT" \
  --project-name "$PROJECT" \
  --branch main \
  --commit-dirty=true
