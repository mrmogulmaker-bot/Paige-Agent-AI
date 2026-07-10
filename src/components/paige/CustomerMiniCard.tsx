// The selected-customer card in the rail (cc-spec §2.a). Gold focus DOT only —
// never a gold fill (S2). Mirrors the chat focus banner so both sides agree.
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FocusedClient } from "./commandCenterTypes";

interface Props {
  client: FocusedClient;
  onClear: () => void;
}

export function CustomerMiniCard({ client, onClear }: Props) {
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/[0.04] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 rounded-full bg-gradient-gold shrink-0" />
          <span className="text-sm font-medium truncate">{client.name || "Unnamed"}</span>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {client.entity && <span className="truncate">{client.entity}</span>}
        {client.entity && client.stage && <span>·</span>}
        {client.stage && <Badge variant="outline" className="text-[10px]">{client.stage}</Badge>}
      </div>

      {client.email && (
        <p className="mt-1 text-xs text-muted-foreground truncate">{client.email}</p>
      )}

      <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0 text-accent">
        <Link to={`/admin/contacts/${client.id}`}>Open full profile</Link>
      </Button>
    </div>
  );
}
