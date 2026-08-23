// The five checks the operator shell is diffed against, as pure functions of a rendered page.
//
// They live apart from the driver so they can be negative-controlled against fixture pages
// without a shell existing yet. An unfalsified harness is the same class of defect as the
// audit log that read "immutable" because of a GRANT, the frames captioned with a theme
// nobody read back, and the reload defended by a comment false since July: something that
// reads as verified without having been verified.

/** Every assertion returns {ok, detail} — never throws, so one failure does not mask the rest. */

export async function slotsInOrder(page, expected) {
  const found = await page.$$eval("[data-slot]", (els) =>
    els.map((e) => e.getAttribute("data-slot")),
  );
  return {
    ok: found.length === expected.length && found.every((s, i) => s === expected[i]),
    detail: `expected [${expected.join(" · ")}] — found [${found.join(" · ")}]`,
  };
}

/**
 * The shell's three tracks.
 *
 * `getComputedStyle` RESOLVES a grid template to px — the authored `minmax(340px,26vw)` comes
 * back as `416px` at 1600 — so an assertion written against the authored string can only ever
 * fail. That is a jurisdiction error rather than a strictness one: the harness measures the
 * rendered geometry and does not get to assert the source text it was never handed.
 *
 * Counting tracks alone was too weak in the other direction: a rail that drifted 216 → 300 kept
 * three tracks and passed. So the rail is checked by VALUE against the pack's two legal widths,
 * and the spine is left to `spineFloor`, which already owns the 340px floor.
 */
export async function shellGrid(page, expectedCols = 3, railWidths = [216, 72]) {
  const actual = await page.$eval("[data-shell-grid]", (e) =>
    getComputedStyle(e).gridTemplateColumns,
  ).catch(() => null);
  if (actual === null) return { ok: false, detail: "no [data-shell-grid] element" };
  const tracks = actual.split(/\s+/).filter(Boolean);
  if (tracks.length !== expectedCols) {
    return { ok: false, detail: `expected ${expectedCols} tracks — computed "${actual}" (${tracks.length})` };
  }
  const rail = parseFloat(tracks[0]);
  const railOk = railWidths.some((w) => Math.abs(rail - w) < 1);
  return {
    ok: railOk,
    detail: railOk
      ? `${expectedCols} tracks, rail ${rail}px — "${actual}"`
      : `rail resolved to ${rail}px, which is neither ${railWidths.join("px nor ")}px — "${actual}"`,
  };
}

/**
 * The defect that hit six times in design. A grid/flex child defaults to `min-width:auto`,
 * which sizes the track by content, so one long string silently blows out its container at
 * a width nobody tests. Walk every child of every grid/flex parent and demand an explicit 0.
 */
export async function minWidthZero(page) {
  const offenders = await page.evaluate(() => {
    const bad = [];
    for (const parent of document.querySelectorAll("*")) {
      const pd = getComputedStyle(parent).display;
      if (!/(^|\s)(grid|flex|inline-grid|inline-flex)$/.test(pd)) continue;
      for (const child of parent.children) {
        const cs = getComputedStyle(child);
        const horizontal = /grid/.test(pd) || cs.flexDirection !== "column";
        const prop = horizontal ? cs.minWidth : cs.minHeight;
        // A flex item with `flex-shrink: 0` is never squeezed, so `min-width: auto` on it cannot
        // blow a track out — the property only bites on an item the layout tries to shrink.
        // Flagging those anyway was 16 of 20 hits on the real shell (icons and fixed pills), and
        // a check that is 80% noise is a check somebody switches off, after which it catches
        // nothing. Grid items are still checked strictly: they DO shrink, and min-width:auto on
        // a grid child is the classic blowout this exists to catch.
        if (!/grid/.test(pd) && parseFloat(cs.flexShrink) === 0) continue;
        if (prop === "auto") {
          bad.push(
            `${child.tagName.toLowerCase()}${child.id ? "#" + child.id : ""}` +
              `${child.className && typeof child.className === "string" ? "." + child.className.split(/\s+/)[0] : ""}` +
              ` (${horizontal ? "min-width" : "min-height"}:auto in ${pd})`,
          );
        }
      }
    }
    return bad;
  });
  return { ok: offenders.length === 0, detail: offenders.slice(0, 8).join("; ") || "none" };
}

export async function noDocumentScrollbar(page) {
  const over = await page.evaluate(() => {
    const d = document.documentElement;
    return { y: d.scrollHeight - d.clientHeight, x: d.scrollWidth - d.clientWidth };
  });
  return {
    ok: over.y <= 2 && over.x <= 2,
    detail: `overflow y=${over.y}px x=${over.x}px`,
  };
}

/**
 * AA against the ground each element is ACTUALLY PAINTED ON.
 *
 * CORRECTED 2026-08-23, and the correction matters more than the check. This measured every
 * colour against `--pg-env` — a token that DOES NOT EXIST in the operator console. Reading a
 * missing custom property yields the empty string, the old code fell through to
 * `document.body.backgroundColor`, and in this shell that resolved to a near-white
 * `rgb(245,245,245)` that nothing is painted on. So every number it produced against the real
 * console was measured against a phantom ground: light-on-dark text scored 1.06:1 and was
 * reported as an unreadable control, while genuinely low-contrast DARK text would have scored
 * well against the same phantom white and passed.
 *
 * The fixtures hid it, because `low-contrast.html` defines `--pg-env` — so the negative control
 * went green and proved only that the check works on a page built to satisfy it.
 *
 * Two rules follow, and they are the point:
 *   1. Resolve the ground by WALKING UP from the element to the first opaque background, which
 *      is what a human eye does. A token name is a guess about where the element sits.
 *   2. If a ground cannot be established, return UNVERIFIED rather than falling back to
 *      something arbitrary. A fallback that silently changes what is being measured produces
 *      numbers, not findings.
 */
export async function aaAgainstEnv(page, minRatio = 4.5) {
  return page.evaluate((min) => {
    const parse = (c) => {
      const m = String(c).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(",").map((n) => parseFloat(n));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    /** The first ancestor that actually paints — transparent ancestors do not set the ground. */
    const groundOf = (el) => {
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg && bg.a > 0.9) return bg;
      }
      const body = parse(getComputedStyle(document.body).backgroundColor);
      return body && body.a > 0.9 ? body : null;
    };

    const bad = [];
    let unresolved = 0;
    for (const el of document.querySelectorAll("[data-contrast], p, span, a, button, h1, h2, h3, b, small, code")) {
      const text = el.textContent && el.textContent.trim();
      if (!text) continue;
      // Only elements holding their OWN text: a wrapper inherits a colour it never paints.
      if (!(el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) continue;
      const fg = parse(cs.color);
      const ground = groundOf(el);
      if (!fg) continue;
      if (!ground) { unresolved++; continue; }
      const lf = lum(fg), lg = lum(ground);
      const ratio = (Math.max(lf, lg) + 0.05) / (Math.min(lf, lg) + 0.05);
      // AA relaxes to 3:1 for large text (18.66px bold, or 24px), and an `aria-hidden` glyph is
      // NOT text at all — it is out of the accessibility tree, so no reader ever announces it.
      // It is still VISIBLE though, so it takes the 3:1 non-text bar rather than an exemption:
      // exempting it outright would let a genuinely invisible decorative mark pass silently.
      const px = parseFloat(cs.fontSize);
      const large = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      const decorative = el.closest("[aria-hidden='true']") !== null;
      if (ratio < (large || decorative ? 3 : min)) {
        const asRgb = (c) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
        bad.push(
          `${el.tagName.toLowerCase()} "${text.slice(0, 18)}" ${ratio.toFixed(2)}:1 ` +
            `— ${asRgb(fg)} on ${asRgb(ground)}`,
        );
      }
    }
    if (unresolved && !bad.length) {
      return { ok: false, detail: `${unresolved} element(s) had no resolvable ground — unverified, not clean` };
    }
    return { ok: bad.length === 0, detail: bad.slice(0, 6).join("; ") || "none" };
  }, minRatio);
}

// ── The owner's reject-on-sight list, made mechanical where it can be ──────────────────────
// Stated 2026-08-23: seven things rejected on sight when frames arrive; everything else is a
// judgement call to argue rather than reject. Four are measurable and belong here rather than in
// an eye. Three are NOT mechanically checkable and are named in the report so nobody mistakes a
// green harness for a green taste pass:
//   · depth from darkening rather than layered elevation — needs an eye against the pack
//   · motion on anything that is not real activity — needs to know what is actually running
//   · gold-as-treatment nuance (a selected rail slot is champagne ring + bloom, NOT gold fill) —
//     partially covered by goldOnlyOnAct below, but the "ring + bloom" reading is a taste call
// Absence of a failure here is absence of evidence for those three, not evidence of absence.

/** The spine must never render below 340px at any width. */
export async function spineFloor(page, min = 340) {
  const w = await page.$eval("[data-shell-grid]", (e) => {
    const tracks = getComputedStyle(e).gridTemplateColumns.split(/\s+/).filter(Boolean);
    return tracks.length ? parseFloat(tracks[tracks.length - 1]) : NaN;
  }).catch(() => NaN);
  if (Number.isNaN(w)) return { ok: false, detail: "could not read the spine track" };
  // A collapsed spine is 0 by design; a spine that is present must clear the floor.
  return {
    ok: w === 0 || w >= min,
    detail: `spine track ${w}px (floor ${min}px; 0 = deliberately collapsed)`,
  };
}

/** Four type sizes, three faces. A fifth of either is a reject. */
export async function typeLadder(page, maxSizes = 4, maxFaces = 3) {
  const found = await page.evaluate(() => {
    const sizes = new Set(), faces = new Set();
    for (const el of document.querySelectorAll("*")) {
      if (!el.textContent || !el.textContent.trim()) continue;
      if (!(el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))) continue;
      const cs = getComputedStyle(el);
      sizes.add(Math.round(parseFloat(cs.fontSize) * 2) / 2);
      faces.add(cs.fontFamily.split(",")[0].replace(/["']/g, "").trim());
    }
    return { sizes: [...sizes].sort((a, b) => a - b), faces: [...faces].sort() };
  });
  const ok = found.sizes.length <= maxSizes && found.faces.length <= maxFaces;
  return {
    ok,
    detail: `${found.sizes.length} sizes [${found.sizes.join(", ")}] · ${found.faces.length} faces [${found.faces.join(", ")}]`,
  };
}

/**
 * Gold is spent ONLY on the act — tested against the ACT TOKENS by resolved value, never a hue range.
 *
 * A hue-range check false-positives on the legitimate selection treatment, and a check that cries
 * wolf gets switched off, after which it catches nothing. The pack's real seam is OPACITY, not hue:
 * the act is an opaque gradient of --pg-gold-core → --pg-gold 42% → --pg-gold-fill on a
 * --pg-gold-deep border, while a selected rail slot carries --pg-gold-bloom, which is the SAME
 * family at ~.28–.30 alpha, plus a ring. Same hue, different weight.
 *
 * (Recorded for the design side: there is no `--pg-champagne` token in the pack — the family is
 * --pg-gold / -deep / -bloom / -core / -fill. The distinction asked for is real; its name is not.)
 *
 * So: resolve the act tokens from the live document and flag a background only when it MATCHES one
 * of them at act weight. Anything at bloom alpha passes. Marked act surfaces opt out with data-act.
 */
export async function goldOnlyOnAct(page, alphaFloor = 0.5) {
  return page.evaluate(({ floor }) => {
    const rgba = (c) => {
      const m = String(c).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(",").map((n) => parseFloat(n));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const probe = document.createElement("span");
    probe.style.display = "none";
    document.body.appendChild(probe);
    const resolve = (tok) => {
      probe.style.color = "";
      probe.style.color = `var(${tok})`;
      const v = getComputedStyle(probe).color;
      return v && v !== "rgba(0, 0, 0, 0)" ? rgba(v) : null;
    };
    // The act's own tokens. --pg-gold-bloom is deliberately NOT here: it is the selection treatment.
    const act = ["--pg-gold-fill", "--pg-gold", "--pg-gold-core"].map(resolve).filter(Boolean);
    probe.remove();
    if (!act.length) {
      return { ok: false, detail: "act gold tokens unresolvable — check cannot run, treat as unverified" };
    }
    const near = (c) => act.some((t) => Math.abs(c.r - t.r) <= 12 && Math.abs(c.g - t.g) <= 12 && Math.abs(c.b - t.b) <= 12);

    const bad = [];
    for (const el of document.querySelectorAll("*")) {
      if (el.closest("[data-act]") || el.closest("[data-harness-label]")) continue;
      const bg = rgba(getComputedStyle(el).backgroundColor);
      if (!bg || bg.a < floor) continue; // bloom-weight passes by design
      if (!near(bg)) continue;
      const slot = el.getAttribute("data-slot");
      bad.push(`${el.tagName.toLowerCase()}${slot ? `[${slot}]` : ""} bg ${getComputedStyle(el).backgroundColor}`);
    }
    return {
      ok: bad.length === 0,
      detail: bad.slice(0, 6).join("; ") || `none (act tokens resolved: ${act.length}, alpha floor ${floor})`,
    };
  }, { floor: alphaFloor });
}

/**
 * COLLAPSE ORDER, checked at three widths rather than a full sweep.
 *
 * The order is: the spine collapses to 0 FIRST, then the rail goes compact 216 → 72, and the band is
 * the LAST thing to change — it thins but never disappears, because it is the thing that says what
 * scope you are in. **If the band changes before the spine has fully collapsed, that is the defect.**
 */
export async function collapseOrder(page, widths = [1600, 1100, 820]) {
  const read = async () => page.evaluate(() => {
    const g = document.querySelector("[data-shell-grid]");
    const band = document.querySelector("[data-scope-band]");
    if (!g) return null;
    const tracks = getComputedStyle(g).gridTemplateColumns.split(/\s+/).filter(Boolean).map(parseFloat);
    const br = band?.getBoundingClientRect();
    return {
      rail: tracks[0],
      spine: tracks[tracks.length - 1],
      band: band ? Math.round(br.height) : null,
      bandVisible: band ? br.height > 0 && getComputedStyle(band).display !== "none" : null,
    };
  });

  const seen = [];
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.waitForTimeout(320); // the grid transition is 200ms
    const s = await read();
    if (!s) return { ok: false, detail: "no [data-shell-grid]" };
    seen.push({ w, ...s });
  }
  if (seen.some((s) => s.band === null)) {
    return { ok: false, detail: "no [data-scope-band] — collapse order cannot be checked" };
  }

  const problems = [];
  // The band must never disappear, at any width.
  for (const s of seen) {
    if (!s.bandVisible) problems.push(`band gone at ${s.w}px`);
  }
  // The band must not change height while the spine is still open.
  for (let i = 1; i < seen.length; i++) {
    const prev = seen[i - 1], cur = seen[i];
    if (cur.band !== prev.band && prev.spine > 0) {
      problems.push(`band changed ${prev.band}→${cur.band}px at ${cur.w}px while the spine was still ${prev.spine}px`);
    }
    // The rail must not go compact while the spine is still open.
    if (cur.rail < prev.rail && prev.spine > 0) {
      problems.push(`rail compacted ${prev.rail}→${cur.rail}px at ${cur.w}px while the spine was still ${prev.spine}px`);
    }
  }
  return {
    ok: problems.length === 0,
    detail: problems.join("; ") || seen.map((s) => `${s.w}px rail=${s.rail} spine=${s.spine} band=${s.band}`).join(" | "),
  };
}
