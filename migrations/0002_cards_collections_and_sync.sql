CREATE TABLE catalogue_sets (
  id TEXT PRIMARY KEY, language TEXT NOT NULL, source_id TEXT NOT NULL,
  name TEXT NOT NULL, source_url TEXT NOT NULL, source_json TEXT NOT NULL,
  UNIQUE(language, source_id)
);
CREATE TABLE catalogue_cards (
  id TEXT PRIMARY KEY, set_id TEXT NOT NULL REFERENCES catalogue_sets(id),
  language TEXT NOT NULL, source_id TEXT NOT NULL, local_number TEXT NOT NULL,
  name TEXT NOT NULL, artist TEXT, image_url TEXT, source_updated TEXT,
  source_url TEXT NOT NULL, source_json TEXT NOT NULL,
  UNIQUE(language, source_id)
);
CREATE TABLE catalogue_card_pokemon (
  card_id TEXT NOT NULL REFERENCES catalogue_cards(id), pokedex_number INTEGER NOT NULL,
  PRIMARY KEY(card_id, pokedex_number), CHECK(pokedex_number BETWEEN 1 AND 1025)
);
CREATE TABLE catalogue_variants (
  id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES catalogue_cards(id),
  source_id TEXT, source_key TEXT NOT NULL, type TEXT, subtype TEXT,
  foil TEXT, size TEXT, stamps_json TEXT NOT NULL, source_json TEXT NOT NULL,
  UNIQUE(card_id, source_key)
);
CREATE INDEX catalogue_cards_set ON catalogue_cards(set_id);
CREATE INDEX catalogue_card_pokemon_number ON catalogue_card_pokemon(pokedex_number,card_id);
CREATE INDEX catalogue_cards_artist ON catalogue_cards(artist);

-- A monotonic number per account lets devices fetch only changed records.
CREATE TABLE account_sync (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1
);
INSERT INTO account_sync (user_id) SELECT id FROM users;
ALTER TABLE pokedex_progress ADD COLUMN legacy_owned INTEGER NOT NULL DEFAULT 0 CHECK (legacy_owned IN (0,1));
ALTER TABLE pokedex_progress ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
UPDATE pokedex_progress SET legacy_owned=owned;
CREATE INDEX pokedex_sync ON pokedex_progress(user_id,sync_version);

CREATE TABLE inventory (
  user_id TEXT NOT NULL REFERENCES users(id),
  variant_id TEXT NOT NULL REFERENCES catalogue_variants(id),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 0 AND 999),
  wanted INTEGER NOT NULL CHECK (wanted IN (0,1)),
  revision INTEGER NOT NULL CHECK (revision>0),
  sync_version INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,variant_id)
);
CREATE INDEX inventory_sync ON inventory(user_id,sync_version);

CREATE TABLE collections (
  user_id TEXT NOT NULL REFERENCES users(id),
  id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1)),
  revision INTEGER NOT NULL CHECK (revision>0),
  sync_version INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,id)
);
CREATE INDEX collections_sync ON collections(user_id,sync_version);
CREATE TABLE collection_cards (
  user_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  variant_id TEXT NOT NULL REFERENCES catalogue_variants(id),
  PRIMARY KEY(user_id,collection_id,variant_id),
  FOREIGN KEY(user_id,collection_id) REFERENCES collections(user_id,id)
);

CREATE TABLE record_mutations (
  user_id TEXT NOT NULL REFERENCES users(id),
  mutation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  request_id TEXT NOT NULL,
  PRIMARY KEY(user_id,mutation_id)
);

CREATE TRIGGER progress_insert_sync AFTER INSERT ON pokedex_progress BEGIN
  INSERT INTO account_sync(user_id) VALUES(NEW.user_id) ON CONFLICT DO NOTHING;
  UPDATE account_sync SET version=version+1 WHERE user_id=NEW.user_id;
  UPDATE pokedex_progress SET sync_version=(SELECT version FROM account_sync WHERE user_id=NEW.user_id)
    WHERE user_id=NEW.user_id AND pokemon_id=NEW.pokemon_id;
END;
CREATE TRIGGER progress_update_sync AFTER UPDATE OF owned,legacy_owned,revision ON pokedex_progress BEGIN
  UPDATE account_sync SET version=version+1 WHERE user_id=NEW.user_id;
  UPDATE pokedex_progress SET sync_version=(SELECT version FROM account_sync WHERE user_id=NEW.user_id)
    WHERE user_id=NEW.user_id AND pokemon_id=NEW.pokemon_id;
END;

CREATE TRIGGER inventory_insert_sync AFTER INSERT ON inventory BEGIN
  INSERT INTO account_sync(user_id) VALUES(NEW.user_id) ON CONFLICT DO NOTHING;
  UPDATE account_sync SET version=version+1 WHERE user_id=NEW.user_id;
  UPDATE inventory SET sync_version=(SELECT version FROM account_sync WHERE user_id=NEW.user_id)
    WHERE user_id=NEW.user_id AND variant_id=NEW.variant_id;
  INSERT INTO pokedex_progress(user_id,pokemon_id,owned,legacy_owned,revision,updated_at)
    SELECT NEW.user_id,p.pokedex_number,NEW.quantity>0,0,1,strftime('%Y-%m-%dT%H:%M:%fZ','now')
    FROM catalogue_card_pokemon p JOIN catalogue_variants v ON v.card_id=p.card_id
    WHERE v.id=NEW.variant_id AND NEW.quantity>0
    ON CONFLICT(user_id,pokemon_id) DO UPDATE SET owned=1,revision=revision+1,updated_at=excluded.updated_at
    WHERE pokedex_progress.owned<>1;
END;
CREATE TRIGGER inventory_update_sync AFTER UPDATE OF quantity,wanted,revision ON inventory BEGIN
  UPDATE account_sync SET version=version+1 WHERE user_id=NEW.user_id;
  UPDATE inventory SET sync_version=(SELECT version FROM account_sync WHERE user_id=NEW.user_id)
    WHERE user_id=NEW.user_id AND variant_id=NEW.variant_id;
  UPDATE pokedex_progress SET
    owned=(legacy_owned OR EXISTS(
      SELECT 1 FROM inventory i JOIN catalogue_variants v ON v.id=i.variant_id
      JOIN catalogue_card_pokemon p ON p.card_id=v.card_id
      WHERE i.user_id=NEW.user_id AND i.quantity>0 AND p.pokedex_number=pokedex_progress.pokemon_id)),
    revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE user_id=NEW.user_id AND pokemon_id IN (
      SELECT p.pokedex_number FROM catalogue_card_pokemon p JOIN catalogue_variants v ON v.card_id=p.card_id WHERE v.id=NEW.variant_id)
    AND owned<>(legacy_owned OR EXISTS(
      SELECT 1 FROM inventory i JOIN catalogue_variants v ON v.id=i.variant_id
      JOIN catalogue_card_pokemon p ON p.card_id=v.card_id
      WHERE i.user_id=NEW.user_id AND i.quantity>0 AND p.pokedex_number=pokedex_progress.pokemon_id));
  INSERT INTO pokedex_progress(user_id,pokemon_id,owned,legacy_owned,revision,updated_at)
    SELECT NEW.user_id,p.pokedex_number,1,0,1,strftime('%Y-%m-%dT%H:%M:%fZ','now')
    FROM catalogue_card_pokemon p JOIN catalogue_variants v ON v.card_id=p.card_id
    WHERE v.id=NEW.variant_id AND NEW.quantity>0
    ON CONFLICT(user_id,pokemon_id) DO NOTHING;
END;
CREATE TRIGGER collection_insert_sync AFTER INSERT ON collections BEGIN
  INSERT INTO account_sync(user_id) VALUES(NEW.user_id) ON CONFLICT DO NOTHING;
  UPDATE account_sync SET version=version+1 WHERE user_id=NEW.user_id;
  UPDATE collections SET sync_version=(SELECT version FROM account_sync WHERE user_id=NEW.user_id)
    WHERE user_id=NEW.user_id AND id=NEW.id;
END;
CREATE TRIGGER collection_update_sync AFTER UPDATE OF name,deleted,revision ON collections BEGIN
  UPDATE account_sync SET version=version+1 WHERE user_id=NEW.user_id;
  UPDATE collections SET sync_version=(SELECT version FROM account_sync WHERE user_id=NEW.user_id)
    WHERE user_id=NEW.user_id AND id=NEW.id;
END;
