import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { SectionCard, EmptyState, StatePill, GlyphPlate } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  User, UserPlus, Mail, Phone, Clock, Copy, ShieldAlert, BellOff, PanelRightClose,
} from "lucide-react";
import {
  type ClientContact, type MessageRow, type Label, type ChannelType, type Suppression,
  CHANNEL_ICON, CHANNEL_LABEL, LABEL_COLOR, bodyPreview, contactNameFromClient,
} from "./inbox-shared";

function CopyRow({ icon: Icon, value, label }: { icon: typeof Mail; value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard?.writeText(value); toast.success("Copied."); }}
      className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs
        hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
      title={`Copy ${label}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-foreground">{value}</span>
      <Copy className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

export function ContactCardRail({
  contact, channel, toAddress, recentMessages, labels, suppressions, onClose,
}: {
  contact: ClientContact | null;
  channel: ChannelType;
  toAddress: string;
  recentMessages: MessageRow[];
  labels: Label[];
  suppressions: Suppression[];
  onClose: () => void;
}) {
  // Local clock ticks each minute for the contact's timezone (§36 domain nicety).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const optedOut = suppressions.length > 0;
  const dnd = !!contact?.dnd_active;

  return (
    <SectionCard padded={false} className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <span className="text-sm font-semibold text-foreground">Contact</span>
        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground
            focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          onClick={onClose} aria-label="Hide contact panel"
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      {!contact ? (
        <div className="grid flex-1 place-items-center">
          <EmptyState
            icon={UserPlus}
            tone="muted"
            title="No client record yet."
            description="This thread isn't linked to a client. Add them and their details show up here."
            className="py-8"
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {/* Identity */}
          <div className="flex items-start gap-3">
            <GlyphPlate icon={User} size="md" ring="indigo" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {contactNameFromClient(contact) || toAddress || "Unknown contact"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <StatePill state={contact.status === "active" ? "success" : "pending"}>
                  {contact.status === "active" ? "Active" : (contact.status || "Lead")}
                </StatePill>
                {contact.created_at && (
                  <span className="text-[11px] text-muted-foreground">
                    Client for {formatDistanceToNow(new Date(contact.created_at))}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Opt-out / DND — proactive compliance signal (§13 real states, read-only) */}
          {(optedOut || dnd) && (
            <div className="space-y-1.5 rounded-lg border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.08)] p-2.5">
              {optedOut && (
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--warning))]" />
                  <div className="text-[11px] text-foreground">
                    Opted out of{" "}
                    {[...new Set(suppressions.map((s) => CHANNEL_LABEL[s.channel as ChannelType] ?? s.channel))].join(" & ")}
                    <span className="text-muted-foreground"> — Paige won't send on {suppressions.length > 1 ? "these" : "this"}.</span>
                  </div>
                </div>
              )}
              {dnd && (
                <div className="flex items-start gap-2">
                  <BellOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--warning))]" />
                  <div className="text-[11px] text-foreground">
                    Do-not-disturb on
                    {contact.dnd_reason ? <span className="text-muted-foreground"> — {contact.dnd_reason}</span> : null}
                    {contact.dnd_until ? (
                      <span className="text-muted-foreground"> (until {new Date(contact.dnd_until).toLocaleDateString()})</span>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Handles */}
          <div className="space-y-0.5">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Reach them</p>
            {contact.email && <CopyRow icon={Mail} value={contact.email} label="email" />}
            {contact.phone && <CopyRow icon={Phone} value={contact.phone} label="phone" />}
            {toAddress && toAddress !== contact.email && toAddress !== contact.phone && (
              <CopyRow icon={CHANNEL_ICON[channel]} value={toAddress} label={CHANNEL_LABEL[channel]} />
            )}
          </div>

          {/* Local time */}
          {contact.timezone && (
            <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                {new Intl.DateTimeFormat(undefined, {
                  timeZone: contact.timezone, hour: "numeric", minute: "2-digit",
                }).format(now)}{" "}
                their time
              </span>
            </div>
          )}

          {/* Labels (read-only mirror; edit via the row/header popover) */}
          {labels.length > 0 && (
            <div className="space-y-1">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Labels</p>
              <div className="flex flex-wrap gap-1.5 px-2">
                {labels.map((l) => (
                  <span key={l.id} className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", LABEL_COLOR[l.color])}>
                    {l.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recent activity — from loaded messages, no query */}
          <div className="space-y-1">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</p>
            {recentMessages.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="space-y-1">
                {recentMessages.slice(-5).reverse().map((m) => (
                  <li key={m.id} className="flex items-start gap-2 rounded-md px-2 py-1 text-[11px]">
                    <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                      m.direction === "inbound" ? "bg-[hsl(var(--primary))]" : "bg-muted-foreground")} />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      <span className="text-foreground/80">{m.direction === "inbound" ? "" : "You: "}</span>
                      {bodyPreview(m) || m.subject || "—"}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground/70">
                      {formatDistanceToNow(new Date(m.sent_at ?? m.created_at), { addSuffix: false })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
