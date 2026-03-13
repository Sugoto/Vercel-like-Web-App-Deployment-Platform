"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
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
} from "lucide-react";
import { Fira_Code, Inter } from "next/font/google";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9001";

const firaCode = Fira_Code({ subsets: ["latin"] });
const inter = Inter({ subsets: ["latin"] });

const GITHUB_REGEX = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/;

type DeployStatus = "idle" | "deploying" | "deployed" | "failed";

type InfraPhase = "idle" | "github" | "render" | "upstash" | "supabase" | "cloudflare" | "done" | "failed";

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

  // Walk through logs in order and find the LATEST phase transition
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

function getNodeState(
  nodeId: string,
  phase: InfraPhase
): "idle" | "active" | "done" {
  if (phase === "idle") return "idle";
  if (phase === "done") return "done";
  if (phase === "failed") return "idle";

  const phaseIdx = PHASE_ORDER.indexOf(phase as typeof PHASE_ORDER[number]);
  const nodeIdx = PHASE_ORDER.indexOf(nodeId as typeof PHASE_ORDER[number]);

  // Upstash streams logs the entire time — active once build starts, done when build finishes
  if (nodeId === "upstash") {
    return phaseIdx >= 0 ? "active" : "idle";
  }

  if (nodeIdx < 0 || phaseIdx < 0) return "idle";
  if (nodeIdx < phaseIdx) return "done";
  if (nodeIdx === phaseIdx) return "active";
  return "idle";
}

function InfraPipeline({ logs, status }: { logs: string[]; status: DeployStatus }) {
  const phase = derivePhase(logs, status);

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Infrastructure
        </span>
        {phase === "done" && (
          <span className="text-xs text-emerald-400">All systems complete</span>
        )}
      </div>

      <div className="flex items-center justify-between relative">
        {/* Connection line behind nodes */}
        <div className="absolute top-5 left-[10%] right-[10%] h-px bg-border/40" />

        {PIPELINE_NODES.map((node, i) => {
          const state = getNodeState(node.id, phase);
          const Icon = node.icon;

          return (
            <div key={node.id} className="flex flex-col items-center gap-1.5 relative z-10">
              {/* Node circle */}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${
                  state === "active"
                    ? "bg-amber-500/20 border-2 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                    : state === "done"
                      ? "bg-emerald-500/20 border-2 border-emerald-400"
                      : "bg-muted/50 border border-border/60"
                }`}
              >
                {state === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : state === "active" ? (
                  <Icon className="h-4 w-4 text-amber-400 animate-pulse" />
                ) : (
                  <Icon className="h-4 w-4 text-muted-foreground/40" />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-[11px] font-medium transition-colors duration-500 ${
                  state === "active"
                    ? "text-amber-400"
                    : state === "done"
                      ? "text-emerald-400"
                      : "text-muted-foreground/50"
                }`}
              >
                {node.label}
              </span>
              <span
                className={`text-[10px] transition-colors duration-500 ${
                  state === "active"
                    ? "text-amber-400/60"
                    : state === "done"
                      ? "text-emerald-400/50"
                      : "text-muted-foreground/30"
                }`}
              >
                {node.sublabel}
              </span>

              {/* Animated connector to next node */}
              {i < PIPELINE_NODES.length - 1 && (
                <div
                  className={`absolute top-5 left-[calc(50%+20px)] h-px transition-all duration-700 ${
                    state === "done"
                      ? "bg-emerald-400/40"
                      : state === "active"
                        ? "bg-amber-400/40"
                        : ""
                  }`}
                  style={{ width: "calc(100% - 40px)" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

export default function Home() {
  const [repoURL, setURL] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<DeployStatus>("idle");
  const [deployPreviewURL, setDeployPreviewURL] = useState<string>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [deployments, setDeployments] = useState<
    { slug: string; gitUrl: string; status: string; createdAt: string }[]
  >([]);

  const logEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const isValidURL = GITHUB_REGEX.test(repoURL.trim());

  const fetchDeployments = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/projects`);
      if (data?.data) setDeployments(data.data);
    } catch {}
  }, []);

  const handleSocketMessage = useCallback((message: string) => {
    try {
      const { log } = JSON.parse(message);
      if (log === "Done") {
        setStatus("deployed");
        socketRef.current?.disconnect();
        socketRef.current = null;
        return;
      }
      if (typeof log === "string" && log.startsWith("Build failed")) {
        setStatus("failed");
      }
      setLogs((prev) => [...prev, log]);
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

    try {
      const { data } = await axios.post(`${API_URL}/projects`, {
        gitURL: repoURL.trim(),
      });

      if (data?.data) {
        const { projectSlug, url } = data.data;
        setDeployPreviewURL(url);

        const socket = io(API_URL, { transports: ["websocket", "polling"] });
        socketRef.current = socket;

        socket.on("connect", () => {
          socket.emit("subscribe", `logs:${projectSlug}`);
        });

        socket.on("message", handleSocketMessage);
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
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

  useEffect(() => {
    fetchDeployments();
    return () => {
      socketRef.current?.disconnect();
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
    <div
      className={`${inter.className} min-h-screen bg-background flex flex-col`}
    >
      {/* Header */}
      <header className="border-b border-border/50 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <span className="font-semibold tracking-tight">Verse</span>
          </div>
          <a
            href="https://github.com/Sugoto/Vercel-like-Web-App-Deployment-Platform"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="h-5 w-5" />
          </a>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center relative px-4 py-8">
        <div className="w-full max-w-xl space-y-8">
          {/* Hero */}
          <div className="text-center space-y-3">
            <h1 className="text-4xl font-bold tracking-tight">
              Deploy in seconds
            </h1>
            <p className="text-muted-foreground text-lg">
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
            <div className="flex gap-2">
              <div className="relative flex-1">
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
                <Button
                  type="submit"
                  disabled={!isValidURL}
                  className="shrink-0 min-w-[100px]"
                >
                  Deploy
                </Button>
              )}
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {!isValidURL && repoURL.trim().length > 0 && (
              <p className="text-muted-foreground text-xs">
                Enter a valid GitHub URL, e.g.{" "}
                <code className="text-foreground/70">
                  https://github.com/owner/repo
                </code>
              </p>
            )}
          </form>

          {/* Live infra pipeline */}
          <InfraPipeline logs={logs} status={status} />

          {/* Preview URL card */}
          <div
            className="animate-reveal"
            data-hidden={!deployPreviewURL ? "true" : undefined}
          >
            <div>
              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    Deployment
                  </span>
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
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Build logs */}
          <div
            className="animate-reveal"
            data-hidden={logs.length === 0 ? "true" : undefined}
          >
            <div>
            <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/30">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Build Logs
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {logs.length} lines
                </span>
              </div>
              <div
                className={`${firaCode.className} text-[13px] leading-relaxed p-4 h-[320px] overflow-y-auto`}
              >
                {logs.map((log, i) => {
                  const isError =
                    log.toLowerCase().includes("error") ||
                    log.toLowerCase().includes("failed");
                  const isSuccess =
                    log.toLowerCase().includes("uploaded") ||
                    log.toLowerCase().includes("complete");

                  return (
                    <div
                      key={i}
                      className={`py-0.5 animate-fade-slide-in ${
                        isError
                          ? "text-red-400"
                          : isSuccess
                            ? "text-emerald-400"
                            : "text-foreground/70"
                      }`}
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
        {deployments.length > 0 && (
          <aside className="hidden lg:block w-72 fixed right-4 top-1/2 -translate-y-1/2">
            <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Hosted Sites
                </span>
                <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                  {deployments.length}
                </span>
              </div>
              <div className="divide-y divide-border/30 max-h-[32rem] overflow-y-auto">
                {deployments.map((d) => {
                  const deployUrl = `${
                    process.env.NEXT_PUBLIC_DEPLOY_BASE_URL ||
                    "https://verse-proxy.sugotobasu1.workers.dev"
                  }/${d.slug}`;
                  const repoName = d.gitUrl
                    .replace("https://github.com/", "")
                    .replace(".git", "");

                  return (
                    <div
                      key={d.slug}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
                    >
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          d.status === "deployed"
                            ? "bg-emerald-400"
                            : d.status === "failed"
                              ? "bg-red-400"
                              : d.status === "building"
                                ? "bg-amber-400 animate-pulse"
                                : "bg-muted-foreground/40"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <a
                          href={deployUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block"
                        >
                          {d.slug}
                        </a>
                        <span className="text-xs text-muted-foreground truncate block">
                          {repoName}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-xs text-muted-foreground">
          <span>Built by Sugoto Basu</span>
          <span>Static sites only &middot; Public repos</span>
        </div>
      </footer>
    </div>
  );
}
