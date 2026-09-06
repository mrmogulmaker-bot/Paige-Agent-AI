// @vitest-environment node
//
// Slice 2 — Campaign-brief conversational create/list/revise reach (Spine-registered).
//
// Structural + safety-invariant guard on the wiring. The end-to-end authenticated runtime (Paige
// creating/revising a brief in a live Solo chat) is §32.c-owed to a browser-capable session; the
// tenant-scope + optimistic-version + idempotency BEHAVIOR of the two RPCs this reach consumes is
// proven on real Postgres by scripts/campaign-brief-db-proof.mjs. This test locks the wiring and the
// OWNER-CORRECTED AUTHORITY MODEL into source so a refactor cannot silently regress them:
//   * the tools are REGISTERED in a PAIGE Spine domain (not hand-wired inline into the Chat handler);
//   * create/revise are classified `ordinary` — the class the runtime clamp leaves ELIGIBLE for a
//     standing `auto` grant (standing-delegated authority), with confirm as the escalation lane —
//     never `high`, which would force a blanket confirm on every planning write;
//   * the reach consumes the EXISTING secure RPCs (configure_campaign_brief / get_campaign_briefs)
//     via the caller JWT client, passing _actor_kind:'paige', so the RPC re-resolves tenant from auth
//     and gates on tenant-admin (§9/§53/§59) — the chat never widens access;
//   * the honest boundary holds: a brief is INTENT, never proof anything launched/sent/published.
import { readFileSync, existsSync } from "node:fs";
import { describe, it, expect } from "vitest";

const DOMAIN = "supabase/functions/_shared/paige-spine/domains/campaigns.ts";
const REGISTRY = "supabase/functions/_shared/paige-spine/registry.ts";
const RISK = "supabase/functions/_shared/action-risk.ts";
const RISK_LINT = "scripts/ci/action-risk-lint.mjs";
const CHAT = "supabase/functions/paige-ai-chat/index.ts";

const domain = () => readFileSync(DOMAIN, "utf8");
const chat = readFileSync(CHAT, "utf8");

describe("Slice 2 — campaign-brief capabilities are declared in a Spine domain", () => {
  it("the domain file exists and declares create/revise/list capabilities keyed to the domain", () => {
    expect(existsSync(DOMAIN)).toBe(true);
    const m = domain();
    // key namespace must equal the domain (registry validator enforces this at import)
    expect(m).toMatch(/key:\s*"campaign\.create"/);
    expect(m).toMatch(/key:\s*"campaign\.revise"/);
    expect(m).toMatch(/key:\s*"campaign\.list"/);
    expect(m).toMatch(/domain:\s*"campaign"/);
  });

  it("create/revise are mutating, chat-canonical, LIVE-bound, ORDINARY, on the existing configure RPC", () => {
    const m = domain();
    // both writes execute the EXISTING governed RPC — no new SQL seam
    expect(m).toMatch(/executor:\s*"public\.configure_campaign_brief"/);
    // the corrected authority model: ORDINARY (grantable to standing auto), NOT high
    expect(m).toMatch(/riskPolicyKey:\s*"ordinary"/);
    expect(m).not.toMatch(/riskPolicyKey:\s*"high"/);
    // mutating actions require chat-canonical approval authority + a LIVE chat binding + a chat tool
    expect(m).toMatch(/classification:\s*"mutate"[\s\S]*?approvalAuthority:\s*"chat-canonical"/);
    expect(m).toMatch(/chatTool:\s*"campaign_brief_create"/);
    expect(m).toMatch(/chatTool:\s*"campaign_brief_revise"/);
    expect(m).toMatch(/chatBinding:\s*"LIVE"/);
  });

  it("list is a read on the existing get RPC — read_only, no approval authority", () => {
    const m = domain();
    expect(m).toMatch(/executor:\s*"public\.get_campaign_briefs"/);
    expect(m).toMatch(/classification:\s*"read"[\s\S]*?riskPolicyKey:\s*"read_only"[\s\S]*?approvalAuthority:\s*"none"/);
    expect(m).toMatch(/chatTool:\s*"campaign_brief_list"/);
  });

  it("exports a compact CAMPAIGN_BRIEF_TOOLS array (compact so it is never counted as an inline hand-wired tool)", () => {
    const m = domain();
    expect(m).toMatch(/export const CAMPAIGN_BRIEF_TOOLS\s*=/);
    // compact single-line style: name with no leading-space-on-its-own-line shape the registry lint counts
    expect(m).toMatch(/name:"campaign_brief_create"/);
    expect(m).toMatch(/name:"campaign_brief_revise"/);
    expect(m).toMatch(/name:"campaign_brief_list"/);
    // the honest boundary must be stated IN the tool descriptions the model reads
    expect(m).toMatch(/launch|launched|sent|publish|published/i);
    expect(m).toMatch(/intent|planning|proof/i);
  });

  it("is added to the registry capability set", () => {
    const r = readFileSync(REGISTRY, "utf8");
    expect(r).toMatch(/from\s+["']\.\/domains\/campaigns\.ts["']/);
    expect(r).toMatch(/CAMPAIGN_BRIEF_CAPABILITIES/);
    expect(r).toMatch(/PAIGE_SPINE_CAPABILITIES\s*=\s*\[[\s\S]*CAMPAIGN_BRIEF_CAPABILITIES/);
  });
});

describe("Slice 2 — the writes are classified ORDINARY and discoverable by the action-risk lint", () => {
  it("action-risk classifies both writes as ordinary (grantable to standing auto)", () => {
    const r = readFileSync(RISK, "utf8");
    expect(r).toMatch(/\["campaign_brief_create",\s*"ordinary"/);
    expect(r).toMatch(/\["campaign_brief_revise",\s*"ordinary"/);
    // never high — a blanket confirm on a planning write is the exact thing the correction forbids
    expect(r).not.toMatch(/\["campaign_brief_create",\s*"high"/);
    expect(r).not.toMatch(/\["campaign_brief_revise",\s*"high"/);
  });

  it("action-risk-lint discovers CAMPAIGN_BRIEF_TOOLS as an imported catalog so the writes reconcile", () => {
    const l = readFileSync(RISK_LINT, "utf8");
    expect(l).toMatch(/CAMPAIGN_BRIEF_TOOLS/);
    expect(l).toMatch(/campaigns\.ts/);
    expect(l).toMatch(/campaign_brief_/);
  });
});

describe("Slice 2 — the reach is wired into paige-ai-chat via the registry, not hand-rolled", () => {
  it("imports and spreads the registered tool catalog", () => {
    expect(chat).toMatch(/import\s*\{\s*CAMPAIGN_BRIEF_TOOLS\s*\}\s*from\s*['"]\.\.\/_shared\/paige-spine\/domains\/campaigns\.ts['"]/);
    expect(chat).toMatch(/\.\.\.CAMPAIGN_BRIEF_TOOLS,/);
  });

  it("injects a stable idempotency key at the gate for the two writes (survives the confirm round-trip)", () => {
    // mirrors the mission request_key pattern: settled into gateArgs BEFORE the fingerprint so the
    // approved/stored call and the executed call share one key
    expect(chat).toMatch(/campaign_brief_create["']?\s*\|\|\s*tc\.function\.name === ["']campaign_brief_revise["'][\s\S]{0,160}idempotency_key/);
  });

  it("dispatches create/revise through the caller JWT to configure_campaign_brief with _actor_kind paige", () => {
    // command-shaped RPC, actor marked paige, tenant NOT trusted from the arg (RPC re-resolves it)
    expect(chat).toMatch(/configure_campaign_brief/);
    expect(chat).toMatch(/_actor_kind:\s*["']paige["']/);
    expect(chat).toMatch(/type:\s*["']create-brief["']/);
    expect(chat).toMatch(/type:\s*["']update-brief["']/);
    // the write goes through the JWT client (auth.uid resolves inside the SECURITY DEFINER RPC),
    // never the service-role client — same posture as the mission branch
    expect(chat).toMatch(/supabaseClient\.rpc\("configure_campaign_brief"/);
  });

  it("dispatches list through get_campaign_briefs", () => {
    expect(chat).toMatch(/get_campaign_briefs/);
  });

  it("maps the RPC error codes to honest, jargon-free reasons and never claims success on failure", () => {
    expect(chat).toMatch(/CAMPAIGN_BRIEF_VERSION_CONFLICT/);
    expect(chat).toMatch(/CAMPAIGN_BRIEF_FORBIDDEN/);
    expect(chat).toMatch(/CAMPAIGN_BRIEF_.*MISMATCH/);
  });

  it("records the write target as the real campaign_briefs table", () => {
    expect(chat).toMatch(/campaign_brief_create:\s*"campaign_briefs"/);
    expect(chat).toMatch(/campaign_brief_revise:\s*"campaign_briefs"/);
  });

  it("gives the writes operator-facing labels and an honest chat receipt (record only · nothing launched)", () => {
    expect(chat).toMatch(/campaign_brief_create:\s*"/);
    expect(chat).toMatch(/campaign_brief_revise:\s*"/);
    // the step receipt must not imply a campaign is live
    expect(chat).toMatch(/case "campaign_brief_create":/);
    expect(chat).toMatch(/case "campaign_brief_revise":/);
    expect(chat).toMatch(/case "campaign_brief_list":/);
  });
});
