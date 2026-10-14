-- Replace legacy contact fields with an account-name-only authentication schema.
CREATE TABLE accounts_username_only (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL CHECK (password_iterations >= 600000),
  created INTEGER NOT NULL
);
INSERT INTO accounts_username_only(id, username, username_normalized, password_salt, password_hash, password_iterations, created)
SELECT id, username, username_normalized, password_salt, password_hash, password_iterations, created FROM accounts;
DROP TABLE accounts;
ALTER TABLE accounts_username_only RENAME TO accounts;

CREATE TABLE auth_challenges_username_only (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  username_normalized TEXT NOT NULL,
  salt TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
INSERT INTO auth_challenges_username_only(id, account_id, username_normalized, salt, created, expires)
SELECT id, account_id, username_normalized, salt, created, expires
FROM auth_challenges
WHERE purpose = 'login';
DROP TABLE auth_challenges;
ALTER TABLE auth_challenges_username_only RENAME TO auth_challenges;

CREATE INDEX auth_challenges_expiry ON auth_challenges(expires);
CREATE INDEX auth_challenges_identity ON auth_challenges(username_normalized, expires);
