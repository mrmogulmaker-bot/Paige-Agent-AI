import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search, Building2, Phone, MapPin, FileDown, Loader2, Lightbulb, ExternalLink,
  Info, Globe, ShieldCheck, SearchX, WifiOff, AlertTriangle,
} from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { StatePill, SectionCard, EmptyState } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FUNDING_TYPES = [
  "Personal Credit Line",
  "Business Credit Line",
  "SBA 7(a)",
  "SBA 504",
  "CDFI",
  "Commercial Real Estate",
  "Equipment Financing",
  "Revenue-Based Financing",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

// ---------------------------------------------------------------------------
// Engine output contract (mirrors DeepResearchResult → lender-research return).
// Fields that did not survive the engine's validation with a citation are null
// (→ "Not listed") or listed in unverifiedFields. Nothing here is fabricated.
// ---------------------------------------------------------------------------
interface Lender {
  name: string;
  type: string;
  products: string[];
  minimumRequirements: string;
  estimatedRates: string | null;
  contactInfo: string | null;
  website: string | null;
  locationMatch: string;
  notes: string;
  citations: number[];
  confidence: "high" | "medium" | "low";
  unverifiedFields: string[];
}

interface ResearchSource {
  index: number;
  url: string;
  title: string;
  snippet: string;
  reliability_score: number;
  tier: string;
  reliability: "high" | "medium" | "low";
  published_at: string | null;
  fetched_at: string;
  excluded: boolean;
}

interface RawLink {
  url: string;
  title: string;
  reliability: string;
  tier: string;
}

interface ResearchResult {
  lenders: Lender[];
  sources: ResearchSource[];
  commentary: string | null;
  provenance: string; // verified | unverified_legacy | unconfigured | no_sources | unverified | error
  searchStatus: string;
  message: string | null;
  rawLinks: RawLink[];
  configured: boolean;
  isDeep: boolean;
}

interface SearchCriteria {
  location: { city: string; state: string };
  fundingAmountMin: number | null;
  fundingAmountMax: number | null;
  fundingTypes: string[];
  entityType: string;
  timeInBusiness: string;
  creditScoreMin: number | null;
  creditScoreMax: number | null;
}

const DEGRADED_PROVENANCE = new Set(["unconfigured", "no_sources", "unverified", "error"]);

function hostOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function hrefOf(url: string): string {
  return url.startsWith("http") ? url : `https://${url}`;
}

// A muted "Not listed" chip with an info affordance — never a blank, never a
// fabricated value. Renders wherever a field failed validation (null field).
function NotListed({ label = "Not found on any cited source" }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
      title={label}
    >
      <Info className="h-3 w-3" aria-hidden /> Not listed
    </span>
  );
}

// Reliability badge — NO gold (gold = act/approve only). Semantic tokens only.
function ReliabilityBadge({ confidence }: { confidence: Lender["confidence"] }) {
  if (confidence === "high") {
    return (
      <StatePill state="success" icon={<ShieldCheck className="h-3 w-3" aria-hidden />}>
        Verified source
      </StatePill>
    );
  }
  if (confidence === "medium") {
    return <StatePill state="warning">Single source — verify</StatePill>;
  }
  return <StatePill state="off">Unverified</StatePill>;
}

export function LenderResearch() {
  const reduceMotion = useReducedMotion();
  const [criteria, setCriteria] = useState<SearchCriteria>({
    location: { city: "", state: "" },
    fundingAmountMin: null,
    fundingAmountMax: null,
    fundingTypes: [],
    entityType: "",
    timeInBusiness: "",
    creditScoreMin: null,
    creditScoreMax: null,
  });
  const [deepResearch, setDeepResearch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);

  const sourcesByIndex = new Map<number, ResearchSource>(
    (result?.sources ?? []).map((s) => [s.index, s]),
  );

  const toggleFundingType = (type: string) => {
    setCriteria((prev) => ({
      ...prev,
      fundingTypes: prev.fundingTypes.includes(type)
        ? prev.fundingTypes.filter((t) => t !== type)
        : [...prev.fundingTypes, type],
    }));
  };

  const handleSearch = async () => {
    if (!criteria.location.state) {
      toast.error("Please select a state");
      return;
    }
    setLoading(true);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("lender-research", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { searchCriteria: criteria, isDeepResearch: deepResearch },
      });

      if (response.error) throw response.error;

      const data = response.data;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      const lenders: Lender[] = data.results ?? data.lenders ?? [];
      const next: ResearchResult = {
        lenders,
        sources: data.sources ?? [],
        commentary: data.market_commentary ?? data.marketCommentary ?? null,
        provenance: data.provenance ?? (lenders.length ? "verified" : "no_sources"),
        searchStatus: data.search_status ?? "",
        message: data.message ?? null,
        rawLinks: data.rawLinks ?? [],
        configured: data.configured !== false,
        isDeep: data.is_deep_research ?? deepResearch,
      };
      setResult(next);

      if (lenders.length > 0) {
        toast.success(`Found ${lenders.length} verified ${lenders.length === 1 ? "lender" : "lenders"}`);
      } else {
        toast(next.message ?? "No verifiable lenders found for these criteria");
      }
    } catch (err: any) {
      toast.error(err.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const isLegacy =
    !!result &&
    result.lenders.length > 0 &&
    (result.provenance === "unverified_legacy" || (result.sources?.length ?? 0) === 0);

  const isDegraded =
    !!result && result.lenders.length === 0 && DEGRADED_PROVENANCE.has(result.provenance);

  const handleExportPDF = () => {
    if (!result || result.lenders.length === 0) {
      toast.error("Nothing to export yet — run a search first");
      return;
    }
    const byIndex = sourcesByIndex;
    const unverifiedExport = result.provenance !== "verified" || isLegacy;

    const lines: string[] = [
      "LENDER RESEARCH REPORT",
      `Generated: ${new Date().toLocaleString()}`,
      `Location: ${criteria.location.city ? criteria.location.city + ", " : ""}${criteria.location.state}`,
      `Provenance: ${result.provenance}`,
      "",
    ];

    if (unverifiedExport) {
      lines.push("!!! UNVERIFIED DATA — DO NOT TREAT AS FACT !!!");
      lines.push(
        "These results were generated before live research was connected and are not verified. " +
          "Re-run to get cited, verifiable lenders.",
      );
      lines.push("");
    }

    result.lenders.forEach((l) => {
      lines.push(`\n${l.name}  (confidence: ${l.confidence})`);
      if (l.products?.length) lines.push(`Products: ${l.products.join(", ")}`);
      lines.push(`Requirements: ${l.minimumRequirements || "Not listed"}`);
      lines.push(`Rates: ${l.unverifiedFields.includes("rates") ? "Not listed" : l.estimatedRates ?? "Not listed"}`);
      lines.push(`Phone: ${l.contactInfo ?? "Not listed"}`);
      lines.push(`Website: ${l.website ?? "Not listed"}`);
      const cites = l.citations
        .map((i) => {
          const s = byIndex.get(i);
          return s ? `[${i}] ${hostOf(s.url)} — ${s.url}` : `[${i}]`;
        })
        .join("; ");
      lines.push(`Cited sources: ${cites || "none"}`);
    });

    const rankedSources = (result.sources ?? [])
      .filter((s) => !s.excluded)
      .sort((a, b) => b.reliability_score - a.reliability_score);
    if (rankedSources.length) {
      lines.push("\n\n=== SOURCES (ranked by reliability) ===");
      rankedSources.forEach((s) => {
        lines.push(`[${s.index}] ${s.title || hostOf(s.url)} — ${s.url}`);
        lines.push(
          `     reliability ${s.reliability_score.toFixed(2)} · ${s.tier} · ${s.reliability}` +
            ` · fetched ${new Date(s.fetched_at).toLocaleDateString()}`,
        );
      });
    }

    if (result.commentary) {
      lines.push("\n\n=== MARKET COMMENTARY (cited) ===\n");
      lines.push(result.commentary);
    }

    lines.push("\n\n---");
    lines.push(
      "Details as listed on cited sources — confirm directly before acting. Lender terms change " +
        "frequently; verify each rate, requirement, and contact detail with the lender before deciding.",
    );

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lender-research-${criteria.location.state}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  };

  const degradedIcon =
    result?.provenance === "unconfigured"
      ? WifiOff
      : result?.provenance === "unverified"
        ? AlertTriangle
        : result?.provenance === "error"
          ? AlertTriangle
          : SearchX;

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            Lender Research Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Location */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>City (optional)</Label>
              <Input
                placeholder="e.g. Atlanta"
                value={criteria.location.city}
                onChange={(e) => setCriteria((prev) => ({ ...prev, location: { ...prev.location, city: e.target.value } }))}
              />
            </div>
            <div className="space-y-2">
              <Label>State *</Label>
              <Select value={criteria.location.state} onValueChange={(v) => setCriteria((prev) => ({ ...prev, location: { ...prev.location, state: v } }))}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Amount Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Minimum Amount ($)</Label>
              <Input type="number" placeholder="25000" value={criteria.fundingAmountMin ?? ""} onChange={(e) => setCriteria((prev) => ({ ...prev, fundingAmountMin: e.target.value ? Number(e.target.value) : null }))} />
            </div>
            <div className="space-y-2">
              <Label>Maximum Amount ($)</Label>
              <Input type="number" placeholder="500000" value={criteria.fundingAmountMax ?? ""} onChange={(e) => setCriteria((prev) => ({ ...prev, fundingAmountMax: e.target.value ? Number(e.target.value) : null }))} />
            </div>
          </div>

          {/* Funding Types */}
          <div className="space-y-2">
            <Label>Funding Types</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {FUNDING_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={criteria.fundingTypes.includes(type)}
                    onCheckedChange={() => toggleFundingType(type)}
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>

          {/* Entity, Time, Credit */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Entity Type</Label>
              <Select value={criteria.entityType} onValueChange={(v) => setCriteria((prev) => ({ ...prev, entityType: v }))}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sole_proprietorship">Sole Proprietorship</SelectItem>
                  <SelectItem value="llc">LLC</SelectItem>
                  <SelectItem value="s_corp">S-Corp</SelectItem>
                  <SelectItem value="c_corp">C-Corp</SelectItem>
                  <SelectItem value="partnership">Partnership</SelectItem>
                  <SelectItem value="nonprofit">Nonprofit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Time in Business</Label>
              <Select value={criteria.timeInBusiness} onValueChange={(v) => setCriteria((prev) => ({ ...prev, timeInBusiness: v }))}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="startup">{"Startup (< 1 year)"}</SelectItem>
                  <SelectItem value="1-2">1-2 years</SelectItem>
                  <SelectItem value="2-5">2-5 years</SelectItem>
                  <SelectItem value="5+">5+ years</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Credit Score Range</Label>
              <div className="flex gap-2">
                <Input type="number" placeholder="Min" value={criteria.creditScoreMin ?? ""} onChange={(e) => setCriteria((prev) => ({ ...prev, creditScoreMin: e.target.value ? Number(e.target.value) : null }))} />
                <Input type="number" placeholder="Max" value={criteria.creditScoreMax ?? ""} onChange={(e) => setCriteria((prev) => ({ ...prev, creditScoreMax: e.target.value ? Number(e.target.value) : null }))} />
              </div>
            </div>
          </div>

          {/* Deep Research Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-primary" />
                <Label className="font-medium">Deep Research Mode</Label>
                <StatePill state="off">Cited · live web</StatePill>
              </div>
              <p className="text-xs text-muted-foreground">
                Multi-hop research across the live web — every lender and figure carries a clickable source.
                Cited market analysis is shown only when verifiable sources are found.
              </p>
            </div>
            <Switch checked={deepResearch} onCheckedChange={setDeepResearch} />
          </div>

          <Button onClick={handleSearch} disabled={loading} className="w-full">
            {loading ? (
              <><Loader2 className={cn("w-4 h-4 mr-2", !reduceMotion && "animate-spin")} />Researching lenders...</>
            ) : (
              <><Search className="w-4 h-4 mr-2" />Search Lenders</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Legacy banner — pre-live-research rows, unverified */}
      {isLegacy && (
        <div className="flex items-start gap-3 rounded-[var(--radius)] border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.08)] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" aria-hidden />
          <div className="text-sm">
            <p className="font-medium text-foreground">These results are not verified.</p>
            <p className="text-muted-foreground">
              They were generated before live research was connected. Rates and phone numbers below are shown
              muted and must not be treated as fact. Re-run to get cited, verifiable lenders.
            </p>
          </div>
        </div>
      )}

      {/* Degraded / honest-empty states */}
      {isDegraded && result && (
        <SectionCard>
          <EmptyState
            icon={degradedIcon}
            title={
              result.provenance === "unconfigured"
                ? "Live research isn't connected"
                : result.provenance === "unverified"
                  ? "Couldn't verify these against reliable sources"
                  : result.provenance === "error"
                    ? "Web search is having trouble"
                    : "No verifiable lenders found"
            }
            description={result.message ?? "Nothing was made up to fill the gap."}
          />
          {result.provenance === "unverified" && result.rawLinks.length > 0 && (
            <div className="mx-auto max-w-xl space-y-2 border-t border-border/60 px-2 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Unverified links I found
              </p>
              <ul className="space-y-1.5">
                {result.rawLinks.map((link, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <a
                      href={hrefOf(link.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    >
                      {link.title || hostOf(link.url)}
                      <span className="ml-1 text-muted-foreground/70">{hostOf(link.url)}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="pt-1 text-xs text-muted-foreground">
                Verify each one yourself before acting — no facts were extracted from these pages.
              </p>
            </div>
          )}
        </SectionCard>
      )}

      {/* Verified results */}
      {result && result.lenders.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">
                {result.lenders.length} {result.lenders.length === 1 ? "Lender" : "Lenders"} Found
              </h2>
              {!isLegacy && (
                <StatePill state="success" icon={<ShieldCheck className="h-3 w-3" aria-hidden />}>
                  Cited &amp; verified
                </StatePill>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <FileDown className="w-4 h-4 mr-2" />
              Export Report
            </Button>
          </div>

          <div className="grid gap-3">
            {result.lenders.map((lender, i) => {
              const rateUnverified = lender.unverifiedFields.includes("rates");
              const cited = lender.citations
                .map((idx) => sourcesByIndex.get(idx))
                .filter((s): s is ResearchSource => !!s && !s.excluded);
              return (
                <Card key={i} className="transition-shadow hover:shadow-md">
                  <CardContent className="space-y-3 p-4">
                    {/* Header: name + website + reliability badge */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <h4 className="font-semibold">{lender.name}</h4>
                      <div className="ml-auto">
                        <ReliabilityBadge confidence={lender.confidence} />
                      </div>
                    </div>

                    {/* Products */}
                    {lender.products?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {lender.products.map((p, j) => (
                          <Badge key={j} variant="outline" className="text-xs">{p}</Badge>
                        ))}
                      </div>
                    )}

                    {/* Validated fields — null → "Not listed", never blank/fabricated */}
                    <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm text-muted-foreground md:grid-cols-2">
                      {lender.minimumRequirements && (
                        <div className="md:col-span-2">
                          <span className="font-medium text-foreground">Requirements:</span>{" "}
                          {lender.minimumRequirements}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground">Rates:</span>{" "}
                        {rateUnverified || !lender.estimatedRates ? (
                          <NotListed label="No rate found on a cited source" />
                        ) : (
                          <span className={cn(isLegacy && "opacity-60")}>{lender.estimatedRates}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 shrink-0" aria-hidden />
                        {lender.contactInfo ? (
                          <span className={cn(isLegacy && "opacity-60")}>{lender.contactInfo}</span>
                        ) : (
                          <NotListed label="No phone found on a cited source" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Globe className="h-3 w-3 shrink-0" aria-hidden />
                        {lender.website ? (
                          <a
                            href={hrefOf(lender.website)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                          >
                            {hostOf(lender.website)}
                            <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        ) : (
                          <NotListed label="No website found on a cited source" />
                        )}
                      </div>
                      {lender.locationMatch && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                          {lender.locationMatch}
                        </div>
                      )}
                    </div>

                    {/* Citation row — clickable hosts, indigo focus ring, no gold */}
                    {cited.length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2">
                        <span className="text-xs font-medium text-muted-foreground">Sources:</span>
                        {cited.map((s) => (
                          <a
                            key={s.index}
                            href={hrefOf(s.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                            title={s.title || hostOf(s.url)}
                          >
                            <Globe className="h-3 w-3" aria-hidden />
                            {hostOf(s.url)}
                            <span className="text-[10px] tracking-wide text-muted-foreground/70">[{s.index}]</span>
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Per-card disclaimer */}
                    <p className="text-xs text-muted-foreground">
                      Details as listed on cited sources — confirm directly before acting.
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Market Commentary — cited prose only, else honest-empty */}
      {result && result.lenders.length > 0 && (
        result.commentary ? (
          <SectionCard title="Market Commentary" icon={Lightbulb}>
            <div className="whitespace-pre-wrap text-sm text-muted-foreground">
              {result.commentary}
            </div>
            <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              Every figure above is drawn from the cited sources — verify before acting.
            </p>
          </SectionCard>
        ) : result.isDeep ? (
          <SectionCard>
            <EmptyState
              icon={SearchX}
              title="No verifiable market commentary"
              description="Deep research ran, but no market analysis could be backed by a reliable source. Rather than show unsourced commentary, I'm showing nothing."
            />
          </SectionCard>
        ) : null
      )}
    </div>
  );
}
