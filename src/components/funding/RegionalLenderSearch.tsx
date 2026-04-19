import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MapPin, Search, Building2, Info, Globe, AlertCircle, Landmark, Loader2, ShieldCheck, ShieldAlert, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const LENDER_TYPES = [
  { value: "community_bank", label: "Community Bank", group: "Banks" },
  { value: "national_bank", label: "National Bank", group: "Banks" },
  { value: "regional_bank", label: "Regional Bank", group: "Banks" },
  { value: "commercial", label: "Commercial Bank", group: "Banks" },
  { value: "savings", label: "Savings Institution", group: "Banks" },
  { value: "agricultural", label: "Agricultural Bank", group: "Banks" },
  { value: "mdi", label: "Minority Depository (MDI)", group: "Mission-Based" },
  { value: "cdfi", label: "CDFI", group: "Mission-Based" },
  { value: "credit_union", label: "Credit Union (NCUA)", group: "Credit Unions" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"
];

interface BureauPreference {
  primary_bureau: string;
  secondary_bureau: string | null;
  confidence_level: string;
  confidence_source: string;
  notes: string | null;
}

type LenderTypeLabel =
  | "Credit Union"
  | "Community Bank"
  | "National Bank"
  | "Regional Bank"
  | "Savings Institution"
  | "Commercial Bank"
  | "Agricultural Bank"
  | "Minority Depository Institution"
  | "CDFI"
  | "Online Bank";

interface LenderResult {
  // Identity
  name: string;
  type: LenderTypeLabel;
  fdic_cert: string;
  fed_rssd: string | null;
  // Location
  address: string;
  address2: string | null;
  city: string;
  state: string;
  zip: string;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  // Web
  website: string;
  // Charter & class
  bank_class: string | null;
  bank_class_desc: string | null;
  specialization: string | null;
  specialization_code: number | null;
  is_community_bank: boolean;
  is_minority_depository: boolean;
  mdi_description: string | null;
  has_trust_powers: boolean;
  is_mutual: boolean;
  is_subchapter_s: boolean;
  // Financials (in $ thousands from FDIC)
  asset_size: number | null;
  deposits: number | null;
  net_income: number | null;
  return_on_assets: number | null;
  return_on_equity: number | null;
  // Footprint
  office_count: number | null;
  established_date: string | null;
  fdic_insured_date: string | null;
  // Source & enrichment
  source: "FDIC";
  bureauPreference?: BureauPreference | null;
}

function formatAssetSize(thousands: number | null): string | null {
  if (thousands == null) return null;
  const dollars = thousands * 1000;
  if (dollars >= 1e9) return `$${(dollars / 1e9).toFixed(1)}B`;
  if (dollars >= 1e6) return `$${(dollars / 1e6).toFixed(0)}M`;
  return `$${(dollars / 1e3).toFixed(0)}K`;
}

function yearsInBusiness(estymd: string | null): number | null {
  if (!estymd) return null;
  const match = estymd.match(/(\d{4})/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  return isNaN(year) ? null : new Date().getFullYear() - year;
}

interface BureauScores {
  tu: number | null;
  ex: number | null;
  eq: number | null;
}

const TYPE_COLORS: Record<string, string> = {
  "Credit Union": "bg-blue-500/10 text-blue-400 border-blue-500/30",
  "Community Bank": "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  "National Bank": "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
  "Regional Bank": "bg-violet-500/10 text-violet-400 border-violet-500/30",
  "Savings Institution": "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  "Commercial Bank": "bg-sky-500/10 text-sky-400 border-sky-500/30",
  "Agricultural Bank": "bg-lime-500/10 text-lime-400 border-lime-500/30",
  "Minority Depository Institution": "bg-rose-500/10 text-rose-400 border-rose-500/30",
  CDFI: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "Online Bank": "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30",
};

const TYPE_ICONS: Record<string, typeof Building2> = {
  "Credit Union": Landmark,
  "Community Bank": Building2,
  "National Bank": Landmark,
  "Regional Bank": Landmark,
  "Savings Institution": Building2,
  "Commercial Bank": Building2,
  "Agricultural Bank": Building2,
  "Minority Depository Institution": Building2,
  CDFI: Building2,
  "Online Bank": Globe,
};

const BUREAU_LABELS: Record<string, string> = {
  experian: "Experian",
  transunion: "TransUnion",
  equifax: "Equifax",
  all_three: "All Three Bureaus",
  flexible: "Varies by Product",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  verified: "text-emerald-400",
  likely: "text-amber-400",
  reported: "text-blue-400",
};

function getScoreForBureau(bureau: string, scores: BureauScores): number | null {
  if (bureau === "experian") return scores.ex;
  if (bureau === "transunion") return scores.tu;
  if (bureau === "equifax") return scores.eq;
  return null;
}

function getStrongestBureau(scores: BureauScores): { bureau: string; score: number } | null {
  const entries = [
    { bureau: "experian", score: scores.ex },
    { bureau: "transunion", score: scores.tu },
    { bureau: "equifax", score: scores.eq },
  ].filter((e) => e.score != null) as { bureau: string; score: number }[];
  if (entries.length === 0) return null;
  return entries.reduce((a, b) => (a.score >= b.score ? a : b));
}

const GENERAL_MIN_THRESHOLD = 620;

function StrategicNote({ bureauPref, scores }: { bureauPref: BureauPreference; scores: BureauScores }) {
  const bureau = bureauPref.primary_bureau;
  if (bureau === "all_three" || bureau === "flexible") return null;

  const score = getScoreForBureau(bureau, scores);
  if (score == null) return null;

  const strongest = getStrongestBureau(scores);
  const bureauLabel = BUREAU_LABELS[bureau] || bureau;
  const diff = score - GENERAL_MIN_THRESHOLD;

  if (diff < 0) {
    return (
      <div className="flex items-start gap-2 mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
        <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          This institution pulls <span className="font-medium text-foreground">{bureauLabel}</span> where your score is{" "}
          <span className="font-medium text-amber-400">{score}</span> — {Math.abs(diff)} points below estimated minimum.
          Consider resolving {bureauLabel} items first before applying.
        </p>
      </div>
    );
  }

  const isStrongest = strongest && strongest.bureau === bureau;
  if (isStrongest) {
    return (
      <div className="flex items-start gap-2 mt-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
        <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          This institution pulls <span className="font-medium text-foreground">{bureauLabel}</span> where your score is{" "}
          <span className="font-medium text-emerald-400">{score}</span> — your strongest bureau. This may be a strong fit for your current profile.
        </p>
      </div>
    );
  }

  return null;
}

export function RegionalLenderSearch({
  userState,
  userCity,
  bureauScores,
}: {
  userState?: string;
  userCity?: string;
  bureauScores?: BureauScores;
}) {
  const [state, setState] = useState(userState || "");
  const [city, setCity] = useState(userCity || "");
  const [lenderType, setLenderType] = useState("");
  const [searchKey, setSearchKey] = useState<string | null>(null);

  const scores: BureauScores = bureauScores || { tu: null, ex: null, eq: null };

  const { data, isLoading, error } = useQuery({
    queryKey: ["local-lenders", searchKey],
    queryFn: async () => {
      if (!searchKey) return null;
      const params = JSON.parse(searchKey);
      const response = await supabase.functions.invoke("search-local-lenders", {
        body: { state: params.state, city: params.city || undefined, lenderType: params.lenderType || "all" },
      });
      if (response.error) throw new Error("Search temporarily unavailable — please try again or visit ncua.gov to find local credit unions directly.");
      if (response.data?.error) throw new Error(response.data.error);
      return response.data as { results: LenderResult[]; broadened: boolean; searchedCity: string | null; count: number; creditUnionNote?: string | null };
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
        Search the FDIC database for community banks, national & regional banks, savings institutions, CDFIs, MDIs, and more in your area. Credit unions link out to the NCUA locator.
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
          <SelectTrigger className="w-56"><SelectValue placeholder="Lender Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Banks (Recommended)</SelectItem>
            {(["Banks", "Mission-Based", "Credit Unions"] as const).map((group) => (
              <div key={group}>
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                  {group}
                </div>
                {LENDER_TYPES.filter((t) => t.group === group).map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={handleSearch} disabled={!state || isLoading} className="bg-gradient-gold hover:opacity-90">
          {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
          Search
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 mb-4">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Search temporarily unavailable."}
          </p>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Searching government databases...</p>
        </div>
      )}

      {broadened && data?.searchedCity && results.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-3">
          <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            No results found in <span className="font-medium text-foreground">{data.searchedCity}</span> — showing statewide results.
          </p>
        </div>
      )}

      {data?.creditUnionNote && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/10 border border-accent/20 mb-3">
          <Landmark className="w-4 h-4 text-accent mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Credit unions are not in the FDIC database.{" "}
            <a href="https://mapping.ncua.gov" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline font-medium">
              Search the NCUA Credit Union Locator →
            </a>
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {results.length} institution{results.length !== 1 ? "s" : ""} found
            <span className="ml-1 text-muted-foreground/60">· Source: FDIC</span>
          </p>
          {results.map((lender, i) => {
            const Icon = TYPE_ICONS[lender.type] || Building2;
            const colorClass = TYPE_COLORS[lender.type] || "";
            const fullAddress = [lender.address, lender.city, `${lender.state} ${lender.zip}`].filter(Boolean).join(", ");
            const bp = lender.bureauPreference;
            const assetSize = formatAssetSize(lender.asset_size);
            const yearsActive = yearsInBusiness(lender.established_date);

            // Profile chips: small "this institution is..." facts surfaced from FDIC data
            const profileChips: { label: string; tone: "info" | "highlight" }[] = [];
            if (lender.is_minority_depository && lender.mdi_description) {
              profileChips.push({ label: `MDI: ${lender.mdi_description}`, tone: "highlight" });
            }
            if (lender.is_community_bank && lender.type !== "Community Bank") {
              profileChips.push({ label: "Community Bank", tone: "info" });
            }
            if (lender.has_trust_powers) profileChips.push({ label: "Trust Powers", tone: "info" });
            if (lender.is_mutual) profileChips.push({ label: "Mutual", tone: "info" });

            return (
              <div key={`${lender.fdic_cert}-${i}`} className="p-3 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-start gap-3">
                  <Icon className="w-5 h-5 text-accent mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{lender.name}</span>
                      <Badge variant="outline" className={`text-xs ${colorClass}`}>{lender.type}</Badge>
                      {profileChips.map((chip) => (
                        <Badge
                          key={chip.label}
                          variant="outline"
                          className={`text-[10px] ${
                            chip.tone === "highlight"
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                              : "bg-muted text-muted-foreground border-border"
                          }`}
                        >
                          {chip.label}
                        </Badge>
                      ))}
                    </div>
                    {fullAddress && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {fullAddress}
                        {lender.county && <span className="text-muted-foreground/60"> · {lender.county} County</span>}
                      </p>
                    )}

                    {/* FDIC stats row */}
                    {(assetSize || lender.office_count != null || yearsActive != null || lender.return_on_assets != null) && (
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
                        {assetSize && (
                          <span title="Total assets (FDIC call report)">
                            Assets: <span className="text-foreground font-medium">{assetSize}</span>
                          </span>
                        )}
                        {lender.office_count != null && lender.office_count > 0 && (
                          <span>
                            Branches: <span className="text-foreground font-medium">{lender.office_count}</span>
                          </span>
                        )}
                        {yearsActive != null && yearsActive > 0 && (
                          <span>
                            Est. <span className="text-foreground font-medium">{yearsActive}y</span> ago
                          </span>
                        )}
                        {lender.return_on_assets != null && (
                          <span title="Return on Assets — health indicator">
                            ROA:{" "}
                            <span className={`font-medium ${lender.return_on_assets >= 1 ? "text-emerald-400" : "text-foreground"}`}>
                              {lender.return_on_assets.toFixed(2)}%
                            </span>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Charter / specialization line */}
                    {(lender.bank_class_desc || lender.specialization) && (
                      <p className="text-[11px] text-muted-foreground/70 mt-1">
                        {lender.bank_class_desc}
                        {lender.bank_class_desc && lender.specialization && " · "}
                        {lender.specialization}
                      </p>
                    )}

                    {/* Bureau preference display */}
                    {bp ? (
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          Typically pulls:{" "}
                          <span className="font-medium text-foreground">{BUREAU_LABELS[bp.primary_bureau] || bp.primary_bureau}</span>
                        </span>
                        <span className="text-xs text-muted-foreground/60">·</span>
                        <span className={`text-xs font-medium ${CONFIDENCE_COLORS[bp.confidence_level] || "text-muted-foreground"}`}>
                          {bp.confidence_level === "verified" ? "Verified" : bp.confidence_level === "likely" ? "Likely" : "Reported by clients"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <HelpCircle className="w-3 h-3 text-muted-foreground/50" />
                        <span className="text-xs text-muted-foreground/70 italic">
                          Bureau preference not yet documented — verify with your PME advisor or confirm after application.
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {lender.website && (
                        <a
                          href={lender.website.startsWith("http") ? lender.website : `https://${lender.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <Globe className="w-3 h-3" /> Website
                        </a>
                      )}
                      {lender.latitude != null && lender.longitude != null && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${lender.latitude},${lender.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <MapPin className="w-3 h-3" /> Map
                        </a>
                      )}
                      {lender.fdic_cert && (
                        <span className="text-[11px] text-muted-foreground/60">CERT #{lender.fdic_cert}</span>
                      )}
                      {lender.fed_rssd && (
                        <span className="text-[11px] text-muted-foreground/60">RSSD #{lender.fed_rssd}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Strategic score comparison */}
                {bp && (scores.tu != null || scores.ex != null || scores.eq != null) && (
                  <StrategicNote bureauPref={bp} scores={scores} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {data && results.length === 0 && !isLoading && !error && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No institutions found for this search. Try broadening your criteria or selecting a different state.
        </p>
      )}

      <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-accent/5 border border-accent/20">
        <Info className="w-4 h-4 text-accent mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          You are seeing real local institutions from NCUA and FDIC databases. Phase 2 will add live rates, pre-qualification checks, and direct application links from these institutions.
        </p>
      </div>
    </Card>
  );
}
