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
// content: CLAMP overlong turns, never hard-reject (owner P0 2026-08-11 — a rehydrated >50k
// prior assistant credit-report analysis 400'd the whole send on the enableHistory Command Center).
const MAX_MESSAGE_CONTENT = 200_000;
const messages = z.array(
  z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1).transform((s) => (s.length > MAX_MESSAGE_CONTENT ? s.slice(0, MAX_MESSAGE_CONTENT) : s)),
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

// 4. Per-message content: CLAMP overlong turns, NEVER hard-reject (owner P0 2026-08-11 fix).
{
  // 4a. The exact repro: a rehydrated 51-turn thread where a PRIOR ASSISTANT turn is a 60k-char
  //     credit-report analysis (>50k). Under the OLD .max(50000) this threw ZodError -> 400
  //     "Invalid input format" and killed the send. It must now PARSE cleanly.
  const bigAnalysis = 'A'.repeat(60_000); // a real multi-bureau credit analysis, >50k chars
  const input = alternating(51);
  input[1].content = bigAnalysis; // an assistant turn (odd index) carries the oversized reply
  let out, threw = false;
  try { out = messages.parse(input); } catch { threw = true; }
  check('4a. 51-turn history w/ 60k assistant turn PARSES (no more 400)', !threw);
  check('4a. windowed result is bounded (still <= 50)', out && out.length <= 50, `len=${out?.length}`);
  check('4a. first non-system is USER (no Anthropic 400)', out && firstNonSystemIsUser(out));

  // 4b. A single 60k-char turn (between 50k and 200k) passes UNTOUCHED — not truncated.
  const out2 = messages.parse([{ role: 'user', content: bigAnalysis }]);
  check('4b. 60k content passes untouched (not clamped below 200k)', out2[0].content.length === 60_000);

  // 4c. A pathological >200k turn CLAMPS to 200k (safety valve) instead of rejecting.
  const out3 = messages.parse([{ role: 'user', content: 'B'.repeat(250_000) }]);
  check('4c. 250k content CLAMPS to 200k (never rejects)', out3[0].content.length === 200_000);

  // 4d. A normal short turn is byte-identical (pure loosening — no producer breaks).
  const out4 = messages.parse([{ role: 'user', content: 'hello' }]);
  check('4d. short content byte-identical', out4[0].content === 'hello');
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
