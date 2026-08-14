-- Toastify OAST Database Schema for Cloudflare D1

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  subdomain TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT 'Active Session',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);

CREATE TABLE IF NOT EXISTS interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  payload_id TEXT NOT NULL,
  full_domain TEXT,
  type TEXT NOT NULL, -- 'http', 'dns', 'email'
  protocol TEXT,      -- 'HTTP/1.1', 'HTTPS', 'DNS-DoH', 'DNS-UDP', 'SMTP'
  method TEXT,        -- 'GET', 'POST', 'A', 'TXT', etc.
  source_ip TEXT,
  geolocation TEXT,
  raw_data TEXT,      -- Raw headers/body/query
  parsed_data TEXT,   -- JSON parsed object
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(token) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mock_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  payload_id TEXT NOT NULL UNIQUE,
  http_status INTEGER DEFAULT 200,
  http_headers TEXT DEFAULT '{"Content-Type": "text/plain"}',
  http_body TEXT DEFAULT 'OK',
  dns_txt TEXT DEFAULT 'toastify-verification-token',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(token) ON DELETE CASCADE
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_payload ON interactions(payload_id);
CREATE INDEX IF NOT EXISTS idx_sessions_subdomain ON sessions(subdomain);
