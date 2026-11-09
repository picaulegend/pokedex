CREATE TABLE trainer_badge_checks (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  checked_revision INTEGER NOT NULL DEFAULT -1,
  rules_version INTEGER NOT NULL DEFAULT 0,
  progress_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE trainer_badges (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  awarded_at TEXT NOT NULL,
  PRIMARY KEY (user_id, badge_id)
);

CREATE TRIGGER trainer_badges_inventory_insert
AFTER INSERT ON inventory WHEN NEW.quantity > 0
BEGIN
  INSERT INTO trainer_badge_checks(user_id,revision) VALUES(NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER trainer_badges_inventory_update
AFTER UPDATE OF quantity ON inventory WHEN (OLD.quantity > 0) <> (NEW.quantity > 0)
BEGIN
  INSERT INTO trainer_badge_checks(user_id,revision) VALUES(NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER trainer_badges_inventory_delete
AFTER DELETE ON inventory WHEN OLD.quantity > 0
BEGIN
  INSERT INTO trainer_badge_checks(user_id,revision) VALUES(OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER trainer_badges_goal_visibility
AFTER UPDATE OF deleted ON collections WHEN OLD.deleted <> NEW.deleted
BEGIN
  INSERT INTO trainer_badge_checks(user_id,revision) VALUES(NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision=revision+1;
END;
