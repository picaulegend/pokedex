ALTER TABLE auth_owner_setup ADD COLUMN origin TEXT;
ALTER TABLE auth_owner_setup ADD COLUMN credential_id TEXT;
ALTER TABLE auth_owner_setup ADD COLUMN completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1));

-- Mark setup complete only when the verified passkey is saved.
CREATE TRIGGER auth_owner_setup_complete
AFTER INSERT ON passkey
BEGIN
  UPDATE auth_owner_setup SET completed=1
  WHERE user_id=NEW.userId AND credential_id=NEW.credentialID;
END;
