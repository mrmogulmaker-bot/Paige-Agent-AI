import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { HeroAgentBoard } from "./HeroAgentBoard";
import paigeLogo from "@/assets/paige-logo-transparent.png";

/**
 * Hero — Operator Command Center direction.
 *
 * B2B-first positioning: Paige is the operating system for coaches,
 * consultants, and agencies. Brand palette locked to black + gold
 * + white. Right column is a live "engine console" — not a consumer gauge.
 */
export function HeroSection() {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1400);
    return () => clearInterval(id);
  }, []);

  const feed = [
    { t: "14:02:11", label: "New client lead · Agency_NYC", tone: "gold" },
    { t: "14:02:12", label: "Workflow automation complete", tone: "muted" },
    { t: "14:02:15", label: "Syncing to team dashboard", tone: "gold" },
    { t: "14:02:19", label: "Task match · 87% confidence", tone: "muted" },
  ];

  return (
    <section className="relative overflow-hidden bg-primary py-24 lg:py-32 min-h-[92vh] flex items-center">
      {/* Background atmospherics — subtle gold glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-[28rem] h-[28rem] bg-gold/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-24 -right-24 w-[32rem] h-[32rem] bg-gold/[0.07] rounded-full blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,hsl(var(--gold)/0.06),transparent_60%)]" />
      </div>
      {/* Fine tech grid — masked to fade at the edges */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.05] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,#000_35%,transparent_78%)]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left — copy */}
          <div className="space-y-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
              <span className="flex h-2 w-2 rounded-full bg-gold animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
                The Operating System for Client Businesses
              </span>
            </div>

            <h1 className="text-6xl lg:text-8xl font-black text-white leading-[0.92] tracking-[-0.03em]">
              The Operating<br className="hidden sm:block" /> System for{" "}
              <span className="relative text-transparent bg-clip-text bg-gradient-to-br from-gold via-gold to-gold-dark drop-shadow-[0_0_34px_hsl(var(--gold)/0.35)]">
                Scale.
              </span>
            </h1>

            <p className="text-xl text-white/70 leading-relaxed max-w-xl">
              Paige is the autonomous intelligence layer for coaches,
              consultants, and agencies. White-label the workspace, automate
              your workflows, and run your entire client roster from one
              engine.
            </p>

            <div className="flex flex-wrap gap-4 pt-2">
              <Button
                size="lg"
                className="bg-gold text-primary hover:bg-gold-dark font-bold shadow-glow-lg hover:scale-105 transition-all"
                onClick={() => navigate("/auth?mode=signup")}
              >
                Start Your Workspace
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent text-white border-white/15 hover:bg-white/5 hover:text-white"
                onClick={() =>
                  document
                    .getElementById("how-paige-works")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                See How It Works
              </Button>
            </div>

            <div className="pt-8 flex items-center gap-8 border-t border-white/10">
              <div>
                <div className="text-2xl font-bold text-white tabular-nums">
                  50K+
                </div>
                <div className="text-xs text-white/75 uppercase tracking-widest">
                  Tasks Automated
                </div>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div>
                <div className="text-2xl font-bold text-white tabular-nums">
                  18
                </div>
                <div className="text-xs text-white/75 uppercase tracking-widest">
                  Sub-Agents Live
                </div>
              </div>
              <div className="w-px h-10 bg-white/10 hidden sm:block" />
              <div className="hidden sm:block">
                <div className="text-2xl font-bold text-white tabular-nums">
                  360°
                </div>
                <div className="text-xs text-white/75 uppercase tracking-widest">
                  Intelligence
                </div>
              </div>
            </div>

            <p className="text-[11px] text-white/70 pt-2">
              The Command Center for coaches, consultants, and
              agencies ·{" "}
              <span className="text-gold">From Solo to Scaled</span>
            </p>
          </div>

          {/* Right — engine console */}
          <div
            className="relative animate-fade-in"
            style={{ animationDelay: "0.15s" }}
          >
            <div className="relative z-10 bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-7 shadow-2xl">
              {/* Console chrome */}
              <div className="flex items-center justify-between mb-7">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                </div>
                <div className="text-[10px] text-white/70 font-mono tracking-tight uppercase">
                  paige_os // core_engine
                </div>
              </div>

              {/* KPI grid */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-4 rounded-2xl bg-gold/[0.06] border border-gold/20">
                  <div className="text-[10px] text-gold font-bold uppercase tracking-widest mb-1">
                    Automation
                  </div>
                  <div className="text-2xl font-bold text-white tabular-nums">
                    98.4%
                  </div>
                  <div className="mt-2 w-full h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-gold to-gold-dark w-[98%] shadow-[0_0_12px_hsl(var(--gold)/0.5)]" />
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                  <div className="text-[10px] text-white/75 font-bold uppercase tracking-widest mb-1">
                    Roster Active
                  </div>
                  <div className="text-2xl font-bold text-white tabular-nums">
                    1,402
                  </div>
                  <div className="flex gap-1 mt-2 items-end h-4">
                    {[40, 60, 45, 80, 55, 70, 90].map((h, i) => (
                      <div
                        key={i}
                        className="w-1 bg-gold/40 rounded-full"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Live agent board — Paige orchestrating the system in real time */}
              <div className="relative h-64 w-full bg-black/40 rounded-2xl border border-white/5 overflow-hidden mb-5">
                <HeroAgentBoard />
                {/* Paige at the center of the system */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <img
                    src={paigeLogo}
                    alt="Paige"
                    className="w-16 h-16 object-contain drop-shadow-[0_0_30px_hsl(var(--gold)/0.6)]"
                  />
                </div>
                <div className="absolute bottom-3 inset-x-0 text-center pointer-events-none">
                  <div className="text-[10px] font-mono text-gold/90 uppercase tracking-widest">
                    Paige · orchestrating live
                  </div>
                </div>
              </div>

              {/* Console feed */}
              <div className="p-4 rounded-xl bg-black/60 border border-white/5 font-mono text-[10px] space-y-1.5">
                {feed.map((row, i) => {
                  const visible = i <= (tick % feed.length);
                  return (
                    <div
                      key={i}
                      className={`flex justify-between gap-3 transition-opacity ${
                        visible ? "opacity-100" : "opacity-30"
                      }`}
                    >
                      <span
                        className={
                          row.tone === "gold"
                            ? "text-gold"
                            : "text-white/70"
                        }
                      >
                        &gt; {row.t}
                      </span>
                      <span
                        className={
                          row.tone === "gold"
                            ? "text-white"
                            : "text-white/75"
                        }
                      >
                        {row.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Floating status — API health */}
            <div className="hidden sm:flex absolute -right-6 top-1/4 bg-card/90 backdrop-blur-md border border-white/10 p-3 rounded-xl shadow-2xl z-20 items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-fundability-excellent/10 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-fundability-excellent animate-pulse" />
              </div>
              <div>
                <div className="text-[10px] text-white/75 font-bold uppercase tracking-wider">
                  API Health
                </div>
                <div className="text-xs text-white font-bold">99.9% Uptime</div>
              </div>
            </div>

            {/* Floating status — queue */}
            <div className="hidden sm:flex absolute -left-8 bottom-1/4 bg-card/90 backdrop-blur-md border border-white/10 p-3 rounded-xl shadow-2xl z-20 items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gold/15 flex items-center justify-center">
                <div className="w-3 h-3 rounded-sm bg-gold rotate-45" />
              </div>
              <div>
                <div className="text-[10px] text-white/75 font-bold uppercase tracking-wider">
                  Queue
                </div>
                <div className="text-xs text-white font-bold">842 Tasks</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
