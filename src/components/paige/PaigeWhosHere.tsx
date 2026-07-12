// "Who's here" — the live roster of teammates on the platform right now (TASK #148).
// A STAFF/OWNER surface (§9) answering one question: "who's on at the same time as
// me?" Live updates come from POLLING the presence_list_online DEFINER RPC (via
// useWhoIsOnline) on an interval — never a realtime table subscription, because
// public.user_presence is deny-all to the browser by design.
//
// Visual matches the LiveActionFeed idiom: a header with a live count + breathing
// --ring dot, up to MAX_ROWS people rows, then "View all (n)". No gold — an online
// presence dot is semantic --success (§11), not an act/approve moment.
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PresenceAvatar } from "@/components/ui/page";
import { useWhoIsOnline } from "@/hooks/useWhoIsOnline";
import type { PresencePerson } from "@/hooks/useWhoIsOnline";

const MAX_ROWS = 4;

function GroupHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 px-0.5 pb-1.5 pt-0.5">
      <span className="h-2 w-2 rounded-full bg-[hsl(var(--ring))] cc-breathe" />
      <span className="text-sm font-semibold">Who's here</span>
      {count > 0 && (
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {count} online
        </span>
      )}
    </div>
  );
}

function PersonRow({ person }: { person: PresencePerson }) {
  const name = person.full_name?.trim() || "Teammate";
  const away = person.status === "away";
  return (
    <li className="flex items-center gap-2.5 rounded-md border p-2">
      <PresenceAvatar
        name={person.full_name}
        avatarUrl={person.avatar_url}
        status={away ? "away" : "online"}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {away ? (
            <>
              away
              {person.last_seen ? (
                <span className="opacity-70">
                  {" "}
                  · {formatDistanceToNow(new Date(person.last_seen), { addSuffix: true })}
                </span>
              ) : null}
            </>
          ) : (
            "online"
          )}
        </p>
      </div>
    </li>
  );
}

export function PaigeWhosHere() {
  const { people, othersCount, loading, error } = useWhoIsOnline();

  return (
    <div className="flex flex-col">
      <GroupHeader count={othersCount} />

      {loading ? (
        <ul className="space-y-1.5" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-2.5 rounded-md border p-2">
              <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <span className="block h-3 w-2/3 animate-pulse rounded bg-muted" />
                <span className="block h-2.5 w-1/3 animate-pulse rounded bg-muted" />
              </div>
            </li>
          ))}
        </ul>
      ) : people.length > 0 ? (
        // Keep the last-good roster on screen even if the latest poll errored —
        // the hook preserves `people` across a transient blip, so we don't flash
        // a reconnect line over a real, still-valid list.
        <>
          <ul className="space-y-1.5">
            {people.slice(0, MAX_ROWS).map((person) => (
              <PersonRow key={person.user_id} person={person} />
            ))}
          </ul>
          {people.length > MAX_ROWS && (
            <Button
              asChild
              variant="link"
              size="sm"
              className="mt-1 h-auto p-0 px-0.5 text-xs text-muted-foreground hover:text-accent"
            >
              <Link to="/admin/team">View all ({people.length})</Link>
            </Button>
          )}
        </>
      ) : error ? (
        <div className="flex items-center gap-2 px-0.5 py-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reconnecting…
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title="Just you right now"
          description="Anyone else on your team shows up here live."
          className="px-4 py-8"
        />
      )}
    </div>
  );
}
