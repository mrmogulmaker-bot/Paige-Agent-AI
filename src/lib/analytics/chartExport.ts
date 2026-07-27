// Per-chart export actions for the operator analytics dashboard.
//   • exportNodeToPng — rasterize a rendered chart node to a PNG download (html2canvas, bundled).
//   • exportRowsToCsv — a rows -> CSV download, mirroring investorExport.ts's escaping.
//   • triggerDownload — the shared Blob -> <a download> helper (same pattern as investorExport.ts).
//
// §13 honesty: these export what is ACTUALLY on screen / in the passed rows — they never
// fabricate a series. An empty chart exports an empty/EmptyState frame, not invented data.

import html2canvas from "html2canvas";

/** Shared Blob -> download trigger (mirrors src/lib/analytics/investorExport.ts). */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateSlug(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function ensurePngName(filename: string): string {
  return /\.png$/i.test(filename) ? filename : `${filename}.png`;
}

/**
 * Rasterize a rendered DOM node (a chart's SectionCard/container) to a PNG download.
 *
 * The current theme background is read off the node's computed style so the exported image
 * matches light/dark (html2canvas paints transparent as white otherwise). Scale 2 for a crisp
 * retina export. Returns the Blob as well for callers that want to do something else with it.
 */
export async function exportNodeToPng(
  node: HTMLElement | null,
  filename: string,
  opts?: { scale?: number; background?: string | null },
): Promise<Blob | null> {
  if (!node) return null;

  const background =
    opts?.background !== undefined
      ? opts.background
      : getComputedStyle(node).backgroundColor || getComputedStyle(document.body).backgroundColor || null;

  const canvas = await html2canvas(node, {
    scale: opts?.scale ?? 2,
    backgroundColor: background,
    useCORS: true,
    logging: false,
  });

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;

  triggerDownload(blob, ensurePngName(filename));
  return blob;
}

/**
 * Serialize rows to CSV and download. Header + rows of strings/numbers; escaping mirrors
 * investorExport.ts (quote any cell containing a comma, quote, or newline).
 */
export function exportRowsToCsv(
  filename: string,
  header: string[],
  rows: Array<Array<string | number>>,
): void {
  const esc = (cell: string | number) => {
    const s = String(cell);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const name = /\.csv$/i.test(filename) ? filename : `${filename}-${dateSlug()}.csv`;
  triggerDownload(blob, name);
}
