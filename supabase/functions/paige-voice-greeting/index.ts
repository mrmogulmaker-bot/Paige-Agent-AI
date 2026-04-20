// Builds a dynamic, context-aware opening line for an ElevenLabs voice session.
// Used by the chat UI to set ElevenLabs `overrides.agent.firstMessage` so Paige
// speaks naturally the moment the WebRTC connection opens.
//
// Inputs:
//   - currentPage: human-readable page name (e.g. "Credit Intelligence")
//   - recentChatMessages?: last few text messages from the on-screen chat session
//     (so voice picks up where text left off)
//
// Output: { greeting: string, lastTopic?: string, predictionsCount: number, isReturning: boolean }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatMsg { role: "user" | "assistant"; content: string }

function firstNameFrom(full: string | null | undefined): string {
  if (!full) return "there";
  return full.trim().split(/\s+/)[0] || "there";
}

/** Pull a short topic phrase from the most recent user/assistant exchange. */
function topicFromMessages(msgs: ChatMsg[]): string | undefined {
  if (!msgs || msgs.length === 0) return undefined;
  // Prefer the last user message — that's what the client was actually asking about.
  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  const src = lastUser?.content || msgs[msgs.length - 1]?.content || "";
  if (!src) return undefined;
  // Trim to the first sentence / clause, cap length.
  const cleaned = src.replace(/\s+/g, " ").trim();
  const firstSentence = cleaned.split(/[.!?\n]/)[0] || cleaned;
  if (firstSentence.length <= 80) return firstSentence;
  return firstSentence.slice(0, 77).trimEnd() + "…";
}

function pageGreeting(_page: string, name: string, _predictionsCount: number, _lastTopic: string | undefined, _isReturning: boolean, _primaryGoal: string | null): string {
  // Keep the opener short so Paige doesn't burn the speaking window before the user replies.
  return `Hi ${name}!`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") || "";

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const currentPage: string = body.currentPage || "Dashboard";
    const recentChatMessages: ChatMsg[] = Array.isArray(body.recentChatMessages) ? body.recentChatMessages : [];

    // --- Pull profile + intake + predictions in parallel ---
    const [profileRes, predictionsRes, lastChatRes] = await Promise.all([
      supabase.from("profiles")
        .select("full_name, primary_goal, intake_completed_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("credit_predictions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_dismissed", false)
        .eq("is_acted_on", false),
      // Most recent chat message in any session for this user — used to detect "returning" state
      supabase.from("chat_messages")
        .select("content, role, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const profile = profileRes.data;
    const predictionsCount = predictionsRes.count ?? 0;
    const name = firstNameFrom(profile?.full_name || (user.user_metadata as any)?.full_name || null);
    const intakeCompleted = !!(profile as any)?.intake_completed_at;
    const primaryGoal = (profile as any)?.primary_goal || null;

    // Topic detection priority: in-flight chat session messages > most recent persisted message
    let lastTopic = topicFromMessages(recentChatMessages);
    if (!lastTopic && lastChatRes.data?.content && lastChatRes.data.role === "user") {
      lastTopic = topicFromMessages([{ role: "user", content: lastChatRes.data.content }]);
    }

    const isReturning = intakeCompleted || !!lastChatRes.data;
    const greeting = pageGreeting(currentPage, name, predictionsCount, lastTopic, isReturning, primaryGoal);

    return new Response(
      JSON.stringify({ greeting, lastTopic, predictionsCount, isReturning, name }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("paige-voice-greeting error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
