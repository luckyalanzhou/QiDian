-- Add account-scoped storage without deleting or rewriting the original single-owner tables.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL CHECK (password_iterations >= 600000),
  created INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires);
CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  username_normalized TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  salt TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX auth_challenges_expiry ON auth_challenges(expires);
CREATE TABLE auth_throttles (
  bucket_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE INDEX auth_throttles_expiry ON auth_throttles(window_start);
CREATE TABLE legacy_claim (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  claimed_by TEXT REFERENCES accounts(id)
);
INSERT INTO legacy_claim(id, claimed_by) VALUES (1, NULL);
CREATE TABLE account_vaults (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE account_snapshots (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  data TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (account_id, revision)
);
CREATE TRIGGER account_vault_snapshot BEFORE UPDATE OF data ON account_vaults
BEGIN
  INSERT OR IGNORE INTO account_snapshots(account_id, revision, data, created)
  VALUES (OLD.account_id, OLD.revision, OLD.data, OLD.updated);
  DELETE FROM account_snapshots WHERE account_id = OLD.account_id AND revision < OLD.revision - 19;
END;
CREATE TABLE account_assets (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size BETWEEN 1 AND 8388608),
  created INTEGER NOT NULL,
  PRIMARY KEY (account_id, id)
);
CREATE TABLE account_asset_chunks (
  account_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (account_id, asset_id, ordinal),
  FOREIGN KEY (account_id, asset_id) REFERENCES account_assets(account_id, id) ON DELETE CASCADE
);
CREATE TRIGGER account_asset_quota BEFORE INSERT ON account_assets
WHEN (SELECT COALESCE(SUM(size),0) FROM account_assets WHERE account_id = NEW.account_id) + NEW.size > 104857600
BEGIN SELECT RAISE(ABORT, 'ASSET_QUOTA'); END;
