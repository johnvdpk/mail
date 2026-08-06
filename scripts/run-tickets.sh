#!/usr/bin/env bash
# Nachtelijke ticket-runner voor de mail-app.
#
# Haalt open tickets op uit de mail-database (draait in de mail-db-1
# container), en laat Claude Code ze een voor een oplossen op een eigen
# git branch in deze repo. Per ticket: oplossen -> committen op
# ticket-branch -> mergen naar main -> docker build -> health-check ->
# bij succes: push naar GitHub + up -d (live). Bij falen van build of
# health-check: rollback naar de main-commit van vóór dit ticket, geen
# push, ticket terug naar 'review' zodat een mens het kan bekijken.
#
# Bedoeld om via cron te draaien, bv.:
#   15 2 * * * /root/mail/scripts/run-tickets.sh >> /root/mail/logs/ticket-runs/cron.log 2>&1

set -euo pipefail

export PATH="/root/.local/bin:$PATH"

REPO="/root/mail"
DB_CONTAINER="mail-db-1"
HEALTH_URL="https://mail.aiadapt.nl"
LOG_DIR="$REPO/logs/ticket-runs"
MAX_LOG_CHARS=20000
SUMMARY_START="===TICKET_SUMMARY==="
SUMMARY_END="===END_TICKET_SUMMARY==="

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
  main_commit_before=$(git rev-parse main)
  git branch -D "$branch" >/dev/null 2>&1 || true
  git checkout -b "$branch" >/dev/null 2>&1

  # Laat een licht LLM (via OpenRouter) de ruwe ticket-omschrijving eerst
  # opschonen tot een beknopte, heldere opdracht, zodat Claude Code minder
  # tokens kwijt is aan het interpreteren van een rommelige omschrijving.
  # Bij ontbrekende configuratie of een fout valt dit terug op de
  # originele omschrijving.
  refined_description=$(jq -n --arg title "$title" --arg description "$description" \
    '{title: $title, description: $description}' \
    | "$REPO/node_modules/.bin/tsx" "$REPO/scripts/refine-ticket-prompt.ts" 2>>"$log_file")
  if [ -z "$(echo "$refined_description" | tr -d '[:space:]')" ]; then
    refined_description="$description"
  fi

  prompt="Je werkt in de git-repo van de 'mail' webapp (Next.js/TypeScript) op ${REPO}.
Een gebruiker heeft dit ticket aangemaakt in de app:

Titel: ${title}

Omschrijving:
${refined_description}

Maak alleen de codewijzigingen die nodig zijn om dit ticket op te lossen.
Commit je wijziging aan het einde op de huidige branch (${branch}). Gebruik
een duidelijke commit message: een korte titelregel, dan een lege regel,
dan een paar zinnen die uitleggen wat je precies hebt aangepast, waarom,
en hoe de gebruiker dit concreet kan testen (bijv. welke pagina/knop/actie).
Push niet naar een remote en deploy niet.

Sluit je antwoord af met exact dit blok (voor automatische verwerking,
gebruik deze markers letterlijk, geen markdown-opmaak eromheen):
${SUMMARY_START}
<hier dezelfde samenvatting als in de commit message body: wat is
aangepast, waarom, en hoe kan de gebruiker het testen. Voor de gebruiker
van de app geschreven, niet voor een developer.>
${SUMMARY_END}"

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

  ticket_summary=$(sed -n "/${SUMMARY_START}/,/${SUMMARY_END}/p" "$log_file" | sed '1d;$d')
  if [ -z "$(echo "$ticket_summary" | tr -d '[:space:]')" ]; then
    ticket_summary="(Geen samenvatting teruggegeven door de agent, zie agent-log voor details.)"
  fi

  deploy_status="not_attempted"
  if [ "$commits_ahead" -gt 0 ] && [ "$claude_exit" -eq 0 ]; then
    status="success"

    echo "--- mergen naar main en deployen ---"
    git checkout main >/dev/null 2>&1
    git merge --no-ff -q -m "Merge ${branch}: ${title}

${ticket_summary}" "$branch"

    build_ok=1
    docker-compose build app >>"$log_file" 2>&1 || build_ok=0

    if [ "$build_ok" -eq 1 ]; then
      docker-compose up -d >>"$log_file" 2>&1
      sleep 5
      http_code=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
      if [ "$http_code" = "200" ]; then
        echo "$(date -Is) health check OK ($http_code), push naar GitHub." | tee -a "$log_file"
        if git push origin main >>"$log_file" 2>&1; then
          deploy_status="deployed"
          new_ticket_status="closed"
        else
          deploy_status="push_failed"
          new_ticket_status="review"
          echo "$(date -Is) LET OP: deploy lokaal gelukt maar push naar GitHub faalde, main lokaal loopt nu voor op origin." | tee -a "$log_file"
        fi
      else
        echo "$(date -Is) health check FAILED (http $http_code), rollback." | tee -a "$log_file"
        deploy_status="health_check_failed"
        new_ticket_status="review"
        git reset --hard "$main_commit_before" >/dev/null 2>&1
        docker-compose build app >>"$log_file" 2>&1 || true
        docker-compose up -d >>"$log_file" 2>&1 || true
      fi
    else
      echo "$(date -Is) docker build FAILED, rollback." | tee -a "$log_file"
      deploy_status="build_failed"
      new_ticket_status="review"
      git reset --hard "$main_commit_before" >/dev/null 2>&1
    fi
  else
    status="failed"
    new_ticket_status="open"
  fi

  agent_log=$(tail -c "$MAX_LOG_CHARS" "$log_file")

  psql_exec -v run_id="$run_id" -v status="$status" -v diffstat="$diffstat" \
    -v summary="$ticket_summary" -v agentlog="$agent_log" >/dev/null <<'SQL'
UPDATE ticket_runs SET status = :'status', finished_at = now(), diff_stat = :'diffstat', summary = :'summary', agent_log = :'agentlog' WHERE id = :run_id;
SQL

  psql_exec -v id="$id" -v status="$new_ticket_status" -v branch="$branch" >/dev/null <<'SQL'
UPDATE tickets SET status = :'status', branch = :'branch', updated_at = now() WHERE id = :id;
SQL

  echo "Ticket #$id afgerond: status=$status deploy=$deploy_status branch=$branch"

  git checkout main >/dev/null 2>&1
done < <(echo "$TICKETS_JSON" | jq -c '.[]')

echo "$(date -Is) klaar."
