import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle2, AlertTriangle, XCircle, Building2, Phone, Landmark, FileText, ExternalLink, ChevronDown, ChevronUp, Info
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
  phone_411_listed: boolean;
  has_bank_account: boolean;
  bank_name: string | null;
  bank_account_opened_date: string | null;
}

const ENTITY_TYPES = ["Sole Proprietorship", "LLC", "S-Corp", "C-Corp", "Series LLC", "Partnership"];
const ADDRESS_TYPES = ["Commercial Office", "Virtual Office", "Registered Agent Address", "Home Address"];

type ItemKey = "entity" | "ein" | "address" | "phone" | "bank";

export function FoundationSection({ businessId, userId, onCompletionChange }: FoundationSectionProps) {
  const [data, setData] = useState<BusinessData | null>(null);
  const [expandedItem, setExpandedItem] = useState<ItemKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<Partial<BusinessData>>({});

  useEffect(() => { fetchData(); }, [businessId]);

  const fetchData = async () => {
    const { data: biz } = await supabase
      .from("businesses")
      .select("entity_type, state_of_formation, formation_date, registered_agent_name, registered_agent_address, ein, business_address_type, business_street_address, business_city, business_state, business_zip, business_phone, phone_411_listed, has_bank_account, bank_name, bank_account_opened_date")
      .eq("id", businessId)
      .maybeSingle();
    if (biz) {
      const bd = biz as any as BusinessData;
      setData(bd);
      setEditData(bd);
      calcCompletion(bd);
    }
  };

  const calcCompletion = (d: BusinessData) => {
    let done = 0;
    if (d.entity_type && d.state_of_formation) done++;
    if (d.ein) done++;
    if (d.business_street_address && d.business_city && d.business_state && d.business_zip) done++;
    if (d.business_phone) done++;
    if (d.has_bank_account && d.bank_name) done++;
    onCompletionChange(Math.round((done / 5) * 100));
  };

  const getStatus = (key: ItemKey): "verified" | "pending" | "missing" => {
    if (!data) return "missing";
    switch (key) {
      case "entity": return (data.entity_type && data.state_of_formation) ? "verified" : data.entity_type ? "pending" : "missing";
      case "ein": return data.ein ? "verified" : "missing";
      case "address": return (data.business_street_address && data.business_city && data.business_state && data.business_zip) ? "verified" : data.business_street_address ? "pending" : "missing";
      case "phone": return (data.business_phone && data.phone_411_listed) ? "verified" : data.business_phone ? "pending" : "missing";
      case "bank": return (data.has_bank_account && data.bank_name) ? "verified" : "missing";
    }
  };

  const handleSave = async (fields: Partial<BusinessData>) => {
    setSaving(true);
    const { error } = await supabase.from("businesses").update(fields as any).eq("id", businessId);
    if (error) { toast.error("Failed to save"); }
    else { toast.success("Saved"); await fetchData(); setExpandedItem(null); }
    setSaving(false);
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
                {item.key === "entity" && (
                  <>
                    <Alert className="border-blue-500/30 bg-blue-500/5">
                      <Info className="w-4 h-4 text-blue-500" />
                      <AlertDescription className="text-xs">
                        Everything registered with the Secretary of State becomes public record accessible to anyone. Use a registered agent address rather than your personal home address to protect your privacy.
                      </AlertDescription>
                    </Alert>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Entity Type</Label>
                        <Select value={editData.entity_type || ""} onValueChange={v => setEditData({ ...editData, entity_type: v })}>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>{ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">State of Formation</Label>
                        <Input value={editData.state_of_formation || ""} onChange={e => setEditData({ ...editData, state_of_formation: e.target.value })} placeholder="e.g. Delaware" />
                      </div>
                      <div>
                        <Label className="text-xs">Date of Formation</Label>
                        <Input type="date" value={editData.formation_date || ""} onChange={e => setEditData({ ...editData, formation_date: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">Registered Agent Name</Label>
                        <Input value={editData.registered_agent_name || ""} onChange={e => setEditData({ ...editData, registered_agent_name: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Registered Agent Address</Label>
                        <Input value={editData.registered_agent_address || ""} onChange={e => setEditData({ ...editData, registered_agent_address: e.target.value })} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSave({ entity_type: editData.entity_type, state_of_formation: editData.state_of_formation, formation_date: editData.formation_date, registered_agent_name: editData.registered_agent_name, registered_agent_address: editData.registered_agent_address } as any)} disabled={saving}>
                        {saving ? "Saving..." : "Save Entity Details"}
                      </Button>
                    </div>
                    {status === "missing" && (
                      <div className="flex flex-col gap-2 pt-2 border-t border-border">
                        <Button variant="outline" size="sm" asChild>
                          <a href="AFFILIATE_ENTITY_FORMATION" target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3 h-3 mr-1" /> Get Help Forming Your Entity
                          </a>
                        </Button>
                        <button className="text-xs text-accent hover:underline text-left" onClick={() => {}}>
                          I already have an entity — enter my details above
                        </button>
                      </div>
                    )}
                  </>
                )}

                {item.key === "ein" && (
                  <>
                    <Alert className="border-blue-500/30 bg-blue-500/5">
                      <Info className="w-4 h-4 text-blue-500" />
                      <AlertDescription className="text-xs">
                        EIN applications are free and immediate when done directly at IRS.gov. Never pay a third party to get your EIN.
                      </AlertDescription>
                    </Alert>
                    <div>
                      <Label className="text-xs">EIN</Label>
                      <Input value={editData.ein || ""} onChange={e => setEditData({ ...editData, ein: e.target.value })} placeholder="XX-XXXXXXX" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSave({ ein: editData.ein } as any)} disabled={saving}>Save EIN</Button>
                    </div>
                    {status === "missing" && (
                      <Button variant="outline" size="sm" asChild>
                        <a href="https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online" target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3 mr-1" /> Apply for EIN at IRS.gov
                        </a>
                      </Button>
                    )}
                  </>
                )}

                {item.key === "address" && (
                  <>
                    {editData.business_address_type === "Home Address" && (
                      <Alert className="border-amber-500/30 bg-amber-500/5">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <AlertDescription className="text-xs">
                          Using your home address as your business address exposes your personal information in public records and may limit funding options with some lenders. Consider a virtual office or registered agent address.
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <Label className="text-xs">Address Type</Label>
                        <Select value={editData.business_address_type || ""} onValueChange={v => setEditData({ ...editData, business_address_type: v })}>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>{ADDRESS_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Street Address</Label>
                        <Input value={editData.business_street_address || ""} onChange={e => setEditData({ ...editData, business_street_address: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">City</Label>
                        <Input value={editData.business_city || ""} onChange={e => setEditData({ ...editData, business_city: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">State</Label>
                        <Input value={editData.business_state || ""} onChange={e => setEditData({ ...editData, business_state: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">ZIP</Label>
                        <Input value={editData.business_zip || ""} onChange={e => setEditData({ ...editData, business_zip: e.target.value })} />
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleSave({ business_address_type: editData.business_address_type, business_street_address: editData.business_street_address, business_city: editData.business_city, business_state: editData.business_state, business_zip: editData.business_zip } as any)} disabled={saving}>
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

                {item.key === "phone" && (
                  <>
                    <Alert className="border-blue-500/30 bg-blue-500/5">
                      <Info className="w-4 h-4 text-blue-500" />
                      <AlertDescription className="text-xs">
                        Lenders and their verification services call business phone numbers to confirm the business exists. A number that does not appear in 411 or answers as a personal line is a red flag in underwriting.
                      </AlertDescription>
                    </Alert>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Business Phone Number</Label>
                        <Input value={editData.business_phone || ""} onChange={e => setEditData({ ...editData, business_phone: e.target.value })} placeholder="(555) 123-4567" />
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={editData.phone_411_listed || false} onChange={e => setEditData({ ...editData, phone_411_listed: e.target.checked })} className="rounded border-border" />
                          Listed in 411 directories
                        </label>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleSave({ business_phone: editData.business_phone, phone_411_listed: editData.phone_411_listed } as any)} disabled={saving}>
                      {saving ? "Saving..." : "Save Phone"}
                    </Button>
                    {status === "missing" && (
                      <Button variant="outline" size="sm" asChild>
                        <a href="AFFILIATE_BUSINESS_PHONE" target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3 mr-1" /> Get a Business Phone Line
                        </a>
                      </Button>
                    )}
                  </>
                )}

                {item.key === "bank" && (
                  <>
                    <Alert className="border-blue-500/30 bg-blue-500/5">
                      <Info className="w-4 h-4 text-blue-500" />
                      <AlertDescription className="text-xs">
                        A dedicated business bank account that has never been commingled with personal funds is one of the first things lenders verify. Open one immediately after forming your entity.
                      </AlertDescription>
                    </Alert>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-end gap-2 col-span-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={editData.has_bank_account || false} onChange={e => setEditData({ ...editData, has_bank_account: e.target.checked })} className="rounded border-border" />
                          Has a dedicated business bank account
                        </label>
                      </div>
                      {editData.has_bank_account && (
                        <>
                          <div>
                            <Label className="text-xs">Bank Name</Label>
                            <Input value={editData.bank_name || ""} onChange={e => setEditData({ ...editData, bank_name: e.target.value })} />
                          </div>
                          <div>
                            <Label className="text-xs">Account Opened Date</Label>
                            <Input type="date" value={editData.bank_account_opened_date || ""} onChange={e => setEditData({ ...editData, bank_account_opened_date: e.target.value })} />
                          </div>
                        </>
                      )}
                    </div>
                    <Button size="sm" onClick={() => handleSave({ has_bank_account: editData.has_bank_account, bank_name: editData.bank_name, bank_account_opened_date: editData.bank_account_opened_date } as any)} disabled={saving}>
                      {saving ? "Saving..." : "Save Banking Info"}
                    </Button>
                    {status === "missing" && (
                      <div className="pt-2 border-t border-border space-y-2">
                        <p className="text-xs text-muted-foreground font-medium">Recommended starter business banks:</p>
                        <div className="flex gap-2 flex-wrap">
                          <Button variant="outline" size="sm" asChild><a href="https://www.novo.co" target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3 mr-1" /> Novo</a></Button>
                          <Button variant="outline" size="sm" asChild><a href="https://mercury.com" target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3 mr-1" /> Mercury</a></Button>
                          <Button variant="outline" size="sm" asChild><a href="https://relayfi.com" target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3 mr-1" /> Relay</a></Button>
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
