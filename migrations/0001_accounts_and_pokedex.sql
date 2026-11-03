CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at TEXT NOT NULL
);

-- False records remain as versioned changes for other devices.
CREATE TABLE pokedex_progress (
  user_id TEXT NOT NULL REFERENCES users(id),
  pokemon_id INTEGER NOT NULL CHECK (pokemon_id BETWEEN 1 AND 1025),
  owned INTEGER NOT NULL CHECK (owned IN (0, 1)),
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, pokemon_id)
);

-- A repeated request must not apply the same change twice.
CREATE TABLE mutation_receipts (
  user_id TEXT NOT NULL REFERENCES users(id),
  mutation_id TEXT NOT NULL,
  pokemon_id INTEGER NOT NULL,
  owned INTEGER NOT NULL,
  base_revision INTEGER NOT NULL,
  applied_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, mutation_id)
);
