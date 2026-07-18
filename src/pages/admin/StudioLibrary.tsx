// Media Library (#284) — the tenant's curation-of-winners board, across every project and every
// creative type. It reads the ONE keep layer (studio_library_items, via list_library) and shows
// what the tenant deliberately SAVED: pages, funnels, forms, images, copy. Filter by type, preview
// the snapshot, download an image, or drop something from the library — all Paige-callable underneath
// (save_to_library / remove_from_library / list_library), this page is just one caller (§10).
//
// §18/§21: ONE destination, filtered by kind INSIDE — never a type-picker the human clears first.
// §11: compact header (the board leads), real thumbnails not glyph-in-a-box where we have them,
// gold spent nowhere here (this is a browse surface; the gold ACT is the "Save to library" moment
// back in the builder). Re-opening a non-image artifact and bulk/zip export are tracked follow-ups.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { listLibrary, removeFromLibrary } from "@/components/admin/studio/studio";
import type { LibraryItem, LibraryKind } from "@/components/admin/studio/studio-types";
import { SectionCard, EmptyState, Toolbar, FilterChip } from "@/components/ui/page";
import { LabelChip } from "@/components/admin/studio/modes/content-shared";
import { Button } from "@/components/ui/button";
import { ClipboardList, Download, FileText, Image as ImageIcon, LibraryBig, Route as RouteIcon, Trash2, Type } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

type Filter = "all" | LibraryKind;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "page", label: "Pages" },
  { value: "funnel", label: "Funnels" },
  { value: "form", label: "Forms" },
  { value: "image", label: "Images" },
  { value: "copy", label: "Copy" },
];

const KIND_LABEL: Record<LibraryKind, string> = {
  page: "Page", funnel: "Funnel", form: "Form", image: "Image", copy: "Copy",
};
const KIND_ICON: Record<LibraryKind, LucideIcon> = {
  page: FileText, funnel: RouteIcon, form: ClipboardList, image: ImageIcon, copy: Type,
};

export default function StudioLibrary() {
  const { activeTenantId } = useTenantContext();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

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
        <div className="min-w-0">
          <h1 className="font-display text-lg font-semibold text-foreground">Saved library</h1>
          <p className="truncate text-sm text-muted-foreground">The winners you kept — every page, funnel, form, image, and piece of copy, in one place.</p>
        </div>
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
            description="When you build something you love, hit “Save to my library” and it lands here — ready to reuse across your campaigns."
          />
        </SectionCard>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <SectionCard key={item.id} className="flex flex-col overflow-hidden" padded={false}>
                {item.thumbnailUrl ? (
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
                    {item.kind === "image" && item.thumbnailUrl && (
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
