-- Optional account TOTP. Existing accounts remain disabled until they complete enrollment.
CREATE TABLE account_totp (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  secret_iv TEXT,
  secret_ciphertext TEXT,
  secret_tag TEXT,
  last_counter INTEGER NOT NULL DEFAULT -1,
  pending_id TEXT,
  pending_iv TEXT,
  pending_ciphertext TEXT,
  pending_tag TEXT,
  pending_expires INTEGER,
  activation_id TEXT,
  recovery_batch_id TEXT,
  CHECK (enabled = 0 OR (secret_iv IS NOT NULL AND secret_ciphertext IS NOT NULL AND secret_tag IS NOT NULL))
);

CREATE TABLE account_totp_recovery_codes (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  consumed_at INTEGER,
  PRIMARY KEY (account_id, code_hash)
);

CREATE TABLE auth_mfa_challenges (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX auth_mfa_challenges_expiry ON auth_mfa_challenges(expires);
