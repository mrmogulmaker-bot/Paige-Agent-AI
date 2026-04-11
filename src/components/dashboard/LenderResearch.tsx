import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Search, Building2, Globe, Phone, MapPin, FileDown, Loader2, Lightbulb, ExternalLink } from "lucide-react";
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

interface Lender {
  name: string;
  type: string;
  products: string[];
  minimumRequirements: string;
  estimatedRates: string;
  contactInfo: string;
  website: string;
  locationMatch: string;
  notes: string;
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

export function LenderResearch() {
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
  const [lenders, setLenders] = useState<Lender[]>([]);
  const [commentary, setCommentary] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const toggleFundingType = (type: string) => {
    setCriteria(prev => ({
      ...prev,
      fundingTypes: prev.fundingTypes.includes(type)
        ? prev.fundingTypes.filter(t => t !== type)
        : [...prev.fundingTypes, type],
    }));
  };

  const handleSearch = async () => {
    if (!criteria.location.state) {
      toast.error("Please select a state");
      return;
    }
    setLoading(true);
    setLenders([]);
    setCommentary(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("lender-research", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { searchCriteria: criteria, isDeepResearch: deepResearch },
      });

      if (response.error) throw response.error;
      
      const data = response.data;
      if (data.error) {
        toast.error(data.error);
        return;
      }

      setLenders(data.lenders || []);
      setCommentary(data.marketCommentary || null);
      setSavedId(data.savedId || null);
      toast.success(`Found ${data.lenders?.length || 0} lenders`);
    } catch (err: any) {
      toast.error(err.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = () => {
    // Generate a downloadable text report (PDF generation would be a future enhancement)
    const lines: string[] = [
      "LENDER RESEARCH REPORT",
      `Generated: ${new Date().toLocaleDateString()}`,
      `Location: ${criteria.location.city ? criteria.location.city + ", " : ""}${criteria.location.state}`,
      "",
    ];

    const grouped = groupByType(lenders);
    for (const [type, items] of Object.entries(grouped)) {
      lines.push(`\n--- ${type} ---`);
      items.forEach((l: Lender) => {
        lines.push(`\n${l.name}`);
        lines.push(`Products: ${l.products?.join(", ") || "N/A"}`);
        lines.push(`Requirements: ${l.minimumRequirements || "N/A"}`);
        lines.push(`Rates: ${l.estimatedRates || "N/A"}`);
        lines.push(`Contact: ${l.contactInfo || "N/A"}`);
        lines.push(`Website: ${l.website || "N/A"}`);
        if (l.notes) lines.push(`Notes: ${l.notes}`);
      });
    }

    if (commentary) {
      lines.push("\n\n=== MARKET COMMENTARY ===\n");
      lines.push(commentary);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lender-research-${criteria.location.state}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  };

  const groupByType = (items: Lender[]) => {
    return items.reduce((acc: Record<string, Lender[]>, lender) => {
      const type = lender.type || "Other";
      if (!acc[type]) acc[type] = [];
      acc[type].push(lender);
      return acc;
    }, {});
  };

  const grouped = groupByType(lenders);

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
                onChange={e => setCriteria(prev => ({ ...prev, location: { ...prev.location, city: e.target.value } }))}
              />
            </div>
            <div className="space-y-2">
              <Label>State *</Label>
              <Select value={criteria.location.state} onValueChange={v => setCriteria(prev => ({ ...prev, location: { ...prev.location, state: v } }))}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Amount Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Minimum Amount ($)</Label>
              <Input type="number" placeholder="25000" value={criteria.fundingAmountMin ?? ""} onChange={e => setCriteria(prev => ({ ...prev, fundingAmountMin: e.target.value ? Number(e.target.value) : null }))} />
            </div>
            <div className="space-y-2">
              <Label>Maximum Amount ($)</Label>
              <Input type="number" placeholder="500000" value={criteria.fundingAmountMax ?? ""} onChange={e => setCriteria(prev => ({ ...prev, fundingAmountMax: e.target.value ? Number(e.target.value) : null }))} />
            </div>
          </div>

          {/* Funding Types */}
          <div className="space-y-2">
            <Label>Funding Types</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {FUNDING_TYPES.map(type => (
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
              <Select value={criteria.entityType} onValueChange={v => setCriteria(prev => ({ ...prev, entityType: v }))}>
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
              <Select value={criteria.timeInBusiness} onValueChange={v => setCriteria(prev => ({ ...prev, timeInBusiness: v }))}>
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
                <Input type="number" placeholder="Min" value={criteria.creditScoreMin ?? ""} onChange={e => setCriteria(prev => ({ ...prev, creditScoreMin: e.target.value ? Number(e.target.value) : null }))} />
                <Input type="number" placeholder="Max" value={criteria.creditScoreMax ?? ""} onChange={e => setCriteria(prev => ({ ...prev, creditScoreMax: e.target.value ? Number(e.target.value) : null }))} />
              </div>
            </div>
          </div>

          {/* Deep Research Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-primary" />
                <Label className="font-medium">Deep Research Mode</Label>
              </div>
              <p className="text-xs text-muted-foreground">Includes market commentary and lending environment analysis</p>
            </div>
            <Switch checked={deepResearch} onCheckedChange={setDeepResearch} />
          </div>

          <Button onClick={handleSearch} disabled={loading} className="w-full">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Researching lenders...</> : <><Search className="w-4 h-4 mr-2" />Search Lenders</>}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {lenders.length > 0 && (
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">{lenders.length} Lenders Found</h2>
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <FileDown className="w-4 h-4 mr-2" />
              Export Report
            </Button>
          </div>

          {Object.entries(grouped).map(([type, items]) => (
            <div key={type} className="space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-base">{type}</h3>
                <Badge variant="secondary" className="text-xs">{items.length}</Badge>
              </div>

              <div className="grid gap-3">
                {items.map((lender, i) => (
                  <Card key={i} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{lender.name}</h4>
                            {lender.website && (
                              <a href={lender.website.startsWith("http") ? lender.website : `https://${lender.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {lender.products?.map((p, j) => (
                              <Badge key={j} variant="outline" className="text-xs">{p}</Badge>
                            ))}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground">
                            {lender.minimumRequirements && (
                              <div><span className="font-medium text-foreground">Requirements:</span> {lender.minimumRequirements}</div>
                            )}
                            {lender.estimatedRates && (
                              <div><span className="font-medium text-foreground">Rates:</span> {lender.estimatedRates}</div>
                            )}
                            {lender.contactInfo && (
                              <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {lender.contactInfo}</div>
                            )}
                            {lender.locationMatch && (
                              <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {lender.locationMatch}</div>
                            )}
                          </div>

                          {lender.notes && (
                            <p className="text-xs text-muted-foreground italic">{lender.notes}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Market Commentary */}
      {commentary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-primary" />
              Market Commentary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap">
              {commentary}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
