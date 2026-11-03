-- Keep enough source information to recover a queued edit from the old sample UI.
-- This table contains identifiers only, not unused card records or search results.
CREATE TABLE legacy_card_locators (
  variant_id TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  source_id TEXT NOT NULL
);
INSERT INTO legacy_card_locators
  SELECT v.id,c.language,c.source_id FROM catalogue_variants v JOIN catalogue_cards c ON c.id=v.card_id;
CREATE INDEX inventory_variant ON inventory(variant_id);
CREATE INDEX collection_cards_variant ON collection_cards(variant_id);

-- A card already used by any account remains known, including saved tombstones.
DELETE FROM catalogue_card_pokemon WHERE card_id NOT IN (
  SELECT v.card_id FROM catalogue_variants v WHERE
    EXISTS(SELECT 1 FROM inventory i WHERE i.variant_id=v.id) OR
    EXISTS(SELECT 1 FROM collection_cards m WHERE m.variant_id=v.id));
DELETE FROM catalogue_variants WHERE card_id NOT IN (SELECT card_id FROM catalogue_card_pokemon)
  AND NOT EXISTS(SELECT 1 FROM inventory i WHERE i.variant_id=catalogue_variants.id)
  AND NOT EXISTS(SELECT 1 FROM collection_cards m WHERE m.variant_id=catalogue_variants.id);
DELETE FROM catalogue_cards WHERE NOT EXISTS(SELECT 1 FROM catalogue_variants v WHERE v.card_id=catalogue_cards.id);
DELETE FROM catalogue_sets WHERE NOT EXISTS(SELECT 1 FROM catalogue_cards c WHERE c.set_id=catalogue_sets.id);

