-- A link grants read access to one selected view. Re-enabling replaces its token.
CREATE TABLE share_links (
  user_id TEXT NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL CHECK (scope IN ('collection','wishlist')),
  target_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE CHECK (length(token)=64),
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  revision INTEGER NOT NULL CHECK (revision>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,scope,target_id),
  CHECK ((scope='wishlist' AND target_id='') OR (scope='collection' AND length(target_id)=36))
);

-- Deleting and later restoring a collection must not restore its public link.
CREATE TRIGGER collection_revoke_sharing AFTER UPDATE OF deleted ON collections
WHEN NEW.deleted=1 AND OLD.deleted=0 BEGIN
  UPDATE share_links SET enabled=0,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE user_id=NEW.user_id AND scope='collection' AND target_id=NEW.id AND enabled=1;
END;

CREATE INDEX collection_cards_user_variant ON collection_cards(user_id,variant_id,collection_id);
