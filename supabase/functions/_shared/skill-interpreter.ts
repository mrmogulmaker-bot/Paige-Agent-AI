// deno-lint-ignore-file no-explicit-any
// _shared/skill-interpreter.ts — the Deno orchestrator for the Skills S1b steps-interpreter.
//
// Pairs with the PURE, unit-tested decision logic in `_shared/skill-interpreter-core.ts`. This file
// holds ONLY the side-effecting orchestration (forge call, context read, approval write) so the core
// stays Deno-free and vitest-testable. §18 — it REUSES the existing `forge()` seam (§26) and the
// existing paige_pending_approvals table; it forks no router, no second generation path, no second
// approvals home.
//
// §16 GUARANTEE: the interpreter has NO external-send call site (no resend, no Twilio). External
// delivery can only ever happen later, from the approved-send seam, after a human approves the draft
// this interpreter files. A skill's autonomy_lane decides whether it returns the output (auto), files
// a draft for approval (confirm), or briefs only (off) — never an autonomous send.

import { forge } from "./prompt-forge.ts";
import {
  type SkillRow,
  type CallerTier,
  resolveExecutionMode,
  mapApprovalRisk,
  tierAllowsSkill,
  needsFormat,
  pickModality,
  pickTier,
  buildForgeIntent,
  FORMAT_OPTIONS,
  FORMAT_PROMPT,
} from "./skill-interpreter-core.ts";

export type InterpretStatus =
  | "succeeded"        // auto lane — output produced and returned
  | "awaiting_approval"// confirm lane — draft filed to paige_pending_approvals
  | "brief"            // off lane — brief returned, nothing written/executed
  | "needs_input"      // Slice 4 — paused to ask the user for a format
  | "needs_config"     // honest degrade — generation unavailable or tenant unresolved
  | "denied"           // §60 tier gate denied this tier
  | "failed";          // a real error (forge threw, approval insert failed)

export interface InterpretResult {
  status: InterpretStatus;
  outputs: Record<string, unknown>;
  steps_log: Array<Record<string, unknown>>;
  error?: string | null;
}

export interface InterpretDeps {
  /** The real prompt-forge seam (injected so the core stays testable; here it's the module forge). */
  forge: typeof forge;
  /** A service-role Supabase client. */
  admin: any;
}

export interface InterpretCtx {
  skill: SkillRow;
  inputs: Record<string, unknown>;
  contactId: string | null;
  /** Server-resolved tenant (body.tenant_id ?? contact.tenant_id) — NEVER a body-trusted auth claim (§9). */
  tenantId: string | null;
  callerTier: CallerTier;
  actorUserId: string | null;
  actorRole: string | null;
  runId: string;
}

const CONTEXT_TOOLS = new Set(["context", "rag", "client_memory"]);

/**
 * Run a skill through the generic interpreter. Returns an honest, structured outcome — it never throws
 * for a policy/degrade case (denied/needs_config/needs_input), only surfaces `failed` with the real
 * error on an actual fault. Every branch pushes to steps_log so the run is auditable.
 */
export async function interpretSkill(deps: InterpretDeps, ctx: InterpretCtx): Promise<InterpretResult> {
  const { skill, inputs, contactId, tenantId, callerTier, actorUserId, actorRole, runId } = ctx;
  const stepsLog: Array<Record<string, unknown>> = [];

  // 1) §60/§61 tier gate (server belt; UI is the primary gate per #466).
  if (!tierAllowsSkill(skill.tier_availability, callerTier)) {
    stepsLog.push({ step: "tier_gate", allowed: false, tier: callerTier });
    return {
      status: "denied",
      outputs: { reason: "tier_not_permitted", tier: callerTier, skill: skill.slug },
      steps_log: stepsLog,
    };
  }

  // 2) Slice 4 (S1d) — a document skill asks for a format before generating (§15/§36).
  if (needsFormat(skill, inputs)) {
    stepsLog.push({ step: "format_picker", field: "format" });
    return {
      status: "needs_input",
      outputs: { field: "format", prompt: FORMAT_PROMPT, options: [...FORMAT_OPTIONS] },
      steps_log: stepsLog,
    };
  }

  // 3) Tenant must be resolved — forge THROWS on a missing tenantId. Honest degrade, never a guess (§9/§13).
  if (!tenantId) {
    stepsLog.push({ step: "tenant_resolve", resolved: false });
    return {
      status: "needs_config",
      outputs: { reason: "tenant_unresolved", note: "Skill needs a tenant to forge under; none was resolved." },
      steps_log: stepsLog,
    };
  }

  // 4) Gather read-only context when the skill asks for it and a contact is in scope. §9 — the contact
  //    read is constrained to the caller's OWN tenant, so a stranger-tenant contact_id yields no context
  //    (never a cross-tenant read) rather than leaking.
  let contextText = "";
  const wantsContext = Array.isArray(skill.steps) && skill.steps.some((s) => CONTEXT_TOOLS.has((s?.tool ?? "").toLowerCase()));
  if (contactId && wantsContext) {
    try {
      const { data: contact } = await deps.admin
        .from("clients")
        .select("id, first_name, last_name, email, tenant_id")
        .eq("id", contactId)
        .eq("tenant_id", tenantId) // §9 — only the caller's own tenant's contact
        .maybeSingle();
      if (contact) {
        const { data: memory } = await deps.admin
          .from("client_memory")
          .select("memory_type, content, created_at")
          .eq("client_id", contactId)
          .order("created_at", { ascending: false })
          .limit(5);
        const memLines = Array.isArray(memory)
          ? memory.map((m: any) => `- ${m.memory_type}: ${String(m.content ?? "").slice(0, 400)}`)
          : [];
        contextText = [
          `Client: ${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim(),
          ...memLines,
        ].filter(Boolean).join("\n");
        stepsLog.push({ step: "context", memory_count: memLines.length });
      } else {
        stepsLog.push({ step: "context", memory_count: 0, note: "contact not in tenant scope" });
      }
    } catch (e) {
      // Context is best-effort — a read hiccup degrades to no-context, never a failed run (§13).
      console.error(`skill-interpreter[${skill.slug}] context read failed:`, (e as Error)?.message);
      stepsLog.push({ step: "context", memory_count: 0, error: (e as Error)?.message });
    }
  }

  // 5) Forge the generative core through the EXISTING §26 seam. remember=false: a skill draft (often
  //    approval-gated) is not a landed design artifact, so it must not pollute the design-memory space
  //    (§26 honest capture — memory is for genuine, landed successes).
  const modality = pickModality(skill);
  const tier = pickTier(skill);
  const userIntent = buildForgeIntent(skill, inputs, contextText);
  let content = "";
  try {
    const forged = await deps.forge({
      tenantId,
      modality,
      tier,
      userIntent,
      actorRole: actorRole ?? undefined,
      actorUserId: actorUserId ?? undefined,
      // §9/§2 — NEVER a platform default here. `scoping` is REGISTRY PROVENANCE (who authored the
      // paige_skills row), NOT the nature of THIS generation. A tenant running a platform-authored
      // skill produces TENANT content for their own book — it is not "authoring the shared/God
      // defaults that ship to everyone." forge's `is_platform_default` gate means the LATTER: it
      // requires an OPERATOR role (assertTenantScope, model-router-gates.ts) and forces the §2
      // finance-in-default ban + §3 platform-voice rewrite on the OUTPUT. Mapping scoping='platform'
      // → is_platform_default=true (the pre-#135 bug) made assertTenantScope THROW §9 for every real
      // caller (skill-runner passes actorRole 'admin'/'mcp'/'coach'/'paige'/'system' — none operator),
      // so EVERY seeded platform-baseline skill failed at runtime. It was also a latent §2 over-reach:
      // the finance ban is a PLATFORM-DEFAULT rule, but finance/credit is an ALLOWED per-tenant OPT-IN
      // (§2 clarification) — forcing the default-scan on a tenant's own run would wrongly block a
      // funding-coach tenant from running a generic skill with finance in THEIR brief. The seeded
      // DEFINITION's finance-cleanliness is proven once at seed time (the migration's §2 SQL scan);
      // it does not need re-proving on every tenant execution. So this generation is tenant content:
      is_platform_default: false,
      is_customer_send: false, // interpreter DRAFTS; the send (if any) is a later, human-approved seam (§16)
      callerFunction: `skill-interpreter:${skill.slug}`,
      metadata: { skill_slug: skill.slug, run_id: runId, risk_level: skill.risk_level ?? null },
      remember: false,
    });
    const result = forged.result;
    stepsLog.push({ step: "forge", modality, tier, provider: result.provider ?? null, needs_config: !!result.needs_config });
    if (result.needs_config || !(typeof result.content === "string" && result.content.trim())) {
      return {
        status: "needs_config",
        outputs: { reason: "generation_unavailable", needs_config: !!result.needs_config },
        steps_log: stepsLog,
      };
    }
    content = result.content;
  } catch (e) {
    // LOUD (§32) — a forge throw is a real fault, surfaced not swallowed.
    console.error(`skill-interpreter[${skill.slug}] forge threw:`, (e as Error)?.message);
    return { status: "failed", outputs: {}, steps_log: stepsLog, error: (e as Error)?.message ?? "forge error" };
  }

  // 6) Resolve how the run lands, per the §16 autonomy clamp + the structural risk floor (a
  //    high-risk skill can never auto-execute, even if its lane were mis-seeded to 'auto').
  const mode = resolveExecutionMode(skill.autonomy_lane, skill.risk_level);

  if (mode === "brief") {
    stepsLog.push({ step: "brief", note: "autonomy_lane=off — briefed to a human, not executed" });
    return { status: "brief", outputs: { content }, steps_log: stepsLog };
  }

  if (mode === "approval") {
    // File a draft for a human to approve. Column values are pinned to the REAL table constraints:
    //  • type MUST be in the paige_pending_approvals type CHECK — use 'other' (a skill draft has no
    //    dedicated type); the skill slug lives in draft_content/metadata for identification.
    //  • category is NON-email/sms on purpose so the #465 send-recipient CHECK never applies — a skill
    //    draft is a review item, not a send.
    //  • risk_level uses the approvals vocabulary (low/medium/high/null) via mapApprovalRisk — the
    //    skill's own read_only|draft|mutating|external_send vocabulary would violate the CHECK.
    //  • tenant_id is EXPLICIT (§9/§51) — the service-role client bypasses RLS, so a NULL tenant would
    //    make the row visible to EVERY tenant.
    try {
      const { data: appr, error: apprErr } = await deps.admin
        .from("paige_pending_approvals")
        .insert({
          type: "other",
          category: "skill",
          draft_content: { content, skill_slug: skill.slug, format: (inputs?.format as string) ?? null },
          contact_id: contactId,
          tenant_id: tenantId,
          source: "skill-interpreter",
          risk_level: mapApprovalRisk(skill.risk_level),
          summary: `Paige ran "${skill.name}" — review the draft`,
          metadata: { skill_slug: skill.slug, run_id: runId, methodology_anchor: skill.methodology_anchor ?? null },
        })
        .select("id")
        .single();
      if (apprErr || !appr) {
        console.error(`skill-interpreter[${skill.slug}] approval insert failed:`, apprErr?.message);
        return { status: "failed", outputs: { content }, steps_log: stepsLog, error: apprErr?.message ?? "approval insert failed" };
      }
      stepsLog.push({ step: "approval", approval_id: appr.id });
      return { status: "awaiting_approval", outputs: { content, approval_id: appr.id }, steps_log: stepsLog };
    } catch (e) {
      console.error(`skill-interpreter[${skill.slug}] approval threw:`, (e as Error)?.message);
      return { status: "failed", outputs: { content }, steps_log: stepsLog, error: (e as Error)?.message ?? "approval error" };
    }
  }

  // mode === "execute" (🟢 auto). The ONLY side effect permitted here is an INTERNAL memory save — the
  // interpreter never sends externally. Save when the skill's plan includes an internal save step.
  const hasSaveStep = Array.isArray(skill.steps) &&
    skill.steps.some((s) => (s?.tool ?? "").toLowerCase() === "client_memory" && /save|store|record/i.test(s?.desc ?? ""));
  if (contactId && hasSaveStep) {
    try {
      await deps.admin.from("client_memory").insert({
        client_id: contactId,
        memory_type: `skill:${skill.slug}`,
        content,
        metadata: { run_id: runId, source: "skill-interpreter" },
      });
      stepsLog.push({ step: "save_memory", ok: true });
    } catch (e) {
      // A memory-save miss doesn't fail the run — the output still succeeded (§13).
      console.error(`skill-interpreter[${skill.slug}] memory save failed:`, (e as Error)?.message);
      stepsLog.push({ step: "save_memory", ok: false, error: (e as Error)?.message });
    }
  }

  return { status: "succeeded", outputs: { content }, steps_log: stepsLog };
}
