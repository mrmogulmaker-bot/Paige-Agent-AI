/**
 * Media-provider registry — the one lookup from provider name to adapter.
 * Adding a future provider (KIE music, if ever owner-approved) is a new adapter
 * + one registry line, never a Vibe Studio change.
 */

import type { MediaProviderAdapter, MediaProviderName } from "./mod.ts";
import { falAdapter } from "./fal.ts";
import { legacyAdapters } from "./legacy.ts";

const REGISTRY: Record<MediaProviderName, MediaProviderAdapter> = {
  fal: falAdapter,
  ...legacyAdapters,
};

export function getMediaAdapter(provider: string): MediaProviderAdapter | null {
  return REGISTRY[provider as MediaProviderName] ?? null;
}

export function allMediaAdapters(): MediaProviderAdapter[] {
  return Object.values(REGISTRY);
}
