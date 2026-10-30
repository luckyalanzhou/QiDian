-- Keep backup-import attachments isolated until the vault replacement commits.
-- Ordinary attachments remain unscoped and retain their existing lifecycle.
CREATE TABLE account_asset_import_scopes (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('staging', 'committed', 'aborted')),
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  result_revision INTEGER,
  PRIMARY KEY (account_id, id)
);

ALTER TABLE account_assets ADD COLUMN import_scope_id TEXT;
CREATE INDEX account_assets_import_scope ON account_assets(account_id, import_scope_id, created);
