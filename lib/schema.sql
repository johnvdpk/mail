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

