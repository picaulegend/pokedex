INSERT INTO users (id,email,role,created_at,updated_at)
VALUES ('legacy-owner-id','owner@example.test','admin','2026-11-01T00:00:00.000Z','2026-11-01T00:00:00.000Z');
INSERT INTO pokedex_progress (user_id,pokemon_id,owned,legacy_owned,revision,updated_at)
VALUES ('legacy-owner-id',1,1,1,4,'2026-11-01T00:00:00.000Z');
