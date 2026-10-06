PRAGMA foreign_keys = ON;

/*
  Demo Mode keeps the real authenticated user
  attached to auth_sessions.user_id.

  demo_acting_user_id is an optional effective
  identity used only while DEMO_MODE is enabled.
*/

ALTER TABLE auth_sessions
ADD COLUMN demo_acting_user_id INTEGER
  REFERENCES users(id);

ALTER TABLE auth_sessions
ADD COLUMN demo_started_at TEXT;

CREATE INDEX idx_auth_sessions_demo_user
  ON auth_sessions(
    demo_acting_user_id
  );
