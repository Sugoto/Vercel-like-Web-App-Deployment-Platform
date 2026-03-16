"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Github, Globe, Loader2 } from "lucide-react";
import { Inter } from "next/font/google";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfraPipeline } from "@/components/deploy/InfraPipeline";
import { LiveMetrics } from "@/components/deploy/LiveMetrics";
import { BuildSummaryCard } from "@/components/deploy/BuildSummaryCard";
import { BuildLogs } from "@/components/deploy/BuildLogs";
import { PreviewLink } from "@/components/deploy/PreviewLink";
import { HostedSitesSidebar, HostedSitesMobile } from "@/components/deploy/HostedSites";
import {
  API_URL,
  getDeployUrl,
  GITHUB_REGEX,
  type DeployStatus,
  type PhaseMetric,
  type BuildSummary,
  type Deployment,
} from "@/lib/types";

const inter = Inter({ subsets: ["latin"] });

function getProjectSlugFromURL(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("project");
}

function setProjectSlugInURL(slug: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("project", slug);
  window.history.replaceState({}, "", url.toString());
}

export default function Home() {
  const [repoURL, setURL] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<DeployStatus>("idle");
  const [deployPreviewURL, setDeployPreviewURL] = useState<string>();
  const [error, setError] = useState<string>();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [phaseMetrics, setPhaseMetrics] = useState<PhaseMetric[]>([]);
  const [buildSummary, setBuildSummary] = useState<BuildSummary | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [screenshotUrl, setScreenshotUrl] = useState<string>();
  const [shortUrl, setShortUrl] = useState<string>();

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isValidURL = GITHUB_REGEX.test(repoURL.trim());
  const isLoading = status === "deploying";

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
            const slug = getProjectSlugFromURL();
            if (slug) setScreenshotUrl(`${API_URL}/screenshots/${slug}`);
            return;
          }
          if (event.type === "shortUrl") {
            setShortUrl(event.url as string);
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
    setPhaseMetrics([]);
    setBuildSummary(null);
    setScreenshotUrl(undefined);
    setShortUrl(undefined);
    setElapsedMs(0);
    const startTime = Date.now();

    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);

    try {
      const res = await fetch(`${API_URL}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gitURL: repoURL.trim(),
          ...(customSlug.trim() && { slug: customSlug.trim() }),
        }),
      });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);

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
        ws.onmessage = (e) => handleSocketMessage(String(e.data));
        ws.onclose = () => {
          if (wsRef.current === ws) {
            setTimeout(() => {
              const newWs = new WebSocket(wsUrl);
              wsRef.current = newWs;
              newWs.onopen = () => newWs.send(JSON.stringify({ type: "subscribe", channel: `logs:${projectSlug}` }));
              newWs.onmessage = (e) => handleSocketMessage(String(e.data));
            }, 1000);
          }
        };
      }
    } catch (err) {
      if (timerRef.current) clearInterval(timerRef.current);
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("idle");
    }
  }, [repoURL, customSlug, handleSocketMessage]);

  useEffect(() => {
    const slug = getProjectSlugFromURL();
    if (slug) {
      fetch(`${API_URL}/projects/${slug}`)
        .then((r) => r.json())
        .then((json) => {
          if (json?.data) {
            const p = json.data;
            setURL(p.gitUrl || "");
            setStatus(p.status === "deployed" ? "deployed" : p.status === "failed" ? "failed" : "idle");
            setDeployPreviewURL(p.status === "deployed" ? getDeployUrl(p.slug) : undefined);
            if (p.screenshotUrl) setScreenshotUrl(`${API_URL}/screenshots/${slug}`);
            setShortUrl(p.shortUrl || undefined);
            if (p.buildDurationMs) setElapsedMs(p.buildDurationMs);
            if (p.buildLog) { try { setLogs(JSON.parse(p.buildLog)); } catch {} }
            if (p.buildDurationMs && p.totalFiles != null && p.totalSizeBytes != null) {
              setBuildSummary({ buildDurationMs: p.buildDurationMs, totalFiles: p.totalFiles, totalSizeBytes: p.totalSizeBytes, phases: [], files: [] });
            }
          }
        })
        .catch(() => {});
    }
    fetchDeployments();
    return () => { wsRef.current?.close(); wsRef.current = null; if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchDeployments]);

  useEffect(() => {
    if (status === "deployed" || status === "failed") fetchDeployments();
  }, [status, fetchDeployments]);

  return (
    <div className={`${inter.className} min-h-screen bg-background flex flex-col relative`}>
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="fixed inset-0 bg-gradient-to-b from-background via-transparent to-background pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
              <span className="text-background font-bold text-sm">V</span>
            </div>
            <span className="font-semibold tracking-tight text-sm">Verse</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/deployments" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Deployments</Link>
            <a href="https://github.com/Sugoto/Vercel-like-Web-App-Deployment-Platform" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
              <Github className="h-4 w-4" />
            </a>
          </div>
        </div>
      </nav>

      <InfraPipeline logs={logs} status={status} phaseMetrics={phaseMetrics} />

      <main className="flex-1 flex items-center justify-center relative px-3 sm:px-6 py-8 sm:py-12">
        <div className="w-full max-w-lg space-y-8 sm:space-y-10">
          {/* Hero */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 bg-card/50 text-xs text-muted-foreground mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Deploy static sites from GitHub
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gradient leading-tight">
              Ship faster with Verse
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto leading-relaxed">
              Paste a GitHub repo URL. We clone, build, and deploy your site to a global edge network in seconds.
            </p>
            <p className="text-muted-foreground/40 text-xs">Built by Sugoto Basu</p>
          </div>

          {/* Deploy form */}
          <form onSubmit={(e) => { e.preventDefault(); if (isValidURL && !isLoading) handleClickDeploy(); }} className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm p-4 space-y-3 glow-border">
              <div className="relative">
                <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input disabled={isLoading} value={repoURL} onChange={(e) => { setURL(e.target.value); setError(undefined); }} type="url" placeholder="https://github.com/owner/repo" className="pl-9 bg-background/50 border-border/40 h-11" />
              </div>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <Input disabled={isLoading} value={customSlug} onChange={(e) => setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="Custom slug (optional)" className="pl-9 text-sm bg-background/50 border-border/40 h-10" />
              </div>
            </div>
            {!isLoading && <Button type="submit" disabled={!isValidURL} className="w-full h-11 text-sm font-medium">Deploy to Edge</Button>}
            {isLoading && (
              <div className="w-full h-11 rounded-md bg-card/50 border border-border/40 flex items-center justify-center gap-2 text-sm text-muted-foreground animate-shimmer">
                <Loader2 className="h-4 w-4 animate-spin" /> Building...
              </div>
            )}
            {error && <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5"><p className="text-red-400 text-sm">{error}</p></div>}
            {!isValidURL && repoURL.trim().length > 0 && (
              <p className="text-muted-foreground/50 text-xs text-center">
                Enter a valid GitHub URL, e.g. <code className="text-muted-foreground font-mono">https://github.com/owner/repo</code>
              </p>
            )}
          </form>

          {status === "deploying" && <LiveMetrics phaseMetrics={phaseMetrics} elapsedMs={elapsedMs} status={status} />}

          <div className="animate-reveal" data-hidden={!(deployPreviewURL && status === "deployed") ? "true" : undefined}>
            <div>{deployPreviewURL && <PreviewLink deployPreviewURL={deployPreviewURL} shortUrl={shortUrl} status={status} />}</div>
          </div>

          {buildSummary && status === "deployed" && <BuildSummaryCard summary={buildSummary} logs={logs} screenshotUrl={screenshotUrl} />}

          <div className="animate-reveal" data-hidden={logs.length === 0 || (buildSummary && status === "deployed") ? "true" : undefined}>
            <div><BuildLogs logs={logs} /></div>
          </div>

          <HostedSitesMobile deployments={deployments} />
        </div>

        <HostedSitesSidebar deployments={deployments} />
      </main>
    </div>
  );
}
