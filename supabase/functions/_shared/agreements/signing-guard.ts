// _shared/agreements/signing-guard.ts — the authorization decision for the public signing endpoint.
//
// Pure, so it can be driven exhaustively in tests. The endpoint does IO; this decides.
//
// THE RULE THE WHOLE ENGINE RESTS ON: tenant, agreement and signer are read FROM THE TOKEN ROW and
// from nowhere else. No path segment, query parameter or body field may name or steer any of the
// three. That is the exact inverse of the defect in `docusign-send-envelope`, which takes contact_id
// from the request body and resolves it with the service-role client and no tenant filter.

import { tokenState } from "./token.ts";

/** A token is 64 lowercase hex characters. Anything else is refused before it is hashed. */
export const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

/** Largest request body we will read. A signing POST is a name, a flag and maybe a small PNG. */
export const MAX_BODY_BYTES = 512 * 1024;

export type SigningRefusal =
  | "malformed_token"
  | "not_found"
  | "expired"
  | "already_signed"
  | "already_declined"
  | "agreement_not_signable"
  | "waiting_on_earlier_signer";

export interface SignerRow {
  id: string;
  agreement_id: string;
  tenant_id: string;
  status: string;
  signing_order: number;
  token_hash: string | null;
  token_expires_at: string | null;
  token_revoked_at: string | null;
}

export interface AgreementRow {
  id: string;
  status: string;
  expires_at: string | null;
}

export type SigningDecision =
  | { allow: true; canSign: boolean }
  | { allow: false; reason: SigningRefusal };

/**
 * May this token holder VIEW the agreement, and may they SIGN it right now?
 *
 * View and sign are separated because a signer whose turn has not come, or who has already signed,
 * should still be able to read what they are party to — refusing the read would just look broken.
 *
 * `not_found` deliberately absorbs both "no such token" and "revoked". Distinguishing them tells a
 * prober that a link once existed, which is only useful to a prober.
 */
export function decideSigningAccess(input: {
  signer: SignerRow | null;
  agreement: AgreementRow | null;
  earlierUnsignedCount: number;
  now: Date;
}): SigningDecision {
  const { signer, agreement, earlierUnsignedCount, now } = input;

  const state = tokenState(signer, now);
  if (!state.usable) {
    if (state.reason === "expired") return { allow: false, reason: "expired" };
    return { allow: false, reason: "not_found" };
  }
  if (!signer || !agreement) return { allow: false, reason: "not_found" };

  // The agreement's own deadline is checked at USE, alongside the token's. Expiry never depends on a
  // sweeper having run — a job that silently stops running would otherwise resurrect dead links.
  if (agreement.expires_at && new Date(agreement.expires_at).getTime() <= now.getTime()) {
    return { allow: false, reason: "expired" };
  }

  if (!["sent", "viewed", "partially_signed"].includes(agreement.status)) {
    return { allow: false, reason: "agreement_not_signable" };
  }

  if (signer.status === "signed") return { allow: true, canSign: false };
  if (signer.status === "declined") return { allow: true, canSign: false };
  if (earlierUnsignedCount > 0) return { allow: true, canSign: false };

  return { allow: true, canSign: true };
}

/** Why a viewer cannot sign, in words the signer can act on. */
export function explainCannotSign(signerStatus: string, earlierUnsignedCount: number): string {
  if (signerStatus === "signed") return "You have already signed this agreement.";
  if (signerStatus === "declined") return "You declined this agreement.";
  if (earlierUnsignedCount > 0) {
    return earlierUnsignedCount === 1
      ? "This agreement is waiting on one other person to sign before it reaches you."
      : `This agreement is waiting on ${earlierUnsignedCount} other people to sign before it reaches you.`;
  }
  return "This agreement cannot be signed right now.";
}

/**
 * Exactly what a signer may be told. Hand-written field by field — never a spread of the row.
 *
 * A `select *` here is how tenant internals reach an external party: the row carries tenant ids,
 * storage keys, other signers' addresses and the token hash itself. The allow-list is the control,
 * and it is a list precisely so that adding a column to the table cannot widen it by accident.
 */
export function signerFacingView(input: {
  agreement: { title: string; status: string; expires_at: string | null; content_sha256: string | null };
  signer: { full_name: string; email: string; signer_role: string; status: string; signing_order: number };
  tenantDisplayName: string;
  otherParties: Array<{ full_name: string; status: string; signing_order: number }>;
  canSign: boolean;
  disclosure: { slug: string; version: number; body: string; checkboxLabel: string } | null;
}) {
  return {
    agreement: {
      title: input.agreement.title,
      status: input.agreement.status,
      expiresAt: input.agreement.expires_at,
      documentSha256: input.agreement.content_sha256,
    },
    you: {
      fullName: input.signer.full_name,
      email: input.signer.email,
      role: input.signer.signer_role,
      status: input.signer.status,
      order: input.signer.signing_order,
    },
    sentBy: input.tenantDisplayName,
    // Names and progress only. Never another party's email address or network origin.
    otherParties: input.otherParties.map((p) => ({
      fullName: p.full_name,
      status: p.status,
      order: p.signing_order,
    })),
    canSign: input.canSign,
    disclosure: input.disclosure,
  };
}
