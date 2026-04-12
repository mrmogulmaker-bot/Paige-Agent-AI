import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileCheck, AlertTriangle } from "lucide-react";

export type BankingDataSource = "verified" | "statement" | "manual" | "none";

interface BankingSourceBadgeProps {
  source: BankingDataSource;
  className?: string;
}

const sourceConfig: Record<BankingDataSource, {
  label: string;
  icon: React.ReactNode;
  className: string;
}> = {
  verified: {
    label: "Verified via Open Banking",
    icon: <CheckCircle2 className="w-3 h-3" />,
    className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  },
  statement: {
    label: "Verified via Statement Upload",
    icon: <FileCheck className="w-3 h-3" />,
    className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  },
  manual: {
    label: "Self-Reported",
    icon: <AlertTriangle className="w-3 h-3" />,
    className: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  },
  none: {
    label: "No Data",
    icon: null,
    className: "bg-muted text-muted-foreground border-border",
  },
};

export function BankingSourceBadge({ source, className = "" }: BankingSourceBadgeProps) {
  const config = sourceConfig[source];
  return (
    <Badge variant="outline" className={`text-xs gap-1 ${config.className} ${className}`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}
