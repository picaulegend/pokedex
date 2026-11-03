ALTER TABLE catalogue_sets ADD COLUMN logo_url TEXT;
ALTER TABLE catalogue_sets ADD COLUMN symbol_url TEXT;
ALTER TABLE catalogue_sets ADD COLUMN official_count INTEGER;
ALTER TABLE catalogue_sets ADD COLUMN total_count INTEGER;
ALTER TABLE catalogue_sets ADD COLUMN reference_note TEXT;
CREATE INDEX catalogue_sets_language_name ON catalogue_sets(language,name);

-- Earlier audit data could contain a set's full checklist. Keep metadata only.
UPDATE catalogue_sets SET source_json=json_remove(source_json,'$.cards')
  WHERE json_type(source_json,'$.cards') IS NOT NULL;

CREATE TABLE set_reference_imports (
  language TEXT PRIMARY KEY CHECK (language IN ('en','ja')),
  checked_at TEXT NOT NULL,
  set_count INTEGER NOT NULL
);
