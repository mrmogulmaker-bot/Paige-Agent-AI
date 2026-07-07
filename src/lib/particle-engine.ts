// ============================================================
// Particle Engine — Traveling Wave Orb System
// ============================================================
// A 2D canvas-based particle system that creates the illusion of
// 3D rotating orbs made from thousands of helical particle trails.
// Supports scroll-driven multi-orb splitting animation.

interface ParticleColor {
  r: number;
  g: number;
  b: number;
}

interface TrailPoint {
  angle: number;
  radius: number;
}

interface Particle {
  angle: number;
  radius: number;
  speed: number;
  opacity: number;
  size: number;
  trailLength: number;
  trail: TrailPoint[];
  isPrime: boolean;
}

interface Ring {
  angle: number;
  speed: number;
  particles: Particle[];
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

// ============================================================
// TravelingWaveOrb — Single orb with layered helical particle rings
// ============================================================
export class TravelingWaveOrb {
  ctx: CanvasRenderingContext2D;
  cx: number;
  cy: number;
  radius: number;
  ringCount: number;
  particlesPerRing: number;
  rotationSpeeds: number[];
  brightness: number;
  color: ParticleColor;
  time: number;
  rings: Ring[];
  angleOffset: number;

  constructor(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number = 260,
    ringCount: number = 60,
    particlesPerRing: number = 240,
    rotationSpeeds: number[] = [0.0045, 0.009, 0.0135],
    brightness: number = 1.0,
    color: ParticleColor = { r: 16, g: 185, b: 129 }
  ) {
    this.ctx = ctx;
    this.cx = cx;
    this.cy = cy;
    this.radius = radius;
    this.ringCount = ringCount;
    this.particlesPerRing = particlesPerRing;
    this.rotationSpeeds = rotationSpeeds;
    this.brightness = brightness;
    this.color = color;
    this.time = 0;
    this.rings = [];
    this.angleOffset = Math.random() * Math.PI * 2;
  }

  init() {
    this.time = 0;
    this.rings = [];
    for (let i = 0; i < this.ringCount; i++) {
      const ringAngle = (i / this.ringCount) * Math.PI * 2 - Math.PI;
      this.rings.push({
        angle: ringAngle,
        speed: (Math.random() < 0.5 ? 1 : -1) * (0.33 + Math.random() * 0.67),
        particles: [],
      });
    }
    this.populateParticles();
  }

  private populateParticles() {
    for (const ring of this.rings) {
      ring.particles = [];
      for (let j = 0; j < this.particlesPerRing; j++) {
        const posAngle = (j / this.particlesPerRing) * Math.PI * 2;
        const acosVal = Math.acos(Math.min(1, Math.abs(Math.cos(ring.angle))));
        const r = this.radius * (0.08 + 0.92 * Math.pow(Math.sin(acosVal), 1));
        ring.particles.push(this.newParticle(posAngle, r, ring.speed, j));
      }
      this.primeSort(ring);
    }
  }

  private newParticle(posAngle: number, r: number, speed: number, index: number): Particle {
    return {
      angle: posAngle,
      radius: r,
      speed: speed * (0.92 + Math.random() * 0.08),
      opacity: Math.pow(Math.random(), 2),
      size: 0.6 + Math.random() * 1.4,
      trailLength: Math.floor(4 + Math.pow(Math.random(), 2) * 12),
      trail: [],
      isPrime: isPrime(index),
    };
  }

  private primeSort(ring: Ring) {
    ring.particles.sort((a, b) => (b.isPrime ? 1 : 0) - (a.isPrime ? 1 : 0));
  }

  draw(time: number, targetX: number, targetY: number) {
    this.time = time;
    const ctx = this.ctx;

    for (const ring of this.rings) {
      ring.angle += ring.speed * 0.0045;
      const cosRing = Math.cos(ring.angle);

      for (const p of ring.particles) {
        // Update particle motion
        p.angle += p.speed * 0.0045;
        p.trail.push({ angle: p.angle, radius: p.radius });
        if (p.trail.length > p.trailLength) {
          p.trail.shift();
        }

        // Draw trail
        for (let tIdx = 0; tIdx < p.trail.length; tIdx++) {
          const t = p.trail[tIdx];
          const projMag = Math.abs(t.radius * cosRing);
          let proj = 0;
          if (t.radius > 0) {
            proj = Math.acos(Math.min(1, projMag / t.radius));
          }
          const rotAngle = t.angle + time * 0.4 * ring.speed;
          const xr = t.radius * Math.cos(rotAngle);
          const yr = t.radius * Math.sin(rotAngle) * Math.sin(proj);
          const zr = t.radius * Math.sin(rotAngle) * cosRing;
          const depth = (zr / t.radius) * 0.5 + 0.5;

          // Screen projection with 3D rotation
          const sx = targetX + (xr * Math.cos(0.9) - yr * Math.sin(0.9));
          const sy = targetY + (xr * Math.sin(0.6) + yr * Math.cos(0.6));

          const isHead = tIdx === p.trail.length - 1;
          const size = isHead ? p.size : p.size * 0.6;
          let alpha = depth * (isHead ? p.opacity : p.opacity * 0.4);
          alpha *= this.brightness;

          if (alpha < 0.01) continue;

          // Render particle
          if (p.isPrime && alpha > 0.1 && this.brightness > 0.2) {
            ctx.fillStyle = `rgba(${this.color.r + 40}, ${this.color.g + 20}, ${this.color.b}, ${alpha * 0.9})`;
            ctx.beginPath();
            ctx.arc(sx, sy, size * 1.8, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, Math.PI * 2);
          ctx.fill();

          // Highlight on bright particles
          if (alpha > 0.1 && size > 0.8 && this.brightness > 0.1) {
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
            ctx.fillRect(sx - size * 0.3, sy - size * 0.3, size * 0.6, size * 0.6);
          }
        }
      }
    }
  }

  // Resize the orb to a new radius
  resizeRadius(newRadius: number) {
    this.radius = newRadius;
    // Re-populate particles with new radius
    for (const ring of this.rings) {
      for (let j = 0; j < ring.particles.length; j++) {
        const p = ring.particles[j];
        const acosVal = Math.acos(Math.min(1, Math.abs(Math.cos(ring.angle))));
        p.radius = this.radius * (0.08 + 0.92 * Math.pow(Math.sin(acosVal), 1));
      }
    }
  }
}

// ============================================================
// ParticleEngine — Manages canvas, all orbs, animation loop
// ============================================================
interface OrbConfig {
  cx: number;
  cy: number;
  radius: number;
  color: ParticleColor;
  brightness: number;
}

// Paige brand constellation — amethyst core, violet satellites, one cyan pop.
const DEFAULT_COLORS: ParticleColor[] = [
  { r: 168, g: 85, b: 247 },   // #a855f7 amethyst (platform core)
  { r: 192, g: 132, b: 252 },  // #c084fc light lilac
  { r: 139, g: 92, b: 246 },   // #8b5cf6 violet
  { r: 124, g: 58, b: 237 },   // #7c3aed deep violet
  { r: 109, g: 40, b: 217 },   // #6d28d9 indigo-violet
  { r: 34, g: 211, b: 238 },   // #22d3ee cyan accent (the agent)
];

export class ParticleEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  orbs: TravelingWaveOrb[];
  time: number;
  scrollProgress: number;
  width: number;
  height: number;
  dpr: number;
  animFrameId: number;
  isRunning: boolean;
  reducedMotion: boolean;
  private splitOrbConfigs: OrbConfig[];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.orbs = [];
    this.time = 0;
    this.scrollProgress = 0;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.animFrameId = 0;
    this.isRunning = false;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Final constellation positions (normalized 0-1)
    this.splitOrbConfigs = [
      { cx: 0.5, cy: 0.4, radius: 160, color: DEFAULT_COLORS[0], brightness: 1.0 },
      { cx: 0.28, cy: 0.33, radius: 120, color: DEFAULT_COLORS[1], brightness: 0.9 },
      { cx: 0.72, cy: 0.33, radius: 120, color: DEFAULT_COLORS[2], brightness: 0.9 },
      { cx: 0.36, cy: 0.18, radius: 120, color: DEFAULT_COLORS[3], brightness: 0.9 },
      { cx: 0.64, cy: 0.18, radius: 120, color: DEFAULT_COLORS[4], brightness: 0.9 },
      { cx: 0.5, cy: 0.58, radius: 120, color: DEFAULT_COLORS[5], brightness: 1.0 },
    ];

    this.resize();

    // Create initial orb
    const mainOrb = new TravelingWaveOrb(
      this.ctx, 0.5, 0.4, 260, 60, 240,
      [0.0045, 0.009, 0.0135], 1.0, DEFAULT_COLORS[0]
    );
    mainOrb.init();
    this.orbs.push(mainOrb);

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.animate();
  }

  stop() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  private animate = () => {
    if (!this.isRunning) return;

    this.ctx.clearRect(0, 0, this.width, this.height);

    if (!this.reducedMotion) {
      this.time += 0.01;
    }

    // Set composite operation for glow
    this.ctx.globalCompositeOperation = 'lighter';

    for (const orb of this.orbs) {
      const ox = orb.cx * this.width;
      const oy = orb.cy * this.height;

      // Apply gentle orbital drift for satellite orbs
      if (this.orbs.length > 1 && orb !== this.orbs[0]) {
        orb.angleOffset += 0.002;
        const driftX = Math.sin(orb.angleOffset) * 0.02 * this.width;
        const driftY = Math.cos(orb.angleOffset * 0.7) * 0.015 * this.height;
        orb.draw(this.time, ox + driftX, oy + driftY);
      } else {
        orb.draw(this.time, ox, oy);
      }
    }

    this.ctx.globalCompositeOperation = 'source-over';

    this.animFrameId = requestAnimationFrame(this.animate);
  };

  // Called on every scroll progress update (0 to 1)
  updateScrollProgress(p: number) {
    this.scrollProgress = p;

    if (p < 0.3) {
      // Phase 1: Power up — single orb grows
      const phaseP = p / 0.3;
      const eased = 1 - Math.pow(1 - phaseP, 2);
      if (this.orbs.length > 0) {
        this.orbs[0].cx = 0.5;
        this.orbs[0].cy = 0.4;
        this.orbs[0].brightness = 1.0 + eased * 0.5;
        // Adjust radius visually by scaling
        const targetRadius = 260 * (1 + eased * 0.3);
        if (Math.abs(this.orbs[0].radius - targetRadius) > 1) {
          this.orbs[0].resizeRadius(targetRadius);
        }
      }
      // Remove extra orbs if scrolling back up
      while (this.orbs.length > 1) {
        this.orbs.pop();
      }
    } else if (p < 0.6) {
      // Phase 2: Split
      const splitP = (p - 0.3) / 0.3;
      const eased = 1 - Math.pow(1 - splitP, 3);

      // Ensure we have the right number of orbs
      if (this.orbs.length === 1) {
        // Create 5 satellite orbs
        for (let i = 1; i < 6; i++) {
          const config = this.splitOrbConfigs[i];
          const isMobile = this.width < 768;
          const radius = isMobile ? config.radius * 0.65 : config.radius;
          const newOrb = new TravelingWaveOrb(
            this.ctx,
            0.5, 0.4, // Start at center
            radius,
            30, 120,  // Reduced particle count for satellites
            [0.0045, 0.009, 0.0135],
            config.brightness,
            config.color
          );
          newOrb.init();
          this.orbs.push(newOrb);
        }
      }

      // Animate orbs from center to their positions
      for (let i = 0; i < this.orbs.length; i++) {
        const orb = this.orbs[i];
        const target = this.splitOrbConfigs[i];
        const isMobile = this.width < 768;

        // Mobile adjustments
        let targetCx = target.cx;
        let targetCy = target.cy;
        if (isMobile) {
          // Pack orbs tighter on mobile
          const dx = target.cx - 0.5;
          const dy = target.cy - 0.4;
          targetCx = 0.5 + dx * 0.6;
          targetCy = 0.4 + dy * 0.6;
        }

        orb.cx = 0.5 + (targetCx - 0.5) * eased;
        orb.cy = 0.4 + (targetCy - 0.4) * eased;

        if (i === 0) {
          // Platform orb shrinks
          const targetR = isMobile ? target.radius * 0.65 : target.radius;
          const startR = 260 * 1.3;
          const currentR = startR + (targetR - startR) * eased;
          if (Math.abs(orb.radius - currentR) > 1) {
            orb.resizeRadius(currentR);
          }
          orb.brightness = 1.5 - eased * 0.5;
        }
      }
    } else {
      // Phase 3: Orbital motion — all orbs at final positions
      const isMobile = this.width < 768;

      for (let i = 0; i < this.orbs.length; i++) {
        const orb = this.orbs[i];
        const target = this.splitOrbConfigs[i];

        let targetCx = target.cx;
        let targetCy = target.cy;
        if (isMobile) {
          const dx = target.cx - 0.5;
          const dy = target.cy - 0.4;
          targetCx = 0.5 + dx * 0.6;
          targetCy = 0.4 + dy * 0.6;
        }

        orb.cx = targetCx;
        orb.cy = targetCy;

        if (i === 0) {
          const targetR = isMobile ? target.radius * 0.65 : target.radius;
          if (Math.abs(orb.radius - targetR) > 1) {
            orb.resizeRadius(targetR);
          }
        }
      }
    }
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', () => this.resize());
  }
}
