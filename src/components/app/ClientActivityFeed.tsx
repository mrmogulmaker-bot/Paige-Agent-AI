/**
 * "Your activity" — the CLIENT side of the Paige Context Rail (STEP 4, §7/§8).
 *
 * This closes the two-way loop from the client's standpoint: as the client
 * messages their Paige, answers intake, or responds to something their team
 * proposed, those moves are filed to the rail and stream back here live — so the
 * client can see their own recent activity with their team, in their coach's
 * brand. Receive-only over the private `rail:client:<contact_id>` topic; the DB
 * broadcasts ONLY the client's own `client_visible` events to that topic
 * (owner_internal never reaches it — §9), so this surface is safe by construction.
 *
 * Mobile-first (the tenant's customers live on their phones): single column, big
 * readable rows, no horizontal scroll, thumb-comfortable spacing at ~375px.
 * §11: token-only, NO gold (gold is reserved for act/approve/on), motion-safe
 * (the live dot's cc-breathe is disabled under prefers-reduced-motion in
 * index.css). §3: friendly, human copy — never an internal slug or owner jargon.
 *
 * Never crashes: a null/unknown contact renders nothing; a client with no
 * activity yet gets a crafted empty state.
 */
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  MessageCircle,
  CheckCircle2,
  ClipboardCheck,
  Send,
  Sparkles,
} from "lucide-react";
import { useRailEvents, type RailEvent } from "@/hooks/useRailEvents";
import { useMyContactId } from "@/hooks/useMyContactId";
import { usePlaybook } from "@/lib/playbook";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** How many recent rows to show — a glanceable strip, not a full history. */
const MAX_ROWS = 6;

type RowVisual = { icon: typeof MessageCircle; headline: (paige: string) => string };

/**
 * Map a rail `event_kind` to friendly, client-facing copy + an icon. Keyed on the
 * concrete client-visible kinds first, then the namespace, so a new kind never
 * shows a raw slug — it falls back to a warm generic line. `{paige}` is the
 * tenant's persona name (§3), not a hardcoded "Paige".
 */
const KIND_VISUAL: Record<string, RowVisual> = {
  "client.message": { icon: MessageCircle, headline: (p) => `You messaged ${p}` },
  "client.intake_answer": { icon: ClipboardCheck, headline: () => "You shared some details" },
  "client.action_response": { icon: CheckCircle2, headline: () => "You responded" },
  "comms.inbound": { icon: Send, headline: () => "You sent a message" },
  "comms.outbound": { icon: MessageCircle, headline: (p) => `${p} sent you a message` },
};

function visualFor(kind: string): RowVisual {
  const exact = KIND_VISUAL[kind];
  if (exact) return exact;
  const ns = kind.split(".")[0];
  switch (ns) {
    case "client":
      return { icon: Activity, headline: () => "Your activity" };
    case "comms":
      return { icon: MessageCircle, headline: () => "Message" };
    default:
      return { icon: Sparkles, headline: (p) => `Update from ${p}` };
  }
}

/** Guarded relative time — date-fns throws on an unparseable string. */
function relTime(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : formatDistanceToNow(d, { addSuffix: true });
}

function ActivityRow({ event, paige }: { event: RailEvent; paige: string }) {
  const visual = visualFor(event.event_kind);
  const Icon = visual.icon;
  const headline = visual.headline(paige);
  const when = relTime(event.occurred_at);
  // The server-authored summary carries the specifics (client_visible + voice-safe);
  // show it as a muted detail when it adds something beyond the headline.
  const detail = event.summary?.trim() || null;

  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-3">
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug text-foreground">{headline}</p>
          {when && (
            <span className="shrink-0 whitespace-nowrap pt-0.5 text-[11px] tabular-nums text-muted-foreground/70">
              {when}
            </span>
          )}
        </div>
        {detail && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{detail}</p>}
      </div>
    </li>
  );
}

function LiveDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "h-2 w-2 rounded-full",
        connected ? "bg-[hsl(var(--ring))] cc-breathe" : "bg-muted-foreground/40",
      )}
      aria-hidden
    />
  );
}

interface Props {
  /**
   * The client's own contact_id. When omitted, the component resolves it itself
   * via `useMyContactId`. Pass it (e.g. from `useMyActions`) to avoid a duplicate
   * lookup when the parent already knows it.
   */
  contactId?: string | null;
  className?: string;
}

/**
 * Live "Your activity" strip for the client portal. Subscribes to the client's
 * own rail topic for the life of the component; renders nothing for a
 * non-client / unknown contact so it's always safe to drop onto any surface.
 */
export function ClientActivityFeed({ contactId: contactIdProp, className }: Props) {
  const pb = usePlaybook();
  const paige = pb.persona?.name?.trim() || "Paige";

  // Self-resolve only when the parent didn't hand us a contact_id (prop omitted).
  const selfResolve = contactIdProp === undefined;
  const { contactId: resolved, loading: resolving } = useMyContactId(selfResolve);
  const contactId = selfResolve ? resolved : contactIdProp;
  const loading = selfResolve ? resolving : false;

  const { events, connected } = useRailEvents({ scope: "client", contactId: contactId ?? null });

  // While self-resolving we can't yet tell a staff/impersonator apart from a
  // linked client, so we must NOT render a client-labeled "Your activity"
  // skeleton — that would flash the client surface to a non-client (§9/§11).
  // Hold entirely until the contact_id is known; a real client's below-the-fold
  // strip simply appears once resolved. (The explicit-prop mount never loads.)
  if (loading) return null;

  // Not a linked client (staff preview, unknown) — this surface isn't theirs.
  if (!contactId) return null;

  return (
    <section className={className}>
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <LiveDot connected={connected} />
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Your activity
        </h2>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground/70">
              <Activity className="h-4 w-4" />
            </span>
            <p className="text-sm font-medium text-foreground">Nothing yet</p>
            <p className="max-w-[16rem] text-xs text-muted-foreground">
              Your updates from {paige} will show up here as you work together.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {events.slice(0, MAX_ROWS).map((e) => (
            <ActivityRow key={e.id} event={e} paige={paige} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default ClientActivityFeed;
