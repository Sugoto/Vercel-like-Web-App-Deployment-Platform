"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fira_Code } from "next/font/google";
import { formatDuration, formatSize } from "@/lib/format";
import { PHASE_COLORS, PHASE_LABELS, type BuildSummary } from "@/lib/types";

const firaCode = Fira_Code({ subsets: ["latin"] });

export function BuildSummaryCard({
  summary,
  logs,
  screenshotUrl,
}: {
  summary: BuildSummary;
  logs: string[];
  screenshotUrl?: string;
}) {
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
    <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden animate-fade-slide-in glow-border-success">
      <div className="px-4 py-2.5 border-b border-border/40 bg-muted/20">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Build Summary
        </span>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
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

        {screenshotUrl && (
          <div className="rounded-lg overflow-hidden border border-border/30">
            <img
              src={screenshotUrl}
              alt="Deployment preview"
              className="w-full h-auto"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        )}

        {totalPhaseMs > 0 && (
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
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
              {summary.phases.map((p) => (
                <div key={p.name} className="flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${PHASE_COLORS[p.name] || "bg-muted-foreground"}`} />
                  <span className="text-[10px] text-muted-foreground">{PHASE_LABELS[p.name] || p.name} {formatDuration(p.durationMs)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {summary.files.length > 0 && (
          <>
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
          </>
        )}

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
                    <div key={i} className={`py-0.5 ${isError ? "text-red-400" : isSuccess ? "text-emerald-400" : "text-foreground/60"}`}>
                      <span className="text-muted-foreground/30 select-none mr-2 inline-block w-4 text-right tabular-nums text-[10px]">{i + 1}</span>
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
