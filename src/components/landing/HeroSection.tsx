import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, TrendingUp, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

/**
 * Hero — "Your Personal AI Funding Advisor"
 * Right column = floating data visualization (animated 3-bureau credit gauge
 * + lender match cards) instead of a static chat mock.
 */
export function HeroSection() {
  const navigate = useNavigate();

  // Animated score that ticks up on mount (premium "alive" feel)
  const targets = { exp: 712, tu: 698, eq: 705 };
  const [scores, setScores] = useState({ exp: 0, tu: 0, eq: 0 });

  useEffect(() => {
    const start = performance.now();
    const duration = 1600;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      setScores({
        exp: Math.round(targets.exp * ease),
        tu: Math.round(targets.tu * ease),
        eq: Math.round(targets.eq * ease),
      });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bureaus = [
    { name: "Experian", short: "EXP", value: scores.exp, target: targets.exp, color: "from-accent to-gold" },
    { name: "TransUnion", short: "TU", value: scores.tu, target: targets.tu, color: "from-gold to-accent" },
    { name: "Equifax", short: "EQ", value: scores.eq, target: targets.eq, color: "from-accent to-gold-dark" },
  ];

  return (
    <section className="relative overflow-hidden py-20 lg:py-28">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-background -z-20" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-20 right-1/4 w-72 h-72 bg-accent/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 left-1/4 w-96 h-96 bg-gold/10 rounded-full blur-3xl animate-float-slow" />
        {/* Soft animated gold pulse behind the headline */}
        <div className="absolute top-1/3 left-1/3 w-[40rem] h-[40rem] -translate-x-1/2 -translate-y-1/2 bg-gold/10 rounded-full blur-3xl animate-pulse" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — copy */}
          <div className="space-y-7 animate-fade-in">
            <Badge className="bg-gold/10 text-gold-dark border-gold/20">
              <Sparkles className="w-3 h-3 mr-1.5" />
              The Entrepreneurial Operating System
            </Badge>

            <h1 className="text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
              Built for Entrepreneurs Who{" "}
              <span className="text-accent">Move Differently.</span>
            </h1>

            <p className="text-2xl text-foreground/90 font-medium leading-snug">
              Your AI-powered business growth infrastructure.
            </p>

            <p className="text-lg text-muted-foreground leading-relaxed max-w-lg">
              More than an assistant. Paige is an intelligent ecosystem — a 24/7
              advisor, strategist, and operator that turns your credit,
              capital, and execution into one connected growth engine. Guidance.
              Strategy. Execution. Scale.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="bg-gradient-gold text-primary hover:shadow-glow-lg hover:scale-105 transition-all duration-300 font-bold"
                onClick={() => navigate("/auth?mode=signup")}
              >
                Enter the Ecosystem
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="hover:scale-105 transition-all duration-300"
                onClick={() => {
                  document
                    .getElementById("how-paige-works")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                See How It Works
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              7-day trial · No card required · Built for serious operators
            </p>
          </div>

          {/* Right — animated data viz */}
          <div className="relative animate-fade-in" style={{ animationDelay: "0.2s" }}>
            {/* Floating card 1 — 3-bureau intelligence */}
            <div className="relative bg-card border border-border rounded-2xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center gap-3 bg-primary/5">
                <div className="w-9 h-9 rounded-full bg-gradient-gold flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="font-bold text-sm text-foreground">
                    Three-Bureau Intelligence
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Updated 2 minutes ago · Live
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-fundability-excellent animate-pulse" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Synced
                  </span>
                </div>
              </div>

              {/* Bureau gauges */}
              <div className="p-5 space-y-4">
                {bureaus.map((b, i) => {
                  const pct = Math.min(100, (b.value / 850) * 100);
                  return (
                    <div key={b.name} className="space-y-1.5">
                      <div className="flex items-baseline justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold tracking-widest text-muted-foreground">
                            {b.short}
                          </span>
                          <span className="text-xs font-semibold text-foreground">
                            {b.name}
                          </span>
                        </div>
                        <div className="font-bold text-lg text-foreground tabular-nums">
                          {b.value}
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${b.color} rounded-full transition-all duration-1000`}
                          style={{
                            width: `${pct}%`,
                            transitionDelay: `${i * 120}ms`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}

                <div className="pt-3 mt-3 border-t border-border grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-xl font-bold text-accent tabular-nums">
                      87
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Readiness
                    </div>
                  </div>
                  <div className="text-center border-x border-border">
                    <div className="text-xl font-bold text-foreground tabular-nums">
                      $185K
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Pre-Qual
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-fundability-excellent tabular-nums">
                      14
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Lenders
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating card 2 — lender match (offset) */}
            <div
              className="hidden sm:block absolute -bottom-8 -left-6 bg-card border border-accent/30 rounded-xl shadow-glow p-4 w-64 animate-float-slow"
              style={{ animationDelay: "0.4s" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-fundability-excellent animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-fundability-excellent">
                  Match Found
                </span>
              </div>
              <div className="text-sm font-bold text-foreground">
                SBA 7(a) — Live Oak Bank
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Pulls Experian · 87% match
              </div>
              <div className="mt-2 text-xs font-semibold text-accent">
                Up to $135,000
              </div>
            </div>

            {/* Floating card 3 — rate (offset) */}
            <div
              className="hidden sm:block absolute -top-6 -right-4 bg-card border border-gold/30 rounded-xl shadow-glow p-3 w-48 animate-float"
              style={{ animationDelay: "0.6s" }}
            >
              <div className="text-[10px] font-bold uppercase tracking-widest text-gold-dark">
                Live Prime Rate
              </div>
              <div className="text-xl font-bold text-foreground mt-0.5 tabular-nums">
                7.50%
              </div>
              <div className="text-[10px] text-muted-foreground">
                Federal Reserve · Today
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
