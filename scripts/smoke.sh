#!/usr/bin/env bash
set -euo pipefail

API_URL="https://space.ai-builders.com/backend/v1/chat/completions"

if [[ -f ".env.local" ]]; then
  # shellcheck disable=SC1091
  source ".env.local"
fi
if [[ -f ".env" ]]; then
  # shellcheck disable=SC1091
  source ".env"
fi

MODEL="${AI_BUILDER_MODEL:-supermind-agent-v1}"

if [[ -z "${AI_BUILDER_TOKEN:-}" ]]; then
  echo "[SMOKE][SKIP] 未检测到 AI_BUILDER_TOKEN，跳过上游接口验证（此情况不视为失败）。"
  exit 0
fi

echo "[SMOKE] 开始验证 AI Builder 接口连通性..."

request_body=$(cat <<JSON
{
  "model": "${MODEL}",
  "temperature": 0,
  "messages": [
    {"role": "system", "content": "你是测试助手，只输出 JSON。"},
    {"role": "user", "content": "输出 JSON: {\"ping\":\"pong\"}"}
  ],
  "response_format": {"type": "json_object"}
}
JSON
)

tmp_file=$(mktemp)
http_code=$(curl -sS -o "$tmp_file" -w "%{http_code}" \
  -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AI_BUILDER_TOKEN}" \
  -d "$request_body")

if [[ "$http_code" != "200" ]]; then
  echo "[SMOKE][FAIL] AI Builder 返回 HTTP ${http_code}"
  echo "[SMOKE][FAIL] 响应摘要:"
  head -c 500 "$tmp_file"; echo
  rm -f "$tmp_file"
  exit 1
fi

node -e '
const fs = require("fs");
const file = process.argv[1];
const raw = fs.readFileSync(file, "utf8");
const data = JSON.parse(raw);
const text = data?.choices?.[0]?.message?.content;
if (!text || typeof text !== "string") {
  console.error("[SMOKE][FAIL] 响应中缺少 choices[0].message.content");
  process.exit(1);
}
console.log("[SMOKE][PASS] AI Builder 接口可用，返回了内容。");
' "$tmp_file"

rm -f "$tmp_file"
