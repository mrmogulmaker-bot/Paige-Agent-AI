// Media Library (#284) — the tenant's curation-of-winners board, across every project and every
// creative type. It reads the ONE keep layer (studio_library_items, via list_library) and shows
// what the tenant deliberately SAVED: pages, funnels, forms, images, copy. Filter by type, preview
// the snapshot, download an image, or drop something from the library — all Paige-callable underneath
// (save_to_library / remove_from_library / list_library), this page is just one caller (§10).
//
// §18/§21: ONE destination, filtered by kind INSIDE — never a type-picker the human clears first.
// §11: compact header (the board leads), real thumbnails not glyph-in-a-box where we have them.
// The ONE gold act on this surface is Upload — bringing outside media in is a persist/act, like
// "Save to my library" back in the builder; everything else here stays neutral/browse.
// "Copy link" is for MEDIA (image/video) on purpose: a media asset's thumbnailUrl IS its public
// asset URL, but a page/funnel's is only a cover snapshot, so a real page/funnel public link is a
// tracked follow-up.
// Re-opening a non-image artifact, bulk/zip export, and a captured first-frame poster for videos
// (so the board never shows a blank <video> tile) are tracked follow-ups (#317).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { listLibrary, removeFromLibrary, uploadToLibrary } from "@/components/admin/studio/studio";
import { isStudioError } from "@/components/admin/studio/studio";
import type { LibraryItem, LibraryKind } from "@/components/admin/studio/studio-types";
import { SectionCard, EmptyState, Toolbar, FilterChip } from "@/components/ui/page";
import { LabelChip } from "@/components/admin/studio/modes/content-shared";
import { Button } from "@/components/ui/button";
import { Check, ClipboardList, Download, FileText, Film, Image as ImageIcon, Link2, LibraryBig, Loader2, Route as RouteIcon, Trash2, Type, Upload } from "lucide-react";
import { GROWTH_MEDIA_ACCEPT } from "@/lib/growth";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

type Filter = "all" | LibraryKind;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "page", label: "Pages" },
  { value: "funnel", label: "Funnels" },
  { value: "form", label: "Forms" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "copy", label: "Copy" },
];

const KIND_LABEL: Record<LibraryKind, string> = {
  page: "Page", funnel: "Funnel", form: "Form", image: "Image", video: "Video", copy: "Copy",
};
const KIND_ICON: Record<LibraryKind, LucideIcon> = {
  page: FileText, funnel: RouteIcon, form: ClipboardList, image: ImageIcon, video: Film, copy: Type,
};

export default function StudioLibrary() {
  const { activeTenantId } = useTenantContext();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!activeTenantId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      setItems(await listLibrary({ tenantId: activeTenantId }));
    } catch {
      toast.error("Couldn't load your library.");
    } finally {
      setLoading(false);
    }
  }, [activeTenantId]);

  useEffect(() => { void load(); }, [load]);

  const remove = async (item: LibraryItem) => {
    const prev = items;
    setItems((r) => r.filter((x) => x.id !== item.id)); // optimistic
    try {
      const ok = await removeFromLibrary({ id: item.id });
      if (!ok) throw new Error("not removed");
      toast.success("Removed from your library.");
    } catch {
      setItems(prev); // §13: only stays gone if it actually was
      toast.error("Couldn't remove that item.");
    }
  };

  // Bring an OUTSIDE artifact in (owner ask): upload → file → keep, all through the existing seam.
  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || !activeTenantId) return;
    setUploading(true);
    try {
      const added: LibraryItem[] = [];
      for (const file of Array.from(files)) {
        try {
          added.push(await uploadToLibrary(activeTenantId, file));
        } catch (err) {
          toast.error(isStudioError(err) ? err.message : `Couldn't upload ${file.name}.`);
        }
      }
      if (added.length) {
        setItems((r) => [...added, ...r]); // §13: only what actually uploaded
        toast.success(added.length === 1 ? "Added to your library." : `${added.length} added to your library.`);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = ""; // allow re-picking the same file
    }
  };

  // The shareable/callable public link for a piece of media (the URL you paste elsewhere, or hand
  // to Paige in a session). Media-only (image/video): a media asset's thumbnailUrl IS its public
  // asset URL; a page/funnel cover snapshot is NOT a link to the page, so we don't offer it there (§13).
  const copyLink = async (item: LibraryItem) => {
    if (!item.thumbnailUrl) return;
    const url = item.thumbnailUrl;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for insecure contexts / older browsers where the Clipboard API is unavailable.
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("copy unavailable");
      }
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((c) => (c === item.id ? null : c)), 1400);
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const shown = useMemo(
    () => items.filter((r) => filter === "all" || r.kind === filter),
    [items, filter],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-border bg-muted/40 text-foreground">
          <LibraryBig className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-semibold text-foreground">Saved library</h1>
          <p className="truncate text-sm text-muted-foreground">The winners you kept — plus anything you bring in. Every page, funnel, form, image, video, and piece of copy, in one place.</p>
        </div>
        {/* Bring outside artifacts in. Upload is THE add-to-library act on this surface, so it earns
            the gold (§11); everything else here is neutral/browse. */}
        <input
          ref={fileRef}
          type="file"
          accept={GROWTH_MEDIA_ACCEPT}
          multiple
          hidden
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void handleUpload(e.target.files)}
        />
        <Button variant="gold" size="sm" className="shrink-0 gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
          Upload
        </Button>
      </header>

      <Toolbar>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <FilterChip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </FilterChip>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{shown.length} item{shown.length === 1 ? "" : "s"}</span>
      </Toolbar>

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-[var(--radius)] border border-border bg-muted/40 motion-reduce:animate-none" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <SectionCard className="mt-4">
          <EmptyState
            icon={LibraryBig}
            title={filter === "all" ? "Nothing saved yet" : `No ${KIND_LABEL[filter as LibraryKind].toLowerCase()}s saved yet`}
            description="When you build something you love, hit “Save to my library” and it lands here — or Upload your own images and videos to bring outside media in. Everything's ready to reuse across your campaigns."
          />
        </SectionCard>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <SectionCard key={item.id} className="flex flex-col overflow-hidden" padded={false}>
                {item.kind === "video" && item.thumbnailUrl ? (
                  // artifact_kind is the authoritative render discriminator: a video's thumbnailUrl
                  // is the media URL, so play it inline (controls, muted, no autoplay — motion-safe).
                  <video
                    src={item.thumbnailUrl}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    aria-label={item.title}
                    className="aspect-video w-full bg-muted object-cover"
                  />
                ) : item.thumbnailUrl ? (
                  <div className="aspect-video overflow-hidden bg-muted/30">
                    <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-muted/20 text-muted-foreground">
                    <Icon className="h-8 w-8" aria-hidden />
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="min-w-0 truncate font-display text-sm font-semibold text-foreground">{item.title}</h4>
                    <LabelChip>{KIND_LABEL[item.kind]}</LabelChip>
                  </div>
                  {item.note && <p className="line-clamp-2 text-xs text-muted-foreground">{item.note}</p>}
                  <div className="mt-auto flex items-center gap-1">
                    {(item.kind === "image" || item.kind === "video") && item.thumbnailUrl && (
                      <Button
                        variant="ghost" size="sm" className="gap-1.5"
                        onClick={() => void copyLink(item)}
                        title="Copy the shareable link"
                      >
                        {copiedId === item.id
                          ? <><Check className="h-3.5 w-3.5 text-[var(--success)]" /> Copied</>
                          : <><Link2 className="h-3.5 w-3.5" /> Copy link</>}
                      </Button>
                    )}
                    {(item.kind === "image" || item.kind === "video") && item.thumbnailUrl && (
                      <Button asChild variant="ghost" size="sm" className="gap-1.5">
                        <a href={item.thumbnailUrl} download target="_blank" rel="noreferrer">
                          <Download className="h-3.5 w-3.5" /> Download
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="sm" className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </Button>
                  </div>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
