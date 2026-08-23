#!/usr/bin/env node
// Verify the compiled standalone against the pack's source of truth.
//
// The standalone stores its payload as a gzip+base64 manifest, so a plaintext
// grep across the file proves nothing — it reads clean whatever the content is.
// That is not hypothetical: every §50 / identifier sweep run against the raw
// file before this script existed was structurally incapable of failing.
// Unpack first, then check.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const PACK = path.resolve(process.argv[2] ||
  'docs/design-references/cd-packs/super-admin-shell-v3');
const STANDALONE = path.join(PACK, 'PAIGE Platform Operator - standalone.html');

// Source files that must appear byte-for-byte inside the bundle. The bundle
// keys on UUID, so match by the asset's own leading comment instead.
const SOURCES = [
  { file: 'paige-ia.js', head: '// PAIGE Super Admin — information architecture data.' },
  { file: 'mind-brain.js', head: '// <mind-brain>' },
];

// §50 marks and the format-valid-identifier class (§13 ruling 2026-08-23:
// the class is "format-valid and portable", not "government identifiers").
const MARKS = /jarvis|skynet|hal 9000|cortana|\balexa\b|\bsiri\b|watson|ultron|samantha/i;
const IDENTIFIERS = [
  { re: /\b(?!000-00-0000)\d{3}-\d{2}-\d{4}\b/, what: 'SSN-shaped' },
  { re: /\b(?!00-0000000)\d{2}-\d{7}\b/, what: 'EIN-shaped' },
  { re: /\b(?!00\/00\/0000)\d{2}\/\d{2}\/(?:19|20)\d{2}\b/, what: 'DOB-shaped' },
];

function unpack(html) {
  const m = html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no __bundler/manifest in the standalone');
  const manifest = JSON.parse(m[1]);
  return Object.entries(manifest).map(([uuid, entry]) => {
    const raw = Buffer.from(entry.data, 'base64');
    const bytes = entry.compressed ? zlib.gunzipSync(raw) : raw;
    return { uuid, bytes };
  });
}

const html = fs.readFileSync(STANDALONE, 'utf8');
const assets = unpack(html);
// Fonts decode to binary noise that trips every substring check, so they are
// excluded — but by POSITIVE identification, never by "looked binary." A filter
// that drops whatever it cannot parse produces a sweep over fewer assets than it
// claims, and a silently-skipped asset reads exactly like a clean one. Anything
// not recognised as a font is scanned, and the skip list is printed either way.
const FONT_MAGIC = [
  Buffer.from('wOFF'), Buffer.from('wOF2'), Buffer.from('OTTO'),
  Buffer.from('ttcf'), Buffer.from('true'), Buffer.from([0x00, 0x01, 0x00, 0x00]),
];
const isFont = (b) => FONT_MAGIC.some((m) => b.subarray(0, 4).equals(m));

const problems = [];
const text = [];
const skipped = [];
for (const a of assets) {
  if (isFont(a.bytes)) skipped.push(`${a.uuid.slice(0, 8)} font ${a.bytes.length}b`);
  else text.push(a.bytes.toString('utf8'));
}
console.log(`     ${assets.length} assets — ${text.length} scanned as text, ${skipped.length} fonts skipped by magic-number: ${skipped.join(', ') || 'none'}`);

for (const { file, head } of SOURCES) {
  const want = fs.readFileSync(path.join(PACK, file), 'utf8');
  const got = text.find((t) => t.startsWith(head));
  if (got === undefined) problems.push(`${file}: no bundled asset starts with ${JSON.stringify(head)}`);
  else if (got !== want) {
    problems.push(`${file}: bundled copy differs from source (${got.length} vs ${want.length} bytes) — the standalone is stale`);
  } else console.log(`ok   ${file} — bundled copy is byte-identical to source (${want.length} bytes)`);
}

// Report EVERY hit, not the first. One-at-a-time reporting turns a cluster into
// a sequence of re-runs and invites calling it done after the first fix.
const all = (t, re) => [...new Set(t.match(new RegExp(re.source, re.flags + 'g')) || [])];
for (const t of text) {
  for (const m of all(t, MARKS)) problems.push(`§50 mark ${JSON.stringify(m)} in bundled content`);
  for (const { re, what } of IDENTIFIERS) {
    for (const m of all(t, re)) problems.push(`${what} identifier ${JSON.stringify(m)} in bundled content`);
  }
}

if (problems.length) {
  console.error('\nFAIL');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`ok   §50 + identifier sweep clean across ${text.length} unpacked text assets`);
