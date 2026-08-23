# Design system port — the tokens, the faces, the mark

The console was built on pre-existing shadcn tokens with the pack's design mapped onto
them. That is why it is not the palette. **Install the system; do not map onto another
one.** Everything below is lifted from `PAIGE Super Admin Shell v3.dc.html` verbatim.

Rule for this port, from the direction-of-accommodation ruling: these are values, not
suggestions. Where an existing token is close, it is still wrong. Do not alias `--pg-canvas`
to `--background` — that is the mapping that caused this.

---

## 1. The token system, verbatim

Scope is `[data-pg="dark"]` / `[data-pg="light"]` on the shell root. Both themes are
separately authored, not derived: **champagne inverts role between them.** In dark, gold is
light on a near-black ground (`--pg-gold #ead5aa`); in light, gold is a dark bronze on warm
paper (`--pg-gold #8b7049`). Neither is a filter of the other, and generating one from the
other will fail contrast in the direction that matters.

```css
[data-pg]{--pg-font-display:"Schibsted Grotesk","Segoe UI Variable Display","SF Pro Display",system-ui,sans-serif;--pg-font-ui:"Schibsted Grotesk","Segoe UI Variable Text","SF Pro Text",system-ui,sans-serif;--pg-font-editorial:"Gambetta","Newsreader","Iowan Old Style",Baskerville,serif;--pg-font-data:"JetBrains Mono",ui-monospace,"SFMono-Regular",Consolas,monospace;font-synthesis-weight:none;font-variant-numeric:tabular-nums}
[data-pg="dark"]{color-scheme:dark;--pg-env:#08070b;--pg-nav:#0d0b11;--pg-canvas:#100e14;--pg-spine:#121017;--pg-workspace:#16131a;--pg-surface:#19161e;--pg-raised:#211d27;--pg-artifact:#e9e4da;--pg-line-soft:rgba(244,237,222,.115);--pg-line:rgba(244,237,222,.195);--pg-line-strong:rgba(244,237,222,.30);--pg-line-authority:rgba(234,213,170,.40);--pg-ink:#f6f2ea;--pg-ink-2:#d6d0c9;--pg-muted:#aca69d;--pg-faint:#969089;--pg-gold-core:#fff0cf;--pg-gold:#ead5aa;--pg-gold-deep:#c7a978;--pg-gold-fill:#d4a752;--pg-gold-bloom:rgba(240,200,106,.28);--pg-graphite:#2a2730;--pg-lift:rgba(255,255,255,.018);--pg-violet:#9b8de0;--pg-positive:#8fd1ae;--pg-warning:#edc17f;--pg-negative:#eda093;--pg-e1:inset 0 1px rgba(255,255,255,.025);--pg-e2:0 1px 2px rgba(0,0,0,.45);--pg-e3:-20px 0 60px rgba(0,0,0,.22);--pg-e4:0 28px 70px rgba(0,0,0,.42);
--pg-rim:inset 0 1px 0 rgba(255,255,255,.07),inset 0 -1px 0 rgba(0,0,0,.5);
--pg-lift-1:inset 0 1px 0 rgba(255,255,255,.055),0 1px 1px rgba(0,0,0,.3),0 4px 12px -4px rgba(0,0,0,.42);
--pg-lift-2:inset 0 1px 0 rgba(255,255,255,.07),0 2px 4px rgba(0,0,0,.32),0 16px 34px -12px rgba(0,0,0,.52);
--pg-lift-3:inset 0 1px 0 rgba(255,255,255,.085),0 6px 12px rgba(0,0,0,.36),0 36px 72px -20px rgba(0,0,0,.62);
--pg-inset:inset 0 1px 2px rgba(0,0,0,.42),inset 0 -1px 0 rgba(255,255,255,.035);
--pg-r-plate:13px;--pg-r-chip:9px;--pg-r-seal:11px;--pg-r-pill:999px;--k-skill:#c7a978;--k-automation:#8fa9c4;--k-integration:#8fb9a4;--k-template:#c2a3b8;--k-agent:#a99ad6}
[data-pg="light"]{color-scheme:light;--pg-env:#e8e5df;--pg-nav:#f4f1eb;--pg-canvas:#fbf9f5;--pg-spine:#f1eee8;--pg-workspace:#f7f4ee;--pg-surface:#f5f2ec;--pg-raised:#fffdf8;--pg-artifact:#fffdf8;--pg-line-soft:rgba(45,40,50,.105);--pg-line:rgba(45,40,50,.185);--pg-line-strong:rgba(45,40,50,.28);--pg-line-authority:rgba(155,120,60,.44);--pg-ink:#201e23;--pg-ink-2:#3d3941;--pg-muted:#67616b;--pg-faint:#6a646e;--pg-gold-core:#6f5636;--pg-gold:#8b7049;--pg-gold-deep:#7a5c2e;--pg-gold-fill:#c9a96a;--pg-gold-bloom:rgba(201,169,106,.30);--pg-graphite:#b9b2a6;--pg-lift:rgba(45,40,50,.03);--pg-violet:#655a96;--pg-positive:#327458;--pg-warning:#986322;--pg-negative:#a5483d;--pg-e1:inset 0 1px rgba(255,255,255,.7);--pg-e2:0 1px 2px rgba(45,40,50,.10);--pg-e3:-20px 0 60px rgba(45,40,50,.08);--pg-e4:0 24px 60px rgba(45,40,50,.16);
--pg-rim:inset 0 1px 0 rgba(255,255,255,.9),inset 0 -1px 0 rgba(45,40,50,.07);
--pg-lift-1:inset 0 1px 0 rgba(255,255,255,.9),0 1px 1px rgba(45,40,50,.055),0 4px 10px -4px rgba(45,40,50,.12);
--pg-lift-2:inset 0 1px 0 rgba(255,255,255,.95),0 2px 4px rgba(45,40,50,.07),0 14px 30px -12px rgba(45,40,50,.17);
--pg-lift-3:inset 0 1px 0 #fff,0 6px 12px rgba(45,40,50,.09),0 32px 64px -20px rgba(45,40,50,.22);
--pg-inset:inset 0 1px 2px rgba(45,40,50,.1),inset 0 -1px 0 rgba(255,255,255,.85);
--pg-r-plate:13px;--pg-r-chip:9px;--pg-r-seal:11px;--pg-r-pill:999px;--k-skill:#9a7638;--k-automation:#4d6f92;--k-integration:#3f7a5f;--k-template:#8d5f7c;--k-agent:#6f5eb0}
[data-pg] ::-webkit-scrollbar{width:10px;height:10px}
[data-pg] ::-webkit-scrollbar-track{background:transparent}
[data-pg] ::-webkit-scrollbar-thumb{background:var(--pg-line-strong);border-radius:999px;border:3px solid transparent;background-clip:content-box}
[data-pg] ::-webkit-scrollbar-thumb:hover{background:var(--pg-faint);background-clip:content-box}
[data-pg] ::-webkit-scrollbar-corner{background:transparent}
[data-cm]{--cm-slash:var(--pg-gold-fill);--cm-orb:var(--pg-gold);--cm-pulse:5.2s}
[data-pg="dark"] [data-cm="dormant"]{--cm-slash:#8b7856;--cm-orb:#a08a62}
[data-pg="light"] [data-cm="dormant"]{--cm-slash:#a5854f;--cm-orb:#8a6a3c}
[data-cm="charged"]{--cm-slash:var(--pg-gold-fill);--cm-orb:var(--pg-gold-core);--cm-pulse:1.7s}
[data-cm="executed"]{--cm-slash:var(--pg-gold);--cm-orb:#fff6e2;--cm-pulse:1.1s}
[data-cm] circle{animation:pg-breathe var(--cm-pulse) cubic-bezier(.45,0,.55,1) infinite}
[data-cm] polygon{animation:pg-warm var(--cm-pulse) cubic-bezier(.45,0,.55,1) infinite}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;background:var(--pg-env);color:var(--pg-ink);font:400 14px/1.55 var(--pg-font-ui);letter-spacing:-.002em;-webkit-font-smoothing:antialiased;overflow:hidden}
h1,h2,h3,h4,p{margin:0}
a{color:var(--pg-gold-core);text-decoration:none}a:hover{color:var(--pg-gold)}
button{font:inherit;color:inherit;cursor:pointer}
:focus-visible{outline:2px solid var(--pg-gold-core);outline-offset:3px}
@keyframes pg-glow{0%,100%{opacity:.5}50%{opacity:.9}}
@keyframes pg-think{0%,80%,100%{opacity:.22;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
@keyframes pg-caret{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes pg-reveal{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
@keyframes pg-breathe{0%,100%{opacity:.72;filter:drop-shadow(0 0 .5px var(--pg-gold-bloom))}50%{opacity:1;filter:drop-shadow(0 0 3.5px var(--pg-gold-bloom))}}
@keyframes pg-warm{0%,100%{opacity:.86}55%{opacity:1}}
@keyframes pg-streak{0%{opacity:0;transform:translateX(12px) scaleX(.3)}40%{opacity:.8}100%{opacity:0;transform:translateX(-22px) scaleX(1.5)}}
@keyframes pg-drop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@keyframes pg-pin{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
@keyframes pg-materialize{from{opacity:0;transform:translateX(18px);clip-path:inset(0 0 0 100%)}to{opacity:1;transform:none;clip-path:inset(0)}}
@keyframes pg-roll{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
@keyframes pg-sweep{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}
@keyframes pg-mark-wait{0%,100%{opacity:.4;transform:rotate(45deg) scale(.84)}50%{opacity:1;transform:rotate(45deg) scale(1.1)}}
@keyframes pg-mark-think{to{transform:rotate(405deg)}}
@keyframes pg-edge{0%{opacity:.3;transform:scaleY(.35);transform-origin:top}50%{opacity:1;transform:scaleY(1)}100%{opacity:.3;transform:scaleY(.35);transform-origin:bottom}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style>
```

### What each family is for

| Family | Role |
|---|---|
| `--pg-env` → `-nav` → `-canvas` → `-spine` → `-workspace` → `-surface` → `-raised` | The depth ladder. Depth comes from **layered elevation**, never from darkening. `env` is the ground; `raised` is the top. |
| `--pg-artifact` | Paper — documents, printable things. Not a surface. |
| `--pg-line-soft` / `-line` / `-line-strong` / `-line-authority` | Four border weights. `line-authority` is reserved for a boundary that carries authority (scope, governance), never decoration. |
| `--pg-ink` / `-ink-2` / `-muted` / `-faint` | Four text weights. Nothing below `faint`. |
| `--pg-gold-core` / `-gold` / `-gold-deep` / `-gold-fill` / `-gold-bloom` | Gold is spent on **the act**. `gold-fill` opaque = the act. `gold-bloom` at low alpha = selection. The seam between them is **opacity, not hue**. |
| `--pg-e1`…`e4`, `--pg-rim`, `--pg-lift-1`…3`, `--pg-inset` | Elevation. `rim` seats a plate; `lift-1/2/3` raise it; `inset` presses it. Press states use `inset`, never a colour change. |
| `--pg-r-plate` 13px / `-chip` 9px / `-seal` 11px / `-pill` 999px | The only four radii. No ad-hoc values. |
| `--k-skill` / `-automation` / `-integration` / `-template` / `-agent` | Kind colours for catalogue entities. Identity, not decoration — an integration is always `--k-integration`. |

### Also in that block, and load-bearing

- **Scrollbars** are styled on `[data-pg]` — 10px, `--pg-line-strong` thumb, transparent
  track. A default OS scrollbar in either theme reads as a defect.
- **`:focus-visible`** is `2px solid var(--pg-gold-core)` at `outline-offset: 3px`. That is
  the console's focus treatment; a `--ring` token defined against white is not.
- **`prefers-reduced-motion`** kills every animation at the root. Port it with the tokens,
  not as a later pass.
- **The keyframe set** is the motion vocabulary. Motion only for real activity —
  `pg-breathe` / `pg-warm` on the mark, `pg-think` while she is working, `pg-materialize`
  when a surface is summoned. Nothing decorative loops.

---

## 2. The faces

```
--pg-font-display   "Schibsted Grotesk"  → display AND UI (one face doing both)
--pg-font-ui        "Schibsted Grotesk"
--pg-font-editorial "Gambetta", "Newsreader", serif
--pg-font-data      "JetBrains Mono"     → paths, ids, figures
```

Loaded from:

```html
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400&display=swap" rel="stylesheet">
<link href="https://api.fontshare.com/v2/css?f[]=gambetta@400,401,500&display=swap" rel="stylesheet">
```

**Bricolage Grotesque and Inter are not in this design.** Schibsted Grotesk replaces both.
Also note `font-synthesis-weight: none` and `font-variant-numeric: tabular-nums` on
`[data-pg]` — the second is why figures align in every table, and losing it will read as
sloppy typesetting rather than as a missing token.

Ladder: **11 / 13 / 16 / 21**. Body is `400 14px/1.55`, tracking `-.002em`.

---

## 3. The Command Mark

Not the landing page's orbital mark. `PaigeMark` is the marketing site's; the console's mark
is a **slash and orb** on a rimmed plate.

```html
<span data-cm="dormant|charged|executed" style="...plate: --pg-r-plate, --pg-rim...">
  <i><!-- rim inset --></i>
  <svg viewBox="0 0 48 48" style="width:26px;height:26px;filter:drop-shadow(0 1px 0 rgba(0,0,0,.45))" role="img" aria-label="PAIGE">
    <polygon points="21,13.6 30.5,13.6 21,34.4 11.5,34.4"
             fill="var(--cm-slash)" stroke="var(--cm-slash)"
             stroke-width="3.2" stroke-linejoin="round"></polygon>
    <circle cx="34.5" cy="30.5" r="5.5" fill="var(--cm-orb)"></circle>
  </svg>
</span>
```

Geometry is exact. The polygon is a four-point slash, the orb sits at `34.5, 30.5` with
`r=5.5`, and the `stroke-width: 3.2` + `stroke-linejoin: round` is what gives the slash its
weight — without the stroke it renders thin and wrong.

Three states, driving colour and pulse period:

| `data-cm` | Slash | Orb | Pulse |
|---|---|---|---|
| `dormant` | `#8b7856` dark / `#a5854f` light | `#a08a62` / `#8a6a3c` | 5.2s |
| `charged` | `--pg-gold-fill` | `--pg-gold-core` | 1.7s |
| `executed` | `--pg-gold` | `#fff6e2` | 1.1s |

Unset `data-cm` falls back to `--cm-slash: var(--pg-gold-fill)`, `--cm-orb: var(--pg-gold)`,
5.2s. The states are **derived from whether she is actually doing something** — dormant when
idle, charged when a command is staged, executed on completion. A mark that pulses at 1.1s
while nothing runs is the motion rule broken.

At small sizes the same shape renders with `fill="currentColor"` and no stroke (11–15px
inline glyphs beside "Ask" affordances). Same geometry, no plate.

---

## 4. Order of port

1. Tokens and faces first. Every value above, both themes, on `[data-pg]`.
2. Then the mark, with its states wired to real activity.
3. Then the ladder debt — last, because sizing type on the wrong faces is work thrown away.

Stopping the Fleet ladder pass to do this first is the right call.
