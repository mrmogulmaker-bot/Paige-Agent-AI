import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AddBusinessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentBusinessId?: string | null;
  onSuccess: () => void;
}

export function AddBusinessDialog({ open, onOpenChange, parentBusinessId, onSuccess }: AddBusinessDialogProps) {
  const [formData, setFormData] = useState({
    legal_name: "",
    dba: "",
    entity_type: "",
    business_type: parentBusinessId ? "subsidiary" : "standalone",
    ein: "",
    state_of_formation: "",
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const insertData: any = {
        legal_name: formData.legal_name,
        dba: formData.dba || null,
        entity_type: formData.entity_type,
        business_type: formData.business_type,
        ein: formData.ein || null,
        state_of_formation: formData.state_of_formation || null,
        owner_user_id: user.id,
        parent_business_id: parentBusinessId || null,
        organizational_level: parentBusinessId ? 1 : 0,
      };

      const { error } = await supabase.from("businesses").insert(insertData);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Business added successfully",
      });

      onSuccess();
      onOpenChange(false);
      setFormData({
        legal_name: "",
        dba: "",
        entity_type: "",
        business_type: parentBusinessId ? "subsidiary" : "standalone",
        ein: "",
        state_of_formation: "",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {parentBusinessId ? "Add Subsidiary" : "Add Business Entity"}
          </DialogTitle>
          <DialogDescription>
            {parentBusinessId 
              ? "Add a subsidiary company under the selected parent entity"
              : "Add a new business entity to your organization"
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="legal_name">Legal Name *</Label>
              <Input
                id="legal_name"
                required
                value={formData.legal_name}
                onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
                placeholder="ABC Corporation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dba">DBA (Doing Business As)</Label>
              <Input
                id="dba"
                value={formData.dba}
                onChange={(e) => setFormData({ ...formData, dba: e.target.value })}
                placeholder="ABC Company"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="entity_type">Entity Type *</Label>
              <Select
                required
                value={formData.entity_type}
                onValueChange={(value) => setFormData({ ...formData, entity_type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select entity type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LLC">LLC</SelectItem>
                  <SelectItem value="Corporation">Corporation</SelectItem>
                  <SelectItem value="S-Corp">S-Corp</SelectItem>
                  <SelectItem value="C-Corp">C-Corp</SelectItem>
                  <SelectItem value="Partnership">Partnership</SelectItem>
                  <SelectItem value="Sole Proprietorship">Sole Proprietorship</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="business_type">Business Type *</Label>
              <Select
                required
                value={formData.business_type}
                onValueChange={(value) => setFormData({ ...formData, business_type: value })}
                disabled={!!parentBusinessId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select business type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="holding">Holding Company</SelectItem>
                  <SelectItem value="parent">Parent Company</SelectItem>
                  <SelectItem value="subsidiary">Subsidiary</SelectItem>
                  <SelectItem value="standalone">Standalone</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ein">EIN (Employer ID Number)</Label>
              <Input
                id="ein"
                value={formData.ein}
                onChange={(e) => setFormData({ ...formData, ein: e.target.value })}
                placeholder="12-3456789"
                maxLength={10}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state_of_formation">State of Formation</Label>
              <Input
                id="state_of_formation"
                value={formData.state_of_formation}
                onChange={(e) => setFormData({ ...formData, state_of_formation: e.target.value })}
                placeholder="DE"
                maxLength={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Business"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
