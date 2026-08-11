#!/usr/bin/env node
// scripts/skills-s58-harness.mjs — Skills Wave S1 §58 automation (Slice 1 baseline + Slice 3 diff).
//
// WHAT IT DOES
//   --capture : fires each fixture skill via the DEPLOYED skill-runner and writes its exact output to
//               tests/fixtures/skills-s58-baseline/<slug>/output.json  (Slice 1 — the automated §58 baseline).
//   --diff    : fires each of the 4 shipped skills TWO ways — bespoke handler (force_interpreter:false)
//               vs the generic interpreter (force_interpreter:true) — and reports a per-skill diff
//               (Slice 3 — the §58 parity proof: byte-identical is required before the interpreter may
//               replace a bespoke handler for that skill; a diff is EXPECTED for external_send skills,
//               whose interpreter path files an approval instead of sending — Fork-2 doctrine).
//
// HONESTY (§13/§32.c): this hits the LIVE edge function, so it needs real credentials. It is meant to
// run from a session/CI that HAS them (Cowork, a CI job, or the owner) — a headless remote CC session
// does NOT, and must NOT claim it ran. With no creds it prints exactly what's missing and exits 2 —
// never a fabricated pass. Fixture inputs referencing real contact/business ids are placeholders the
// operator fills before --capture/--diff for the contact-bound skills (research_to_concept_brief is
// self-contained and runs as-is).
//
// ENV: SUPABASE_URL (or SKILL_RUNNER_URL) + SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "..", "tests", "fixtures", "skills-s58-baseline");
const SHIPPED = ["verify_business_sos", "research_to_concept_brief", "build_game_plan", "draft_and_email_document"];

const mode = process.argv.includes("--diff") ? "diff" : process.argv.includes("--capture") ? "capture" : null;
if (!mode) {
  console.error("Usage: node scripts/skills-s58-harness.mjs [--capture | --diff]");
  process.exit(2);
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SKILL_RUNNER_BASE || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const RUNNER_URL = process.env.SKILL_RUNNER_URL || (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/skill-runner` : "");
if (!RUNNER_URL || !SERVICE_KEY) {
  console.error("§13 honest stop — missing credentials. This harness hits the LIVE skill-runner and needs:");
  console.error("  SUPABASE_URL (or SKILL_RUNNER_URL) and SUPABASE_SERVICE_ROLE_KEY");
  console.error("Run it from a session/CI that has them (Cowork, CI, or the owner). Nothing was fired.");
  process.exit(2);
}

async function runSkill(slug, inputs, extra = {}) {
  const res = await fetch(RUNNER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ skill_slug: slug, invoker_kind: "system", ...inputs, ...extra }),
  });
  let body;
  try { body = await res.json(); } catch { body = { _unparseable: true }; }
  return { http_status: res.status, body };
}

function loadInput(slug) {
  const p = join(FIXTURES, slug, "input.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

function stableOutput(o) {
  // Strip run-varying fields so the §58 diff compares the DELIVERABLE, not the run id / timestamps.
  const b = o?.body ?? {};
  return JSON.stringify({ status: b.status, outputs: scrub(b.outputs), error: b.error ?? null }, null, 2);
}
function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (["run_id", "approval_id", "resend_id", "id", "created_at", "duration_ms"].includes(k)) { out[k] = "<scrubbed>"; continue; }
      out[k] = scrub(val);
    }
    return out;
  }
  return v;
}

if (mode === "capture") {
  const slugs = readdirSync(FIXTURES).filter((d) => existsSync(join(FIXTURES, d, "input.json")));
  console.log(`Slice 1 — capturing §58 baselines for ${slugs.length} skill(s): ${slugs.join(", ")}`);
  for (const slug of slugs) {
    const input = loadInput(slug);
    const out = await runSkill(slug, input);
    const dir = join(FIXTURES, slug);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "output.json"), JSON.stringify(out, null, 2) + "\n");
    console.log(`  ${slug}: http ${out.http_status}, status=${out.body?.status ?? "?"} → output.json`);
  }
  console.log("Done. Commit the output.json files as the automated §58 baseline.");
}

if (mode === "diff") {
  console.log("Slice 3 — bespoke vs interpreter parity diff (byte-identical required to replace a handler):\n");
  let anyDiff = false;
  for (const slug of SHIPPED) {
    const input = loadInput(slug);
    if (!input) { console.log(`  ${slug}: SKIP (no fixture input.json)`); continue; }
    const bespoke = await runSkill(slug, input, { force_interpreter: false });
    const interp = await runSkill(slug, input, { force_interpreter: true });
    const a = stableOutput(bespoke), b = stableOutput(interp);
    const identical = a === b;
    if (!identical) anyDiff = true;
    console.log(`  ${slug}: ${identical ? "✅ byte-identical" : "⚠ DIFFERS (expected for external_send → approval path; file a per-skill parity follow-up)"}`);
    if (!identical) {
      console.log(`    bespoke:     ${a.replace(/\n/g, " ").slice(0, 200)}`);
      console.log(`    interpreter: ${b.replace(/\n/g, " ").slice(0, 200)}`);
    }
  }
  console.log(`\n${anyDiff ? "Some skills differ — see notes above (Fork-2: bespoke stays until parity)." : "All shipped skills byte-identical through the interpreter."}`);
}
