#!/usr/bin/env bash
# Nachtelijke ticket-runner voor de mail-app.
#
# Haalt open tickets op uit de mail-database (draait in de mail-db-1
# container), en laat Claude Code ze een voor een oplossen op een eigen
# git branch in deze repo. Er wordt niets gepusht en niets gedeployd —
# de branch staat klaar om te reviewen (bv. via `git log`/`git diff main`
# of via de deploy-mail skill zodra je 'm goedkeurt).
#
# Bedoeld om via cron te draaien, bv.:
#   15 2 * * * /root/mail/scripts/run-tickets.sh >> /root/mail/logs/ticket-runs/cron.log 2>&1

set -euo pipefail

REPO="/root/mail"
DB_CONTAINER="mail-db-1"
LOG_DIR="$REPO/logs/ticket-runs"
MAX_LOG_CHARS=20000

mkdir -p "$LOG_DIR"
cd "$REPO"

if [ -n "$(git status --porcelain)" ]; then
  echo "$(date -Is) working tree van $REPO is niet schoon, ik stop (commit/stash eerst handmatig)." >&2
  git status --short >&2
  exit 1
fi

# SQL gaat altijd via stdin (niet -c): deze psql-versie interpoleert
# :vars alleen in script-/stdin-modus, niet in -c.
psql_exec() {
  docker exec -i "$DB_CONTAINER" psql -U mail -d mail -v ON_ERROR_STOP=1 -qtA "$@"
}

TICKETS_JSON=$(psql_exec <<'SQL'
SELECT COALESCE(json_agg(t), '[]') FROM (SELECT id, title, description FROM tickets WHERE status = 'open' ORDER BY created_at ASC) t;
SQL
)

COUNT=$(echo "$TICKETS_JSON" | jq 'length')
if [ "$COUNT" -eq 0 ]; then
  echo "$(date -Is) geen open tickets, niets te doen."
  exit 0
fi

echo "$(date -Is) $COUNT open ticket(s) gevonden."

git checkout main >/dev/null 2>&1
git pull --ff-only >/dev/null 2>&1 || true

while read -r ticket; do
  id=$(echo "$ticket" | jq -r '.id')
  title=$(echo "$ticket" | jq -r '.title')
  description=$(echo "$ticket" | jq -r '.description')
  branch="ticket-${id}"
  ts=$(date +%Y%m%d-%H%M%S)
  log_file="$LOG_DIR/ticket-${id}-${ts}.log"

  echo "=== Ticket #$id: $title ==="

  psql_exec -v id="$id" >/dev/null <<'SQL'
UPDATE tickets SET status = 'in_progress', updated_at = now() WHERE id = :id;
SQL

  run_id=$(psql_exec -v id="$id" -v branch="$branch" <<'SQL'
INSERT INTO ticket_runs (ticket_id, branch, status) VALUES (:id, :'branch', 'running') RETURNING id;
SQL
)

  git checkout main >/dev/null 2>&1
  git branch -D "$branch" >/dev/null 2>&1 || true
  git checkout -b "$branch" >/dev/null 2>&1

  prompt="Je werkt in de git-repo van de 'mail' webapp (Next.js/TypeScript) op ${REPO}.
Een gebruiker heeft dit ticket aangemaakt in de app:

Titel: ${title}

Omschrijving:
${description}

Maak alleen de codewijzigingen die nodig zijn om dit ticket op te lossen.
Commit je wijziging aan het einde op de huidige branch (${branch}) met een
duidelijke commit message. Push niet naar een remote en deploy niet.
Sluit je antwoord af met een korte samenvatting van wat je hebt aangepast
en welke bestanden."

  set +e
  IS_SANDBOX=1 claude -p "$prompt" \
    --dangerously-skip-permissions \
    --add-dir "$REPO" \
    < /dev/null > "$log_file" 2>&1
  claude_exit=$?
  set -e

  # Claude commit doorgaans zelf al (zoals gevraagd in de prompt). Vang
  # eventuele restwijzigingen die hij vergat te committen alsnog op.
  git add -A
  if ! git diff --cached --quiet; then
    git commit -q -m "Ticket #${id}: ${title} (aanvullende wijzigingen)"
  fi

  diffstat=$(git diff main..."$branch" --stat 2>/dev/null | tail -1 || true)
  commits_ahead=$(git rev-list --count main.."$branch")

  if [ "$commits_ahead" -gt 0 ] && [ "$claude_exit" -eq 0 ]; then
    status="success"
    new_ticket_status="review"
  else
    status="failed"
    new_ticket_status="open"
  fi

  summary=$(tail -c "$MAX_LOG_CHARS" "$log_file")
  agent_log=$(tail -c "$MAX_LOG_CHARS" "$log_file")

  psql_exec -v run_id="$run_id" -v status="$status" -v diffstat="$diffstat" \
    -v summary="$summary" -v agentlog="$agent_log" >/dev/null <<'SQL'
UPDATE ticket_runs SET status = :'status', finished_at = now(), diff_stat = :'diffstat', summary = :'summary', agent_log = :'agentlog' WHERE id = :run_id;
SQL

  psql_exec -v id="$id" -v status="$new_ticket_status" -v branch="$branch" >/dev/null <<'SQL'
UPDATE tickets SET status = :'status', branch = :'branch', updated_at = now() WHERE id = :id;
SQL

  echo "Ticket #$id afgerond: status=$status branch=$branch"

  git checkout main >/dev/null 2>&1
done < <(echo "$TICKETS_JSON" | jq -c '.[]')

echo "$(date -Is) klaar."
