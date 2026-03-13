"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Github,
  Rocket,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Server,
  Database,
  HardDrive,
  Globe,
  Clock,
  FileText,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Fira_Code, Inter } from "next/font/google";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9001";

const firaCode = Fira_Code({ subsets: ["latin"] });
const inter = Inter({ subsets: ["latin"] });

const GITHUB_REGEX = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/;

type DeployStatus = "idle" | "deploying" | "deployed" | "failed";

type InfraPhase =
  | "idle"
  | "github"
  | "render"
  | "upstash"
  | "supabase"
  | "cloudflare"
  | "done"
  | "failed";

interface PhaseMetric {
  name: string;
  durationMs: number;
}

interface BuildSummary {
  totalFiles: number;
  totalSizeBytes: number;
  buildDurationMs: number;
  phases: PhaseMetric[];
  files: { path: string; sizeBytes: number }[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PHASE_COLORS: Record<string, string> = {
  clone: "bg-sky-500",
  install: "bg-amber-500",
  build: "bg-violet-500",
  upload: "bg-emerald-500",
};

const PHASE_LABELS: Record<string, string> = {
  clone: "Clone",
  install: "Install",
  build: "Build",
  upload: "Upload",
};

// --- Infra Pipeline ---

const PIPELINE_NODES = [
  { id: "github" as const, label: "GitHub", sublabel: "Clone", icon: Github },
  { id: "render" as const, label: "Render", sublabel: "Build", icon: Server },
  { id: "upstash" as const, label: "Upstash", sublabel: "Stream", icon: Database },
  { id: "supabase" as const, label: "Supabase", sublabel: "Upload", icon: HardDrive },
  { id: "cloudflare" as const, label: "Cloudflare", sublabel: "Serve", icon: Globe },
];

function derivePhase(logs: string[], status: DeployStatus): InfraPhase {
  if (status === "failed") return "failed";
  if (status === "deployed") return "done";
  if (status === "idle") return "idle";
  if (logs.length === 0) return "idle";

  let phase: InfraPhase = "github";
  for (const log of logs) {
    const l = log.toLowerCase();
    if (l.includes("uploading") || l.includes("uploaded") || l.includes("starting to upload")) {
      phase = "supabase";
    } else if (l.includes("building project")) {
      phase = "render";
    } else if (l.includes("installing dependencies")) {
      phase = "render";
    } else if (l.includes("cloning")) {
      phase = "github";
    }
  }
  return phase;
}

const PHASE_ORDER = ["github", "render", "supabase", "cloudflare"] as const;

function getNodeState(nodeId: string, phase: InfraPhase): "idle" | "active" | "done" {
  if (phase === "idle") return "idle";
  if (phase === "done") return "done";
  if (phase === "failed") return "idle";

  const phaseIdx = PHASE_ORDER.indexOf(phase as (typeof PHASE_ORDER)[number]);
  const nodeIdx = PHASE_ORDER.indexOf(nodeId as (typeof PHASE_ORDER)[number]);

  if (nodeId === "upstash") {
    if (phaseIdx <= 0) return "idle";
    return "active";
  }

  if (nodeIdx < 0 || phaseIdx < 0) return "idle";
  if (nodeIdx < phaseIdx) return "done";
  if (nodeIdx === phaseIdx) return "active";
  return "idle";
}

const InfraPipeline = React.memo(function InfraPipeline({ logs, status, phaseMetrics }: { logs: string[]; status: DeployStatus; phaseMetrics: PhaseMetric[] }) {
  const phase = derivePhase(logs, status);

  return (
    <aside className="hidden lg:block w-56 fixed left-[8%] top-1/2 -translate-y-1/2">
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Infrastructure
          </span>
          {phase === "done" && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
        </div>
        <div className="p-5 relative">
          <div className="absolute left-[2.4rem] top-6 bottom-6 w-px bg-border/40" />
          <div className="flex flex-col gap-6">
            {PIPELINE_NODES.map((node) => {
              const state = getNodeState(node.id, phase);
              const Icon = node.icon;
              const metric = phaseMetrics.find(
                (m) =>
                  (m.name === "clone" && node.id === "github") ||
                  (m.name === "install" && node.id === "render") ||
                  (m.name === "build" && node.id === "render") ||
                  (m.name === "upload" && node.id === "supabase")
              );

              return (
                <div key={node.id} className="flex items-center gap-3 relative z-10">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${
                      state === "active"
                        ? "bg-amber-500/20 border-2 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                        : state === "done"
                          ? "bg-emerald-500/20 border-2 border-emerald-400"
                          : "bg-muted/50 border border-border/60"
                    }`}
                  >
                    {state === "done" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : state === "active" ? (
                      <Icon className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                    ) : (
                      <Icon className="h-3.5 w-3.5 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span
                      className={`text-xs font-medium transition-colors duration-500 ${
                        state === "active" ? "text-amber-400" : state === "done" ? "text-emerald-400" : "text-muted-foreground/50"
                      }`}
                    >
                      {node.label}
                    </span>
                    <span
                      className={`text-[10px] transition-colors duration-500 ${
                        state === "active" ? "text-amber-400/60" : state === "done" ? "text-emerald-400/50" : "text-muted-foreground/30"
                      }`}
                    >
                      {metric && state === "done" ? formatDuration(metric.durationMs) : node.sublabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
});

// --- Live Metrics Bar ---

const LiveMetrics = React.memo(function LiveMetrics({ phaseMetrics, elapsedMs, status }: { phaseMetrics: PhaseMetric[]; elapsedMs: number; status: DeployStatus }) {
  if (status === "idle") return null;

  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-3 flex items-center gap-6 text-xs animate-fade-slide-in">
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-foreground tabular-nums font-medium">{formatDuration(elapsedMs)}</span>
      </div>
      {phaseMetrics.map((p) => (
        <div key={p.name} className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${PHASE_COLORS[p.name] || "bg-muted-foreground"}`} />
          <span className="text-muted-foreground">{PHASE_LABELS[p.name] || p.name}</span>
          <span className="text-foreground/70 tabular-nums">{formatDuration(p.durationMs)}</span>
        </div>
      ))}
      {status === "deploying" && <Loader2 className="h-3 w-3 animate-spin text-amber-400 ml-auto" />}
    </div>
  );
});

// --- Build Summary Card ---

function BuildSummaryCard({ summary, logs, screenshotUrl }: { summary: BuildSummary; logs: string[]; screenshotUrl?: string }) {
  const [showFiles, setShowFiles] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const totalPhaseMs = summary.phases.reduce((sum, p) => sum + p.durationMs, 0);

  const filesByType: Record<string, { path: string; sizeBytes: number }[]> = {};
  for (const f of summary.files) {
    const ext = f.path.split(".").pop()?.toLowerCase() || "other";
    if (!filesByType[ext]) filesByType[ext] = [];
    filesByType[ext].push(f);
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden animate-fade-slide-in">
      <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Build Summary
        </span>
      </div>
      <div className="p-4 space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-muted/30 border border-border/30 p-3 text-center">
            <p className="text-lg font-semibold text-foreground tabular-nums">{formatDuration(summary.buildDurationMs)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Duration</p>
          </div>
          <div className="rounded-lg bg-muted/30 border border-border/30 p-3 text-center">
            <p className="text-lg font-semibold text-foreground tabular-nums">{summary.totalFiles}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Files</p>
          </div>
          <div className="rounded-lg bg-muted/30 border border-border/30 p-3 text-center">
            <p className="text-lg font-semibold text-foreground tabular-nums">{formatSize(summary.totalSizeBytes)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Size</p>
          </div>
        </div>

        {/* Screenshot preview */}
        {screenshotUrl && (
          <div className="rounded-lg overflow-hidden border border-border/30">
            <img
              src={screenshotUrl}
              alt="Deployment preview"
              className="w-full h-auto"
              loading="lazy"
            />
          </div>
        )}

        {/* Phase breakdown bar */}
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Phase Breakdown</p>
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
            {summary.phases.map((p) => (
              <div
                key={p.name}
                className={`${PHASE_COLORS[p.name] || "bg-muted-foreground"} rounded-full transition-all duration-500`}
                style={{ width: `${Math.max((p.durationMs / totalPhaseMs) * 100, 4)}%` }}
                title={`${PHASE_LABELS[p.name] || p.name}: ${formatDuration(p.durationMs)}`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1.5">
            {summary.phases.map((p) => (
              <div key={p.name} className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${PHASE_COLORS[p.name] || "bg-muted-foreground"}`} />
                <span className="text-[10px] text-muted-foreground">{PHASE_LABELS[p.name] || p.name} {formatDuration(p.durationMs)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* File tree toggle */}
        <button
          onClick={() => setShowFiles(!showFiles)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showFiles ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span>View uploaded files</span>
        </button>

        {showFiles && (
          <div className="rounded-lg bg-muted/20 border border-border/30 p-3 max-h-48 overflow-y-auto">
            {Object.entries(filesByType)
              .sort(([, a], [, b]) => b.reduce((s, f) => s + f.sizeBytes, 0) - a.reduce((s, f) => s + f.sizeBytes, 0))
              .map(([ext, files]) => (
                <div key={ext} className="mb-2 last:mb-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    .{ext} ({files.length} {files.length === 1 ? "file" : "files"})
                  </p>
                  {files.map((f) => (
                    <div key={f.path} className="flex justify-between text-xs py-0.5">
                      <span className="text-foreground/70 truncate mr-2">{f.path}</span>
                      <span className="text-muted-foreground tabular-nums shrink-0">{formatSize(f.sizeBytes)}</span>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        )}

        {/* Build logs (collapsible) */}
        {logs.length > 0 && (
          <>
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showLogs ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span>Build logs ({logs.length} lines)</span>
            </button>

            {showLogs && (
              <div className={`${firaCode.className} rounded-lg bg-muted/20 border border-border/30 p-3 max-h-64 overflow-y-auto text-[12px] leading-relaxed`}>
                {logs.map((line, i) => {
                  const isError = line.toLowerCase().includes("error") || line.toLowerCase().includes("failed");
                  const isSuccess = line.toLowerCase().includes("uploaded") || line.toLowerCase().includes("complete");
                  return (
                    <div
                      key={i}
                      className={`py-0.5 ${isError ? "text-red-400" : isSuccess ? "text-emerald-400" : "text-foreground/60"}`}
                    >
                      <span className="text-muted-foreground/30 select-none mr-2 inline-block w-4 text-right tabular-nums text-[10px]">
                        {i + 1}
                      </span>
                      {line}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- Status Badge ---

function StatusBadge({ status }: { status: DeployStatus }) {
  switch (status) {
    case "deploying":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Loader2 className="h-3 w-3 animate-spin" />
          Building
        </span>
      );
    case "deployed":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="h-3 w-3" />
          Deployed
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
          <XCircle className="h-3 w-3" />
          Failed
        </span>
      );
    default:
      return null;
  }
}

// --- Main Page ---

function getProjectSlugFromURL(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("project");
}

function setProjectSlugInURL(slug: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("project", slug);
  window.history.replaceState({}, "", url.toString());
}

export default function Home() {
  const [repoURL, setURL] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<DeployStatus>("idle");
  const [deployPreviewURL, setDeployPreviewURL] = useState<string>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [deployments, setDeployments] = useState<
    { slug: string; gitUrl: string; status: string; createdAt: string; buildDurationMs?: number; totalSizeBytes?: number }[]
  >([]);
  const [phaseMetrics, setPhaseMetrics] = useState<PhaseMetric[]>([]);
  const [buildSummary, setBuildSummary] = useState<BuildSummary | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [buildStartTime, setBuildStartTime] = useState<number | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string>();

  const logEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isValidURL = GITHUB_REGEX.test(repoURL.trim());

  const fetchDeployments = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/projects`);
      const json = await res.json();
      if (json?.data) setDeployments(json.data);
    } catch {}
  }, []);

  const handleSocketMessage = useCallback((message: string) => {
    try {
      const parsed = JSON.parse(message);
      const { log } = parsed;

      if (typeof log === "string") {
        // Check if the log content is a structured event (metric/summary)
        try {
          const event = JSON.parse(log);
          if (event.type === "metric") {
            setPhaseMetrics((prev) => [...prev, { name: event.phase, durationMs: event.durationMs }]);
            return;
          }
          if (event.type === "summary") {
            setBuildSummary(event as BuildSummary);
            return;
          }
          if (event.type === "screenshot") {
            setScreenshotUrl(event.url as string);
            return;
          }
        } catch {}

        if (log === "Done") {
          setStatus("deployed");
          if (timerRef.current) clearInterval(timerRef.current);
          wsRef.current?.close();
          wsRef.current = null;
          return;
        }
        if (log.startsWith("Build failed")) {
          setStatus("failed");
          if (timerRef.current) clearInterval(timerRef.current);
        }
        setLogs((prev) => [...prev, log]);
      }
    } catch {
      setLogs((prev) => [...prev, message]);
    }
  }, []);

  const handleClickDeploy = useCallback(async () => {
    setStatus("deploying");
    setLogs([]);
    setError(undefined);
    setDeployPreviewURL(undefined);
    setCopied(false);
    setPhaseMetrics([]);
    setBuildSummary(null);
    setScreenshotUrl(undefined);
    setElapsedMs(0);
    const startTime = Date.now();
    setBuildStartTime(startTime);

    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);

    try {
      const res = await fetch(`${API_URL}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gitURL: repoURL.trim() }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }

      if (json?.data) {
        const { projectSlug, url } = json.data;
        setDeployPreviewURL(url);
        setProjectSlugInURL(projectSlug);

        const wsUrl = API_URL.replace(/^http/, "ws") + "/ws";
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "subscribe", channel: `logs:${projectSlug}` }));
        };

        ws.onmessage = (event) => {
          handleSocketMessage(String(event.data));
        };

        ws.onclose = () => {
          // Auto-reconnect if build is still in progress
          if (wsRef.current === ws) {
            setTimeout(() => {
              const newWs = new WebSocket(wsUrl);
              wsRef.current = newWs;
              newWs.onopen = () => {
                newWs.send(JSON.stringify({ type: "subscribe", channel: `logs:${projectSlug}` }));
              };
              newWs.onmessage = (event) => {
                handleSocketMessage(String(event.data));
              };
            }, 1000);
          }
        };
      }
    } catch (err) {
      if (timerRef.current) clearInterval(timerRef.current);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStatus("idle");
    }
  }, [repoURL, handleSocketMessage]);

  const copyURL = useCallback(() => {
    if (deployPreviewURL) {
      navigator.clipboard.writeText(deployPreviewURL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [deployPreviewURL]);

  // Restore state from URL query param on mount
  useEffect(() => {
    const slug = getProjectSlugFromURL();
    if (slug) {
      fetch(`${API_URL}/projects/${slug}`)
        .then((res) => res.json())
        .then((json) => {
          if (json?.data) {
            const p = json.data;
            setURL(p.gitUrl || "");
            setStatus(p.status === "deployed" ? "deployed" : p.status === "failed" ? "failed" : "idle");
            setDeployPreviewURL(
              p.status === "deployed"
                ? `${process.env.NEXT_PUBLIC_DEPLOY_BASE_URL || "https://verse-proxy.sugotobasu1.workers.dev"}/${p.slug}`
                : undefined
            );
            setScreenshotUrl(p.screenshotUrl || undefined);
            if (p.buildDurationMs) setElapsedMs(p.buildDurationMs);
            if (p.buildLog) {
              try { setLogs(JSON.parse(p.buildLog)); } catch {}
            }
            if (p.buildDurationMs && p.totalFiles != null && p.totalSizeBytes != null) {
              setBuildSummary({
                buildDurationMs: p.buildDurationMs,
                totalFiles: p.totalFiles,
                totalSizeBytes: p.totalSizeBytes,
                phases: [],
                files: [],
              });
            }
          }
        })
        .catch(() => {});
    }
    fetchDeployments();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchDeployments]);

  useEffect(() => {
    if (status === "deployed" || status === "failed") {
      fetchDeployments();
    }
  }, [status, fetchDeployments]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const isLoading = status === "deploying";

  return (
    <div className={`${inter.className} min-h-screen bg-background flex flex-col`}>
      {/* Left: infra pipeline */}
      <InfraPipeline logs={logs} status={status} phaseMetrics={phaseMetrics} />

      {/* Main */}
      <main className="flex-1 flex items-center justify-center relative px-4 py-8">
        <div className="w-full max-w-xl space-y-6">
          {/* Hero */}
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">
              Verse
            </h1>
            <p className="text-muted-foreground">Built by Sugoto Basu</p>
            <p className="text-muted-foreground/60 text-sm pt-2">
              Paste a GitHub repo URL and get a live preview instantly.
            </p>
          </div>

          {/* Deploy form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isValidURL && !isLoading) handleClickDeploy();
            }}
            className="space-y-3"
          >
            <div className="relative">
              <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                disabled={isLoading}
                value={repoURL}
                onChange={(e) => {
                  setURL(e.target.value);
                  setError(undefined);
                }}
                type="url"
                placeholder="https://github.com/owner/repo"
                className="pl-9"
              />
            </div>
            {!isLoading && (
              <Button type="submit" disabled={!isValidURL} className="w-full">
                Deploy
              </Button>
            )}
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            {!isValidURL && repoURL.trim().length > 0 && (
              <p className="text-muted-foreground text-xs">
                Enter a valid GitHub URL, e.g.{" "}
                <code className="text-foreground/70">https://github.com/owner/repo</code>
              </p>
            )}
          </form>

          {/* Live metrics bar */}
          <LiveMetrics phaseMetrics={phaseMetrics} elapsedMs={elapsedMs} status={status} />

          {/* Preview URL card */}
          <div className="animate-reveal" data-hidden={!(deployPreviewURL && status === "deployed") ? "true" : undefined}>
            <div>
              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Preview Link</span>
                  <StatusBadge status={status} />
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border/40 px-3 py-2.5">
                  <a
                    href={deployPreviewURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground truncate flex-1 transition-colors"
                  >
                    {deployPreviewURL}
                  </a>
                  <button
                    onClick={copyURL}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Copy URL"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Build summary (after deploy) — logs nested inside */}
          {buildSummary && status === "deployed" && <BuildSummaryCard summary={buildSummary} logs={logs} screenshotUrl={screenshotUrl} />}

          {/* Build logs — only shown during active build, before summary is available */}
          <div className="animate-reveal" data-hidden={logs.length === 0 || (buildSummary && status === "deployed") ? "true" : undefined}>
            <div>
              <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/30">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Build Logs</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{logs.length} lines</span>
                </div>
                <div className={`${firaCode.className} text-[13px] leading-relaxed p-4 h-[320px] overflow-y-auto`}>
                  {logs.map((log, i) => {
                    const isError = log.toLowerCase().includes("error") || log.toLowerCase().includes("failed");
                    const isSuccess = log.toLowerCase().includes("uploaded") || log.toLowerCase().includes("complete");
                    return (
                      <div
                        key={i}
                        className={`py-0.5 animate-fade-slide-in ${isError ? "text-red-400" : isSuccess ? "text-emerald-400" : "text-foreground/70"}`}
                      >
                        <span className="text-muted-foreground/40 select-none mr-3 inline-block w-5 text-right tabular-nums text-xs">
                          {i + 1}
                        </span>
                        {log}
                      </div>
                    );
                  })}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: hosted sites sidebar */}
        {deployments.filter((d) => d.status === "deployed").length > 0 && (
          <aside className="hidden lg:block w-72 fixed right-[8%] top-1/2 -translate-y-1/2">
            <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30 flex items-center justify-between">
                <Link href="/deployments" className="text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                  Browse Hosted Sites
                </Link>
                <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                  {deployments.filter((d) => d.status === "deployed").length}
                </span>
              </div>
              <div className="divide-y divide-border/30 max-h-[32rem] overflow-y-auto">
                {deployments
                  .filter((d) => d.status === "deployed")
                  .map((d) => {
                    const deployUrl = `${
                      process.env.NEXT_PUBLIC_DEPLOY_BASE_URL || "https://verse-proxy.sugotobasu1.workers.dev"
                    }/${d.slug}`;
                    const repoName = d.gitUrl.replace("https://github.com/", "").replace(".git", "");
                    return (
                      <div key={d.slug} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                        <div className="w-2 h-2 rounded-full shrink-0 bg-emerald-400" />
                        <div className="flex-1 min-w-0">
                          <a
                            href={deployUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block"
                          >
                            {d.slug}
                          </a>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{repoName}</span>
                            {d.buildDurationMs && (
                              <span className="text-muted-foreground/50 tabular-nums shrink-0">
                                {formatDuration(d.buildDurationMs)}
                              </span>
                            )}
                          </div>
                        </div>
                        <a href={deployUrl} target="_blank" rel="noopener noreferrer">
                          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 hover:text-foreground transition-colors" />
                        </a>
                      </div>
                    );
                  })}
              </div>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
