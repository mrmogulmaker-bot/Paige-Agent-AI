# Paige-callable seams

Every capability Paige can drive by voice or text must have a clean, programmatic entry point —
never logic that lives only inside a React component a human clicks (doctrine §10). This file
documents those seams. The UI is one caller; Paige's agent is another.

---

## `callModel` — the full-modality Model Router (Vibe Studio)

**Home:** `supabase/functions/_shared/model-router.ts` (extends the text-only `pickRoute` /
`routedChatCompletion` seam in the same file — one home per capability, §12/§18).

One fail-closed seam that decides **which provider runs a job, for which modality, at which cost
tier**, enforces doctrine at the boundary (so no caller has to remember it), persists whatever it
produces, and audits the call. Text, image, image-with-text, 3D, audio-voice, and doc-render all
route through this ONE function.

### Signature

```ts
callModel(
  modality: Modality,   // 'text' | 'image' | 'image-with-text' | '3d' | 'audio-voice' | 'doc-render'
  tier: Tier,           // 'frontier' | 'open-fast' | 'open-flexible'
  task: unknown,        // a string, {prompt}, {content}, {messages:[...]}, or {prompt,size|aspect}
  opts: CallOpts,
): Promise<ModelResult>
```

```ts
interface CallOpts {
  tenantId: string;                 // REQUIRED — every call is tenant-scoped (§9). No anon/cross-tenant.
  actorRole?: string;               // operator/god/super_admin required when is_platform_default (§9)
  actorUserId?: string;             // stamped as studio_deliverable.created_by (falls back to NIL uuid)
  is_customer_send?: boolean;       // forces frontier tier (§17); triggers the §3 voice gate on text
  is_approval_decision?: boolean;   // forces frontier tier (§17)
  is_platform_default?: boolean;    // triggers the §2 finance-in-default prohibition
  model_override?: string;          // untrusted; checked against the per-provider allow-list
  callerFunction?: string;          // provenance label (recorded as the deliverable 'mode')
  brandVoice?: string;              // tenant voice used by the §3 rewrite pass
  metadata?: Record<string, unknown>; // extra provenance — NEVER a key/secret
}

interface ModelResult {
  artifact_url?: string;    // 30-day signed URL into the private studio-deliverables bucket
  content?: string;         // text output (text modality)
  provider: string; model: string; tier: Tier; modality: Modality;
  tokens_in?: number; tokens_out?: number;
  cost_estimate_usd?: number; // clearly-labeled ESTIMATE (not an invoice)
  latency_ms: number;
  needs_config?: boolean;   // true = provider not configured yet; an HONEST degrade, not a failure
  deliverable_id?: string;  // studio_deliverable row id
}
```

### Route table `(modality × tier) → provider`

| Modality | frontier | open-fast | open-flexible |
|---|---|---|---|
| **text** | Claude reasoning (`claude.ts`) — the only tier §17 permits for a send/approval | Groq Llama 3.3 70B — low-latency/cost drafts | Featherless — any allow-listed open weight via `model_override` |
| **image** | OpenAI gpt-image-1 — frontier escalation | Gemini 2.5 Flash Image — cheap/strong default (owner directive) | Replicate Flux (dev/schnell/1.1-pro/kontext) via `model_override` |
| **image-with-text** | Ideogram | Ideogram | Ideogram — only lane that renders legible words *inside* the image (tier = V_2 vs V_2_TURBO) |
| **3d** | Meshy (meshy-5) | Meshy (meshy-4) | — (unserved → clean `needs_config`) · Replicate 3D backup when `STUDIO_REPLICATE_3D_MODEL` set |
| **audio-voice** | ElevenLabs* | ElevenLabs* | ElevenLabs* |
| **doc-render** | deferred* | deferred* | deferred* |

\* `audio-voice` (ElevenLabs client lands in a follow-on lane) and `doc-render` (deferred wave, §19)
currently return a clean `needs_config` degrade — never a fake/broken artifact (§13). Any `video-*`
or other unserved combo is a clean `NotYetConfigured` reject.

### Doctrine gates enforced at the boundary (fail-closed, in order)

1. **§9 tenant scope** — `tenantId` is required; a `is_platform_default` call requires an operator
   role. No anonymous or cross-tenant generation.
2. **§17 send/approval tier** — a `is_customer_send` or `is_approval_decision` call must be
   `frontier`; an open tier throws structurally. A send/judgment never touches an open model.
3. **§2 finance-in-default** — a platform-default whose task text trips the finance/credit prefilter
   throws (finance is a per-tenant opt-in, never a default).
4. **§3 voice (post-generation)** — customer-send text is scanned for `AI-powered/streamline/
   seamless/empower`; up to 2 Claude rewrites, else it throws for human review.
5. **model-override allow-list** — a caller-supplied `model_override` is checked against the curated
   per-provider list (`model-allowlist.ts`) before it reaches a provider.

A `DoctrineViolation` (§9/§17/§2/§3) is audited to `paige_audit_log`
(`action='model_router.doctrine_violation'`) and re-thrown. A successful call is audited
(`action='model_router.call'`). No API key is ever logged, echoed, or persisted; the task is
referenced by a non-reversible hash, never raw content.

### Persistence

Every produced artifact (image/3D/voice/doc bytes, a downloaded vendor URL, or text content) is
hosted once in the private `studio-deliverables` bucket under a leading `tenant_id/` path segment,
recorded as a `studio_deliverable` provenance row (provider, model, tier, cost estimate, author),
and returned as a 30-day signed URL + `deliverable_id`. Persistence is fail-soft — a generation is
never lost because hosting hiccuped.

### Example invocations (from Studio modes)

```ts
import { callModel } from "../_shared/model-router.ts";

// 1) IMAGE — a tenant asks the Studio for a hero image (cheap default lane).
const hero = await callModel("image", "open-fast",
  { prompt: "Warm indigo-and-gold hero banner for a leadership consultant's landing page" },
  { tenantId, actorUserId, callerFunction: "studio.image" });
// hero.artifact_url → signed PNG; hero.needs_config === true if GEMINI_API_KEY is unset.

// 2) TEXT that will be SENT — a nurture email body. is_customer_send forces frontier (§17)
//    AND runs the §3 voice gate before the copy is returned.
const email = await callModel("text", "frontier",
  { messages: [{ role: "user", content: "Write a warm 3-sentence check-in to a client who went quiet." }] },
  { tenantId, actorUserId, is_customer_send: true, brandVoice: "direct, warm, founder-to-founder",
    callerFunction: "studio.copy.email" });
// email.content is voice-clean or the call threw §3 for human review.

// 3) 3D — a product mock for a funnel, premium tier, with an allow-listed model override.
const mesh = await callModel("3d", "frontier",
  { prompt: "A sleek matte-black hardcover book, standing, studio lighting" },
  { tenantId, actorUserId, model_override: "meshy-5", callerFunction: "studio.3d" });
// mesh.artifact_url → signed .glb; mesh.deliverable_id → the studio_deliverable row.
```

### Related seams (same router file, unchanged)

- `pickRoute(jobKind)` / `routedChatCompletion(jobKind, body)` — the text-only, job-kind router
  (cheap open models via Featherless with a silent Claude fallback).
- `claudeVoicePolish(draft, brandVoice?)` — the §3 voice rewrite pass (also used by `callModel`).
