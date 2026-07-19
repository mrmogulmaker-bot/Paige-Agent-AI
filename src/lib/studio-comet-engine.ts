// ============================================================
// Studio Comet Engine — real-rendered orbital comet (canvas-2D)
// ============================================================
// §29 rebuild. Replaces the old CSS `offset-path` comet (which gave rigid,
// "1980s" direction-changes at the ellipse ends and a static masked "flame"
// that never actually flickered) with a genuine per-frame particle simulation:
//
//  • SMOOTH continuous orbit — the head rides a parametric ellipse driven by a
//    single, monotonically advancing angle (θ += dθ·dt each frame). Constant
//    angular velocity on a closed curve = perfectly smooth motion with ZERO
//    direction-change discontinuity. There is no easing envelope and no
//    offset-path interpolation to stutter at the arc ends — the rigidity the
//    owner called out simply cannot exist here.
//  • REAL flame TRAIL — each frame the head SHEDS ember particles that stream
//    off BEHIND the travel tangent with per-particle velocity, life, size decay
//    and additive 'lighter' blend, so overlapping embers bloom into a live
//    plasma tail (the trail+additive pattern proven in particle-engine.ts).
//  • GENUINE per-frame FLICKER — the nucleus brightness and each ember's alpha
//    are re-rolled from noise EVERY frame (not a fixed keyframe), and ember
//    velocities carry per-frame jitter, so the flame licks and breathes live.
//
// Lifecycle scaffolding (DPR cap, resize, start/stop, visibility gate, destroy)
// mirrors ParticleEngine. Colors are read from the studio brand tokens
// (--studio-orbit / --studio-star / --studio-nebula-gold) so it is theme-aware
// and token-driven (§11/§23). Under the explicit "Reduced" choice the loop
// never starts — one still frame is painted (§11/§22 per-primitive motion-safe).

interface CometTokens {
  /** gold orbit signature — "H S% L%" triple (no hsl() wrapper). */
  orbit: string;
  /** near-white star core — "H S% L%" triple. */
  star: string;
  /** warm ember gold — "H S% L%" triple. */
  gold: string;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 1 → 0
  decay: number; // life lost per second
  size: number;
  /** 0 = hot (white/star), 1 = cool (ember gold) — set at birth from head heat. */
  heat: number;
  /** static per-ember brightness bias so not every ember flickers in lockstep. */
  bias: number;
}

const DEFAULT_TOKENS: CometTokens = {
  orbit: "41 82% 62%",
  star: "210 40% 92%",
  gold: "41 88% 62%",
};

// The orbit ellipse matches the CSS `.studio-orbit` / old comet path exactly:
// a square box of `min(54rem, 130%)` of the field width, `ellipse(50% 20%)`
// (rx = 50% of box, ry = 20% of box), rotated -24deg about the field centre.
const BOX_MAX = 864; // 54rem
const BOX_PCT = 1.3; // 130%
const RX_FRAC = 0.5;
const RY_FRAC = 0.2;
const TILT = (-24 * Math.PI) / 180;

export class StudioCometEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private w = 0; // CSS px
  private h = 0;
  private embers: Ember[] = [];
  private theta = Math.PI * 0.15; // current orbital angle of the head
  private lastT = 0;
  private emitCarry = 0; // fractional-ember accumulator for frame-rate independence
  private animFrameId = 0;
  private isRunning = false;
  private tokens: CometTokens = DEFAULT_TOKENS;
  private reduced = false;
  private ro: ResizeObserver | null = null;
  private onVisibility: () => void;
  private onResize: () => void;

  // Tuning (err BOLD — §25 VISIBLE-AFTER-DEPLOY; the owner dials down, not up).
  private readonly angularSpeed = 0.62; // rad/s → full orbit ≈ 10s, clearly perceptible
  private readonly emitPerSec = 150; // embers shed per second
  private readonly nucleusR = 4.4; // head core radius (CSS px)

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.onVisibility = () => this.syncRunning();
    this.onResize = () => this.resize();
    this.resize();
    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
    }
  }

  setTokens(t: Partial<CometTokens>) {
    this.tokens = {
      orbit: t.orbit || this.tokens.orbit,
      star: t.star || this.tokens.star,
      gold: t.gold || this.tokens.gold,
    };
    // If we're at rest (reduced or paused), repaint the still frame in the new
    // colours so a theme flip is honoured even without the loop running.
    if (!this.isRunning) this.renderStaticFrame();
  }

  /** Reduced-motion (the explicit Studio choice). true → never run; paint one still frame. */
  setReduced(reduced: boolean) {
    this.reduced = reduced;
    if (reduced) {
      this.stop();
      this.renderStaticFrame();
    } else {
      this.syncRunning();
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Repaint the still frame if we're not looping so a resize never leaves it blank.
    if (!this.isRunning) this.renderStaticFrame();
  }

  // ── ellipse geometry ────────────────────────────────────────────────
  private box() {
    return Math.min(BOX_MAX, this.w * BOX_PCT);
  }
  /** Head position for a given orbital angle (rotated, flattened ellipse). */
  private pointAt(theta: number) {
    const s = this.box();
    const rx = s * RX_FRAC;
    const ry = s * RY_FRAC;
    const lx = rx * Math.cos(theta);
    const ly = ry * Math.sin(theta);
    const cos = Math.cos(TILT);
    const sin = Math.sin(TILT);
    return {
      x: this.w / 2 + lx * cos - ly * sin,
      y: this.h / 2 + lx * sin + ly * cos,
    };
  }
  /** Forward-tangent unit vector at a given angle (direction of travel). */
  private tangentAt(theta: number) {
    const s = this.box();
    const rx = s * RX_FRAC;
    const ry = s * RY_FRAC;
    // dP/dθ = (-rx sinθ, ry cosθ), then rotate by TILT.
    const dx = -rx * Math.sin(theta);
    const dy = ry * Math.cos(theta);
    const cos = Math.cos(TILT);
    const sin = Math.sin(TILT);
    const tx = dx * cos - dy * sin;
    const ty = dx * sin + dy * cos;
    const m = Math.hypot(tx, ty) || 1;
    return { x: tx / m, y: ty / m };
  }

  start() {
    if (this.reduced) {
      this.renderStaticFrame();
      return;
    }
    this.syncRunning();
  }

  stop() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }

  private syncRunning() {
    const shouldRun = !this.reduced && !document.hidden;
    if (shouldRun && !this.isRunning) {
      this.isRunning = true;
      this.lastT = 0;
      this.animFrameId = requestAnimationFrame(this.frame);
    } else if (!shouldRun && this.isRunning) {
      this.stop();
    }
  }

  // ── the loop ─────────────────────────────────────────────────────────
  private frame = (t: number) => {
    if (!this.isRunning) return;
    // dt in seconds, clamped so a backgrounded tab returning doesn't fling embers.
    const dt = this.lastT ? Math.min(0.05, (t - this.lastT) / 1000) : 1 / 60;
    this.lastT = t;

    // Advance the head along the ellipse at CONSTANT angular velocity → smooth,
    // continuous orbit with no direction-change discontinuity.
    this.theta = (this.theta + this.angularSpeed * dt) % (Math.PI * 2);
    const head = this.pointAt(this.theta);
    const tan = this.tangentAt(this.theta);

    // Emit embers behind the head (frame-rate independent via a fractional carry).
    this.emitCarry += this.emitPerSec * dt;
    const n = Math.floor(this.emitCarry);
    this.emitCarry -= n;
    for (let i = 0; i < n; i++) this.emitEmber(head, tan);

    // Integrate + cull embers.
    const alive: Ember[] = [];
    for (const e of this.embers) {
      e.life -= e.decay * dt;
      if (e.life <= 0) continue;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vx *= 0.92; // drag → embers settle into a tapering tail
      e.vy *= 0.92;
      alive.push(e);
    }
    this.embers = alive;

    this.render(head);
    this.animFrameId = requestAnimationFrame(this.frame);
  };

  private emitEmber(head: { x: number; y: number }, tan: { x: number; y: number }) {
    // Velocity streams BACKWARD along the travel tangent (so the flame trails the
    // head) plus a per-ember perpendicular + random jitter → an organic, licking
    // plume rather than a rigid line. Magnitudes re-rolled every emit (per-frame).
    const back = 130 + Math.random() * 90; // px/s backward
    const perp = (Math.random() - 0.5) * 90; // px/s sideways lick
    const px = -tan.y; // perpendicular unit
    const py = tan.x;
    this.embers.push({
      x: head.x + (Math.random() - 0.5) * 3,
      y: head.y + (Math.random() - 0.5) * 3,
      vx: -tan.x * back + px * perp,
      vy: -tan.y * back + py * perp,
      life: 1,
      decay: 1.4 + Math.random() * 1.1, // ~0.6–0.85s lifespan
      size: 1.4 + Math.random() * 2.6,
      heat: Math.random(), // some embers born hot (white), some cooler (gold)
      bias: 0.6 + Math.random() * 0.4,
    });
  }

  // ── drawing ──────────────────────────────────────────────────────────
  private hsl(triple: string, a: number) {
    return `hsl(${triple} / ${a})`;
  }

  /** Ember colour ramp: hot core → star white-blue → orbit gold → ember gold as it cools/ages. */
  private emberColor(e: Ember): string {
    // Combine birth heat with age (older = cooler). 0 hot → 1 cool.
    const cool = Math.min(1, e.heat * 0.5 + (1 - e.life) * 0.7);
    if (cool < 0.33) return this.tokens.star;
    if (cool < 0.66) return this.tokens.orbit;
    return this.tokens.gold;
  }

  private render(head: { x: number; y: number }) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = "lighter"; // additive glow — overlaps bloom

    // Embers (the plasma trail). Drawn oldest→newest so the head reads brightest.
    for (const e of this.embers) {
      // GENUINE per-frame flicker: alpha re-rolled from noise every frame.
      const flick = 0.7 + Math.random() * 0.3;
      const alpha = e.life * e.life * e.bias * flick * 0.9;
      if (alpha < 0.012) continue;
      const col = this.emberColor(e);
      const r = e.size * (0.5 + e.life); // shrink as it dies
      // soft additive dot: a filled core + a wider faint glow.
      ctx.fillStyle = this.hsl(col, alpha);
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.hsl(col, alpha * 0.28);
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 2.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nucleus — the white-hot head, redrawn each frame with live brightness noise.
    const pulse = 0.82 + Math.random() * 0.18; // per-frame flicker on the core
    const nr = this.nucleusR;
    // outer gold halo
    const halo = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, nr * 4.2);
    halo.addColorStop(0, this.hsl(this.tokens.orbit, 0.55 * pulse));
    halo.addColorStop(0.5, this.hsl(this.tokens.orbit, 0.16 * pulse));
    halo.addColorStop(1, this.hsl(this.tokens.orbit, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(head.x, head.y, nr * 4.2, 0, Math.PI * 2);
    ctx.fill();
    // hot core (star-white)
    const core = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, nr);
    core.addColorStop(0, `hsl(0 0% 100% / ${0.98 * pulse})`);
    core.addColorStop(0.5, this.hsl(this.tokens.star, 0.9 * pulse));
    core.addColorStop(1, this.hsl(this.tokens.star, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(head.x, head.y, nr, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
  }

  /** One still, beautiful frame for the explicit "Reduced" choice — a bright
   *  nucleus partway along the arc with a soft static tapering tail. No loop. */
  renderStaticFrame() {
    const ctx = this.ctx;
    if (!this.w || !this.h) return;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = "lighter";
    const theta = Math.PI * 0.34 * 2; // mirrors the old CSS reduced offset-distance 34%
    const head = this.pointAt(theta);
    const tan = this.tangentAt(theta);
    // static tapering tail — a handful of fading dots trailing the head.
    for (let i = 1; i <= 16; i++) {
      const d = i * 7;
      const jitter = (i % 2 ? 1 : -1) * i * 0.4;
      const x = head.x - tan.x * d + -tan.y * jitter;
      const y = head.y - tan.y * d + tan.x * jitter;
      const a = (1 - i / 17) * 0.5;
      const col = i < 6 ? this.tokens.star : i < 11 ? this.tokens.orbit : this.tokens.gold;
      ctx.fillStyle = this.hsl(col, a);
      ctx.beginPath();
      ctx.arc(x, y, 2.4 * (1 - i / 22), 0, Math.PI * 2);
      ctx.fill();
    }
    // nucleus
    const halo = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, this.nucleusR * 4);
    halo.addColorStop(0, this.hsl(this.tokens.orbit, 0.5));
    halo.addColorStop(1, this.hsl(this.tokens.orbit, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(head.x, head.y, this.nucleusR * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `hsl(0 0% 100% / 0.95)`;
    ctx.beginPath();
    ctx.arc(head.x, head.y, this.nucleusR * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  /** Stop the loop AND clear the canvas — used to stand the comet down in light
   *  mode (dark-sky grit reads as noise on the bright field; approved behaviour). */
  hide() {
    this.stop();
    if (this.w && this.h) this.ctx.clearRect(0, 0, this.w, this.h);
  }

  destroy() {
    this.stop();
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.ro) {
      this.ro.disconnect();
      this.ro = null;
    }
  }
}
