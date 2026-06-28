import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { z } from "zod";

const ROLE_OPTIONS: Array<{ value: string; label: string; template: string }> = [
  { value: "admin",     label: "Administrator",  template: "role-invitation" },
  { value: "coach",     label: "Coach",          template: "role-invitation" },
  { value: "sales_rep", label: "Sales Rep",      template: "role-invitation" },
  { value: "broker",    label: "Broker",         template: "role-invitation" },
  { value: "cs_rep",    label: "Customer Success", template: "role-invitation" },
  { value: "finance",   label: "Finance",        template: "role-invitation" },
  { value: "viewer",    label: "Viewer (read-only)", template: "role-invitation" },
  { value: "client",    label: "Client",         template: "role-invitation" },
];

const schema = z.object({
  email: z.string().trim().email("Valid email required").max(255),
  role: z.string().min(1, "Pick a role"),
  message: z.string().max(500).optional(),
});

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onInvited?: () => void;
}

export function InviteMemberDialog({ open, onOpenChange, onInvited }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("coach");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setEmail(""); setRole("coach"); setMessage(""); };

  const handleInvite = async () => {
    const parsed = schema.safeParse({ email, role, message: message || undefined });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    try {
      const tmpl = ROLE_OPTIONS.find(r => r.value === role)?.template;
      const { data, error } = await supabase.functions.invoke("send-admin-invitation", {
        body: { email: parsed.data.email, role, templateName: tmpl, message: parsed.data.message },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Invitation sent to ${parsed.data.email}`);
      reset();
      onOpenChange(false);
      onInvited?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to send invitation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            They'll receive an email with a link to set their password and join the platform.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="invite-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-msg">Personal note (optional)</Label>
            <Textarea
              id="invite-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Quick context they'll see in the invite email…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleInvite} disabled={submitting}>
            {submitting ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
