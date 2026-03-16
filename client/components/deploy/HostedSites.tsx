import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { getDeployUrl, type Deployment } from "@/lib/types";

function SiteRow({ d, compact }: { d: Deployment; compact?: boolean }) {
  const deployUrl = getDeployUrl(d.slug);
  const repoName = d.gitUrl.replace("https://github.com/", "").replace(".git", "");

  return (
    <div className={`flex items-center gap-3 px-4 ${compact ? "py-2.5" : "py-3"} hover:bg-muted/20 transition-colors`}>
      <div className="w-2 h-2 rounded-full shrink-0 bg-emerald-400" />
      <div className="flex-1 min-w-0">
        <a href={deployUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block">
          {d.slug}
        </a>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{repoName}</span>
          {!compact && d.buildDurationMs && (
            <span className="text-muted-foreground/50 tabular-nums shrink-0">{formatDuration(d.buildDurationMs)}</span>
          )}
        </div>
      </div>
      {!compact && (
        <a href={deployUrl} target="_blank" rel="noopener noreferrer">
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 hover:text-foreground transition-colors" />
        </a>
      )}
    </div>
  );
}

function SitesHeader({ count }: { count: number }) {
  return (
    <div className="px-4 py-2.5 border-b border-border/40 bg-muted/20 flex items-center justify-between">
      <Link href="/deployments" className="text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
        Browse Hosted Sites
      </Link>
      <span className="text-[10px] text-muted-foreground/50 tabular-nums">{count}</span>
    </div>
  );
}

export function HostedSitesSidebar({ deployments }: { deployments: Deployment[] }) {
  const deployed = deployments.filter((d) => d.status === "deployed");
  if (deployed.length === 0) return null;

  return (
    <aside className="hidden lg:block w-72 fixed right-[8%] top-1/2 -translate-y-1/2 z-10">
      <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-md shadow-sm overflow-hidden glow-border">
        <SitesHeader count={deployed.length} />
        <div className="divide-y divide-border/30 max-h-[32rem] overflow-y-auto">
          {deployed.map((d) => <SiteRow key={d.slug} d={d} />)}
        </div>
      </div>
    </aside>
  );
}

export function HostedSitesMobile({ deployments }: { deployments: Deployment[] }) {
  const deployed = deployments.filter((d) => d.status === "deployed");
  if (deployed.length === 0) return null;

  return (
    <div className="lg:hidden rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <SitesHeader count={deployed.length} />
      <div className="divide-y divide-border/30 max-h-48 overflow-y-auto">
        {deployed.slice(0, 5).map((d) => <SiteRow key={d.slug} d={d} compact />)}
      </div>
    </div>
  );
}
