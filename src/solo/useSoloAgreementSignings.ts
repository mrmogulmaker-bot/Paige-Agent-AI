// The tenant's AGREEMENT SIGNINGS read — Campaigns → Sales, the DOCUMENT half of a client agreement.
//
// WHAT THIS IS, AND WHY IT IS NOT PART OF `useSoloAgreements`.
// `tenant_client_agreements` records what one client agreed to PAY. This table records the DOCUMENT
// they signed to agree it, and the owner ruled (2026-09-22) that the two states stay SEPARATE: a
// signature runs draft → sent → viewed → completed, while the engagement it commits runs draft →
// active → paused → completed → cancelled. Folding them together would make one word on one row mean
// two different things, so nothing in this file reads or writes `tenant_client_agreements.status`.
// The same ruling collapsed `signed` into `completed`: with one signer the two cannot be told apart,
// and a state nothing can distinguish is a lie (§13).
//
// WHAT IT DELIBERATELY DOES NOT DO.
// - It does not read `document_body`. The wording of a contract is not needed to LIST what has been
//   sent, and pulling up to 200 full contracts into a browser to render a status column would be
//   paying for evidence nothing on that surface shows. The signer's own page reads the wording, from
//   the token, server-side.
// - It never sees a live link. `issue_agreement_signing_link` returns the raw token EXACTLY ONCE and
//   stores only its sha256; `token_hash` is not selected here because it is not the link and cannot
//   be turned back into one. A surface that could re-show a sent link would be claiming a capability
//   the database deliberately does not have.
// - It moves no money and holds no payment instrument (§38). A signature is a record of agreement;
//   the money leg still runs on the workspace's own processor.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mirrors `tenant_agreement_signings_signature_state_check`, plus `unrecognised` for a value this
 * build has no reading for. The eighth member is not a state anything can record: it is what the
 * surface SAYS when a later migration widens the CHECK and this deployment has not caught up.
 * Coercing it to `draft` would assert that nothing has been sent when something may have been —
 * the same rule `AgreementStatus` and `OrderStatus` already follow.
 *
 * There is deliberately no `signed` (owner ruling 2), and no `paid`, `invoiced` or `delivered`
 * (§38) — a signature observes none of those.
 */
export type SignatureState =
  | "draft" | "sent" | "viewed" | "completed" | "declined" | "voided" | "expired" | "unrecognised";
const SIGNATURE_STATES: readonly SignatureState[] =
  ["draft", "sent", "viewed", "completed", "declined", "voided", "expired"];

/** Mirrors `tenant_agreement_signings_document_source_check`. */
export type DocumentSource = "tenant_upload" | "paige_draft" | "tenant_template";
export const DOCUMENT_SOURCES: readonly DocumentSource[] =
  ["tenant_upload", "paige_draft", "tenant_template"];

export type AgreementSigning = {
  readonly id: string;
  readonly contactId: string;
  /** NULLABLE by owner ruling 3 — an NDA or a scope letter has no offer and no price. */
  readonly agreementId: string | null;
  readonly documentTitle: string;
  readonly documentSource: DocumentSource | null;
  /** The ORIGINAL file the business uploaded, if there is one. Not the signed result. */
  readonly documentPath: string | null;
  /** What the record itself says. */
  readonly signatureState: SignatureState;
  /**
   * What the surface should SHOW.
   *
   * Nothing in this build flips a `sent` row to `expired` when its clock runs out — there is no job
   * that walks the table — so the stored state keeps saying `sent` long after the link has stopped
   * working. Painting "Sent" beside a dead link is the lie; deriving "Expired" from two facts the
   * record does hold (the state, and `expires_at`) is the truth. The raw value stays above so a
   * caller that needs the stored state can still have it.
   */
  readonly displayState: SignatureState;
  readonly expiresAt: string | null;
  readonly sentAt: string | null;
  readonly viewedAt: string | null;
  readonly completedAt: string | null;
  readonly declinedAt: string | null;
  readonly voidedAt: string | null;
  readonly declineReason: string | null;
  readonly signerName: string | null;
  /** The countersigned PDF. Present only once the signing genuinely completed — the table's own
   * `tas_completed_is_evidenced_ck` refuses `completed` without it, so this is evidence, not a hope. */
  readonly signedPdfPath: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

/**
 * What the editor sends to create one. `tenantId` is the workspace the FORM WAS OPENED AGAINST —
 * not the current one. Sending the current tenant makes the server's refusal guard unable to fire,
 * because the caller keeps agreeing with itself; that exact mistake shipped once on `save_solo_offer`
 * and cost a workspace-A offer created in workspace B.
 */
export type SigningDraft = {
  readonly tenantId: string | null;
  readonly contactId: string;
  /** Null is legal (ruling 3). When set it must belong to the same workspace; the server re-checks. */
  readonly agreementId: string | null;
  readonly documentTitle: string;
  readonly documentSource: DocumentSource;
  readonly documentBody: string | null;
  readonly documentPath: string | null;
};

export type SigningWriteResult = {
  readonly ok: boolean;
  readonly message?: string;
  readonly signingId?: string;
  readonly signatureState?: SignatureState;
};

/**
 * The result of issuing a link. `token` is the RAW token and this is the ONLY moment it exists
 * outside the signer's browser — the database keeps its hash and nothing else, so the surface must
 * show it now or lose it. `ok: true` is returned ONLY when the server actually handed one back
 * (§13): a resolved promise carrying no token is not a link, and saying otherwise would send
 * somebody away believing they had one.
 */
export type SigningLinkResult = {
  readonly ok: boolean;
  readonly message?: string;
  readonly token?: string;
  readonly expiresAt?: string | null;
};

/** Where the uploaded original ended up in the `tenant-agreements` bucket. */
export type DocumentUploadResult = {
  readonly ok: boolean;
  readonly message?: string;
  readonly path?: string;
};

export type SigningsState = {
  readonly tenantId: string | null;
  readonly phase: "resolving" | "loading" | "ready" | "error" | "unavailable";
  readonly signings: readonly AgreementSigning[];
  /**
   * FALSE when the caller cannot read this table at all.
   *
   * This CANNOT be derived from `!error`, for the reason `useSoloAgreements.agreementsReadable`
   * records at length: `tenant_agreement_signings` GRANTs SELECT to `authenticated` and gates on
   * RLS, and RLS is a ROW FILTER — a caller matching no permissive policy gets HTTP 200, an EMPTY
   * array and NO error. Modelling authorization as an error channel here would make this flag
   * unreachable, which is the defect that had to be repaired on `ordersReadable`.
   */
  readonly readable: boolean;
  readonly canManage: boolean;
  /** The authority read itself failed. Distinct from "the caller is not an admin". */
  readonly authorityUnknown: boolean;
  readonly retry: () => void;
  readonly uploadDocument: (
    file: File,
    loadedTenantId: string | null,
  ) => Promise<DocumentUploadResult>;
  readonly createSigning: (draft: SigningDraft) => Promise<SigningWriteResult>;
  readonly issueLink: (
    signingId: string,
    ttlDays: number,
    loadedTenantId: string | null,
  ) => Promise<SigningLinkResult>;
  readonly voidSigning: (
    signingId: string,
    loadedTenantId: string | null,
  ) => Promise<SigningWriteResult>;
};

const EMPTY = {
  signings: [] as readonly AgreementSigning[],
  readable: false,
  canManage: false,
  authorityUnknown: false,
};

/** An unrecognised value is narrowed to null rather than coerced. */
function narrow<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function toText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

// Public copy is chosen from stable error codes, never database/provider messages.
function safeWriteMessage(code?: string): string {
  // The signing functions ship on their own migration, so a deployment can legitimately be running
  // this surface before they exist. PostgREST answers PGRST202 for a function it cannot resolve and
  // Postgres answers 42883 for one that is genuinely absent. Saying so plainly is the honest read
  // (§13/§70.1) — the alternative is a generic "could not be confirmed" that reads as a fault in
  // what the person just typed.
  if (code === "PGRST202" || code === "42883") return "Documents are not available on this workspace yet, so nothing was recorded. Your commercial terms are unaffected.";
  if (code === "42501") return "Your permission or workspace changed. Reopen this form with owner or admin access.";
  if (code === "22023" || code === "23514" || code === "22P02") return "Check the client, the document and the wording, then try again.";
  return "That could not be confirmed. Refresh and check your records before trying again.";
}

/**
 * Derived, never stored. See `displayState` above for why this exists at all.
 */
function readState(stored: SignatureState, expiresAt: string | null): SignatureState {
  if (stored !== "sent" && stored !== "viewed") return stored;
  const at = expiresAt ? Date.parse(expiresAt) : NaN;
  return !Number.isNaN(at) && at <= Date.now() ? "expired" : stored;
}

export function useSoloAgreementSignings(): SigningsState {
  const { activeTenantId, accountContextLoading } = useTenantContext();
  // An identity epoch also invalidates a completion after A -> B -> A.
  const identity = useRef({ tenantId: activeTenantId, resolving: accountContextLoading });
  if (identity.current.tenantId !== activeTenantId || identity.current.resolving !== accountContextLoading) {
    identity.current = { tenantId: activeTenantId, resolving: accountContextLoading };
  }

  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<
    Omit<SigningsState, "retry" | "uploadDocument" | "createSigning" | "issueLink" | "voidSigning">
  >({
    tenantId: activeTenantId ?? null,
    phase: accountContextLoading ? "resolving" : "loading",
    ...EMPTY,
  });
  const retry = useCallback(() => setRefreshKey((key) => key + 1), []);

  /**
   * One place where every write checks that the workspace it was STARTED in is still the workspace
   * it is finishing in. Copied from the sibling adapters rather than reinvented, because the failure
   * it catches — a workspace switch between opening a form and saving it — is silent when it is not
   * checked, and a signing carries a named client bound to a contract.
   */
  const runWrite = useCallback(async <T,>(
    expected: string | null,
    call: () => Promise<{ data: unknown; error: { code?: string } | null }>,
    read: (data: Record<string, unknown>) => T | null,
  ): Promise<{ ok: true; value: T } | { ok: false; message: string }> => {
    if (!expected) {
      return { ok: false, message: "This workspace could not be resolved, so nothing was changed." };
    }
    const openedIdentity = identity.current;
    if (openedIdentity.resolving || !openedIdentity.tenantId) {
      return { ok: false, message: "Wait for your workspace to finish loading, then try again." };
    }
    try {
      const { data, error } = await call();
      if (identity.current !== openedIdentity) {
        return { ok: false, message: "Your workspace changed. Reopen this form in the intended workspace." };
      }
      if (error) {
        console.error("[signings] write refused", { code: error.code });
        return { ok: false, message: safeWriteMessage(error.code) };
      }
      if (data === null || data === undefined || typeof data !== "object") {
        return { ok: false, message: "That could not be confirmed. Refresh and check your records before trying again." };
      }
      // §13 — the server's acknowledgement is what makes this a success, never the absence of an
      // error. A call that resolves without the value it promised has not done the thing.
      const value = read(data as Record<string, unknown>);
      if (value === null) {
        return { ok: false, message: "The server did not confirm what it did, so nothing is being claimed here. Reload and check before trying again." };
      }
      setRefreshKey((key) => key + 1);
      return { ok: true, value };
    } catch {
      return {
        ok: false,
        message: identity.current !== openedIdentity
          ? "Your workspace changed. Reopen this form in the intended workspace."
          : "That could not be confirmed. Refresh and check your records before trying again.",
      };
    }
  }, []);

  /**
   * The original file the business drafted, kept beside the signing record.
   *
   * The FIRST path segment is the workspace id and that is not cosmetic: the live storage policy on
   * `tenant-agreements` admits an INSERT only when `(storage.foldername(name))[1]` matches a tenant
   * the caller is an owner or admin of, so the prefix is what the server checks. Writing the file
   * anywhere else fails closed rather than landing in another workspace's folder.
   *
   * The name is rewritten rather than trusted. A client's filename reaches this as arbitrary text,
   * and a `../` inside it is how a path ends up somewhere its policy never meant to allow.
   */
  const uploadDocument = useCallback(async (
    file: File,
    loadedTenantId: string | null,
  ): Promise<DocumentUploadResult> => {
    const expected = loadedTenantId ?? activeTenantId;
    if (!expected) {
      return { ok: false, message: "This workspace could not be resolved, so nothing was uploaded." };
    }
    const openedIdentity = identity.current;
    if (openedIdentity.resolving || !openedIdentity.tenantId) {
      return { ok: false, message: "Wait for your workspace to finish loading, then try again." };
    }
    const safe = (file.name || "document")
      .replace(/[^\w.\-]+/g, "-")
      .replace(/^[.\-]+/, "")
      .slice(-80) || "document";
    const path = `${expected}/source/${Date.now()}-${safe}`;
    try {
      const { error } = await supabase.storage
        .from("tenant-agreements")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (identity.current !== openedIdentity) {
        return { ok: false, message: "Your workspace changed. Reopen this form in the intended workspace." };
      }
      if (error) {
        console.error("[signings] document upload failed", error);
        return { ok: false, message: "That file could not be uploaded, so no document was recorded. Nothing else was changed." };
      }
      return { ok: true, path };
    } catch {
      return { ok: false, message: "That file could not be uploaded, so no document was recorded. Nothing else was changed." };
    }
  }, [activeTenantId]);

  const createSigning = useCallback(async (draft: SigningDraft): Promise<SigningWriteResult> => {
    const outcome = await runWrite(
      // THE WORKSPACE THIS FORM WAS OPENED IN, never the current one — see `SigningDraft`.
      draft.tenantId,
      () => supabase.rpc(
        "create_agreement_signing" as never,
        {
          _expected_tenant_id: draft.tenantId,
          _contact_id: draft.contactId,
          _agreement_id: draft.agreementId,
          _document_title: draft.documentTitle,
          _document_source: draft.documentSource,
          _document_body: draft.documentBody,
          _document_path: draft.documentPath,
        } as never,
      ) as Promise<{ data: unknown; error: { code?: string } | null }>,
      (data) => {
        const id = toText(data.signing_id);
        return id ? { id, state: narrow(data.signature_state, SIGNATURE_STATES) } : null;
      },
    );
    if (!outcome.ok) return { ok: false, message: outcome.message };
    return {
      ok: true,
      signingId: outcome.value.id,
      signatureState: outcome.value.state ?? "unrecognised",
    };
  }, [runWrite]);

  const issueLink = useCallback(async (
    signingId: string,
    ttlDays: number,
    // The workspace the ROW WAS LOADED AGAINST. Sending the CURRENT tenant instead makes the
    // server's refusal guard unable to fire, because the caller keeps agreeing with itself.
    loadedTenantId: string | null,
  ): Promise<SigningLinkResult> => {
    const outcome = await runWrite(
      loadedTenantId ?? activeTenantId,
      () => supabase.rpc(
        "issue_agreement_signing_link" as never,
        {
          _expected_tenant_id: loadedTenantId ?? activeTenantId,
          _signing_id: signingId,
          _ttl_days: ttlDays,
        } as never,
      ) as Promise<{ data: unknown; error: { code?: string } | null }>,
      // A response without a token is NOT a link, however green it looks. Refusing it here is what
      // stops the surface telling somebody to send something that does not exist.
      (data) => {
        const token = toText(data.token);
        return token ? { token, expiresAt: toText(data.expires_at) } : null;
      },
    );
    if (!outcome.ok) return { ok: false, message: outcome.message };
    return { ok: true, token: outcome.value.token, expiresAt: outcome.value.expiresAt };
  }, [runWrite, activeTenantId]);

  const voidSigning = useCallback(async (
    signingId: string,
    loadedTenantId: string | null,
  ): Promise<SigningWriteResult> => {
    const outcome = await runWrite(
      loadedTenantId ?? activeTenantId,
      () => supabase.rpc(
        "void_agreement_signing" as never,
        {
          _expected_tenant_id: loadedTenantId ?? activeTenantId,
          _signing_id: signingId,
        } as never,
      ) as Promise<{ data: unknown; error: { code?: string } | null }>,
      (data) => {
        const state = narrow(data.signature_state, SIGNATURE_STATES);
        // The server says `voided` or this did not happen. Accepting any shape here would let a
        // surface claim a live link had been stopped when it had not.
        return state === "voided" ? { state } : null;
      },
    );
    if (!outcome.ok) return { ok: false, message: outcome.message };
    return { ok: true, signatureState: outcome.value.state };
  }, [runWrite, activeTenantId]);

  useEffect(() => {
    let current = true;

    // Fail closed on identity, exactly as the sibling adapters do. No tenant, no read.
    if (accountContextLoading) {
      setState({ tenantId: activeTenantId ?? null, phase: "resolving", ...EMPTY });
      return () => { current = false; };
    }
    if (!activeTenantId) {
      setState({ tenantId: null, phase: "unavailable", ...EMPTY });
      return () => { current = false; };
    }

    setState({ tenantId: activeTenantId, phase: "loading", ...EMPTY });
    void (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const callerId = authData.user?.id ?? null;

        const [signingResponse, roleResponse] = await Promise.all([
          supabase
            .from("tenant_agreement_signings" as never)
            .select(
              "id,contact_id,agreement_id,document_title,document_source,document_path," +
              "signature_state,expires_at,sent_at,viewed_at,completed_at,declined_at,voided_at," +
              "decline_reason,signer_name,signed_pdf_path,created_at,updated_at",
            )
            // NOT redundant with RLS. `is_platform_owner()` is a disjunct in the isolation policy,
            // so a platform operator acting inside a tenant would otherwise see every signing on the
            // platform; and `current_user_tenant_id()` reads `profiles.active_tenant_id`, which a
            // workspace switch writes before the browser repaints. The filter closes the first and
            // the synchronous guard at the bottom of this file closes the second.
            .eq("tenant_id", activeTenantId)
            .order("created_at", { ascending: false })
            .limit(200),
          callerId
            ? supabase
                .from("tenant_members")
                .select("role")
                .eq("tenant_id", activeTenantId)
                .eq("user_id", callerId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null } as { data: null; error: null }),
        ]);

        if (!current) return;

        if (signingResponse.error) {
          // This covers the ordinary failures AND the one that is not a failure at all: a
          // deployment running this surface before the signing migration has landed answers
          // PGRST205/42P01 here. Both resolve to `error`, which the surface reads as "not
          // readable", and NEITHER resolves to `ready` with zero rows — telling somebody they have
          // no documents because the table does not exist yet is the false green this branch
          // exists to refuse (§13).
          console.error("[signings] signing read failed", signingResponse.error);
          setState({ tenantId: activeTenantId, phase: "error", ...EMPTY });
          return;
        }

        const rows = (signingResponse.data ?? []) as unknown as Record<string, unknown>[];
        const signings: AgreementSigning[] = rows.map((row) => {
          // A value this build cannot read is NAMED, never coerced into a state it might not be.
          const stored = narrow(row.signature_state, SIGNATURE_STATES) ?? "unrecognised";
          const expiresAt = toText(row.expires_at);
          return {
            id: String(row.id),
            contactId: String(row.contact_id),
            agreementId: toText(row.agreement_id),
            documentTitle: toText(row.document_title) ?? "Untitled document",
            documentSource: narrow(row.document_source, DOCUMENT_SOURCES),
            documentPath: toText(row.document_path),
            signatureState: stored,
            displayState: readState(stored, expiresAt),
            expiresAt,
            sentAt: toText(row.sent_at),
            viewedAt: toText(row.viewed_at),
            completedAt: toText(row.completed_at),
            declinedAt: toText(row.declined_at),
            voidedAt: toText(row.voided_at),
            declineReason: toText(row.decline_reason),
            signerName: toText(row.signer_name),
            signedPdfPath: toText(row.signed_pdf_path),
            createdAt: toText(row.created_at),
            updatedAt: toText(row.updated_at),
          };
        });

        const role = typeof roleResponse.data?.role === "string" ? roleResponse.data.role : null;
        const canManage = role === "owner" || role === "admin";

        // Authority, not the error channel — see `readable` above. The `|| length > 0` disjunct
        // keeps a reader who is NOT an admin honest: rows they can see prove the read succeeded.
        //
        // HONEST CAVEAT (§13): this is an APPROXIMATION of the table's policy set, not a mirror of
        // it. It is exact for the two callers a Solo workspace actually has — owner/admin can read,
        // member cannot — and it fails SAFE for the rest, reading as "unknown" rather than "none".
        const readable = !signingResponse.error && (canManage || signings.length > 0);

        setState({
          tenantId: activeTenantId,
          phase: "ready",
          signings,
          readable,
          canManage,
          authorityUnknown: Boolean(roleResponse.error) || !callerId,
        });
      } catch (error) {
        console.error("[signings] tenant-scoped signing read failed", error);
        if (!current) return;
        setState({ tenantId: activeTenantId, phase: "error", ...EMPTY });
      }
    })();

    return () => { current = false; };
  }, [activeTenantId, accountContextLoading, refreshKey]);

  // The synchronous tenant guard, copied from the sibling adapters rather than reinvented.
  // `setState` inside the effect runs AFTER paint, so on the render where `activeTenantId` changes
  // IN PLACE — which is what `switchTenant` does, without remounting, because `GrowthHub` is keyed
  // by route and not by tenant — `state` still holds the PREVIOUS workspace's rows. Here that would
  // paint another tenant's CLIENT NAMES BOUND TO THEIR CONTRACTS, and offer a control that sends one.
  const synchronousTenantId = activeTenantId ?? null;
  const visible = !accountContextLoading && state.tenantId === synchronousTenantId ? state : {
    tenantId: synchronousTenantId,
    phase: accountContextLoading ? "resolving" as const
      : synchronousTenantId ? "loading" as const
      : "unavailable" as const,
    ...EMPTY,
  };
  return { ...visible, retry, uploadDocument, createSigning, issueLink, voidSigning };
}
