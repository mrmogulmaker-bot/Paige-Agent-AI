// Subtle "Updated just now / Xs ago" pill that ticks every 10s.
// Shows a green pulse for ~1.5s right after a realtime refresh lands.
import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export function LiveSyncIndicator({
  lastUpdatedAt,
  justUpdated,
  className,
  label = "Live",
}: {
  lastUpdatedAt: Date | null;
  justUpdated?: boolean;
  className?: string;
  label?: string;
}) {
  const [, force] = useState(0);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const text = (() => {
    if (!lastUpdatedAt) return `${label} · waiting…`;
    const secs = Math.max(0, Math.floor((Date.now() - lastUpdatedAt.getTime()) / 1000));
    if (secs < 5) return `${label} · updated just now`;
    if (secs < 60) return `${label} · updated ${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${label} · updated ${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${label} · updated ${hrs}h ago`;
  })();

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
        justUpdated
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-border bg-muted/40 text-muted-foreground",
        className,
      )}
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75",
            justUpdated ? "animate-ping bg-emerald-400" : "bg-emerald-400/0",
          )}
        />
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full",
            justUpdated ? "bg-emerald-500" : "bg-emerald-400",
          )}
        />
      </span>
      <Radio className="h-3 w-3" aria-hidden />
      {text}
    </span>
  );
}
