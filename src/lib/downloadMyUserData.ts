import { supabase } from "@/integrations/supabase/client";

/**
 * downloadMyUserData — the ONE user-scoped personal-data export. Extracted
 * from the client-portal DataPrivacyPanel (PR-C) so the Solo Security & Data
 * surface consumes the same implementation instead of forking it.
 *
 * Scope is exact and must stay honestly labeled wherever this is offered:
 * it exports the personal records tied to the caller's LOGIN (profile, build
 * scores/progress, owned businesses, recent chat messages, banking
 * relationships) via user_id-keyed RLS reads. It is NOT a workspace export —
 * business records (clients, deals, missions) are tenant data and are not
 * included.
 */
export async function downloadMyUserData(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // Fetch all user-owned data in parallel
  const [profile, scores, fundability, businesses, sessions, financialProfile] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("build_scores").select("*").eq("user_id", user.id),
    supabase.from("build_progress").select("*").eq("user_id", user.id),
    supabase.from("businesses").select("*").eq("owner_user_id", user.id),
    supabase.from("chat_messages").select("*").eq("user_id", user.id).limit(500),
    supabase.from("banking_relationships").select("*").eq("user_id", user.id),
  ]);

  const exportPayload = {
    exported_at: new Date().toISOString(),
    user_id: user.id,
    email: user.email,
    profile: profile.data ?? null,
    build_scores: scores.data ?? [],
    build_progress: fundability.data ?? [],
    businesses: businesses.data ?? [],
    banking_relationships: financialProfile.data ?? [],
    recent_chat_messages: sessions.data ?? [],
  };

  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paigeagent-data-export-${user.id.slice(0, 8)}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
