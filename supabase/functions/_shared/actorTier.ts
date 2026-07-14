// _shared/actorTier.ts — the ONE place edge functions derive an actor's tier.
//
// Tier Rail Spine, Phase D: paige-mcp and paige-ai-chat both import this so
// Paige's tier is computed off the SAME declared rail as a human's — the Phase B
// DB resolver public.get_actor_access(_actor). No tier logic is re-inferred in an
// edge function again (§12/§13).
//
// The DB tier is the FLOOR; a scope-sealed MCP token can only NARROW it to
// 'client', never widen it — preserving the "client seat is sealed before agency"
// invariant that paige-mcp's enforceTierAndScope relies on.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type Tier = "client" | "tenant" | "subaccount" | "agency" | "god";

// Ordering for ⊇ checks (god ⊇ agency ⊇ tenant/subaccount ⊇ client).
export const TIER_RANK: Record<Tier, number> = {
  client: 0,
  tenant: 1,
  subaccount: 1,
  agency: 2,
  god: 3,
};

// A token whose scopes are ALL `self.*` is a sealed client-portal seat. Moved
// verbatim from paige-mcp's isClientSeat so the two surfaces agree.
export function isClientSeatByScopes(scopes: string[] | null | undefined): boolean {
  const s = scopes ?? [];
  return s.length > 0 && s.every((sc) => typeof sc === "string" && sc.startsWith("self."));
}

// The single tier resolver. Fails CLOSED (to the least-privileged safe value) on
// any error so a transient RPC failure can never widen access.
export async function getActorTier(
  admin: SupabaseClient,
  a: { actorUserId: string | null; isPlatform: boolean; scopes: string[] },
): Promise<Tier> {
  // Platform key / god actor short-circuits.
  if (a.isPlatform) return "god";
  // A scope-sealed client seat is client regardless of DB standing (narrow-only).
  if (isClientSeatByScopes(a.scopes)) return "client";
  if (!a.actorUserId) return "client";
  try {
    const { data, error } = await admin.rpc("get_actor_access", { _actor: a.actorUserId });
    if (error || !data) return "client";
    const tier = (typeof data === "string" ? JSON.parse(data) : data)?.tier as string | undefined;
    if (tier === "god" || tier === "agency" || tier === "subaccount" || tier === "tenant" || tier === "client") {
      return tier as Tier;
    }
    // 'none'/unknown → most-restricted.
    return "client";
  } catch {
    return "client";
  }
}

// Client-seat tool allowlist (#133): the ONLY tools a genuinely client-authenticated
// Paige seat may call. Everything else (owner-ops: crm_*, pipeline_*, member_*,
// growth_page_*, action_file/advance, n8n_*, forge_subagent, plan_*, …) is refused
// server-side, deny-by-default — hidden AND enforced.
export const CLIENT_SEAT_ALLOW = new Set<string>([
  "web_fetch",
  "update_client_data", // a client updating their OWN record
]);

export function clientSeatToolAllowed(name: string): boolean {
  return CLIENT_SEAT_ALLOW.has(name);
}
