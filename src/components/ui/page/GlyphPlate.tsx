import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The embossed indigo icon plate — the platform's single premium depth cue,
 * extracted from the Marketplace SkillCard so the motif is reused, not redrawn.
 * Powers PageHeader.icon, SectionCard.icon, and StatTile.icon.
 *
 * Gold discipline (§6): the ring is a faint gold hairline at rest; it brightens
 * to a real gold ring ONLY when `armed` (the on/act moment). Never a flat
 * bg-muted square, never a decorative gold fill.
 */
export function GlyphPlate({
  icon: Icon,
  size = "md",
  armed = false,
  className,
}: {
  icon: LucideIcon;
  size?: "sm" | "md" | "lg";
  armed?: boolean;
  className?: string;
}) {
  const dims = { sm: "h-9 w-9", md: "h-11 w-11", lg: "h-14 w-14" }[size];
  const iconDims = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-6 w-6" }[size];
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-xl shadow-md ring-1 ring-inset",
        "bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary-light))]",
        armed ? "ring-[hsl(var(--gold)/0.6)]" : "ring-[hsl(var(--gold)/0.25)]",
        dims,
        className,
      )}
    >
      <Icon className={cn("text-white/90", iconDims)} aria-hidden />
    </span>
  );
}
