import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { FilterChip } from "./Toolbar";

/**
 * DateRangePicker — the ONE shared, tokenized range picker (§18: generalizes the affiliate
 * one; ZERO hardcoded hex — the affiliate original was pinned to #1a2840). Presets are
 * indigo FilterChips (active = bg-primary, NEVER gold, §6); custom opens a shadcn Popover +
 * ui/calendar range. Every analytics surface filters through this single primitive.
 */
export type RangeKey = "7d" | "30d" | "90d" | "ytd" | "custom";

export interface DateRangeValue {
  from: Date;
  to: Date;
  key: RangeKey;
}

export interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  className?: string;
}

const PRESETS: { key: Exclude<RangeKey, "custom">; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "ytd", label: "YTD" },
];

/**
 * Resolve a preset key to a { from, to } window ending now (local midnight boundaries).
 * `custom` has no intrinsic window, so it falls back to the 30d window as a sane base the
 * caller can then adjust via the calendar.
 */
export function rangeToDates(key: RangeKey): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setHours(0, 0, 0, 0);

  switch (key) {
    case "7d":
      from.setDate(from.getDate() - 6);
      break;
    case "90d":
      from.setDate(from.getDate() - 89);
      break;
    case "ytd":
      from.setMonth(0, 1);
      break;
    case "30d":
    case "custom":
    default:
      from.setDate(from.getDate() - 29);
      break;
  }
  return { from, to };
}

function fmt(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  function applyPreset(key: Exclude<RangeKey, "custom">) {
    const { from, to } = rangeToDates(key);
    onChange({ from, to, key });
  }

  return (
    <div className={className ? `flex flex-wrap items-center gap-2 ${className}` : "flex flex-wrap items-center gap-2"}>
      {PRESETS.map((p) => (
        <FilterChip key={p.key} active={value.key === p.key} onClick={() => applyPreset(p.key)}>
          {p.label}
        </FilterChip>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <FilterChip active={value.key === "custom"} className="px-3 py-1">
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {value.key === "custom" ? `${fmt(value.from)} — ${fmt(value.to)}` : "Custom"}
            </span>
          </FilterChip>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            defaultMonth={value.from}
            selected={{ from: value.from, to: value.to }}
            onSelect={(r) => {
              if (r?.from && r?.to) {
                onChange({ from: r.from, to: r.to, key: "custom" });
                setOpen(false);
              }
            }}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
