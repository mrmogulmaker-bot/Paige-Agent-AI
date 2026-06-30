// src/components/legal/LegalDocViewer.tsx
// Reusable renderer for a legal document (markdown body + version stamp).

import ReactMarkdown from "react-markdown";
import { type LegalDoc } from "@/lib/legal/useLegalDocuments";

export function LegalDocViewer({ doc, compact = false }: { doc: LegalDoc; compact?: boolean }) {
  return (
    <article className={compact ? "" : "max-w-3xl mx-auto px-4 sm:px-6 py-10"}>
      {!compact && (
        <header className="mb-8 pb-6 border-b border-border/60">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
            {doc.title}
          </h1>
          {doc.summary && (
            <p className="mt-3 text-muted-foreground text-base leading-relaxed">{doc.summary}</p>
          )}
          <p className="mt-4 text-xs text-muted-foreground/70">
            Version {doc.version} · Effective{" "}
            {new Date(doc.effective_date).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </header>
      )}
      <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-accent">
        <ReactMarkdown>{doc.body_md}</ReactMarkdown>
      </div>
    </article>
  );
}
