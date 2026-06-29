import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Mail, Phone, Building2, DollarSign, ExternalLink,
  MessageSquare, CheckSquare, FileText, StickyNote, Activity, Briefcase,
  CreditCard, User, Landmark, TrendingUp, Send, Pencil, ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { LIFECYCLE_STAGES, lifecycleMeta } from "@/lib/contacts";
import { ContactDealsSection } from "@/components/admin/contacts/ContactDealsSection";
import { FundingReadinessLens } from "@/components/funding-lens/FundingReadinessLens";
import { EditContactDialog } from "@/components/admin/contacts/EditContactDialog";
import { QuickLogMenu } from "@/components/admin/contacts/QuickLogMenu";
import { DuplicatesBanner } from "@/components/admin/contacts/DuplicatesBanner";
import { useTenantFeature } from "@/hooks/useTenantFeature";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";
import { CATEGORY_LABEL, RISK_COLOR, type ApprovalCategory } from "@/lib/approvals";

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  entity_name: string | null;
  title?: string | null;
  funding_goal: number | null;
  status: string;
  lifecycle_stage?: string | null;
  tags?: string[] | null;
  source?: string | null;
  assigned_coach_user_id: string | null;
  linked_user_id: string | null;
  created_at: string;
  current_notes?: string | null;
};

type Coach = { user_id: string; name: string };

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const { items: contactApprovals } = usePendingApprovals({ contactId: id });

  useEffect(() => { if (id) load(id); }, [id]);

  const load = async (clientId: string) => {
    setLoading(true);
    try {
      const { data: c, error } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
      if (error) throw error;
      if (!c) { toast.error("Contact not found"); navigate("/admin/contacts"); return; }
      setClient(c as Client);

      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "coach");
      const coachIds = (roles || []).map((r: any) => r.user_id);
      if (coachIds.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", coachIds);
        setCoaches((profs || []).map((p: any) => ({ user_id: p.user_id, name: p.full_name || "Unnamed Coach" })));
      }

      if (c.linked_user_id) {
        const [actRes, taskRes, noteRes, fileRes] = await Promise.all([
          supabase.from("communication_log").select("*").eq("user_id", c.linked_user_id).order("created_at", { ascending: false }).limit(50),
          supabase.from("tasks").select("*").eq("user_id", c.linked_user_id).order("created_at", { ascending: false }).limit(50),
          supabase.from("client_memory").select("*").eq("client_user_id", c.linked_user_id).eq("is_active", true).order("created_at", { ascending: false }).limit(50),
          supabase.from("documents").select("*").eq("user_id", c.linked_user_id).order("uploaded_at", { ascending: false }).limit(50),
        ]);
        setActivity(actRes.data || []);
        setTasks(taskRes.data || []);
        setNotes(noteRes.data || []);
        setFiles(fileRes.data || []);
      } else {
        const [noteRes, fileRes] = await Promise.all([
          supabase.from("client_memory").select("*").eq("client_id", clientId).eq("is_active", true).order("created_at", { ascending: false }).limit(50),
          supabase.from("documents").select("*").eq("client_id", clientId).order("uploaded_at", { ascending: false }).limit(50),
        ]);
        setNotes(noteRes.data || []);
        setFiles(fileRes.data || []);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load contact");
    } finally {
      setLoading(false);
    }
  };

  const assignCoach = async (coachId: string | null) => {
    if (!client) return;
    const { error } = await supabase.from("clients").update({ assigned_coach_user_id: coachId }).eq("id", client.id);
    if (error) return toast.error(error.message);
    setClient({ ...client, assigned_coach_user_id: coachId });
    toast.success(coachId ? "Coach assigned" : "Coach unassigned");
  };

  const updateStatus = async (status: string) => {
    if (!client) return;
    const { error } = await supabase.from("clients").update({ status }).eq("id", client.id);
    if (error) return toast.error(error.message);
    setClient({ ...client, status });
    toast.success(`Stage moved to ${status}`);
  };

  const updateLifecycle = async (stage: string) => {
    if (!client) return;
    const { error } = await supabase.from("clients").update({ lifecycle_stage: stage }).eq("id", client.id);
    if (error) return toast.error(error.message);
    setClient({ ...client, lifecycle_stage: stage });
    toast.success(`Lifecycle moved to ${stage}`);
  };

  const fullName = useMemo(() => client ? `${client.first_name} ${client.last_name}`.trim() : "", [client]);
  const { enabled: btfEnabled } = useTenantFeature("btf_enabled");
  const coachName = (uid: string | null) => uid ? (coaches.find((c) => c.user_id === uid)?.name || "Coach") : "Unassigned";

  const sendBtfInvite = async () => {
    if (!client?.email) {
      toast.error("Add an email to this contact first");
      return;
    }
    const toastId = toast.loading("Sending BTF workspace invite…");
    try {
      const { data, error } = await supabase.functions.invoke("invite-btf-client", {
        body: {
          contact_email: client.email,
          full_name: fullName || null,
          preferred_name: client.first_name || null,
          paige_client_id: client.id,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Invite failed");
      toast.success(data.email_sent ? "Invite emailed" : "Invite created (email pending)", { id: toastId });
    } catch (e: any) {
      toast.error(e.message || "Could not send invite", { id: toastId });
    }
  };

  const startOnboarding = async () => {
    if (!client?.email) {
      toast.error("Add an email to this contact first");
      return;
    }
    const ok = window.confirm(
      `Start BTF onboarding for ${fullName || client.email}? This will mark them as an active client and email them the welcome / magic-link.`,
    );
    if (!ok) return;
    const toastId = toast.loading("Starting onboarding…");
    try {
      const { data, error } = await supabase.functions.invoke("start-btf-onboarding", {
        body: { client_id: client.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Could not start onboarding");
      toast.success("Onboarding started — welcome email sent", { id: toastId });
    } catch (e: any) {
      toast.error(e.message || "Could not start onboarding", { id: toastId });
    }
  };

  if (loading || !client) {
    return <div className="p-8 text-center text-muted-foreground">Loading contact…</div>;
  }

  const lcMeta = lifecycleMeta(client.lifecycle_stage);


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/contacts")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Contacts
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold truncate">{fullName || "Unnamed Contact"}</h1>
          <p className="text-sm text-muted-foreground">{client.entity_name || "No business on file"}</p>
        </div>
        <QuickLogMenu
          contactId={client.id}
          contactUserId={client.linked_user_id}
          contactDisplay={fullName || client.email || "contact"}
          onLogged={() => id && load(id)}
        />
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4 mr-1" /> Edit
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate(`/admin/contacts/${client.id}/journey`)}>
          <Activity className="h-4 w-4 mr-1" /> Member Journey
        </Button>
        {btfEnabled && (
          <>
            <Button variant="outline" size="sm" onClick={sendBtfInvite}>
              <Send className="h-4 w-4 mr-1" /> Resend BTF Invite
            </Button>
            {client.lifecycle_stage === "won" && (
              <Button size="sm" onClick={startOnboarding}>
                <Send className="h-4 w-4 mr-1" /> Start Onboarding
              </Button>
            )}
          </>
        )}
        {client.linked_user_id && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/admin/clients/user/${client.linked_user_id}`)}>
            <ExternalLink className="h-4 w-4 mr-1" /> Full Client File
          </Button>
        )}
        {!client.linked_user_id && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/admin/clients/internal/${client.id}`)}>
            <ExternalLink className="h-4 w-4 mr-1" /> Internal Record
          </Button>
        )}
      </div>

      <DuplicatesBanner contactId={client.id} email={client.email} phone={client.phone} />



      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" /> {client.email || "—"}</div>
            <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /> {client.phone || "—"}</div>
            <div className="flex items-center gap-2 text-muted-foreground"><Building2 className="h-4 w-4" /> {client.entity_name || "—"}</div>
            <div className="flex items-center gap-2 text-muted-foreground"><DollarSign className="h-4 w-4" /> {client.funding_goal ? `$${Number(client.funding_goal).toLocaleString()} goal` : "No goal set"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Lifecycle Stage</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Badge variant="outline" className={`${lcMeta.color} border-transparent`}>{lcMeta.label}</Badge>
            <Select value={client.lifecycle_stage || "lead"} onValueChange={updateLifecycle}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LIFECYCLE_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {client.tags && client.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {client.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Assigned Coach</CardTitle></CardHeader>
          <CardContent>
            <Select
              value={client.assigned_coach_user_id || "unassigned"}
              onValueChange={(v) => assignCoach(v === "unassigned" ? null : v)}
            >
              <SelectTrigger className="h-9"><SelectValue>{coachName(client.assigned_coach_user_id)}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {coaches.map((co) => <SelectItem key={co.user_id} value={co.user_id}>{co.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {client.source && (
              <div className="text-xs text-muted-foreground mt-2">Source: {client.source}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="deals">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="deals"><Briefcase className="h-4 w-4 mr-1" /> Deals</TabsTrigger>
          <TabsTrigger value="activity"><Activity className="h-4 w-4 mr-1" /> Activity</TabsTrigger>
          <TabsTrigger value="comms"><MessageSquare className="h-4 w-4 mr-1" /> Communications</TabsTrigger>
          <TabsTrigger value="tasks"><CheckSquare className="h-4 w-4 mr-1" /> Tasks</TabsTrigger>
          <TabsTrigger value="notes"><StickyNote className="h-4 w-4 mr-1" /> Notes</TabsTrigger>
          <TabsTrigger value="files"><FileText className="h-4 w-4 mr-1" /> Files</TabsTrigger>
          <TabsTrigger value="funding-lens"><TrendingUp className="h-4 w-4 mr-1" /> Funding Readiness</TabsTrigger>
          <TabsTrigger value="approvals">
            <ClipboardCheck className="h-4 w-4 mr-1" /> Approvals
            {contactApprovals.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px] bg-accent text-accent-foreground">
                {contactApprovals.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deals">

          <Card><CardContent className="p-4">
            <ContactDealsSection contactId={client.id} />
          </CardContent></Card>
        </TabsContent>


        <TabsContent value="activity">
          <Card><CardContent className="p-4">
            {!client.linked_user_id ? (
              <EmptyMsg msg="No activity yet — this contact hasn't created an account." />
            ) : activity.length === 0 && tasks.length === 0 ? (
              <EmptyMsg msg="No recent activity logged." />
            ) : (
              <div className="space-y-3">
                {[...activity.map(a => ({ ...a, _kind: "comm" as const })), ...tasks.map(t => ({ ...t, _kind: "task" as const }))]
                  .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
                  .slice(0, 30)
                  .map((row: any) => (
                    <div key={`${row._kind}-${row.id}`} className="flex gap-3 text-sm border-l-2 border-primary/40 pl-3 py-1">
                      <span className="text-xs text-muted-foreground w-28 shrink-0">
                        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium">
                          {row._kind === "comm" ? `${row.channel || "msg"}: ${row.subject || row.message_type || "Activity"}` : `Task: ${row.title}`}
                        </div>
                        {row._kind === "comm" && row.preview && <div className="text-muted-foreground truncate">{row.preview}</div>}
                        {row._kind === "task" && row.description && <div className="text-muted-foreground truncate">{row.description}</div>}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="comms">
          <Card><CardContent className="p-4">
            {activity.length === 0 ? <EmptyMsg msg="No communications logged." /> : (
              <div className="space-y-2">
                {activity.map((m: any) => (
                  <div key={m.id} className="border border-border rounded p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium capitalize">{m.channel} · {m.message_type}</span>
                      <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</span>
                    </div>
                    {m.subject && <div className="text-muted-foreground">{m.subject}</div>}
                    {m.preview && <div className="text-muted-foreground/80 mt-1">{m.preview}</div>}
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card><CardContent className="p-4">
            {tasks.length === 0 ? <EmptyMsg msg="No tasks for this contact." /> : (
              <div className="space-y-2">
                {tasks.map((t: any) => (
                  <div key={t.id} className="flex items-start justify-between text-sm border border-border rounded p-3">
                    <div>
                      <div className="font-medium">{t.title}</div>
                      {t.description && <div className="text-muted-foreground">{t.description}</div>}
                    </div>
                    <Badge variant="outline" className="capitalize shrink-0 ml-2">{t.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card><CardContent className="p-4">
            {notes.length === 0 ? <EmptyMsg msg="No saved memory yet — Paige will write here as she learns." /> : (
              <div className="space-y-2">
                {notes.map((n: any) => (
                  <div key={n.id} className="text-sm border border-border rounded p-3">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{n.memory_type}</div>
                    <div>{n.content}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="files">
          <Card><CardContent className="p-4">
            {files.length === 0 ? <EmptyMsg msg="No documents uploaded." /> : (
              <div className="space-y-2">
                {files.map((f: any) => (
                  <div key={f.id} className="flex items-center justify-between text-sm border border-border rounded p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{f.file_name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">{f.document_type || "file"}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="funding-lens"><FundingReadinessLens contactId={client.id} mode="admin" /></TabsContent>

        <TabsContent value="approvals">
          <Card><CardContent className="p-4">
            {contactApprovals.length === 0 ? (
              <EmptyMsg msg="No pending approvals for this contact." />
            ) : (
              <div className="space-y-2">
                {contactApprovals.map((a: any) => {
                  const cat = (a.category ?? a.type ?? "other") as ApprovalCategory;
                  return (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/admin/approvals/${a.id}`)}
                      className="w-full text-left border border-border rounded p-3 hover:bg-muted/40 transition"
                    >
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="secondary" className="text-[10px]">{CATEGORY_LABEL[cat] ?? cat}</Badge>
                        {a.risk_level && (
                          <Badge variant="outline" className={`text-[10px] ${RISK_COLOR[a.risk_level] ?? ""}`}>
                            {a.risk_level}
                          </Badge>
                        )}
                        {a.priority && <Badge variant="outline" className="text-[10px]">P{a.priority}</Badge>}
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="text-sm font-medium line-clamp-1">
                        {a.summary || a.draft_content?.subject || "Pending approval"}
                      </div>
                      {a.sla_due_at && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          SLA {formatDistanceToNow(new Date(a.sla_due_at), { addSuffix: true })}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <EditContactDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        contact={client as any}
        coaches={coaches}
        onSaved={(updated) => {
          setClient((prev) => prev ? { ...prev, ...(updated as any) } : prev);
          setEditOpen(false);
        }}
      />
    </div>
  );
}

function EmptyMsg({ msg }: { msg: string }) {
  return <div className="text-sm text-muted-foreground text-center py-6">{msg}</div>;
}
