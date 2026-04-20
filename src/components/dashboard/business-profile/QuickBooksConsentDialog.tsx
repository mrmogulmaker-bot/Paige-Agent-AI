import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ShieldCheck, X, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId?: string | null;
}

const ALLOWED = [
  "Your Profit and Loss report — to calculate your margins and revenue trends",
  "Your Balance Sheet — to assess cash position and runway",
  "Recent transactions — to identify expense categories and patterns",
  "Payment data — to understand cash flow timing",
];

const FORBIDDEN = [
  "We will never share your financial data with third parties",
  "We will never use your data to train AI models",
  "We will never make payments or changes without your explicit approval",
  "Your QuickBooks credentials are never stored — only secure OAuth tokens",
];

export function QuickBooksConsentDialog({ open, onOpenChange, businessId }: Props) {
  const [agreed, setAgreed] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    if (!agreed) return;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("quickbooks-oauth-initiate", {
        body: { businessId, environment: "sandbox" },
      });
      if (error || !data?.authUrl) throw new Error(error?.message || "Failed to start QuickBooks connection");
      // Redirect top window to Intuit
      window.location.href = data.authUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start connection");
      setConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[#0a1628] text-white border-[#d4a574]/30">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-[#d4a574]">Connect Your QuickBooks</DialogTitle>
          <DialogDescription className="text-white/80 text-base">
            Give Paige access to your real financial data for accurate coaching
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <h3 className="font-semibold text-[#d4a574] mb-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> What PaigeAgent will access
            </h3>
            <ul className="space-y-2">
              {ALLOWED.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-white/90">
                  <span className="text-emerald-400 mt-0.5">✅</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-[#d4a574] mb-2 flex items-center gap-2">
              <X className="w-4 h-4" /> What PaigeAgent will NOT do
            </h3>
            <ul className="space-y-2">
              {FORBIDDEN.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-white/90">
                  <span className="text-red-400 mt-0.5">🚫</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-white/10 pt-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={agreed}
                onCheckedChange={(v) => setAgreed(!!v)}
                className="mt-0.5 border-[#d4a574] data-[state=checked]:bg-[#d4a574] data-[state=checked]:text-[#0a1628]"
              />
              <span className="text-sm text-white/90 leading-relaxed">
                I understand that PaigeAgent will read my QuickBooks financial data to provide personalized
                business coaching. I can disconnect at any time from my Business Profile settings.
              </span>
            </label>
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#d4a574] hover:underline mt-3"
            >
              Privacy Policy <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => onOpenChange(false)} disabled={connecting}>
              Cancel
            </Button>
            <Button
              onClick={handleConnect}
              disabled={!agreed || connecting}
              className="flex-1 bg-[#d4a574] text-[#0a1628] hover:bg-[#d4a574]/90 font-semibold"
            >
              {connecting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting...</> : "Connect QuickBooks"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
