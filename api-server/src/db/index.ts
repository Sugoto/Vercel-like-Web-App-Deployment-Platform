import { createClient } from "@supabase/supabase-js";
import { config } from "../config";

export interface Project {
  id: number;
  slug: string;
  git_url: string;
  status: "queued" | "building" | "deployed" | "failed";
  created_at: string;
  build_duration_ms: number | null;
  total_files: number | null;
  total_size_bytes: number | null;
  build_log: string | null;
  screenshot_url: string | null;
}

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);

export async function initDb() {
  const { error } = await supabase.rpc("exec_sql", { query: "" }).maybeSingle();
  // Table creation is done via Supabase Dashboard SQL editor -- see README
}

export const db = {
  async getBySlug(slug: string): Promise<Project | null> {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    return data;
  },

  async getAll(): Promise<Project[]> {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    return data || [];
  },

  async insert(slug: string, gitUrl: string, status: string): Promise<Project> {
    const { data, error } = await supabase
      .from("projects")
      .insert({ slug, git_url: gitUrl, status, created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw new Error(`DB insert failed: ${error.message}`);
    return data;
  },

  async updateStatus(slug: string, status: string): Promise<void> {
    await supabase
      .from("projects")
      .update({ status })
      .eq("slug", slug);
  },

  async updateDeployed(
    slug: string,
    buildDurationMs: number,
    totalFiles: number,
    totalSizeBytes: number,
    buildLog: string,
    screenshotUrl: string
  ): Promise<void> {
    await supabase
      .from("projects")
      .update({
        status: "deployed",
        build_duration_ms: buildDurationMs,
        total_files: totalFiles,
        total_size_bytes: totalSizeBytes,
        build_log: buildLog,
        screenshot_url: screenshotUrl,
      })
      .eq("slug", slug);
  },

  async updateFailed(slug: string, buildDurationMs: number, buildLog: string): Promise<void> {
    await supabase
      .from("projects")
      .update({
        status: "failed",
        build_duration_ms: buildDurationMs,
        build_log: buildLog,
      })
      .eq("slug", slug);
  },
};
