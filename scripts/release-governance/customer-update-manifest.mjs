import fs from "node:fs";
import path from "node:path";
import { compileCanonicalReleaseSchema, validateReleaseRecord, validateReleaseRecordSet } from "../ci/release-governance-lint.mjs";

const TECHNICAL_COPY = /\b(?:commit|sha|deployment(?:\s+id)?|migration|edge\s+function|vercel|supabase|github|provider(?:\s+name|\s+id)?|dpl_[a-z0-9_-]+)\b|\b[0-9a-f]{40}\b/i;

function publicStrings(record) {
  const customer = record.customer_release_identity;
  const note = record.whats_new;
  return [customer.release_name, note.customer_outcome, note.what_changed, note.who_can_use_it, note.owner_action, note.known_limitations, note.safe_next_step];
}

export function resolveCustomerUpdateManifest({ records, buildId, validateCanonicalSchema, now = new Date() }) {
  if (!Array.isArray(records) || typeof validateCanonicalSchema !== "function") return null;
  if (records.some((record) => !validateCanonicalSchema(record) || validateReleaseRecord(record).length > 0)) return null;
  if (validateReleaseRecordSet(records).length > 0) return null;
  const buildMatch = /^([0-9a-f]{40})-/i.exec(String(buildId || ""));
  if (!buildMatch) return null;
  const deployedCommit = buildMatch[1].toLowerCase();
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const superseded = new Set(records.filter((record) => ["CORRECTED", "RETRACTED"].includes(record.record_state)).map((record) => record.history?.supersedes_record_id).filter(Boolean));
  const hasPublishedLineage = (record) => {
    if (record.record_state === "PUBLISHED") return true;
    const seen = new Set();
    let current = record;
    while (current?.record_state === "CORRECTED" && !seen.has(current.record_id)) {
      seen.add(current.record_id);
      current = byId.get(current.history?.supersedes_record_id);
      if (current?.record_state === "PUBLISHED") return true;
    }
    return false;
  };
  const matches = records.filter((record) => {
    if (!["PUBLISHED", "CORRECTED"].includes(record.record_state) || !hasPublishedLineage(record) || superseded.has(record.record_id)) return false;
    if (record.customer_release_identity?.owner_approval?.status !== "APPROVED" || !record.whats_new) return false;
    if (record.customer_release_identity.date > now.toISOString().slice(0, 10)) return false;
    if (publicStrings(record).some((value) => TECHNICAL_COPY.test(value))) return false;
    return record.internal_builds.some((build) => build.customer_release_scope === "referenced" && build.commit_sha.toLowerCase() === deployedCommit && build.environment === "production" && build.release_channel === "production");
  });
  if (matches.length !== 1) return null;
  const record = matches[0];
  const customer = record.customer_release_identity;
  const note = record.whats_new;
  return {
    schemaVersion: 1,
    releaseName: customer.release_name,
    version: customer.version,
    date: customer.date,
    customerOutcome: note.customer_outcome,
    whatChanged: note.what_changed,
    whoCanUseIt: note.who_can_use_it,
    ownerAction: note.owner_action,
    status: [...note.status],
    knownLimitations: note.known_limitations,
    safeNextStep: note.safe_next_step,
  };
}

export function loadCustomerUpdateManifest({ recordsDir, schemaPath, buildId, now = new Date() }) {
  try {
    if (!fs.existsSync(recordsDir)) return null;
    if (!schemaPath || !fs.existsSync(schemaPath)) return null;
    const files = fs.readdirSync(recordsDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => path.join(recordsDir, entry.name)).sort();
    const validateCanonicalSchema = compileCanonicalReleaseSchema(JSON.parse(fs.readFileSync(schemaPath, "utf8")));
    return resolveCustomerUpdateManifest({ records: files.map((file) => JSON.parse(fs.readFileSync(file, "utf8"))), buildId, validateCanonicalSchema, now });
  } catch {
    return null;
  }
}
