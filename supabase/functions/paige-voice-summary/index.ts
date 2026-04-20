// Generate a session summary + extract user preferences from a finished voice chat,
// then persist them to client_memory (with embeddings) so future text & voice sessions can recall them.
//
// Triggered by:
//   - PaigeChat.tsx onDisconnect (ElevenLabs)
//   - paige-voice-chat WebSocket onclose hook (OpenAI Realtime)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { extractFromTranscript, type ProfileSnapshot } from "../_shared/conversational-extract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VoiceMessage {
  role: "user" | "assistant";
  content: string;
}

const PREFERENCE_EXTRACTION_PROMPT = `You are analyzing a conversation between a client and Paige (an AI credit/funding strategist) to extract the client's communication preferences. Look for explicit statements ("be brief", "don't lecture me", "I prefer bullet points") AND implicit signals (consistently short replies, frustration with detail, requests for specific formats).

Return ONLY a JSON array. Each entry must be a single concise sentence describing one preference, suitable for inclusion in a system prompt. If there are no clear preferences, return [].

Examples of valid output items:
- "Prefers brief, conversational responses without bullet lists."
- "Wants Paige to skip greetings and get straight to the point."
- "Likes specific dollar amounts and account names rather than generalities."
- "Has asked Paige not to mention dispute services."

CONVERSATION:
{{TRANSCRIPT}}

JSON:`;

const SUMMARY_PROMPT = `Summarize the following voice conversation between a client and Paige (AI credit/funding strategist) in 3-5 plain-language sentences. Be specific about names, scores, decisions made, and follow-up actions identified. Note that this was a VOICE conversation. Do not use bullet points.

CONVERSATION:
{{TRANSCRIPT}}

SUMMARY:`;

const COACHING_INSIGHT_PROMPT = `You are reviewing a conversation between a client and Paige (AI credit/funding strategist) to find ONE genuinely novel coaching insight worth saving to a shared knowledge base.

Save an insight ONLY if BOTH conditions are met:
1. Paige explained a SPECIFIC strategy, framework, connection between concepts, or non-obvious tactical approach (not generic advice).
2. The client responded positively in a way that signals the insight landed — phrases like: "I didn't know that", "that makes sense", "that's helpful", "great idea", "I'll try that", "got it", "ohhh okay", an enthusiastic follow-up question, or any clear signal of engagement.

If both are met, return JSON: { "title": "<6-12 word title>", "content": "<3-6 sentence anonymized insight written as a reusable strategy — no client names, no business names, no specific dollar amounts unless they're industry rules of thumb>" }

If either condition is missing (no novel insight, or no positive client signal), return: { "title": null, "content": null }

CONVERSATION:
{{TRANSCRIPT}}

JSON:`;

async function callAI(prompt: string, lovableApiKey: string, model = "google/gemini-2.5-flash-lite") {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI gateway error ${resp.status}: ${t}`);
  }
  const json = await resp.json();
  return (json.choices?.[0]?.message?.content || "").trim();
}

async function embed(text: string, openaiKey: string): Promise<number[] | null> {
  try {
    const trimmed = text.length > 8000 ? text.slice(0, 8000) : text;
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: trimmed }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.error("embed error:", err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const body = await req.json();
    const messages: VoiceMessage[] = Array.isArray(body.messages) ? body.messages : [];
    const sessionId: string | undefined = body.sessionId;
    const clientId: string | undefined = body.clientId;
    const channel: string = body.channel || "voice";

    if (messages.length < 2) {
      return new Response(JSON.stringify({ skipped: true, reason: "Not enough messages" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcript = messages
      .slice(-30)
      .map((m) => `${m.role === "user" ? "Client" : "Paige"}: ${m.content}`)
      .join("\n");

    // Run summary + preference extraction + coaching-insight extraction in parallel
    const [summary, preferencesRaw, coachingInsightRaw] = await Promise.all([
      callAI(SUMMARY_PROMPT.replace("{{TRANSCRIPT}}", transcript), lovableApiKey),
      callAI(PREFERENCE_EXTRACTION_PROMPT.replace("{{TRANSCRIPT}}", transcript), lovableApiKey),
      callAI(COACHING_INSIGHT_PROMPT.replace("{{TRANSCRIPT}}", transcript), lovableApiKey).catch((e) => {
        console.warn("coaching insight extraction failed:", e);
        return "";
      }),
    ]);

    // Use service role for inserts so RLS doesn't block writes when client_id differs from auth.uid()
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const inserts: any[] = [];

    if (summary) {
      const emb = openaiKey ? await embed(summary, openaiKey) : null;
      const row: any = {
        client_user_id: clientId || user.id,
        memory_type: "session_summary",
        content: summary,
        source_session_id: sessionId || null,
        embedding: emb,
        metadata: { channel },
      };
      if (clientId) row.client_id = clientId;
      inserts.push(row);
    }

    let preferences: string[] = [];
    try {
      const cleaned = preferencesRaw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      preferences = JSON.parse(cleaned);
      if (!Array.isArray(preferences)) preferences = [];
    } catch (err) {
      console.error("Could not parse preferences JSON:", preferencesRaw);
    }

    for (const pref of preferences) {
      if (typeof pref !== "string" || !pref.trim()) continue;
      const emb = openaiKey ? await embed(pref, openaiKey) : null;
      const row: any = {
        client_user_id: clientId || user.id,
        memory_type: "user_preference",
        content: pref.trim(),
        source_session_id: sessionId || null,
        embedding: emb,
        metadata: { channel, source: "auto_extracted" },
      };
      if (clientId) row.client_id = clientId;
      inserts.push(row);
    }

    if (inserts.length > 0) {
      const { error: insertErr } = await admin.from("client_memory").insert(inserts);
      if (insertErr) {
        console.error("client_memory insert error:", insertErr);
        return new Response(JSON.stringify({ error: "Failed to persist memory", detail: insertErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Run conversational extraction over the transcript so the chat UI can
    // surface a confirmation card after the call ends.
    let extractionProposal: any = null;
    try {
      const [{ data: profile }, { data: businesses }] = await Promise.all([
        admin.from("profiles").select("full_name, phone").eq("user_id", user.id).maybeSingle(),
        admin.from("businesses").select("legal_name, dba, ein, formation_date, state_of_formation, business_street_address, website, business_email, naics, entity_type").eq("owner_user_id", user.id).order("created_at", { ascending: true }).limit(1),
      ]);
      const snapshot: ProfileSnapshot = {
        full_name: profile?.full_name ?? null,
        phone: (profile as any)?.phone ?? null,
        business: businesses?.[0] ? {
          legal_name: businesses[0].legal_name, dba: businesses[0].dba, ein: businesses[0].ein,
          formation_date: businesses[0].formation_date, state_of_formation: businesses[0].state_of_formation,
          business_street_address: businesses[0].business_street_address, website: businesses[0].website,
          business_email: businesses[0].business_email, naics: businesses[0].naics, entity_type: businesses[0].entity_type,
        } : null,
      };
      extractionProposal = extractFromTranscript(messages, snapshot);
    } catch (err) {
      console.warn("Voice transcript extraction failed:", err);
    }

    return new Response(JSON.stringify({
      summary,
      preferences,
      memoriesWritten: inserts.length,
      extractionProposal,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("paige-voice-summary error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
