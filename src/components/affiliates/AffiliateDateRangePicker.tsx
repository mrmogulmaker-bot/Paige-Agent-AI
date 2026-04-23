// src/components/affiliates/AffiliateDateRangePicker.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "@/lib/affiliates/types";

interface Props {
  value: DateRange;
  onChange: (next: DateRange) => void;
}

function fmt(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const PRESETS: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "YTD", days: -1 },
];

export default function AffiliateDateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  function applyPreset(days: number) {
    const to = new Date();
    const from = new Date();
    if (days === -1) {
      from.setMonth(0, 1);
      from.setHours(0, 0, 0, 0);
    } else {
      from.setDate(to.getDate() - days);
    }
    onChange({ from, to });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <Button
          key={p.label}
          size="sm"
          variant="outline"
          onClick={() => applyPreset(p.days)}
          className="border-[#1a2840]/20 text-[#1a2840] hover:bg-[#1a2840]/5"
        >
          {p.label}
        </Button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="border-[#1a2840]/20 text-[#1a2840] max-w-full whitespace-normal text-left h-auto py-1.5"
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">{fmt(value.from)} — {fmt(value.to)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            defaultMonth={value.from}
            selected={{ from: value.from, to: value.to }}
            onSelect={(r) => {
              if (r?.from && r?.to) {
                onChange({ from: r.from, to: r.to });
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
