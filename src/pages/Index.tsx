import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { Footer } from "@/components/landing/Footer";
import { SiteBackground } from "@/components/landing/SiteBackground";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const Index = () => {
  const accelSteps = [
    { letter: "A", title: "Analyze", description: "Comprehensive credit report review across all bureaus" },
    { letter: "C", title: "Challenge", description: "Dispute inaccuracies with FCRA-compliant letters" },
    { letter: "C", title: "Clean", description: "Remove negative items and optimize accounts" },
    { letter: "E", title: "Elevate", description: "Build positive credit history strategically" },
    { letter: "L", title: "Lock", description: "Maintain fundability and unlock opportunities" },
  ];

  const buildSteps = [
    { letter: "B", title: "Business", description: "Form legal entity and establish identity" },
    { letter: "U", title: "Utilize", description: "Access Net-30 vendor credit lines" },
    { letter: "I", title: "Income", description: "Document and verify revenue streams" },
    { letter: "L", title: "Leverage", description: "Secure business credit cards and LOCs" },
    { letter: "D", title: "Diversify", description: "Expand credit mix and increase limits" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SiteBackground />
      <Header />
      <HeroSection />
      <FeaturesSection />

      {/* Frameworks Section */}
      <section id="frameworks" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">
          {/* A.C.C.E.L. Framework */}
          <div>
            <div className="text-center mb-12">
              <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
                Personal Credit Repair
              </Badge>
              <h2 className="text-4xl lg:text-5xl font-bold mb-4">
                The{" "}
                <span className="bg-gradient-hero bg-clip-text text-transparent">
                  A.C.C.E.L.
                </span>{" "}
                Framework
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Your systematic path to credit repair and score optimization
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {accelSteps.map((step, index) => (
                <Card
                  key={index}
                  className="p-6 bg-card border-border hover:border-accent/50 hover:shadow-glow transition-all duration-300 text-center group"
                >
                  <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-2xl text-primary-foreground group-hover:scale-110 transition-transform">
                    {step.letter}
                  </div>
                  <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </Card>
              ))}
            </div>
          </div>

          {/* B.U.I.L.D. Framework */}
          <div>
            <div className="text-center mb-12">
              <Badge className="mb-4 bg-success/10 text-success border-success/20">
                Business Credit Building
              </Badge>
              <h2 className="text-4xl lg:text-5xl font-bold mb-4">
                The{" "}
                <span className="bg-gradient-hero bg-clip-text text-transparent">
                  B.U.I.L.D.
                </span>{" "}
                Framework
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Build business credit and unlock funding opportunities
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {buildSteps.map((step, index) => (
                <Card
                  key={index}
                  className="p-6 bg-card border-border hover:border-success/50 hover:shadow-glow transition-all duration-300 text-center group"
                >
                  <div className="w-16 h-16 bg-gradient-to-r from-success to-success-light rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-2xl text-white group-hover:scale-110 transition-transform">
                    {step.letter}
                  </div>
                  <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <PricingSection />
      <Footer />
    </div>
  );
};

export default Index;
