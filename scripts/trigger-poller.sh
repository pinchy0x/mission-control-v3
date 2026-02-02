#!/bin/bash
# Mission Control v3 - Trigger Poller
# Checks for pending triggers and fires them via OpenClaw cron run
# Run every 30-60 seconds via cron or as an OpenClaw cron job

set -e

API_URL="https://mc-v3-api.saurabh-198.workers.dev"
API_TOKEN="mc-v3-token-2026"
MAX_TRIGGERS=5
CRON_TIMEOUT=60000  # 60 seconds

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Claim pending triggers atomically
RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"limit\": $MAX_TRIGGERS}" \
  "$API_URL/api/triggers/claim")

CLAIMED=$(echo "$RESPONSE" | jq -r '.claimed // 0')

if [ "$CLAIMED" -eq 0 ]; then
  log "No pending triggers"
  exit 0
fi

log "Claimed $CLAIMED trigger(s)"

# Process each trigger
echo "$RESPONSE" | jq -c '.triggers[]' | while read -r trigger; do
  id=$(echo "$trigger" | jq -r '.id')
  cron_job_id=$(echo "$trigger" | jq -r '.cron_job_id')
  event_type=$(echo "$trigger" | jq -r '.event_type')
  agent_name=$(echo "$trigger" | jq -r '.agent_name // "Unknown"')
  
  log "Processing: $event_type for $agent_name (trigger: $id, cron: $cron_job_id)"
  
  # Fire the cron job
  if openclaw cron run "$cron_job_id" --force --timeout "$CRON_TIMEOUT" 2>&1; then
    # Mark as completed
    curl -s -X PATCH \
      -H "Authorization: Bearer $API_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"status": "completed"}' \
      "$API_URL/api/triggers/$id" > /dev/null
    log "✓ Trigger $id completed"
  else
    # Mark as failed
    curl -s -X PATCH \
      -H "Authorization: Bearer $API_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"status": "failed", "error": "cron run failed"}' \
      "$API_URL/api/triggers/$id" > /dev/null
    log "✗ Trigger $id failed"
  fi
done

log "Done processing triggers"
