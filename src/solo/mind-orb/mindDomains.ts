// mindDomains — the honest reconciliation from Mind's REAL read contracts onto the owner-approved
// six-domain orb (§28 design) and its source-signal states. Pure and deterministic so the honesty
// rules are unit-testable in isolation (§13/§70): a node/record only ever exists because a real
// source produced it; a domain with no live hook renders an honest ABSENCE, never invented data.
//
// Approved domains + geometry (az/el) and the source-signal palette are ported verbatim from the
// approved prototype (docs/prototypes/command-center-mind-gate1.*). §00: this ports the approved
// design, it does not invent one.

import type { MindOrbNode, MindOrbRing } from "./engine";

export type MindDomainKey = "identity" | "people" | "goals" | "systems" | "knowledge" | "offers";

// Canonical source-signal states (the approved legend). Colour is resolved from a --sig-* token at
// render time by the caller; this module never hard-codes a colour.
export type MindSignalState =
  | "owner_confirmed"
  | "connection_sourced"
  | "source_refreshed"
  | "needs_confirmation"
  | "legacy_sourced"
  | "unavailable";

export type MindTruth = "LIVE SOURCE" | "PARTIAL" | "UNAVAILABLE" | "PROPOSED";
export type MindVerdict = "LIVE" | "PARTIAL" | "UNAVAILABLE";

export const SIGNAL_TOKEN: Record<MindSignalState, string> = {
  owner_confirmed: "--sig-confirmed",
  connection_sourced: "--sig-connection",
  source_refreshed: "--sig-refreshed",
  needs_confirmation: "--sig-needs",
  legacy_sourced: "--sig-legacy",
  unavailable: "--sig-unavailable",
};

export const SIGNAL_LABEL: Record<MindSignalState, string> = {
  owner_confirmed: "Owner-confirmed",
  connection_sourced: "Connection-sourced",
  source_refreshed: "Source refreshed",
  needs_confirmation: "Needs confirmation",
  legacy_sourced: "Legacy record",
  unavailable: "Unavailable",
};

// Truth badge (drawer/list) derived from the canonical state — never set independently.
export function truthForState(state: MindSignalState): MindTruth {
  switch (state) {
    case "owner_confirmed":
    case "connection_sourced":
    case "source_refreshed":
      return "LIVE SOURCE";
    case "needs_confirmation":
      return "PARTIAL";
    case "legacy_sourced":
      return "PROPOSED";
    case "unavailable":
      return "UNAVAILABLE";
  }
}

export interface MindDomainDef {
  key: MindDomainKey;
  name: string;
  az: number;
  el: number;
}

// Hub directions ported verbatim from the approved prototype's DOMAINS.
export const MIND_DOMAINS: readonly MindDomainDef[] = [
  { key: "identity", name: "Business context", az: -0.55, el: 0.62 },
  { key: "people", name: "Client relationships", az: -2.4, el: 0.05 },
  { key: "goals", name: "Operating decisions", az: -1.5, el: -0.75 },
  { key: "systems", name: "Connected sources", az: 1.1, el: 0.35 },
  { key: "knowledge", name: "Knowledge resources", az: 2.2, el: -0.25 },
  { key: "offers", name: "Offers & services", az: 0.2, el: -0.95 },
];

export interface MindRecord {
  id: string;
  domain: MindDomainKey;
  state: MindSignalState;
  truth: MindTruth;
  title: string;
  summary: string;
  source: string;
  when: string;
  evidence: string;
  owner: string;
}

export interface MindDomainModel {
  def: MindDomainDef;
  verdict: MindVerdict;
  records: MindRecord[];
  // Honest absence copy for a domain with a source/seam but nothing on file (or no hook yet).
  empty?: { heading: string; body: string };
}

// ---- Normalised inputs (already tenant-scoped by the caller's hooks; this module adds no data) ----

export interface KnowledgeDocInput {
  id: string;
  title: string;
  summary?: string | null;
  source?: string | null;
  when?: string | null;
  createdAt?: string | null;
  chunkCount?: number | null;
  domain?: string | null;
}

export interface N8nChannelInput {
  words: string; // human copy already resolved by the caller (N8N_*_WORDS)
  action: string; // action words already resolved
  lastSuccessfulCheck?: string | null;
  actionNeeded?: boolean;
  detail: string; // caller-composed evidence sentence
}

export interface N8nInput {
  api: N8nChannelInput;
  mcp: N8nChannelInput;
}

export interface ApprovalInput {
  id: string;
  title: string;
  dept: string;
  type?: string | null;
  aging: string;
}

export interface MindInputs {
  knowledge: KnowledgeDocInput[];
  n8n: N8nInput | null;
  approvals: ApprovalInput[];
}

function n8nState(channel: N8nChannelInput): MindSignalState {
  if (channel.actionNeeded) return "needs_confirmation";
  if (channel.lastSuccessfulCheck) return "source_refreshed";
  return "connection_sourced";
}

/**
 * Reconcile the real read contracts onto the six approved domains.
 * - knowledge  ← tenant_knowledge_docs (owner-indexed) — LIVE
 * - systems    ← n8n readiness (Connected sources; status only) — LIVE
 * - goals      ← pending approvals (Operating decisions) — LIVE
 * - identity   ← business_context.readiness — NO frontend hook yet → honest absence
 * - people     ← governed memory — NO frontend hook yet → honest absence
 * - offers     ← catalog lives in Campaigns → honest UNAVAILABLE
 *
 * Systems Check findings are DELIBERATELY not surfaced here (§58 approved boundary — they live in the
 * Systems Check subtab). This function never invents a record: empty inputs yield empty domains.
 */
export function buildMindDomains(inputs: MindInputs): MindDomainModel[] {
  const byKey = new Map<MindDomainKey, MindDomainModel>();
  for (const def of MIND_DOMAINS) byKey.set(def.key, { def, verdict: "PARTIAL", records: [] });

  // Knowledge resources — LIVE owner-indexed documents.
  const knowledge = byKey.get("knowledge")!;
  knowledge.records = inputs.knowledge.map((doc) => ({
    id: `knowledge:${doc.id}`,
    domain: "knowledge" as const,
    state: "owner_confirmed" as const,
    truth: "LIVE SOURCE" as const,
    title: doc.title,
    summary: doc.summary || "Indexed document metadata.",
    source: doc.source || "PAIGE Knowledge",
    when: doc.when || doc.createdAt || "Recently indexed",
    evidence: `${doc.chunkCount ?? 0} indexed chunk${doc.chunkCount === 1 ? "" : "s"}${doc.domain ? ` · ${doc.domain}` : ""}`,
    owner: "PAIGE Knowledge",
  }));
  knowledge.verdict = knowledge.records.length ? "LIVE" : "PARTIAL";
  if (!knowledge.records.length) {
    knowledge.empty = {
      heading: "No indexed knowledge yet",
      body: "Add a knowledge document and PAIGE will index it here. Nothing is invented to fill the space.",
    };
  }

  // Connected sources — LIVE n8n readiness (current status only, not Rail history).
  const systems = byKey.get("systems")!;
  if (inputs.n8n) {
    const mk = (id: string, title: string, channel: N8nChannelInput): MindRecord => {
      const state = n8nState(channel);
      return {
        id,
        domain: "systems",
        state,
        truth: truthForState(state),
        title,
        summary: channel.words,
        source: "Integrations · current connection record",
        when: channel.lastSuccessfulCheck ? `Last successful check: ${channel.lastSuccessfulCheck}` : "No successful check proven",
        evidence: channel.detail,
        owner: "Solo Integrations",
      };
    };
    systems.records = [
      mk("systems:n8n-api", "n8n API connection", inputs.n8n.api),
      mk("systems:n8n-mcp", "n8n Paige tools (MCP)", inputs.n8n.mcp),
    ];
    systems.verdict = "LIVE";
  } else {
    systems.verdict = "PARTIAL";
    systems.empty = {
      heading: "Connection status not read yet",
      body: "PAIGE reads the current state of your connected tools here — not their history. Nothing is shown until a source reports.",
    };
  }

  // Operating decisions — LIVE pending approvals (the actionable queue itself stays in Systems Check).
  const goals = byKey.get("goals")!;
  goals.records = inputs.approvals.map((approval) => ({
    id: `decision:${approval.id}`,
    domain: "goals" as const,
    state: "needs_confirmation" as const,
    truth: "PARTIAL" as const,
    title: approval.title,
    summary: "A current decision awaiting you. The actionable queue lives in Systems Check.",
    source: "Waiting on you",
    when: approval.aging,
    evidence: `${approval.dept}${approval.type ? ` · ${approval.type}` : ""} · current pending item`,
    owner: "Systems Check decision queue",
  }));
  goals.verdict = goals.records.length ? "LIVE" : "PARTIAL";
  if (!goals.records.length) {
    goals.empty = {
      heading: "No decisions waiting",
      body: "Operating decisions PAIGE surfaces for you appear here. A governed store exists; nothing is on file yet.",
    };
  }

  // Business context — governed readiness exists server-side but has no frontend hook yet.
  byKey.get("identity")!.empty = {
    heading: "Business context not wired yet",
    body: "PAIGE can hold your confirmed business basics here. The governed store exists; nothing reads it into this view yet, so nothing is shown.",
  };

  // Client relationships — governed memory store exists; nothing writes to it from Mind/chat yet.
  byKey.get("people")!.empty = {
    heading: "Governed store exists · nothing on file yet",
    body: "Canonical people and relationships live in Clients. A governed memory seam can hold context on top, but nothing writes to it yet.",
  };

  // Offers & services — the catalog is real but lives in Campaigns, not as a governed fact.
  const offers = byKey.get("offers")!;
  offers.verdict = "UNAVAILABLE";
  offers.empty = {
    heading: "Not on file as knowledge yet",
    body: "PAIGE has no confirmed record of your offers. Your catalog is real, but it lives in Campaigns and isn't a governed fact yet.",
  };

  return MIND_DOMAINS.map((def) => byKey.get(def.key)!);
}

export function allRecords(domains: MindDomainModel[]): MindRecord[] {
  return domains.flatMap((d) => d.records);
}

// ---- Orb geometry (ported verbatim from the approved prototype's engine glue) ----

function hash(value: string): number {
  let out = 2166136261;
  for (let i = 0; i < value.length; i += 1) out = Math.imul(out ^ value.charCodeAt(i), 16777619);
  return out >>> 0;
}

function sph(az: number, el: number) {
  const ce = Math.cos(el);
  return { x: ce * Math.sin(az), y: Math.sin(el), z: ce * Math.cos(az) };
}

function spread(dir: { x: number; y: number; z: number }, rad: number, seed: number) {
  const a = (seed % 360) / 57.29;
  const b = ((seed >>> 9) % 100) / 100 * rad;
  const t1 = { x: -dir.z, y: 0, z: dir.x };
  const len = Math.hypot(t1.x, t1.z) || 1;
  t1.x /= len;
  t1.z /= len;
  const t2 = {
    x: dir.y * t1.z - dir.z * t1.y,
    y: dir.z * t1.x - dir.x * t1.z,
    z: dir.x * t1.y - dir.y * t1.x,
  };
  const s = Math.sin(b);
  const c = Math.cos(b);
  const ox = Math.cos(a) * t1.x + Math.sin(a) * t2.x;
  const oy = Math.cos(a) * t1.y + Math.sin(a) * t2.y;
  const oz = Math.cos(a) * t1.z + Math.sin(a) * t2.z;
  return { x: dir.x * c + ox * s, y: dir.y * c + oy * s, z: dir.z * c + oz * s };
}

// Extend the engine's node/ring contracts so these feed MindOrbCanvas directly (the engine's
// `[k: string]: unknown` index signature lets us attach `record` and it survives onPick untouched).
export interface MindOrbNodeLite extends MindOrbNode {
  domain: MindDomainKey;
  record?: MindRecord;
}

export type MindOrbRingLite = MindOrbRing;

/**
 * Build orb nodes from the reconciled domains. `resolveColor(state)` maps a signal state to a hex int
 * (the caller resolves the --sig-* token in the current theme). Hub node per domain, one record node
 * per real record, and — only for a domain with NO records — two faint ghost satellites so an empty
 * hub reads as present-but-sparse (ghosts carry no record and are non-interactive).
 */
export function buildOrbNodes(
  domains: MindDomainModel[],
  resolveColor: (state: MindSignalState) => number,
): MindOrbNodeLite[] {
  const nodes: MindOrbNodeLite[] = [];
  for (const domain of domains) {
    const hubDir = sph(domain.def.az, domain.def.el);
    const hubState: MindSignalState =
      domain.verdict === "UNAVAILABLE"
        ? "unavailable"
        : domain.records[0]?.state ?? "needs_confirmation";
    nodes.push({
      id: `hub:${domain.def.key}`,
      domain: domain.def.key,
      hub: true,
      label: domain.def.name,
      colorHex: resolveColor(hubState),
      dir: hubDir,
    });
    domain.records.forEach((record, index) => {
      const seed = hash(`${domain.def.key}:${record.id}`);
      nodes.push({
        id: record.id,
        domain: domain.def.key,
        label: record.title,
        colorHex: resolveColor(record.state),
        dir: spread(hubDir, 0.34 + (seed % 40) / 100, seed >>> 6),
        record,
      });
    });
    // Ghost satellites make an empty-but-live/partial hub read as present-but-sparse. An UNAVAILABLE
    // domain gets NONE: a "pending" (needs_confirmation-coloured) satellite around an "unavailable"
    // hub reads as "items awaiting you" when the honest truth is there is genuinely nothing on file
    // (§13/§70). An unavailable hub therefore stands alone.
    if (!domain.records.length && domain.verdict !== "UNAVAILABLE") {
      for (let i = 0; i < 2; i += 1) {
        const seed = hash(`${domain.def.key}:ghost:${i}`);
        nodes.push({
          id: `ghost:${domain.def.key}:${i}`,
          domain: domain.def.key,
          ghost: true,
          label: "",
          colorHex: resolveColor("needs_confirmation"),
          dir: spread(hubDir, 0.28, seed >>> 3),
        });
      }
    }
  }
  return nodes;
}

export function buildOrbRings(resolveColor: (state: MindSignalState) => number): MindOrbRingLite[] {
  return [
    { tilt: 0.42, spin: 0.06, color: resolveColor("owner_confirmed"), a: 0.5 },
    { tilt: -0.7, spin: -0.045, color: resolveColor("connection_sourced"), a: 0.42 },
    { tilt: 1.15, spin: 0.03, color: resolveColor("source_refreshed"), a: 0.4 },
    { tilt: 0.05, spin: -0.08, color: resolveColor("needs_confirmation"), a: 0.34 },
  ];
}
