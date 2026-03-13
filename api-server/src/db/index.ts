import { Database } from "bun:sqlite";

export interface Project {
  id: number;
  slug: string;
  git_url: string;
  status: "queued" | "building" | "deployed" | "failed";
  created_at: number;
  build_duration_ms: number | null;
  total_files: number | null;
  total_size_bytes: number | null;
  build_log: string | null;
  screenshot_url: string | null;
}

export const db = new Database("verse.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    git_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    created_at INTEGER NOT NULL,
    build_duration_ms INTEGER,
    total_files INTEGER,
    total_size_bytes INTEGER,
    build_log TEXT,
    screenshot_url TEXT
  )
`);

const newColumns = [
  "build_duration_ms INTEGER",
  "total_files INTEGER",
  "total_size_bytes INTEGER",
  "build_log TEXT",
  "screenshot_url TEXT",
];

for (const col of newColumns) {
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN ${col}`);
  } catch {}
}

export const queries = {
  getBySlug: db.query<Project, [string]>("SELECT * FROM projects WHERE slug = ?"),
  getAll: db.query<Project, []>("SELECT * FROM projects ORDER BY created_at DESC LIMIT 50"),
  insert: db.query<Project, [string, string, string, number]>(
    "INSERT INTO projects (slug, git_url, status, created_at) VALUES (?, ?, ?, ?) RETURNING *"
  ),
  updateStatus: db.query<null, [string, string]>(
    "UPDATE projects SET status = ? WHERE slug = ?"
  ),
  updateDeployed: db.query<null, [number, number, number, string, string, string]>(
    "UPDATE projects SET status = 'deployed', build_duration_ms = ?, total_files = ?, total_size_bytes = ?, build_log = ?, screenshot_url = ? WHERE slug = ?"
  ),
  updateFailed: db.query<null, [number, string, string]>(
    "UPDATE projects SET status = 'failed', build_duration_ms = ?, build_log = ? WHERE slug = ?"
  ),
};
