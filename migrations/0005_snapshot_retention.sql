-- Autosave can produce many revisions per minute. Keep history useful by
-- taking at most one pre-write snapshot per minute, then retain the 20 newest
-- snapshots by time rather than by revision number.
DROP TRIGGER IF EXISTS account_vault_snapshot;
CREATE TRIGGER account_vault_snapshot BEFORE UPDATE OF data ON account_vaults
BEGIN
  INSERT OR IGNORE INTO account_snapshots(account_id, revision, data, created)
  SELECT OLD.account_id, OLD.revision, OLD.data, OLD.updated
  WHERE NOT EXISTS (
    SELECT 1 FROM account_snapshots
    WHERE account_id = OLD.account_id AND created >= OLD.updated - 60000
  );
  DELETE FROM account_snapshots
  WHERE account_id = OLD.account_id AND revision NOT IN (
    SELECT revision FROM account_snapshots
    WHERE account_id = OLD.account_id
    ORDER BY created DESC, revision DESC
    LIMIT 20
  );
END;

DROP TRIGGER IF EXISTS vault_snapshot;
CREATE TRIGGER vault_snapshot BEFORE UPDATE OF data ON vault
BEGIN
  INSERT OR IGNORE INTO snapshots(revision, data, created)
  SELECT OLD.revision, OLD.data, OLD.updated
  WHERE NOT EXISTS (
    SELECT 1 FROM snapshots WHERE created >= OLD.updated - 60000
  );
  DELETE FROM snapshots WHERE revision NOT IN (
    SELECT revision FROM snapshots ORDER BY created DESC, revision DESC LIMIT 20
  );
END;
