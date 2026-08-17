import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlyphPlate } from "@/components/ui/page";
import { usePlatformUpdate } from "@/hooks/usePlatformUpdate";
import { useScopedUserId } from "@/hooks/useScopedUserId";

/**
 * PlatformUpdateBanner — a subtle, NON-BLOCKING toast-style bar that appears
 * when a newer build of Paige has been deployed while this tab is running an
 * older one (#177). One-click "Reload" soft-updates without a re-login; the X
 * dismisses THIS build's notice — dismissal is tracked per-build in the hook, so
 * if a FURTHER build ships while the tab stays open the notice re-appears.
 *
 * SIGNED-IN ONLY (owner-ruled 2026-08-17): this is an IN-APP affordance — it must
 * NEVER surface on a public/marketing/landing page or to any logged-out visitor.
 * It is mounted once at the App root (so it persists across in-app navigation and
 * is domain-agnostic on tenant custom domains), but it renders ONLY when a real
 * auth session exists. No session ⇒ nothing renders, on any surface.
 */
export function PlatformUpdateBanner() {
  const { updateAvailable, reload, dismiss } = usePlatformUpdate();
  const reduce = useReducedMotion();
  // Gate on a real signed-in user. `useScopedUserId` resolves the effective
  // session uid (null until confirmed, and null for every anonymous visitor), so
  // the safe default is "don't show" — a public visitor never sees this.
  const userId = useScopedUserId();

  const show = updateAvailable && userId !== null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={reduce ? { opacity: 1 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
          className="fixed inset-x-0 bottom-4 z-[100] mx-auto flex w-[calc(100%-2rem)] max-w-md items-center gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 text-card-foreground shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80"
        >
          {/* Shared GlyphPlate primitive (§11/§12) — indigo hairline at rest, never
              gold on a decorative glyph. */}
          <GlyphPlate icon={RefreshCw} size="sm" ring="indigo" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              A new version of Paige is available
            </p>
            {/* Wrap (don't truncate): the "you'll stay signed in" reassurance is the
                anxiety-reducer that makes a non-technical user click Reload (§36) —
                clipping it defeats the purpose. */}
            <p className="text-xs leading-snug text-muted-foreground">
              Reload to get the latest — you&apos;ll stay signed in.
            </p>
          </div>

          {/* Gold is spent on THIS act — reloading to update is the primary,
              approve-style action, exactly the moment §11 reserves gold for. */}
          <Button
            variant="gold"
            size="sm"
            onClick={reload}
            className="shrink-0"
          >
            Reload
          </Button>

          <button
            type="button"
            aria-label="Dismiss update notice"
            onClick={dismiss}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
