// The act.
//
// This is the ONE place gold is spent in the Studio (together with its toolbar trigger).
// It exists to make sure the gold click NEVER fails: the publish path on the server hard-
// refuses a page with unresolved blanks, a page that was never saved, or a signup section
// with no live form behind it — and the generator is *instructed* to leave bracketed blanks
// for the operator to fill. So a naive gold button would blow up on the very first click
// most operators ever make.
//
// Two things prevent that:
//   1. The preflight runs the server's own guards on the client first. The gold confirm
//      stays disabled until every check passes — a gold button that errors is worse than a
//      grey one that explains.
//   2. Confirm ALWAYS saves the draft and THEN publishes, in that order. The save is what
//      writes the draft columns and authors the live form behind the signup section.
import { useState } from "react";
import { AlertCircle, Check, Copy, ExternalLink, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatePill } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import type { PublishCheck } from "./studio";
import type { StudioError } from "./studio-types";

export interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onTitleChange: (title: string) => void;
  slug: string;
  onSlugChange: (slug: string) => void;
  status: "draft" | "published";
  /** The tenant's public web address. Null = a blocking check. */
  tenantSlug: string | null;
  /** Result of preflightPublish(). The gold confirm is DISABLED until every check passes. */
  checks: PublishCheck[];
  /** MUST save the draft, THEN publish — in that order, always. */
  onConfirm: () => Promise<void>;
  publishing: boolean;
  /** Deep-link the canvas to a section that still carries a blank. */
  onFixBlock?: (index: number) => void;
  /** The REAL url the server returned. Shown ONLY after a successful publish. */
  publishedUrl?: string | null;
  error?: StudioError | null;
  className?: string;
}

/** Same normalization the save path applies, so what the operator types is what ships. */
export function kebabSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function PublishDialog({
  open,
  onOpenChange,
  title,
  onTitleChange,
  slug,
  onSlugChange,
  status,
  tenantSlug,
  checks,
  onConfirm,
  publishing,
  onFixBlock,
  publishedUrl,
  error,
  className,
}: PublishDialogProps) {
  const [copied, setCopied] = useState(false);
  const ready = checks.length > 0 && checks.every((c) => c.ok);
  const republish = status === "published";

  const copyUrl = async () => {
    if (!publishedUrl) return;
    const absolute = publishedUrl.startsWith("http")
      ? publishedUrl
      : `${window.location.origin}${publishedUrl}`;
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  // ── after the act: report what actually happened, with the server's own URL ──────────
  if (publishedUrl) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn("sm:max-w-lg", className)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              It's live
              <StatePill state="success">Published</StatePill>
            </DialogTitle>
            <DialogDescription>Anyone with the link can see this page now.</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-xs text-foreground">{publishedUrl}</code>
            <Button variant="ghost" size="sm" onClick={copyUrl} aria-label="Copy the page link">
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            </Button>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" asChild>
              <a href={publishedUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden />
                View it
              </a>
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-lg", className)}>
        <DialogHeader>
          <DialogTitle className="font-display">Publish this page</DialogTitle>
          <DialogDescription>
            {republish
              ? "This page is already live. Pushing the update replaces what visitors see."
              : "Give it a name and a web address, then send it out."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="publish-title">Page name</Label>
            <Input
              id="publish-title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Masterclass registration"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="publish-slug">Web address</Label>
            <Input
              id="publish-slug"
              value={slug}
              onChange={(e) => onSlugChange(kebabSlug(e.target.value))}
              placeholder="masterclass"
              aria-describedby="publish-slug-preview"
            />
            <p id="publish-slug-preview" className="truncate text-xs text-muted-foreground">
              {tenantSlug ? `/p/${tenantSlug}/${slug || "…"}` : "Set your workspace's web address first."}
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Before it goes out
            </div>
            <ul className="space-y-2">
              {checks.map((check) => (
                <li key={check.id} className="flex items-start gap-2.5 text-sm">
                  <span
                    className={cn(
                      "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full",
                      check.ok
                        ? "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]"
                        : "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]",
                    )}
                    aria-hidden
                  >
                    {check.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block", check.ok ? "text-muted-foreground" : "font-medium text-foreground")}>
                      {check.label}
                    </span>
                    {!check.ok && check.detail && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{check.detail}</span>
                    )}
                    {!check.ok && check.blockIndexes && check.blockIndexes.length > 0 && onFixBlock && (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {check.blockIndexes.map((index) => (
                          <Button
                            key={index}
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              onOpenChange(false);
                              onFixBlock(index);
                            }}
                          >
                            Fix section {index + 1}
                          </Button>
                        ))}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <span>{error.message}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={publishing}>
            Not yet
          </Button>
          {/* THE act. The whole gold budget of this surface, spent here and on its trigger. */}
          <Button variant="gold" onClick={() => void onConfirm()} disabled={!ready || publishing}>
            {publishing ? "Publishing…" : republish ? "Push the update live" : "Publish it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PublishDialog;
