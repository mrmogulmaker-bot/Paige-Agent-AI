// The agreement-signings read, stubbed at the NETWORK boundary only.
//
// Same contract as `useSoloAgreements-stub.ts` beside it: everything above this line renders
// unchanged — the band, the Signature column, the document step, the send drawer, every token.
// What is replaced is the one thing a local harness cannot have: a tenant-scoped round trip to
// PostgREST. That is also the honest limit of any frame taken from here. It is a RENDER, never an
// authenticated runtime, and the two are not interchangeable (§32.c).
//
// The RPCs this hook calls do not exist in any database yet — the backend is INT-163's lane and
// merges first — so the write paths here answer the way the real ones will be observed to answer,
// never with a fabricated success.
import { useSyncExternalStore } from "react";
import type {
  AgreementSigning,
  DocumentUploadResult,
  SignedCopyResult,
  SigningDraft,
  SigningLinkResult,
  SigningWriteResult,
  SigningsState,
} from "@/solo/useSoloAgreementSignings";

export type { AgreementSigning, SigningDraft, SigningsState };
export { DOCUMENT_SOURCES } from "@/solo/useSoloAgreementSignings";
export type { DocumentSource, SignatureState } from "@/solo/useSoloAgreementSignings";

export type SigningsMode =
  | "none"
  | "populated"
  | "unreadable"
  | "readonly"
  | "error"
  | "loading"
  | "resolving"
  | "unavailable";

let mode: SigningsMode = "none";
const listeners = new Set<() => void>();

export function setSigningsHarnessMode(next: SigningsMode) {
  mode = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const TENANT = "11111111-1111-4111-8111-111111111111";

// Every state the column can show, so a frame proves the vocabulary renders rather than one row.
const ROWS: readonly AgreementSigning[] = [
  {
    // DRAFT — written, not yet sent. This is the approved pre-send state (screen 3) and the only
    // one whose row offers "Send for signature", and the fixtures carried no draft at all, so that
    // whole screen was unreachable in the harness.
    // agreementId null: an ORPHAN row, which is how a document with no commercial terms behind it
    // reaches the band at all (owner ruling 3 — an NDA or a scope letter). With a non-null id that
    // matches no agreement the row joins nothing and never renders.
    id: "s0", contactId: "c1", agreementId: null,
    documentTitle: "Coaching agreement — Avery & Co.", documentSource: "tenant_upload",
    documentPath: `${TENANT}/source/coaching.pdf`,
    signatureState: "draft", displayState: "draft",
    expiresAt: null, sentAt: null,
    viewedAt: null, completedAt: null, declinedAt: null, voidedAt: null,
    declineReason: null, signerName: null, signedPdfPath: null,
    createdAt: "2026-09-22T15:40:00.000Z", updatedAt: "2026-09-22T15:40:00.000Z",
  },
  {
    id: "s1", contactId: "c1", agreementId: "a1",
    documentTitle: "Retainer agreement — Avery & Co.", documentSource: "tenant_upload",
    documentPath: `${TENANT}/source/retainer.pdf`,
    signatureState: "sent", displayState: "sent",
    expiresAt: "2099-10-22T00:00:00.000Z", sentAt: "2026-09-22T15:51:00.000Z",
    viewedAt: null, completedAt: null, declinedAt: null, voidedAt: null,
    declineReason: null, signerName: null, signedPdfPath: null,
    createdAt: "2026-09-22T15:49:00.000Z", updatedAt: "2026-09-22T15:51:00.000Z",
  },
  {
    id: "s2", contactId: "c2", agreementId: null,
    documentTitle: "Mutual NDA", documentSource: "tenant_upload",
    documentPath: `${TENANT}/source/nda.pdf`,
    signatureState: "viewed", displayState: "viewed",
    expiresAt: "2099-10-30T00:00:00.000Z", sentAt: "2026-09-21T10:00:00.000Z",
    viewedAt: "2026-09-21T11:04:00.000Z", completedAt: null, declinedAt: null, voidedAt: null,
    declineReason: null, signerName: null, signedPdfPath: null,
    createdAt: "2026-09-21T09:58:00.000Z", updatedAt: "2026-09-21T11:04:00.000Z",
  },
  {
    id: "s3", contactId: "c3", agreementId: "a3",
    documentTitle: "Coaching agreement 2026", documentSource: "tenant_upload",
    documentPath: `${TENANT}/source/coaching.pdf`,
    signatureState: "completed", displayState: "completed",
    expiresAt: "2026-09-30T00:00:00.000Z", sentAt: "2026-09-18T09:00:00.000Z",
    viewedAt: "2026-09-18T09:20:00.000Z", completedAt: "2026-09-18T09:31:00.000Z",
    declinedAt: null, voidedAt: null, declineReason: null, signerName: "Delaney Okafor",
    signedPdfPath: `${TENANT}/signed/s3-1.pdf`,
    createdAt: "2026-09-18T08:58:00.000Z", updatedAt: "2026-09-18T09:31:00.000Z",
  },
  {
    // An elapsed expiry on a still-`sent` row: the surface must DERIVE Expired rather than
    // wait for a writer that does not exist. A frame of this row is the proof it does.
    id: "s4", contactId: "c4", agreementId: null,
    documentTitle: "Scope letter — Q4", documentSource: "tenant_upload",
    documentPath: `${TENANT}/source/scope.pdf`,
    signatureState: "sent", displayState: "expired",
    expiresAt: "2026-09-01T00:00:00.000Z", sentAt: "2026-08-18T09:00:00.000Z",
    viewedAt: null, completedAt: null, declinedAt: null, voidedAt: null,
    declineReason: null, signerName: null, signedPdfPath: null,
    createdAt: "2026-08-18T08:58:00.000Z", updatedAt: "2026-08-18T09:00:00.000Z",
  },
  {
    id: "s5", contactId: "c1", agreementId: null,
    documentTitle: "Pilot terms", documentSource: "tenant_upload",
    documentPath: `${TENANT}/source/pilot.pdf`,
    signatureState: "declined", displayState: "declined",
    expiresAt: "2026-10-02T00:00:00.000Z", sentAt: "2026-09-10T09:00:00.000Z",
    viewedAt: "2026-09-10T12:00:00.000Z", completedAt: null,
    declinedAt: "2026-09-10T12:40:00.000Z", voidedAt: null,
    declineReason: "Scope is wider than we discussed.", signerName: null, signedPdfPath: null,
    createdAt: "2026-09-10T08:58:00.000Z", updatedAt: "2026-09-10T12:40:00.000Z",
  },
];

// The writes answer honestly rather than pretending. A harness that fakes a success teaches the
// surface nothing about the path it will actually take.
const NOT_WIRED = "Documents are not available on this workspace yet, so nothing was recorded. Your commercial terms are unaffected.";

function snapshotFor(m: SigningsMode): SigningsState {
  const base = {
    tenantId: m === "resolving" ? null : TENANT,
    retry: () => {},
    uploadDocument: async (): Promise<DocumentUploadResult> => ({ ok: false, message: NOT_WIRED }),
    createSigning: async (_d: SigningDraft): Promise<SigningWriteResult> => ({ ok: false, message: NOT_WIRED }),
    // The approved primary act. Refuses like every other write here: the harness proves the
    // SURFACE, and a stub that reported a delivery would be the exact false green these refusals
    // exist to avoid.
    sendForSignature: async () => ({ ok: false as const, message: NOT_WIRED }),
    issueLink: async (): Promise<SigningLinkResult> => ({ ok: false, message: NOT_WIRED }),
    voidSigning: async (): Promise<SigningWriteResult> => ({ ok: false, message: NOT_WIRED }),
    // No private bucket behind a local harness, so this refuses rather than minting a URL that
    // would 404 — the surface's own honest-failure path is what the frames should show.
    signedCopyUrl: async (): Promise<SignedCopyResult> => ({
      ok: false,
      message: "That signed copy could not be opened just now. Nothing was changed; try again in a moment.",
    }),
  };
  switch (m) {
    case "resolving":   return { ...base, phase: "resolving",   signings: [],   readable: false, canManage: false, authorityUnknown: false };
    case "loading":     return { ...base, phase: "loading",     signings: [],   readable: false, canManage: false, authorityUnknown: false };
    case "unavailable": return { ...base, phase: "unavailable", signings: [],   readable: false, canManage: false, authorityUnknown: false };
    case "error":       return { ...base, phase: "error",       signings: [],   readable: false, canManage: false, authorityUnknown: true  };
    // readable:false with zero rows is NOT the same as an empty book, and the surface must say so.
    case "unreadable":  return { ...base, phase: "ready",       signings: [],   readable: false, canManage: false, authorityUnknown: false };
    case "readonly":    return { ...base, phase: "ready",       signings: ROWS, readable: true,  canManage: false, authorityUnknown: false };
    case "populated":   return { ...base, phase: "ready",       signings: ROWS, readable: true,  canManage: true,  authorityUnknown: false };
    default:            return { ...base, phase: "ready",       signings: [],   readable: true,  canManage: true,  authorityUnknown: false };
  }
}

let cached: SigningsState = snapshotFor(mode);
let cachedMode: SigningsMode | null = mode;

// useSyncExternalStore compares by reference, so the snapshot is memoised per mode. Rebuilding it
// on every read would hand React a new object each time and spin.
function getSnapshot(): SigningsState {
  if (cachedMode !== mode) { cachedMode = mode; cached = snapshotFor(mode); }
  return cached;
}

export function useSoloAgreementSignings(): SigningsState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
