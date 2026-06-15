#!/usr/bin/env bash
#
# Creates a Cloud Scheduler job that calls the ARSkinRX maintenance sweep every
# 2 minutes (releases expired holds, marks no-shows, sends reminders).
#
# Prereqs: gcloud authenticated, Cloud Scheduler API enabled, and a CRON_SECRET
# stored both in the app's env and passed here.
#
# Usage:
#   APP_URL=https://arskinrx.web.app CRON_SECRET=xxxx ./scripts/setup-cron.sh

set -euo pipefail

PROJECT="${PROJECT:-arskinrx}"
APP_URL="${APP_URL:?Set APP_URL, e.g. https://arskinrx.web.app}"
CRON_SECRET="${CRON_SECRET:?Set CRON_SECRET to match the app's env}"
LOCATION="${LOCATION:-us-central1}"
JOB_NAME="${JOB_NAME:-arskinrx-sweep}"

gcloud scheduler jobs create http "$JOB_NAME" \
  --project="$PROJECT" \
  --location="$LOCATION" \
  --schedule="*/2 * * * *" \
  --uri="${APP_URL}/api/appointments/sweep" \
  --http-method=POST \
  --headers="Authorization=Bearer ${CRON_SECRET}" \
  --attempt-deadline=60s \
  || gcloud scheduler jobs update http "$JOB_NAME" \
       --project="$PROJECT" \
       --location="$LOCATION" \
       --schedule="*/2 * * * *" \
       --uri="${APP_URL}/api/appointments/sweep" \
       --http-method=POST \
       --headers="Authorization=Bearer ${CRON_SECRET}" \
       --attempt-deadline=60s

echo "✓ Cron job '$JOB_NAME' scheduled (every 2 minutes)."
