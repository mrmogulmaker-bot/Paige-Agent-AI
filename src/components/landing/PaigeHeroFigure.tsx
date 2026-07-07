import { useState } from "react";

/**
 * PaigeHeroFigure — the animated character centerpiece for the landing hero.
 *
 * Paige (human, arms-crossed) stands on a soft purple glow with a gentle idle
 * float; her bot companion hovers and bobs beside her. Both are clickable:
 * clicking Paige toggles her wave; clicking the bot pops a greeting. Uses the
 * transparent character cutouts in /public/paige.
 */
export function PaigeHeroFigure() {
  const [waving, setWaving] = useState(false);
  const [botHi, setBotHi] = useState(false);

  return (
    <div className="relative flex items-end justify-center h-full min-h-[540px] select-none">
      {/* Purple ambient glow + ground shadow */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-[#7c3aed]/30 blur-[100px]" />
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-60 h-5 rounded-[50%] bg-black/45 blur-md" />

      {/* Paige — click to wave */}
      <img
        src={waving ? "/paige/paige-wave.png" : "/paige/paige-arms.png"}
        alt="Paige — your AI teammate"
        onClick={() => setWaving((w) => !w)}
        title={waving ? "" : "Say hi to Paige"}
        className="relative z-10 h-[94%] max-h-[580px] w-auto object-contain cursor-pointer drop-shadow-[0_24px_48px_rgba(124,58,237,0.4)]"
        style={{ animation: "paigeFloat 6s ease-in-out infinite" }}
      />

      {/* Bot companion — click to greet */}
      <button
        type="button"
        onClick={() => setBotHi((s) => !s)}
        aria-label="Say hi to the Paige bot"
        className="absolute z-20 top-4 right-2 sm:right-8"
      >
        <img
          src="/paige/paige-bot-1.png"
          alt="Paige bot"
          className="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-[0_0_28px_rgba(124,58,237,0.65)]"
          style={{ animation: "botBob 4s ease-in-out infinite" }}
        />
      </button>

      {/* Bot speech bubble */}
      {botHi && (
        <div className="absolute z-30 top-6 right-28 sm:right-36 max-w-[180px] rounded-2xl rounded-tr-sm bg-white text-[#1e1b2e] px-3.5 py-2 text-sm font-medium shadow-xl animate-fade-in">
          Hi! I'm Paige 👋 I'll run your whole operation.
        </div>
      )}

      <style>{`
        @keyframes paigeFloat { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-10px) } }
        @keyframes botBob { 0%,100%{ transform: translateY(0) rotate(-3deg) } 50%{ transform: translateY(-14px) rotate(3deg) } }
      `}</style>
    </div>
  );
}
