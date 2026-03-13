import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  gitUrl: text("git_url").notNull(),
  status: text("status", {
    enum: ["queued", "building", "deployed", "failed"],
  }).notNull().default("queued"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
