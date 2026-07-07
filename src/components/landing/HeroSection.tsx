import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * Hero — the entry into the site-wide 3D world.
 *
 * No canvas or video of its own: the persistent SiteScene renders behind the
 * whole page, so this section is transparent and simply lays the title card
 * over the live 3D. Only the interactive controls capture pointer events — the
 * empty space lets you reach through and grab the 3D shards behind the copy.
 */
export function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-screen flex items-center">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl space-y-7">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 backdrop-blur-md border border-white/10">
            <span className="flex h-2 w-2 rounded-full bg-[#c084fc] animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/80">
              Meet Paige · Your AI Operating System
            </span>
          </div>

          <h1 className="text-6xl lg:text-8xl font-black text-white leading-[0.9] tracking-[-0.03em] drop-shadow-[0_6px_40px_rgba(0,0,0,0.7)]">
            The Operating<br className="hidden sm:block" /> System for{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-[#c084fc] via-[#a855f7] to-[#7c3aed] drop-shadow-[0_0_50px_rgba(168,85,247,0.6)]">
              Scale.
            </span>
          </h1>

          <p className="text-lg lg:text-xl text-white/80 leading-relaxed max-w-lg drop-shadow-[0_2px_16px_rgba(0,0,0,0.8)]">
            The autonomous operating system for coaches, consultants &amp;
            agencies. White-label the workspace, automate the busywork, run your
            whole roster from one engine.
          </p>

          <div className="flex flex-wrap gap-4 pt-1">
            <Button
              size="lg"
              className="bg-gradient-to-br from-[#a855f7] to-[#7c3aed] text-white hover:from-[#b06bff] hover:to-[#8b40f0] font-bold shadow-[0_10px_40px_rgba(124,58,237,0.5)] hover:scale-105 transition-all border-0"
              onClick={() => navigate("/auth?mode=signup")}
            >
              Start Your Workspace
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="bg-white/5 backdrop-blur-md text-white border-white/20 hover:bg-white/10 hover:text-white"
              onClick={() =>
                document
                  .getElementById("how-paige-works")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              See How It Works
            </Button>
          </div>

          <p className="inline-flex items-center gap-2 text-xs text-white/55 pt-2">
            <Sparkles className="w-3.5 h-3.5 text-[#c084fc]" />
            Grab and drag anything on the page · scroll to fly through
          </p>
        </div>
      </div>
    </section>
  );
}
