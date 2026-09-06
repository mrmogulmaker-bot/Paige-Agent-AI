// §32 browser smoke for the PROMOTED production engine (src/solo/mind-orb/engine.ts) driven through
// the same factory the app uses. Proves createMindOrb() actually renders (the unit tests run in jsdom
// with no WebGL, so this is the only place the real factory + three pipeline is exercised).
import { createMindOrb } from "../../../src/solo/mind-orb/engine";
import { buildMindDomains, buildOrbNodes, buildOrbRings, type MindSignalState } from "../../../src/solo/mind-orb/mindDomains";

const PALETTE: Record<MindSignalState, number> = {
  owner_confirmed: 0xd4a752, connection_sourced: 0x9b8de0, source_refreshed: 0x8fa9c4,
  needs_confirmation: 0x8fd1ae, legacy_sourced: 0xedc17f, unavailable: 0xeda093,
};
const resolve = (s: MindSignalState) => PALETTE[s];

const domains = buildMindDomains({
  knowledge: [
    { id: "d1", title: "Onboarding playbook", chunkCount: 12, when: "4d ago" },
    { id: "d2", title: "Service agreement", chunkCount: 1, when: "6d ago" },
  ],
  n8n: {
    api: { words: "API connected.", action: "none", lastSuccessfulCheck: "2d ago", actionNeeded: false, detail: "Workflow count: 3." },
    mcp: { words: "Tools pending.", action: "approve", lastSuccessfulCheck: null, actionNeeded: true, detail: "Approved tools: 0." },
  },
  approvals: [{ id: "a1", title: "Approve dunning sequence", dept: "Finance", type: "dunning", aging: "today" }],
});
const nodes = buildOrbNodes(domains, resolve);
const rings = buildOrbRings(resolve);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__mindSmoke = { createMindOrb, nodes, rings };
