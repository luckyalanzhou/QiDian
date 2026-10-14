-- Store private account avatars separately from the note attachment quota.
CREATE TABLE account_profiles (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  avatar BLOB,
  avatar_mime TEXT CHECK (avatar_mime IS NULL OR avatar_mime IN ('image/png', 'image/jpeg', 'image/webp')),
  updated INTEGER NOT NULL
);
