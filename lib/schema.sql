-- Mail app PostgreSQL schema

CREATE TABLE IF NOT EXISTS folders (
  path        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT,              -- inbox, sent, drafts, trash, junk, archive
  parent_path TEXT NOT NULL DEFAULT '',
  subscribed  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS folder_sync (
  folder_path   TEXT PRIMARY KEY REFERENCES folders(path) ON DELETE CASCADE,
  uid_validity  TEXT,
  last_uid      INTEGER NOT NULL DEFAULT 0,
  synced_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,       -- e.g. "INBOX_1310"
  folder          TEXT NOT NULL REFERENCES folders(path) ON DELETE CASCADE,
  uid             INTEGER NOT NULL,
  message_id      TEXT,                   -- RFC Message-ID header
  in_reply_to     TEXT,
  "references"    TEXT[] NOT NULL DEFAULT '{}',
  from_name       TEXT,
  from_email      TEXT,
  "to"            JSONB NOT NULL DEFAULT '[]',
  cc              JSONB NOT NULL DEFAULT '[]',
  subject         TEXT NOT NULL DEFAULT '',
  snippet         TEXT NOT NULL DEFAULT '',
  date            TIMESTAMPTZ NOT NULL,
  seen            BOOLEAN NOT NULL DEFAULT FALSE,
  flagged         BOOLEAN NOT NULL DEFAULT FALSE,
  answered        BOOLEAN NOT NULL DEFAULT FALSE,
  draft           BOOLEAN NOT NULL DEFAULT FALSE,
  has_attachments BOOLEAN NOT NULL DEFAULT FALSE,

  UNIQUE (folder, uid)
);

CREATE INDEX IF NOT EXISTS idx_messages_folder ON messages(folder);
CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date DESC);
CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);

CREATE TABLE IF NOT EXISTS bodies (
  message_id   TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  text_body    TEXT NOT NULL DEFAULT '',
  html_body    TEXT,
  attachments  JSONB NOT NULL DEFAULT '[]',
  calendar_invite JSONB,
  loaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bodies ADD COLUMN IF NOT EXISTS calendar_invite JSONB;

CREATE TABLE IF NOT EXISTS email_config (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- single-row
  config      JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Single-user Google Calendar OAuth tokens
CREATE TABLE IF NOT EXISTS google_tokens (
  id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  email         TEXT,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expiry        TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Learned writing style from sent mail (self-learning tone of voice)
CREATE TABLE IF NOT EXISTS writing_profile (
  id                   INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  avg_length           INTEGER NOT NULL DEFAULT 0,
  word_frequency       JSONB NOT NULL DEFAULT '{}',
  sentence_patterns    TEXT,
  detected_rules       TEXT,
  confidence           REAL NOT NULL DEFAULT 0,
  analyzed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sample_count         INTEGER NOT NULL DEFAULT 0,
  pending_suggestion   TEXT,
  suggestion_status    TEXT NOT NULL DEFAULT 'none'
);

-- Hide thread from inbox until wake_at, then restore to return_folder
CREATE TABLE IF NOT EXISTS snoozed_threads (
  thread_id      TEXT PRIMARY KEY,
  wake_at        TIMESTAMPTZ NOT NULL,
  return_folder  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Remind if no inbound reply after remind_at
CREATE TABLE IF NOT EXISTS follow_ups (
  id           SERIAL PRIMARY KEY,
  thread_id    TEXT NOT NULL,
  remind_at    TIMESTAMPTZ NOT NULL,
  note         TEXT,
  notified     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_due ON follow_ups (remind_at) WHERE notified = FALSE;

-- Deferred outbound mail (scheduled send)
CREATE TABLE IF NOT EXISTS scheduled_sends (
  id           SERIAL PRIMARY KEY,
  kind         TEXT NOT NULL,          -- reply | new
  payload      JSONB NOT NULL,
  send_at      TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_sends_due ON scheduled_sends (send_at) WHERE status = 'pending';

-- AI customer search jobs (hybrid keyword + semantic)
CREATE TABLE IF NOT EXISTS search_jobs (
  id          SERIAL PRIMARY KEY,
  prompt      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  -- pending | keyword_running | keyword_done | semantic_running | done | failed
  keywords    JSONB,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS search_results (
  id               SERIAL PRIMARY KEY,
  job_id           INT NOT NULL REFERENCES search_jobs(id) ON DELETE CASCADE,
  message_id       TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  match_type       TEXT NOT NULL, -- 'keyword' | 'semantic'
  relevance        REAL,
  contact_name     TEXT,
  contact_email    TEXT,
  contact_company  TEXT,
  reasoning        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_search_results_job ON search_results(job_id);

-- Persistent contacts discovered via customer search (dedup across jobs)
CREATE TABLE IF NOT EXISTS contacts (
  id             SERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT,
  company        TEXT,
  status         TEXT NOT NULL DEFAULT 'nieuw', -- nieuw | benaderd | geen_interesse | klant
  note           TEXT,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE search_results ADD COLUMN IF NOT EXISTS contact_id INT REFERENCES contacts(id);
CREATE INDEX IF NOT EXISTS idx_search_results_contact ON search_results(contact_id);

-- Requires pgvector (docker image: pgvector/pgvector:pg17)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS message_embeddings (
  message_id  TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  embedding   VECTOR(1536) NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dev tickets: user files a request, a nightly cron picks it up and lets
-- Claude Code work on it in an isolated git worktree/branch for review.
CREATE TABLE IF NOT EXISTS tickets (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open', -- open, in_progress, review, done, rejected
  branch      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_runs (
  id           SERIAL PRIMARY KEY,
  ticket_id    INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'running', -- running, success, failed
  branch       TEXT NOT NULL,
  summary      TEXT,
  agent_log    TEXT,
  diff_stat    TEXT
);

CREATE INDEX IF NOT EXISTS idx_ticket_runs_ticket ON ticket_runs(ticket_id);

-- Comments on a ticket, so the reporter can clarify the request or discuss a run
CREATE TABLE IF NOT EXISTS ticket_comments (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);

-- Personal notes, independent of mail/tickets
CREATE TABLE IF NOT EXISTS notes (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);

-- ZZP projects: income and expense lines, no invoicing yet
CREATE TABLE IF NOT EXISTS projects (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  client_name  TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'done')),
  start_on     DATE,
  end_on       DATE,
  is_overhead  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_overhead
  ON projects (is_overhead) WHERE is_overhead;

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);

CREATE TABLE IF NOT EXISTS project_lines (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  direction    TEXT NOT NULL CHECK (direction IN ('income', 'expense')),
  billing      TEXT NOT NULL CHECK (billing IN ('periodic', 'one_off')),
  name         TEXT NOT NULL,
  amount       NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  hours        NUMERIC(8, 2) CHECK (hours IS NULL OR hours >= 0),
  cadence      TEXT CHECK (cadence IN ('week', 'month', 'quarter', 'year')),
  occurred_on  DATE,
  paid_on      DATE,
  vat_rate     NUMERIC(5, 2) CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100)),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_lines_project ON project_lines (project_id);

-- Migrate older installs: fixed/hourly -> one_off, monthly -> periodic; add paid-status tracking.
UPDATE project_lines SET billing = 'one_off' WHERE billing IN ('fixed', 'hourly');
UPDATE project_lines SET billing = 'periodic' WHERE billing = 'monthly';

ALTER TABLE project_lines DROP CONSTRAINT IF EXISTS project_lines_billing_check;
ALTER TABLE project_lines ADD CONSTRAINT project_lines_billing_check
  CHECK (billing IN ('periodic', 'one_off'));

ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS paid_on DATE;
ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS cadence TEXT;
ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5, 2);

ALTER TABLE project_lines DROP CONSTRAINT IF EXISTS project_lines_cadence_check;
ALTER TABLE project_lines ADD CONSTRAINT project_lines_cadence_check
  CHECK (cadence IN ('week', 'month', 'quarter', 'year'));

ALTER TABLE project_lines DROP CONSTRAINT IF EXISTS project_lines_vat_rate_check;
ALTER TABLE project_lines ADD CONSTRAINT project_lines_vat_rate_check
  CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100));

-- Existing periodic rows predate cadence tracking; they were always billed monthly.
UPDATE project_lines SET cadence = 'month' WHERE billing = 'periodic' AND cadence IS NULL;

-- Per-calendar-month paid tracking for periodic lines (a periodic line has no single
-- payment date, so "paid" is tracked one row per covered month instead of via paid_on).
CREATE TABLE IF NOT EXISTS project_line_payments (
  id            SERIAL PRIMARY KEY,
  line_id       INTEGER NOT NULL REFERENCES project_lines(id) ON DELETE CASCADE,
  period_month  DATE NOT NULL,
  paid_on       DATE NOT NULL,
  UNIQUE (line_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_project_line_payments_line ON project_line_payments (line_id);

ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS ends_on DATE;
ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS starts_on DATE;
ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS source_message_id TEXT;
-- Whether `amount` was entered/imported including VAT (bank mutations) or excluding it
-- (manual invoicing). Never silently converts the stored amount; only affects how
-- totals derive net/VAT from it. Existing rows default to false (unchanged behavior).
ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS amount_includes_vat BOOLEAN NOT NULL DEFAULT FALSE;

-- category used to be a fixed 6-value enum; it's now a user-managed list (see `categories`
-- below), so the line itself just stores free text and isn't constrained anymore.
ALTER TABLE project_lines DROP CONSTRAINT IF EXISTS project_lines_category_check;

CREATE TABLE IF NOT EXISTS vat_filings (
  year       INTEGER NOT NULL,
  quarter    INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  filed_on   DATE,
  PRIMARY KEY (year, quarter)
);

-- Free-text detail from a bank mutation (e.g. invoice number) that doesn't fit the short `name`.
ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS note TEXT;

-- Maps a counterparty/description substring to a fixed category or project, so a bank
-- mutation only needs to be tagged once (see components/projects/RuleTagDialog).
CREATE TABLE IF NOT EXISTS counterparty_rules (
  id         SERIAL PRIMARY KEY,
  pattern    TEXT NOT NULL,
  category   TEXT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT counterparty_rules_target_check CHECK (
    (category IS NOT NULL AND project_id IS NULL) OR
    (category IS NULL AND project_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_counterparty_rules_pattern ON counterparty_rules (lower(pattern));

-- User-managed category list per direction, offered in the CategorySelect dropdowns. Lines
-- store the category name as free text (not an FK) so renaming/deleting a category never
-- breaks historic bookings.
CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  direction  TEXT NOT NULL CHECK (direction IN ('income', 'expense')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_direction ON categories (lower(name), direction);

-- Seed with the six former hardcoded expense categories so existing `project_lines.category`
-- values keep matching, plus a default income bucket.
INSERT INTO categories (name, direction) VALUES
  ('software', 'expense'), ('verzekering', 'expense'), ('huisvesting', 'expense'),
  ('marketing', 'expense'), ('reiskosten', 'expense'), ('overig', 'expense'),
  ('overig', 'income')
ON CONFLICT (lower(name), direction) DO NOTHING;

-- Outreach: generic campaign-based lead list + AI personalization profile
CREATE TABLE IF NOT EXISTS campaigns (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  profile     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per lead within a campaign. attributes holds campaign-type-specific
-- fields (e.g. qualityScore, bookingType) so a new topic does not need a new table.
CREATE TABLE IF NOT EXISTS campaign_targets (
  id                 SERIAL PRIMARY KEY,
  campaign_id        INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  email              TEXT NOT NULL,
  email_normalized   TEXT NOT NULL,
  name               TEXT NOT NULL,
  website            TEXT,
  status             TEXT NOT NULL DEFAULT 'new',
  attributes         JSONB NOT NULL DEFAULT '{}',
  imported_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  emailed_at         TIMESTAMPTZ,
  excluded_at        TIMESTAMPTZ,
  not_interested_at  TIMESTAMPTZ,

  UNIQUE (campaign_id, email_normalized)
);

CREATE INDEX IF NOT EXISTS idx_campaign_targets_campaign ON campaign_targets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_targets_email_normalized ON campaign_targets(email_normalized);

-- Sent outreach mails. message_id is our RFC Message-ID from sendNewMail.
CREATE TABLE IF NOT EXISTS campaign_sends (
  id               SERIAL PRIMARY KEY,
  target_id        INTEGER NOT NULL REFERENCES campaign_targets(id) ON DELETE CASCADE,
  message_id       TEXT NOT NULL,
  subject          TEXT NOT NULL,
  body_text        TEXT NOT NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_test          BOOLEAN NOT NULL DEFAULT FALSE,
  response_status  TEXT NOT NULL DEFAULT 'pending',
  response_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_target ON campaign_sends(target_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_message_id ON campaign_sends(message_id);

-- Claim-ledger voor race-proof dedup: sendOutreachMail() (lib/outreach/send.ts) claimt
-- hier het genormaliseerde e-mailadres VOORDAT de mail daadwerkelijk wordt verstuurd.
-- De UNIQUE-constraint zorgt dat een gelijktijdige tweede poging voor hetzelfde adres
-- hard faalt in plaats van te wachten op een check-then-insert race (zie
-- assertNotDuplicate() in lib/outreach/dedup.ts, die als snelle voorcheck blijft
-- bestaan maar zelf geen harde garantie geeft). Bij een mislukte send wordt de claim
-- weer verwijderd (zie releaseEmailClaim in lib/outreach/dedup.ts).
CREATE TABLE IF NOT EXISTS outreach_sent_emails (
  email_normalized     TEXT PRIMARY KEY,
  campaign_target_id   INTEGER REFERENCES campaign_targets(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per campaign. Polled by the interval in instrumentation.ts, which
-- personalizes and sends a trickle of leads per day within a time window
-- instead of one manual batch.
CREATE TABLE IF NOT EXISTS campaign_automail_rules (
  campaign_id     INTEGER PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  daily_count     INTEGER NOT NULL DEFAULT 4,
  window_start    TEXT NOT NULL DEFAULT '09:00',
  window_end      TEXT NOT NULL DEFAULT '17:00',
  status_filter   TEXT NOT NULL DEFAULT 'new',
  filters         JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit trail for automail sends/errors, shown in the Automail-tab so failures
-- (AI down, dedup conflict, etc.) are visible without checking docker logs.
CREATE TABLE IF NOT EXISTS campaign_automail_log (
  id            SERIAL PRIMARY KEY,
  campaign_id   INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  target_id     INTEGER REFERENCES campaign_targets(id) ON DELETE SET NULL,
  status        TEXT NOT NULL,
  message       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_automail_log_campaign ON campaign_automail_log(campaign_id, created_at DESC);

