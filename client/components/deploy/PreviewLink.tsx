"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { DeployStatus } from "@/lib/types";

export function PreviewLink({
  deployPreviewURL,
  shortUrl,
  status,
}: {
  deployPreviewURL: string;
  shortUrl?: string;
  status: DeployStatus;
}) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayUrl = shortUrl || deployPreviewURL;

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm p-4 sm:p-5 space-y-3 glow-border-success">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Preview Link</span>
        <StatusBadge status={status} />
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border/40 px-3 py-2.5">
        <a
          href={shortUrl || deployPreviewURL}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-sm truncate flex-1 transition-colors ${
            shortUrl ? "text-foreground hover:text-primary font-medium" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {displayUrl}
        </a>
        <button
          onClick={() => copyToClipboard(displayUrl)}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Copy URL"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
