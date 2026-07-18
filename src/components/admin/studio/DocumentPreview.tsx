// The Studio DOCUMENT canvas (#119/#292) — renders a design-agent-authored long-form document
// (guide, one-pager, ebook, checklist, worksheet) as a premium, book/one-pager-grade artifact, NOT a
// Word dump. It draws the block vocabulary the agent authors (cover → section-header → prose → callout
// → pull-quote → list → stat → cta) onto a "paper" sheet floating on the studio canvas well.
//
// Craft (§11/§22/§23): a designed COVER leads (never body paragraph one); a real modular type scale
// with tight negative tracking on the display title (the "expensive" tell); a hard reading measure so
// prose never becomes a wall; section rhythm (section gap >> paragraph gap); layered depth via a
// bordered, shadowed sheet, not a flat fill; token-only, AA in both themes, motion-safe. Gold is NOT
// spent here (§11 — gold is only the act/approve moment on the chrome); the document's own CTA renders
// on the neutral/indigo primary, and headings are ink/indigo.
//
// "Print / Save as PDF" is HONEST (§13): it opens the browser's native print dialog (whose "Save as
// PDF" is a real, universal export) over a print-scoped view of just this sheet — it is NOT a
// server-rendered PDF binary (that, plus ebook pagination, is a tracked fast-follow). It's labeled for
// exactly what it does.
import { useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StudioDocBlock, StudioDocument } from "./studio-types";

const CALLOUT_TONE: Record<string, { bar: string; tint: string; label: string }> = {
  tip: { bar: "--success", tint: "--success", label: "Tip" },
  "do-this": { bar: "--success", tint: "--success", label: "Do this" },
  warning: { bar: "--warning", tint: "--warning", label: "Heads up" },
  "key-insight": { bar: "--primary", tint: "--primary", label: "Key insight" },
  definition: { bar: "--primary", tint: "--primary", label: "Definition" },
  example: { bar: "--muted-foreground", tint: "--muted-foreground", label: "Example" },
};

/** Prose renders through react-markdown with token-styled elements so a heading/link/list inside body
 *  copy stays on-brand and readable (measure-capped by the parent). */
function Prose({ markdown }: { markdown: string }) {
  return (
    <div className="max-w-[68ch] text-[1.0625rem] leading-[1.7] text-foreground/90 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_em]:italic [&_strong]:font-semibold [&_strong]:text-foreground [&_p]:mt-4 first:[&_p]:mt-0 [&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:tracking-tight [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1.5">
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  );
}

function Block({ block }: { block: StudioDocBlock }) {
  switch (block.type) {
    case "cover":
      return (
        <header className="relative overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-gradient-to-br from-[hsl(var(--primary)/0.10)] via-[hsl(var(--card))] to-[hsl(var(--card))] px-8 py-12 md:px-12 md:py-16">
          {block.eyebrow && (
            <p className="mb-4 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-primary">{block.eyebrow}</p>
          )}
          <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-bold leading-[1.05] tracking-[-0.02em] text-foreground">
            {block.title}
          </h1>
          {block.subhead && (
            <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-muted-foreground">{block.subhead}</p>
          )}
        </header>
      );
    case "section-header":
      return (
        <div className="mt-2">
          {block.kicker && (
            <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary">{block.kicker}</p>
          )}
          <h2 className="flex items-baseline gap-3 font-display text-2xl font-semibold tracking-tight text-foreground md:text-[1.7rem]">
            {typeof block.number === "number" && (
              <span className="text-base font-semibold tabular-nums text-muted-foreground">{String(block.number).padStart(2, "0")}</span>
            )}
            <span>{block.title}</span>
          </h2>
          <div className="mt-3 h-px w-full bg-[hsl(var(--border))]" aria-hidden />
        </div>
      );
    case "prose":
      return <Prose markdown={block.markdown} />;
    case "callout": {
      const tone = CALLOUT_TONE[block.variant ?? "key-insight"] ?? CALLOUT_TONE["key-insight"];
      return (
        <aside
          className="rounded-xl border border-l-4 p-5"
          style={{
            borderColor: `hsl(var(${tone.bar}) / 0.35)`,
            borderLeftColor: `hsl(var(${tone.bar}))`,
            background: `hsl(var(${tone.tint}) / 0.06)`,
          }}
        >
          <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em]" style={{ color: `hsl(var(${tone.bar}))` }}>
            {block.title || tone.label}
          </p>
          <p className="text-[0.975rem] leading-relaxed text-foreground/90">{block.body}</p>
        </aside>
      );
    }
    case "pull-quote":
      return (
        <blockquote className="border-l-2 border-primary/50 py-1 pl-6">
          <p className="font-display text-xl font-medium italic leading-snug text-foreground md:text-2xl">“{block.quote}”</p>
          {block.attribution && <footer className="mt-3 text-sm text-muted-foreground">— {block.attribution}</footer>}
        </blockquote>
      );
    case "stat":
      return (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] px-6 py-5">
          <div className="font-display text-4xl font-bold tabular-nums tracking-tight text-foreground">{block.value}</div>
          <div className="mt-1 text-sm text-muted-foreground">{block.label}</div>
        </div>
      );
    case "list": {
      const items = Array.isArray(block.items) ? block.items : [];
      if (block.style === "checklist") {
        return (
          <ul className="space-y-2.5">
            {items.map((it, i) => (
              <li key={i} className="flex items-start gap-3 text-[1.0625rem] leading-relaxed text-foreground/90">
                <span className="mt-1 h-4 w-4 shrink-0 rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.6)]" aria-hidden />
                <span>{it}</span>
              </li>
            ))}
          </ul>
        );
      }
      const Tag = block.style === "numbered" ? "ol" : "ul";
      return (
        <Tag className={cn("space-y-2 pl-5 text-[1.0625rem] leading-relaxed text-foreground/90", block.style === "numbered" ? "list-decimal" : "list-disc")}>
          {items.map((it, i) => <li key={i} className="pl-1">{it}</li>)}
        </Tag>
      );
    }
    case "cta":
      return (
        <div className="rounded-2xl border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)] px-8 py-9 text-center">
          <p className="font-display text-xl font-semibold tracking-tight text-foreground md:text-2xl">{block.headline}</p>
          <span className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">
            {block.action}
          </span>
        </div>
      );
    default:
      return null;
  }
}

export function DocumentPreview({ document, className }: { document: StudioDocument; className?: string }) {
  // Print / Save as PDF — the browser's native dialog over a print-scoped view of just this sheet.
  // A body-level class + the @media print rules in index.css hide the rest of the app while printing.
  const onPrint = useCallback(() => {
    const root = window.document.documentElement;
    root.classList.add("paige-doc-printing");
    const cleanup = () => {
      root.classList.remove("paige-doc-printing");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }, []);

  return (
    <div className={cn("h-full overflow-y-auto", className)}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-1 py-1">
        {/* Toolbar — neutral, no gold (§11). Honest label: it's the browser's Save-as-PDF. */}
        <div className="flex shrink-0 items-center justify-end print:hidden">
          <Button variant="outline" size="sm" onClick={onPrint} className="gap-2">
            <Printer className="h-4 w-4" aria-hidden />
            Print / Save as PDF
          </Button>
        </div>
        {/* The paper sheet — layered depth via border + soft shadow (§22), never a flat fill. */}
        <article
          data-paige-doc-sheet
          className="space-y-8 rounded-2xl border border-[hsl(var(--border))] bg-card px-6 py-8 shadow-[0_24px_60px_-28px_hsl(var(--studio-ink,var(--foreground))/0.5)] md:px-12 md:py-12"
        >
          {document.blocks.map((b, i) => <Block key={i} block={b} />)}
        </article>
      </div>
    </div>
  );
}

export default DocumentPreview;
