/**
 * Campaigns › Social — the projection contract and the fabrication guard.
 *
 * TWO JOBS, and the second is the one that matters.
 *
 * The first is ordinary: `social-command.ts` is pure, so every figure this surface can show is
 * decidable without a browser. These tests call the builders directly.
 *
 * The second is the guard `src/solo/compass.fabrications.test.ts` exists for, pointed at the surface
 * that most needs it. A dashboard of KPI tiles, progress figures and per-channel cards is precisely
 * the shape that grew ten invented departments, a hardcoded confidence percent and a fabricated
 * week-over-week trend inside `compass.tsx` — and NOTHING in this repo mechanically guarded
 * `growth2.tsx` against the same thing before this file. Two lessons are copied from that file
 * rather than re-learned: assert on the SHAPE, not a bare phrase (a removal note quoting a heading
 * made an earlier assertion vacuous), and COUNT invocations rather than mentions.
 *
 * Comments are stripped before every static assertion — a guard a docstring can trip is a guard
 * that punishes documentation, and this file's own explanations would otherwise match it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SOCIAL_NETWORKS,
  buildBrief,
  buildChannels,
  buildKpis,
  buildPipeline,
  isGrowthDesk,
  readSocialHandles,
  toHandlePayload,
  type SocialCommandInput,
} from "./social-truth";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const strip = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|--).*$/gm, "");

const projection = read("src/solo/social-truth.ts");
const surface = read("src/solo/social-command.tsx");
const adapter = read("src/solo/useSocialCommand.ts");
const growth = read("src/solo/growth2.tsx");
const css = read("src/solo/social-command.css");
const migration = read(
  "supabase/migrations/20261210000000_a_business_can_record_the_accounts_it_posts_from.sql",
);
const spine = read("supabase/functions/_shared/paige-spine/domains/social.ts");
const chatEvidence = read(
  "supabase/functions/_shared/paige-spine/domains/socialPresenceChatEvidence.ts",
);

const EMPTY: SocialCommandInput = {
  handles: [],
  publishedOutputs: 0,
  approvalGatedForms: 0,
  formsNeedingRepair: 0,
  capturedSubmissions: 0,
  waitingOnYou: 0,
};

describe("social projection — a module with no source renders its absence", () => {
  it("gives every KPI without a record a null value, never a zero", () => {
    const kpis = buildKpis(EMPTY);
    // A zero would read as "counted, and there were none". Only null says "nothing counts this".
    for (const kpi of kpis) {
      expect(kpi.figure.value, `${kpi.id} must not report a countable figure`).toBeNull();
      expect(kpi.figure.state).toBe("UNAVAILABLE");
      expect(kpi.figure.note.trim().length).toBeGreaterThan(0);
    }
  });

  it("never offers a queue, a schedule or a placement figure, whatever the inputs", () => {
    const full: SocialCommandInput = {
      handles: [{ network: "instagram", label: "Instagram", handle: "@acme" }],
      publishedOutputs: 12,
      approvalGatedForms: 3,
      formsNeedingRepair: 1,
      capturedSubmissions: 40,
      waitingOnYou: 5,
    };
    const queue = buildKpis(full).find((kpi) => kpi.id === "queue");
    const placements = buildKpis(full).find((kpi) => kpi.id === "placements");
    const scheduled = buildPipeline(full).find((stage) => stage.id === "scheduled");
    // These three are the non-inferences the replaced panel made out loud. No input may satisfy them.
    expect(queue?.figure.value).toBeNull();
    expect(placements?.figure.value).toBeNull();
    expect(scheduled?.figure.value).toBeNull();
  });

  it("reports a declared account as a record, and never as a connection", () => {
    const kpis = buildKpis({ ...EMPTY, handles: [{ network: "x", label: "X", handle: "@acme" }] });
    const channels = kpis.find((kpi) => kpi.id === "channels");
    expect(channels?.figure.value).toBe(1);
    expect(channels?.figure.state).toBe("PARTIAL");
    expect(channels?.figure.note).toMatch(/not a connection/i);
  });

  it("gives every channel card an absent reach, on every input", () => {
    const cards = buildChannels(SOCIAL_NETWORKS.map((n) => ({ network: n.key, label: n.label, handle: "@a" })));
    expect(cards).toHaveLength(SOCIAL_NETWORKS.length);
    // There is no branch in which a declared handle produces an audience figure.
    for (const card of cards) expect(card.reach.value).toBeNull();
  });

  it("counts published outputs but never calls them posts or placements", () => {
    const published = buildPipeline({ ...EMPTY, publishedOutputs: 7 }).find((s) => s.id === "published");
    expect(published?.figure.value).toBe(7);
    expect(published?.detail).toMatch(/not yet placed/i);
    expect(published?.detail.toLowerCase()).not.toMatch(/\bposts?\b/);
  });

  it("says nothing is on record when nothing is, and names no momentum it cannot measure", () => {
    const brief = buildBrief(EMPTY);
    expect(brief.headline).toMatch(/nothing is on record/i);
    expect(`${brief.headline} ${brief.body}`.toLowerCase())
      .not.toMatch(/momentum|engagement|trending|opportunit|growing|audience is/);
  });

  it("composes the brief only from figures that have a source", () => {
    const brief = buildBrief({ ...EMPTY, handles: [{ network: "linkedin", label: "LinkedIn", handle: "acme" }], publishedOutputs: 2 });
    expect(brief.body).toContain("1 account");
    expect(brief.body).toContain("2 published outputs");
    expect(brief.body).toMatch(/no account is connected/i);
  });
});

describe("handle shape — the surface and Systems Check must agree on the count", () => {
  it("reads the flat object the runner counts", () => {
    expect(readSocialHandles({ social_handles: { instagram: "@acme", linkedin: "acme" } })).toEqual([
      { network: "instagram", label: "Instagram", handle: "@acme" },
      { network: "linkedin", label: "LinkedIn", handle: "acme" },
    ]);
  });

  it("drops blanks, unknown networks and duplicates rather than showing them", () => {
    expect(readSocialHandles({ social_handles: { instagram: "   ", myspace: "@a", x: "@b" } }))
      .toEqual([{ network: "x", label: "X", handle: "@b" }]);
  });

  it("returns nothing for an absent or malformed record", () => {
    expect(readSocialHandles(null)).toEqual([]);
    expect(readSocialHandles({})).toEqual([]);
    expect(readSocialHandles({ social_handles: "@acme" })).toEqual([]);
  });

  it("never sends an empty string, because a stored blank is a key the check cannot count", () => {
    const payload = toHandlePayload({ instagram: "  @acme  ", facebook: "", x: "   " });
    expect(payload).toEqual({ instagram: "@acme" });
    expect(Object.values(payload).every((value) => value.length > 0)).toBe(true);
  });

  it("keeps the client allow-list identical to the server's, in both directions", () => {
    // A network the form offers and the function refuses is a save that fails after the person
    // typed it; one the function accepts and the form omits is a record nobody can edit here.
    const declared = /_allowed constant text\[\] := ARRAY\[([^\]]+)\]/.exec(migration)?.[1] ?? "";
    const server = [...declared.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    expect(server).toEqual(SOCIAL_NETWORKS.map((n) => n.key).sort());
  });
});

describe("growth desks", () => {
  it("names the desks whose filed work belongs on a growth surface", () => {
    expect(isGrowthDesk("marketing")).toBe(true);
    expect(isGrowthDesk("Client Experience")).toBe(true);
    expect(isGrowthDesk("legal_compliance")).toBe(false);
  });
});

describe("§13 fabrication guard — the shapes this surface must never grow", () => {
  it("names a metric it cannot produce ONLY inside a denial, never as a claim", () => {
    // ASSERTED ON WHAT THE PROJECTION RENDERS, not on the source text. Two earlier drafts scanned
    // the files and failed on the surface's own honest sentence and then on a field NAME — which is
    // the compass.fabrications.test.ts lesson arriving twice: a guard that reads a phrase instead of
    // a shape either punishes documentation or forces the code to be named dishonestly to pass.
    // Every string below is copy a person actually reads, produced by the builders for a maximal
    // input. If any of them ever NAMES a metric without denying it, a figure was invented.
    const loud: SocialCommandInput = {
      handles: SOCIAL_NETWORKS.map((n) => ({ network: n.key, label: n.label, handle: "@acme" })),
      publishedOutputs: 31, approvalGatedForms: 4, formsNeedingRepair: 2,
      capturedSubmissions: 88, waitingOnYou: 6,
    };
    // LABELS are checked by a different rule below, because a label is a name rather than a claim:
    // "Scheduled" is the honest name of a stage whose figure is absent and whose note says why.
    // What must carry the denial is the prose beside it.
    const copy: string[] = [];
    for (const input of [EMPTY, loud]) {
      const brief = buildBrief(input);
      copy.push(brief.headline, brief.body);
      for (const kpi of buildKpis(input)) copy.push(kpi.detail, kpi.figure.note);
      for (const stage of buildPipeline(input)) copy.push(stage.detail, stage.figure.note);
      for (const card of buildChannels(input.handles)) copy.push(card.detail, card.reach.note);
    }

    const NEGATED = /\b(no|not|never|nothing|none|cannot|does not|is not|without)\b/;
    for (const line of copy) {
      for (const sentence of line.toLowerCase().split(/(?<=[.!?])\s+/)) {
        if (!/\b(follower|reach|engagement|impression|audience|placement|schedule[ds]?)\b/.test(sentence)) continue;
        expect(sentence, `a metric must be denied, not claimed: "${sentence.trim()}"`).toMatch(NEGATED);
      }
    }
  });

  it("never puts a figure behind a label naming something the platform cannot measure", () => {
    // The label rule the test above defers to. A tile may be NAMED "Scheduled" or "Recorded
    // placements" — those are the honest names of the gaps — but it may never carry a number,
    // because no record anywhere produces one. This is the invariant; the wording is not.
    const loud: SocialCommandInput = {
      handles: SOCIAL_NETWORKS.map((n) => ({ network: n.key, label: n.label, handle: "@acme" })),
      publishedOutputs: 31, approvalGatedForms: 4, formsNeedingRepair: 2,
      capturedSubmissions: 88, waitingOnYou: 6,
    };
    const unmeasurable = /\b(follower|reach|engagement|impression|audience|placement|queue|schedul)/i;
    for (const input of [EMPTY, loud]) {
      for (const tile of [...buildKpis(input), ...buildPipeline(input)]) {
        if (!unmeasurable.test(tile.label)) continue;
        expect(tile.figure.value, `"${tile.label}" must not carry a figure`).toBeNull();
        expect(tile.figure.state).toBe("UNAVAILABLE");
      }
    }
  });

  it("uses no vocabulary that has no honest form on this surface", () => {
    // These never appear in a denial — they only ever exist as a claim, so a literal ban is the
    // right shape for them, unlike the metric words above.
    const body = (strip(projection) + strip(surface)).toLowerCase();
    for (const banned of [
      "follower_count", "engagement_rate", "click_through", "sparkline",
      "vs. last week", "vs last week", "212%", "3.4x", "on track", "performing well",
    ]) {
      expect(body, `shipped copy must not claim ${banned}`).not.toContain(banned);
    }
  });

  it("declares no seeded mission, insight or channel fixture", () => {
    const body = strip(projection) + strip(surface);
    // The fixture shape, not a phrase: a literal array of named objects is how the ten invented
    // departments entered compass.tsx, and it is what must never appear here.
    expect(body).not.toMatch(/const\s+(MISSIONS|INSIGHTS|CHANNELS|TELEMETRY|SAMPLE|DEMO|SEED)[A-Z_]*\s*(:[^=]*)?=\s*\[/);
    expect(body).not.toMatch(/Authority Builder|Workshop Wednesday|Community Growth/);
  });

  it("routes every figure through the projection layer rather than computing one in the view", () => {
    const view = strip(surface);
    // The view renders <Figure value={...}> from builder output; it must not do its own arithmetic
    // on a count, which is where an unsourced number would be born.
    expect(view).not.toMatch(/Math\.(round|floor|ceil|random)/);
    expect(view).not.toMatch(/toFixed\(/);
    expect(view).not.toMatch(/%["`]/);
  });

  it("keeps every one of the five non-inferences the replaced panel made", () => {
    const body = strip(projection) + strip(surface) + strip(growth);
    for (const claim of [/follower/i, /queue/i, /schedul/i, /placement/i, /account/i]) {
      expect(body).toMatch(claim);
    }
    // And the surface-level label still says the provider connection is not ready.
    expect(strip(growth)).toContain("A customer-facing social provider connection is still not ready");
  });

  it("keeps the Vibe Studio redirect and the placement precondition", () => {
    expect(strip(surface)).toContain("data-solo-vibe-studio-launcher");
    expect(strip(surface)).toMatch(/only once a supported provider records/i);
  });
});

describe("§9 / §59 — scope is enforced where it has to be", () => {
  it("reads through the same function PAIGE reads, not a second query over tenants", () => {
    const body = strip(adapter);
    expect((body.match(/get_social_presence_evidence/g) ?? []).length).toBeGreaterThan(0);
    // A second read of tenants.features here would be a source that can disagree with PAIGE's.
    expect(body).not.toMatch(/from\(["']tenants["']\)/);
  });

  it("never sends a tenant to the read, and sends only a refusal-tenant to the write", () => {
    const body = strip(adapter);
    expect(body).toMatch(/rpc\(\s*["']get_social_presence_evidence["']\s*as never,\s*\{\}/);
    expect(body).toContain("_expected_tenant_id: activeTenantId");
  });

  it("refuses rows that name another workspace", () => {
    expect(strip(adapter)).toMatch(/row\.tenant_id && row\.tenant_id !== activeTenantId/);
    expect(strip(chatEvidence)).toContain("wrong_workspace");
  });

  it("gates the write in the function body, not on the grant", () => {
    const body = strip(migration);
    expect(body).toContain("is_tenant_admin(_tenant)");
    expect(body).toContain("_expected_tenant_id IS DISTINCT FROM _tenant");
    // anon must never hold EXECUTE on a DEFINER function that writes a workspace record.
    expect(body).toMatch(/REVOKE ALL ON FUNCTION public\.record_social_handles\(uuid, jsonb\) FROM PUBLIC/);
    expect(body).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_social_handles\(uuid, jsonb\) TO authenticated/);
    expect(body).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.record_social_handles[^;]*anon/);
  });

  it("merges one key so sibling feature flags survive the write", () => {
    const body = strip(migration);
    expect(body).toContain("jsonb_build_object('social_handles', _clean)");
    // A whole-object assignment would clobber __feature_flag_owners and system_workspace.
    expect(body).not.toMatch(/SET features = _handles/);
  });

  it("returns the resolved workspace on every row of the read, including refusals", () => {
    const body = strip(migration);
    expect(body).toContain("tenant_id uuid");
    expect((body.match(/not permitted for this account/g) ?? []).length).toBe(1);
  });
});

describe("the Spine capability", () => {
  it("declares the read as read-only with no approval authority", () => {
    expect(spine).toContain('key: "social.presence"');
    expect(spine).toContain('adapter: "public.get_social_presence_evidence"');
    expect(spine).toContain('classification: "read"');
    expect(spine).toContain('riskPolicyKey: "read_only"');
    expect(spine).toContain('approvalAuthority: "none"');
  });

  it("is registered, so the registry validator actually sees it", () => {
    const registry = read("supabase/functions/_shared/paige-spine/registry.ts");
    expect(registry).toContain("SOCIAL_PRESENCE");
    expect(registry).toMatch(/PAIGE_SPINE_CAPABILITIES = \[[^\]]*SOCIAL_PRESENCE/);
  });

  it("tells the model the one wrong conclusion it could otherwise draw", () => {
    // Rows alone would let a model infer that an account on record is one it can post to.
    expect(chatEvidence).toMatch(/No account is connected/);
    expect(chatEvidence).toMatch(/nothing here is authorised to publish/i);
  });
});

describe("shell contract — this tab may not break the five beside it", () => {
  it("renders no masthead, which the six-tab suite asserts on every tab", () => {
    expect(strip(surface)).not.toContain("PageHead");
    expect(strip(surface)).not.toContain("pg-hd");
  });

  it("declares no tab role, which would be counted by the six-tab assertion", () => {
    expect(strip(surface)).not.toMatch(/role="tab(list)?"/);
  });

  it("keeps its styles out of the frozen campaigns stylesheet", () => {
    const campaigns = read("src/solo/solo-campaigns.css");
    expect(campaigns).not.toContain(".social-");
    // Both §28 markers must still be there, and the two byte-exact overflow rules with them.
    expect(campaigns).toContain("APPROVED-FROZEN (§28)");
    expect(campaigns).toContain("overflow-x: clip");
    expect(campaigns).toContain("overflow-x:clip");
  });

  it("uses tokens only for every palette colour, and never the non-existent --danger", () => {
    // Mask declarations are excluded deliberately: a CSS mask needs an opaque stop, and #000 there
    // is an alpha channel rather than a colour anyone sees. Everything a person perceives as colour
    // must be a token, so the theme flip reaches all of it (§23).
    // Comments are stripped first, for the same reason every other static assertion here strips
    // them: the stylesheet's own header explains that `--danger` does not exist in this shell, and
    // a guard that its explanation trips is a guard that punishes documentation.
    const palette = strip(css).replace(/^\s*(-webkit-)?mask:.*$/gm, "");
    const hex = palette.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hex, `hardcoded colours: ${hex.join(", ")}`).toEqual([]);
    expect(palette).not.toContain("--danger");
  });

  it("spends gold on the act and leaves focus rings indigo", () => {
    expect(css).toMatch(/focus-visible \{[^}]*outline: 2px solid var\(--violet\)/);
    // The only gold in a resting position is the mark and the signature, never a card border.
    expect(css).not.toMatch(/border: 1px solid var\(--gold\)/);
  });

  it("writes its own reduced-motion and forced-colors fallbacks", () => {
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("forced-colors");
    expect(css).toMatch(/prefers-reduced-motion[\s\S]{0,200}social-orb-ring \{ animation: none/);
  });

  it("gives every grid child a min-width so one long handle cannot blow out the column", () => {
    for (const selector of [".social-page > *", ".social-hero-top > *", ".social-grid > *"]) {
      expect(css, `${selector} needs min-width:0`).toContain(selector);
    }
    expect((css.match(/min-width: 0/g) ?? []).length).toBeGreaterThan(6);
  });
});
