CREATE INDEX users_email ON users(email);

CREATE TABLE auth_invitations (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  claimed_at INTEGER
);

CREATE TABLE auth_invitation_credentials (
  credential_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_invitations(user_id)
);

-- Create the member and use the invitation in the same write as the first passkey.
-- An earlier registration attempt cannot add a second key after another attempt wins.
CREATE TRIGGER auth_invitation_register
BEFORE INSERT ON passkey
WHEN EXISTS (
  SELECT 1 FROM auth_invitation_credentials WHERE credential_id = NEW.credentialID
)
BEGIN
  INSERT INTO users (id,email,role,created_at,updated_at)
  SELECT i.user_id,i.email,'member',strftime('%Y-%m-%dT%H:%M:%fZ'),strftime('%Y-%m-%dT%H:%M:%fZ')
  FROM auth_invitations i
  JOIN auth_invitation_credentials a ON a.user_id = i.user_id
  WHERE a.credential_id = NEW.credentialID AND i.user_id = NEW.userId
    AND i.claimed_at IS NULL AND i.expires_at > unixepoch()
    AND NOT EXISTS (SELECT 1 FROM users WHERE email = i.email);

  SELECT CASE WHEN changes() <> 1 THEN RAISE(ABORT, 'This invitation is unavailable.') END;
  UPDATE auth_invitations SET claimed_at = unixepoch() WHERE user_id = NEW.userId;
END;
