import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

/**
 * Presence primitives — the "who's online" status glyph and an avatar that
 * carries it.
 *
 * GOLD DISCIPLINE (§11): a resting presence dot is *status*, never an
 * act/approve/on moment — so online is semantic `--success`, away is
 * `--warning`, busy is `--info` (teal), offline is a muted grey. Gold is
 * deliberately absent here (never a presence tone). The live "breathing" pulse is
 * framer-motion and is switched off under `useReducedMotion` (static dot fallback).
 *
 * `busy` (1c-ix, presence_list_effective) uses `--info` (teal) so it reads as a
 * distinct STATUS — clearly apart from away's amber, and deliberately NOT the indigo
 * `--primary` that the surrounding interactive chrome (active chips, toggle) already
 * spends, so a busy dot never looks like UI chrome. Never borrows the gold budget.
 */

export type PresenceStatus = "online" | "away" | "offline" | "busy";

const DOT_TONE: Record<PresenceStatus, string> = {
  online: "bg-[hsl(var(--success))]",
  away: "bg-[hsl(var(--warning))]",
  busy: "bg-[hsl(var(--info))]",
  offline: "bg-muted-foreground/40",
};

const DOT_SIZE = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
} as const;

export function PresenceDot({
  status,
  size = "md",
  className,
}: {
  status: PresenceStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const reduce = useReducedMotion();
  const pulsing = status === "online" && !reduce;

  return (
    <span className={cn("relative inline-flex shrink-0", DOT_SIZE[size], className)}>
      {pulsing && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-[hsl(var(--success))]"
          initial={{ opacity: 0.5, scale: 1 }}
          animate={{ opacity: 0, scale: 2.4 }}
          transition={{ duration: 1.8, ease: "easeOut", repeat: Infinity }}
        />
      )}
      <span
        className={cn(
          "relative inline-block h-full w-full rounded-full ring-2 ring-[hsl(var(--background))]",
          DOT_TONE[status],
        )}
      />
    </span>
  );
}

function initialsOf(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_SIZE = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
} as const;

/**
 * A shadcn Avatar with a presence dot pinned to the bottom-right. Falls back to
 * initials when there's no image. The dot inherits the same status semantics
 * (and reduced-motion safety) as {@link PresenceDot}.
 */
export function PresenceAvatar({
  name,
  avatarUrl,
  status,
  size = "md",
  className,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  status: PresenceStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Avatar className={AVATAR_SIZE[size]}>
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={name ?? "Teammate"} /> : null}
        <AvatarFallback className="text-xs font-medium">{initialsOf(name)}</AvatarFallback>
      </Avatar>
      <PresenceDot
        status={status}
        size={size}
        className="absolute -bottom-0.5 -right-0.5"
      />
    </span>
  );
}
