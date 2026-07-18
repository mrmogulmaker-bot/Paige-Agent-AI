// #331 — the artifact VERSION strip, built on the shared ArtifactStrip primitive (§18: reuse, don't
// rebuild). It shows the append-only history of ONE artifact (v1…vN) so a version stack that used to
// live only in client state — and vanish on reload — is now read straight from the DB and durable.
//
// It is a DISTINCT axis from the image-SET carousel: the set strip flips through SIBLING images of one
// turn; this flips through the REVISIONS of one artifact. So on an image canvas the two render as two
// separate strips, and a version strip only appears when an artifact was genuinely iterated (>1 version)
// — never a fabricated one-entry "history" (§13).
//
// §11: gold is NEVER spent here. The active thumb rings INDIGO (via ArtifactStrip), the "Live" badge is
// an indigo tint, and "Revert to this version" is a NEUTRAL outline button — the only gold on the whole
// canvas stays on the existing Save act. §22: motion is inherited from ArtifactStrip (reduceMotion-gated
// color transition); the spinner respects motion-reduce.
import { useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArtifactStrip, type ArtifactStripItem } from "./ArtifactStrip";
import type { ArtifactVersion } from "./studio-types";

interface VersionItem extends ArtifactStripItem {
  version: ArtifactVersion;
}

function buildItems(versions: ArtifactVersion[]): VersionItem[] {
  // v1…vN left→right (the list RPC returns newest-first; the strip reads oldest-first so the timeline
  // reads naturally). tabular-nums caption + an indigo "Live" badge on the version the live row reflects.
  return [...versions]
    .sort((a, b) => a.versionNo - b.versionNo)
    .map((v) => ({
      id: v.id,
      label: `Version ${v.versionNo}${v.isCurrent ? " — current" : ""}`,
      caption: (
        <span className="flex items-center gap-1">
          v{v.versionNo}
          {v.isCurrent && (
            <span className="rounded-sm bg-[hsl(var(--primary)/0.12)] px-1 text-[0.55rem] font-semibold uppercase leading-tight tracking-wide text-primary">
              Live
            </span>
          )}
        </span>
      ),
      version: v,
    }));
}

function renderVersionThumb(item: VersionItem) {
  // A REAL snapshot thumbnail where one exists (image content); a numeral tile for page/doc/funnel
  // versions that carry no image — informative, never a decorative glyph-in-a-box (§22/§13).
  return item.version.thumbnailUrl ? (
    <img src={item.version.thumbnailUrl} alt="" aria-hidden className="h-full w-full object-cover" loading="lazy" />
  ) : (
    <span className="grid h-full w-full place-items-center font-display text-sm font-semibold tabular-nums text-muted-foreground">
      v{item.version.versionNo}
    </span>
  );
}

interface VersionStripProps {
  versions: ArtifactVersion[];
  /** The version currently on the stage (selection). Falls back to the live/current one. */
  selectedId: string | null;
  onSelect: (v: ArtifactVersion) => void;
  onRevert: (v: ArtifactVersion) => void;
  reduceMotion?: boolean;
  /** True while a render is in flight — the strip is reachable but not clickable. */
  disabled?: boolean;
  /** True while a restore is in flight — disables the revert button + spins it. */
  reverting?: boolean;
  className?: string;
}

/** The controlled version strip. The parent owns `selectedId` (so an image canvas can drive the stage
 *  preview from it). Renders nothing for a single-version artifact — a history is only ever shown when
 *  it's real (§13). */
export function VersionStrip({
  versions,
  selectedId,
  onSelect,
  onRevert,
  reduceMotion = false,
  disabled = false,
  reverting = false,
  className,
}: VersionStripProps) {
  if (versions.length < 2) return null;

  const items = buildItems(versions);
  const currentId = versions.find((v) => v.isCurrent)?.id ?? null;
  const active = selectedId ?? currentId;
  const selected = versions.find((v) => v.id === active) ?? null;
  // Revert only makes sense on a NON-current version — reverting to the live version is a no-op.
  const showRevert = !!selected && !selected.isCurrent;

  return (
    <div className={cn("flex w-full max-w-full flex-col items-center gap-1.5", className)}>
      <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Versions</span>
      <ArtifactStrip
        items={items}
        activeId={active}
        onSelect={(it) => onSelect(it.version)}
        renderThumb={renderVersionThumb}
        ariaLabel="Version history"
        disabled={disabled}
        reduceMotion={reduceMotion}
      />
      {showRevert && selected && (
        // NEUTRAL, never gold (§11): making a prior version live is a restore, not the act moment.
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={disabled || reverting}
          onClick={() => onRevert(selected)}
        >
          {reverting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Revert to this version
        </Button>
      )}
    </div>
  );
}

/** The uncontrolled convenience wrapper for surfaces that only need history + revert (documents, pages)
 *  and don't drive a stage preview from the selection. It owns the selection locally, snapping back to
 *  the live head whenever it moves (a new version or a revert), so the strip never lies about what's live. */
export function VersionBar({
  versions,
  onRevert,
  reduceMotion = false,
  disabled = false,
  reverting = false,
  className,
}: {
  versions: ArtifactVersion[];
  onRevert: (v: ArtifactVersion) => void;
  reduceMotion?: boolean;
  disabled?: boolean;
  reverting?: boolean;
  className?: string;
}) {
  const currentId = versions.find((v) => v.isCurrent)?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(currentId);
  useEffect(() => {
    setSelectedId(currentId);
  }, [currentId]);
  return (
    <VersionStrip
      versions={versions}
      selectedId={selectedId}
      onSelect={(v) => setSelectedId(v.id)}
      onRevert={onRevert}
      reduceMotion={reduceMotion}
      disabled={disabled}
      reverting={reverting}
      className={className}
    />
  );
}

export default VersionStrip;
