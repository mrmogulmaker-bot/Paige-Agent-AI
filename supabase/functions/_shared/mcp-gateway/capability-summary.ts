// Server-generated, MODEL-SAFE capability summary (Phase S).
//
// The tension this resolves (review §5.4 / owner non-negotiable #4): Paige must be able to
// REASON about what a connection can do, but a provider's raw tool descriptions and input
// schemas must NEVER reach the model (prompt-injection defense). So the server produces a
// sanitized summary — grammar-constrained tool names, a CLOSED effect vocabulary, bounded
// app/action labels, counts, and an operator-approved human label — and that is all the model
// ever sees. Raw provider prose and schemas stay inside `../mcp-client.ts` and never transit.

import type { McpToolFingerprint } from "../mcp-client.ts";
import type { CapabilityEffect, CapabilitySummary, SafeCapability } from "./types.ts";

const EFFECTS: readonly CapabilityEffect[] = ["read", "create", "update", "send", "delete"];
// The same identifier grammar the DB enforces on approved capability names (20261015000000).
const NAME_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

function safeEffects(raw: readonly string[] | undefined): CapabilityEffect[] {
  if (!Array.isArray(raw)) return [];
  const out = raw.filter((e): e is CapabilityEffect => (EFFECTS as readonly string[]).includes(e));
  return [...new Set(out)].sort();
}

// `app` and `actionType` come from provider `_meta` and DO reach the model, so they are a
// residual injection channel. Keep only a conservative, printable label charset (letters,
// digits, and a few separators) and bound the length; anything else is dropped. This is
// stricter than a raw slice: a provider cannot smuggle prose/newlines/control bytes through.
function sanitizeLabel(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[^A-Za-z0-9 ._:/@+-]/g, "").trim().slice(0, max);
}

/**
 * Reduce discovered tool fingerprints to the model-safe capability shape. Any tool whose name
 * is not a clean identifier is DROPPED rather than sanitized-in-place — a name that is not an
 * identifier is not a tool the model should be told about (it is the injection surface the DB
 * grammar exists to refuse). `description` and the input schema are never read here.
 */
export function toSafeCapabilities(
  tools: readonly McpToolFingerprint[],
  approvedNames: ReadonlySet<string>,
): SafeCapability[] {
  const out: SafeCapability[] = [];
  for (const t of tools) {
    if (!t || typeof t.name !== "string" || !NAME_RE.test(t.name)) continue;
    out.push({
      name: t.name,
      effects: safeEffects(t.effects),
      app: sanitizeLabel(t.app, 100),
      actionType: sanitizeLabel(t.actionType, 80),
      approved: approvedNames.has(t.name),
    });
  }
  return out;
}

/** Build the whole-connection summary the model may reason over. */
export function buildCapabilitySummary(input: {
  connectionId: string;
  providerKey: string;
  label: string;
  tools: readonly McpToolFingerprint[];
  approvedNames: ReadonlySet<string>;
  observedAt: string | null;
}): CapabilitySummary {
  const capabilities = toSafeCapabilities(input.tools, input.approvedNames);
  return {
    connectionId: input.connectionId,
    providerKey: input.providerKey,
    // The label is operator/registry-supplied; if somehow empty, fall back to the provider key,
    // never to a provider-authored string.
    label: input.label && input.label.trim() ? input.label.slice(0, 120) : input.providerKey,
    toolCount: capabilities.length,
    approvedCount: capabilities.filter((c) => c.approved).length,
    capabilities,
    observedAt: input.observedAt,
  };
}

/**
 * Belt-and-suspenders guard: prove a summary carries no raw provider prose or schema before it
 * is handed to a model. Returns the offending path, or null when clean. A caller that is about
 * to serialize a summary into a prompt asserts this first.
 */
export function findUnsafeField(summary: CapabilitySummary): string | null {
  const banned = ["description", "inputschema", "input_schema", "schema", "properties"];
  const walk = (v: unknown, path: string): string | null => {
    if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (banned.includes(k.toLowerCase())) return `${path}.${k}`;
        const hit = walk(val, `${path}.${k}`);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(summary, "summary");
}
