import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Plus, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AddBusinessDialog } from "@/components/dashboard/AddBusinessDialog";

interface Business {
  id: string;
  legal_name: string;
  business_type: "holding" | "parent" | "subsidiary" | "standalone";
  parent_business_id: string | null;
  organizational_level: number;
  display_order: number;
  entity_type: string | null;
  ein: string | null;
  child_count: number;
}

/**
 * Admin-side view of a customer's business entity hierarchy.
 * Renders the same org chart the customer sees on their own dashboard,
 * but scoped to the contact's linked user id so admins/sales can manage
 * the structure on the customer's behalf.
 */
export function ClientOrgChartPanel({ linkedUserId }: { linkedUserId: string }) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_business_hierarchy", {
      _user_id: linkedUserId,
    });
    if (error) {
      toast({ title: "Error loading businesses", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setBusinesses(data || []);
    setExpanded(new Set((data || []).map((b: Business) => b.id)));
    setLoading(false);
  };

  useEffect(() => {
    if (linkedUserId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedUserId]);

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  const iconFor = (type: string) => {
    if (type === "holding") return <Building2 className="w-4 h-4 text-gold" />;
    if (type === "parent") return <Building2 className="w-4 h-4 text-primary" />;
    return <Building2 className="w-4 h-4 text-muted-foreground" />;
  };

  const render = (b: Business, level = 0) => {
    const kids = businesses.filter((x) => x.parent_business_id === b.id);
    const hasKids = kids.length > 0;
    const isOpen = expanded.has(b.id);
    return (
      <div key={b.id} className="mb-2">
        <div
          className="flex items-center gap-2 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
          style={{ marginLeft: `${level * 24}px` }}
        >
          {hasKids ? (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggle(b.id)}>
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          ) : (
            <div className="w-6" />
          )}
          {iconFor(b.business_type)}
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{b.legal_name}</div>
            <div className="text-xs text-muted-foreground capitalize">
              {b.business_type}
              {b.entity_type ? ` • ${b.entity_type}` : ""}
              {b.ein ? ` • EIN: ***-**${b.ein.slice(-4)}` : ""}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setParentId(b.id); setShowAdd(true); }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Subsidiary
          </Button>
        </div>
        {hasKids && isOpen && (
          <div className="mt-1">{kids.map((k) => render(k, level + 1))}</div>
        )}
      </div>
    );
  };

  const roots = businesses.filter((b) => !b.parent_business_id);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="w-5 h-5 text-gold" />
                Entity Hierarchy
              </CardTitle>
              <CardDescription>
                Manage this customer's holdings, parents, and subsidiaries on their behalf.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => { setParentId(null); setShowAdd(true); }}>
              <Plus className="w-4 h-4 mr-1" />
              Add Entity
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading entities…
            </div>
          ) : roots.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="mb-3">No business entities on file for this customer yet.</p>
              <Button size="sm" onClick={() => { setParentId(null); setShowAdd(true); }}>
                <Plus className="w-4 h-4 mr-1" />
                Add First Entity
              </Button>
            </div>
          ) : (
            <div className="space-y-1">{roots.map((b) => render(b))}</div>
          )}
        </CardContent>
      </Card>

      <AddBusinessDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        parentBusinessId={parentId}
        ownerUserId={linkedUserId}
        onSuccess={load}
      />
    </>
  );
}
