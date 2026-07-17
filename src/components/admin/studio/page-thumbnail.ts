// Best-effort preview capture for the projects gallery (Studio Task #295).
//
// Snapshots the SETTLED same-origin LivePreview iframe — the exact GrowthBlocks render that
// ships — into a small 16:10 cover, so a page project shows its real prior work on its gallery
// card instead of the generic glyph. This is non-blocking and NEVER throws into the
// save/generate path (§13): on ANY failure it logs and returns null, and ProjectCard falls back
// to its GlyphPlate. It never fabricates a blank/placeholder image and calls it a preview.
//
// html2canvas is heavy, so it's pulled in with a dynamic import exactly like EntityDiagramCard.

/** Stored cover width — small asset, crisp on a 2x/retina card well. The card renders 16:10. */
const THUMB_WIDTH = 800;
/** ProjectCard's cover is 16:10; match it so the slice reads as the page, never a clipped strip. */
const THUMB_RATIO = 10 / 16;

/**
 * html2canvas the TOP 16:10 slice of the rendered page body and return a small JPEG blob.
 *
 * `body` MUST be the SETTLED iframe body — LivePreview only exposes it after its cloned
 * stylesheets have landed; snapshotting earlier yields the "no CSS" unstyled shot. We also
 * await `fonts.ready` here so a slow webfont can't rasterize fallback text into the cover
 * (a tighter guarantee than a fixed timing defer). We render at the frame's CURRENT preview
 * viewport width — whatever the operator last had it at (desktop by default; a mobile toggle
 * captures the mobile stack, i.e. what-you-see) — so `md:`/`lg:` rules resolve like the live
 * page, crop the hero band (the most representative slice), and downscale to THUMB_WIDTH.
 * Returns null on any failure — the caller treats null as "keep the glyph" (§13).
 */
export async function capturePageThumbnailBlob(body: HTMLElement): Promise<Blob | null> {
  try {
    if (!body?.isConnected) return null;
    const doc = body.ownerDocument;
    const win = doc.defaultView;
    if (!win) return null;

    // Wait for the frame's own webfonts before snapshotting so the cover never captures
    // fallback-font text. Best-effort — not all runtimes expose FontFaceSet.ready.
    try {
      await doc.fonts?.ready;
    } catch {
      /* fonts.ready unavailable/unsupported — proceed; a captured fallback font is still honest */
    }
    if (!body.isConnected) return null; // may have unmounted while awaiting fonts

    // The frame's CURRENT viewport width (desktop by default; the current preview device if
    // toggled) so the capture matches what the operator sees.
    const cssWidth = Math.max(win.innerWidth || body.clientWidth || 1024, 320);
    const cropHeight = Math.round(cssWidth * THUMB_RATIO); // 16:10 band from the top
    if (cropHeight <= 0) return null;

    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(body, {
      backgroundColor: "#ffffff",
      width: cssWidth,
      height: cropHeight,
      windowWidth: cssWidth,
      windowHeight: cropHeight,
      x: 0,
      y: 0,
      scale: THUMB_WIDTH / cssWidth, // downscale the desktop render to ~640px wide
      useCORS: true,
      logging: false,
    });

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.7);
    });
  } catch (err) {
    console.warn("[studio] page thumbnail capture failed (non-fatal):", err);
    return null;
  }
}
