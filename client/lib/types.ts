export type DeployStatus = "idle" | "deploying" | "deployed" | "failed";

export type InfraPhase =
  | "idle"
  | "github"
  | "railway"
  | "upstash"
  | "cloudflare"
  | "done"
  | "failed";

export interface PhaseMetric {
  name: string;
  durationMs: number;
}

export interface BuildSummary {
  totalFiles: number;
  totalSizeBytes: number;
  buildDurationMs: number;
  phases: PhaseMetric[];
  files: { path: string; sizeBytes: number }[];
}

export interface Deployment {
  slug: string;
  gitUrl: string;
  status: string;
  createdAt: string;
  buildDurationMs?: number;
  totalSizeBytes?: number;
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9001";

export function getDeployUrl(slug: string): string {
  return `https://${slug}.pages.dev`;
}

export const GITHUB_REGEX = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/;

export const PHASE_COLORS: Record<string, string> = {
  clone: "bg-sky-500",
  install: "bg-amber-500",
  build: "bg-violet-500",
  upload: "bg-emerald-500",
};

export const PHASE_LABELS: Record<string, string> = {
  clone: "Clone",
  install: "Install",
  build: "Build",
  upload: "Deploy",
};
