CREATE TABLE trainer_showcase (
  user_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3),
  PRIMARY KEY (user_id, variant_id),
  UNIQUE (user_id, position),
  FOREIGN KEY (user_id, variant_id) REFERENCES inventory (user_id, variant_id) ON DELETE CASCADE
);

CREATE TRIGGER trainer_showcase_remove_unowned
AFTER UPDATE OF quantity ON inventory
WHEN OLD.quantity > 0 AND NEW.quantity = 0
BEGIN
  DELETE FROM trainer_showcase WHERE user_id = NEW.user_id AND variant_id = NEW.variant_id;
END;
