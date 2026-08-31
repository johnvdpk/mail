#!/usr/bin/env bash
# Tikt de automail-run aan. Elke campagne met een ingeschakelde automail-regel
# krijgt per aanroep een kans om één lead te personaliseren en te versturen,
# zodat het dagquotum verspreid over het tijdvenster valt in plaats van in
# één keer (zie lib/outreach/automail.ts, runAutomailTick).
#
# Bedoeld om elke 15 minuten via cron te draaien, bv.:
#   */15 * * * * /root/mail/scripts/run-automail.sh >> /root/mail/logs/automail/cron.log 2>&1
#
# Vereist AUTOMAIL_CRON_SECRET in .env.local (zelfde waarde als de server leest).

set -euo pipefail

REPO="/root/mail"
HEALTH_URL="https://mail.aiadapt.nl/api/outreach/automail/run"

SECRET=$(grep -m1 '^AUTOMAIL_CRON_SECRET=' "$REPO/.env.local" | cut -d= -f2-)
if [ -z "$SECRET" ]; then
  echo "$(date -Is) AUTOMAIL_CRON_SECRET ontbreekt in .env.local, ik stop." >&2
  exit 1
fi

http_code=$(curl -s -o /tmp/automail-run.json -w "%{http_code}" -X POST "$HEALTH_URL" -H "x-automail-secret: $SECRET")
echo "$(date -Is) automail-run http=$http_code $(cat /tmp/automail-run.json)"
