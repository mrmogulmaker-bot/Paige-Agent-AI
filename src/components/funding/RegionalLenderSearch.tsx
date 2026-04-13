import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MapPin, Search, Building2, Info, Globe, AlertCircle, Landmark, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const LENDER_TYPES = [
  { value: "credit_union", label: "Credit Union" },
  { value: "community_bank", label: "Community Bank" },
  { value: "cdfi", label: "CDFI" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"
];

interface LenderResult {
  name: string;
  type: "Credit Union" | "Community Bank" | "CDFI";
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string;
  referenceId: string;
  source: "NCUA" | "FDIC";
}

const TYPE_COLORS: Record<string, string> = {
  "Credit Union": "bg-blue-500/10 text-blue-400 border-blue-500/30",
  "Community Bank": "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  CDFI: "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

const TYPE_ICONS: Record<string, typeof Building2> = {
  "Credit Union": Landmark,
  "Community Bank": Building2,
  CDFI: Building2,
};

export function RegionalLenderSearch({ userState, userCity }: { userState?: string; userCity?: string }) {
  const [state, setState] = useState(userState || "");
  const [city, setCity] = useState(userCity || "");
  const [lenderType, setLenderType] = useState("");
  const [searchKey, setSearchKey] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["local-lenders", searchKey],
    queryFn: async () => {
      if (!searchKey) return null;
      const params = JSON.parse(searchKey);

      const response = await supabase.functions.invoke("search-local-lenders", {
        body: {
          state: params.state,
          city: params.city || undefined,
          lenderType: params.lenderType || "all",
        },
      });

      if (response.error) throw new Error("Search temporarily unavailable — please try again or visit ncua.gov to find local credit unions directly.");
      if (response.data?.error) throw new Error(response.data.error);
      return response.data as { results: LenderResult[]; broadened: boolean; searchedCity: string | null; count: number };
    },
    enabled: !!searchKey,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const handleSearch = () => {
    if (!state) return;
    setSearchKey(JSON.stringify({ state, city, lenderType: lenderType === "all" ? "" : lenderType }));
  };

  const results = data?.results || [];
  const broadened = data?.broadened || false;

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center gap-2 mb-1">
        <MapPin className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-bold text-foreground">Find Local Lenders</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Search real NCUA and FDIC databases for community banks, credit unions, and CDFIs in your area.
      </p>

      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="w-32"><SelectValue placeholder="State" /></SelectTrigger>
          <SelectContent>
            {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <Input
          placeholder="City (optional)"
          value={city}
          onChange={e => setCity(e.target.value)}
          className="w-48"
          onKeyDown={e => e.key === "Enter" && handleSearch()}
        />

        <Select value={lenderType} onValueChange={setLenderType}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Lender Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {LENDER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button
          onClick={handleSearch}
          disabled={!state || isLoading}
          className="bg-gradient-gold hover:opacity-90"
        >
          {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
          Search
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 mb-4">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Search temporarily unavailable — please try again or visit ncua.gov to find local credit unions directly."}
          </p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Searching government databases...</p>
        </div>
      )}

      {/* Broadened notice */}
      {broadened && data?.searchedCity && results.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-3">
          <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            No results found in <span className="font-medium text-foreground">{data.searchedCity}</span> — showing statewide results.
          </p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {results.length} institution{results.length !== 1 ? "s" : ""} found
            <span className="ml-1 text-muted-foreground/60">
              · Source: {[...new Set(results.map(r => r.source))].join(" & ")}
            </span>
          </p>
          {results.map((lender, i) => {
            const Icon = TYPE_ICONS[lender.type] || Building2;
            const colorClass = TYPE_COLORS[lender.type] || "";
            const fullAddress = [lender.address, lender.city, `${lender.state} ${lender.zip}`]
              .filter(Boolean)
              .join(", ");

            return (
              <div key={`${lender.referenceId}-${i}`} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                <Icon className="w-5 h-5 text-accent mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{lender.name}</span>
                    <Badge variant="outline" className={`text-xs ${colorClass}`}>
                      {lender.type}
                    </Badge>
                  </div>
                  {fullAddress && (
                    <p className="text-xs text-muted-foreground mt-1">{fullAddress}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {lender.website && (
                      <a
                        href={lender.website.startsWith("http") ? lender.website : `https://${lender.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        <Globe className="w-3 h-3" />
                        Website
                      </a>
                    )}
                    {lender.referenceId && (
                      <span className="text-xs text-muted-foreground/60">
                        {lender.source === "NCUA" ? "Charter" : "CERT"} #{lender.referenceId}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No results */}
      {data && results.length === 0 && !isLoading && !error && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No institutions found for this search. Try broadening your criteria or selecting a different state.
        </p>
      )}

      {/* Phase 2 note */}
      <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-accent/5 border border-accent/20">
        <Info className="w-4 h-4 text-accent mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          You are seeing real local institutions from NCUA and FDIC databases. Phase 2 will add live rates, pre-qualification checks, and direct application links from these institutions.
        </p>
      </div>
    </Card>
  );
}
