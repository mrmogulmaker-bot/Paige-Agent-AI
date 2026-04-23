import { ShieldCheck } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SecurityBadgeProps {
  variant?: "compact" | "inline";
  className?: string;
}

/**
 * Reusable "Bank-Grade Security" badge.
 * - compact: pill style, suitable for footers and CTAs
 * - inline: row style, suitable for inside cards/forms
 */
export function SecurityBadge({ variant = "compact", className = "" }: SecurityBadgeProps) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/5 text-accent hover:bg-accent/10 transition-colors";
  const sizes =
    variant === "compact"
      ? "px-2.5 py-1 text-[11px] font-medium"
      : "px-3 py-1.5 text-xs font-medium";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${base} ${sizes} ${className}`}
          aria-label="View security details"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Bank-Grade Security
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="start">
        <p className="font-semibold text-foreground mb-2">Your data is protected with:</p>
        <ul className="space-y-1.5 text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span> AES-256 Encryption at rest
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span> SOC 2 Certified Infrastructure
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span> TLS 1.3 Data Transmission
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span> Role-Based Access Controls
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span> Comprehensive Audit Logging
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}
