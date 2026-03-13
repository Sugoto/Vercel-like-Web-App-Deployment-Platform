"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Github,
  HardDrive,
  FileText,
  Rocket,
} from "lucide-react";
import { Fira_Code, Inter } from "next/font/google";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9001";
const DEPLOY_BASE_URL =
  process.env.NEXT_PUBLIC_DEPLOY_BASE_URL || "https://verse-proxy.sugotobasu1.workers.dev";

const firaCode = Fira_Code({ subsets: ["latin"] });
const inter = Inter({ subsets: ["latin"] });

interface Deployment {
  id: number;
  slug: string;
  gitUrl: string;
  status: string;
  createdAt: string;
  buildDurationMs: number | null;
  totalFiles: number | null;
  totalSizeBytes: number | null;
  buildLog: string | null;
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

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "deployed":
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-400" />;
    case "building":
      return <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function DeploymentRow({ d }: { d: Deployment }) {
  const [expanded, setExpanded] = useState(false);
  const deployUrl = `${DEPLOY_BASE_URL}/${d.slug}`;
  const repoName = d.gitUrl.replace("https://github.com/", "").replace(".git", "");
  const logs: string[] = d.buildLog ? JSON.parse(d.buildLog) : [];

  return (
    <div className="border-b border-border/30 last:border-b-0">
      <div
        className="flex items-center gap-4 px-5 py-4 hover:bg-muted/10 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Expand icon */}
        <button className="text-muted-foreground/50 shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Status */}
        <StatusIcon status={d.status} />

        {/* Slug + repo */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{d.slug}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Github className="h-3 w-3" />
            <span className="truncate">{repoName}</span>
          </div>
        </div>

        {/* Metrics */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
          {d.buildDurationMs != null && (
            <div className="flex items-center gap-1" title="Build duration">
              <Clock className="h-3 w-3" />
              <span className="tabular-nums">{formatDuration(d.buildDurationMs)}</span>
            </div>
          )}
          {d.totalFiles != null && (
            <div className="flex items-center gap-1" title="Files">
              <FileText className="h-3 w-3" />
              <span className="tabular-nums">{d.totalFiles}</span>
            </div>
          )}
          {d.totalSizeBytes != null && (
            <div className="flex items-center gap-1" title="Bundle size">
              <HardDrive className="h-3 w-3" />
              <span className="tabular-nums">{formatSize(d.totalSizeBytes)}</span>
            </div>
          )}
        </div>

        {/* Date */}
        <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0">
          {new Date(d.createdAt).toLocaleString()}
        </span>

        {/* Link to live site */}
        {d.status === "deployed" && (
          <a
            href={deployUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Open live site"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      {/* Expanded: build log */}
      {expanded && logs.length > 0 && (
        <div className="px-5 pb-4">
          <div className="rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-border/30 bg-muted/30 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Build Log</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{logs.length} lines</span>
            </div>
            <div className={`${firaCode.className} text-[12px] leading-relaxed p-3 max-h-64 overflow-y-auto`}>
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
          </div>
        </div>
      )}

      {expanded && logs.length === 0 && (
        <div className="px-5 pb-4">
          <p className="text-xs text-muted-foreground/50 italic">No build log available</p>
        </div>
      )}
    </div>
  );
}

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDeployments = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/projects`);
      if (data?.data) setDeployments(data.data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeployments();
  }, [fetchDeployments]);

  const deployed = deployments.filter((d) => d.status === "deployed").length;
  const failed = deployments.filter((d) => d.status === "failed").length;

  return (
    <div className={`${inter.className} min-h-screen bg-background`}>
      {/* Header */}
      <header className="border-b border-border/50 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <Rocket className="h-5 w-5 text-primary" />
              <span className="font-semibold tracking-tight">Verse</span>
            </Link>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" /> {deployed} deployed
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-400" /> {failed} failed
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Deployments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {deployments.length} total deployments. Click a row to view its build log.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : deployments.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p>No deployments yet.</p>
            <Link href="/" className="text-primary hover:underline text-sm mt-2 inline-block">
              Deploy your first project
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
            {deployments.map((d) => (
              <DeploymentRow key={d.id} d={d} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
