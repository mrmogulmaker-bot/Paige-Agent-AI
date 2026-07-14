// The canvas. Preview == published is enforced HERE or nowhere.
//
// It mounts the REAL <GrowthBlocks> — the same module, the same theme resolver, the same
// prop set, the same `© {year}` footer child that GrowthPageRenderer passes to the public
// page. There is no lookalike, no local block switch, no pre-resolved theme.
//
// ── THE BREAKPOINT TRAP (why there is an iframe here) ──────────────────────────────────
// GrowthBlocks styles with Tailwind `md:` classes, and those key off the VIEWPORT, not the
// container. A 390px-wide <div> sitting inside a 1440px viewport still renders the DESKTOP
// layout — so a naive device toggle would show a "mobile preview" that is simply false
// (§13). The fix is to portal the exact same React tree into a same-origin <iframe> and
// clone the parent's stylesheets into its head. Same component instance, same CSS, but
// breakpoints, `100dvh`, and `prefers-reduced-motion` now resolve against the frame's own
// viewport. Honest desktop AND honest mobile.
//
// The frame is RESIZED on a device toggle, never remounted — remounting would reset the
// FAQ block's open index and the countdown's tick, a cheap-feeling jolt on the one surface
// whose whole job is to feel expensive.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Wand2 } from "lucide-react";
import type { GrowthBlock, GrowthPageTheme } from "@/lib/growth";
import { GrowthBlocks } from "@/components/growth/GrowthBlocks";
import { GP_SHIMMER } from "@/components/growth/growth-motion";
import { EmptyState } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import type { DeviceFrame } from "./studio-types";

export interface LivePreviewProps {
  /** The blocks to draw — the draft array, or generation.emitted mid-run. */
  blocks: GrowthBlock[];
  /** IDENTICAL prop set to GrowthPageRenderer: same theme, same floor, same resolver. */
  theme: GrowthPageTheme | null;
  brandFloor: GrowthPageTheme | null;
  /** Lets embedded_form resolve a live form exactly as the published page does. */
  tenantId?: string;
  device: DeviceFrame;
  /** Shimmer placeholders appended BELOW the real blocks while more are materializing. */
  trailingSkeletons?: number;
  /** Section selection for the conversational edit. Always false during generation. */
  interactive?: boolean;
  selectedIndex?: number | null;
  onSelectBlock?: (index: number | null) => void;
  /** Render the same footer child the published page renders. Default true (parity). */
  showFooter?: boolean;
  className?: string;
}

/** Logical widths. Desktop floors at 1024 so `md:`/`lg:` rules resolve like a real desktop. */
const DESKTOP_MIN_WIDTH = 1024;
const MOBILE_WIDTH = 390;
const INITIAL_FRAME_HEIGHT = 720;

/** Copy the parent document's style sources into the frame. Tailwind (a <style> tag in dev,
 *  a <link rel="stylesheet"> in prod) AND the `.gp-*` keyframes both live there — without
 *  this the preview renders completely unstyled. */
function cloneStyleSources(doc: Document) {
  const sources = document.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(
    'style, link[rel="stylesheet"]',
  );
  sources.forEach((node) => {
    const clone = node.cloneNode(true) as HTMLStyleElement | HTMLLinkElement;
    // Reading `.href` yields the fully-resolved absolute URL, so the clone can't resolve
    // against the frame's about:blank base and 404.
    if (node instanceof HTMLLinkElement && clone instanceof HTMLLinkElement) clone.href = node.href;
    doc.head.appendChild(clone);
  });
  // Carry the light/dark class + data-theme the admin shell set, so the preview honors the
  // same color scheme the operator is looking at.
  doc.documentElement.className = document.documentElement.className;
  const themeAttr = document.documentElement.getAttribute("data-theme");
  if (themeAttr) doc.documentElement.setAttribute("data-theme", themeAttr);
}

interface BlockRect {
  top: number;
  height: number;
}

export function LivePreview({
  blocks,
  theme,
  brandFloor,
  tenantId,
  device,
  trailingSkeletons = 0,
  interactive = false,
  selectedIndex = null,
  onSelectBlock,
  showFooter = true,
  className,
}: LivePreviewProps) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [frameBody, setFrameBody] = useState<HTMLElement | null>(null);
  const [frameHeight, setFrameHeight] = useState(INITIAL_FRAME_HEIGHT);
  const [paneWidth, setPaneWidth] = useState(0);
  const [rects, setRects] = useState<BlockRect[]>([]);

  const isEmpty = blocks.length === 0 && trailingSkeletons <= 0;

  // ── the frame document: written ONCE, then only resized ────────────────────────────
  useEffect(() => {
    if (isEmpty) return;
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;

    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    doc.close();
    cloneStyleSources(doc);
    doc.body.style.margin = "0";
    doc.body.style.overflowX = "hidden";
    setFrameBody(doc.body);

    return () => setFrameBody(null);
  }, [isEmpty]);

  // ── the pane width, so a narrow rail scales the desktop frame instead of clipping it ──
  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setPaneWidth(w);
    });
    ro.observe(pane);
    setPaneWidth(pane.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [isEmpty]);

  const isMobile = device === "mobile";
  const logicalWidth = isMobile ? MOBILE_WIDTH : Math.max(paneWidth || DESKTOP_MIN_WIDTH, DESKTOP_MIN_WIDTH);
  // Scale-to-fit lives on the WRAPPER only — never on the React tree, which stays untouched.
  const scale = paneWidth > 0 && paneWidth < logicalWidth ? paneWidth / logicalWidth : 1;

  /** Re-measure the frame's content height and each block wrapper's box. The block wrappers
   *  are the direct children of the GrowthBlocks scope div — index i is block i. */
  const measure = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;

    const next = Math.max(doc.body.scrollHeight, INITIAL_FRAME_HEIGHT);
    setFrameHeight((h) => (Math.abs(h - next) > 1 ? next : h));

    const scope = doc.body.firstElementChild;
    if (!scope) {
      setRects([]);
      return;
    }
    const wrappers = Array.from(scope.children).slice(0, blocks.length);
    setRects(
      wrappers.map((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return { top: r.top + (doc.documentElement.scrollTop || 0), height: r.height };
      }),
    );
  }, [blocks.length]);

  useEffect(() => {
    if (!frameBody) return;
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(frameBody);
    // Fonts and images land after paint and change the box — re-measure when they do.
    const raf = window.requestAnimationFrame(measure);
    const settle = window.setTimeout(measure, 400);
    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
  }, [frameBody, measure, blocks, trailingSkeletons, theme, brandFloor, device]);

  // Esc leaves section mode — bound in BOTH documents, since focus may sit inside the frame.
  useEffect(() => {
    if (!interactive || !onSelectBlock) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSelectBlock(null);
    };
    const doc = frameRef.current?.contentDocument;
    window.addEventListener("keydown", onKey);
    doc?.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      doc?.removeEventListener("keydown", onKey);
    };
  }, [interactive, onSelectBlock, frameBody]);

  // ── the scaffold / skeletons, drawn INSIDE the themed `--gp-*` scope ────────────────
  const skeletons = useMemo(() => {
    if (trailingSkeletons <= 0) return null;
    const bar = `rounded-xl ${GP_SHIMMER}`;

    // Before the first real block lands there is no honest count — so we draw a generic
    // page-shaped scaffold that reads as a scaffold, never as a promise of the final page.
    if (blocks.length === 0) {
      return (
        <div className="mx-auto w-full max-w-6xl px-6 py-24 md:px-10 md:py-36" aria-hidden>
          <div className="mx-auto max-w-3xl space-y-6 text-center">
            <div className={`${bar} mx-auto h-6 w-40`} />
            <div className={`${bar} mx-auto h-14 w-full max-w-2xl`} />
            <div className={`${bar} mx-auto h-14 w-3/4`} />
            <div className={`${bar} mx-auto h-5 w-1/2`} />
            <div className={`${bar} mx-auto mt-4 h-12 w-44`} />
          </div>
          <div className="mt-20 grid gap-6 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`${bar} h-52 w-full`} />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-12 md:px-10" aria-hidden>
        {Array.from({ length: trailingSkeletons }).map((_, i) => (
          <div key={i} className={`${bar} h-40 w-full`} />
        ))}
      </div>
    );
  }, [trailingSkeletons, blocks.length]);

  if (isEmpty) {
    return (
      <div className={cn("rounded-xl border border-border bg-card", className)}>
        <EmptyState
          icon={Wand2}
          tone="brand"
          title="Nothing on the canvas yet"
          description="Describe the page on the left and Paige will draft it here — every section drawn by the same renderer that ships it."
        />
      </div>
    );
  }

  // The EXACT tree the published page mounts: same component, same theme, same floor, same
  // tenantId, same footer child. Skeletons ride inside the scope so they inherit the theme.
  const tree = (
    <GrowthBlocks blocks={blocks} theme={theme} brandFloor={brandFloor} tenantId={tenantId}>
      {skeletons}
      {showFooter && (
        <footer className="py-10 text-center text-xs" style={{ color: "var(--gp-muted)" }}>
          © {new Date().getFullYear()}
        </footer>
      )}
    </GrowthBlocks>
  );

  return (
    <div ref={paneRef} className={cn("w-full", className)}>
      <div style={{ height: frameHeight * scale }}>
        <div
          className={cn(isMobile && "mx-auto")}
          style={{ width: logicalWidth, transform: scale === 1 ? undefined : `scale(${scale})`, transformOrigin: "top left" }}
        >
          <div
            className={cn(
              "relative overflow-hidden border border-border bg-card",
              isMobile ? "rounded-2xl shadow-lg" : "rounded-xl",
            )}
          >
            <iframe
              ref={frameRef}
              title="Page preview"
              className="block w-full border-0"
              style={{ height: frameHeight }}
            />

            {interactive && onSelectBlock && (
              // The selection overlay lives in the PARENT document, positioned over the frame,
              // so the previewed tree itself stays byte-identical to the published tree.
              // Indigo `--ring`, never gold (§11).
              <div
                className="absolute inset-0"
                onClick={() => onSelectBlock(null)}
                role="presentation"
              >
                {rects.map((r, i) => {
                  const selected = selectedIndex === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectBlock(selected ? null : i);
                      }}
                      aria-pressed={selected}
                      aria-label={`Edit section ${i + 1}`}
                      className={cn(
                        "group absolute left-0 right-0 rounded-lg text-left transition-[box-shadow,background-color]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                        selected
                          ? "ring-2 ring-[hsl(var(--ring))]"
                          : "hover:bg-[hsl(var(--ring)/0.06)] hover:ring-1 hover:ring-[hsl(var(--ring))]",
                      )}
                      style={{ top: r.top, height: r.height }}
                    >
                      <span
                        className={cn(
                          "pointer-events-none absolute right-3 top-3 rounded-full bg-[hsl(var(--ring))] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground shadow-sm transition-opacity",
                          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                        )}
                      >
                        {selected ? `Editing section ${i + 1}` : "Edit"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {frameBody && createPortal(tree, frameBody)}
    </div>
  );
}

export default LivePreview;
