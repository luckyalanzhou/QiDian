-- Keep recent revision-scoped record changes so clients can pull deltas and
-- tombstones without downloading the complete vault after every update.
CREATE TABLE account_vault_changes (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  changes TEXT NOT NULL CHECK (json_valid(changes)),
  created INTEGER NOT NULL,
  PRIMARY KEY (account_id, revision)
);
CREATE INDEX account_vault_changes_revision ON account_vault_changes(account_id, revision);
