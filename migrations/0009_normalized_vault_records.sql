-- Store current account knowledge-base data by record. Historical recovery
-- snapshots remain compatible aggregate JSON in account_snapshots.data.
CREATE TABLE account_notes (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  PRIMARY KEY (account_id, id)
);
CREATE INDEX account_notes_order ON account_notes(account_id, position);

CREATE TABLE account_note_tags (
  account_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('current', 'published')),
  tag TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (account_id, note_id, scope, position),
  FOREIGN KEY (account_id, note_id) REFERENCES account_notes(account_id, id) ON DELETE CASCADE
);
CREATE INDEX account_note_tags_lookup ON account_note_tags(account_id, tag);

CREATE TABLE account_bookmarks (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  parent_id TEXT,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('folder', 'link')),
  data TEXT NOT NULL CHECK (json_valid(data)),
  PRIMARY KEY (account_id, id)
);
CREATE INDEX account_bookmarks_order ON account_bookmarks(account_id, parent_id, position);

CREATE TABLE account_categories (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (account_id, position),
  UNIQUE (account_id, value)
);

CREATE TABLE account_note_types (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, position)
);

CREATE TABLE account_trash (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, position)
);

CREATE TABLE account_preferences (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL CHECK (json_valid(value)),
  PRIMARY KEY (account_id, key)
);

ALTER TABLE account_vaults ADD COLUMN write_token TEXT NOT NULL DEFAULT '';

INSERT INTO account_notes(account_id, id, position, data)
SELECT v.account_id, json_extract(n.value, '$.id'), CAST(n.key AS INTEGER),
  json_remove(n.value, '$.tags', '$.publishedSnapshot.tags')
FROM account_vaults v, json_each(v.data, '$.notes') n;

INSERT INTO account_note_tags(account_id, note_id, scope, tag, position)
SELECT v.account_id, json_extract(n.value, '$.id'), 'current', t.value, CAST(t.key AS INTEGER)
FROM account_vaults v, json_each(v.data, '$.notes') n, json_each(n.value, '$.tags') t;

INSERT INTO account_note_tags(account_id, note_id, scope, tag, position)
SELECT v.account_id, json_extract(n.value, '$.id'), 'published', t.value, CAST(t.key AS INTEGER)
FROM account_vaults v, json_each(v.data, '$.notes') n,
  json_each(n.value, '$.publishedSnapshot.tags') t;

WITH RECURSIVE bookmark_tree(account_id, item, parent_id, position) AS (
  SELECT v.account_id, b.value, NULL, CAST(b.key AS INTEGER)
  FROM account_vaults v, json_each(v.data, '$.bookmarks') b
  UNION ALL
  SELECT tree.account_id, child.value, json_extract(tree.item, '$.id'), CAST(child.key AS INTEGER)
  FROM bookmark_tree tree, json_each(tree.item, '$.children') child
  WHERE json_extract(tree.item, '$.kind') = 'folder'
)
INSERT INTO account_bookmarks(account_id, id, parent_id, position, kind, data)
SELECT account_id, json_extract(item, '$.id'), parent_id, position,
  json_extract(item, '$.kind'), json_remove(item, '$.children')
FROM bookmark_tree;

INSERT INTO account_categories(account_id, position, value)
SELECT v.account_id, CAST(c.key AS INTEGER), c.value
FROM account_vaults v, json_each(v.data, '$.categories') c;

INSERT INTO account_note_types(account_id, id, position, name)
SELECT v.account_id, json_extract(t.value, '$.id'), CAST(t.key AS INTEGER), json_extract(t.value, '$.name')
FROM account_vaults v, json_each(v.data, '$.noteTypes') t;

INSERT INTO account_trash(account_id, id, position, data)
SELECT v.account_id, json_extract(t.value, '$.id'), CAST(t.key AS INTEGER), t.value
FROM account_vaults v, json_each(v.data, '$.trash') t;

INSERT INTO account_preferences(account_id, key, value)
SELECT account_id, key, value FROM (
  SELECT account_id, 'theme' AS key, data -> '$.theme' AS value FROM account_vaults WHERE json_type(data, '$.theme') IS NOT NULL
  UNION ALL SELECT account_id, 'pasteMode', data -> '$.pasteMode' FROM account_vaults WHERE json_type(data, '$.pasteMode') IS NOT NULL
  UNION ALL SELECT account_id, 'noteTypesExpanded', data -> '$.noteTypesExpanded' FROM account_vaults WHERE json_type(data, '$.noteTypesExpanded') IS NOT NULL
  UNION ALL SELECT account_id, 'dashboardBookmarkLayout', data -> '$.dashboardBookmarkLayout' FROM account_vaults WHERE json_type(data, '$.dashboardBookmarkLayout') IS NOT NULL
  UNION ALL SELECT account_id, 'dashboardBookmarkFolders', data -> '$.dashboardBookmarkFolders' FROM account_vaults WHERE json_type(data, '$.dashboardBookmarkFolders') IS NOT NULL
  UNION ALL SELECT account_id, 'bookmarkDirectoryOpen', data -> '$.bookmarkDirectoryOpen' FROM account_vaults WHERE json_type(data, '$.bookmarkDirectoryOpen') IS NOT NULL
  UNION ALL SELECT account_id, 'bookmarkFolderStates', data -> '$.bookmarkFolderStates' FROM account_vaults WHERE json_type(data, '$.bookmarkFolderStates') IS NOT NULL
);

DROP TRIGGER IF EXISTS account_vault_snapshot;
ALTER TABLE account_vaults DROP COLUMN data;
