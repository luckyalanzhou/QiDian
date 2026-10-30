-- Add purpose-bound challenge metadata while keeping existing login challenges valid.
ALTER TABLE auth_challenges ADD COLUMN purpose TEXT NOT NULL DEFAULT 'login';
ALTER TABLE auth_challenges ADD COLUMN code_hash TEXT;
ALTER TABLE auth_challenges ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
CREATE INDEX auth_challenges_identity ON auth_challenges(purpose, username_normalized, email_normalized, expires);
