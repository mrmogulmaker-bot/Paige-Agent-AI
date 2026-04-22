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
import { FAQSection } from "@/components/landing/FAQSection";
import { Footer } from "@/components/landing/Footer";
import { SiteBackground } from "@/components/landing/SiteBackground";

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
    <div className="min-h-screen bg-background">
      <SiteBackground />
      <Header />
      <HeroSection />
      <ValuePropsSection />
      <HowPaigeWorksSection />
      <div id="what-paige-knows">
        <WhatPaigeKnowsSection />
      </div>
      <PricingSection />
      <TestimonialsSection />
      <FAQSection />
      <Footer />
    </div>
  );
};

export default Index;
