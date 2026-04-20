import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, CheckCircle } from "lucide-react";

interface EliteWaitlistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EliteWaitlistDialog({
  open,
  onOpenChange,
}: EliteWaitlistDialogProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    phone: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("elite_waitlist").insert({
      email: form.email.trim().toLowerCase(),
      full_name: form.full_name.trim() || null,
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
      source: "pricing_page",
    });
    setSubmitting(false);

    if (error) {
      toast({
        title: "Could not join waitlist",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setSuccess(true);
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      // Reset on close
      setTimeout(() => {
        setSuccess(false);
        setForm({ email: "", full_name: "", phone: "", notes: "" });
      }, 200);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {success ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-fundability-excellent/10 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-fundability-excellent" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-center text-2xl">
                You're on the list
              </DialogTitle>
              <DialogDescription className="text-center text-base pt-2">
                Our team will reach out within 48 hours to discuss Paige Elite
                access and schedule your strategy session.
              </DialogDescription>
            </DialogHeader>
            <Button
              onClick={() => handleClose(false)}
              className="bg-gradient-gold text-primary font-bold"
            >
              Close
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-gold" />
                <span className="text-xs font-bold uppercase tracking-widest text-gold-dark">
                  Paige Elite — Limited Spots
                </span>
              </div>
              <DialogTitle className="text-2xl">
                Join the Elite Waitlist
              </DialogTitle>
              <DialogDescription className="pt-1">
                Done-with-you funding support for serious wealth builders.
                We'll review your application and reach out within 48 hours.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="ew-email">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="ew-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ew-name">Full name</Label>
                <Input
                  id="ew-name"
                  value={form.full_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, full_name: e.target.value }))
                  }
                  placeholder="Jane Smith"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ew-phone">Phone (optional)</Label>
                <Input
                  id="ew-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  placeholder="(555) 123-4567"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ew-notes">
                  What is your funding goal? (optional)
                </Label>
                <Textarea
                  id="ew-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="e.g. SBA 7(a) for acquisition, real estate portfolio, scale current business..."
                />
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-gold text-primary font-bold hover:shadow-glow-lg"
              >
                {submitting ? "Submitting..." : "Apply for Access"}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
