import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Target, Calendar, DollarSign, TrendingUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface ClientGoalsCardProps {
  clientUserId: string;
  canEdit?: boolean; // coaches/admins can update status + notes
}

interface ProfileGoalData {
  intake_completed: boolean | null;
  intake_completed_at: string | null;
  primary_goal: string | null;
  primary_goal_category: string | null;
  goal_timeline: string | null;
  goal_amount: number | null;
  experience_level: string | null;
  financing_preference: string | null;
  biggest_obstacle: string | null;
}

interface ClientGoal {
  id: string;
  goal_category: string;
  goal_description: string | null;
  target_amount: number | null;
  target_date: string | null;
  status: string;
  progress_notes: string | null;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  real_estate_investment: "Real Estate Investment",
  primary_home_purchase: "Primary Home Purchase",
  business_funding: "Business Funding",
  credit_building: "Credit Building",
  business_credit: "Business Credit",
  debt_elimination: "Debt Elimination",
  wealth_building: "Wealth Building",
  other: "Other",
};

const TIMELINE_LABELS: Record<string, string> = {
  immediate: "Immediate (0-3 months)",
  short_term: "Short term (3-6 months)",
  medium_term: "Medium term (6-12 months)",
  long_term: "Long term (12+ months)",
};

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: "Beginner",
  some_experience: "Some experience",
  experienced: "Experienced",
};

export function ClientGoalsCard({ clientUserId, canEdit = true }: ClientGoalsCardProps) {
  const [profile, setProfile] = useState<ProfileGoalData | null>(null);
  const [goals, setGoals] = useState<ClientGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [p, g] = await Promise.all([
        supabase
          .from("profiles")
          .select("intake_completed, intake_completed_at, primary_goal, primary_goal_category, goal_timeline, goal_amount, experience_level, financing_preference, biggest_obstacle")
          .eq("user_id", clientUserId)
          .maybeSingle(),
        supabase
          .from("client_goals" as any)
          .select("*")
          .eq("user_id", clientUserId)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setProfile((p.data as ProfileGoalData) ?? null);
      setGoals(((g.data as any[]) ?? []) as ClientGoal[]);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [clientUserId]);

  const updateGoalStatus = async (goalId: string, status: string) => {
    const { error } = await supabase
      .from("client_goals" as any)
      .update({ status } as any)
      .eq("id", goalId);
    if (error) {
      toast.error("Failed to update status");
      return;
    }
    toast.success("Goal status updated");
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, status } : g)));
  };

  const saveNote = async (goalId: string) => {
    const { error } = await supabase
      .from("client_goals" as any)
      .update({ progress_notes: noteDraft } as any)
      .eq("id", goalId);
    if (error) {
      toast.error("Failed to save note");
      return;
    }
    toast.success("Note saved");
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, progress_notes: noteDraft } : g)));
    setEditingNoteId(null);
    setNoteDraft("");
  };

  if (loading) return null;

  const intakeDone = !!profile?.intake_completed;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="w-5 h-5" /> Goals & Discovery
          {!intakeDone && (
            <Badge variant="outline" className="ml-2 text-xs">
              <AlertCircle className="w-3 h-3 mr-1" /> Intake not completed
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!intakeDone && !profile?.primary_goal && (
          <p className="text-sm text-muted-foreground">
            This client has not completed Paige's goal discovery intake yet. Paige will run the intake protocol on their next chat session.
          </p>
        )}

        {(intakeDone || profile?.primary_goal) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Primary Goal" value={profile?.primary_goal || "—"} />
            <Field
              label="Category"
              value={profile?.primary_goal_category ? CATEGORY_LABELS[profile.primary_goal_category] || profile.primary_goal_category : "—"}
            />
            <Field
              label="Timeline"
              value={profile?.goal_timeline ? TIMELINE_LABELS[profile.goal_timeline] || profile.goal_timeline : "—"}
              icon={Calendar}
            />
            <Field
              label="Target Amount"
              value={profile?.goal_amount ? `$${profile.goal_amount.toLocaleString()}` : "—"}
              icon={DollarSign}
            />
            <Field
              label="Experience Level"
              value={profile?.experience_level ? EXPERIENCE_LABELS[profile.experience_level] || profile.experience_level : "—"}
              icon={TrendingUp}
            />
            <Field
              label="Financing Preference"
              value={profile?.financing_preference ? profile.financing_preference.toUpperCase() : "—"}
            />
            <div className="md:col-span-2">
              <Field label="Biggest Obstacle" value={profile?.biggest_obstacle || "—"} />
            </div>
            {profile?.intake_completed_at && (
              <div className="md:col-span-2 text-xs text-muted-foreground">
                Intake completed: {new Date(profile.intake_completed_at).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {goals.length > 0 && (
          <div className="pt-4 border-t border-border space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Goal Records ({goals.length})</h4>
            {goals.map((g) => (
              <div key={g.id} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {CATEGORY_LABELS[g.goal_category] || g.goal_category}
                    </div>
                    {g.goal_description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{g.goal_description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-1.5 text-[11px] text-muted-foreground">
                      {g.target_amount && <span>${g.target_amount.toLocaleString()}</span>}
                      {g.target_date && <span>by {new Date(g.target_date).toLocaleDateString()}</span>}
                      <span>created {new Date(g.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {canEdit ? (
                    <Select value={g.status} onValueChange={(v) => updateGoalStatus(g.id, v)}>
                      <SelectTrigger className="w-[120px] h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="achieved">Achieved</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="abandoned">Abandoned</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={g.status === "active" ? "default" : g.status === "achieved" ? "secondary" : "outline"}>
                      {g.status}
                    </Badge>
                  )}
                </div>

                {canEdit && (
                  <div>
                    {editingNoteId === g.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="Coach notes about progress…"
                          className="text-xs min-h-[60px]"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-xs" onClick={() => saveNote(g.id)}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingNoteId(null); setNoteDraft(""); }}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground text-left w-full"
                        onClick={() => { setEditingNoteId(g.id); setNoteDraft(g.progress_notes || ""); }}
                      >
                        {g.progress_notes ? `📝 ${g.progress_notes}` : "+ Add coach note"}
                      </button>
                    )}
                  </div>
                )}
                {!canEdit && g.progress_notes && (
                  <p className="text-xs text-muted-foreground">📝 {g.progress_notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value, icon: Icon }: { label: string; value: string; icon?: any }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
