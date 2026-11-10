CREATE TABLE card_price_checks (
  variant_id TEXT PRIMARY KEY NOT NULL REFERENCES catalogue_variants(id) ON DELETE CASCADE,
  euro_cents INTEGER CHECK (euro_cents > 0),
  source_updated_at TEXT,
  checked_at TEXT NOT NULL,
  CHECK ((euro_cents IS NULL) = (source_updated_at IS NULL))
);
