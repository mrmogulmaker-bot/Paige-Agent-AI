// src/components/affiliates/InviteAffiliateDialog.tsx
// Admin-only dialog. Pre-creates the affiliate account, generates a referral
// code, and emails the invitee a branded welcome with their unique link.
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Copy, Check, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Tier = "external" | "coach" | "admin";

interface InviteResult {
  affiliate_id: string;
  referral_code: string;
  referral_link: string;
  email_sent: boolean;
}

export default function InviteAffiliateDialog({ onInvited }: { onInvited?: () => void }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<Tier>("external");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const reset = () => {
    setFullName(""); setEmail(""); setTier("external");
    setResult(null); setCopied(false); setSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-affiliate", {
        body: { full_name: fullName.trim(), email: email.trim(), tier_key: tier },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult(data as InviteResult);
      toast({
        title: "Affiliate enrolled",
        description: data.email_sent
          ? "Welcome email sent with their referral link."
          : "Account created — couldn't send email automatically. Share the link manually.",
      });
      onInvited?.();
    } catch (err) {
      toast({
        title: "Couldn't invite affiliate",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.referral_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button className="bg-[#CFAE70] text-[#0a1628] hover:bg-[#CFAE70]/90">
          <UserPlus className="h-4 w-4 mr-2" />
          Invite affiliate
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a new affiliate</DialogTitle>
          <DialogDescription>
            Creates their account, generates a unique referral link, and emails them a welcome.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="aff-name">Full name</Label>
              <Input id="aff-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aff-email">Email</Label>
              <Input id="aff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aff-tier">Commission tier</Label>
              <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
                <SelectTrigger id="aff-tier"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="external">External (standard rate)</SelectItem>
                  <SelectItem value="coach">Coach (elevated rate)</SelectItem>
                  <SelectItem value="admin">Admin (top rate)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-[#0a1628] text-white hover:bg-[#0a1628]/90">
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enroll & send email
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md bg-muted p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Referral code</div>
              <div className="font-mono text-lg font-semibold text-[#0a1628]">{result.referral_code}</div>
            </div>
            <div className="rounded-md bg-muted p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Referral link</div>
              <div className="flex items-center gap-2">
                <div className="font-mono text-xs text-[#0a1628] break-all flex-1">{result.referral_link}</div>
                <Button size="sm" variant="outline" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {result.email_sent
                ? "Welcome email delivered to the invitee."
                : "Email could not be sent — copy the link above and share it manually."}
            </p>
            <DialogFooter>
              <Button onClick={() => setOpen(false)} className="bg-[#0a1628] text-white hover:bg-[#0a1628]/90">
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
