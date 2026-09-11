import { useCallback, useEffect, useState } from "react";
import { Building2, Mail } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Card, ReadState, Outcome, type WriteState } from "./settings-primitives";

/**
 * Email preferences — the landed destination of the retired notifications page
 * (#1090). The retirement banner promised "notifications now appear in the area
 * where the work happens"; this section under People & Email is that place for
 * what Paige sends the OWNER by email.
 *
 * Two contracts the legacy surface missed:
 *  - UPSERT, not update: the old component only UPDATEd, so a first-time user's
 *    toggle appeared to save and did nothing (no row existed). Toggles upsert.
 *  - Coaching-generic only (§2): no credit/funding rows on this surface. The
 *    funding-specific preferences belong to the funding preset's own surfaces.
 *
 * States: loading / load-error (retry, never faked defaults) / populated /
 * saving (controls disabled) / save-error (inline outcome + reload to the true
 * values) / unsubscribed-all (controls disabled + an honest resubscribe path).
 */

type EmailPref = {
  email_enabled: boolean;
  email_weekly_summary: boolean;
  email_coaching_reminders: boolean;
  email_onboarding: boolean;
  unsubscribed_all: boolean;
};

const PREFS_DEFAULTS: EmailPref = {
  email_enabled: true,
  email_weekly_summary: true,
  email_coaching_reminders: true,
  email_onboarding: true,
  unsubscribed_all: false,
};

const PREF_ROWS: Array<{ key: keyof EmailPref; label: string; desc: string }> = [
  { key: "email_weekly_summary", label: "Weekly summary", desc: "Mondays — your week's progress and the next action" },
  { key: "email_coaching_reminders", label: "Session reminders", desc: "Ahead of upcoming booked sessions" },
  { key: "email_onboarding", label: "Getting-started emails", desc: "Welcome and setup guidance for the workspace" },
];

export function PeopleEmailPreferences() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<EmailPref | null>(null);
  const [saving, setSaving] = useState(false);
  const [write, setWrite] = useState<WriteState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadError("Not signed in.");
        return;
      }
      const { data, error } = await supabase
        .from("communication_preferences")
        .select("email_enabled, email_weekly_summary, email_coaching_reminders, email_onboarding, unsubscribed_all")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      setPrefs(data ? { ...PREFS_DEFAULTS, ...(data as EmailPref) } : { ...PREFS_DEFAULTS });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load your email preferences.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setPref = useCallback(async (key: keyof EmailPref, value: boolean) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next); // optimistic
    setSaving(true);
    setWrite(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      // UPSERT — the fix this surface owed: a first toggle creates the row.
      // Computed keys produce an index signature, which the generated Insert type
      // rejects; assert the concrete row shape (every field exists on the table).
      const row = { user_id: user.id, [key]: value } as { user_id: string } & Partial<EmailPref>;
      const { error } = await supabase
        .from("communication_preferences")
        .upsert(row, { onConflict: "user_id" });
      if (error) throw error;
      setWrite({ tone: "ok", message: "Saved." });
    } catch (e) {
      setWrite({ tone: "bad", message: e instanceof Error ? e.message : "Could not save — showing your saved settings." });
      void load(); // revert to the truth, never leave a false toggle
    } finally {
      setSaving(false);
    }
  }, [prefs, load]);

  if (loading || loadError || !prefs) {
    return (
      <Card title="Email from Paige" icon={Mail}>
        <ReadState loading={loading} error={loadError} retry={() => void load()}>
          <span />
        </ReadState>
      </Card>
    );
  }

  const locked = !prefs.email_enabled || prefs.unsubscribed_all || saving;

  return (
    <Card title="Email from Paige" icon={Building2}>
      <div className="space-y-4">
        {prefs.unsubscribed_all ? (
          <p className="ss-note" role="status">
            All email is currently off (unsubscribed). Turn it back on to choose what Paige sends you.
          </p>
        ) : null}

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="pref-email-enabled">Email from Paige</Label>
            <p className="text-xs text-muted-foreground">The master switch for everything below</p>
          </div>
          <Switch
            id="pref-email-enabled"
            checked={prefs.email_enabled && !prefs.unsubscribed_all}
            disabled={saving}
            onCheckedChange={(v) => void setPref("unsubscribed_all", !v)}
          />
        </div>

        <div className="space-y-4 pl-1">
          {PREF_ROWS.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <Label htmlFor={`pref-${key}`}>{label}</Label>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch
                id={`pref-${key}`}
                checked={prefs[key] && prefs.email_enabled && !prefs.unsubscribed_all}
                disabled={locked}
                onCheckedChange={(v) => void setPref(key, v)}
              />
            </div>
          ))}
        </div>

        <Outcome state={write} />
        {write?.tone === "bad" ? (
          <button type="button" className="ss-note underline" onClick={() => void load()}>
            Reload your saved settings
          </button>
        ) : null}
      </div>
    </Card>
  );
}
