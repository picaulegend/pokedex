INSERT INTO users (id,email,role,created_at,updated_at)
VALUES ('legacy-owner-id','owner@example.test','admin','2026-11-01T00:00:00.000Z','2026-11-01T00:00:00.000Z');
INSERT INTO pokedex_progress (user_id,pokemon_id,owned,legacy_owned,revision,updated_at)
VALUES ('legacy-owner-id',1,1,1,4,'2026-11-01T00:00:00.000Z');
INSERT INTO passkey (id,userId,credentialID,publicKey,counter,deviceType,backedUp,name)
VALUES ('legacy-key','legacy-owner-id','bGVnYWN5','fixture-key',0,'singleDevice',0,'Previous domain');
INSERT INTO auth_owner_setup (user_id,token_hash,expires_at,used)
VALUES ('legacy-owner-id','fixture-hash',unixepoch()*1000+600000,1);
