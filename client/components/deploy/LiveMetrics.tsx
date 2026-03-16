import React from "react";
import { Clock, Loader2 } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { PHASE_COLORS, PHASE_LABELS, type PhaseMetric, type DeployStatus } from "@/lib/types";

export const LiveMetrics = React.memo(function LiveMetrics({
  phaseMetrics,
  elapsedMs,
  status,
}: {
  phaseMetrics: PhaseMetric[];
  elapsedMs: number;
  status: DeployStatus;
}) {
  if (status === "idle") return null;

  const serverElapsed = phaseMetrics.reduce((sum, p) => sum + p.durationMs, 0);
  const displayTime = serverElapsed > 0 ? serverElapsed : elapsedMs;

  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 px-3 sm:px-4 py-3 flex flex-wrap items-center gap-3 sm:gap-6 text-xs animate-fade-slide-in">
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-foreground tabular-nums font-medium">{formatDuration(displayTime)}</span>
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
