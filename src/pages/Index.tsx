// TODO: add Plausible or Fathom analytics script here for anonymous visitor
// tracking before signup. These privacy-friendly tools capture referral sources
// and page views for non-authenticated visitors that Supabase cannot track.
// Plausible is $9/mo and takes ~5 minutes to add — drop their <script> tag in
// index.html (or here in a <Helmet>). Should be done before running paid
// marketing so we can attribute traffic from each campaign.
import { useEffect } from "react";
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { trackEvent } from "@/hooks/useAnalytics";
import { ValuePropsSection } from "@/components/landing/ValuePropsSection";
import { HowPaigeWorksSection } from "@/components/landing/HowPaigeWorksSection";
import { WhatPaigeKnowsSection } from "@/components/landing/WhatPaigeKnowsSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import { TrustSecuritySection } from "@/components/landing/TrustSecuritySection";
import { FAQSection } from "@/components/landing/FAQSection";
import { Footer } from "@/components/landing/Footer";
import { IntegrationsSection } from "@/components/landing/IntegrationsSection";
import { SiteBackground } from "@/components/landing/SiteBackground";
import { Reveal } from "@/components/landing/Reveal";

/** Light trim between the dark bands — a faint purple hairline. */
const SectionDivider = () => (
  <div className="max-w-7xl mx-auto px-6">
    <div className="h-px bg-gradient-to-r from-transparent via-[#a855f7]/30 to-transparent" />
  </div>
);

const Index = () => {
  useEffect(() => {
    trackEvent("landing_page_view", "acquisition");
    let firedPricing = false;
    const onScroll = () => {
      if (firedPricing) return;
      const el = document.getElementById("pricing");
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) {
        firedPricing = true;
        trackEvent("pricing_section_view", "acquisition");
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <SiteBackground />
      <Header autoHide />
      <HeroSection />
      <Reveal><ValuePropsSection /></Reveal>
      <SectionDivider />
      <Reveal><HowPaigeWorksSection /></Reveal>
      <SectionDivider />
      <div id="what-paige-knows">
        <Reveal><WhatPaigeKnowsSection /></Reveal>
      </div>
      <SectionDivider />
      <Reveal><PricingSection /></Reveal>
      <SectionDivider />
      <Reveal><IntegrationsSection /></Reveal>
      <SectionDivider />
      <Reveal><TestimonialsSection /></Reveal>
      <SectionDivider />
      <Reveal><TrustSecuritySection /></Reveal>
      <SectionDivider />
      <Reveal><FAQSection /></Reveal>
      <Footer />
    </div>
  );
};

export default Index;
