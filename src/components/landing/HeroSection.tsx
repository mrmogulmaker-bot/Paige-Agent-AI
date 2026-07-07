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
        <div className="max-w-xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 backdrop-blur-md border border-white/10">
            <span className="flex h-2 w-2 rounded-full bg-[#c084fc] animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/80">
              The AI Operating System
            </span>
          </div>

          <h1 className="text-7xl lg:text-9xl font-black text-white leading-[0.85] tracking-[-0.04em] drop-shadow-[0_6px_40px_rgba(0,0,0,0.8)]">
            Meet{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-[#c084fc] via-[#a855f7] to-[#7c3aed] drop-shadow-[0_0_60px_rgba(168,85,247,0.7)]">
              Paige.
            </span>
          </h1>

          <p className="text-xl lg:text-2xl text-white/85 font-medium leading-snug max-w-md drop-shadow-[0_2px_16px_rgba(0,0,0,0.85)]">
            She runs your clients, your workflows, your whole operation —
            autonomously.
          </p>

          <div className="flex flex-wrap gap-4 pt-2">
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
            Click Paige to say hi · drag her panels · scroll to explore
          </p>
        </div>
      </div>
    </section>
  );
}
