-- History is private and uses the inventory record's revision and sync cursor.
-- Existing quantities and wanted flags stay unchanged.
ALTER TABLE inventory ADD COLUMN history_json TEXT NOT NULL
  DEFAULT '{"entries":[],"changes":[],"plan":null}' CHECK(json_valid(history_json));
