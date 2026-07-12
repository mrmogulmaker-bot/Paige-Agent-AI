// "Across your clients — live" (Paige Context Rail STEP 3, staff/owner side).
//
// A compact live strip in the Your Paige command center that streams the tenant's
// Context Rail — every move Paige makes and every client signal, tenant-wide — over
// the private `rail:tenant:<tenantId>` broadcast topic via `useRailEvents`. Receive
// only; the DB decides what lands here (own-tenant isolation, §9/§13). Additive to
// the Live desk: this answers "what's happening across ALL my clients right now?"
// where the Live desk rescopes to the one focused customer.
//
// §11: token-only, no gold (gold is reserved for act/approve/on), motion-safe (the
// live dot's cc-breathe is disabled under prefers-reduced-motion in index.css).
// Guard: tenantId null → the subscriber opens nothing and we render a quiet skeleton,
// never a crash.
import { formatDistanceToNow } from "date-fns";
import { useRailEvents, type RailEvent } from "@/hooks/useRailEvents";
import { cn } from "@/lib/utils";

const MAX_ROWS = 6;

/**
 * Coarse family of a rail event, keyed off the `event_kind` namespace
 * (`owner.*`, `client.*`, `automation.*`, `comms.*`). Drives the little chip label
 * so a staffer can scan who/what a line is without reading the title.
 */
function kindChip(kind: string): { label: string; tone: "paige" | "client" | "auto" | "comms" | "system" } {
  const ns = kind.split(".")[0];
  switch (ns) {
    case "owner":
      return { label: "Paige", tone: "paige" };
    case "client":
      return { label: "Client", tone: "client" };
    case "automation":
      return { label: "Automation", tone: "auto" };
    case "comms":
      return { label: "Message", tone: "comms" };
    case "mcp":
      return { label: "External", tone: "system" };
    default:
      return { label: ns ? ns.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Event", tone: "system" };
  }
}

/** Surface slug → friendly chip text (your_paige → "Paige", client_portal → "Portal"). */
const SURFACE_LABEL: Record<string, string> = {
  your_paige: "Paige",
  contact_paige: "Profile",
  client_portal: "Portal",
  automation: "Automation",
  mcp: "External",
};
function surfaceLabel(surface: string): string | null {
  const s = surface.trim();
  if (!s) return null;
  return SURFACE_LABEL[s] ?? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Tone → token-only chip classes. Semantic status tokens only; never gold.
const TONE_CLASS: Record<ReturnType<typeof kindChip>["tone"], string> = {
  paige: "border-primary/30 text-primary",
  client: "border-[hsl(var(--ring)/0.35)] text-[hsl(var(--ring))]",
  auto: "border-border text-muted-foreground",
  comms: "border-border text-muted-foreground",
  system: "border-border text-muted-foreground",
};

function RailRow({ event }: { event: RailEvent }) {
  const chip = kindChip(event.event_kind);
  const surface = surfaceLabel(event.surface);
  // date-fns throws on an unparseable string — guard so one bad frame never blanks the strip.
  const when = (() => {
    const d = new Date(event.occurred_at);
    return Number.isNaN(d.getTime()) ? null : formatDistanceToNow(d, { addSuffix: true });
  })();

  return (
    <li className="rounded-md border border-border/70 bg-background/40 p-2.5">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none",
            TONE_CLASS[chip.tone],
          )}
        >
          {chip.label}
        </span>
        {surface && (
          <span className="inline-flex items-center rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
            {surface}
          </span>
        )}
        {when && <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/70">{when}</span>}
      </div>
      <p className="mt-1 line-clamp-1 text-xs text-foreground">{event.title || "Activity"}</p>
    </li>
  );
}

interface Props {
  /** Active tenant id from `useTenantContext`. Null → render a quiet skeleton (no subscription). */
  tenantId: string | null;
}

/**
 * Live tenant-wide rail strip for the command center. Subscribes for the life of
 * the component; unsubscribes and re-opens automatically when `tenantId` changes.
 */
export function PaigeRailFeed({ tenantId }: Props) {
  const { events, connected } = useRailEvents({ scope: "tenant", tenantId });

  // No tenant → nothing to stream. Render a stable, non-crashing placeholder.
  if (!tenantId) {
    return (
      <div>
        <Header connected={false} />
        <p className="px-0.5 py-1 text-xs text-muted-foreground">
          Pick a workspace to see activity across its clients.
        </p>
      </div>
    );
  }

  return (
    <div>
      <Header connected={connected} />
      {events.length === 0 ? (
        <p className="px-0.5 py-2 text-xs text-muted-foreground">
          Nothing across your clients yet — Paige's moves and client activity show up here live.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {events.slice(0, MAX_ROWS).map((e) => (
            <RailRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Section header + breathing "connected" dot (motion-safe via index.css). */
function Header({ connected }: { connected: boolean }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 px-0.5">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          connected ? "bg-[hsl(var(--ring))] cc-breathe" : "bg-muted-foreground/40",
        )}
        aria-hidden
      />
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Across your clients — live
      </span>
    </div>
  );
}
