-- Keep the existing user IDs and every record that uses them.
ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT 'Carddex';
ALTER TABLE users ADD COLUMN emailVerified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN image TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT;
UPDATE users SET updated_at = created_at;

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT
);
CREATE INDEX auth_sessions_user ON auth_sessions(userId);

CREATE TABLE auth_accounts (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  password TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX auth_accounts_user ON auth_accounts(userId);

CREATE TABLE auth_verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX auth_verifications_identifier ON auth_verifications(identifier);
CREATE INDEX auth_verifications_expiry ON auth_verifications(expiresAt);

CREATE TABLE passkey (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credentialID TEXT NOT NULL UNIQUE,
  publicKey TEXT NOT NULL,
  counter INTEGER NOT NULL,
  deviceType TEXT NOT NULL,
  backedUp INTEGER NOT NULL,
  name TEXT,
  transports TEXT,
  createdAt TEXT,
  aaguid TEXT
);
CREATE INDEX passkey_user ON passkey(userId);

CREATE TRIGGER passkey_keep_last
BEFORE DELETE ON passkey
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.userId)
 AND NOT EXISTS (SELECT 1 FROM passkey WHERE userId = OLD.userId AND id <> OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'Add another passkey before removing this one.');
END;

CREATE TABLE auth_owner_setup (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1))
);
