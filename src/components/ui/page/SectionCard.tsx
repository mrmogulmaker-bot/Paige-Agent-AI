import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlyphPlate } from "./GlyphPlate";

/**
 * The elevated container that replaces raw <Card>. Resting shadow-card →
 * hover:shadow-lg ONLY when interactive. Optional numbered rail badge (the
 * Marketplace category-rail motif) and embossed glyph-plate icon.
 */
export function SectionCard({
  title,
  description,
  icon: Icon,
  numbered,
  actions,
  footer,
  padded = true,
  interactive = false,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  numbered?: number;
  actions?: ReactNode;
  footer?: ReactNode;
  padded?: boolean;
  interactive?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const hasHeader = title || description || actions || Icon || numbered != null;
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-border bg-card shadow-card",
        interactive && "transition-shadow duration-200 hover:shadow-lg",
        className,
      )}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex items-start gap-3 min-w-0">
            {numbered != null && (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-semibold text-white">
                {String(numbered).padStart(2, "0")}
              </span>
            )}
            {Icon && <GlyphPlate icon={Icon} size="sm" />}
            <div className="min-w-0">
              {title && (
                <h2 className="font-display text-base font-semibold leading-tight text-foreground">{title}</h2>
              )}
              {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      {children != null && (
        <div className={cn(padded && "p-5", hasHeader && padded && "pt-4")}>{children}</div>
      )}
      {footer && <div className="border-t border-border/60 px-5 py-3">{footer}</div>}
    </div>
  );
}
