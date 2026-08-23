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
const text = assets
  .map((a) => a.bytes.toString('utf8'))
  // Fonts decode to binary noise that trips every substring check.
  .filter((t) => !/�/.test(t.slice(0, 64)));

const problems = [];

for (const { file, head } of SOURCES) {
  const want = fs.readFileSync(path.join(PACK, file), 'utf8');
  const got = text.find((t) => t.startsWith(head));
  if (got === undefined) problems.push(`${file}: no bundled asset starts with ${JSON.stringify(head)}`);
  else if (got !== want) {
    problems.push(`${file}: bundled copy differs from source (${got.length} vs ${want.length} bytes) — the standalone is stale`);
  } else console.log(`ok   ${file} — bundled copy is byte-identical to source (${want.length} bytes)`);
}

for (const t of text) {
  const mark = t.match(MARKS);
  if (mark) problems.push(`§50 mark ${JSON.stringify(mark[0])} in bundled content`);
  for (const { re, what } of IDENTIFIERS) {
    const hit = t.match(re);
    if (hit) problems.push(`${what} identifier ${JSON.stringify(hit[0])} in bundled content`);
  }
}

if (problems.length) {
  console.error('\nFAIL');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`ok   §50 + identifier sweep clean across ${text.length} unpacked text assets`);
