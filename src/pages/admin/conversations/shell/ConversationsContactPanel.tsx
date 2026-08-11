// ConversationsContactPanel — the scope-agnostic RIGHT rail (§18 one home). For a scope WITH
// business context (the tenant) it renders the existing rich ContactCardRail as a pure
// pass-through (`renderRich`) — the deals/billing/portal/CRM rail is reused UNCHANGED, never
// reimplemented here (§13/§37 zero regression). For a scope WITHOUT it (the operator, whose SMS
// counterparty has no deals/billing/portal) it renders a MINIMAL panel: name · phone · labels ·
// how-to-reach · a lightweight recent recap. The absent business panels are honestly absent, not
// faked with empty deal/invoice widgets (§13).
//
// §11: token-only, motion-safe; no gold (a contact panel is not an act).
import { formatDistanceToNow } from "date-fns";
import { User, PanelRightClose } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CHANNEL_ICON, CHANNEL_LABEL, LABEL_COLOR } from "../inbox-shared";
import type { ConversationsContactPanelModel } from "./conversationsAdapter";

export function ConversationsContactPanel({
  hasContactBusinessPanels, renderRich, minimal,
}: ConversationsContactPanelModel) {
  // Rich scope (tenant): the existing ContactCardRail, passed straight through.
  if (hasContactBusinessPanels && renderRich) return <>{renderRich()}</>;

  // Minimal scope (operator, and any no-business scope): honest name/phone/labels/reach/recent.
  if (!minimal) return null;
  const { name, phone, reach = [], labels, recent, onClose } = minimal;
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
  const recentDesc = [...recent].slice(-6);

  return (
    <SectionCard padded={false} className="flex min-h-0 w-full flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-start gap-3 border-b border-border/60 px-4 py-3.5">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.12)] text-[11px] font-semibold text-[hsl(var(--primary))]"
          aria-hidden
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          {phone && <p className="truncate text-[11px] text-muted-foreground select-text">{phone}</p>}
        </div>
        {onClose && (
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            onClick={onClose} aria-label="Hide contact panel"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* labels */}
        {labels.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Labels</p>
            <div className="flex flex-wrap gap-1.5">
              {labels.map((l) => (
                <span key={l.id} className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", LABEL_COLOR[l.color])}>
                  {l.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* how to reach */}
        {reach.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Reach</p>
            <ul className="space-y-1.5">
              {reach.map((r, i) => {
                const Icon = CHANNEL_ICON[r.channel];
                return (
                  <li key={`${r.channel}-${i}`} className="flex items-center gap-2 text-sm text-foreground">
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground"
                      title={CHANNEL_LABEL[r.channel]} aria-label={CHANNEL_LABEL[r.channel]}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="truncate select-text">{r.address}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* recent recap — a lightweight list, NOT the rich rail (§13) */}
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recent</p>
          {recentDesc.length === 0 ? (
            <EmptyState
              icon={User} tone="muted"
              title="No messages yet"
              description="Recent messages with this contact will show up here."
              className="py-6"
            />
          ) : (
            <ul className="space-y-2">
              {recentDesc.map((m) => (
                <li key={m.id} className="rounded-lg border border-border/70 bg-muted/40 px-2.5 py-2">
                  <div className="mb-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground/80">{m.direction === "outbound" ? "You" : name}</span>
                    {m.timestamp && (
                      <span className="opacity-70">{formatDistanceToNow(new Date(m.timestamp), { addSuffix: true })}</span>
                    )}
                  </div>
                  <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs text-foreground/90">{m.body || "—"}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
