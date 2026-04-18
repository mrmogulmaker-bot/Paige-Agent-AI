// src/components/affiliates/AffiliateApplyForm.tsx
// Reusable application form. Used on the public /affiliates page AND
// inside the staff dashboard for self-application.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  submitAffiliateApplication,
  type RequestedTierKey,
} from "@/lib/affiliates/applications";
import { CheckCircle2, Loader2 } from "lucide-react";

interface Props {
  /** If the applicant is signed in, pass their auth user id so admin can match later. */
  userId?: string | null;
  /** Defaults to "external" — set to "coach"/"admin" for staff self-apply. */
  requestedTier?: RequestedTierKey;
  /** Pre-fill name/email if known (e.g. signed-in user). */
  defaultName?: string;
  defaultEmail?: string;
  onSubmitted?: () => void;
}

export default function AffiliateApplyForm({
  userId,
  requestedTier = "external",
  defaultName = "",
  defaultEmail = "",
  onSubmitted,
}: Props) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    full_name: defaultName,
    email: defaultEmail,
    phone: "",
    website_url: "",
    social_links: "",
    audience_description: "",
    why_join: "",
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) {
      toast({
        title: "Missing info",
        description: "Name and email are required.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await submitAffiliateApplication({
        ...form,
        requested_tier_key: requestedTier,
        user_id: userId ?? null,
      });
      setDone(true);
      toast({
        title: "Application submitted",
        description: "We'll email you once an admin reviews it.",
      });
      onSubmitted?.();
    } catch (err) {
      toast({
        title: "Submission failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-[#d4a574]/40 bg-[#d4a574]/5 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-[#d4a574]" />
        <h3 className="text-lg font-semibold text-[#1a2840]">
          Application received
        </h3>
        <p className="mt-1 text-sm text-[#1a2840]/70">
          We'll review your application and get back to you by email. You'll
          receive your unique referral link upon approval.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="aff-name">Full name *</Label>
          <Input
            id="aff-name"
            value={form.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            required
            disabled={submitting}
          />
        </div>
        <div>
          <Label htmlFor="aff-email">Email *</Label>
          <Input
            id="aff-email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
            disabled={submitting}
          />
        </div>
        <div>
          <Label htmlFor="aff-phone">Phone</Label>
          <Input
            id="aff-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            disabled={submitting}
          />
        </div>
        <div>
          <Label htmlFor="aff-website">Website</Label>
          <Input
            id="aff-website"
            type="url"
            placeholder="https://"
            value={form.website_url}
            onChange={(e) => update("website_url", e.target.value)}
            disabled={submitting}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="aff-social">Social handles / channels</Label>
        <Input
          id="aff-social"
          placeholder="@yourhandle on Instagram, YouTube channel, etc."
          value={form.social_links}
          onChange={(e) => update("social_links", e.target.value)}
          disabled={submitting}
        />
      </div>

      <div>
        <Label htmlFor="aff-audience">Tell us about your audience</Label>
        <Textarea
          id="aff-audience"
          rows={3}
          placeholder="Who do you reach? Size? Niche?"
          value={form.audience_description}
          onChange={(e) => update("audience_description", e.target.value)}
          disabled={submitting}
        />
      </div>

      <div>
        <Label htmlFor="aff-why">Why do you want to promote PaigeAgent?</Label>
        <Textarea
          id="aff-why"
          rows={3}
          value={form.why_join}
          onChange={(e) => update("why_join", e.target.value)}
          disabled={submitting}
        />
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-[#1a2840] text-white hover:bg-[#1a2840]/90 md:w-auto"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
          </>
        ) : (
          "Submit application"
        )}
      </Button>
    </form>
  );
}
