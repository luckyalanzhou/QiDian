PRAGMA foreign_keys = ON;
CREATE TABLE vault (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL
);
INSERT INTO vault VALUES (1, 0, '{"categories":[],"notes":[],"theme":"light","pasteMode":"rich"}', 0);
CREATE TABLE snapshots (
  revision INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE TRIGGER vault_snapshot BEFORE UPDATE OF data ON vault
BEGIN
  INSERT OR IGNORE INTO snapshots(revision, data, created) VALUES (OLD.revision, OLD.data, OLD.updated);
  DELETE FROM snapshots WHERE revision < OLD.revision - 19;
END;
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size BETWEEN 1 AND 8388608),
  created INTEGER NOT NULL
);
CREATE TABLE asset_chunks (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY(asset_id, ordinal)
);
-- Keep the attachment quota atomic even across concurrent devices.
CREATE TRIGGER asset_quota BEFORE INSERT ON assets
WHEN (SELECT COALESCE(SUM(size),0) FROM assets) + NEW.size > 104857600
BEGIN SELECT RAISE(ABORT, 'ASSET_QUOTA'); END;
