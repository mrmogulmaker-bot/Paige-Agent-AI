import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MapPin, Search, Building2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const LENDER_TYPES = [
  { value: "community_bank", label: "Community Bank" },
  { value: "credit_union", label: "Credit Union" },
  { value: "cdfi", label: "CDFI" },
  { value: "sba_preferred", label: "SBA Preferred Lender" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"
];

export function RegionalLenderSearch({ userState, userCity }: { userState?: string; userCity?: string }) {
  const [state, setState] = useState(userState || "");
  const [city, setCity] = useState(userCity || "");
  const [lenderType, setLenderType] = useState("");
  const [searchTriggered, setSearchTriggered] = useState(false);

  const { data: results, isLoading } = useQuery({
    queryKey: ["regional-lenders", state, city, lenderType, searchTriggered],
    queryFn: async () => {
      if (!searchTriggered || !state) return [];
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];

      const response = await supabase.functions.invoke("lender-research", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          query: `Find ${lenderType ? LENDER_TYPES.find(t => t.value === lenderType)?.label + "s" : "lenders"} in ${city ? city + ", " : ""}${state} that offer small business funding`,
          state,
          city,
          lender_type: lenderType || undefined,
        },
      });

      if (response.error) throw response.error;
      return response.data?.results || [];
    },
    enabled: searchTriggered && !!state,
  });

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center gap-2 mb-1">
        <MapPin className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-bold text-foreground">Find Local Lenders</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Search for community banks, credit unions, and CDFIs in your area.</p>

      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="w-32"><SelectValue placeholder="State" /></SelectTrigger>
          <SelectContent>
            {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <Input placeholder="City (optional)" value={city} onChange={e => setCity(e.target.value)} className="w-48" />

        <Select value={lenderType} onValueChange={setLenderType}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Lender Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {LENDER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button onClick={() => setSearchTriggered(true)} disabled={!state || isLoading} className="bg-gradient-gold hover:opacity-90">
          <Search className="w-4 h-4 mr-2" />
          Search
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground py-4 text-center">Searching lenders...</p>}

      {results && results.length > 0 && (
        <div className="space-y-3">
          {results.map((lender: any, i: number) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <Building2 className="w-5 h-5 text-accent mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-foreground">{lender.name || lender.lender_name}</span>
                {lender.type && <Badge variant="outline" className="ml-2 text-xs">{lender.type}</Badge>}
                {lender.description && <p className="text-xs text-muted-foreground mt-1">{lender.description}</p>}
                {lender.min_requirements && <p className="text-xs text-muted-foreground mt-1">Min: {lender.min_requirements}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {results && results.length === 0 && searchTriggered && !isLoading && (
        <p className="text-sm text-muted-foreground text-center py-4">No lenders found for this search. Try broadening your criteria.</p>
      )}

      <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-accent/5 border border-accent/20">
        <Info className="w-4 h-4 text-accent mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Phase 2 Preview:</span> Live lender data integration with real-time rates, application links, and pre-qualification checks is planned for the next release.
        </p>
      </div>
    </Card>
  );
}
