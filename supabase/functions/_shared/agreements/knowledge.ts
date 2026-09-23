// Remember a completed agreement, so Paige can answer what a client actually agreed to.
//
// WHAT THIS IS FOR. A tenant finishes a signature and the fact lands nowhere Paige can reach: the
// evidentiary trail is rigorous and private, the sealed PDF is bytes behind an authorising endpoint,
// and neither is retrievable in a conversation. So "what did Acme agree to?" had no answer. This
// writes a SUMMARY — who, what, when, on what terms — into the tenant's own knowledge base through
// the one ingest pipeline, where `match_tenant_knowledge` can find it.
//
// WHAT IT MUST NEVER CARRY, and this is the whole reason the field list below is explicit rather
// than a spread of the row. The knowledge base is RETRIEVABLE IN CHAT. Signer evidence is not:
// the IP address, the user agent and the drawn signature image are attribution evidence that
// belongs in the append-only trail and nowhere else — `signature_image_png` deliberately has no
// bucket object and no URL precisely so it has no second retention surface, and copying it into a
// KB chunk would re-create exactly that. Token hashes are credential material. Storage keys carry
// tenant and agreement ids into any browser that renders a citation. The raw legal body is excluded
// by ruling. None of them appear here, and the exclusion is a list you can grep this file against.
//
// A KNOWLEDGE MISS IS NOT A SEAL FAILURE. This runs after the completion has already committed and
// after the parties have been told. It returns an outcome and throws nothing at its caller, for the
// same reason `notify.ts` does: nothing about remembering an agreement is worth rolling back a
// legal record, and `sign-agreement` has no top-level catch, so an escape here would answer a
// signer with a 500 for an agreement that is genuinely, finally done.
import { ingestDoc } from "../kb-ingest-core.ts";

export type KnowledgeOutcome = {
  readonly ingested: boolean;
  /** Present whenever `ingested` is false. Always a reason, never a silence. */
  readonly reason?: string;
};

/** The one place the autonomy of this write is named. */
export const AGREEMENT_LEARN_TOOL_KEY = "agreement_learn_on_complete";

type Db = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** `YYYY-MM-DD`, or empty when there is no date rather than a fabricated one. */
function day(v: unknown): string {
  const s = text(v);
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Money, rendered by the CURRENCY'S OWN minor-unit exponent rather than a hardcoded /100.
 * This repo has already shipped and fixed that exact bug once — a hardcoded divide rendered a
 * recorded ¥500 as "5 JPY" — and a wrong number in a retrievable summary is worse than no number,
 * because Paige will state it with confidence.
 */
function money(minor: unknown, currency: unknown): string {
  const amount = typeof minor === "number" ? minor : Number(minor);
  const code = text(currency).toUpperCase() || "USD";
  if (!Number.isFinite(amount)) return "";
  try {
    const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: code });
    const exponent = fmt.resolvedOptions().maximumFractionDigits ?? 2;
    return fmt.format(amount / Math.pow(10, exponent));
  } catch {
    // An unrecognised currency code is not a reason to guess at the exponent.
    return "";
  }
}

/**
 * Who this document is filed as being authored by.
 *
 * NOT `paige_agreements.created_by`: that column is nullable, and `tenant_knowledge_docs.created_by`
 * is NOT NULL, so a null would hard-fail the insert. The actor who SENT the agreement is read from
 * the evidentiary trail instead, where a `sent` event always carries the user who sent it. If none
 * resolves, this returns null and the caller SKIPS — inventing an author or writing a placeholder
 * uuid would put a false name on a durable record to get past a constraint that is doing real work.
 *
 * (The nullable-vs-NOT NULL mismatch between the two columns is a pre-existing latent defect shared
 * with `studio-learn-from-artifact`, which passes a `created_by` that is null on its service-role
 * path. It is recorded, not fixed here.)
 */
async function senderOf(db: Db, agreementId: string): Promise<string | null> {
  const { data } = await db.from("paige_agreement_events")
    .select("actor_user_id,created_at")
    .eq("agreement_id", agreementId)
    .in("event_type", ["sent", "resent"])
    .not("actor_user_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);
  const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
  return text(row?.actor_user_id) || null;
}

/** The commercial engagement this signature sits against, when there is one. */
async function termsSentence(db: Db, commercialTermsId: string, tenantId: string): Promise<string> {
  const { data } = await db.from("tenant_client_agreements")
    .select("term_kind,billing_interval,interval_count,installments_total,payment_schedule,agreed_amount_minor,agreed_currency,starts_on,renews_on,ends_on,status")
    .eq("id", commercialTermsId).eq("tenant_id", tenantId).maybeSingle();
  const t = data as Record<string, unknown> | null;
  if (!t) return "No commercial terms are recorded against this agreement.";

  const parts: string[] = [];
  const amount = money(t.agreed_amount_minor, t.agreed_currency);
  if (amount) parts.push(amount);
  const kind = text(t.term_kind).replace(/_/g, " ");
  if (kind) parts.push(kind);
  const every = typeof t.interval_count === "number" ? t.interval_count : Number(t.interval_count);
  const unit = text(t.billing_interval);
  if (unit && unit !== "one_time") {
    parts.push(Number.isFinite(every) && every > 1 ? `every ${every} ${unit}s` : `every ${unit}`);
  }
  const instalments = typeof t.installments_total === "number" ? t.installments_total : Number(t.installments_total);
  if (Number.isFinite(instalments) && instalments > 1) parts.push(`${instalments} instalments`);
  const schedule = text(t.payment_schedule).replace(/_/g, " ");
  if (schedule) parts.push(`payable ${schedule}`);
  const starts = day(t.starts_on);
  if (starts) parts.push(`starts ${starts}`);
  const renews = day(t.renews_on);
  if (renews) parts.push(`renews ${renews}`);
  const ends = day(t.ends_on);
  if (ends) parts.push(`ends ${ends}`);
  const status = text(t.status);

  if (!parts.length) return "No priced commercial terms are recorded against this agreement.";
  return `Terms: ${parts.join(", ")}.${status ? ` Terms status: ${status}.` : ""}`;
}

/**
 * File a completed agreement into the tenant's knowledge base.
 *
 * Never throws. Returns why it did nothing whenever it does nothing.
 */
export async function recordCompletedAgreementToKnowledge(
  db: Db,
  input: {
    readonly agreementId: string;
    readonly tenantId: string;
    readonly title: string;
    readonly completedAt: string;
    /** As already selected by the sealer — only `full_name`, `signer_role` and `signing_order` are read. */
    readonly signers: ReadonlyArray<Record<string, unknown>>;
  },
): Promise<KnowledgeOutcome> {
  // ── Autonomy. Its OWN key, so a workspace can switch this off without touching anything else. ──
  //
  // ONLY `off` blocks. This write is unattended by construction: it happens after a signature the
  // tenant already authorised by sending the agreement and after the counterparty completed it, so
  // there is no human in the loop and a `confirm` that nobody can ever answer would mean the ingest
  // simply never runs. `off` is therefore the whole control surface here, and that is deliberate
  // rather than an oversight — `resolve_tool_autonomy` returns `confirm` for a key with no row, so
  // treating `confirm` as blocking would make the default "never", which is the opposite of ruled.
  // A workspace at trust rung 0 resolves to `off` and is honoured like any other `off`.
  let mode = "auto";
  try {
    const { data } = await db.rpc("resolve_tool_autonomy", {
      _tenant_id: input.tenantId,
      _tool_key: AGREEMENT_LEARN_TOOL_KEY,
    });
    const resolved = text(data);
    if (resolved) mode = resolved;
  } catch {
    // A resolver that will not answer is not a grant to proceed, but it is also not a reason to
    // fail a completed agreement. Proceed: this is a derived, tenant-internal write about the
    // tenant's own record, and the only state that withholds it is an explicit `off`.
    mode = "auto";
  }
  if (mode === "off") return { ingested: false, reason: "autonomy_off" };

  const createdBy = await senderOf(db, input.agreementId);
  if (!createdBy) return { ingested: false, reason: "no_resolvable_author" };

  const { data: agreementRow } = await db.from("paige_agreements")
    .select("commercial_terms_id,sent_at")
    .eq("id", input.agreementId).eq("tenant_id", input.tenantId).maybeSingle();
  const row = agreementRow as Record<string, unknown> | null;

  // The counterparty, read from the signers the sealer already holds. `full_name` only — never the
  // typed signature, never the address, never anything from the evidence columns.
  const counterparty = (() => {
    const parties = [...input.signers];
    const named = parties.find((s) => text(s.signer_role) === "counterparty") ?? parties
      .sort((a, b) => Number(a.signing_order ?? 0) - Number(b.signing_order ?? 0))[0];
    return text(named?.full_name);
  })();

  const terms = text(row?.commercial_terms_id)
    ? await termsSentence(db, String(row?.commercial_terms_id), input.tenantId)
    : "No commercial terms are recorded against this agreement.";

  const sent = day(row?.sent_at);
  const done = day(input.completedAt);
  const who = counterparty || "a client";

  // ONE PARAGRAPH, and short. The ingest collapses all whitespace, so line structure does not
  // survive; and the chat read slices a chunk to 600 characters, so anything past that is written
  // but never seen. It leads with the words somebody would actually ask with — signed, agreement,
  // the counterparty's name — because a chunk that does not clear the similarity threshold is
  // invisible however correct it is.
  const content = [
    `Signed agreement with ${who}.`,
    `Title: ${input.title}.`,
    "Status: completed.",
    sent ? `Sent ${sent}.` : "",
    done ? `Completed ${done}.` : "",
    terms,
  ].filter(Boolean).join(" ").slice(0, 600);

  try {
    const result = await ingestDoc(db as never, {
      tenantId: input.tenantId,
      title: `Signed agreement — ${input.title} — ${who}`.slice(0, 200),
      content,
      // `source` is CHECK-constrained to ('upload','url','paste','sync','scan'); 'agreement' is not
      // a legal value. `sync` is what a system-driven ingest uses here.
      source: "sync",
      source_url: `agreement://${input.agreementId}`,
      category: "agreements",
      tags: ["agreement", "signed"],
      share_to_network: false, // §2/§9 — a tenant's own contracts never enter a platform queue.
      created_by: createdBy,
    });
    if (!result?.ok) return { ingested: false, reason: text(result?.error) || "ingest_failed" };

    // Dedup AFTER a proven-good ingest, never before it. Deleting first would mean a re-run during
    // an embedding outage destroys the previous record and leaves nothing in its place.
    await db.from("tenant_knowledge_docs").delete()
      .eq("tenant_id", input.tenantId)
      .eq("source_url", `agreement://${input.agreementId}`)
      .neq("id", result.doc_id);

    return { ingested: true };
  } catch (e) {
    return { ingested: false, reason: `ingest_threw: ${String(e)}` };
  }
}
