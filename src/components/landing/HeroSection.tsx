import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Mic } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import paigeAvatar from "@/assets/paige-ai-avatar.png";

const chatLines = [
  { role: "user" as const, text: "Where do I stand for SBA funding?" },
  {
    role: "assistant" as const,
    text: "Your Funding Readiness Score is 62/100. Personal FICO 678, business credit on file with D&B. Lenders see utilization at 68% — that pulls your SBA qualification down by roughly $75K. Pay your highest revolver to 25% utilization and you re-open three additional product matches.",
  },
  { role: "user" as const, text: "What can I qualify for today?" },
  {
    role: "assistant" as const,
    text: "Today: business line of credit up to $40K, equipment financing up to $85K, and revenue-based financing up to 1.2x monthly revenue. SBA 7(a) is one move away — drop utilization below 30% and projected ceiling moves to $135K across 14 lenders.",
  },
];

export function HeroSection() {
  const navigate = useNavigate();
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (visibleLines < chatLines.length) {
      const timer = setTimeout(
        () => setVisibleLines((v) => v + 1),
        visibleLines === 0 ? 1200 : 2200
      );
      return () => clearTimeout(timer);
    }
  }, [visibleLines]);

  return (
    <section className="relative overflow-hidden py-20 lg:py-28">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-background -z-20" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-20 right-1/4 w-72 h-72 bg-accent/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 left-1/4 w-96 h-96 bg-gold/10 rounded-full blur-3xl animate-float-slow" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left */}
          <div className="space-y-8 animate-fade-in">
            <Badge className="bg-gold/10 text-gold-dark border-gold/20">
              Built by Mr. Mogul Maker
            </Badge>

            <h1 className="text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
              Know What Lenders See.{" "}
              <span className="text-accent">Get Funded Faster.</span>
            </h1>

            <p className="text-xl text-muted-foreground leading-relaxed max-w-lg">
              Paige is your AI-powered funding intelligence platform. She
              translates your personal and business credit into the funding
              products you qualify for today — and what's one move away.
            </p>

            {/* Social proof stats */}
            <div className="grid grid-cols-3 gap-6 py-4 border-t border-border">
              <div>
                <div className="text-2xl font-bold text-foreground">$1.2M+</div>
                <div className="text-xs text-muted-foreground">Funding Raised</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">720+</div>
                <div className="text-xs text-muted-foreground">Avg Score in 6mo</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">89%</div>
                <div className="text-xs text-muted-foreground">Success Rate</div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="bg-gradient-gold text-primary hover:shadow-glow-lg hover:scale-105 transition-all duration-300 font-bold"
                onClick={() => navigate("/auth?mode=signup")}
              >
                Get Funding-Ready — Free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="group hover:scale-105 transition-all duration-300"
                onClick={() => {
                  document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                See How It Works
              </Button>
            </div>
          </div>

          {/* Right — animated chat demo */}
          <div className="relative animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
              {/* Chat header */}
              <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-primary/5">
                <img
                  src={paigeAvatar}
                  alt="Paige AI"
                  className="w-8 h-8 rounded-full border-2 border-accent"
                />
                <div>
                  <div className="font-bold text-sm text-foreground">PaigeAgent.ai</div>
                  <div className="text-[11px] text-muted-foreground">
                    Your funding intelligence analyst
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-fundability-excellent animate-pulse" />
                  <span className="text-[10px] text-muted-foreground">Online</span>
                </div>
              </div>

              {/* Chat body */}
              <div className="p-4 space-y-3 min-h-[280px]">
                {chatLines.slice(0, visibleLines).map((line, i) => (
                  <div
                    key={i}
                    className={`flex gap-2.5 animate-slide-up ${
                      line.role === "user" ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    {line.role === "assistant" && (
                      <img
                        src={paigeAvatar}
                        alt="Paige"
                        className="w-7 h-7 rounded-full border border-accent flex-shrink-0 mt-0.5"
                      />
                    )}
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                        line.role === "user"
                          ? "bg-accent text-accent-foreground"
                          : "bg-muted/40 border border-border text-foreground"
                      }`}
                    >
                      {line.text}
                    </div>
                  </div>
                ))}
                {visibleLines < chatLines.length && (
                  <div className="flex gap-2.5">
                    <img
                      src={paigeAvatar}
                      alt="Paige"
                      className="w-7 h-7 rounded-full border border-accent flex-shrink-0"
                    />
                    <div className="bg-muted/40 border border-border rounded-lg px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                        <div className="w-2 h-2 bg-accent rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                        <div className="w-2 h-2 bg-accent rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat input mock */}
              <div className="px-4 py-3 border-t border-border flex items-center gap-2">
                <div className="flex-1 h-9 rounded-md bg-muted/30 border border-border px-3 flex items-center text-sm text-muted-foreground">
                  Ask Paige anything...
                </div>
                <div className="w-9 h-9 rounded-md bg-gradient-gold flex items-center justify-center">
                  <Mic className="w-4 h-4 text-primary" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
