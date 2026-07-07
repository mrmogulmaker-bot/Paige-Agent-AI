// broker-paige-chat — private peer-advisor Paige session for brokers.
// Streams (SSE) replies via Lovable AI Gateway, persists messages to
// broker_session_messages, and (on demand) generates a summary that the
// broker can share with the client.
//
// IMPORTANT: this is a separate function from paige-ai-chat. Brokers talk to
// Paige in BROKER MODE (peer-to-peer professional tone). Clients NEVER see
// these messages unless the broker explicitly shares a summary.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { gatewayCompat } from "../_shared/claude.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = "unused" ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CHAT_MODEL = "google/gemini-2.5-flash";
const SUMMARY_MODEL = "google/gemini-2.5-flash";

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

interface BrokerProfileRow {
  id: string;
  user_id: string;
  business_name: string;
  broker_type: string;
  preferred_greeting: string | null;
  specializations: string[] | null;
  typical_client_profile: string | null;
  firm_description: string | null;
  paige_context_notes: string | null;
}

interface RelationshipRow {
  id: string;
  broker_id: string;
  client_user_id: string | null;
  client_first_name: string;
  client_last_name: string;
  client_email: string;
  client_goal: string | null;
  broker_notes: string | null;
  relationship_stage: string | null;
  shared_goal: string | null;
  last_session_summary: string | null;
  session_count: number;
}

function greetingName(profile: BrokerProfileRow, fullName: string): string {
  const parts = (fullName || profile.business_name || "Broker").trim().split(/\s+/);
  const first = parts[0] || "Broker";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  switch (profile.preferred_greeting) {
    case "full_name":
      return fullName || first;
    case "title_last_name":
      return last ? `Mr/Ms ${last}` : first;
    case "first_name":
    default:
      return first;
  }
}

function buildSystemPrompt(opts: {
  broker: BrokerProfileRow;
  brokerFullName: string;
  rel: RelationshipRow;
  clientCreditContext: string;
  teamContext: string | null;
}): string {
  const { broker, brokerFullName, rel, clientCreditContext, teamContext } = opts;
  const greet = greetingName(broker, brokerFullName);
  const specs = (broker.specializations || []).join(", ") || "general advisory";
  const customNotes = broker.paige_context_notes
    ? `\nFirm-specific instructions: ${broker.paige_context_notes}`
    : "";
  const team = teamContext ? `\n\nTEAM CONTEXT: ${teamContext}` : "";

  return `BROKER CONTEXT
You are currently in a private strategic session with ${greet} from ${broker.business_name}.
${broker.business_name} ${broker.firm_description ? `specializes in ${broker.firm_description}.` : "is a financial services firm."}
This broker works primarily with ${broker.typical_client_profile || "individual and small-business clients"}.
Their areas of focus are: ${specs}.${customNotes}${team}

Address this broker as "${greet}". You are speaking with a financial professional — not a client.
Adjust accordingly: be technical, use industry terminology freely, skip basic educational
explanations, provide comprehensive analysis rather than simplified summaries, and discuss
specific numbers and strategies directly.

CLIENT PROFILE for this session
Name: ${rel.client_first_name}
Funding Goal: ${rel.client_goal || "not specified"}
Relationship Stage: ${rel.relationship_stage || "new"}
Shared Goal: ${rel.shared_goal || "not yet defined"}
Sessions Together: ${rel.session_count}
${rel.broker_notes ? `Broker Private Notes: ${rel.broker_notes}\n` : ""}
${clientCreditContext}

BROKER MODE RULES
1. Speak to the broker as a peer advisor and financial professional.
2. Provide complete strategic analysis — do not simplify or hold back technical detail.
3. Reference the client by first name only when discussing them.
4. Cover credit strategy, funding options, legal considerations, entity structure, and any
   other advisory topic the broker raises.
5. When the broker asks what to recommend, give the full advisor playbook — what to tell
   the client, in what order, and why.
6. This conversation is private. The client never sees it unless the broker shares a summary.
7. At the end of each substantive response, briefly offer to generate a client-ready
   summary the broker can share.
8. Flag any legal or liability concerns clearly (FCRA / FDCPA / state lending rules).
9. Reference the broker's firm and specializations when relevant — make it feel personalized.`;
}

async function loadClientCreditContext(
  admin: ReturnType<typeof createClient>,
  clientUserId: string | null,
): Promise<string> {
  if (!clientUserId) {
    return "Current Credit Profile: client has not yet linked a PaigeAgent account — no live credit data available.";
  }
  try {
    const [{ data: pi }, { data: negs }, { data: alerts }] = await Promise.all([
      admin
        .from("credit_report_personal_info")
        .select("equifax_score, experian_score, transunion_score, total_accounts, total_balance, available_credit")
        .eq("user_id", clientUserId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("credit_negative_items")
        .select("item_type, bureau")
        .eq("user_id", clientUserId)
        .limit(50),
      admin
        .from("credit_alerts")
        .select("alert_type, alert_title, severity")
        .eq("client_id", clientUserId)
        .eq("is_resolved", false)
        .limit(20),
    ]);

    const scoreLine = pi
      ? `Scores — EQ:${pi.equifax_score ?? "—"} EX:${pi.experian_score ?? "—"} TU:${pi.transunion_score ?? "—"}`
      : "Scores — no report on file yet";

    const negCount = negs?.length || 0;
    const negTypes = Array.from(new Set((negs || []).map((n: any) => n.item_type))).join(", ");
    const alertLine = alerts && alerts.length
      ? `Active Alerts (${alerts.length}): ${(alerts as any[]).map((a) => a.alert_title).slice(0, 5).join("; ")}`
      : "Active Alerts: none open";

    return `Current Credit Profile:
${scoreLine}
Accounts: ${pi?.total_accounts ?? "—"} | Total balance: $${pi?.total_balance ?? "—"} | Available credit: $${pi?.available_credit ?? "—"}
Negative items: ${negCount}${negTypes ? ` (${negTypes})` : ""}
${alertLine}`;
  } catch (e) {
    console.warn("[broker-paige] failed to load client credit:", (e as Error).message);
    return "Current Credit Profile: unavailable (data load error).";
  }
}

async function loadTeamContext(
  admin: ReturnType<typeof createClient>,
  brokerId: string,
  brokerName: string,
  businessName: string,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("broker_team_members")
      .select("first_name, last_name, role, status")
      .eq("broker_id", brokerId)
      .eq("status", "active");
    if (!data || data.length === 0) return null;
    const list = data
      .map((m: any) => `${m.first_name || ""} ${m.last_name || ""} (${m.role})`.trim())
      .filter(Boolean)
      .join(", ");
    return `${brokerName} leads a team at ${businessName} including ${list}. Sessions may be conducted by team members on behalf of ${brokerName}.`;
  } catch {
    return null;
  }
}

async function logEvent(
  admin: ReturnType<typeof createClient>,
  user_id: string | null,
  event_name: string,
  properties: Record<string, unknown>,
) {
  try {
    await admin.from("analytics_events").insert({
      user_id,
      event_name,
      event_category: "engagement",
      properties,
      page_path: "edge:broker-paige-chat",
    });
  } catch (e) {
    console.warn("[broker-paige] analytics insert failed", (e as Error).message);
  }
}

async function generateSummary(
  admin: ReturnType<typeof createClient>,
  sessionId: string,
  rel: RelationshipRow,
  history: ChatMsg[],
): Promise<{ summary: string; insights: string[] }> {
  const transcript = history
    .map((m) => `${m.role === "assistant" ? "Paige" : "Broker"}: ${m.content}`)
    .join("\n\n")
    .slice(0, 25000);

  const prompt = `You are summarizing a private broker↔Paige strategy session about a client named ${rel.client_first_name}.

Produce TWO sections.

SECTION 1 — KEY INSIGHTS (JSON array of 3–6 strings, no commentary):
The most important strategic takeaways from the session.

SECTION 2 — CLIENT-READY SUMMARY (markdown, friendly, written TO the client in second person):
- Open with one warm sentence acknowledging progress.
- 3–5 specific, plain-language action items the client should focus on next.
- One line about timing / what to expect.
- Sign off as "Your team at ${rel.client_first_name ? "PaigeAgent" : "PaigeAgent"}".

Format your response EXACTLY like this:
INSIGHTS_JSON:
["...","..."]
SUMMARY_MD:
<the markdown summary>

Transcript:
${transcript}`;

  try {
    const resp = await gatewayCompat("anthropic", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        messages: [
          { role: "system", content: "You write clear, professional credit-coaching summaries." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`gateway ${resp.status}`);
    const body = await resp.json();
    const text: string = body.choices?.[0]?.message?.content ?? "";
    const insightsMatch = text.match(/INSIGHTS_JSON:\s*(\[[\s\S]*?\])/);
    const summaryMatch = text.match(/SUMMARY_MD:\s*([\s\S]*)$/);
    let insights: string[] = [];
    if (insightsMatch) {
      try {
        insights = JSON.parse(insightsMatch[1]);
      } catch {
        insights = [];
      }
    }
    const summary = (summaryMatch?.[1] || text).trim();

    await admin
      .from("broker_paige_sessions")
      .update({
        summary,
        key_insights: insights,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    await admin
      .from("broker_client_relationships")
      .update({ last_session_summary: summary.slice(0, 1000) })
      .eq("id", rel.id);

    return { summary, insights };
  } catch (e) {
    console.error("[broker-paige] summary gen failed", (e as Error).message);
    return { summary: "", insights: [] };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: auth } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action: "chat" | "summarize" = body.action === "summarize" ? "summarize" : "chat";
    const broker_id: string = body.broker_id;
    const client_relationship_id: string = body.client_relationship_id;
    const session_id: string | undefined = body.session_id;
    const message: string | undefined = body.message;
    const conversation_history: ChatMsg[] = Array.isArray(body.conversation_history)
      ? body.conversation_history
      : [];

    if (!broker_id || !client_relationship_id) {
      return new Response(JSON.stringify({ error: "broker_id and client_relationship_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify broker ownership OR active team-member access to that broker.
    const { data: broker } = await admin
      .from("broker_profiles")
      .select(
        "id, user_id, business_name, broker_type, preferred_greeting, specializations, typical_client_profile, firm_description, paige_context_notes",
      )
      .eq("id", broker_id)
      .maybeSingle();
    if (!broker) {
      return new Response(JSON.stringify({ error: "Broker not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Detect team-member session (auth_user_id matches an active row for this broker).
    const { data: teamMember } = await admin
      .from("broker_team_members")
      .select("id, first_name, last_name, role")
      .eq("auth_user_id", user.id)
      .eq("broker_id", broker_id)
      .eq("status", "active")
      .maybeSingle();

    const isTeamMember = !!teamMember;
    if (broker.user_id !== user.id && !isTeamMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load relationship
    const { data: rel } = await admin
      .from("broker_client_relationships")
      .select(
        "id, broker_id, client_user_id, client_first_name, client_last_name, client_email, client_goal, broker_notes, relationship_stage, shared_goal, last_session_summary, session_count",
      )
      .eq("id", client_relationship_id)
      .maybeSingle();
    if (!rel || rel.broker_id !== broker_id) {
      return new Response(JSON.stringify({ error: "Client relationship not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get/create session
    let activeSessionId = session_id;
    if (!activeSessionId) {
      const sessionInsert: Record<string, unknown> = {
        broker_id,
        client_relationship_id,
        conversation: [],
        session_type: "strategy",
      };
      if (isTeamMember && teamMember) {
        sessionInsert.team_member_id = teamMember.id;
      }
      const { data: created, error: sessErr } = await admin
        .from("broker_paige_sessions")
        .insert(sessionInsert)
        .select("id")
        .single();
      if (sessErr || !created) {
        return new Response(JSON.stringify({ error: sessErr?.message || "Failed to create session" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      activeSessionId = created.id;
      await logEvent(admin, user.id, "broker_session_start", {
        broker_id,
        client_relationship_id,
        session_id: activeSessionId,
      });
      if (isTeamMember && teamMember) {
        await logEvent(admin, user.id, "broker_team_session_start", {
          broker_id,
          team_member_id: teamMember.id,
          team_member_role: teamMember.role,
          client_relationship_id,
          session_id: activeSessionId,
        });
      }
    }

    // ---- Summarize action ----
    if (action === "summarize") {
      const { data: msgs } = await admin
        .from("broker_session_messages")
        .select("role, content")
        .eq("session_id", activeSessionId)
        .order("created_at", { ascending: true });
      const hist: ChatMsg[] = (msgs || []).map((m: any) => ({
        role: m.role === "broker" ? "user" : "assistant",
        content: m.content,
      }));
      const { summary, insights } = await generateSummary(admin, activeSessionId!, rel as RelationshipRow, hist);
      return new Response(JSON.stringify({ session_id: activeSessionId, summary, insights }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Chat action ----
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persist broker message immediately
    await admin.from("broker_session_messages").insert({
      session_id: activeSessionId,
      role: "broker",
      content: message,
    });

    // Build context
    const { data: brokerAuth } = await admin.auth.admin.getUserById(broker.user_id);
    const brokerOwnerFullName =
      (brokerAuth?.user?.user_metadata as any)?.full_name ||
      brokerAuth?.user?.email?.split("@")[0] ||
      broker.business_name;

    // When a team member is running the session, address them by their own name
    // and inject a TEAM SESSION block so Paige knows who is talking.
    const activeOperatorFullName = isTeamMember && teamMember
      ? `${teamMember.first_name || ""} ${teamMember.last_name || ""}`.trim() || brokerOwnerFullName
      : brokerOwnerFullName;

    const clientCredit = await loadClientCreditContext(admin, rel.client_user_id);
    const baseTeamContext = await loadTeamContext(admin, broker_id, brokerOwnerFullName, broker.business_name);
    const teamSessionContext = isTeamMember && teamMember
      ? `TEAM SESSION: This session is being conducted by ${teamMember.first_name || ""} ${teamMember.last_name || ""} (${teamMember.role}) on behalf of ${broker.business_name}. ${teamMember.first_name || "They"} is an authorized team member of this workspace.`
      : null;
    const combinedTeamContext = [teamSessionContext, baseTeamContext].filter(Boolean).join("\n\n") || null;

    const systemPrompt = buildSystemPrompt({
      broker: broker as BrokerProfileRow,
      brokerFullName: activeOperatorFullName,
      rel: rel as RelationshipRow,
      clientCreditContext: clientCredit,
      teamContext: combinedTeamContext,
    });

    const messages: ChatMsg[] = [
      { role: "system", content: systemPrompt },
      ...conversation_history.slice(-20),
      { role: "user", content: message },
    ];

    const aiResp = await gatewayCompat("anthropic", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: CHAT_MODEL, messages, stream: true }),
    });

    if (!aiResp.ok || !aiResp.body) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("[broker-paige] gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bump session counters before streaming starts
    if ((rel as RelationshipRow).session_count === 0 || !session_id) {
      await admin
        .from("broker_client_relationships")
        .update({
          last_session_at: new Date().toISOString(),
          session_count: ((rel as RelationshipRow).session_count || 0) + (session_id ? 0 : 1),
        })
        .eq("id", client_relationship_id);
    } else {
      await admin
        .from("broker_client_relationships")
        .update({ last_session_at: new Date().toISOString() })
        .eq("id", client_relationship_id);
    }

    // Stream tokens, accumulate full text, persist assistant message at end.
    const upstream = aiResp.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";
    let assistantText = "";

    const stream = new ReadableStream({
      async start(controller) {
        // First message of the SSE stream: pass session id back to the client
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ session_id: activeSessionId })}\n\n`),
        );

        try {
          while (true) {
            const { done, value } = await upstream.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let nl: number;
            while ((nl = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, nl);
              buffer = buffer.slice(nl + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) {
                if (line.trim()) controller.enqueue(encoder.encode(line + "\n"));
                continue;
              }
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                continue;
              }
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
                if (delta) {
                  assistantText += delta;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`),
                  );
                }
              } catch {
                // partial JSON — push back and wait
                buffer = line + "\n" + buffer;
                break;
              }
            }
          }
        } catch (err) {
          console.error("[broker-paige] stream error", err);
        } finally {
          // Persist final assistant message
          if (assistantText.trim()) {
            await admin.from("broker_session_messages").insert({
              session_id: activeSessionId,
              role: "assistant",
              content: assistantText,
            });
            await admin
              .from("broker_paige_sessions")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", activeSessionId);
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("[broker-paige] fatal", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
