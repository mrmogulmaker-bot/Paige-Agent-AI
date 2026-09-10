// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  VP_ROSTER,
  buildVpAddressBlock,
  detectVpAddress,
} from '../../supabase/functions/_shared/paige-context/vp-address.ts';

describe('detectVpAddress — the roster\'s addressing rule', () => {
  it('detects a direct address with the name stripped', () => {
    const a = detectVpAddress('ZION, what about my Q2 pricing?');
    expect(a?.vp.slug).toBe('zion');
    expect(a?.rest).toBe('what about my Q2 pricing?');
  });

  it('is case-insensitive and greeting-tolerant', () => {
    expect(detectVpAddress('hey vera, is the KYC done?')?.vp.slug).toBe('vera');
    expect(detectVpAddress('Hi NEXUS what is our pipeline looking like')?.vp.slug).toBe('nexus');
    expect(detectVpAddress('mentor: check the n8n connection')?.vp.slug).toBe('mentor');
  });

  it('every roster VP is addressable', () => {
    for (const vp of VP_ROSTER) {
      expect(detectVpAddress(`${vp.name}, status?`)?.vp.slug).toBe(vp.slug);
    }
  });

  it('mid-sentence mentions are NOT addresses — Paige stays the default', () => {
    expect(detectVpAddress('What would Zion do about this?')).toBeNull();
    expect(detectVpAddress('I talked to CURA yesterday')).toBeNull();
  });

  it('non-VP words never match, including lookalikes', () => {
    expect(detectVpAddress('Zionsville is a city in Indiana')).toBeNull();
    expect(detectVpAddress('mentorship programs')).toBeNull();
    expect(detectVpAddress('curable')).toBeNull();
    expect(detectVpAddress('hello')).toBeNull();
    expect(detectVpAddress('')).toBeNull();
    expect(detectVpAddress(null)).toBeNull();
  });

  it('a bare summons is still an address', () => {
    const a = detectVpAddress('MERIT?');
    expect(a?.vp.slug).toBe('merit');
    expect(a?.rest).toBe('');
  });
});

describe('buildVpAddressBlock — presentation only, authority untouched', () => {
  const a = detectVpAddress('ZION, what about my Q2 pricing?')!;

  it('carries the VP identity, scope, voice, and the tenant name', () => {
    const block = buildVpAddressBlock(a, 'Mogul Coaching');
    expect(block).toContain("AT ZION'S DESK");
    expect(block).toContain('VP Strategy & Vision');
    expect(block).toContain('Mogul Coaching');
    expect(block).toContain('elevated and directional');
  });

  it('states the doctrine invariant: presentation changes, authority does not', () => {
    const block = buildVpAddressBlock(a, 'T');
    expect(block).toContain('you are still one Paige');
    expect(block).toContain('No authority changes because a name was said');
  });
});
