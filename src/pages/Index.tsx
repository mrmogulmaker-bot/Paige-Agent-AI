import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { Footer } from "@/components/landing/Footer";
import { SiteBackground } from "@/components/landing/SiteBackground";
import { FloatingGraphics } from "@/components/landing/FloatingGraphics";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, BarChart3, Rocket } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <SiteBackground />
      <FloatingGraphics />
      <Header />
      <HeroSection />

      {/* How It Works */}
      <section id="how-it-works" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
              The Protocol
            </Badge>
            <h2 className="text-4xl lg:text-5xl font-bold mb-4">
              Three Steps to{" "}
              <span className="text-accent font-extrabold">Funded</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: MessageSquare,
                step: "01",
                title: "Tell Paige About Your Credit",
                description:
                  "Conversational onboarding — no forms, no friction. Just tell Paige where you are and she builds your profile.",
              },
              {
                icon: BarChart3,
                step: "02",
                title: "Get Your Credit Intelligence Report",
                description:
                  "5-factor FICO breakdown with actionable scores. See exactly what's costing you points and what to fix first.",
              },
              {
                icon: Rocket,
                step: "03",
                title: "Unlock Your Funding Matches",
                description:
                  "Real lender products matched to your profile. See what you qualify for today and what's one move away.",
              },
            ].map((item, i) => (
              <Card
                key={i}
                className="p-8 bg-card border-border hover:border-accent/50 hover:shadow-glow transition-all duration-300 text-center group"
              >
                <div className="w-14 h-14 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-transform">
                  <item.icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <span className="text-xs font-bold text-accent tracking-widest">
                  STEP {item.step}
                </span>
                <h3 className="font-bold text-lg mt-2 mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <FeaturesSection />

      {/* Social Proof / Results */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <Badge className="mb-4 bg-gold/10 text-gold-dark border-gold/20">
              Real Results
            </Badge>
            <h2 className="text-4xl lg:text-5xl font-bold mb-4">
              We Don't Have Next. We Got{" "}
              <span className="text-gold font-extrabold">NOW.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                stat: "$1.2M",
                label: "Raised for Gabon",
                sub: "From credit repair to seven figures in funding",
              },
              {
                stat: "5 AMEX Cards",
                label: "With ONE Inquiry",
                sub: "Lavelle used the protocol — 5 approvals, 1 hard pull",
              },
              {
                stat: "720+",
                label: "Scores in 6 Months",
                sub: "Average member score increase using ACCEL framework",
              },
            ].map((item, i) => (
              <Card
                key={i}
                className="p-8 bg-card border-border hover:border-gold/50 hover:shadow-glow transition-all duration-300 text-center"
              >
                <div className="text-3xl font-bold text-accent mb-1">
                  {item.stat}
                </div>
                <div className="font-semibold text-foreground">{item.label}</div>
                <p className="text-sm text-muted-foreground mt-2">{item.sub}</p>
              </Card>
            ))}
          </div>

          <p className="text-center text-muted-foreground mt-10 text-lg italic">
            "You didn't want money just to pay bills. You wanted your life to
            breathe again."
          </p>
        </div>
      </section>

      {/* Frameworks */}
      <section id="frameworks" className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          {/* ACCEL */}
          <div>
            <div className="text-center mb-10">
              <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
                Personal Credit Repair
              </Badge>
              <h2 className="text-4xl font-bold">
                The{" "}
                <span className="text-accent font-extrabold text-5xl">
                  A.C.C.E.L.
                </span>{" "}
                Framework
              </h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { letter: "A", title: "Analyze", desc: "Comprehensive credit report review" },
                { letter: "C", title: "Challenge", desc: "FCRA-compliant dispute letters" },
                { letter: "C", title: "Clean", desc: "Remove negatives & optimize" },
                { letter: "E", title: "Elevate", desc: "Build positive history" },
                { letter: "L", title: "Lock", desc: "Maintain & unlock funding" },
              ].map((s, i) => (
                <Card
                  key={i}
                  className="p-5 bg-card border-border hover:border-accent/50 hover:shadow-glow transition-all duration-300 text-center group"
                >
                  <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-3 font-bold text-xl text-primary-foreground group-hover:scale-110 transition-transform">
                    {s.letter}
                  </div>
                  <h3 className="font-bold mb-1">{s.title}</h3>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </Card>
              ))}
            </div>
          </div>

          {/* BUILD */}
          <div>
            <div className="text-center mb-10">
              <Badge className="mb-4 bg-fundability-excellent/10 text-fundability-excellent border-fundability-excellent/20">
                Credit Building
              </Badge>
              <h2 className="text-4xl font-bold">
                The{" "}
                <span className="text-fundability-excellent font-extrabold text-5xl">
                  B.U.I.L.D.
                </span>{" "}
                Framework
              </h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { letter: "B", title: "Business", desc: "Form entity & establish identity" },
                { letter: "U", title: "Utilize", desc: "Access Net-30 vendor credit" },
                { letter: "I", title: "Income", desc: "Document revenue streams" },
                { letter: "L", title: "Leverage", desc: "Secure credit cards & LOCs" },
                { letter: "D", title: "Diversify", desc: "Expand mix & increase limits" },
              ].map((s, i) => (
                <Card
                  key={i}
                  className="p-5 bg-card border-border hover:border-fundability-excellent/50 hover:shadow-glow transition-all duration-300 text-center group"
                >
                  <div className="w-12 h-12 bg-gradient-to-r from-fundability-excellent to-fundability-good rounded-full flex items-center justify-center mx-auto mb-3 font-bold text-xl text-primary-foreground group-hover:scale-110 transition-transform">
                    {s.letter}
                  </div>
                  <h3 className="font-bold mb-1">{s.title}</h3>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
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
