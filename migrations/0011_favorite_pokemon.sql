ALTER TABLE users ADD COLUMN favorite_pokemon_id INTEGER
  CHECK (favorite_pokemon_id BETWEEN 1 AND 1025);
