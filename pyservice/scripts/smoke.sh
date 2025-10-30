#!/usr/bin/env bash
set -euo pipefail
BASE="http://localhost:${NEXT_PORT:-3000}"

A=$(curl -s "$BASE/api/tiles?when=now&geomId=IB&lat=32.574&lng=-117.133&rainfall=0&wind=1&tides=0.2&waves=0.3&sst=18&community=0.1" \
  | jq '.data.cells|map(.riskClass=="high")|map(if . then 1 else 0 end)|add')
B=$(curl -s "$BASE/api/tiles?when=now&geomId=IB&lat=32.574&lng=-117.133&rainfall=50&wind=10&tides=1.0&waves=2.0&sst=17&community=0.9" \
  | jq '.data.cells|map(.riskClass=="high")|map(if . then 1 else 0 end)|add')

echo "Calm highs: ${A:-0} | Storm highs: ${B:-0}"
test "${B:-0}" -gt "${A:-0}" && echo "✅ smoke ok" || { echo "❌ smoke failed"; exit 1; }
