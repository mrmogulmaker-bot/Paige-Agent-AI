// _shared/cheesy-tells.ts — the "avoid" clause every Paige generation prompt carries.
//
// This is the RUNTIME distillation of docs/design-references/CHEESY-TELLS.md (CLAUDE.md §25).
// A Deno edge function cannot read docs/ at runtime, so the taste catalog is inlined here as a
// compact const the prompt-forge substitutes into the {{anti_patterns}} placeholder of every
// template — so the anti-patterns that make a design read cheesy are steered AWAY from at
// generation time, not just caught after the fact by the design critic.
//
// KEEP THIS IN SYNC (§12, one home): the source of truth for taste is the .md doc; this is its
// prompt-shaped mirror. When the doc gains a new tell, add its "avoid X" line here too. Each
// entry is a concrete, provider-agnostic instruction (works for image, image-with-text, 3d, and
// text prompts alike). §3-clean: no "AI-powered"/"seamless"/"streamline"/"empower" in our own copy.

/** ~35 concrete anti-pattern instructions, distilled from CHEESY-TELLS.md, grouped by lineage. */
export const CHEESY_TELLS: readonly string[] = [
  // Imagery
  "no stock hero photography (smiling-headset teams, handshakes, laptop-at-a-cafe)",
  "no generic 3D blobs or AI-slop gradient swashes used as decoration",
  "no emoji standing in for iconography",
  "no mismatched icon families or inconsistent stroke weights",
  "no lorem-ipsum, fake avatars, or placeholder filler presented as finished",
  // Color
  "no flat 'made-it-dark' fills mistaken for depth — depth comes from layered elevation and hairline borders",
  "no accent color sprayed across resting borders, selected rows, or focus rings; reserve the accent for the single act/approve moment",
  "no muddy or arbitrary hex chosen to 'fill the box' instead of for the emotion it evokes",
  "no washed-out low-contrast text; hold legible contrast in both light and dark",
  "no cheesy flat gray masquerading as a light theme — a light surface is genuinely bright, with soft elevation",
  // Typography
  "no single-size single-weight flat hierarchy — carry it with real size and weight steps",
  "no default tracking on display type; large headings want tight negative tracking to read expensive",
  "no jittering proportional figures in numbers or metrics — use tabular figures",
  "no ALL-CAPS body copy and no center-aligned paragraphs; sentence case, left-aligned body",
  "no system-default leading everywhere; set deliberate line-height per tier",
  // Layout
  "no card-on-card-on-card nesting; one elevation step per level",
  "no everything-at-one-elevation flatness",
  "no endless scroll-wall of stacked sections; lead with the real work above the fold",
  "no hero/gradient banner plastered on a working surface eating a third of the viewport",
  "no off-grid arbitrary spacing (13px here, 19px there); keep a consistent rhythm",
  "no cramped or runaway measure; respect a readable line length",
  // Motion (applies to any animated or cinematic rendering)
  "no motion without a reduced-motion fallback",
  "no heavy particle/WebGL noise smeared across a working surface; concentrate spectacle where it earns its pixels",
  "no robotic fixed-duration linear easing; favor spring-weighted, staggered movement",
  "no dead spinner or bare modal as the loading moment",
  "no motion-for-motion's-sake bouncing that carries no meaning",
  // Copy / voice
  "no 'AI-powered', 'seamless', 'streamline', or 'empower' — write direct, confident, founder-grade",
  "no over-narrowing to 'coaching'; speak to practices, businesses, agencies, consultants, and advisors",
  "no consumer-finance or credit language of any kind",
  "no bracketed placeholders left in the output ([NAME], [BRACKET], [PLACEHOLDER])",
  "no internal jargon, backend table/function names, section numbers, or owner PII in visible copy",
  "no bare 'Loading…' or 'No data' dead ends",
  // Components / craft
  "no hand-rolled tables, KPI tiles, or empty states forked off raw cards",
  "no native unstyled select / checkbox / radio controls",
  "no raw JSON or code-dump shown as if it were finished product UI",
  "no glossy gradient buttons or heavy drop-shadow 'web 2.0' chrome",
] as const;

/**
 * The single-string form the forge substitutes into {{anti_patterns}}. Compact, comma-joined,
 * so it reads as one direct "avoid …" instruction inside a generation prompt.
 */
export const CHEESY_TELLS_AVOID: string = CHEESY_TELLS.join("; ");
