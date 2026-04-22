import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  CheckCircle2, AlertTriangle, XCircle, Building2, Phone, Landmark, FileText,
  ExternalLink, ChevronDown, ChevronUp, Info, CalendarIcon, Eye, EyeOff, Mail
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FoundationSectionProps {
  businessId: string;
  userId: string;
  onCompletionChange: (pct: number) => void;
}

interface BusinessData {
  entity_type: string | null;
  state_of_formation: string | null;
  formation_date: string | null;
  registered_agent_name: string | null;
  registered_agent_address: string | null;
  ein: string | null;
  business_address_type: string | null;
  business_street_address: string | null;
  business_city: string | null;
  business_state: string | null;
  business_zip: string | null;
  business_phone: string | null;
  business_email: string | null;
  phone_411_listed: boolean;
  has_bank_account: boolean;
  bank_name: string | null;
  bank_account_opened_date: string | null;
}

const ENTITY_TYPES = ["Sole Proprietorship", "LLC", "S-Corp", "C-Corp", "Series LLC", "Partnership"];
const ADDRESS_TYPES = ["Commercial Office", "Virtual Office", "Registered Agent Address", "Home Address"];

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
  "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky",
  "Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi",
  "Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico",
  "New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania",
  "Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming"
];

type ItemKey = "entity" | "ein" | "address" | "phone" | "email" | "bank";

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com","yahoo.com","ymail.com","outlook.com","hotmail.com","live.com","msn.com",
  "icloud.com","me.com","mac.com","aol.com","aim.com","proton.me","protonmail.com",
  "gmx.com","mail.com","yandex.com","zoho.com",
]);
const isFreeEmail = (e?: string | null) => {
  if (!e) return false;
  const at = e.lastIndexOf("@");
  if (at < 0) return false;
  return FREE_EMAIL_DOMAINS.has(e.slice(at + 1).trim().toLowerCase());
};

export function FoundationSection({ businessId, userId, onCompletionChange }: FoundationSectionProps) {
  const queryClient = useQueryClient();
  const [data, setData] = useState<BusinessData | null>(null);
  const [expandedItem, setExpandedItem] = useState<ItemKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<Partial<BusinessData>>({});
  const [showEin, setShowEin] = useState(false);
  const [formationDate, setFormationDate] = useState<Date | undefined>();
  const [bankOpenDate, setBankOpenDate] = useState<Date | undefined>();
  const [noCommingling, setNoCommingling] = useState(false);
  const [bankAccountType, setBankAccountType] = useState<string>("");

  useEffect(() => { if (businessId) fetchData(); }, [businessId]);

  const fetchData = async () => {
    const { data: biz } = await supabase
      .from("businesses")
      .select("entity_type, state_of_formation, formation_date, registered_agent_name, registered_agent_address, ein, business_address_type, business_street_address, business_city, business_state, business_zip, business_phone, business_email, phone_411_listed, has_bank_account, bank_name, bank_account_opened_date")
      .eq("id", businessId)
      .maybeSingle();
    if (biz) {
      const bd = biz as any as BusinessData;
      setData(bd);
      setEditData(bd);
      if (bd.formation_date) setFormationDate(new Date(bd.formation_date));
      if (bd.bank_account_opened_date) setBankOpenDate(new Date(bd.bank_account_opened_date));
      calcCompletion(bd);
    }
  };

  const getStatus = (key: ItemKey): "verified" | "pending" | "missing" => {
    if (!data) return "missing";
    switch (key) {
      case "entity":
        if (data.entity_type && data.state_of_formation) return "verified";
        if (data.entity_type || data.state_of_formation) return "pending";
        return "missing";
      case "ein":
        return data.ein ? "verified" : "missing";
      case "address":
        if (data.business_address_type === "Home Address") return "pending";
        if (data.business_street_address && data.business_city && data.business_state && data.business_zip && data.business_address_type) return "verified";
        if (data.business_street_address || data.business_address_type) return "pending";
        return "missing";
      case "phone":
        if (data.business_phone && data.phone_411_listed) return "verified";
        if (data.business_phone) return "pending";
        return "missing";
      case "email":
        if (data.business_email && !isFreeEmail(data.business_email)) return "verified";
        if (data.business_email) return "pending"; // free domain
        return "missing";
      case "bank":
        if (data.has_bank_account && data.bank_name && data.bank_account_opened_date) return "verified";
        if (data.has_bank_account || data.bank_name) return "pending";
        return "missing";
    }
  };

  const calcCompletion = (d: BusinessData) => {
    let verified = 0;
    // Entity: verified when type + state filled
    if (d.entity_type && d.state_of_formation) verified++;
    // EIN: verified when present
    if (d.ein) verified++;
    // Address: verified when all fields filled AND not Home Address
    if (d.business_street_address && d.business_city && d.business_state && d.business_zip && d.business_address_type && d.business_address_type !== "Home Address") verified++;
    // Phone: verified when number + 411
    if (d.business_phone && d.phone_411_listed) verified++;
    // Email: verified when on a non-free domain
    if (d.business_email && !isFreeEmail(d.business_email)) verified++;
    // Bank: verified when all filled
    if (d.has_bank_account && d.bank_name && d.bank_account_opened_date) verified++;
    onCompletionChange(Math.round((verified / 6) * 100));
  };

  const handleSave = async (fields: Partial<BusinessData>) => {
    setSaving(true);
    const { error } = await supabase.from("businesses").update(fields as any).eq("id", businessId);
    if (error) { toast.error("Failed to save changes"); }
    else {
      toast.success("Changes saved");
      await fetchData();
      // Small Business / Commercial fundability scores depend on entity
      // type, formation date, EIN, and bank info — invalidate so the
      // dashboard reflects the change immediately.
      queryClient.invalidateQueries({ queryKey: ["three-fundability-inputs"] });
      queryClient.invalidateQueries({ queryKey: ["funding-readiness-supplemental"] });
    }
    setSaving(false);
  };

  const maskEin = (ein: string) => {
    if (!ein || ein.length < 4) return ein;
    return "XX-XXX" + ein.slice(-4);
  };

  const StatusIcon = ({ status }: { status: "verified" | "pending" | "missing" }) => {
    if (status === "verified") return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    if (status === "pending") return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    return <XCircle className="w-5 h-5 text-destructive" />;
  };

  const StatusBadge = ({ status }: { status: "verified" | "pending" | "missing" }) => (
    <Badge variant={status === "verified" ? "default" : status === "pending" ? "secondary" : "destructive"}
      className={status === "verified" ? "bg-emerald-500/20 text-emerald-600 border-emerald-500/30" : status === "pending" ? "bg-amber-500/20 text-amber-600 border-amber-500/30" : ""}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );

  const items: { key: ItemKey; label: string; icon: React.ReactNode }[] = [
    { key: "entity", label: "Legal Entity Formation", icon: <Building2 className="w-4 h-4" /> },
    { key: "ein", label: "EIN (Employer Identification Number)", icon: <FileText className="w-4 h-4" /> },
    { key: "address", label: "Business Address", icon: <Building2 className="w-4 h-4" /> },
    { key: "phone", label: "Dedicated Business Phone with 411 Listing", icon: <Phone className="w-4 h-4" /> },
    { key: "bank", label: "Business Bank Account", icon: <Landmark className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-3">
      {items.map(item => {
        const status = getStatus(item.key);
        const isExpanded = expandedItem === item.key;
        return (
          <Card key={item.key} className={`border ${status === "verified" ? "border-emerald-500/30" : status === "pending" ? "border-amber-500/30" : "border-destructive/30"}`}>
            <button className="w-full text-left" onClick={() => setExpandedItem(isExpanded ? null : item.key)}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={status} />
                    <div className="flex items-center gap-2">
                      {item.icon}
                      <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={status} />
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>
              </CardHeader>
            </button>

            {isExpanded && (
              <CardContent className="pt-0 pb-4 px-4 space-y-4">
                {/* ── Legal Entity Formation ── */}
                {item.key === "entity" && (
                  <>
                    <Alert className="border-amber-500/30 bg-amber-500/5">
                      <Info className="w-4 h-4 text-amber-500" />
                      <AlertDescription className="text-xs text-foreground">
                        Everything registered with your Secretary of State becomes public record accessible to anyone. Use a registered agent address rather than your personal home address to protect your privacy and maintain professional credibility with lenders.
                      </AlertDescription>
                    </Alert>

                    {status === "missing" && (
                      <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-muted/30">
                        <Button variant="default" size="sm" asChild>
                          <a href="AFFILIATE_ENTITY_FORMATION" target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3 h-3 mr-1" /> Get Help Forming Your Entity
                          </a>
                        </Button>
                        <button className="text-xs text-primary hover:underline text-left" onClick={(e) => { e.stopPropagation(); }}>
                          I already have an entity — enter details below ↓
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Entity Type</Label>
                        <Select value={editData.entity_type || ""} onValueChange={v => setEditData({ ...editData, entity_type: v })}>
                          <SelectTrigger><SelectValue placeholder="Select entity type" /></SelectTrigger>
                          <SelectContent>
                            {ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">State of Formation</Label>
                        <Select value={editData.state_of_formation || ""} onValueChange={v => setEditData({ ...editData, state_of_formation: v })}>
                          <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                          <SelectContent>
                            {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Date of Formation</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formationDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formationDate ? format(formationDate, "PPP") : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={formationDate}
                              onSelect={(d) => {
                                setFormationDate(d);
                                if (d) setEditData({ ...editData, formation_date: format(d, "yyyy-MM-dd") });
                              }}
                              disabled={(date) => date > new Date()}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <Label className="text-xs">Registered Agent Name</Label>
                        <Input value={editData.registered_agent_name || ""} onChange={e => setEditData({ ...editData, registered_agent_name: e.target.value })} placeholder="Agent name" />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Registered Agent Address</Label>
                        <Input value={editData.registered_agent_address || ""} onChange={e => setEditData({ ...editData, registered_agent_address: e.target.value })} placeholder="Full address" />
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleSave({
                      entity_type: editData.entity_type,
                      state_of_formation: editData.state_of_formation,
                      formation_date: editData.formation_date,
                      registered_agent_name: editData.registered_agent_name,
                      registered_agent_address: editData.registered_agent_address,
                    } as any)} disabled={saving}>
                      {saving ? "Saving..." : "Save Entity Details"}
                    </Button>
                  </>
                )}

                {/* ── EIN ── */}
                {item.key === "ein" && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      EIN applications are free and take about 15 minutes directly at IRS.gov. Never pay a third party to obtain your EIN — it is a free government service.
                    </p>
                    <div>
                      <Label className="text-xs">EIN</Label>
                      <div className="flex gap-2">
                        {data?.ein && !showEin ? (
                          <div className="flex items-center gap-2 flex-1">
                            <Input value={maskEin(data.ein)} readOnly className="flex-1 bg-muted/30" />
                            <Button variant="ghost" size="icon" onClick={() => setShowEin(true)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-1">
                            <Input
                              value={editData.ein || ""}
                              onChange={e => setEditData({ ...editData, ein: e.target.value })}
                              placeholder="XX-XXXXXXX"
                              className="flex-1"
                            />
                            {data?.ein && (
                              <Button variant="ghost" size="icon" onClick={() => setShowEin(false)}>
                                <EyeOff className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleSave({ ein: editData.ein } as any)} disabled={saving}>
                      {saving ? "Saving..." : "Save EIN"}
                    </Button>
                    {status === "missing" && (
                      <Button variant="outline" size="sm" asChild>
                        <a href="https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online" target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3 mr-1" /> Apply at IRS.gov — Free and Immediate
                        </a>
                      </Button>
                    )}
                  </>
                )}

                {/* ── Business Address ── */}
                {item.key === "address" && (
                  <>
                    {editData.business_address_type === "Home Address" && (
                      <Alert className="border-amber-500/30 bg-amber-500/5">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <AlertDescription className="text-xs text-foreground">
                          Using your home address exposes your personal information in public records and signals to lenders that you may not be operating a legitimate commercial business. Consider a virtual office or registered agent address before applying for business funding.
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Address Type</Label>
                        <Select value={editData.business_address_type || ""} onValueChange={v => setEditData({ ...editData, business_address_type: v })}>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>{ADDRESS_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Street Address</Label>
                        <Input value={editData.business_street_address || ""} onChange={e => setEditData({ ...editData, business_street_address: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">City</Label>
                        <Input value={editData.business_city || ""} onChange={e => setEditData({ ...editData, business_city: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">State</Label>
                        <Select value={editData.business_state || ""} onValueChange={v => setEditData({ ...editData, business_state: v })}>
                          <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                          <SelectContent>{US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">ZIP Code</Label>
                        <Input value={editData.business_zip || ""} onChange={e => setEditData({ ...editData, business_zip: e.target.value })} placeholder="12345" />
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleSave({
                      business_address_type: editData.business_address_type,
                      business_street_address: editData.business_street_address,
                      business_city: editData.business_city,
                      business_state: editData.business_state,
                      business_zip: editData.business_zip,
                    } as any)} disabled={saving}>
                      {saving ? "Saving..." : "Save Address"}
                    </Button>
                    {(status === "missing" || editData.business_address_type === "Home Address") && (
                      <Button variant="outline" size="sm" asChild>
                        <a href="AFFILIATE_VIRTUAL_OFFICE" target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3 mr-1" /> Find a Virtual Office
                        </a>
                      </Button>
                    )}
                  </>
                )}

                {/* ── Business Phone ── */}
                {item.key === "phone" && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Lenders and verification services like LexisNexis call business phone numbers to confirm the business exists. A number that does not appear in 411 directories or answers as a personal voicemail creates an identity verification failure that can result in automatic decline regardless of credit scores.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Business Phone Number</Label>
                        <Input value={editData.business_phone || ""} onChange={e => setEditData({ ...editData, business_phone: e.target.value })} placeholder="(555) 123-4567" />
                      </div>
                      <div className="flex items-end">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="phone-411"
                            checked={editData.phone_411_listed || false}
                            onCheckedChange={(checked) => setEditData({ ...editData, phone_411_listed: !!checked })}
                          />
                          <Label htmlFor="phone-411" className="text-sm cursor-pointer">Listed in 411 directories</Label>
                        </div>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleSave({ business_phone: editData.business_phone, phone_411_listed: editData.phone_411_listed } as any)} disabled={saving}>
                      {saving ? "Saving..." : "Save Phone Details"}
                    </Button>
                    {(status === "missing" || status === "pending") && (
                      <Button variant="outline" size="sm" asChild>
                        <a href="AFFILIATE_BUSINESS_PHONE" target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3 mr-1" /> Get a Business Phone Line
                        </a>
                      </Button>
                    )}
                  </>
                )}

                {/* ── Business Email ── */}
                {item.key === "email" && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      A dedicated business email on a domain you own (e.g. you@yourbusiness.com) is what funders, LexisNexis, and the business bureaus expect. Free-domain emails (gmail, yahoo, outlook, icloud) signal an unestablished business and can downgrade your file regardless of credit scores.
                    </p>
                    <div>
                      <Label className="text-xs">Business Email Address</Label>
                      <Input
                        type="email"
                        value={editData.business_email || ""}
                        onChange={e => setEditData({ ...editData, business_email: e.target.value })}
                        placeholder="you@yourbusiness.com"
                      />
                      {editData.business_email && isFreeEmail(editData.business_email) && (
                        <p className="text-xs text-amber-600 mt-1">
                          ⚠ This is a free-domain email. Funders treat this as a personal address — switch to your own domain.
                        </p>
                      )}
                    </div>
                    <Button size="sm" onClick={() => handleSave({ business_email: editData.business_email } as any)} disabled={saving}>
                      {saving ? "Saving..." : "Save Business Email"}
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href="https://workspace.google.com/business/signup/welcome" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3 h-3 mr-1" /> Set up Google Workspace ($7/user/mo)
                      </a>
                    </Button>
                  </>
                )}

                {/* ── Business Bank Account ── */}
                {item.key === "bank" && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Lenders typically require 3 to 6 months of business bank statements and will review the account for consistent deposits, professional transaction patterns, and separation from personal finances. Open this account as soon as your entity is formed.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Bank Name</Label>
                        <Input value={editData.bank_name || ""} onChange={e => setEditData({ ...editData, bank_name: e.target.value })} placeholder="e.g. Chase, Novo, Mercury" />
                      </div>
                      <div>
                        <Label className="text-xs">Account Type</Label>
                        <Select value={bankAccountType} onValueChange={setBankAccountType}>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Checking">Checking</SelectItem>
                            <SelectItem value="Savings">Savings</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Date Account Opened</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !bankOpenDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {bankOpenDate ? format(bankOpenDate, "PPP") : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={bankOpenDate}
                              onSelect={(d) => {
                                setBankOpenDate(d);
                                if (d) setEditData({ ...editData, bank_account_opened_date: format(d, "yyyy-MM-dd") });
                              }}
                              disabled={(date) => date > new Date()}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="flex items-end">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="no-commingling"
                            checked={noCommingling}
                            onCheckedChange={(checked) => {
                              setNoCommingling(!!checked);
                              setEditData({ ...editData, has_bank_account: !!checked });
                            }}
                          />
                          <Label htmlFor="no-commingling" className="text-xs cursor-pointer leading-tight">
                            Account is used exclusively for business — never commingled with personal funds
                          </Label>
                        </div>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleSave({
                      has_bank_account: editData.has_bank_account ?? noCommingling,
                      bank_name: editData.bank_name,
                      bank_account_opened_date: editData.bank_account_opened_date,
                    } as any)} disabled={saving}>
                      {saving ? "Saving..." : "Save Banking Info"}
                    </Button>
                    {status === "missing" && (
                      <div className="pt-2 border-t border-border space-y-2">
                        <p className="text-xs text-muted-foreground font-medium">Recommended starter business banks:</p>
                        <div className="flex gap-2 flex-wrap">
                          <a href="https://www.novo.co" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> Novo
                          </a>
                          <a href="https://mercury.com" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> Mercury
                          </a>
                          <a href="https://relayfi.com" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> Relay
                          </a>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
