# PORT SPEC — Command palette (⌘K / summon) and six unported surfaces

> **SCOPE — owner ruling, 2026-08-23. This covers the palette and six surfaces ONLY.
> Everything else, read the pack.** This document does not enumerate v3 and must never be
> read as if it did. The index of the whole pack — every file, every render block, every
> catalogue, and what is unported — is `docs/design-references/PACK-INVENTORY-v3.md`,
> generated from the files themselves. Owner, verbatim: *"a partial transcription that
> advertises completeness is the exact mechanism that hid the spine."*
>
> Its Contents once listed eleven sections; five were ever written. The phantom six are
> struck below rather than filled in — the pack is the source, and a second partial
> transcription would repeat the failure at greater length.

> **What this document is.** A transcription of what Claude Design already drew, taken from
> **`docs/design-references/cd-packs/super-admin-shell-v3/PAIGE Super Admin Shell v3.dc.html`
> (11,358 lines)** and the two scripts that file loads in its `<helmet>` —
> `paige-ia.js` (2,651 lines, the IA/contract) and `mind-brain.js`. Nothing in this document is
> the transcriber's design judgement: no value was chosen, no gap was filled, no intent was
> inferred, no treatment was proposed. Every claim carries a pack line number so it can be
> checked against the source. Where the pack says nothing, this document says
> **PACK SILENT — ask CD** and never supplies a substitute. Per root `CLAUDE.md` §00 and
> `src/operator/CLAUDE.md`, Claude Design owns the design; this is a port record, not a review.
>
> **Line-number convention.** `L####` with no file prefix = `PAIGE Super Admin Shell v3.dc.html`.
> `paige-ia.js L####` is stated explicitly.
>
> **Reading the pack.** The `.dc.html` is a two-part document: a declarative template inside
> `<x-dc>` (roughly L69–L4190) bound with `{{ name }}` placeholders, `<sc-if value="{{ x }}">`
> and `<sc-for list="{{ xs }}" as="y">`; and a `class Component extends DCLogic` (L4202 onward)
> whose `renderVals()` (L10619) and per-surface `*Vals()` methods supply every one of those
> placeholders, including all inline style objects. **The geometry and tokens therefore live in
> the JS, not in the markup**, so both halves are quoted below for each surface.

---

## Contents

1. [The command palette / summon](#1-the-command-palette--summon)
2. [Calendar](#2-calendar)
3. [Platform hours](#3-platform-hours)
4. [Marketplace submissions](#4-marketplace-submissions)
5. [Support inbox](#5-support-inbox)

**That is the whole document.** Six further sections were once listed here — Compose,
Integrations grid, Collapse breakpoints, a consolidated PACK SILENT, pack self-contradictions
and fixture counts. They were never written, and by owner ruling they will not be: read the
pack for those surfaces, and `PACK-INVENTORY-v3.md` for the index. (§5's prose still refers to
"the Relationships → Conversations console (§6)" — that reference is to a section that does not
exist; the console is in the pack.)

---

## Design-system tokens referenced throughout

Defined at **L19–L45**. Reproduced here only so every token named later resolves; this is the
pack's own definition, unmodified.

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
```

Keyframes used by the surfaces in this spec (**L52–L67**):

```css
@keyframes pg-glow{0%,100%{opacity:.5}50%{opacity:.9}}
@keyframes pg-reveal{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
@keyframes pg-streak{0%{opacity:0;transform:translateX(12px) scaleX(.3)}40%{opacity:.8}100%{opacity:0;transform:translateX(-22px) scaleX(1.5)}}
@keyframes pg-drop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@keyframes pg-pin{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
@keyframes pg-materialize{from{opacity:0;transform:translateX(18px);clip-path:inset(0 0 0 100%)}to{opacity:1;transform:none;clip-path:inset(0)}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
```

The reduced-motion rule at **L67** is global and `!important`, so inline `animation:` declarations
in the template (e.g. the palette dropdown) are covered by it without a per-element guard.
Several JS-computed styles additionally read a `reduce` flag (`renderVals` **L10622**).

---

# 1. The command palette / summon

**Where it lives in the pack**

| Piece | Lines |
|---|---|
| Command bar + palette dropdown markup | **L128–L159** (inside the 58px canvas top bar, L128) |
| Voice / fold-spine buttons beside it | **L160–L175** |
| State keys `palette`, `summon`, `wsMode`, `command`, `mark`, `pins` | **L4203–L4206** |
| Deep-link `?surface=` open | **L4348–L4349** |
| Global keydown handler (all shortcuts) | **L4350–L4361** |
| `runVoice` / `runCommand` / `interrupt` | **L4387–L4413** |
| `openSummon` / `closeSummon` / `setWsMode` / `detachSummon` / `detachSpine` / `pinSummon` / `dropPin` | **L4414–L4436** |
| `togglePalette` | **L10725** |
| Command-bar state table (`cmd`) | **L10633–L10639** |
| Command-bar styles + mark orb/streak | **L10774–L10779** |
| `paletteOpen` / `paletteRowStyle` / `paletteGroups` | **L10781–L10789** |
| Capability KPI tiles (Settings → Capabilities) | **L10648–L10658** |
| Summoned-surface shell markup | **L2587–L2628**, rows + foot **L3789–L3803** |
| Summoned-surface geometry (`summonStyle` × 4 modes, `summonHeadStyle`, `wsModes`, `canvasStyle`) | **L10997–L11064** |
| Workspace-geometry glyph paths `G_WS` | **L4196–L4201** |
| The capability registry (`P.CAPS`) | `paige-ia.js` **L29–L48** |
| Autonomy labels/tones (`P.AUTONOMY`) | `paige-ia.js` **L50–L54** |
| Summoned-surface catalogue (`P.SUMMONS`) | `paige-ia.js` **L56–L122** |

## 1.1 Triggers

**Keystroke — `⌘K` / `Ctrl+K`.** L4350–L4352:

```js
    this.onKey = e => {
      const m = e.metaKey || e.ctrlKey;
      if (m && e.key.toLowerCase() === 'k') { e.preventDefault(); this.setState(s => ({ palette: !s.palette, command: 'focus', mark: 'charged' })); }
```

It **toggles**, and it always sets `command:'focus'` and `mark:'charged'` — including on the
close half of the toggle (L4352, as written).

**Escape closes it**, together with the authority gate and any open summon (L4359):

```js
      else if (e.key === 'Escape') this.setState({ palette:false, authority:false, summon:null, detached:false });
```

**Affordance — the command bar itself.** The whole bar is the click target (L130):
`onClick="{{ togglePalette }}"`. `togglePalette` (L10725) differs from the ⌘K path: it also
returns `command`/`mark` to rest when closing.

```js
      togglePalette:() => this.setState(x => ({ palette:!x.palette, command:x.palette ? 'rest' : 'focus', mark:x.palette ? 'dormant' : 'charged' })),
```

**Where it sits in the chrome.** L128 — a 58px band spanning the canvas grid, `z-index:6`,
`background:var(--pg-spine)`, `border-bottom:1px solid var(--pg-line-soft)`,
`box-shadow:var(--pg-e1)`, `padding:0 20px`, `gap:14px`. The command bar is
`<div style="position:relative;flex:1;min-width:0">` (L129) so the dropdown anchors to it.
The palette is **not** a centred modal; it is a dropdown under the bar.

**Other shortcuts registered by the same handler** (L4353–L4358) — listed because they share
the handler and several are advertised in the chrome:

```js
      else if (m && e.key === '.') { e.preventDefault(); this.interrupt(); }
      else if (m && e.key === '\\') { e.preventDefault(); e.altKey ? this.toggleRail() : this.toggleSpine(); }
      else if (m && e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); this.cycleScope(); }
      else if (m && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); this.exitScope(); }
      else if (m && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); this.toggleTheme(); }
      else if (m && e.shiftKey && e.key.toLowerCase() === 'v') { e.preventDefault(); this.runVoice(); }
```

Advertised in visible chrome: `⌘⇧T Scope` (L79), `Exit ⌘⇧X` (L81), `Hold to talk · ⌘⇧V`
(L161 `title`), `Fold PAIGE · ⌘\` (L169 `title`), `Fold · ⌘\` (L3851 `title`),
`Interrupt ⌘.` (L4149), `⌘⇧S` (L199 `title` on the Studio door — see §10.2),
`⌘↵` / `⌘S` (L10255 / L10258, sandbox face).

**Deep link.** L4348–L4349 — `?surface=<id>` opens that summon detached on load:

```js
    const params = new URLSearchParams(location.search);
    if (params.get('surface')) this.setState({ summon:params.get('surface'), wsMode:'detached', rail:'compact', spine:'collapsed' });
```

## 1.2 The command bar (closed state) — full markup

L130–L139, verbatim:

```html
          <div data-cmdbar="1" style="{{ commandBarStyle }}" onClick="{{ togglePalette }}">
            <span data-cm="{{ markState }}" style="flex:none;display:inline-grid;place-items:center;width:22px;height:22px">
              <svg viewBox="0 0 48 48" style="width:22px;height:22px;overflow:visible" aria-hidden="true">
                <g style="{{ streakStyle }}"><polygon points="21.5,15.5 29.5,15.5 21.7,32.5 13.7,32.5" fill="var(--pg-gold)" stroke="var(--pg-gold)" stroke-width="2.4" stroke-linejoin="round" opacity=".5"></polygon></g>
                <polygon points="21,13.6 30.5,13.6 21,34.4 11.5,34.4" fill="var(--cm-slash)" stroke="var(--cm-slash)" stroke-width="3.2" stroke-linejoin="round"></polygon>
                <circle cx="34.5" cy="30.5" r="5.5" fill="var(--cm-orb)" style="{{ orbStyle }}"></circle>
              </svg>
            </span>
            <span style="{{ commandTextStyle }}">{{ commandText }}</span>
            <span style="flex:none;color:var(--pg-faint);font:10px var(--pg-font-data)">{{ commandHint }}</span>
          </div>
```

Geometry (L10774–L10779):

```js
      commandBarStyle:{ display:'flex', alignItems:'center', gap:'12px', minHeight:'40px', padding:'0 16px 0 15px', borderRadius:'var(--pg-r-pill)', border:'1px solid ' + cmd.border, background:cmd.bg, boxShadow:cmd.glow, cursor:'text', transition:'border-color 200ms ease, background 200ms ease, box-shadow 200ms ease' },
      commandTextStyle:{ flex:1, minWidth:0, color:cmd.ink, fontSize:'13px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
      commandText:readOnly && s.command === 'rest' ? 'Enter a tenant scope to act' : cmd.text,
      commandHint:readOnly && s.command === 'rest' ? 'read-only' : cmd.hint,
      orbStyle:{ transition:'fill 180ms cubic-bezier(.22,1,.36,1)', filter:s.mark === 'executed' ? 'drop-shadow(0 0 5px rgba(255,246,226,.8))' : s.mark === 'charged' ? 'drop-shadow(0 0 4px rgba(240,200,106,.5))' : 'none' },
      streakStyle:{ opacity:s.mark === 'executed' && !reduce ? 1 : 0, animation:s.mark === 'executed' && !reduce ? 'pg-streak 520ms cubic-bezier(.16,1,.3,1) both' : 'none' },
```

`readOnly` is `s.scope === 1` (L10631) — the Reading scope from `P.SCOPES` (`paige-ia.js` L2621–L2625).

The mark's own colour states are CSS, not JS (L39–L45): `[data-cm]` sets `--cm-slash` /
`--cm-orb` / `--cm-pulse`, and `dormant` / `charged` / `executed` override them per theme.

## 1.3 The five command-bar states

**L10633–L10639**, verbatim — this is the complete state table. `s.command` is one of
`rest` · `focus` · `listening` · `understanding` · `executed`.

```js
    const cmd = {
      rest:{ text:'Direct PAIGE, or press ⌘K', hint:'⌘K', border:'var(--pg-line)', bg:'transparent', glow:'none', ink:'var(--pg-faint)' },
      focus:{ text:'What should she do?', hint:'▏', border:'var(--pg-line-strong)', bg:'var(--pg-surface)', glow:'var(--pg-e1)', ink:'var(--pg-ink)' },
      listening:{ text:'“Sweep the fleet and keep talking…”', hint:'● rec', border:'var(--pg-line-authority)', bg:'var(--pg-surface)', glow:'0 0 0 3px var(--pg-gold-bloom)', ink:'var(--pg-ink)' },
      understanding:{ text:'Working. Ask me anything meanwhile.', hint:'· · ·', border:'var(--pg-line-authority)', bg:'var(--pg-surface)', glow:'none', ink:'var(--pg-ink-2)' },
      executed:{ text:'Done · 5 categories swept', hint:'↩ open', border:'var(--pg-line-authority)', bg:'var(--pg-raised)', glow:'0 0 0 1px var(--pg-gold-bloom)', ink:'var(--pg-ink)' }
    }[s.command];
```

- The `focus` hint `▏` is the caret glyph. There is **no blinking-caret animation bound to it**
  in the pack; `@keyframes pg-caret` exists at **L54** but is not referenced by the command bar
  (grep for `pg-caret` returns only the keyframe definition and the composer's use).
- Opening the palette by either trigger puts the bar in `focus`.
- `runVoice` (L4387) sets `command:'listening'`, `mark:'charged'`, **and closes the palette**.
- `runCommand` (L4391–L4411) sets `understanding` → `executed` → back to `rest`, **and closes
  the palette** (L4399 `palette:false`).

## 1.4 The palette dropdown — full markup

**L141–L158**, verbatim. This is the complete open-state markup: container, group heading,
result row, and footer. There is no other palette markup anywhere in the pack.

```html
          <sc-if value="{{ paletteOpen }}" hint-placeholder-val="{{ false }}">
            <div role="listbox" aria-label="What PAIGE can do" style="position:absolute;z-index:8;left:0;right:0;top:calc(100% + 7px);max-height:min(60vh,470px);overflow:auto;background:var(--pg-raised);border:1px solid var(--pg-line-strong);box-shadow:var(--pg-e4);animation:pg-drop 140ms cubic-bezier(.22,1,.36,1) both">
              <sc-for list="{{ paletteGroups }}" as="grp" hint-placeholder-count="4">
                <p style="padding:12px 14px 5px;color:var(--pg-faint);font:500 11px var(--pg-font-ui);letter-spacing:.005em">{{ grp.name }}</p>
                <sc-for list="{{ grp.items }}" as="it" hint-placeholder-count="3">
                  <button onClick="{{ it.run }}" style="{{ paletteRowStyle }}">
                    <svg viewBox="0 0 16 16" style="flex:none;width:15px;height:15px;color:var(--pg-gold-deep)" aria-hidden="true"><path d="{{ it.path }}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="square" stroke-linejoin="round"></path></svg>
                    <span style="display:flex;flex-direction:column;min-width:0">
                      <b style="font:500 12.5px var(--pg-font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ it.label }}</b>
                      <small style="margin-top:2px;color:var(--pg-faint);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ it.note }}</small>
                    </span>
                    <span style="{{ it.autonomyStyle }}">{{ it.autonomy }}</span>
                  </button>
                </sc-for>
              </sc-for>
              <p style="padding:12px 14px 14px;border-top:1px solid var(--pg-line-soft);color:var(--pg-faint);font-size:11px;line-height:1.5">A capability opens its own surface and retires when you close it. None holds a place in the rail. Scope and autonomy live in Settings → Capabilities, or inline in the conversation.</p>
            </div>
          </sc-if>
```

**Dimensions and tokens, itemised**

| Element | Property | Value | Line |
|---|---|---|---|
| Container | position / z | `absolute`, `z-index:8` | L142 |
| Container | anchor | `left:0;right:0;top:calc(100% + 7px)` — full width of the command bar, 7px below it | L142 |
| Container | height cap | `max-height:min(60vh,470px)`, `overflow:auto` | L142 |
| Container | surface | `background:var(--pg-raised)` | L142 |
| Container | border | `1px solid var(--pg-line-strong)` | L142 |
| Container | elevation | `box-shadow:var(--pg-e4)` | L142 |
| Container | radius | **none declared** — square corners | L142 |
| Container | motion | `animation:pg-drop 140ms cubic-bezier(.22,1,.36,1) both` | L142 |
| Container | a11y | `role="listbox"`, `aria-label="What PAIGE can do"` | L142 |
| Group heading | box | `padding:12px 14px 5px` | L144 |
| Group heading | type | `font:500 11px var(--pg-font-ui)`, `letter-spacing:.005em`, `color:var(--pg-faint)` | L144 |
| Row | element | `<button>` | L146 |
| Row | box | `width:100%`, `min-height:52px`, `padding:0 14px`, `display:flex`, `gap:12px`, `align-items:center` | L10782 |
| Row | divider | `border:0; border-top:1px solid var(--pg-line-soft)` | L10782 |
| Row | fill / ink | `background:transparent`, `color:var(--pg-ink)`, `text-align:left` | L10782 |
| Row glyph | box | `width:15px;height:15px`, `flex:none`, `viewBox 0 0 16 16` | L147 |
| Row glyph | ink | `color:var(--pg-gold-deep)` | L147 |
| Row glyph | stroke | `fill:none`, `stroke-width:1.3`, `stroke-linecap:square`, `stroke-linejoin:round` | L147 |
| Row label | type | `font:500 12.5px var(--pg-font-ui)`, single-line ellipsis | L149 |
| Row note | type | `font-size:11px`, `color:var(--pg-faint)`, `margin-top:2px`, single-line ellipsis | L150 |
| Row autonomy tag | type | `font:600 9.5px var(--pg-font-ui)`, `letter-spacing:.07em`, `text-transform:uppercase`, `flex:none` | L10787 |
| Row autonomy tag | ink | `i.stub ? var(--pg-faint) : a.tone` | L10787 |
| Footer | box | `padding:12px 14px 14px`, `border-top:1px solid var(--pg-line-soft)` | L156 |
| Footer | type | `font-size:11px`, `line-height:1.5`, `color:var(--pg-faint)` | L156 |

**Row-style source** (L10782):

```js
      paletteRowStyle:{ width:'100%', minHeight:'52px', padding:'0 14px', display:'flex', alignItems:'center', gap:'12px', border:0, borderTop:'1px solid var(--pg-line-soft)', background:'transparent', color:'var(--pg-ink)', textAlign:'left' },
```

**Footer copy, verbatim** (L156):

> A capability opens its own surface and retires when you close it. None holds a place in the rail. Scope and autonomy live in Settings → Capabilities, or inline in the conversation.

## 1.5 What it can summon — the IA, verbatim

`paletteGroups` is built directly from `IA.CAPS` (L10783–L10789):

```js
      paletteGroups:IA.CAPS.map(g => ({ name:g.group, items:g.items.map(i => {
        const a = this.effAutonomy(i.id);
        return { label:i.label, note:i.note, path:i.path,
          autonomy:i.stub ? 'Coming soon' : a.label,
          autonomyStyle:{ flex:'none', color:i.stub ? 'var(--pg-faint)' : a.tone, font:'600 9.5px var(--pg-font-ui)', letterSpacing:'.07em', textTransform:'uppercase' },
          run:() => this.openSummon(i.id) };
      })})),
```

`P.CAPS` — `paige-ia.js` **L28–L48**, verbatim. **Four groups, ten entries.** These are the
pack's actual entries and categories, not a paraphrase:

```js
  // autonomy: 0 Autonomous · 1 Ask first · 2 Draft only
  P.CAPS = [
    { group: 'Reach out', items: [
      { id: 'email', label: 'Send an email', note: 'Composes, then delivers on your word', path: MAIL, autonomy: 1, scope: 'Current scope', substrate: 'Live' },
      { id: 'sequence', label: 'Run a sequence', note: 'Multi-step outbound against a segment', path: SEQ, autonomy: 1, scope: 'Campaigns', substrate: 'Live' }
    ]},
    { group: 'Build and connect', items: [
      { id: 'sandbox', label: 'Write and run code', note: 'Sandboxed. Output reviewable before it lands', path: CODE, autonomy: 2, scope: 'Sandbox only', substrate: 'No substrate', stub: true },
      { id: 'connect', label: 'Connect a tool', note: 'MCP or API. Scopes shown before consent', path: PLUG, autonomy: 1, scope: 'Platform', substrate: 'Stage 3' }
    ]},
    { group: 'Look things up', items: [
      { id: 'web', label: 'Search the web', note: 'Reads only. Cites sources or says nothing', path: GLOBE, autonomy: 0, scope: 'Read-only', substrate: 'No substrate', stub: true },
      { id: 'browse', label: 'Open a page', note: 'A browser she drives and you watch', path: WINDOW, autonomy: 2, scope: 'Read-only', substrate: 'No substrate', stub: true },
      { id: 'query', label: 'Query the platform', note: 'Reads within your scope, never past it', path: QUERY, autonomy: 0, scope: 'Current scope', substrate: 'Live' }
    ]},
    { group: 'Act on the fleet', items: [
      { id: 'sweep', label: 'Run a systems sweep', note: 'Skips reported as skips, never as passes', path: SWEEP, autonomy: 0, scope: 'Platform', substrate: 'Live' },
      { id: 'enter', label: 'Enter a tenant scope', note: 'Audited. Grants no membership row', path: KEY, autonomy: 1, scope: 'Two-key', substrate: 'Live' },
      { id: 'rule', label: 'Draft an alert rule', note: 'Composes it; the sweep evaluates it', path: BELL, autonomy: 2, scope: 'Platform', substrate: 'Stage 3' }
    ]}
  ];
```

Glyph path constants (`paige-ia.js` **L17–L26**), verbatim:

```js
  var MAIL = 'M2 4.2h12v7.6H2z M2 4.2l6 4.4 6-4.4';
  var CODE = 'M5.6 4.4L2.4 8l3.2 3.6 M10.4 4.4L13.6 8l-3.2 3.6 M9.2 3.2l-2.4 9.6';
  var PLUG = 'M6 2.4v3.2 M10 2.4v3.2 M4.4 5.6h7.2v2.8a3.6 3.6 0 0 1-7.2 0z M8 12v1.6';
  var GLOBE = 'M8 2.2a5.8 5.8 0 1 0 .1 0z M2.4 8h11.2 M8 2.2c1.6 1.8 2.4 3.8 2.4 5.8s-.8 4-2.4 5.8 M8 2.2C6.4 4 5.6 6 5.6 8s.8 4 2.4 5.8';
  var WINDOW = 'M2.2 3.4h11.6v9.2H2.2z M2.2 6h11.6';
  var SWEEP = 'M2.4 8.6l3.6 3.4 7.6-8 M2.4 4.4h3.6';
  var KEY = 'M9.8 3.2a3 3 0 1 0 2.2 5.1l1.6 1.6-1.2 1.2-1.6-1.6 M2.4 13.6l4.4-4.4';
  var BELL = 'M4.6 11.2V7.4a3.4 3.4 0 0 1 6.8 0v3.8z M3.2 11.2h9.6';
  var QUERY = 'M6.8 3a3.8 3.8 0 1 0 .1 0z M9.6 9.8L13.4 13.6';
  var SEQ = 'M3 4.4h10 M3 8h7 M3 11.6h4 M12 9.6l2 2-2 2';
```

Autonomy labels and tones (`paige-ia.js` **L50–L54**), verbatim:

```js
  P.AUTONOMY = [
    { label: 'Autonomous', tone: 'var(--pg-positive)' },
    { label: 'Ask first', tone: 'var(--pg-gold-deep)' },
    { label: 'Draft only', tone: 'var(--pg-violet)' }
  ];
```

The right-hand tag on a row is `'Coming soon'` when `i.stub` is true (`sandbox`, `web`,
`browse`), otherwise the effective autonomy label from `effAutonomy(i.id)` — which clamps the
capability's own setting against the Trust Compass ceiling (`cycleAutonomy` L4437–L4448,
`baseAutonomy` L4449).

**Beyond the ten CAPS entries**, `openSummon(id)` is the same entry point used by 20+ other
call sites for surfaces the palette itself does not list — `trust`, `finding`, `stages`, `deal`,
`review`, `owed`, `calset`, `studio`, `post`, `social`, `integration`, `builder`, `listing`,
`offer`, `campschema`, `segment`, `pipehealth`, `campstep`, `alertrule`, `automation`,
`autobuild`, `role`, `conversation`. All resolve through the same `P.SUMMONS` catalogue
(`paige-ia.js` L56–L122) and the same summoned-surface shell. Rail pins also route through it
(L10772).

## 1.6 States

The pack draws **exactly two palette states**: closed and open. Enumerated against the
requested list:

| Requested state | Present in pack? | Evidence |
|---|---|---|
| Closed | Yes | `paletteOpen:s.palette` L10781; `<sc-if>` L141; `s.palette` initialises `false` L4204 |
| Open — populated | Yes | L142–L157, all four groups always rendered |
| Open — empty | **Not drawn.** `paletteGroups` is `IA.CAPS` mapped with no filter (L10783); it can never be empty | — |
| Typing | **PACK SILENT.** There is no `<input>`, `<textarea>`, `contenteditable` or `onKeyDown` anywhere in L128–L159. The command bar is a `<div>`. No query state exists in `Component.state` (L4203–L4206) | — |
| Results / filtering | **PACK SILENT.** No filter, no match function, no ranking | — |
| No results | **PACK SILENT.** No empty-state node inside the dropdown | — |
| Selected / focused row | **PACK SILENT.** No `aria-selected`, no `aria-activedescendant`, no arrow-key handling, no `style-hover` on `paletteRowStyle`, no active/selected variant | — |

The one focus treatment that does apply is the document-wide rule at **L51**:
`:focus-visible{outline:2px solid var(--pg-gold-core);outline-offset:3px}` — so keyboard tabbing
through the rows gets a gold outline. That is the global rule, not a palette-specific state.

## 1.7 Motion

| Moment | Spec | Line |
|---|---|---|
| Palette opens | `pg-drop 140ms cubic-bezier(.22,1,.36,1) both` — `opacity 0→1`, `translateY(-6px)→0` | L142, keyframe L59 |
| Palette closes | **PACK SILENT** — the node is removed by `<sc-if>`; no exit animation is declared | L141 |
| Command-bar chrome | `transition:border-color 200ms ease, background 200ms ease, box-shadow 200ms ease` | L10774 |
| Mark orb fill | `transition:fill 180ms cubic-bezier(.22,1,.36,1)` + state-dependent `drop-shadow` | L10778 |
| Mark streak (on `executed`) | `pg-streak 520ms cubic-bezier(.16,1,.3,1) both`, suppressed when `reduce` | L10779, keyframe L58 |
| Mark breathe / warm | CSS on `[data-cm]`: `circle` → `pg-breathe var(--cm-pulse)`, `polygon` → `pg-warm var(--cm-pulse)`; `--cm-pulse` is `5.2s` dormant / `1.7s` charged / `1.1s` executed | L39–L45 |
| Summon opens (split) | `pg-materialize 340ms cubic-bezier(.22,1,.36,1) both` | L11043, keyframe L61 |
| Summon opens (slide-over) | `pg-materialize 240ms cubic-bezier(.22,1,.36,1) both` | L11054 |
| Summon opens (pop-out / detached) | `pg-drop 200ms cubic-bezier(.22,1,.36,1) both` | L11055–L11056 |
| Canvas regrid when a split summon opens | `transition:grid-template-columns 240ms cubic-bezier(.22,1,.36,1)` | L11040 |
| Rail pin appears | `pg-pin 200ms cubic-bezier(.22,1,.36,1) both`, suppressed when `reduce` | L10768, keyframe L60 |

## 1.8 The summoned surface (what a palette row opens)

`openSummon` (L4414) sets `summon:id`, closes the palette, and forces `wsMode:'split'`:

```js
  openSummon = id => this.setState({ summon:id, palette:false, wsMode:'split', command:'rest', mark:'dormant' });
  closeSummon = () => this.setState({ summon:null, wsMode:'split', detachBlocked:false });
```

**Shell markup, L2587–L2628 verbatim:**

```html
      <sc-if value="{{ summonOpen }}" hint-placeholder-val="{{ false }}">
        <section style="{{ summonStyle }}" aria-label="Summoned surface">
          <i style="position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,var(--pg-gold-core),var(--pg-violet),transparent)"></i>
          <header style="{{ summonHeadStyle }}">
            <div style="min-width:0">
              <p style="color:var(--pg-gold-deep);font:500 11px var(--pg-font-ui);letter-spacing:.005em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ summonKicker }}</p>
              <h2 style="margin-top:5px;font:600 13px var(--pg-font-display);letter-spacing:-.005em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ summonTitle }}</h2>
            </div>
            <div style="min-width:0;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px" role="group" aria-label="Workspace geometry">
              <sc-for list="{{ wsModes }}" as="m" hint-placeholder-count="4">
                <button onClick="{{ m.go }}" title="{{ m.label }}" aria-label="{{ m.label }}" style="{{ m.style }}" style-hover="color:var(--pg-gold-deep);border-color:var(--pg-line-strong);box-shadow:var(--pg-lift-2),inset 0 -2px 0 var(--pg-gold-deep);transform:translateY(-1px)" style-active="color:var(--pg-ink);box-shadow:var(--pg-inset);transform:translateY(0)">
                  <svg viewBox="0 0 16 16" style="width:14px;height:14px" aria-hidden="true">
                    <path d="{{ m.fill }}" fill="currentColor" opacity=".14"></path>
                    <path d="{{ m.frame }}" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round"></path>
                    <path d="{{ m.accent }}" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round" stroke-linecap="round"></path>
                  </svg>
                </button>
              </sc-for>
              <button onClick="{{ pinSummon }}" title="Keep this in the rail" aria-label="Pin to rail" style="position:relative;width:30px;height:30px;display:grid;place-items:center;border:1px solid var(--pg-line);border-radius:var(--pg-r-chip);background:var(--pg-raised);box-shadow:var(--pg-lift-1);color:var(--pg-muted);transition:color .16s ease,border-color .16s ease,box-shadow .16s ease,transform .16s ease" style-hover="color:var(--pg-gold-deep);border-color:var(--pg-line-strong);box-shadow:var(--pg-lift-2),inset 0 -2px 0 var(--pg-gold-deep);transform:translateY(-1px)" style-active="color:var(--pg-ink);box-shadow:var(--pg-inset);transform:translateY(0)">
                <svg viewBox="0 0 16 16" style="width:14px;height:14px" aria-hidden="true">
                  <path d="M4.7 3h6.6v10.2L8 10.7l-3.3 2.5z" fill="currentColor" opacity=".14"></path>
                  <path d="M4.7 3h6.6v10.2L8 10.7l-3.3 2.5z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"></path>
                </svg>
              </button>
              <button onClick="{{ closeSummon }}" title="Retire" aria-label="Retire this surface" style="position:relative;width:30px;height:30px;display:grid;place-items:center;border:1px solid var(--pg-line);border-radius:var(--pg-r-chip);background:var(--pg-raised);box-shadow:var(--pg-lift-1);color:var(--pg-muted);transition:color .16s ease,border-color .16s ease,box-shadow .16s ease,transform .16s ease" style-hover="color:var(--pg-negative);border-color:var(--pg-negative);box-shadow:var(--pg-lift-2),inset 0 -2px 0 var(--pg-negative);transform:translateY(-1px)" style-active="color:var(--pg-ink);box-shadow:var(--pg-inset);transform:translateY(0)">
                <svg viewBox="0 0 16 16" style="width:14px;height:14px" aria-hidden="true">
                  <path d="M4.5 4.5l7 7 M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"></path>
                </svg>
              </button>
            </div>
          </header>
          <div style="flex:1;min-height:0;overflow:auto;padding:18px 16px 20px">
            <sc-if value="{{ summonDetached }}" hint-placeholder-val="{{ false }}">
              <div style="margin-bottom:16px;padding:13px 15px;background:var(--pg-raised);border-left:1px solid var(--pg-violet)">
                <b style="display:block;font:600 12px var(--pg-font-ui)">Running in its own window</b>
                <p style="max-width:56ch;margin-top:7px;color:var(--pg-muted);font-size:11.5px;line-height:1.55">The surface keeps this session's scope over a <code style="font:11px var(--pg-font-data);color:var(--pg-gold)">BroadcastChannel</code> and repaints the same tenant band. Switching scope in any window repaints them all. Client half only — the session token, cross-window gate locking and the freshness heartbeat are server-side and land with Stage 4.</p>
                <sc-if value="{{ detachBlocked }}" hint-placeholder-val="{{ false }}">
                  <p style="margin-top:9px;padding-top:9px;border-top:1px solid var(--pg-line);color:var(--pg-warning);font-size:11.5px;line-height:1.55">This host blocked the new window, so the detached geometry is shown in place. On a real desktop this opens as its own OS window.</p>
                </sc-if>
              </div>
            </sc-if>
            <p style="max-width:60ch;color:var(--pg-muted);font-size:12.5px;line-height:1.6;text-wrap:pretty">{{ summonDeck }}</p>
```

…and the tail of the same panel, **L3789–L3803 verbatim** (the per-capability row ledger and foot):

```html
            <div style="margin-top:18px;border-top:1px solid var(--pg-line)">
              <sc-for list="{{ summonRows }}" as="sr" hint-placeholder-count="3">
                <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;min-height:54px;padding:0 2px;border-bottom:1px solid var(--pg-line-soft)">
                  <span style="display:flex;flex-direction:column;min-width:0">
                    <b style="font:500 12.5px var(--pg-font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ sr.name }}</b>
                    <small style="margin-top:3px;color:var(--pg-faint);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ sr.detail }}</small>
                  </span>
                  <span style="{{ sr.statusStyle }}">{{ sr.status }}</span>
                </div>
              </sc-for>
            </div>
            <p style="margin-top:14px;color:var(--pg-faint);font-size:11px;line-height:1.55">{{ summonFoot }}</p>
          </div>
        </section>
      </sc-if>
```

Everything between L2628 and L3789 is a stack of `<sc-if>` blocks for the bespoke summon bodies
(finding, review, stage builder, deal, integration panel, campaign step, studio, calendar
settings, automation builder, segment builder, …). Only the shared shell is transcribed here;
the individual bodies belong to their own surfaces.

**Four workspace geometries — full style set, L11005–L11064 verbatim:**

```js
      wsModes:((s.canvasW || 900) < 520
        ? [{ id:'cycle', label:'Next geometry — ' + (['Slide-over','Pop-out','Detach','Split'][['split','slideover','popout','detached'].indexOf(String(s.wsMode).replace('-','')) + 1] || 'Slide-over'), glyph:G_WS.popout }]
        : [
        { id:'split', label:'Split', glyph:G_WS.split },
        { id:'slideover', label:'Slide-over', glyph:G_WS.slideover },
        { id:'popout', label:'Pop-out', glyph:G_WS.popout },
        { id:'detached', label:'Detach', glyph:G_WS.detached }
      ]).map(m => ({ label:m.label, fill:m.glyph[0], frame:m.glyph[1], accent:m.glyph[2],
        go:m.id === 'detached' ? this.detachSummon
          : m.id === 'cycle' ? (() => {
              const order = ['split', 'slideover', 'popout', 'detached'];
              const next = order[(order.indexOf(String(s.wsMode).replace('-', '')) + 1) % order.length];
              return next === 'detached' ? this.detachSummon() : this.setWsMode(next);
            })
          : (() => this.setWsMode(m.id)),
        style:{ position:'relative', width:'30px', height:'30px', display:'grid', placeItems:'center', borderRadius:'var(--pg-r-chip)',
          border:'1px solid ' + (s.wsMode === m.id ? 'var(--pg-gold-deep)' : 'var(--pg-line)'),
          background:s.wsMode === m.id ? 'var(--pg-gold-bloom)' : 'var(--pg-raised)',
          boxShadow:s.wsMode === m.id ? 'var(--pg-lift-2), inset 0 -2px 0 var(--pg-gold-deep)' : 'var(--pg-lift-1)',
          color:s.wsMode === m.id ? 'var(--pg-gold)' : 'var(--pg-muted)',
          transition:'color .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease' } })),
      detachBlocked:s.detachBlocked,
      summonTitle:sm ? sm.title : '',
      summonKicker:s.summon === 'stages' ? 'Configuration · pipeline schema'
        : s.summon === 'deal' ? 'Record · inspector'
        : s.summon === 'trust' ? 'Authority · how much room she has'
        : s.summon === 'finding' ? 'Systems check · finding'
        : 'Capability · summoned',
      summonDeck:sm ? sm.deck : '',
      summonFoot:sm ? sm.foot : '',
      summonRows:(s.summon === 'pipehealth' ? this.pipelineOverrides().ledger.rows
        : sm ? (sm.rows || []) : []).map(r => ({ name:r.name, detail:r.detail, status:r.status, statusStyle:{ color:r.tone, font:'600 9.5px var(--pg-font-ui)', letterSpacing:'.07em', textTransform:'uppercase', whiteSpace:'nowrap' } })),
      canvasStyle:{ position:'relative', minWidth:0, minHeight:0, background:'var(--pg-canvas)', display:'grid', gridTemplateRows:'58px minmax(0,1fr)', gridTemplateColumns:(s.summon && s.wsMode === 'split') ? 'minmax(320px,1fr) minmax(0,52%)' : 'minmax(0,1fr)', transition:'grid-template-columns 240ms cubic-bezier(.22,1,.36,1)' },
      summonStyle:{
        split:{ position:'relative', gridColumn:2, gridRow:2, minWidth:0, minHeight:0, display:'flex', flexDirection:'column', background:'var(--pg-workspace)', borderLeft:'1px solid var(--pg-line-strong)', boxShadow:'var(--pg-e4)', overflow:'hidden', animation:reduce ? 'none' : 'pg-materialize 340ms cubic-bezier(.22,1,.36,1) both' },
        slideover:{ position:'absolute', zIndex:8, right:0, top:'58px', bottom:0,
          width:(s.canvasW || 900) < 700 ? '100%' : 'clamp(320px,44%,400px)',
          left:(s.canvasW || 900) < 700 ? 0 : 'auto',
          top:(s.canvasW || 900) < 700 ? 'auto' : '58px',
          height:(s.canvasW || 900) < 700 ? '64%' : 'auto',
          borderTop:(s.canvasW || 900) < 700 ? '1px solid var(--pg-line-strong)' : 0,
          display:'flex', flexDirection:'column', background:'var(--pg-workspace)', borderLeft:'1px solid var(--pg-line-strong)', boxShadow:'-28px 0 70px rgba(0,0,0,.34)', overflow:'hidden', animation:reduce ? 'none' : 'pg-materialize 240ms cubic-bezier(.22,1,.36,1) both' },
        popout:{ position:'absolute', zIndex:8, left:'14%', top:'16%', width:'clamp(340px,56%,640px)', maxWidth:'calc(100% - 32px)', height:'clamp(300px,62%,560px)', display:'flex', flexDirection:'column', background:'var(--pg-workspace)', border:'1px solid var(--pg-line-authority)', borderRadius:'3px', boxShadow:'0 28px 90px rgba(0,0,0,.55), 0 0 0 1px var(--pg-gold-bloom)', overflow:'hidden', animation:reduce ? 'none' : 'pg-drop 200ms cubic-bezier(.22,1,.36,1) both' },
        detached:{ position:'absolute', zIndex:8, left:'10%', top:'12%', width:'clamp(360px,60%,680px)', maxWidth:'calc(100% - 32px)', height:'clamp(320px,68%,620px)', display:'flex', flexDirection:'column', background:'var(--pg-workspace)', border:'1px solid var(--pg-violet)', borderRadius:'3px', boxShadow:'0 28px 90px rgba(0,0,0,.55), 0 0 0 1px rgba(155,141,224,.25)', overflow:'hidden', animation:reduce ? 'none' : 'pg-drop 200ms cubic-bezier(.22,1,.36,1) both' }
      }[String(s.wsMode).replace('-', '')] || null,
      summonHeadStyle:{ flex:'none', minWidth:0, minHeight:'60px', padding:'12px 14px',
        display:'grid', gap:(s.canvasW || 900) < 520 ? '9px' : '12px',
        gridTemplateColumns:(s.canvasW || 900) < 520 ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,auto)',
        alignItems:'center', borderBottom:'1px solid var(--pg-line)' },
```

Geometry glyphs (**L4196–L4201**) — `[fill, frame, accent]` per mode:

```js
const G_WS = {
  split:      ['M8.6 4.1h4.8v7.8H8.6z',  'M2.6 3.5h10.8v9H2.6z M8.6 3.5v9', ''],
  slideover:  ['M10 4.1h3.4v7.8H10z',    'M2.6 3.5h10.8v9H2.6z M10 3.5v9',  'M7.5 6.4L5.6 8l1.9 1.6'],
  popout:     ['M6.2 3.2h7.2v7.2H6.2z',  'M6.2 3.2h7.2v7.2H6.2z M10.2 6.6v6.2H2.6V6.6z', ''],
  detached:   ['',                        'M11.1 9.5v3.9H2.6V4.9h3.9 M9.5 2.6h3.9v3.9', 'M13.4 2.6L8.1 7.9']
};
```

Detach / re-attach / pin behaviour (**L4415–L4436 verbatim**):

```js
  closeSummon = () => this.setState({ summon:null, wsMode:'split', detachBlocked:false });
  setWsMode = m => this.setState({ wsMode:m, detachBlocked:false, announcement:'Workspace ' + m });
  detachSummon = () => {
    const s = this.state;
    if (s.wsMode === 'detached') { this.setState({ wsMode:'split', detachBlocked:false, announcement:'Re-attached' }); return; }
    const url = location.pathname + location.search + (location.search ? '&' : '?') + 'surface=' + encodeURIComponent(s.summon || 'sweep') + '&sid=' + this.sid;
    let w = null;
    try { w = window.open(url, 'paige-' + s.summon, 'width=820,height=640'); } catch (e) { w = null; }
    this.setState({ wsMode:'detached', detachBlocked:!w, announcement:w ? 'Opened in its own window' : 'The host blocked a new window; showing the detached geometry in place' });
  };
  detachSpine = () => {
    if (this.state.spineDetached) { this.setState({ spineDetached:false, announcement:'Conversation re-docked' }); return; }
    let w = null;
    try { w = window.open(location.pathname + location.search + (location.search ? '&' : '?') + 'surface=conversation&sid=' + this.sid, 'paige-conversation', 'width=520,height=760'); } catch (e) { w = null; }
    this.setState({ spineDetached:true, detachBlocked:!w, announcement:w ? 'Conversation on its own monitor' : 'The host blocked a new window' });
  };
  pinSummon = () => this.setState(s => {
    const t = (window.PAIGE_IA && window.PAIGE_IA.SUMMONS[s.summon]) || { title:'Surface' };
    if (s.pins.some(p => p.id === s.summon)) return { announcement:'Already in the rail' };
    return { pins:[...s.pins, { id:s.summon, label:t.title, reason:'You kept this' }], announcement:'Kept in the rail' };
  });
  dropPin = id => this.setState(s => ({ pins:s.pins.filter(p => p.id !== id) }));
```

`detachSummon` opens a real window at **820 × 640**; `detachSpine` at **520 × 760**.

## 1.9 The ten palette capabilities' summoned bodies — verbatim from `P.SUMMONS`

`paige-ia.js` **L80–L121**. Each is `{ title, deck, foot, rows[] }`; rows render through the
shared ledger at L3789–L3799.

```js
    sweep: { title: 'Systems sweep', deck: 'Started from the command bar. It holds no rail slot — close it and it retires, and the run joins Fleet’s own history tab.', foot: 'Reads paige_systems_check_run at tenant_id IS NULL. A run in flight reads still running, never a verdict it has not reached.', rows: [
      { name: 'Resolver integrity', detail: '6 of 6 checks', status: 'Pass', tone: 'var(--pg-positive)' },
      { name: 'RLS posture', detail: '11 of 11 forced', status: 'Pass', tone: 'var(--pg-positive)' },
      { name: 'Migration drift', detail: 'An edge function cannot read git', status: 'Unreadable', tone: 'var(--pg-faint)' },
      { name: 'Provisioning queue', detail: '2 tenants awaiting first run', status: 'Attention', tone: 'var(--pg-warning)' }
    ]},
    web: { title: 'Web search', deck: 'A reading surface, not a destination. Sources are listed or the answer is withheld.', foot: 'No substrate: there is no operator-scope search seam. Stage 3 owns the fetch path and the citation record.', rows: [
      { name: 'Query surface', detail: 'Takes a question, returns sources', status: 'Design only', tone: 'var(--pg-negative)' },
      { name: 'Citation record', detail: 'Every claim carries a source or is dropped', status: 'Design only', tone: 'var(--pg-negative)' }
    ]},
    browse: { title: 'Browser', deck: 'PAIGE drives a page and you watch it happen. Draft only by default — she navigates and reads; any act on the page opens an authority gate.', foot: 'No substrate. Stage 3 owns the session, the frame relay, and the per-domain consent record.', rows: [
      { name: 'Navigation', detail: 'Read and traverse', status: 'Design only', tone: 'var(--pg-negative)' },
      { name: 'Form submission', detail: 'Authority gate at the act', status: 'Design only', tone: 'var(--pg-negative)' }
    ]},
    sandbox: { title: 'Sandbox', deck: 'Where she writes and runs her own code. Draft only: output is reviewable and nothing reaches the platform without an authorized act.', foot: 'No substrate. Stage 3 owns the isolated runtime, the resource ceiling, and the record of what ran.', rows: [
      { name: 'Isolated runtime', detail: 'No platform credentials in scope', status: 'Design only', tone: 'var(--pg-negative)' },
      { name: 'Output review', detail: 'Diff before anything lands', status: 'Design only', tone: 'var(--pg-negative)' }
    ]},
    connect: { title: 'Connect a tool', deck: 'Scopes are shown before consent, and the grant is revocable from Settings without touching the integration.', foot: 'Substrate partial: integration seams exist, a unified control does not. Stage 3 owns the consent record.', rows: [
      { name: 'Scope disclosure', detail: 'What it reads, what it writes', status: 'Design only', tone: 'var(--pg-negative)' },
      { name: 'Revocation', detail: 'Revoke without removing the tool', status: 'Stage 3', tone: 'var(--pg-warning)' }
    ]},
    email: { title: 'Compose', deck: 'Ask first: she composes in full, and delivery waits on you. Approving sends exactly once and records it.', foot: 'Live. Delivery routes through the existing send seam — no second stack.', rows: [
      { name: 'Draft', detail: 'Composed against the record in scope', status: 'Ready', tone: 'var(--pg-positive)' },
      { name: 'Delivery', detail: 'Sends once. Cannot be undone', status: 'Waiting on you', tone: 'var(--pg-gold-deep)' }
    ]},
    sequence: { title: 'Sequence', deck: 'Multi-step outbound against a segment. Each step is a separate act, and the whole run can be halted mid-flight.', foot: 'Live. Steps write to the same send seam a single message does.', rows: [
      { name: 'Segment', detail: 'Resolved from Relationships', status: 'Ready', tone: 'var(--pg-positive)' },
      { name: 'Step schedule', detail: '4 steps over 11 days', status: 'Waiting on you', tone: 'var(--pg-gold-deep)' }
    ]},
    query: { title: 'Query', deck: 'Reads within your current scope and never past it. The scope in the band is the scope of the answer.', foot: 'Live. Every read is RLS-bound; an operator with no tenant scope sees platform rows only.', rows: [
      { name: 'Scope', detail: 'Matches the band above', status: 'Bound', tone: 'var(--pg-positive)' },
      { name: 'Result', detail: 'Figures, with the read that produced them', status: 'Ready', tone: 'var(--pg-positive)' }
    ]},
    enter: { title: 'Tenant scope', deck: 'Audited on entry. Points active_tenant_id at the tenant and grants no membership row, so the roster and seat count are untouched.', foot: 'Live. Proved on prod: members_before=0 members_after=0 delta=0.', rows: [
      { name: 'Audit row', detail: 'paige_audit_log, on entry and exit', status: 'Live', tone: 'var(--pg-positive)' },
      { name: 'Membership delta', detail: 'Always zero', status: 'Live', tone: 'var(--pg-positive)' }
    ]},
    rule: { title: 'Alert rule', deck: 'She composes the rule; the five-minute sweep evaluates it. A rule bound to an unreadable signal reports never evaluated, never a pass.', foot: 'Schema and evaluator ship. Surface wiring is Stage 3, and delivery sits at pending until the channel adapters land.', rows: [
      { name: 'Condition', detail: 'Against the signal catalogue', status: 'Stage 3', tone: 'var(--pg-warning)' },
      { name: 'Delivery', detail: 'Every firing pending until A3', status: 'No substrate', tone: 'var(--pg-negative)' }
    ]}
```

Note the `rule` foot and its `Delivery` row still say delivery is unbuilt; `corrections-2026-08-23.md`
§2 states A3 landed and the contract was corrected elsewhere. Flagged, not resolved — see §10.5.

## FIXTURES — do not port (command palette / summon)

| # | Fixture | Line |
|---|---|---|
| 1 | `executed` bar text `'Done · 5 categories swept'` — invented count | L10638 |
| 2 | `listening` bar text `'“Sweep the fleet and keep talking…”'` — invented sample utterance | L10636 |
| 3 | Seeded rail pin `{id:'firing',label:'Alert firing',reason:'Pending delivery since 13:47'}` — invented timestamp | L4205 |
| 4 | `runCommand` three trace steps — invented model reasoning | L4393–L4397 |
| 5 | `runCommand` answer string — invented model output, plus the hard-coded reveal cuts `[46, 104, …]` and 700/1400/2100/2650/3200/4900ms script | L4398, L4401–L4410 |
| 6 | `sweep` row `Resolver integrity — '6 of 6 checks'` | `paige-ia.js` L81 |
| 7 | `sweep` row `RLS posture — '11 of 11 forced'` | `paige-ia.js` L82 |
| 8 | `sweep` row `Provisioning queue — '2 tenants awaiting first run'` | `paige-ia.js` L84 |
| 9 | `sequence` row `Step schedule — '4 steps over 11 days'` | `paige-ia.js` L108 |
| 10 | `enter` foot `'Proved on prod: members_before=0 members_after=0 delta=0.'` — a claim about a real run | `paige-ia.js` L114 |

**Structure that DOES come over verbatim** (per `src/operator/CLAUDE.md`, "structure is design,
values are data"): all four group names, all ten capability labels/notes/glyph paths, the three
autonomy labels and tones, the `'Coming soon'` stub tag, the footer paragraph, every
`title`/`deck`/`foot` string in `P.SUMMONS`, and every row `name`/`status` pair. Only the
`detail` figures listed above are fixtures.

The palette KPI tiles on Settings → Capabilities (**L10653–L10658**) are **derived, not typed** —
`allCaps.length` and the `tally[]` counts come from `IA.CAPS` — so their values are structure:

```js
    const capKpis = [
      { label:'Capabilities', value:String(allCaps.length), note:'Reached from ⌘K, not the rail' },
      { label:'Autonomous', value:String(tally[0]), note:'Acts and reports' },
      { label:'Ask first', value:String(tally[1]), note:'Opens an authority gate' },
      { label:'Draft only', value:String(tally[2]), note:'Composes, never delivers' }
    ].concat(tally[3] ? [{ label:'Held', value:String(tally[3]), note:'Below the Trust Compass ceiling' }] : []);
```

## PACK SILENT — ask CD (command palette)

1. **No text input / query field.** The command bar is a `<div>` with static text (L130–L139).
   Searched: `<input`, `<textarea`, `contenteditable`, `onKeyDown`, `onInput`, `onChange` within
   L128–L159; `paletteQuery`, `paletteInput`, `intQ`-style query keys in `Component.state`
   (L4203–L4206). None exist.
2. **No typing / filtering / no-results state.** Searched: `filter` across the whole file — the
   34 hits are all other surfaces (runs, integrations, submissions, threads, people). Nothing
   filters `paletteGroups`.
3. **No selected / focused / hovered row treatment.** `paletteRowStyle` has no hover, active,
   or selected variant, and the row `<button>` at L146 carries no `style-hover` /
   `style-active` (unlike, e.g., L161, L2597, L2605, L2611, L1631, L2292 which all do).
4. **No arrow-key navigation or `aria-activedescendant`.** The container is `role="listbox"`
   (L142) but the children are `<button>`, not `role="option"`, and nothing sets
   `aria-selected`.
5. **No close animation.**
6. **Palette rows have no visible keyboard hint / shortcut column.**

---

# 2. Calendar

**Route in the pack:** `Relationships → Calendar` (`DEST.relationships.views`,
`paige-ia.js` **L195**: `views: ['People', 'Conversations', 'Calendar', 'Segments']`).
Gate: `showField:s.dest === 'relationships' && viewName === 'Calendar'` (**L10952**).

**IMPORTANT — what the pack actually draws.** The v3 pack draws a **five-column
Monday–Friday week ruler**, headed **`This week`**, with six hour rows. It draws **no month
grid**. See §3 and §9 for the searches that establish this.

| Piece | Lines |
|---|---|
| Week-field markup | **L2547–L2581** |
| Field / owed / settings-button styles + per-view page overrides | **L11201–L11232** |
| `fieldDays`, `fieldRows` | **L10988–L10993** |
| Calendar-settings summon markup (`calset`) | **L3121–L3138** |
| Calendar-settings values | **L7166–L7185** |
| Calendars list + new-calendar form (Campaigns-side scheduling surface) | **L2941–L3010** |
| `FIELD_HOURS` / `FIELD_PLAN` / `FIELD_KINDS` | `paige-ia.js` **L2627–L2647** |
| `CALSET` | `paige-ia.js` **L2586–L2595** |
| `SUMMONS.owed` / `SUMMONS.calset` | `paige-ia.js` **L67–L73** |

## 2.1 Markup — verbatim, L2547–L2581

```html
          <sc-if value="{{ showField }}" hint-placeholder-val="{{ false }}">
            <div style="{{ fieldWrapStyle }}">
              <div style="flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:7px 14px;margin-bottom:12px">
                <h2 style="flex:none;font:600 13px var(--pg-font-display);letter-spacing:-.005em">This week</h2>
                <small style="flex:1;min-width:80px;color:var(--pg-faint);font:10px var(--pg-font-data);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Representative · no calendar connected</small>
                <button onClick="{{ openOwed }}" style="{{ owedBtnStyle }}">
                  <i style="{{ owedMarkStyle }}"></i>Needs you today<small style="{{ owedNStyle }}">{{ owedN }}</small>
                </button>
                <button onClick="{{ openCalSet }}" style="{{ calSetBtnStyle }}" title="Working hours, protected focus, quiet hours">Calendar settings</button>
              </div>
              <div style="{{ fieldGridStyle }}">
                <div style="box-shadow:inset -1px 0 0 var(--pg-line-soft)"></div>
                <sc-for list="{{ fieldDays }}" as="d" hint-placeholder-count="5">
                  <div style="padding:9px 10px;box-shadow:inset -1px 0 0 var(--pg-line-soft)">
                    <b style="display:block;font:600 10px var(--pg-font-ui);letter-spacing:.07em;text-transform:uppercase">{{ d.day }}</b>
                    <small style="display:block;margin-top:2px;color:var(--pg-faint);font:10px var(--pg-font-data)">{{ d.date }}</small>
                  </div>
                </sc-for>
                <sc-for list="{{ fieldRows }}" as="fr" hint-placeholder-count="6">
                  <div style="padding:8px 8px 8px 0;text-align:right;box-shadow:inset -1px 0 0 var(--pg-line-soft);border-top:1px solid var(--pg-line-soft)">
                    <small style="color:var(--pg-faint);font:10px var(--pg-font-data)">{{ fr.hour }}</small>
                  </div>
                  <sc-for list="{{ fr.cells }}" as="cell" hint-placeholder-count="5">
                    <div style="min-height:54px;padding:5px;box-shadow:inset -1px 0 0 var(--pg-line-soft);border-top:1px solid var(--pg-line-soft)">
                      <sc-if value="{{ cell.has }}" hint-placeholder-val="{{ false }}">
                        <div style="{{ cell.style }}">
                          <b style="display:block;font:600 10.5px var(--pg-font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ cell.label }}</b>
                          <small style="display:block;margin-top:2px;color:var(--pg-muted);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ cell.meta }}</small>
                        </div>
                      </sc-if>
                    </div>
                  </sc-for>
                </sc-for>
              </div>
            </div>
          </sc-if>
```

## 2.2 Geometry and tokens — verbatim, L11204–L11232

```js
      ...(s.dest === 'relationships' && viewName === 'Calendar'
        ? { showKpis:false, showTape:false, tape:[], surfaceDeck:'',
            showLedger:false, hasAbsence:false,
            headerStyle:{ display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', gap:'24px',
              alignItems:'baseline', paddingBottom:'10px' },
            mainStyle:{ position:'relative', gridColumn:1, gridRow:2, minWidth:0, minHeight:0, overflow:'hidden' },
            pageStyle:{ width:'min(100%,1160px)', height:'100%', margin:'0 auto',
              padding:'22px clamp(20px,2.4vw,36px) 0', display:'flex', flexDirection:'column', minHeight:0 },
            fieldWrapStyle:{ flex:1, minHeight:0, display:'flex', flexDirection:'column', paddingBottom:'2px' },
            fieldGridStyle:{ flex:1, minWidth:0, minHeight:0, overflowY:'auto',
              display:'grid', gridTemplateColumns:'52px repeat(5,minmax(0,1fr))',
              borderTop:'1px solid var(--pg-line)' },
            owedN:String(IA.SUMMONS.owed.rows.length),
            openOwed:() => this.setState({ summon:'owed', wsMode:'slide-over',
              announcement:'What is owed today. Every item belongs somewhere else — completing it here completes it there.' }),
            owedBtnStyle:{ display:'inline-flex', alignItems:'center', gap:'7px', flex:'none',
              whiteSpace:'nowrap', minHeight:'28px', padding:'0 11px', borderRadius:'var(--pg-r-pill)',
              border:'1px solid var(--pg-gold-deep)', background:'transparent',
              color:'var(--pg-gold-deep)', font:'600 11px var(--pg-font-ui)' },
            owedMarkStyle:{ flex:'none', width:'5px', height:'5px', rotate:'45deg', background:'var(--pg-gold)' },
            owedNStyle:{ marginLeft:'1px', color:'var(--pg-gold-deep)', font:'10px var(--pg-font-data)' },
            openCalSet:() => this.setState({ summon:'calset', wsMode:'slide-over',
              announcement:'Calendar settings — when you are reachable, and what she may book without asking.' }),
            calSetBtnStyle:{ flex:'none', whiteSpace:'nowrap', minHeight:'28px', padding:'0 11px',
              borderRadius:'var(--pg-r-chip)', border:'1px solid var(--pg-line)',
              background:'var(--pg-surface)', color:'var(--pg-ink-2)', font:'500 11px var(--pg-font-ui)' } }
        : { showStudioDoorDummy:false }),
```

Key facts an engineer needs:
- **Grid: `52px repeat(5,minmax(0,1fr))`** — one 52px hour gutter, five day columns. Not seven.
- The grid scrolls inside itself (`overflowY:'auto'`); `main` clips (`overflow:'hidden'`).
- Page is `width:min(100%,1160px)`, centred, `padding:22px clamp(20px,2.4vw,36px) 0`.
- The destination deck, the KPI ladder, the tape and the absence note are **all suppressed** on
  this view (`showKpis:false, showTape:false, showLedger:false, hasAbsence:false, surfaceDeck:''`).
- Cell height floor: `min-height:54px` (L2570). Column separators are
  `box-shadow:inset -1px 0 0 var(--pg-line-soft)`; row separators are
  `border-top:1px solid var(--pg-line-soft)`; the grid's own top rule is `var(--pg-line)`.
- `owedN` is **derived** from `IA.SUMMONS.owed.rows.length`, not typed.

## 2.3 Row / cell data — verbatim, L10988–L10993

```js
      fieldDays:[{ day:'Mon', date:'18' },{ day:'Tue', date:'19' },{ day:'Wed', date:'20' },{ day:'Thu', date:'21' },{ day:'Fri', date:'22' }],
      fieldRows:IA.FIELD_HOURS.map(h => ({ hour:h + ':00', cells:[0,1,2,3,4].map(i => {
        const kind = IA.FIELD_PLAN[h] && IA.FIELD_PLAN[h][i];
        const k = kind && IA.FIELD_KINDS[kind];
        return k ? { has:true, label:k.label, meta:k.meta, style:k.style } : { has:false, label:'', meta:'', style:{} };
      })})),
```

`paige-ia.js` **L2627–L2647**, verbatim — hours, plan, and the ten event treatments:

```js
  P.FIELD_HOURS = ['09', '10', '11', '13', '14', '15'];
  P.FIELD_PLAN = {
    '09': { 0: 'appointment', 2: 'agent' },
    '10': { 1: 'meeting', 3: 'task' },
    '11': { 0: 'milestone', 4: 'agent' },
    '13': { 2: 'focus', 3: 'focus' },
    '14': { 1: 'approval', 4: 'now' },
    '15': { 0: 'followup', 2: 'artifact' }
  };
  P.FIELD_KINDS = {
    appointment: { label: 'Tenant review', meta: '45m · external', style: 'padding:6px 8px;background:var(--pg-surface);border-left:2px solid var(--pg-ink-2)' },
    meeting: { label: 'Fleet standup', meta: '30m · internal', style: 'padding:6px 8px;background:var(--pg-surface)' },
    task: { label: 'Ack firing', meta: 'due 10:00', style: 'padding:6px 0;border-top:1px solid var(--pg-line-strong)' },
    focus: { label: 'Protected', meta: 'unavailable', style: 'padding:6px 8px;background:repeating-linear-gradient(135deg,var(--pg-surface) 0 5px,transparent 5px 10px)' },
    agent: { label: 'Sweep running', meta: 'PAIGE · 4m', style: 'padding:6px 8px;background:var(--pg-surface);border-left:2px solid var(--pg-violet)' },
    approval: { label: 'Tenant entry', meta: 'waiting on you', style: 'padding:6px 8px;background:var(--pg-raised);border:1px solid var(--pg-line-authority);clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px))' },
    milestone: { label: 'Stage 2 sign-off', meta: 'Friday', style: 'padding:6px 0;border-top:1px solid var(--pg-gold-deep)' },
    followup: { label: 'Follow-up', meta: 'proposed', style: 'padding:6px 8px;border:1px dashed var(--pg-line-strong)' },
    artifact: { label: 'Design package', meta: 'v3 · reviewed', style: 'padding:6px 8px;background:var(--pg-artifact);color:#211e1e' },
    now: { label: 'Now', meta: '14:22', style: 'padding:0;border-top:1px solid var(--pg-gold);opacity:.85' }
  };
```

**The ten event TREATMENTS are structure** (each is a distinct visual class an engineer must
reproduce: solid plate, ink-2 left rail, violet left rail, hatched fill, notched authority
plate, gold top rule, dashed outline, artifact plate, hairline "now" rule, plain rule). **Their
`label` and `meta` strings are fixtures** — see the fixture table.

Note the hour list **skips 12** — `['09','10','11','13','14','15']`, six rows.

## 2.4 Verbatim strings on this surface

| String | Line |
|---|---|
| `This week` | L2550 |
| `Representative · no calendar connected` | L2551 |
| `Needs you today` | L2553 |
| `Calendar settings` (button label) | L2555 |
| `Working hours, protected focus, quiet hours` (button `title`) | L2555 |
| `Mon` `Tue` `Wed` `Thu` `Fri` (day labels) | L10988 |
| Hour labels `09:00` `10:00` `11:00` `13:00` `14:00` `15:00` (composed `h + ':00'`) | L10989, `paige-ia.js` L2627 |
| `openOwed` announcement: `What is owed today. Every item belongs somewhere else — completing it here completes it there.` | L11221 |
| `openCalSet` announcement: `Calendar settings — when you are reachable, and what she may book without asking.` | L11229 |

## 2.5 The `Calendar settings` slide-over (`calset`)

Markup **L3121–L3138**, verbatim:

```html
                <sc-if value="{{ csOnRules }}" hint-placeholder-val="{{ true }}">
                <div style="display:grid;gap:1px;background:var(--pg-line-soft)">
                  <sc-for list="{{ calSetRows }}" as="cr" hint-placeholder-count="8">
                    <button onClick="{{ cr.edit }}" style="{{ cr.style }}">
                      <span style="display:flex;align-items:baseline;gap:10px;min-width:0">
                        <i style="{{ cr.markStyle }}"></i>
                        <small style="flex:none;color:var(--pg-faint);font:10px var(--pg-font-data);letter-spacing:.05em;text-transform:uppercase">{{ cr.k }}</small>
                        <b style="{{ cr.vStyle }}">{{ cr.v }}</b>
                      </span>
                      <small style="margin-top:4px;padding-left:14px;color:var(--pg-faint);font-size:10.5px;line-height:1.45;text-wrap:pretty">{{ cr.note }}</small>
                    </button>
                  </sc-for>
                </div>
                <p style="max-width:46ch;margin-top:15px;padding-top:13px;border-top:1px solid var(--pg-line-soft);color:var(--pg-ink);font:400 14px/1.6 var(--pg-font-editorial);text-wrap:pretty">{{ calSetWhy }}</p>
                <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:14px">
                  <button onClick="{{ calSetConnect }}" style="{{ calSetConnectStyle }}">Connect a calendar</button>
                </div>
                </sc-if>
```

Values **L7166–L7185**, verbatim:

```js
      calSetRows:IA.CALSET.map(r => {
        const missing = r.state === 'missing';
        return { k:r.k, v:r.v, note:r.note,
          markStyle:{ flex:'none', width:'4px', height:'4px', rotate:'45deg',
            background:missing ? 'var(--pg-negative)' : 'var(--pg-gold-deep)' },
          vStyle:{ minWidth:0, color:missing ? 'var(--pg-faint)' : 'var(--pg-ink)',
            font:'500 12px var(--pg-font-ui)', overflow:'hidden', textOverflow:'ellipsis',
            whiteSpace:'nowrap' },
          style:{ display:'flex', flexDirection:'column', minWidth:0, padding:'10px 12px',
            border:0, background:'var(--pg-workspace)', textAlign:'left' },
          edit:() => this.setState({ announcement:missing
            ? r.k + ' comes from the connected calendar. Connect one in Integrations.'
            : 'Editing ' + r.k.toLowerCase() + '. Every rule here binds her, not just your view.' }) };
      }),
      calSetWhy:'These are rules about when she may act, which is why they sit beside the calendar rather than in Settings. Quiet hours already bind outbound on every channel — the calendar is not the only thing that reads them.',
      calSetConnect:() => this.setState({ summon:null, dest:'settings', view:1,
        announcement:'Calendar connections are made in Integrations.' }),
      calSetConnectStyle:{ minHeight:'34px', padding:'0 14px', borderRadius:'var(--pg-r-chip)',
        border:'1px solid var(--pg-gold)', background:'var(--pg-gold)', color:'#17120c',
        font:'600 12px var(--pg-font-ui)' }
```

`P.CALSET` — `paige-ia.js` **L2586–L2595**, verbatim (8 rows; the labels and notes are
structure, the values are fixtures):

```js
  P.CALSET = [
    { k: 'Working hours', v: '09:00 – 18:00 · Mon to Fri', note: 'Outside these she schedules nothing without asking', state: 'set' },
    { k: 'Protected focus', v: '13:00 – 15:00 daily', note: 'She holds outbound and books nothing over it', state: 'set' },
    { k: 'Quiet hours', v: '21:00 – 07:00', note: 'Enforced on every channel by the quiet-hours automation', state: 'set' },
    { k: 'Meeting length', v: '30 minutes default', note: 'What she offers when she proposes a time', state: 'set' },
    { k: 'Buffer between meetings', v: '10 minutes', note: 'She will not book back to back', state: 'set' },
    { k: 'She may book without asking', v: 'Internal only', note: 'A client-facing booking is an authority gate', state: 'set' },
    { k: 'Calendar source', v: '—', note: 'Nothing connected — connect one in Integrations', state: 'missing' },
    { k: 'Timezone', v: '—', note: 'Read from the connected calendar', state: 'missing' }
  ];
```

`SUMMONS.calset` header copy (`paige-ia.js` **L73**):

> **title** `Calendar settings`
> **deck** `When you are reachable, when you are not, and what she may put on your calendar without asking.`
> **foot** `The connection itself is made in Integrations — no calendar source is wired at operator scope, so these are the rules waiting for a calendar to apply them to. Quiet hours already bind outbound on every channel, which is why they are stated here and enforced by the quiet-hours automation.`

`SUMMONS.owed` (`paige-ia.js` **L67–L72**):

> **title** `Needs you today`
> **deck** `Tasks, approvals and agent runs on one temporal surface. Every item belongs somewhere else — completing it here completes it there.`
> **foot** `The calendar owns no records. Nothing is read from a calendar source yet, so the treatments are the design and only the contents change when one connects.`
> rows: `Authorize a tenant entry` / `Acknowledge a firing` / `Protected focus` / `Fleet sweep` — with status pills `Authority` (gold-deep), `Attention` (warning), `Held` (violet), `Scheduled` (faint).

## FIXTURES — do not port (Calendar)

| # | Fixture | Line |
|---|---|---|
| 1 | `fieldDays` dates `18 · 19 · 20 · 21 · 22` — invented calendar dates | L10988 |
| 2 | `FIELD_PLAN` — the whole 12-cell placement map (which kind lands in which hour/day) | `paige-ia.js` L2628–L2635 |
| 3 | `appointment` label/meta `Tenant review` / `45m · external` | `paige-ia.js` L2637 |
| 4 | `meeting` label/meta `Fleet standup` / `30m · internal` | `paige-ia.js` L2638 |
| 5 | `task` label/meta `Ack firing` / `due 10:00` | `paige-ia.js` L2639 |
| 6 | `focus` label/meta `Protected` / `unavailable` | `paige-ia.js` L2640 |
| 7 | `agent` label/meta `Sweep running` / `PAIGE · 4m` | `paige-ia.js` L2641 |
| 8 | `approval` label/meta `Tenant entry` / `waiting on you` | `paige-ia.js` L2642 |
| 9 | `milestone` label/meta `Stage 2 sign-off` / `Friday` | `paige-ia.js` L2643 |
| 10 | `followup` label/meta `Follow-up` / `proposed` | `paige-ia.js` L2644 |
| 11 | `artifact` label/meta `Design package` / `v3 · reviewed` | `paige-ia.js` L2645 |
| 12 | `now` meta `14:22` — invented clock time | `paige-ia.js` L2646 |
| 13 | `CALSET` values `09:00 – 18:00 · Mon to Fri`, `13:00 – 15:00 daily`, `21:00 – 07:00`, `30 minutes default`, `10 minutes`, `Internal only` (6 values) | `paige-ia.js` L2587–L2592 |
| 14 | `SUMMONS.owed` row details `Two-key · reason code required`, `Delivered 13:47 · waiting on your word`, `13:00–15:00 · she holds outbound`, `Runs 06:30 daily` | `paige-ia.js` L68–L71 |

`CALSET` rows 7 and 8 (`Calendar source` / `Timezone`) are already `—` with `state:'missing'` —
those are the honest-absence shape, and they port as-is.

## PACK SILENT — ask CD (Calendar)

1. **No month grid.** See §3 / §9 for the exhaustive search.
2. **No day view, no agenda/list view, no view switcher.** The week field is the only calendar
   geometry; there is no `<sc-for>` of view chips on this surface.
3. **No week navigation (prev / next / today).** `fieldDays` is a static five-element literal;
   no `onClick` moves it.
4. **No empty state for the week field.** The grid always draws; a cell with no plan entry
   renders `has:false` and the inner `<sc-if>` emits nothing.
5. **No hover/selected/drag treatment on a cell or an event.** No `style-hover`, no drag
   handlers on L2557–L2579 (contrast the pipeline board, which does carry drag state).
6. **No "create event" affordance on the field.**
7. **No all-day row and no "now" line spanning the grid** — `now` is a per-cell treatment
   placed at `14` / column `4`, not a rule across the week.

---

# 3. Platform hours — DOES NOT EXIST (owner ruling, 2026-08-23)

**Withdrawn. Nothing to port.** Owner, verbatim: *"The pack is silent because I never drew it.
`P.CALSET` quiet hours and the `P.HOSTS` rota are tenant-scoped scheduling, not a platform-hours
surface."*

This read as a gap because it came off the OLD console's branch list — a console ruled dead
2026-08-22. **The mapping exercise should have retired it rather than carrying it forward as
owed.** A branch that exists only in a replaced design is not a hole in the new one.

The section below is kept as the record of the search that found nothing.


## PACK SILENT — ask CD

**The v3 pack contains no "Platform hours" surface.** Not the block, not the label, not a
weekly-hours band, not a drag rail, not a per-day toggle, not split ranges.

**Searches run against `PAIGE Super Admin Shell v3.dc.html` (case-insensitive where noted):**

| Term | Hits | What the hits actually are |
|---|---|---|
| `platform hours` | 0 | — |
| `Platform hours` | 0 | — |
| `hours` | 4 | L2555 button `title` "Working hours, protected focus, quiet hours"; L7180 `calSetWhy` prose "Quiet hours already bind outbound…"; L7586 "runs in three hours"; L8844 a `Quiet hours` picker option list |
| `Hours` (capitalised) | 0 | — |
| `sla` / `SLA` | 3 + 38 | The 3 real `SLA` hits are L9543, L9570, L10152 — all "no SLA clock exists yet" on Marketplace. The lowercase `sla` hits are all substrings of `translateY(` / `translateX(` (51) and `--cm-slash` (13) |
| `on-call` / `oncall` | 0 / 0 | — |
| `coverage` / `Coverage` | 0 / 0 | — |
| `working hours` | 0 | (only `Working hours` capitalised, in the two places above) |
| `response` | — | no response-time surface |
| `isCalMonth` | 0 | the old-pack anchor cited in `src/operator/surfaces/CalendarSurfaces.tsx` L74 does not exist in v3 |
| `month` / `Month` | 5 / 0 | all five are pricing periods (`monthly`, `per month`) at L5528, L5612, L5615, L5751, L6426 |
| `repeat(7` | 1 | L7350 — the **Campaigns → Social** seven-day publishing spine, not a calendar |
| `weekday` / `monthGrid` / `calMonth` / `calGrid` / `calDays` / `dayCells` | 0 | — |

**Searches run against `paige-ia.js`:** `FIELD_HOURS` is the only hours structure
(**L2627**), and it is the six-row gutter of the week field in §2. There is no `HOURS`,
`SCHEDULE`, `SLA`, `COVERAGE`, `ROTA_HOURS` or equivalent.

**Also searched:** `support.js` (which is **not** a support surface — it is the generated
`dc-runtime`, header at `support.js` L1: `// GENERATED from dc-runtime/src/*.ts — do not edit.`)
and `mind-brain.js`. Neither contains an hours surface.

**What exists instead, and is NOT a substitute:** the two `Working hours` / `Quiet hours` /
`Protected focus` **rows** of the `calset` slide-over (§2.5, `paige-ia.js` L2587–L2589). Those
are single-line key/value/note rows with an em-dash-or-value treatment. They are not a
draggable weekly band, and the pack does not draw one.

The `Platform hours` block currently in the repo (`src/operator/surfaces/specs/opsSpecs.ts`
L783–L797, under `calendar/settings`, body `kind:"notWired"`) derives from the **superseded**
`super-admin-shell/` pack, which `src/operator/CLAUDE.md` forbids building from. **Ask CD
whether Platform hours exists in v3 at all, and if so where.**

---

# 4. Marketplace submissions

**Route:** `Marketplace → Submissions` (`paige-ia.js` **L262**:
`views: ['Storefront', 'Catalog', 'Submissions', 'Publishers']`).
Gate: `...this.subsVals(s.dest === 'marketplace' && viewName === 'Submissions')` (**L10926**).

| Piece | Lines |
|---|---|
| Queue markup | **L2281–L2326** |
| `subsVals` | **L9506–L9572** |
| Submission slide-over (`review`) markup | **L3319–L3393** |
| `reviewVals` | **L9576–L9652** |
| `kindMark` (the kind plaque) | **L9486–L9504** |
| `P.SUBMISSIONS` | `paige-ia.js` **L1135–L1178** |
| `P.OUTSIDE_KINDS` | `paige-ia.js` **L1183** |
| `MARKET.kinds` / `MARKET.classes` | `paige-ia.js` **L1043–L1056** |
| `SUMMONS.review` | `paige-ia.js` **L66** |

## 4.1 Queue markup — verbatim, L2281–L2326

```html
          <sc-if value="{{ showSubs }}" hint-placeholder-val="{{ false }}">
            <div style="margin-bottom:30px">
              <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding-bottom:14px;border-bottom:1px solid var(--pg-line)">
                <sc-for list="{{ subFilters }}" as="sf" hint-placeholder-count="4">
                  <button onClick="{{ sf.pick }}" style="{{ sf.style }}">{{ sf.label }}<small style="{{ sf.nStyle }}">{{ sf.n }}</small></button>
                </sc-for>
                <small style="margin-left:auto;min-width:0;color:var(--pg-faint);font:10.5px var(--pg-font-data)">{{ subClock }}</small>
              </div>

              <div style="display:grid;gap:11px;margin-top:14px">
                <sc-for list="{{ subs }}" as="sb" hint-placeholder-count="3">
                  <button onClick="{{ sb.open }}" style="{{ sb.style }}" style-hover="{{ sb.hover }}">
                    <span style="display:flex;align-items:center;gap:10px;min-width:0">
                      <span style="{{ sb.glyphWrapStyle }}">
                        <i style="{{ sb.rimStyle }}"></i>
                        <svg viewBox="0 0 16 16" style="{{ sb.svgStyle }}" aria-hidden="true"><path d="{{ sb.glyph }}" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                      </span>
                      <span style="display:flex;flex-direction:column;min-width:0;gap:2px;text-align:left">
                        <b style="font:500 12.5px var(--pg-font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ sb.name }}</b>
                        <small style="color:var(--pg-faint);font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ sb.pub }}</small>
                      </span>
                      <small style="{{ sb.stateStyle }}">{{ sb.state }}</small>
                    </span>
                    <span style="display:flex;flex-wrap:wrap;align-items:center;gap:7px 14px">
                      <span style="display:flex;align-items:center;gap:6px">
                        <small style="color:var(--pg-faint);font:10px var(--pg-font-data);white-space:nowrap">{{ sb.scopeLine }}</small>
                      </span>
                      <span style="display:flex;align-items:center;gap:5px">
                        <sc-for list="{{ sb.checkPips }}" as="cp" hint-placeholder-count="5">
                          <i style="{{ cp.style }}" title="{{ cp.title }}"></i>
                        </sc-for>
                        <small style="{{ sb.checkStyle }}">{{ sb.checkLine }}</small>
                      </span>
                      <small style="margin-left:auto;color:var(--pg-faint);font:10px var(--pg-font-data);white-space:nowrap">{{ sb.waiting }} waiting</small>
                    </span>
                  </button>
                </sc-for>
              </div>

              <sc-if value="{{ subsEmpty }}" hint-placeholder-val="{{ false }}">
                <p style="max-width:44ch;padding:24px 0;color:var(--pg-muted);font:400 15px/1.6 var(--pg-font-editorial)">Nothing in this state. The queue is what stands between an outside publisher and everybody else’s clients.</p>
              </sc-if>

              <p style="max-width:64ch;margin-top:18px;padding-top:13px;border-top:1px solid var(--pg-line-soft);color:var(--pg-faint);font-size:11px;line-height:1.55">{{ subFoot }}</p>
            </div>
          </sc-if>
```

## 4.2 `subsVals` — verbatim, L9506–L9572

```js
  // The review queue. This is the whole delegation model in one surface: an outside
  // publisher may build freely, and only a reviewed listing reaches anyone else's clients.
  subsVals(on) {
    if (!on) return { showSubs:false };
    const IA = window.PAIGE_IA, s = this.state, M = IA.MARKET;
    const all = IA.SUBMISSIONS.map(x => ({ ...x, state:(s.subState || {})[x.id] || x.state }));
    const f = s.subFilter || 'All';
    const list = f === 'All' ? all
      : f === 'Outside' ? all.filter(x => x.outside)
      : all.filter(x => x.state === f);
    const tone = st => st === 'In review' ? 'var(--pg-violet)'
      : st === 'Submitted' ? 'var(--pg-gold-deep)'
      : st === 'Changes requested' ? 'var(--pg-warning)'
      : st === 'Approved' ? 'var(--pg-positive)'
      : st === 'Rejected' ? 'var(--pg-negative)' : 'var(--pg-faint)';
    const cTone = r => r === 'pass' ? 'var(--pg-positive)' : r === 'fail' ? 'var(--pg-negative)' : 'var(--pg-faint)';

    const chip = (label, n, on2) => ({ label, n,
      pick:() => this.setState({ subFilter:label === 'Everything' ? 'All' : label }),
      style:{ display:'inline-flex', alignItems:'center', gap:'6px', flex:'none', whiteSpace:'nowrap',
        minHeight:'28px', padding:'0 11px', borderRadius:'var(--pg-r-pill)',
        border:'1px solid ' + (on2 ? 'var(--pg-gold)' : 'var(--pg-line)'),
        background:on2 ? 'var(--pg-lift)' : 'transparent',
        color:on2 ? 'var(--pg-ink)' : 'var(--pg-muted)',
        font:(on2 ? 600 : 400) + ' 11.5px var(--pg-font-ui)' },
      nStyle:{ color:'var(--pg-faint)', font:'9.5px var(--pg-font-data)' } });

    const failing = all.filter(x => x.checks.some(c => c[2] === 'fail')).length;
    return {
      showSubs:true,
      subFilters:[
        chip('Everything', String(all.length), f === 'All'),
        chip('Submitted', String(all.filter(x => x.state === 'Submitted').length), f === 'Submitted'),
        chip('In review', String(all.filter(x => x.state === 'In review').length), f === 'In review'),
        chip('Changes requested', String(all.filter(x => x.state === 'Changes requested').length), f === 'Changes requested'),
        chip('Outside', String(all.filter(x => x.outside).length), f === 'Outside')
      ],
      subClock:failing + ' of ' + all.length + ' have a failing check · no SLA clock exists yet',
      subs:list.map((x, i) => {
        const mk = this.kindMark(x.kind, 32, false);
        const pass = x.checks.filter(c => c[2] === 'pass').length;
        const fail = x.checks.filter(c => c[2] === 'fail').length;
        return { name:x.name, glyph:mk.glyph, waiting:x.waiting, state:x.state,
          pub:x.kind + ' · ' + x.pub + (x.outside ? ' · outside' : ''),
          scopeLine:x.has + ' → ' + x.wants,
          checkPips:x.checks.map(c => ({ title:c[0] + ' — ' + c[1],
            style:{ flex:'none', width:'5px', height:'5px', rotate:'45deg', background:cTone(c[2]) } })),
          checkLine:fail ? fail + ' failing' : pass + ' of ' + x.checks.length + ' pass',
          checkStyle:{ color:fail ? 'var(--pg-negative)' : 'var(--pg-faint)',
            font:'10px var(--pg-font-data)', whiteSpace:'nowrap' },
          stateStyle:{ marginLeft:'auto', flex:'none', color:tone(x.state),
            font:'500 10px var(--pg-font-ui)', letterSpacing:'.03em', whiteSpace:'nowrap' },
          glyphWrapStyle:mk.wrapStyle, rimStyle:mk.rimStyle, svgStyle:mk.svgStyle,
          style:{ display:'flex', flexDirection:'column', gap:'10px', minWidth:0, minHeight:'88px',
            padding:'15px 16px', border:0, borderRadius:'var(--pg-r-plate)',
            background:'var(--pg-surface)', boxShadow:'var(--pg-rim), var(--pg-lift-1)', textAlign:'left',
            transition:s.reduce ? 'none' : 'transform 200ms cubic-bezier(.22,1,.36,1), box-shadow 200ms',
            animation:s.reduce ? 'none' : 'pg-reveal 300ms cubic-bezier(.22,1,.36,1) both',
            animationDelay:(i * 50) + 'ms' },
          hover:{ transform:s.reduce ? 'none' : 'translateY(-2px)', boxShadow:'var(--pg-rim), var(--pg-lift-2)' },
          open:() => this.setState({ summon:'review', wsMode:'slide-over', review:x.id,
            announcement:'Opened the submission.' }) };
      }),
      subsEmpty:!list.length,
      subFoot:'A submission is representative. The manifest, requested scope and auto-checks are real fields. What does not exist: a reviewer identity, an SLA clock, and a publisher account separate from a tenant — an outside publisher is neither inside a tenant nor above one, so it needs its own identity class. All three are Stage 3.'
    };
  }
```

Geometry summary: card `min-height:88px`, `padding:15px 16px`, `border-radius:var(--pg-r-plate)` (13px),
`background:var(--pg-surface)`, `box-shadow:var(--pg-rim), var(--pg-lift-1)`; hover lifts `-2px` to
`--pg-lift-2`; entrance `pg-reveal 300ms` staggered `i * 50ms`. Stack gap `11px` (L2290). Filter
chips: `min-height:28px`, `padding:0 11px`, `border-radius:var(--pg-r-pill)`, gold border when active.
Check pips: `5px` squares rotated 45°, gap `5px`.

The kind plaque (`kindMark(kind, 32, false)`), **L9486–L9504 verbatim**:

```js
  kindMark(kind, px, live) {
    const IA = window.PAIGE_IA;
    const k = (IA.MARKET.kinds[kind] || IA.MARKET.kinds.Skill);
    const hue = 'var(--k-' + kind.toLowerCase() + ')';
    return {
      glyph:k.glyph, hue,
      wrapStyle:{ position:'relative', flex:'none', display:'grid', placeItems:'center',
        width:px + 'px', height:px + 'px', borderRadius:Math.round(px * 0.29) + 'px',
        background:'radial-gradient(120% 120% at 50% 8%, color-mix(in srgb, ' + hue + ' 26%, transparent), transparent 70%), var(--pg-surface)',
        boxShadow:'inset 0 1px 0 color-mix(in srgb, ' + hue + ' 40%, transparent), inset 0 0 0 1px color-mix(in srgb, ' + hue + ' 22%, transparent), var(--pg-lift-1)',
        color:hue },
      rimStyle:{ position:'absolute', inset:Math.max(2, Math.round(px * 0.09)) + 'px',
        borderRadius:Math.round(px * 0.2) + 'px',
        boxShadow:'inset 0 0 0 1px color-mix(in srgb, ' + hue + ' 14%, transparent)',
        opacity:live ? 1 : .55, pointerEvents:'none',
        animation:live && !this.state.reduce ? 'pg-glow 3.4s ease-in-out infinite' : 'none' },
      svgStyle:{ position:'relative', width:Math.round(px * 0.46) + 'px', height:Math.round(px * 0.46) + 'px' }
    };
  }
```

At `px = 32`: plaque 32×32, radius 9px, rim inset 3px / radius 6px / opacity .55, glyph 15×15.
Kind hues are the `--k-*` tokens (L26 / L33).

## 4.3 Verbatim strings on this surface

| String | Line |
|---|---|
| Filter chips: `Everything` · `Submitted` · `In review` · `Changes requested` · `Outside` | L9537–L9541 |
| Row template `{waiting} waiting` | L2314 |
| Row scope line `{has} → {wants}` | L9550 |
| Row publisher line `{kind} · {pub}` + ` · outside` when `x.outside` | L9549 |
| Check line `{n} failing` **or** `{n} of {total} pass` | L9553 |
| Clock line `{failing} of {all} have a failing check · no SLA clock exists yet` | L9543 |
| Empty state (full, verbatim): `Nothing in this state. The queue is what stands between an outside publisher and everybody else’s clients.` | L2321 |
| Foot (full, verbatim): `A submission is representative. The manifest, requested scope and auto-checks are real fields. What does not exist: a reviewer identity, an SLA clock, and a publisher account separate from a tenant — an outside publisher is neither inside a tenant nor above one, so it needs its own identity class. All three are Stage 3.` | L9570 |
| Open announcement `Opened the submission.` | L9567 |
| State labels + tones: `In review` violet · `Submitted` gold-deep · `Changes requested` warning · `Approved` positive · `Rejected` negative · else faint | L9516–L9520 |
| Check tones: `pass` positive · `fail` negative · anything else faint | L9521 |

## 4.4 The submission slide-over (`review`)

Markup **L3319–L3393**, verbatim:

```html
            <sc-if value="{{ showReview }}" hint-placeholder-val="{{ false }}">
              <div style="margin-top:14px">
                <div style="display:flex;align-items:center;gap:11px">
                  <span style="{{ rvGlyphStyle }}">
                    <i style="{{ rvRimStyle }}"></i>
                    <svg viewBox="0 0 16 16" style="{{ rvSvgStyle }}" aria-hidden="true"><path d="{{ rvGlyph }}" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                  </span>
                  <span style="display:flex;flex-direction:column;min-width:0">
                    <b style="font:500 15px var(--pg-font-ui)">{{ rvName }}</b>
                    <small style="margin-top:2px;color:var(--pg-faint);font-size:11px">{{ rvSub }}</small>
                  </span>
                  <small style="{{ rvStateStyle }}">{{ rvState }}</small>
                </div>

                <p style="max-width:46ch;margin-top:14px;color:var(--pg-ink);font:400 15px/1.6 var(--pg-font-editorial);text-wrap:pretty">{{ rvWhy }}</p>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px 18px;margin-top:17px;padding:14px 0;border-block:1px solid var(--pg-line-soft)">
                  <sc-for list="{{ rvScope }}" as="rs" hint-placeholder-count="3">
                    <span style="display:flex;flex-direction:column;gap:4px;min-width:0">
                      <small style="color:var(--pg-faint);font:10px var(--pg-font-data);letter-spacing:.05em;text-transform:uppercase">{{ rs.k }}</small>
                      <b style="{{ rs.style }}">{{ rs.v }}</b>
                    </span>
                  </sc-for>
                </div>

                <div style="padding:17px 0 4px">
                  <small style="display:block;color:var(--pg-faint);font:500 11px var(--pg-font-ui)">Auto-checks</small>
                  <div style="display:grid;gap:1px;margin-top:11px;background:var(--pg-line-soft)">
                    <sc-for list="{{ rvChecks }}" as="ck" hint-placeholder-count="5">
                      <div style="display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;min-height:40px;padding:0 2px;background:var(--pg-workspace)">
                        <i style="{{ ck.markStyle }}"></i>
                        <span style="display:flex;flex-direction:column;min-width:0">
                          <b style="font:500 11.5px var(--pg-font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ ck.name }}</b>
                          <small style="margin-top:1px;color:var(--pg-faint);font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ ck.note }}</small>
                        </span>
                        <small style="{{ ck.tagStyle }}">{{ ck.tag }}</small>
                      </div>
                    </sc-for>
                  </div>
                </div>

                <div style="padding:15px 0 4px;border-top:1px solid var(--pg-line-soft)">
                  <small style="display:block;padding-top:13px;color:var(--pg-faint);font:500 11px var(--pg-font-ui)">What they declared</small>
                  <div style="display:grid;gap:1px;margin-top:11px;background:var(--pg-line-soft)">
                    <sc-for list="{{ rvManifest }}" as="mf" hint-placeholder-count="4">
                      <div style="display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:10px;align-items:center;min-height:34px;padding:0 2px;background:var(--pg-workspace)">
                        <small style="color:var(--pg-faint);font:10px var(--pg-font-data);letter-spacing:.05em;text-transform:uppercase">{{ mf.k }}</small>
                        <small style="min-width:0;color:var(--pg-ink-2);font:11.5px var(--pg-font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ mf.v }}</small>
                        <small style="{{ mf.tagStyle }}">{{ mf.tag }}</small>
                      </div>
                    </sc-for>
                  </div>
                  <p style="max-width:46ch;margin-top:11px;color:var(--pg-faint);font-size:10.5px;line-height:1.5">This is the same manifest the install page renders. A reviewer reads exactly what the buyer will see.</p>
                </div>

                <div style="padding:15px 0 4px;border-top:1px solid var(--pg-line-soft)">
                  <small style="display:block;padding-top:13px;color:var(--pg-gold-deep);font:500 11px var(--pg-font-ui)">{{ rvDecisionLabel }}</small>
                  <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:12px">
                    <sc-for list="{{ rvActions }}" as="ra" hint-placeholder-count="3">
                      <button onClick="{{ ra.act }}" style="{{ ra.style }}">{{ ra.label }}</button>
                    </sc-for>
                  </div>
                  <p style="max-width:46ch;margin-top:11px;color:var(--pg-muted);font:400 12px/1.55 var(--pg-font-ui);text-wrap:pretty">{{ rvDecisionNote }}</p>
                </div>

                <div style="padding:15px 0 4px;border-top:1px solid var(--pg-line-soft)">
                  <small style="display:block;padding-top:13px;color:var(--pg-faint);font:500 11px var(--pg-font-ui)">History</small>
                  <div style="margin-top:11px;padding-left:12px;border-left:1px solid var(--pg-line-strong)">
                    <sc-for list="{{ rvHistory }}" as="hs" hint-placeholder-count="3">
                      <p style="{{ hs.style }}">{{ hs.text }}</p>
                    </sc-for>
                  </div>
                </div>
              </div>
            </sc-if>
```

Fixed section labels, verbatim: **`Auto-checks`** (L3345) · **`What they declared`** (L3361) ·
**`History`** (L3385) · the manifest note **`This is the same manifest the install page renders. A
reviewer reads exactly what the buyer will see.`** (L3371) · the decision label
**`Decide how far it reaches`** (L9632).

`reviewVals` **L9576–L9652** supplies the rest. The five scope cells are fixed
(**L9616–L9623**): `Has now` · `Wants` · `Publisher class` · `Waiting` · `Reviewer`, with
`Wants` inked `--pg-gold-deep` and `Reviewer` inked `--pg-faint`.

Check tags (**L9625**): `pass` / `fail` / `could not run`.
Manifest tags (**L9629**): `ready` / `above ceiling` / `missing`.

Four decision actions (**L9633–L9643**), labels composed from the record:
`Approve for {wants lowercased}` (or `Cannot approve` when blocked, gold `go` style),
`Request changes`, `Keep at {has lowercased}`, `Reject` (negative style). Button style
**L9597–L9602**: `min-height:34px`, `padding:0 14px`, `border-radius:var(--pg-r-chip)`,
gold fill + `#17120c` ink on the act only.

The three decision-note strings (**L9644–L9648**), verbatim:

- blocked-by-kind: `By ruling, an outside publisher may ship a Template or a Skill — configuration and composition. An {kind} is arbitrary behaviour against a client’s data, so it stays platform-only until a real security review exists.`
- blocked-by-check: `Approval is blocked while a check fails. {joined check notes}.`
- clear: `Approving widens who can see it. It does not widen what it may do — the manifest grant still runs under each operator’s own ceiling.`

`SUMMONS.review` header (`paige-ia.js` **L66**):

> **title** `Submission`
> **deck** `What they declared, what the auto-checks found, and the one decision that decides how far it reaches. A reviewer reads exactly what the buyer will see.`
> **foot** `Representative. The manifest, the requested scope and the auto-checks are real fields on a submission. What does not exist: a reviewer identity, an SLA clock, and a publisher account separate from a tenant — all three are Stage 3.`

The outside-publisher ruling that gates the Approve button (`paige-ia.js` **L1180–L1183**), verbatim:

```js
  // What an outside publisher may ship, by kind. A template is configuration and a skill
  // composes what she already does; an agent or an integration is arbitrary behaviour
  // against a client's data, so both stay platform-only until a security review exists.
  P.OUTSIDE_KINDS = { Template: true, Skill: true, Automation: 'review', Integration: false, Agent: false };
```

## FIXTURES — do not port (Marketplace submissions)

The entire `P.SUBMISSIONS` array (`paige-ia.js` **L1135–L1178**) is fixture data — **three
records**. Every field in them is invented. Itemised:

| # | Fixture | Line |
|---|---|---|
| 1 | `sub1` — name `Intake form to pipeline`, listing `intake-pipe`, publisher `AUTHORIZED PUBLISHER · agency`, version `2.0`, waiting `3d`, state `In review`, `why` prose, 4 manifest rows, 5 check rows, 3 history rows | `paige-ia.js` L1136–L1149 |
| 2 | `sub2` — name `Churn-risk read`, listing `churn-read`, version `0.9`, waiting `1d`, state `Submitted`, `why` prose, 4 manifest rows, 5 check rows, 3 history rows | `paige-ia.js` L1150–L1163 |
| 3 | `sub3` — name `Ledger export`, listing `ledger-export`, publisher `AUTHORIZED PUBLISHER · solo`, version `0.2`, waiting `5h`, state `Changes requested`, `why` prose, 4 manifest rows, 5 check rows, 3 history rows | `paige-ia.js` L1164–L1177 |
| 4 | `assigned: 'Unassigned'` on all three — a reviewer-identity value the pack's own foot says does not exist | `paige-ia.js` L1139, L1153, L1167 |

Every derived figure on the surface — the five chip counts, `subClock`, `checkLine`,
`{waiting} waiting`, `scopeLine` — is **computed from those three records** (L9533, L9537–L9543,
L9546–L9553). Once the fixtures are replaced by a real read, all of them follow automatically.
None of them is typed.

**Structure that DOES come over:** all five filter-chip labels; the `{n} waiting` /
`{has} → {wants}` / `{n} of {n} pass` templates; the `no SLA clock exists yet` clause of
`subClock`; the empty-state paragraph; `subFoot`; every fixed section label in the slide-over;
the five scope-cell keys; the three check tags and three manifest tags; the four decision-action
labels and the three decision notes; the five state tones and three check tones; the whole
`MARKET.kinds` / `MARKET.classes` / `OUTSIDE_KINDS` vocabulary.

## PACK SILENT — ask CD (Marketplace submissions)

1. **No sort control and no pagination.** `list` is filter-only (L9513–L9515).
2. **No reviewer-assignment control.** `assigned` is displayed (L9621) but nothing writes it;
   the foot says the identity class does not exist.
3. **No SLA clock treatment.** `subClock` states its absence in words; no timer, no
   overdue/at-risk styling exists.
4. **No bulk actions and no per-row inline action** — the row's only handler is `open`.
5. **No `Approved` / `Rejected` terminal-state view.** The tones exist (L9519–L9520) and
   `set(...)` writes the state (L9603), but no separate resolved-queue surface is drawn.

---

# 5. Support inbox — DOES NOT EXIST (owner ruling, 2026-08-23)

**Withdrawn. Nothing to port.** Owner, verbatim: *"Conversations is a thread console over
prospect and partner threads. There's no ticketing model in this design: no queue, no
assignment, no SLA, no status. If support ticketing is ever wanted it's a new design, not a
port."*

Same origin as §3 — the old console's branch list, carried forward as owed when it should have
been retired.

The section below is kept as the record of the search that found nothing: `inbox` / `ticket` /
`triage` across all four source files, 0/0/0 product surfaces.


## PACK SILENT — ask CD

**The v3 pack contains no support inbox.** No ticket list, no thread queue, no triage surface,
no escalation queue, no reply composer for support.

**Searches run:**

| File | Term | Hits | What they are |
|---|---|---|---|
| `PAIGE Super Admin Shell v3.dc.html` | `support` (case-insensitive) | 3 | **L6** `<script src="./support.js"></script>`; **L6725** the word "supports" inside `dealBlockedWhy` prose; **L7098** the phrase "a support rota" inside `calWhy` prose |
| `PAIGE Super Admin Shell v3.dc.html` | `inbox` / `ticket` / `triage` | 0 / 0 / 0 | — |
| `support.js` | `inbox` / `ticket` / `triage` | 0 / 0 / 0 | — |
| `mind-brain.js` | `inbox` / `ticket` / `triage` | 0 / 0 / 0 | — |
| `paige-ia.js` | `inbox` / `ticket` | 0 / 0 | — |
| `paige-ia.js` | `triage` | 4 | **L344** an automation named `Inbound triage`; **L1068** a marketplace listing `stalled-triage` / `Stalled-deal triage`; **L2021** an automation `a4 Triage a new thread`; **L2104**/**L2152** its fault + alert rows. All are Automations-surface rows, not a support inbox |
| `paige-ia.js` | `support` | 12 | seat/host/rota names (`Support rota`, `Support · seat A/B`, `Support agent`, `TEAM MEMBER · support`), a phone-number row `Support line`, and manifest lines "Seats, support, billing". None is a surface |

**`support.js` is NOT a support surface.** Its first line reads:

```js
// GENERATED from dc-runtime/src/*.ts — do not edit. Rebuild with `cd dc-runtime && bun run build`.
```

It is the `dc-runtime` — the parser/renderer that turns `<x-dc>` templates and the `DCLogic`
class into React (`parseDcDocument`, `parseDcText`, `getReact`, …, `support.js` L1–L60+). The
filename is coincidental. It carries no product surface at all.

**The nearest thing the pack does draw**, and which is **not** a support inbox: the
**Relationships → Conversations** console (§6) — a three-pane thread list / thread / person rail
over `P.THREADS`. Its threads are prospect/partner sales threads, not support tickets, and there
is no ticket status, queue, assignment, or SLA anywhere in it.

**Ask CD whether a support inbox exists in v3, and where.**

---
