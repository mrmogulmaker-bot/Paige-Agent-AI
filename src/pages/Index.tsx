import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { ValuePropsSection } from "@/components/landing/ValuePropsSection";
import { HowPaigeWorksSection } from "@/components/landing/HowPaigeWorksSection";
import { WhatPaigeKnowsSection } from "@/components/landing/WhatPaigeKnowsSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { Footer } from "@/components/landing/Footer";
import { SiteBackground } from "@/components/landing/SiteBackground";

const Index = () => {
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
