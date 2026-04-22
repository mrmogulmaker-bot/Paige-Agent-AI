import { useState } from "react";
import { Building2, Plus, Check, ChevronDown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBusinessContext, entityRoleLabel } from "@/contexts/BusinessContext";
import { AddBusinessFlow } from "./AddBusinessFlow";
import { cn } from "@/lib/utils";

interface BusinessSelectorProps {
  className?: string;
  /** When true, render as a single dropdown instead of a pill row. */
  compact?: boolean;
}

/**
 * BusinessSelector — primary control for switching the active business
 * across all panels that read from BusinessContext.
 *
 * Two layouts:
 *  - Pill row (default, desktop) — quick visual scan of the portfolio
 *  - Dropdown (compact / mobile) — single button, less horizontal space
 */
export function BusinessSelector({ className, compact = false }: BusinessSelectorProps) {
  const { businesses, activeBusinessId, activeBusiness, setActiveBusinessId, limit } =
    useBusinessContext();
  const [addOpen, setAddOpen] = useState(false);

  if (!businesses.length) {
    return (
      <>
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-card/50 px-4 py-3",
            className
          )}
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span>No business added yet.</span>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add business
          </Button>
        </div>
        <AddBusinessFlow open={addOpen} onOpenChange={setAddOpen} />
      </>
    );
  }

  // Compact dropdown layout
  if (compact || businesses.length > 4) {
    return (
      <>
        <div className={cn("flex items-center gap-2", className)}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 max-w-[280px] justify-between">
                <span className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {activeBusiness?.legal_name ?? "Select business"}
                  </span>
                  {activeBusiness?.entity_role && (
                    <Badge variant="secondary" className="ml-1 shrink-0 text-[10px]">
                      {entityRoleLabel(activeBusiness.entity_role)}
                    </Badge>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>Your businesses</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {businesses.map((b) => (
                <DropdownMenuItem
                  key={b.id}
                  onClick={() => setActiveBusinessId(b.id)}
                  className="flex items-center gap-2"
                >
                  {b.id === activeBusinessId ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <span className="h-4 w-4" />
                  )}
                  <span className="flex-1 truncate">{b.legal_name}</span>
                  {b.entity_role && (
                    <Badge variant="outline" className="text-[10px]">
                      {entityRoleLabel(b.entity_role)}
                    </Badge>
                  )}
                  {b.is_primary && (
                    <Badge variant="secondary" className="text-[10px]">
                      Primary
                    </Badge>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setAddOpen(true)}
                className="text-primary focus:text-primary"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add business
                {limit?.at_limit && <Lock className="ml-2 h-3 w-3 opacity-60" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {limit && limit.effective_limit > 1 && (
            <span className="text-xs text-muted-foreground">
              {limit.current_count} / {limit.effective_limit === 999 ? "∞" : limit.effective_limit}
            </span>
          )}
        </div>
        <AddBusinessFlow open={addOpen} onOpenChange={setAddOpen} />
      </>
    );
  }

  // Pill row layout (default for 1–4 businesses on desktop)
  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        {businesses.map((b) => {
          const selected = b.id === activeBusinessId;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setActiveBusinessId(b.id)}
              className={cn(
                "group flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
                selected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card hover:border-primary/50"
              )}
            >
              <Building2
                className={cn(
                  "h-3.5 w-3.5",
                  selected ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span className="font-medium truncate max-w-[160px]">{b.legal_name}</span>
              {b.entity_role && (
                <Badge
                  variant={selected ? "default" : "outline"}
                  className="text-[10px] px-1.5 py-0"
                >
                  {entityRoleLabel(b.entity_role)}
                </Badge>
              )}
              {b.is_primary && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="Primary" />
              )}
            </button>
          );
        })}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddOpen(true)}
          className="gap-1.5 rounded-full"
        >
          <Plus className="h-3.5 w-3.5" />
          Add business
          {limit?.at_limit && <Lock className="ml-1 h-3 w-3 opacity-60" />}
        </Button>
        {limit && limit.effective_limit > 1 && (
          <span className="text-xs text-muted-foreground">
            {limit.current_count} / {limit.effective_limit === 999 ? "∞" : limit.effective_limit}
          </span>
        )}
      </div>
      <AddBusinessFlow open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
