// §32 headless smoke test — paige-ai-chat messages history-window transform.
//
// The real messageSchema lives inside supabase/functions/paige-ai-chat/index.ts and cannot
// be imported (top-level Deno.serve side effects), so this exercises a VERBATIM re-embed of
// the `messages` field fragment against real-shape payloads. Deployed runtime is zod@3.22.4
// (esm.sh); this runs under Node's zod (v4) — the .array().min().transform() and
// .string().min().max() APIs are identical across v3/v4 for these primitives, and the
// windowing under test is pure JS inside the transform. (§13: honest about what this covers.)
//
// Covers the §39 peer-gate blocker: an even-length window of a strictly-alternating thread
// that ends on a user turn ALWAYS starts on 'assistant'; the Anthropic gateway rejects a
// leading-assistant first message ("first message must use the user role"), so the transform
// MUST trim leading assistant turns. Asserted below.
import { z } from "zod";

// ── VERBATIM re-embed of the patched messages field (index.ts messageSchema) ──────────────
const messages = z.array(
  z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1).max(50000),
    documentFileName: z.string().optional(),
  })
).min(1).transform((arr) => {
  const WINDOW = 50;
  if (arr.length <= WINDOW) return arr;
  const head = arr[0].role === 'system' ? [arr[0]] : [];
  const tail = arr.slice(arr.length - (WINDOW - head.length));
  let start = 0;
  while (start < tail.length - 1 && tail[start].role === 'assistant') start++;
  return [...head, ...tail.slice(start)];
});

// Strictly-alternating thread of n turns ENDING ON A USER TURN (the real chat shape:
// user, assistant, user, ... , user). n must be odd for it to end on user.
const alternating = (n) =>
  Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `turn-${i}` }));

let fails = 0;
const check = (name, cond, extra = '') => {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
// The invariant the Anthropic gateway enforces: after system is split out, the first
// remaining message must be role 'user'.
const firstNonSystemIsUser = (out) => {
  const rest = out.filter((m) => m.role !== 'system');
  return rest.length > 0 && rest[0].role === 'user';
};

// 1. The exact prod repro: 51 alternating turns (Antonio Daniel LLC) ending on user.
{
  const input = alternating(51);
  const out = messages.parse(input);
  check('51-turn thread parses (no more Zod 400)', out.length >= 1 && out.length <= 50, `len=${out.length}`);
  check('51-turn: first non-system message is USER (no Anthropic 400)', firstNonSystemIsUser(out),
    `first=${out[0].role}`);
  check('51-turn: keeps the LAST element (current turn / doc carrier)',
    out[out.length - 1].content === input[input.length - 1].content,
    `last=${out[out.length - 1].content}`);
  check('51-turn: dropped the OLDEST turn (turn-0 gone)', !out.some((m) => m.content === 'turn-0'));
}

// 2. Leading system message preserved AND first non-system is still user.
{
  const input = [{ role: 'system', content: 'sys' }, ...alternating(60)];
  const out = messages.parse(input);
  check('leading system: preserved at index 0', out[0].role === 'system' && out[0].content === 'sys');
  check('leading system: first NON-system message is USER', firstNonSystemIsUser(out), `out=${out.map(m=>m.role[0]).join('')}`);
  check('leading system: last element preserved',
    out[out.length - 1].content === input[input.length - 1].content);
  check('leading system: total <= 50', out.length <= 50, `len=${out.length}`);
}

// 3. Pure loosening — a payload that passed before (<=50) is returned UNTOUCHED.
{
  const input = alternating(49);
  const out = messages.parse(input);
  check('<=50-turn: byte-identical (no windowing applied)', JSON.stringify(out) === JSON.stringify(input));
}
{
  const input = alternating(1);
  const out = messages.parse(input);
  check('1-turn: unchanged', out.length === 1 && out[0].content === 'turn-0');
}

// 4. Per-message content cap (50000) still enforced.
{
  let threw = false;
  try { messages.parse([{ role: 'user', content: 'x'.repeat(50001) }]); } catch { threw = true; }
  check('content > 50000 still REJECTS (per-message cap intact)', threw);
}

// 5. No hard upper ceiling — a very long thread WINDOWS (never re-introduces the 400).
{
  const input = alternating(1001);
  const out = messages.parse(input);
  check('1001-turn: WINDOWS instead of 400 (no ceiling to re-break the bug class)', out.length <= 50, `len=${out.length}`);
  check('1001-turn: first non-system is USER', firstNonSystemIsUser(out));
  check('1001-turn: keeps last/current turn', out[out.length - 1].content === input[input.length - 1].content);
}

// 6. Empty array still rejects (min(1)).
{
  let threw = false;
  try { messages.parse([]); } catch { threw = true; }
  check('empty array still REJECTS (min(1))', threw);
}

console.log(`\n${fails === 0 ? 'ALL GREEN' : fails + ' FAILURE(S)'}`);
process.exit(fails === 0 ? 0 : 1);
