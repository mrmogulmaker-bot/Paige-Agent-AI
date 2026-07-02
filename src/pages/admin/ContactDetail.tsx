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
  CreditCard, User, Landmark, TrendingUp, Send, Pencil, ClipboardCheck, Trash2, Zap, Wallet,
} from "lucide-react";
import { ContactAutomationHistory } from "@/components/admin/contacts/ContactAutomationHistory";
import { ContactBillingPanel } from "@/components/admin/contacts/ContactBillingPanel";

import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { LIFECYCLE_STAGES, lifecycleMeta, deleteContact } from "@/lib/contacts";
import { ContactDealsSection } from "@/components/admin/contacts/ContactDealsSection";
import { FundingReadinessLens } from "@/components/funding-lens/FundingReadinessLens";
import { EditContactDialog } from "@/components/admin/contacts/EditContactDialog";
import { QuickLogMenu } from "@/components/admin/contacts/QuickLogMenu";
import { DuplicatesBanner } from "@/components/admin/contacts/DuplicatesBanner";
import { ContactCampaignAttribution } from "@/components/admin/contacts/ContactCampaignAttribution";
import { BusinessVerificationCard } from "@/components/admin/contacts/BusinessVerificationCard";
import { BusinessTabPanel } from "@/components/admin/contacts/BusinessTabPanel";
import { ClientOrgChartPanel } from "@/components/admin/contacts/ClientOrgChartPanel";
import { ContactCommsPanel } from "@/components/admin/contacts/ContactCommsPanel";
import { ContactNotesPanel } from "@/components/admin/contacts/ContactNotesPanel";
import { ContactFilesPanel } from "@/components/admin/contacts/ContactFilesPanel";
import { ContactTasksPanel } from "@/components/admin/contacts/ContactTasksPanel";
import { ContactPortalPanel } from "@/components/admin/contacts/ContactPortalPanel";
import { ClientOnboardingStatusPanel } from "@/components/admin/contacts/ClientOnboardingStatusPanel";
import { ImpersonateClientButton } from "@/components/admin/ImpersonateClientButton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useTenantFeature } from "@/hooks/useTenantFeature";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";
import { useUserRoles } from "@/hooks/useUserRoles";
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
  account_number?: string | null;
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
  const [businesses, setBusinesses] = useState<Array<{ id: string; legal_name: string | null; dba: string | null; entity_type: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { items: contactApprovals } = usePendingApprovals({ contactId: id });
  const { isAdmin } = useUserRoles();


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
        const [actRes, taskRes, noteRes, fileRes, bizRes] = await Promise.all([
          supabase.from("communication_log").select("*").eq("user_id", c.linked_user_id).order("created_at", { ascending: false }).limit(50),
          supabase.from("tasks").select("*").eq("user_id", c.linked_user_id).order("created_at", { ascending: false }).limit(50),
          supabase.from("client_memory").select("*").eq("client_user_id", c.linked_user_id).eq("is_active", true).order("created_at", { ascending: false }).limit(50),
          supabase.from("documents").select("*").eq("user_id", c.linked_user_id).order("uploaded_at", { ascending: false }).limit(50),
          supabase.from("businesses").select("id, legal_name, dba, entity_type").eq("owner_user_id", c.linked_user_id).order("created_at", { ascending: false }),
        ]);
        setActivity(actRes.data || []);
        setTasks(taskRes.data || []);
        setNotes(noteRes.data || []);
        setFiles(fileRes.data || []);
        setBusinesses((bizRes.data as any) || []);
      } else {
        const [noteRes, fileRes] = await Promise.all([
          supabase.from("client_memory").select("*").eq("client_id", clientId).eq("is_active", true).order("created_at", { ascending: false }).limit(50),
          supabase.from("documents").select("*").eq("client_id", clientId).order("uploaded_at", { ascending: false }).limit(50),
        ]);
        setNotes(noteRes.data || []);
        setFiles(fileRes.data || []);
        setBusinesses([]);
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
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-muted-foreground">{client.entity_name || "No business on file"}</p>
            {client.account_number && (
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(client.account_number!); }}
                title="Click to copy account number"
                className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground transition"
              >
                #{client.account_number}
              </button>
            )}
          </div>
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
        {btfEnabled && isAdmin && (
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

        <ImpersonateClientButton contactId={client.id} linkedUserId={client.linked_user_id} />
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
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        )}
      </div>

      <DuplicatesBanner contactId={client.id} email={client.email} phone={client.phone} />
      <ContactCampaignAttribution contactId={client.id} />




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
            <Select value={client.lifecycle_stage || "new_lead"} onValueChange={updateLifecycle}>
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
          <TabsTrigger value="business"><Building2 className="h-4 w-4 mr-1" /> Business</TabsTrigger>
          <TabsTrigger value="funding-lens"><TrendingUp className="h-4 w-4 mr-1" /> Funding Readiness</TabsTrigger>
          <TabsTrigger value="portal"><User className="h-4 w-4 mr-1" /> Portal & Agreements</TabsTrigger>
          <TabsTrigger value="approvals">
            <ClipboardCheck className="h-4 w-4 mr-1" /> Approvals
            {contactApprovals.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px] bg-accent text-accent-foreground">
                {contactApprovals.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="automation"><Zap className="h-4 w-4 mr-1" /> Automation</TabsTrigger>
        </TabsList>

        <TabsContent value="automation">
          <ContactAutomationHistory contactId={client.id} />
        </TabsContent>



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
          <ContactCommsPanel
            contact={{
              id: client.id,
              first_name: client.first_name,
              last_name: client.last_name,
              email: client.email,
              phone: client.phone,
              linked_user_id: client.linked_user_id,
              entity_name: client.entity_name,
            }}
            history={activity}
          />
        </TabsContent>

        <TabsContent value="tasks">
          <ContactTasksPanel contactId={client.id} linkedUserId={client.linked_user_id} />
        </TabsContent>

        <TabsContent value="notes">
          <ContactNotesPanel contactId={client.id} tenantId={(client as any).tenant_id ?? null} />
        </TabsContent>

        <TabsContent value="files">
          <ContactFilesPanel contactId={client.id} tenantId={(client as any).tenant_id ?? null} />
        </TabsContent>

        <TabsContent value="business">
          {!client.linked_user_id ? (
            <Card><CardContent className="p-4"><EmptyMsg msg="Link this contact to a user account to manage businesses + run verifications." /></CardContent></Card>
          ) : (
            <div className="space-y-4">
              <ClientOrgChartPanel linkedUserId={client.linked_user_id} />
              <BusinessTabPanel linkedUserId={client.linked_user_id} businesses={businesses} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="funding-lens"><FundingReadinessLens contactId={client.id} mode="admin" /></TabsContent>

        <TabsContent value="portal">
          <div className="space-y-4">
            <ClientOnboardingStatusPanel contactId={client.id} />
            <ContactPortalPanel
              contactId={client.id}
              email={client.email}
              linkedUserId={client.linked_user_id}
            />
          </div>
        </TabsContent>


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

      <AlertDialog open={deleteOpen} onOpenChange={(v) => !deleting && setDeleteOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {fullName || "this contact"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the contact along with their CRM history — deals,
              activities, notes, documents, and coach assignments. Any linked portal user
              account is left intact. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault();
                if (!client) return;
                setDeleting(true);
                try {
                  await deleteContact(client.id);
                  toast.success("Contact deleted");
                  navigate("/admin/contacts");
                } catch (err: any) {
                  toast.error(err?.message || "Delete failed");
                  setDeleting(false);
                }
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete contact"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyMsg({ msg }: { msg: string }) {
  return <div className="text-sm text-muted-foreground text-center py-6">{msg}</div>;
}
