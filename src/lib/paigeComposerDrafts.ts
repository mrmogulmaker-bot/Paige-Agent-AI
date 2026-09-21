import { useCallback, useSyncExternalStore, type SetStateAction } from "react";

/**
 * A PAIGE composer draft is intentionally session-memory only. The identity is
 * complete by construction: the authenticated/effective user, the resolved
 * tenant, and the persisted or logical thread slot all participate in the key.
 * No caller-supplied account number and no browser storage is authoritative.
 */
export type PaigeComposerDraftIdentity = Readonly<{
  tenantId: string;
  userId: string;
  threadSlot: string;
}>;

type Listener = () => void;

const drafts = new Map<string, string>();
const listeners = new Map<string, Set<Listener>>();

export const NEW_PAIGE_CHAT_DRAFT_SLOT = "new-chat";

export function paigeComposerDraftKey(identity: PaigeComposerDraftIdentity): string {
  return JSON.stringify([identity.tenantId, identity.userId, identity.threadSlot]);
}

function readKey(key: string | null): string {
  return key ? (drafts.get(key) ?? "") : "";
}

function emit(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener();
}

function writeKey(key: string, value: string): void {
  if (value.length === 0) {
    drafts.delete(key);
  } else {
    drafts.set(key, value);
  }
  emit(key);
}

export function readPaigeComposerDraft(identity: PaigeComposerDraftIdentity): string {
  return readKey(paigeComposerDraftKey(identity));
}

export function writePaigeComposerDraft(
  identity: PaigeComposerDraftIdentity,
  value: string,
): void {
  writeKey(paigeComposerDraftKey(identity), value);
}

export function clearPaigeComposerDraft(identity: PaigeComposerDraftIdentity): void {
  writePaigeComposerDraft(identity, "");
}

/** Move the unsaved new-chat draft to the server-created thread id atomically. */
export function movePaigeComposerDraft(
  from: PaigeComposerDraftIdentity,
  to: PaigeComposerDraftIdentity,
): void {
  const fromKey = paigeComposerDraftKey(from);
  const toKey = paigeComposerDraftKey(to);
  if (fromKey === toKey) return;

  const value = drafts.get(fromKey);
  if (value === undefined) return;

  drafts.delete(fromKey);
  drafts.set(toKey, value);
  emit(fromKey);
  emit(toKey);
}

function subscribeKey(key: string | null, listener: Listener): () => void {
  if (!key) return () => undefined;
  const keyListeners = listeners.get(key) ?? new Set<Listener>();
  keyListeners.add(listener);
  listeners.set(key, keyListeners);
  return () => {
    keyListeners.delete(listener);
    if (keyListeners.size === 0) listeners.delete(key);
  };
}

/**
 * React projection of the module-memory store. Multiple mounted doors onto the
 * same PAIGE conversation observe one draft rather than diverging local copies.
 */
export function usePaigeComposerDraft(identity: PaigeComposerDraftIdentity | null) {
  const key = identity ? paigeComposerDraftKey(identity) : null;
  const subscribe = useCallback((listener: Listener) => subscribeKey(key, listener), [key]);
  const getSnapshot = useCallback(() => readKey(key), [key]);
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setValue = useCallback((next: SetStateAction<string>) => {
    if (!identity || !key) {
      throw new Error("PAIGE composer draft writes require a resolved tenant, user, and conversation identity.");
    }
    const previous = readKey(key);
    const valueToWrite = typeof next === "function"
      ? (next as (value: string) => string)(previous)
      : next;
    writeKey(key, valueToWrite);
  }, [identity, key]);

  return { identity, key, value, setValue };
}
