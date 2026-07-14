import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, CheckCircle2, ChevronRight, Mail, MessageSquare,
  CalendarCheck, FileSignature, Landmark, TrendingUp, StickyNote,
  CreditCard, Sparkles, Activity, Send,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type Stage = {
  id: number;
  slug: string;
  label: string;
  description: string | null;
  display_order: number;
  color_hex: string | null;
};

type Transition = {
  id: string;
  contact_id: string;
  from_stage_id: number | null;
  to_stage_id: number;
  transitioned_at: string;
  source_event: string | null;
  metadata: Record<string, unknown> | null;
};

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  linked_user_id: string | null;
  journey_stage_id: number | null;
  journey_stage_entered_at: string | null;
  created_at: string;
};

type Event = {
  ts: string;
  kind: string;
  icon: React.ReactNode;
  title: string;
  detail?: string;
  meta?: Record<string, unknown>;
};

const ICON: Record<string, React.ReactNode> = {
  stage: <Sparkles className="h-4 w-4" />,
  tier: <TrendingUp className="h-4 w-4" />,
  message: <Mail className="h-4 w-4" />,
  conversation: <MessageSquare className="h-4 w-4" />,
  booking: <CalendarCheck className="h-4 w-4" />,
  signature: <FileSignature className="h-4 w-4" />,
  credit: <CreditCard className="h-4 w-4" />,
  banking: <Landmark className="h-4 w-4" />,
  note: <StickyNote className="h-4 w-4" />,
  default: <Activity className="h-4 w-4" />,
};

export default function ClientJourney() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmStage, setConfirmStage] = useState<Stage | null>(null);

  useEffect(() => { if (id) load(id); }, [id]);

  async function load(contactId: string) {
    setLoading(true);
    try {
      const [stagesRes, contactRes] = await Promise.all([
        supabase.from("paige_journey_stages").select("*").order("display_order"),
        supabase.from("clients").select("id, first_name, last_name, email, linked_user_id, journey_stage_id, journey_stage_entered_at, created_at").eq("id", contactId).maybeSingle(),
      ]);
      if (stagesRes.error) throw stagesRes.error;
      if (contactRes.error) throw contactRes.error;
      if (!contactRes.data) { toast.error("Contact not found"); navigate("/admin/contacts"); return; }
      setStages((stagesRes.data || []) as Stage[]);
      setClient(contactRes.data as Client);

      const trRes = await supabase
        .from("paige_journey_stage_transitions")
        .select("*")
        .eq("contact_id", contactId)
        .order("transitioned_at", { ascending: false });
      const tr = (trRes.data || []) as Transition[];
      setTransitions(tr);

      const composed = await composeTimeline(contactRes.data as Client, tr);
      setEvents(composed);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to load journey");
    } finally {
      setLoading(false);
    }
  }

  async function composeTimeline(c: Client, tr: Transition[]): Promise<Event[]> {
    const out: Event[] = [];

    for (const t of tr) {
      out.push({
        ts: t.transitioned_at,
        kind: "stage",
        icon: ICON.stage,
        title: `Moved to stage ${t.to_stage_id}`,
        detail: t.source_event ?? "manual",
        meta: t.metadata ?? undefined,
      });
    }

    if (c.linked_user_id) {
      const safe = async <T,>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> => {
        try { const r = await p; return (r.data ?? []) as T[]; } catch { return []; }
      };

      const msgs = await safe<any>(
        supabase.from("paige_messages_audit").select("created_at, channel, subject, body, status, contact_id").eq("contact_id", c.id).order("created_at", { ascending: false }).limit(50)
      );
      const conv = await safe<any>(
        supabase.from("communication_log").select("created_at, channel, message_type, subject, preview").eq("user_id", c.linked_user_id).order("created_at", { ascending: false }).limit(50)
      );
      const book = await safe<any>(
        supabase.from("paige_bookings").select("created_at, status, scheduled_at, event_type, title").eq("contact_id", c.id).order("created_at", { ascending: false }).limit(20)
      );
      const sig = await safe<any>(
        supabase.from("paige_signature_envelopes").select("created_at, status, envelope_type").eq("contact_id", c.id).order("created_at", { ascending: false }).limit(20)
      );
      const bc = await safe<any>(
        supabase.from("paige_business_credit_profiles").select("last_pulled_at, business_name, scores").eq("contact_id", c.id).order("last_pulled_at", { ascending: false }).limit(10)
      );
      const oc = await safe<any>(
        supabase.from("paige_owner_credit_snapshots").select("pulled_at, bureau, score").eq("contact_id", c.id).order("pulled_at", { ascending: false }).limit(10)
      );
      const cf = await safe<any>(
        supabase.from("paige_cash_flow_snapshots").select("period_end, runway_days, funding_readiness_score").eq("contact_id", c.id).order("period_end", { ascending: false }).limit(10)
      );
      const notes = await safe<any>(
        supabase.from("client_memory").select("created_at, memory_type, content").eq("client_user_id", c.linked_user_id).eq("is_active", true).order("created_at", { ascending: false }).limit(30)
      );

      for (const m of msgs) out.push({
        ts: m.created_at, kind: "message", icon: ICON.message,
        title: `${m.channel ?? "message"}${m.subject ? ` — ${m.subject}` : ""}`,
        detail: typeof m.body === "string" ? m.body.slice(0, 200) : undefined,
      });
      for (const m of conv) out.push({
        ts: m.created_at, kind: "conversation", icon: ICON.conversation,
        title: `Conversation (${m.channel ?? "?"}${m.message_type ? ` · ${m.message_type}` : ""})`,
        detail: m.subject ?? m.preview ?? undefined,
      });
      for (const b of book) out.push({
        ts: b.created_at, kind: "booking", icon: ICON.booking,
        title: `Booking ${b.status ?? ""}${b.event_type ? ` — ${b.event_type}` : ""}`,
        detail: b.scheduled_at ? `Scheduled ${new Date(b.scheduled_at).toLocaleString()}` : undefined,
      });
      for (const s of sig) out.push({
        ts: s.created_at, kind: "signature", icon: ICON.signature,
        title: `Signature ${s.status ?? ""}${s.envelope_type ? ` — ${s.envelope_type}` : ""}`,
      });
      for (const x of bc) if (x.last_pulled_at) {
        const scores = (x.scores ?? {}) as Record<string, unknown>;
        const paydex = scores.paydex ?? scores.dnb_paydex ?? "—";
        const intelli = scores.intelliscore ?? scores.experian_intelliscore ?? "—";
        out.push({
          ts: x.last_pulled_at, kind: "credit", icon: ICON.credit,
          title: `Business credit refreshed${x.business_name ? ` — ${x.business_name}` : ""}`,
          detail: `Paydex ${paydex} · Intelliscore ${intelli}`,
        });
      }
      for (const x of oc) if (x.pulled_at) out.push({
        ts: x.pulled_at, kind: "credit", icon: ICON.credit,
        title: `Owner credit (${x.bureau ?? "?"}) ${x.score ?? "—"}`,
      });
      for (const x of cf) if (x.period_end) out.push({
        ts: x.period_end, kind: "banking", icon: ICON.banking,
        title: "Cash-flow snapshot",
        detail: `Runway ${x.runway_days ?? "—"}d · readiness ${x.funding_readiness_score ?? "—"}/100`,
      });
      for (const n of notes) out.push({
        ts: n.created_at, kind: "note", icon: ICON.note,
        title: `Note (${n.memory_type ?? "general"})`,
        detail: typeof n.content === "string" ? n.content.slice(0, 220) : undefined,
      });
    }

    // Try Paige Agent AI bridge (stub-safe)
    try {
      const { data } = await supabase.functions.invoke("tenant-journey", {
        body: { verb: "get_journey", payload: { contact_id: c.id, email: c.email } },
      });
      const remote = (data as any)?.data?.events ?? [];
      for (const r of remote as any[]) {
        if (!r?.ts) continue;
        out.push({
          ts: r.ts,
          kind: r.kind ?? "default",
          icon: ICON[r.kind as keyof typeof ICON] ?? ICON.default,
          title: r.title ?? "Event",
          detail: r.detail,
          meta: r.meta,
        });
      }
    } catch { /* stub-safe */ }

    out.sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
    return out;
  }

  const currentStage = useMemo(
    () => stages.find(s => s.id === client?.journey_stage_id) ?? null,
    [stages, client?.journey_stage_id],
  );

  const eventsByStage = useMemo(() => {
    // group events by the stage that was active when they happened
    const sortedTr = [...transitions].sort((a, b) => +new Date(a.transitioned_at) - +new Date(b.transitioned_at));
    const groups: Record<number, Event[]> = {};
    for (const e of events) {
      const t = +new Date(e.ts);
      let stageId = client?.journey_stage_id ?? 1;
      // Find the latest transition <= event time
      let active = sortedTr[0]?.to_stage_id ?? 1;
      for (const tr of sortedTr) {
        if (+new Date(tr.transitioned_at) <= t) active = tr.to_stage_id;
      }
      stageId = active;
      (groups[stageId] ||= []).push(e);
    }
    return groups;
  }, [events, transitions, client?.journey_stage_id]);

  async function setStage(stage: Stage) {
    if (!client) return;
    const { data, error } = await supabase.rpc("set_journey_stage", {
      _contact_id: client.id,
      _stage_slug: stage.slug,
      _source_event: "admin_manual",
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Moved to ${stage.label}`);
    setConfirmStage(null);
    load(client.id);
  }

  if (loading || !client) {
    return <div className="p-6 text-sm text-muted-foreground">Loading journey…</div>;
  }

  const fullName = `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || client.email || "Contact";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/contacts/${client.id}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to contact
        </Button>
        <Badge variant="outline" className="text-xs">Doctrine §94 · 6-stage MMA journey</Badge>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{fullName}</h1>
        <p className="text-sm text-muted-foreground">Member journey timeline</p>
      </div>

      {/* Current stage */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-white"
              style={{ backgroundColor: currentStage?.color_hex ?? "#64748b" }}
            >
              {currentStage?.label ?? "Unassigned"}
            </span>
            <span className="text-sm text-muted-foreground">
              {client.journey_stage_entered_at
                ? `Entered ${formatDistanceToNow(new Date(client.journey_stage_entered_at), { addSuffix: true })}`
                : "Stage entry time unknown"}
            </span>
          </div>
          {currentStage?.slug === "ultimate_offer" && (
            <p className="max-w-md text-xs text-muted-foreground">
              MMA acts as a partner/facilitator on this engagement — never an equity holder.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Pipeline chevrons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Journey pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {stages.map(s => {
              const isCurrent = s.id === client.journey_stage_id;
              const isPast = (client.journey_stage_id ?? 0) > s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setConfirmStage(s)}
                  className={`group flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${
                    isCurrent ? "ring-2 ring-offset-2" : "hover:bg-muted/50"
                  } ${isPast ? "opacity-90" : !isCurrent ? "opacity-60" : ""}`}
                  style={isCurrent ? { borderColor: s.color_hex ?? undefined } : {}}
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: s.color_hex ?? "#64748b" }}
                  >
                    {isPast ? <CheckCircle2 className="h-4 w-4" /> : s.id}
                  </span>
                  <span className="font-medium">{s.label}</span>
                  {s.id < stages.length && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Click any stage to manually move this contact. Stage transitions are logged.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chronological timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {events.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No events yet. Stage data and rich events are loading from Paige Agent AI as the bridge comes online.
              </p>
            )}
            {[...stages].reverse().map(stage => {
              const list = eventsByStage[stage.id] ?? [];
              if (!list.length) return null;
              return (
                <div key={stage.id}>
                  <div
                    className="mb-3 inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: stage.color_hex ?? "#64748b" }}
                  >
                    {stage.label}
                  </div>
                  <ul className="space-y-2">
                    {list.map((e, i) => (
                      <li key={i} className="flex gap-3 rounded-md border bg-card p-3">
                        <div className="mt-0.5 text-muted-foreground">{e.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium">{e.title}</p>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(e.ts), { addSuffix: true })}
                            </span>
                          </div>
                          {e.detail && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-3">{e.detail}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Separator className="mt-4" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate(`/admin/campaigns`)}>
              <Send className="mr-2 h-4 w-4" /> Enroll in campaign
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => toast.info("Compose coming in Wave 3")}>
              <Mail className="mr-2 h-4 w-4" /> Send one-off message
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate(`/admin/contacts/${client.id}`)}>
              <MessageSquare className="mr-2 h-4 w-4" /> Open conversation
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => toast.info("Cal.com scheduler coming")}>
              <CalendarCheck className="mr-2 h-4 w-4" /> Schedule call
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => toast.info("Milestone capture coming")}>
              <Sparkles className="mr-2 h-4 w-4" /> Add milestone
            </Button>
            <Separator />
            <p className="text-xs text-muted-foreground">
              Paige Agent AI bridge v15 will populate cross-system events automatically once <code>get_journey</code> ships.
            </p>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!confirmStage} onOpenChange={(o) => !o && setConfirmStage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to "{confirmStage?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmStage?.description ?? "This will log a journey-stage transition."}
              {confirmStage?.slug === "ultimate_offer" && (
                <span className="mt-2 block text-xs">
                  Reminder: MMA acts as facilitator at this stage and never holds equity in the client's deals.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmStage && setStage(confirmStage)}>
              Confirm transition
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
