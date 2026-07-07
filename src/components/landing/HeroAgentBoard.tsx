import { useEffect, useRef } from "react";

/**
 * HeroAgentBoard — a real-time canvas visualization of Paige working.
 *
 * Autonomous "agents" (glowing gold orbs) pathfind across a network/maze of
 * task nodes, leaving light trails and lighting up each node as they complete
 * it, while the board itself gently rearranges. Conveys an AI agent moving
 * through and orchestrating a live system — rendered in real time (no video).
 *
 * Self-contained, DPR-capped, pauses offscreen, honors prefers-reduced-motion,
 * and pointer-events-none so it never blocks the UI.
 */
type Node = { x: number; y: number; tx: number; ty: number; nbrs: number[]; glow: number; drift: number };
type Agent = { from: number; to: number; t: number; speed: number; trail: { x: number; y: number }[] };

const GOLD = "207, 174, 112";

export function HeroAgentBoard({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let W = 0, H = 0;
    const nodes: Node[] = [];
    const agents: Agent[] = [];

    // Deterministic-ish PRNG so layout is stable per mount.
    let seed = 20300707;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    const build = () => {
      nodes.length = 0; agents.length = 0;
      // Nodes on a jittered grid within the canvas.
      const cols = 5, rows = 6;
      const padX = W * 0.12, padY = H * 0.1;
      const gx = (W - padX * 2) / (cols - 1), gy = (H - padY * 2) / (rows - 1);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rnd() < 0.22) continue; // sparse — a maze, not a full grid
          const jx = (rnd() - 0.5) * gx * 0.5, jy = (rnd() - 0.5) * gy * 0.5;
          const x = padX + c * gx + jx, y = padY + r * gy + jy;
          nodes.push({ x, y, tx: x, ty: y, nbrs: [], glow: 0, drift: rnd() * Math.PI * 2 });
        }
      }
      // Connect each node to its 2–3 nearest neighbors (the maze paths).
      nodes.forEach((n, i) => {
        const d = nodes.map((m, j) => ({ j, dist: (m.x - n.x) ** 2 + (m.y - n.y) ** 2 }))
          .filter((o) => o.j !== i).sort((a, b) => a.dist - b.dist);
        const k = 2 + (rnd() < 0.5 ? 1 : 0);
        d.slice(0, k).forEach((o) => { if (!n.nbrs.includes(o.j)) n.nbrs.push(o.j); if (!nodes[o.j].nbrs.includes(i)) nodes[o.j].nbrs.push(i); });
      });
      // Spawn 2 agents on random nodes.
      const spawn = () => {
        const from = Math.floor(rnd() * nodes.length);
        const to = nodes[from].nbrs[Math.floor(rnd() * nodes[from].nbrs.length)] ?? from;
        agents.push({ from, to, t: 0, speed: 0.006 + rnd() * 0.006, trail: [] });
      };
      spawn(); spawn();
    };

    const resize = () => {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);

    let visible = true;
    const io = new IntersectionObserver((e) => { visible = e[0]?.isIntersecting ?? true; }, { threshold: 0.01 });
    io.observe(canvas);

    const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    let raf = 0, frame = 0;
    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, W, H);

      // Occasional board rearrangement — pick a node, give it a new target.
      if (!reduce && frame % 140 === 0 && nodes.length) {
        const n = nodes[Math.floor(rnd() * nodes.length)];
        n.tx = Math.max(W * 0.08, Math.min(W * 0.92, n.x + (rnd() - 0.5) * W * 0.14));
        n.ty = Math.max(H * 0.08, Math.min(H * 0.92, n.y + (rnd() - 0.5) * H * 0.14));
      }

      // Edges.
      ctx.lineWidth = 1;
      nodes.forEach((n, i) => {
        n.x += (n.tx - n.x) * 0.02; n.y += (n.ty - n.y) * 0.02;
        n.drift += 0.01;
        n.nbrs.forEach((j) => {
          if (j > i) {
            const m = nodes[j];
            const lit = Math.max(n.glow, m.glow);
            ctx.strokeStyle = `rgba(255,255,255,${0.04 + lit * 0.12})`;
            ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(m.x, m.y); ctx.stroke();
          }
        });
      });

      // Nodes.
      nodes.forEach((n) => {
        n.glow *= 0.94;
        const base = 2.2 + Math.sin(n.drift) * 0.5;
        // activation ring
        if (n.glow > 0.05) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, base + (1 - n.glow) * 16, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${GOLD},${n.glow * 0.5})`;
          ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(n.x, n.y, base, 0, Math.PI * 2);
        ctx.fillStyle = n.glow > 0.05 ? `rgba(${GOLD},${0.5 + n.glow * 0.5})` : "rgba(255,255,255,0.25)";
        ctx.shadowBlur = n.glow > 0.05 ? 12 * n.glow : 0;
        ctx.shadowColor = `rgba(${GOLD},0.8)`;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Agents.
      agents.forEach((a) => {
        if (!reduce) a.t += a.speed;
        const from = nodes[a.from], to = nodes[a.to];
        if (!from || !to) { a.from = 0; a.to = nodes[0]?.nbrs[0] ?? 0; a.t = 0; return; }
        const e = easeInOut(Math.min(a.t, 1));
        const x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e;

        a.trail.push({ x, y });
        if (a.trail.length > 22) a.trail.shift();
        // trail
        for (let k = 1; k < a.trail.length; k++) {
          const p = a.trail[k - 1], q = a.trail[k];
          ctx.strokeStyle = `rgba(${GOLD},${(k / a.trail.length) * 0.5})`;
          ctx.lineWidth = (k / a.trail.length) * 2.4;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
        // agent head
        ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${GOLD},1)`;
        ctx.shadowBlur = 16; ctx.shadowColor = `rgba(${GOLD},1)`; ctx.fill(); ctx.shadowBlur = 0;

        if (a.t >= 1) { // arrived — light up node, choose next path
          to.glow = 1;
          a.from = a.to;
          const nb = to.nbrs;
          a.to = nb.length ? nb[Math.floor(rnd() * nb.length)] : a.from;
          a.t = 0; a.trail = [];
        }
      });

      if (visible && !reduce) raf = requestAnimationFrame(draw);
    };

    if (reduce) draw();
    else {
      const loop = () => { if (visible) draw(); else raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }

    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={`h-full w-full ${className}`} />;
}
