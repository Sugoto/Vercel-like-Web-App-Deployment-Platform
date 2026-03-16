import React from "react";
import { Github, Server, Database, Globe, CheckCircle2 } from "lucide-react";
import { formatDuration } from "@/lib/format";
import type { DeployStatus, InfraPhase, PhaseMetric } from "@/lib/types";

const PIPELINE_NODES = [
  { id: "github" as const, label: "GitHub", sublabel: "Clone", icon: Github },
  { id: "railway" as const, label: "Railway", sublabel: "Build", icon: Server },
  { id: "upstash" as const, label: "Upstash", sublabel: "Stream", icon: Database },
  { id: "cloudflare" as const, label: "Cloudflare", sublabel: "Deploy", icon: Globe },
];

const PHASE_ORDER = ["github", "railway", "cloudflare"] as const;

function derivePhase(logs: string[], status: DeployStatus): InfraPhase {
  if (status === "failed") return "failed";
  if (status === "deployed") return "done";
  if (status === "idle") return "idle";
  if (logs.length === 0) return "idle";

  let phase: InfraPhase = "github";
  for (const log of logs) {
    const l = log.toLowerCase();
    if (l.includes("uploading") || l.includes("uploaded") || l.includes("deployed to")) {
      phase = "cloudflare";
    } else if (l.includes("building project")) {
      phase = "railway";
    } else if (l.includes("installing dependencies")) {
      phase = "railway";
    } else if (l.includes("cloning")) {
      phase = "github";
    }
  }
  return phase;
}

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

export const InfraPipeline = React.memo(function InfraPipeline({
  logs,
  status,
  phaseMetrics,
}: {
  logs: string[];
  status: DeployStatus;
  phaseMetrics: PhaseMetric[];
}) {
  const phase = derivePhase(logs, status);

  return (
    <aside className="hidden lg:block w-56 fixed left-[8%] top-1/2 -translate-y-1/2 z-10">
      <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-md shadow-sm overflow-hidden glow-border">
        <div className="px-4 py-2.5 border-b border-border/40 bg-muted/20 flex items-center justify-between">
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
                  (m.name === "install" && node.id === "railway") ||
                  (m.name === "build" && node.id === "railway") ||
                  (m.name === "upload" && node.id === "cloudflare")
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
