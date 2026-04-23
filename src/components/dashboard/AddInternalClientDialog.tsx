import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

interface AddInternalClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientAdded: () => void;
}

export function AddInternalClientDialog({ open, onOpenChange, onClientAdded }: AddInternalClientDialogProps) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    street_address: "",
    city: "",
    state: "",
    zip_code: "",
    entity_name: "",
    entity_type: "",
    funding_goal: "",
    monthly_revenue: "",
    current_notes: "",
  });

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error("First and last name are required");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("clients" as any).insert({
        created_by: user.id,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        street_address: form.street_address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip_code: form.zip_code.trim() || null,
        entity_name: form.entity_name.trim() || null,
        entity_type: form.entity_type || null,
        funding_goal: form.funding_goal ? Number(form.funding_goal) : null,
        monthly_revenue: form.monthly_revenue ? Number(form.monthly_revenue) : null,
        current_notes: form.current_notes.trim() || null,
      } as any);

      if (error) throw error;

      toast.success(`Client ${form.first_name} ${form.last_name} created`);
      onClientAdded();
      onOpenChange(false);
      setForm({
        first_name: "", last_name: "", email: "", phone: "",
        street_address: "", city: "", state: "", zip_code: "",
        entity_name: "", entity_type: "", funding_goal: "",
        monthly_revenue: "", current_notes: "",
      });
    } catch (error: any) {
      const msg = (error?.message || "").toLowerCase();
      if (msg.includes("clients_created_by_email_unique")) {
        toast.error("A client with this email already exists in your list");
      } else if (msg.includes("clients_linked_user_id_unique")) {
        toast.error("This portal user is already linked to another client record");
      } else if (msg.includes("clients_status_check")) {
        toast.error("Invalid status value");
      } else {
        toast.error("Failed to create client", { description: error.message });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" /> New Client Record
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="first_name">First Name *</Label>
              <Input id="first_name" value={form.first_name} onChange={(e) => update("first_name", e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="last_name">Last Name *</Label>
              <Input id="last_name" value={form.last_name} onChange={(e) => update("last_name", e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="street_address">Street Address</Label>
            <Input id="street_address" value={form.street_address} onChange={(e) => update("street_address", e.target.value)} placeholder="123 Main Street, Apt 4B" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="Atlanta" />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input id="state" value={form.state} onChange={(e) => update("state", e.target.value)} placeholder="GA" maxLength={2} />
            </div>
            <div>
              <Label htmlFor="zip_code">Zip Code</Label>
              <Input id="zip_code" value={form.zip_code} onChange={(e) => update("zip_code", e.target.value)} placeholder="30301" maxLength={10} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="entity_name">Entity Name</Label>
              <Input id="entity_name" value={form.entity_name} onChange={(e) => update("entity_name", e.target.value)} placeholder="Business legal name" />
            </div>
            <div>
              <Label htmlFor="entity_type">Entity Type</Label>
              <Select value={form.entity_type} onValueChange={(v) => update("entity_type", v)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="llc">LLC</SelectItem>
                  <SelectItem value="s_corp">S-Corp</SelectItem>
                  <SelectItem value="c_corp">C-Corp</SelectItem>
                  <SelectItem value="sole_prop">Sole Proprietorship</SelectItem>
                  <SelectItem value="partnership">Partnership</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="funding_goal">Funding Goal ($)</Label>
              <Input id="funding_goal" type="number" value={form.funding_goal} onChange={(e) => update("funding_goal", e.target.value)} placeholder="250000" />
            </div>
            <div>
              <Label htmlFor="monthly_revenue">Monthly Revenue ($)</Label>
              <Input id="monthly_revenue" type="number" value={form.monthly_revenue} onChange={(e) => update("monthly_revenue", e.target.value)} placeholder="15000" />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={form.current_notes} onChange={(e) => update("current_notes", e.target.value)} placeholder="Initial intake notes..." rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
