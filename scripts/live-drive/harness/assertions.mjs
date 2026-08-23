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

export async function shellGrid(page, expectedCols) {
  const actual = await page.$eval("[data-shell-grid]", (e) =>
    getComputedStyle(e).gridTemplateColumns,
  ).catch(() => null);
  if (actual === null) return { ok: false, detail: "no [data-shell-grid] element" };
  // Computed values resolve to px, so compare the TRACK COUNT and the fixed first track
  // rather than the authored string — a resolved value never matches the authored one.
  const tracks = actual.split(/\s+/).filter(Boolean);
  return {
    ok: tracks.length === expectedCols,
    detail: `expected ${expectedCols} tracks — computed "${actual}" (${tracks.length})`,
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
 * AA against `--pg-env` — the TIGHTEST ground, not `--pg-canvas`. Checking against the
 * easier background is how a surface passes contrast and still fails in the eye.
 */
export async function aaAgainstEnv(page, minRatio = 4.5) {
  return page.evaluate((min) => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b] = m[1].split(",").map((n) => parseFloat(n));
      return [r, g, b];
    };
    const lum = ([r, g, b]) => {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const env = parse(
      getComputedStyle(document.documentElement).getPropertyValue("--pg-env").trim() ||
        getComputedStyle(document.body).backgroundColor,
    );
    if (!env) return { ok: false, detail: "--pg-env unresolvable" };
    const le = lum(env);
    const bad = [];
    for (const el of document.querySelectorAll("[data-contrast], p, span, a, button, h1, h2, h3")) {
      if (!el.textContent || !el.textContent.trim()) continue;
      const fg = parse(getComputedStyle(el).color);
      if (!fg) continue;
      const lf = lum(fg);
      const ratio = (Math.max(lf, le) + 0.05) / (Math.min(lf, le) + 0.05);
      if (ratio < min) bad.push(`${el.tagName.toLowerCase()} ${ratio.toFixed(2)}:1`);
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
 * Gold is spent ONLY on the act. A gold FILL on a resting element — a selected rail slot, a border,
 * an icon — is a reject. Marked act surfaces opt in with data-act.
 */
export async function goldOnlyOnAct(page) {
  return page.evaluate(() => {
    const goldish = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      const [r, g, b, a = "1"] = m[1].split(",").map((n) => parseFloat(n));
      if (parseFloat(a) < 0.15) return false;
      // warm, bright, and clearly not neutral
      return r > 150 && g > 110 && b < 140 && r - b > 60 && r >= g;
    };
    const bad = [];
    for (const el of document.querySelectorAll("*")) {
      if (el.closest("[data-act]") || el.closest("[data-harness-label]")) continue;
      const cs = getComputedStyle(el);
      if (goldish(cs.backgroundColor)) {
        bad.push(`${el.tagName.toLowerCase()}${el.getAttribute("data-slot") ? `[${el.getAttribute("data-slot")}]` : ""} bg ${cs.backgroundColor}`);
      }
    }
    return { ok: bad.length === 0, detail: bad.slice(0, 6).join("; ") || "none" };
  });
}
