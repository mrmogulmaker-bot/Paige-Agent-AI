// TODO: add Plausible or Fathom analytics script here for anonymous visitor
// tracking before signup. These privacy-friendly tools capture referral sources
// and page views for non-authenticated visitors that Supabase cannot track.
// Plausible is $9/mo and takes ~5 minutes to add — drop their <script> tag in
// index.html (or here in a <Helmet>). Should be done before running paid
// marketing so we can attribute traffic from each campaign.
import { Suspense, lazy, useEffect, useState } from "react";
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
import { supportsWebGL, prefersReducedMotion } from "@/lib/webgl";

// Persistent full-page 3D world (code-split so it never blocks first paint).
const SiteScene = lazy(() => import("@/components/landing/three/SiteScene"));

/** Light trim between the dark bands — a faint purple hairline. */
const SectionDivider = () => (
  <div className="max-w-7xl mx-auto px-6">
    <div className="h-px bg-gradient-to-r from-transparent via-[#a855f7]/30 to-transparent" />
  </div>
);

// When the 3D world is on, the page content floats over it: sections go
// transparent and pointer events pass through empty space to the canvas so the
// shards stay grabbable behind the copy. Interactive elements opt back in.
const THREE_D_STYLE = `
  .paige-3d section { background-color: transparent !important; }
  .paige-3d .paige-content { pointer-events: none; }
  .paige-3d .paige-content a,
  .paige-3d .paige-content button,
  .paige-3d .paige-content input,
  .paige-3d .paige-content textarea,
  .paige-3d .paige-content select,
  .paige-3d .paige-content label,
  .paige-3d .paige-content [role="button"],
  .paige-3d .paige-content [role="tab"],
  .paige-3d .paige-content summary { pointer-events: auto; }
`;

const Index = () => {
  const [use3D, setUse3D] = useState(false);

  useEffect(() => {
    setUse3D(supportsWebGL() && !prefersReducedMotion());
  }, []);

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
    <div
      className={`dark min-h-screen text-foreground ${
        use3D ? "bg-transparent paige-3d" : "bg-background"
      }`}
    >
      {use3D ? (
        <>
          <style>{THREE_D_STYLE}</style>
          <Suspense fallback={<div className="fixed inset-0 -z-10 bg-background" />}>
            <SiteScene />
          </Suspense>
        </>
      ) : (
        <SiteBackground />
      )}

      {/* Content floats over the 3D world; empty space lets pointer events
          reach the canvas so the shards stay grabbable behind the copy. */}
      <div className="paige-content relative z-10">
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
    </div>
  );
};

export default Index;
