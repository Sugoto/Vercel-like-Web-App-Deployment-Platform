import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { DeployStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: DeployStatus }) {
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
