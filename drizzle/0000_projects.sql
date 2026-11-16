CREATE TABLE projects (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  document TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner, id)
);
