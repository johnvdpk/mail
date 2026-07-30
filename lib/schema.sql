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
