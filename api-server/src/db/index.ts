import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const sqlite = new Database("verse.db");

sqlite.exec(`
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
    sqlite.exec(`ALTER TABLE projects ADD COLUMN ${col}`);
  } catch {}
}

export const db = drizzle(sqlite, { schema });
