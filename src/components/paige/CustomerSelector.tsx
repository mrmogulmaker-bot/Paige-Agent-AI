// The rail's customer selector (cc-spec §2.a, closes B2). Reuses the shadcn
// Popover + Command SHELL from NewDealDialog, but the data path is a debounced
// SERVER-side ilike search on `clients` (limit 50, shouldFilter={false}) so it
// reaches ANY customer — not the old truncated 500-row client-side filter. RLS
// tenant-scopes the query. Emits a FocusedClient; resting state and selected
// state (mini-card) live one level up in PaigeSidebar.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Loader2 } from "lucide-react";
import type { FocusedClient } from "./commandCenterTypes";

interface ClientRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  entity_name: string | null;
  email: string | null;
  lifecycle_stage: string | null;
}

function toFocused(c: ClientRow): FocusedClient {
  const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || (c.entity_name ?? "Unnamed");
  return {
    id: c.id,
    name,
    entity: c.entity_name ?? null,
    email: c.email ?? null,
    stage: c.lifecycle_stage ?? null,
  };
}

// Strip characters that would break the PostgREST `.or()` / ilike expression.
const sanitize = (s: string) => s.replace(/[,()%*]/g, " ").trim();

interface Props {
  onSelect: (client: FocusedClient) => void;
}

export function CustomerSelector({ onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++reqId.current;
    setLoading(true);
    const handle = setTimeout(async () => {
      let q = supabase
        .from("clients")
        .select("id, first_name, last_name, entity_name, email, lifecycle_stage")
        .order("created_at", { ascending: false })
        .limit(50);

      const t = sanitize(term);
      if (t) {
        q = q.or(
          `first_name.ilike.%${t}%,last_name.ilike.%${t}%,entity_name.ilike.%${t}%,email.ilike.%${t}%`,
        );
      }

      const { data } = await q;
      // Ignore stale responses so the latest keystroke always wins.
      if (id !== reqId.current) return;
      setRows((data as ClientRow[] | null) ?? []);
      setLoading(false);
    }, 250);

    return () => clearTimeout(handle);
  }, [term, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-muted-foreground">Select a customer…</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {/* shouldFilter={false}: render exactly what the server returns (B2). */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name, business, email…"
            value={term}
            onValueChange={setTerm}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </div>
            ) : (
              <CommandEmpty>
                <div className="p-2 text-center text-sm text-muted-foreground">
                  No one by that name.
                </div>
              </CommandEmpty>
            )}
            {!loading && rows.length > 0 && (
              <CommandGroup>
                {rows.map((c) => {
                  const f = toFocused(c);
                  return (
                    <CommandItem
                      key={c.id}
                      value={c.id}
                      onSelect={() => {
                        onSelect(f);
                        setOpen(false);
                        setTerm("");
                      }}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">
                          {f.name}
                          {f.entity && f.entity !== f.name && (
                            <span className="text-muted-foreground"> · {f.entity}</span>
                          )}
                        </span>
                        {f.email && <span className="text-xs text-muted-foreground truncate">{f.email}</span>}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
