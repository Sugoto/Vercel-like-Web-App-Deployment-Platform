import { useRef, useEffect } from "react";
import { Fira_Code } from "next/font/google";

const firaCode = Fira_Code({ subsets: ["latin"] });

export function BuildLogs({ logs }: { logs: string[] }) {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden glow-border-active">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/20">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Build Logs</span>
        <span className="text-xs text-muted-foreground tabular-nums">{logs.length} lines</span>
      </div>
      <div className={`${firaCode.className} text-[12px] sm:text-[13px] leading-relaxed p-3 sm:p-4 h-[240px] sm:h-[320px] overflow-y-auto`}>
        {logs.map((log, i) => {
          const isError = log.toLowerCase().includes("error") || log.toLowerCase().includes("failed");
          const isSuccess = log.toLowerCase().includes("uploaded") || log.toLowerCase().includes("complete");
          return (
            <div key={i} className={`py-0.5 animate-fade-slide-in ${isError ? "text-red-400" : isSuccess ? "text-emerald-400" : "text-foreground/70"}`}>
              <span className="text-muted-foreground/40 select-none mr-3 inline-block w-5 text-right tabular-nums text-xs">{i + 1}</span>
              {log}
            </div>
          );
        })}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
