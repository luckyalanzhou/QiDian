CREATE TABLE account_extension_pairings (
  code_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX account_extension_pairings_expiry ON account_extension_pairings(expires);

CREATE TABLE account_extension_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope = 'bookmarks:create'),
  created INTEGER NOT NULL,
  last_used INTEGER,
  expires INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX account_extension_tokens_account ON account_extension_tokens(account_id, expires);
