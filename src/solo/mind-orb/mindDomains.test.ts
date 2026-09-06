import { describe, expect, it } from "vitest";
import {
  buildMindDomains,
  buildOrbNodes,
  buildOrbRings,
  allRecords,
  truthForState,
  MIND_DOMAINS,
  type MindInputs,
  type MindSignalState,
} from "./mindDomains";

const EMPTY: MindInputs = { knowledge: [], n8n: null, approvals: [] };

const FULL: MindInputs = {
  knowledge: [
    { id: "doc1", title: "Onboarding playbook.pdf", summary: "How we onboard.", source: "Upload", when: "4d ago", chunkCount: 12, domain: "Operations" },
    { id: "doc2", title: "Service agreement", chunkCount: 1 },
  ],
  n8n: {
    api: { words: "API connected.", action: "No action needed.", lastSuccessfulCheck: "2d ago", actionNeeded: false, detail: "Workflow count: 3." },
    mcp: { words: "Tools pending.", action: "Approve tools.", lastSuccessfulCheck: null, actionNeeded: true, detail: "Approved tools: 0." },
  },
  approvals: [
    { id: "a1", title: "Approve the March dunning sequence", dept: "Finance", type: "dunning", aging: "today" },
  ],
};

const byKey = (inputs: MindInputs) => {
  const map = new Map(buildMindDomains(inputs).map((d) => [d.def.key, d]));
  return map;
};

describe("buildMindDomains — reconciliation", () => {
  it("returns exactly the six approved domains, in the approved order", () => {
    const domains = buildMindDomains(EMPTY);
    expect(domains.map((d) => d.def.key)).toEqual([
      "identity", "people", "goals", "systems", "knowledge", "offers",
    ]);
  });

  it("maps knowledge docs to the Knowledge domain as owner-confirmed LIVE records", () => {
    const knowledge = byKey(FULL).get("knowledge")!;
    expect(knowledge.verdict).toBe("LIVE");
    expect(knowledge.records).toHaveLength(2);
    expect(knowledge.records[0]).toMatchObject({
      domain: "knowledge", state: "owner_confirmed", truth: "LIVE SOURCE", id: "knowledge:doc1",
    });
    // singular/plural chunk copy is honest
    expect(knowledge.records[1].evidence).toContain("1 indexed chunk");
    expect(knowledge.records[0].evidence).toContain("12 indexed chunks");
  });

  it("maps n8n readiness to Connected sources (status only), never Rail history", () => {
    const systems = byKey(FULL).get("systems")!;
    expect(systems.verdict).toBe("LIVE");
    expect(systems.records.map((r) => r.id)).toEqual(["systems:n8n-api", "systems:n8n-mcp"]);
    // action-needed channel is needs_confirmation; a checked channel is source_refreshed
    expect(systems.records[0].state).toBe("source_refreshed");
    expect(systems.records[1].state).toBe("needs_confirmation");
  });

  it("maps approvals to Operating decisions and points the actionable queue at Systems Check", () => {
    const goals = byKey(FULL).get("goals")!;
    expect(goals.records).toHaveLength(1);
    expect(goals.records[0]).toMatchObject({ domain: "goals", state: "needs_confirmation", id: "decision:a1" });
    expect(goals.records[0].summary.toLowerCase()).toContain("systems check");
  });

  it("§58: NEVER surfaces Systems Check findings as Mind records (they live in the Systems Check subtab)", () => {
    // Even with rich inputs, no record id is a finding and nothing claims a Systems Check finding source.
    const records = allRecords(buildMindDomains(FULL));
    expect(records.some((r) => r.id.startsWith("finding:"))).toBe(false);
    expect(records.some((r) => /systems check (finding|snapshot)/i.test(r.source))).toBe(false);
  });

  it("§13/§70: invents NO records when every source is empty — only honest absences", () => {
    const domains = buildMindDomains(EMPTY);
    expect(allRecords(domains)).toHaveLength(0);
    for (const d of domains) {
      expect(d.records).toHaveLength(0);
      expect(d.empty).toBeTruthy(); // every empty domain states its honest absence
    }
  });

  it("keeps not-yet-wired domains honest: identity/people show an absence, offers is UNAVAILABLE", () => {
    const map = byKey(FULL);
    expect(map.get("identity")!.empty?.body).toMatch(/no frontend|nothing reads it|governed store/i);
    expect(map.get("people")!.empty?.body).toMatch(/governed|clients/i);
    const offers = map.get("offers")!;
    expect(offers.verdict).toBe("UNAVAILABLE");
    expect(offers.empty?.body).toMatch(/campaigns/i);
  });
});

describe("truthForState", () => {
  const cases: Array<[MindSignalState, string]> = [
    ["owner_confirmed", "LIVE SOURCE"],
    ["connection_sourced", "LIVE SOURCE"],
    ["source_refreshed", "LIVE SOURCE"],
    ["needs_confirmation", "PARTIAL"],
    ["legacy_sourced", "PROPOSED"],
    ["unavailable", "UNAVAILABLE"],
  ];
  it.each(cases)("maps %s -> %s", (state, truth) => {
    expect(truthForState(state)).toBe(truth);
  });
});

describe("buildOrbNodes — geometry + honesty", () => {
  const resolve = (state: MindSignalState) => (state === "unavailable" ? 0x111111 : 0xabcdef);

  it("emits one hub per domain and one node per real record (deterministic dir vectors)", () => {
    const domains = buildMindDomains(FULL);
    const nodes = buildOrbNodes(domains, resolve);
    const hubs = nodes.filter((n) => n.hub);
    expect(hubs).toHaveLength(6);
    // each real record has a node carrying its record ref back for onPick
    const recordNodes = nodes.filter((n) => n.record);
    expect(recordNodes).toHaveLength(allRecords(domains).length);
    expect(recordNodes.every((n) => n.record && n.id === n.record.id)).toBe(true);
    // dir vectors are finite unit-ish vectors, deterministic
    const again = buildOrbNodes(buildMindDomains(FULL), resolve);
    expect(nodes.map((n) => n.dir)).toEqual(again.map((n) => n.dir));
    expect(nodes.every((n) => Number.isFinite(n.dir.x) && Number.isFinite(n.dir.y) && Number.isFinite(n.dir.z))).toBe(true);
  });

  it("adds ghost satellites ONLY to empty domains, and ghosts carry no record", () => {
    const domains = buildMindDomains(EMPTY);
    const nodes = buildOrbNodes(domains, resolve);
    const ghosts = nodes.filter((n) => n.ghost);
    // 6 empty domains x 2 ghosts
    expect(ghosts).toHaveLength(12);
    expect(ghosts.every((n) => !n.record)).toBe(true);
    // a populated domain gets no ghosts
    const knowledgeNodes = buildOrbNodes(buildMindDomains(FULL), resolve).filter((n) => n.domain === "knowledge");
    expect(knowledgeNodes.some((n) => n.ghost)).toBe(false);
  });

  it("buildOrbRings resolves four per-signal rings", () => {
    const rings = buildOrbRings(resolve);
    expect(rings).toHaveLength(4);
    expect(rings.every((r) => Number.isFinite(r.color) && r.a > 0)).toBe(true);
  });
});

describe("MIND_DOMAINS", () => {
  it("carries the six approved names", () => {
    expect(MIND_DOMAINS.map((d) => d.name)).toEqual([
      "Business context", "Client relationships", "Operating decisions",
      "Connected sources", "Knowledge resources", "Offers & services",
    ]);
  });
});
