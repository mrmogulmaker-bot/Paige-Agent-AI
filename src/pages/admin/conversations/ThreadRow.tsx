import { formatDistanceToNow } from "date-fns";
import { StatePill } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { Clock, Archive } from "lucide-react";
import {
  type DbThread, type MessageRow, type Label, type ChannelType,
  CHANNEL_ICON, CHANNEL_LABEL, LABEL_COLOR, bodyPreview, contactNameFromClient, partyLabel, isUntilReply,
} from "./inbox-shared";
import { SnoozeMenu } from "./SnoozeMenu";
import { LabelPopover } from "./LabelPopover";

function ChannelGlyph({ channel, className }: { channel: ChannelType; className?: string }) {
  const Icon = CHANNEL_ICON[channel];
  return (
    <span
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-muted text-muted-foreground",
        className,
      )}
      title={CHANNEL_LABEL[channel]} aria-label={CHANNEL_LABEL[channel]}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

export function ThreadRow({
  thread, preview, channel, active, onClick,
  catalog, onSnooze, onArchive, onSetThreadLabels, onRenameCatalogLabel,
}: {
  thread: DbThread;
  preview: MessageRow | null;
  channel: ChannelType;
  active: boolean;
  onClick: () => void;
  catalog: Label[];
  onSnooze: (id: string, until: Date | string | null) => void;
  onArchive: (id: string, on: boolean) => void;
  onSetThreadLabels: (threadId: string, labels: Label[]) => void;
  onRenameCatalogLabel: (labelId: string, patch: Partial<Label>) => void;
}) {
  const name =
    contactNameFromClient(thread.clients) ||
    (preview ? partyLabel(preview.direction === "inbound" ? preview.sender : preview.recipients?.[0]) : "") ||
    "Unknown contact";
  const unread = thread.unread_count > 0;
  // R-N2: a draft is simply the latest message sitting as a draft.
  const hasDraft = preview?.status === "draft";
  const scheduled = preview?.status === "queued" && !!preview.scheduled_for;
  const labels = thread.labels ?? [];
  const snoozed = !!thread.snoozed_until && new Date(thread.snoozed_until) > new Date();
  const archived = !!thread.archived_at;
  const ts = thread.last_message_at ?? preview?.sent_at ?? preview?.created_at ?? null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex w-full cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        active
          ? "border-[hsl(var(--border-strong))] bg-muted"
          : "border-transparent hover:border-border hover:bg-muted/60",
      )}
    >
      <ChannelGlyph channel={channel} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm text-foreground", unread ? "font-semibold" : "font-medium")}>
            {name}
          </span>
          {unread && (
            <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-[hsl(var(--primary))] px-1 text-[10px] font-semibold tabular-nums text-primary-foreground"
              title={`${thread.unread_count} unread`}>
              {thread.unread_count > 9 ? "9+" : thread.unread_count}
            </span>
          )}
          {ts && (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {formatDistanceToNow(new Date(ts), { addSuffix: false })}
            </span>
          )}
        </div>

        <div className="mt-0.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {preview?.direction === "outbound" && preview.status !== "draft" ? "You: " : ""}
            {preview ? (bodyPreview(preview) || preview.subject || "—") : "—"}
          </span>
          {hasDraft && <StatePill state="building">Draft ready</StatePill>}
        </div>

        {/* state + labels + hover actions */}
        <div className="mt-1 flex items-center gap-1.5">
          {/* R-B1: a queued scheduled send is visible in the rail (find-and-cancel surface). */}
          {scheduled && preview?.scheduled_for && (
            <StatePill state="pending" icon={<Clock className="h-2.5 w-2.5" />}>
              Scheduled · {formatDistanceToNow(new Date(preview.scheduled_for))}
            </StatePill>
          )}
          {snoozed && (
            <StatePill state="pending" icon={<Clock className="h-2.5 w-2.5" />}>
              {isUntilReply(thread.snoozed_until) ? "Until reply" : `Snoozed · ${formatDistanceToNow(new Date(thread.snoozed_until!))}`}
            </StatePill>
          )}
          {archived && <StatePill state="off" icon={<Archive className="h-2.5 w-2.5" />}>Archived</StatePill>}
          {labels.slice(0, 2).map((l) => (
            <span key={l.id} className={cn("rounded-full border px-1.5 py-0 text-[10px] font-medium", LABEL_COLOR[l.color])}>
              {l.name}
            </span>
          ))}
          {labels.length > 2 && <span className="text-[10px] text-muted-foreground">+{labels.length - 2}</span>}

          <span className="ml-auto flex items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <LabelPopover
              thread={thread} catalog={catalog}
              onSetThreadLabels={onSetThreadLabels} onRenameCatalogLabel={onRenameCatalogLabel}
            />
            <SnoozeMenu thread={thread} onSnooze={onSnooze} onArchive={onArchive} />
          </span>
        </div>
      </div>
    </div>
  );
}
