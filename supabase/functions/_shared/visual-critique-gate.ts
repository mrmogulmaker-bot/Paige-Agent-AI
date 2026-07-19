// _shared/visual-critique-gate.ts — the design agent's generate→critique→iterate loop (§25/§33).
//
// This is the thin orchestration the design agent runs AROUND a visual generation: screenshot the
// result (via studio-visual-critique), read the SHIP/ITERATE/BLOCK verdict, and on ITERATE/BLOCK feed
// the critic's refined prompt back into a regenerate step — up to the §33 iteration cap. It lives in
// _shared (not inlined in paige-ai-chat) so the loop is one testable home (§18) and any caller —
// paige-ai-chat OR Paige's headless agent — drives it the same way.
//
// GATED OFF BY DEFAULT: the caller only runs this when STUDIO_VISUAL_CRITIQUE_ENABLED === "true" AND
// the renderer/model are configured. With the flag unset the whole loop is skipped — zero behavior
// change (§13/§32: no live behavior means nothing to have mis-verified).

export interface CritiqueResult {
  ok: boolean;
  verdict?: "SHIP" | "ITERATE" | "BLOCK";
  summary?: string;
  blockers?: string[];
  should_fix?: string[];
  nits?: string[];
  cheesy_tells_hit?: string[];
  refined_prompt?: string;
  iteration?: number;
  spent_usd?: number;
  cost_estimate_usd?: number;
  capped?: boolean;
  low_confidence?: boolean;
  needs_config?: boolean;
}

/** True only when the design agent should run the visual-critique loop at all. */
export function visualCritiqueEnabled(): boolean {
  return (Deno.env.get("STUDIO_VISUAL_CRITIQUE_ENABLED") ?? "").toLowerCase() === "true";
}

interface FunctionsInvoker {
  functions: { invoke: (name: string, args: { body: unknown }) => Promise<{ data: unknown; error: unknown }> };
}

/**
 * Critique an already-generated IMAGE and, on ITERATE/BLOCK, regenerate from the critic's refined
 * prompt — bounded by the §33 iteration/cost caps (the studio-visual-critique fn enforces them too).
 *
 * @param client      the invoker (user-authed or service-role) used for functions.invoke
 * @param image       the current image result — must carry a public `url`
 * @param brief       the original ask, so the critic judges against intent
 * @param tenantId    for a service-role invoker; a JWT invoker's tenant is derived server-side (§9)
 * @param regenerate  re-run generation from a refined prompt → the new image result (or null on fail)
 * @returns the (possibly-improved) image result + the final critique (or the original image untouched
 *          when the loop is disabled / degrades — never throws into the caller's happy path)
 */
export async function critiqueImageAndIterate<T extends { url?: string }>(opts: {
  client: FunctionsInvoker;
  image: T;
  brief: string;
  tenantId?: string | null;
  regenerate: (refinedPrompt: string) => Promise<T | null>;
}): Promise<{ image: T; critique: CritiqueResult | null }> {
  const { client, brief, tenantId, regenerate } = opts;
  let image = opts.image;
  let critique: CritiqueResult | null = null;

  const MAX = Number(Deno.env.get("STUDIO_CRITIQUE_MAX_ITERATIONS") ?? "3");
  let spent = 0;

  try {
    for (let iteration = 0; iteration < MAX; iteration++) {
      if (!image?.url) break;
      const { data, error } = await client.functions.invoke("studio-visual-critique", {
        body: {
          image_url: image.url,
          artifact_kind: "image",
          brief,
          iteration,
          spent_usd: spent,
          ...(tenantId ? { tenant_id: tenantId } : {}),
        },
      });
      if (error) { console.error("[visual-critique-gate] invoke error:", error); break; }
      critique = (data ?? null) as CritiqueResult | null;
      if (!critique?.ok) break; // needs_config / degrade — accept what we have (§13)
      spent = typeof critique.spent_usd === "number" ? critique.spent_usd : spent;

      if (critique.verdict === "SHIP" || critique.capped) break;
      const refined = (critique.refined_prompt ?? "").trim();
      if (!refined) break; // ITERATE/BLOCK with no actionable prompt — stop, don't spin

      const next = await regenerate(refined);
      if (!next?.url) break; // regenerate failed — keep the last good image (§13)
      image = next;
    }
  } catch (e) {
    // The loop is an ENHANCEMENT — a failure here must never break the generation the user asked for.
    console.error("[visual-critique-gate] loop error (non-fatal):", e);
  }

  return { image, critique };
}
