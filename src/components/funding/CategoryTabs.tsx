import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { CATEGORY_ORDER, CATEGORIES, type ProductCategoryKey } from "@/lib/lenderCategories";

interface Props {
  selected: ProductCategoryKey | "all";
  onSelect: (cat: ProductCategoryKey | "all") => void;
  counts: Record<string, number>;
  totalCount: number;
}

export function CategoryTabs({ selected, onSelect, counts, totalCount }: Props) {
  // Only show categories that have products
  const visible = CATEGORY_ORDER.filter(c => (counts[c] || 0) > 0);

  return (
    <div className="border-b border-border">
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex items-center gap-1 pb-2">
          <Button
            size="sm"
            variant={selected === "all" ? "default" : "ghost"}
            onClick={() => onSelect("all")}
            className="text-xs h-8"
          >
            All
            <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">{totalCount}</Badge>
          </Button>
          {visible.map(cat => {
            const meta = CATEGORIES[cat];
            return (
              <Button
                key={cat}
                size="sm"
                variant={selected === cat ? "default" : "ghost"}
                onClick={() => onSelect(cat)}
                className="text-xs h-8"
              >
                {meta.shortLabel}
                <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">{counts[cat] || 0}</Badge>
              </Button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
