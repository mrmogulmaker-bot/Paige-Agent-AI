import { Award, Shield, Eye, Users, Heart, Star, Sparkles } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

interface Props {
  product: any;
  size?: "sm" | "md";
}

interface FlagDef {
  key: string;
  active: boolean;
  icon: typeof Award;
  label: string;
  className: string;
}

export function LenderFlagBadges({ product, size = "sm" }: Props) {
  const flags: FlagDef[] = [
    {
      key: "sba",
      active: !!product.is_sba_approved,
      icon: Award,
      label: product.sba_preferred_lender ? "SBA Preferred Lender" : "SBA Approved",
      className: "text-fundability-excellent bg-fundability-excellent/10 border-fundability-excellent/30",
    },
    {
      key: "no_pg",
      active: product.requires_personal_guarantee === false,
      icon: Shield,
      label: "No Personal Guarantee Required",
      className: "text-accent bg-accent/10 border-accent/30",
    },
    {
      key: "soft_pull",
      active: product.personal_credit_impact === "soft pull" || product.personal_credit_impact === "no pull",
      icon: Eye,
      label: product.personal_credit_impact === "no pull" ? "No Credit Pull" : "Soft Pull Only",
      className: "text-primary bg-primary/10 border-primary/30",
    },
    {
      key: "minority",
      active: !!product.serves_minority_owned,
      icon: Users,
      label: "Minority-Owned Business Friendly",
      className: "text-gold bg-gold/10 border-gold/30",
    },
    {
      key: "women",
      active: !!product.serves_women_owned,
      icon: Heart,
      label: "Women-Owned Business Friendly",
      className: "text-gold bg-gold/10 border-gold/30",
    },
    {
      key: "veteran",
      active: !!product.serves_veterans,
      icon: Star,
      label: "Veteran-Owned Business Friendly",
      className: "text-gold bg-gold/10 border-gold/30",
    },
    {
      key: "startup",
      active: !!product.serves_startups,
      icon: Sparkles,
      label: "Startup-Friendly",
      className: "text-accent bg-accent/10 border-accent/30",
    },
  ].filter(f => f.active);

  if (flags.length === 0) return null;

  const iconSize = size === "md" ? "w-4 h-4" : "w-3 h-3";
  const padding = size === "md" ? "px-2 py-1" : "px-1.5 py-0.5";

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1 flex-wrap">
        {flags.map(f => {
          const Icon = f.icon;
          return (
            <Tooltip key={f.key}>
              <TooltipTrigger asChild>
                <div className={`inline-flex items-center justify-center ${padding} rounded border ${f.className}`}>
                  <Icon className={iconSize} />
                </div>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">{f.label}</p></TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
