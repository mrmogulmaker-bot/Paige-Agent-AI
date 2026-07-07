import { motion, useMotionValue, useTransform } from "framer-motion";
import type { MouseEvent } from "react";

/**
 * PaigePremiumFigure — the vibrant Paige art given a premium, dimensional
 * treatment: a glowing purple aura, continuous float, and a cursor-tilt
 * parallax where Paige and her bot sit at different depths. Uses the original
 * illustrations (which carry the real brand color scheme), so it *pops* — no
 * flat, untextured 3D. Swap-ready for textured 3D / Spline later.
 */
export default function PaigePremiumFigure() {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const rotateY = useTransform(mx, [-0.5, 0.5], [12, -12]);
  const rotateX = useTransform(my, [-0.5, 0.5], [-9, 9]);
  const charX = useTransform(mx, [-0.5, 0.5], [-16, 16]);
  const charY = useTransform(my, [-0.5, 0.5], [-10, 10]);
  const botX = useTransform(mx, [-0.5, 0.5], [-38, 38]);
  const botY = useTransform(my, [-0.5, 0.5], [-26, 26]);

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const reset = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={reset}
      className="relative h-full w-full [perspective:1100px]"
    >
      {/* Aura */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#a855f7]/25 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-6 left-1/2 h-8 w-64 -translate-x-1/2 rounded-[50%] bg-black/50 blur-2xl" />

      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative h-full w-full"
      >
        {/* Paige */}
        <motion.div style={{ x: charX, y: charY }} className="absolute bottom-0 left-1/2 -translate-x-1/2">
          <motion.img
            src="/paige/paige-wave.png"
            alt="Paige"
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="h-[24rem] w-auto object-contain drop-shadow-[0_28px_60px_rgba(124,58,237,0.55)] lg:h-[30rem]"
          />
        </motion.div>

        {/* Bot companion */}
        <motion.div style={{ x: botX, y: botY }} className="absolute right-2 top-6 sm:right-10">
          <motion.img
            src="/paige/paige-bot-1.png"
            alt="Paige bot"
            animate={{ y: [0, -16, 0], rotate: [-4, 4, -4] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="h-24 w-24 object-contain drop-shadow-[0_0_34px_rgba(168,85,247,0.75)] sm:h-28 sm:w-28"
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
