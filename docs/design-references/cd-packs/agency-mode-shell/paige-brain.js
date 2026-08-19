// Paige knowledge orb — a spherical memory field in space: lat/long wireframe, six domain
// regions on the shell, starfield parallax, and the sub-accounts orbiting as satellites.

const DOMAINS = [
  { name: "Playbook & doctrine", docs: 14, trained: "2h ago", color: "#C8A02E" },
  { name: "Sub-accounts & threads", docs: 26, trained: "12m ago", color: "#7B6BE0" },
  { name: "Offers & pricing", docs: 9, trained: "1d ago", color: "#2FA98C" },
  { name: "Compliance & vault", docs: 12, trained: "6h ago", color: "#D9776A" },
  { name: "Brand & voice", docs: 11, trained: "3d ago", color: "#D9A03A" },
  { name: "Systems & data", docs: 18, trained: "14m ago", color: "#3FA97E" }
];

const HUB_NAMES = [
  ["Agency doctrine v4", "Onboarding SOP"],
  ["Ridgeline account thread", "Bellweather discovery"],
  ["Mid-tier package sheet", "Renewal pricing ladder"],
  ["E&O policy + renewals", "Sub-account MSA template"],
  ["Voice guide — operator tone", "Owner digest format"],
  ["Systems Check fix log", "Attribution map"]
];

const SATS = [
  "Sarah's Coaching", "Coach James", "Ridgeline", "Bright Path", "Verde Studio", "Northwind",
  "Hartline", "Bellweather", "Selby Group", "Marisol & Co", "Kepler Fit", "Anchor Point"
];

const RAD = 96;

class PaigeBrain extends HTMLElement {
  connectedCallback() {
    this.style.position = "absolute";
    this.style.inset = "0";
    this.style.display = "block";
    const cv = document.createElement("canvas");
    cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab";
    this.appendChild(cv);
    try { this.run(cv); } catch (err) { console.error("paige-brain", err); }
  }

  disconnectedCallback() { if (this.stop) this.stop(); }

  run(cv) {
    const win = cv.ownerDocument.defaultView || window;
    const ctx = cv.getContext("2d");
    const prefersReduced = win.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let motion = true;
    let btn = { x: 0, y: 0, w: 0, h: 0 };
    let seed = 20260815;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

    // six domain regions spread over the shell (fibonacci directions)
    const dirs = DOMAINS.map((d, i) => {
      const gr = Math.PI * (3 - Math.sqrt(5));
      const y = 1 - (i / (DOMAINS.length - 1)) * 1.7 - 0.15;
      const r = Math.sqrt(Math.max(0, 1 - y * y)), th = gr * i * 1.6;
      return { x: Math.cos(th) * r, y, z: Math.sin(th) * r };
    });
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const domainOf = u => {
      let best = 0, bv = -2;
      dirs.forEach((d, i) => { const v = dot(u, d); if (v > bv) { bv = v; best = i; } });
      return best;
    };

    // nodes: mostly on the shell, some in the interior for volume
    const nodes = [];
    for (let i = 0; i < 340; i++) {
      const u0 = { x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: rnd() * 2 - 1 };
      const l = Math.hypot(u0.x, u0.y, u0.z) || 1;
      const u = { x: u0.x / l, y: u0.y / l, z: u0.z / l };
      const shell = rnd() < 0.72;
      const rr = shell ? RAD * (0.965 + rnd() * 0.05) : RAD * (0.4 + rnd() * 0.5);
      nodes.push({
        x: u.x * rr, y: u.y * rr, z: u.z * rr, u,
        d: domainOf(u), shell, r: (shell ? 1.0 : 0.7) + rnd() * (shell ? 1.9 : 1.2),
        ph: rnd() * 6.28, deg: 0, cross: 0
      });
    }

    const edges = [];
    const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
    nodes.forEach((a, i) => {
      const near = [];
      nodes.forEach((b, j) => { if (j > i && b.d === a.d) { const dd = d2(a, b); if (dd < 1500) near.push({ j, dd }); } });
      near.sort((p, q) => p.dd - q.dd);
      near.slice(0, 3).forEach(nn => { edges.push({ a: i, b: nn.j, cross: false }); nodes[i].deg++; nodes[nn.j].deg++; });
    });
    for (let k = 0; k < 32; k++) {
      const i = (rnd() * nodes.length) | 0;
      let best = -1, bd = 1e9;
      nodes.forEach((b, j) => { if (b.d !== nodes[i].d) { const dd = d2(nodes[i], b); if (dd < bd) { bd = dd; best = j; } } });
      if (best >= 0 && !edges.some(g => (g.a === i && g.b === best) || (g.a === best && g.b === i))) {
        edges.push({ a: i, b: best, cross: true });
        nodes[i].deg++; nodes[best].deg++; nodes[i].cross++; nodes[best].cross++;
      }
    }
    DOMAINS.forEach((d, di) => {
      nodes.map((n, i) => ({ n, i })).filter(o => o.n.d === di).sort((p, q) => q.n.deg - p.n.deg)
        .slice(0, 2).forEach((o, k) => { o.n.hub = HUB_NAMES[di][k]; });
    });
    const bridgeCount = edges.filter(g => g.cross).length;

    // lat/long wireframe
    const wire = [];
    for (let k = 1; k <= 6; k++) {
      const phi = -Math.PI / 2 + (k / 7) * Math.PI, ring = [];
      for (let a = 0; a <= 72; a++) {
        const th = (a / 72) * Math.PI * 2;
        ring.push({ x: Math.cos(phi) * Math.cos(th) * RAD, y: Math.sin(phi) * RAD, z: Math.cos(phi) * Math.sin(th) * RAD });
      }
      wire.push(ring);
    }
    for (let k = 0; k < 8; k++) {
      const th = (k / 8) * Math.PI * 2, ring = [];
      for (let a = 0; a <= 72; a++) {
        const phi = -Math.PI / 2 + (a / 72) * Math.PI;
        ring.push({ x: Math.cos(phi) * Math.cos(th) * RAD, y: Math.sin(phi) * RAD, z: Math.cos(phi) * Math.sin(th) * RAD });
      }
      wire.push(ring);
    }

    // starfield — its own slow parallax
    const stars = [];
    for (let i = 0; i < 260; i++) {
      const u0 = { x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: rnd() * 2 - 1 };
      const l = Math.hypot(u0.x, u0.y, u0.z) || 1, rr = 420 + rnd() * 620;
      stars.push({ x: u0.x / l * rr, y: u0.y / l * rr, z: u0.z / l * rr, r: 0.3 + rnd() * 1.2, ph: rnd() * 6.28 });
    }

    // satellites: sub-accounts on two tilted orbits
    const sats = SATS.map((name, i) => {
      const inner = i % 2 === 0;
      return {
        name, i, inner,
        a0: (i / SATS.length) * Math.PI * 2,
        R: inner ? 148 : 186,
        tiltX: inner ? 0.42 : -0.3,
        speed: inner ? 0.075 : 0.052,
        r: 2.6 + (i % 3) * 0.7,
        color: DOMAINS[i % DOMAINS.length].color
      };
    });

    let yaw = 0.3, tilt = -0.22, zoom = 1, W = 0, H = 0;
    const dpr = Math.min(2, win.devicePixelRatio || 1);
    let drag = null, mx = -1e4, my = -1e4, t = 0, raf = 0, frame = 0, fallback = 0;
    const pulses = [], sparks = [], beams = [];

    const size = () => {
      const b = cv.getBoundingClientRect();
      const w2 = b.width || cv.parentElement.clientWidth || 600;
      const h2 = b.height || cv.parentElement.clientHeight || 300;
      if (Math.abs(w2 - W) > 0.5 || Math.abs(h2 - H) > 0.5) {
        W = w2; H = h2; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      }
    };
    size();
    let ro = null;
    try { ro = new win.ResizeObserver(size); ro.observe(cv); } catch (e) {}

    const onDown = e => {
      const b = cv.getBoundingClientRect(), px = e.clientX - b.left, py = e.clientY - b.top;
      if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) { motion = !motion; return; }
      drag = { x: e.clientX, y: e.clientY, yaw, tilt }; cv.style.cursor = "grabbing";
    };
    const onUp = () => { drag = null; cv.style.cursor = "grab"; };
    const onMove = e => {
      const b = cv.getBoundingClientRect();
      mx = e.clientX - b.left; my = e.clientY - b.top;
      if (drag) {
        yaw = drag.yaw + (e.clientX - drag.x) * 0.006;
        tilt = Math.max(-0.75, Math.min(0.75, drag.tilt + (e.clientY - drag.y) * 0.004));
      }
    };
    const onLeave = () => { mx = my = -1e4; drag = null; };
    const onWheel = e => { e.preventDefault(); zoom = Math.max(0.7, Math.min(2.4, zoom * (e.deltaY > 0 ? 0.93 : 1.075))); };
    cv.addEventListener("pointerdown", onDown);
    win.addEventListener("pointerup", onUp);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerleave", onLeave);
    cv.addEventListener("wheel", onWheel, { passive: false });

    let sc = 1, cx = 0, cy = 0;
    const rot = p => {
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cxt = Math.cos(tilt), sxt = Math.sin(tilt);
      const x = p.x * cyw - p.z * syw;
      let z = p.x * syw + p.z * cyw;
      const y = p.y * cxt - z * sxt;
      z = p.y * sxt + z * cxt;
      return { x, y, z, f: 760 / (760 + z + 210) };
    };
    const S = p => { const r = rot(p); return { x: cx + r.x * r.f * sc, y: cy + r.y * r.f * sc, s: r.f * sc, z: r.z }; };
    const hex = (c, a) => c + Math.max(2, Math.min(255, Math.round(a * 255))).toString(16).padStart(2, "0");

    const draw = () => {
      if (++frame % 20 === 1) size();
      if (!W) return;
      t += 1 / 40;
      if (motion) {
        if (!drag) { yaw += 0.012; tilt = -0.2 + Math.sin(t * 0.22) * 0.12; }
        if (pulses.length === 0 || t - pulses[pulses.length - 1].t0 > 1.9) {
          pulses.push({ d: (Math.random() * DOMAINS.length) | 0, t0: t });
          if (pulses.length > 3) pulses.shift();
        }
        if (sparks.length === 0 || t - sparks[sparks.length - 1].t0 > 0.3) {
          sparks.push({ g: (Math.random() * edges.length) | 0, t0: t });
          if (sparks.length > 8) sparks.shift();
        }
        if (beams.length === 0 || t - beams[beams.length - 1].t0 > 1.1) {
          beams.push({ s: (Math.random() * sats.length) | 0, t0: t });
          if (beams.length > 4) beams.shift();
        }
      }

      // fit the orb + orbits to the panel
      const maxR = 190;
      sc = Math.min((W * 0.45) / maxR, (H * 0.46) / (maxR * 0.62)) * zoom;
      cx = W / 2; cy = H / 2;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(cx, cy, 6, cx, cy, Math.max(W, H) * 0.85);
      bg.addColorStop(0, "#150F2C"); bg.addColorStop(0.45, "#0D0A1C"); bg.addColorStop(1, "#06050D");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // nebula haze — soft colour clouds, no edges
      const neb = [
        { x: -0.3, y: -0.24, r: 0.62, c: "123,107,224" },
        { x: 0.34, y: 0.2, r: 0.54, c: "70,140,190" },
        { x: 0.14, y: -0.34, r: 0.4, c: "150,110,200" }
      ];
      neb.forEach((n, i) => {
        const drift = !motion ? 0 : Math.sin(t * 0.11 + i * 2) * 0.03;
        const px = cx + (n.x + drift) * W, py = cy + n.y * H;
        const rr = n.r * Math.max(W, H) * 0.6;
        const g = ctx.createRadialGradient(px, py, 0, px, py, rr);
        g.addColorStop(0, "rgba(" + n.c + ",.10)");
        g.addColorStop(0.55, "rgba(" + n.c + ",.04)");
        g.addColorStop(1, "rgba(" + n.c + ",0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      });

      // stars, with their own parallax drift
      const starYaw = yaw * 0.32;
      stars.forEach(s => {
        const cyw = Math.cos(starYaw), syw = Math.sin(starYaw);
        const x = s.x * cyw - s.z * syw, z = s.x * syw + s.z * cyw;
        const f = 760 / (760 + z + 210);
        if (f <= 0) return;
        const px = cx + x * f * sc * 0.9, py = cy + s.y * f * sc * 0.9;
        if (px < -4 || px > W + 4 || py < -4 || py > H + 4) return;
        const tw = !motion ? 0.6 : 0.55 + 0.45 * Math.sin(t * 1.4 + s.ph);
        ctx.fillStyle = "rgba(226,222,255," + (0.14 + tw * 0.5).toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(px, py, s.r * Math.max(0.5, f), 0, 6.284); ctx.fill();
      });

      const P = nodes.map(S);
      const depth = i => 1 - (P[i].z + RAD) / (2 * RAD);

      let hov = -1, hd = 13;
      if (mx > -1e3) nodes.forEach((n, i) => {
        if (P[i].z > 10) return;
        const dm = Math.hypot(P[i].x - mx, P[i].y - my);
        if (dm < hd) { hd = dm; hov = i; }
      });

      const energy = nodes.map((n, i) => {
        let en = !motion ? 0 : 0.12 + 0.12 * Math.sin(t * 1.2 + n.ph);
        pulses.forEach(pu => {
          const ang = Math.acos(Math.max(-1, Math.min(1, dot(n.u, dirs[pu.d]))));
          const front = (t - pu.t0) * 1.5, dd = Math.abs(ang - front);
          if (dd < 0.34) en += (1 - dd / 0.34) * 0.95 * Math.max(0, 1 - (t - pu.t0) / 2.6);
        });
        if (mx > -1e3 && P[i].z < 10) { const dm = Math.hypot(P[i].x - mx, P[i].y - my); if (dm < 92) en += (1 - dm / 92) * 0.45; }
        if (hov >= 0 && (i === hov || edges.some(g => (g.a === hov && g.b === i) || (g.b === hov && g.a === i)))) en += 0.7;
        return Math.min(1.4, en);
      });

      const satPos = s => {
        const a = s.a0 + (!motion ? 0 : t * s.speed);
        return S({ x: Math.cos(a) * s.R, y: Math.sin(a) * s.R * Math.sin(s.tiltX), z: Math.sin(a) * s.R * Math.cos(s.tiltX) });
      };
      const drawSat = s => {
        const p = satPos(s);
        const beam = beams.filter(b => b.s === s.i)[0];
        let k = 0;
        if (beam) {
          const age = t - beam.t0;
          if (age < 0.7) {
            const prog = age / 0.7;
            const bx = cx + (p.x - cx) * prog, by = cy + (p.y - cy) * prog;
            const lg = ctx.createLinearGradient(cx, cy, p.x, p.y);
            lg.addColorStop(0, "rgba(200,190,255,0)"); lg.addColorStop(1, "rgba(214,206,255,.5)");
            ctx.strokeStyle = lg; ctx.lineWidth = 0.9;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke();
            ctx.fillStyle = "rgba(240,236,255,.92)";
            ctx.beginPath(); ctx.arc(bx, by, 2, 0, 6.284); ctx.fill();
          } else if (age < 1.6) k = 1 - (age - 0.7) / 0.9;
        }
        const near = mx > -1e3 && Math.hypot(p.x - mx, p.y - my) < 14;
        const rr = s.r * Math.max(0.55, p.s / 1.35) * (1 + k * 0.5);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * 6);
        g.addColorStop(0, hex(s.color, 0.4 + k * 0.4)); g.addColorStop(1, s.color + "00");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rr * 6, 0, 6.284); ctx.fill();
        ctx.fillStyle = hex(s.color, near ? 1 : 0.8);
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 6.284); ctx.fill();
        if (near) {
          ctx.font = "600 10.5px 'Söhne',system-ui,sans-serif";
          ctx.textAlign = "center"; ctx.fillStyle = "#FFFDF8";
          ctx.fillText(s.name, p.x, p.y - rr - 7);
        }
      };

      sats.filter(s => satPos(s).z > 0).forEach(drawSat);

      // orb body: atmosphere, limb, interior core
      const orbR = RAD * sc * (760 / (760 + 210));
      const atmo = ctx.createRadialGradient(cx, cy, orbR * 0.2, cx, cy, orbR * 1.5);
      atmo.addColorStop(0, "rgba(120,104,224,.16)");
      atmo.addColorStop(0.62, "rgba(96,82,200,.12)");
      atmo.addColorStop(1, "rgba(60,48,150,0)");
      ctx.fillStyle = atmo; ctx.beginPath(); ctx.arc(cx, cy, orbR * 1.5, 0, 6.284); ctx.fill();
      const br = !motion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.75);
      const core = ctx.createRadialGradient(cx - orbR * 0.18, cy - orbR * 0.2, 2, cx, cy, orbR);
      core.addColorStop(0, "rgba(170,152,255," + (0.2 + br * 0.1).toFixed(3) + ")");
      core.addColorStop(0.7, "rgba(70,58,150,.12)");
      core.addColorStop(1, "rgba(30,24,70,.28)");
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, orbR, 0, 6.284); ctx.fill();

      // edges
      edges.forEach(g => {
        const pa = P[g.a], pb = P[g.b];
        const en = (energy[g.a] + energy[g.b]) / 2, dep = (depth(g.a) + depth(g.b)) / 2;
        const col = g.cross ? "#CFC6FA" : DOMAINS[nodes[g.a].d].color;
        ctx.lineWidth = g.cross ? 0.7 : 0.45;
        ctx.strokeStyle = hex(col, (0.02 + en * 0.26) * (0.26 + dep * 0.74));
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      });
      sparks.forEach(sp => {
        const g = edges[sp.g], age = t - sp.t0;
        if (age > 0.6) return;
        const k = 1 - age / 0.6, pa = P[g.a], pb = P[g.b];
        ctx.lineWidth = 1.4 * k; ctx.strokeStyle = "rgba(255,253,248," + (0.45 * k).toFixed(3) + ")";
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        const tx = pa.x + (pb.x - pa.x) * (1 - k), ty = pa.y + (pb.y - pa.y) * (1 - k);
        ctx.fillStyle = "rgba(255,253,248," + (0.8 * k).toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(tx, ty, 1.6 * k + 0.5, 0, 6.284); ctx.fill();
      });

      // nodes, far to near
      nodes.map((n, i) => ({ n, p: P[i], e: energy[i], dep: depth(i) }))
        .sort((a, b) => b.p.z - a.p.z)
        .forEach(({ n, p, e, dep }) => {
          const col = DOMAINS[n.d].color, isHub = !!n.hub;
          const r = (n.r + (isHub ? 1.4 : 0)) * (p.s / 1.15) * (1 + e * 0.5);
          if (e > 0.3 || isHub) {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 7);
            g.addColorStop(0, hex(col, 0.32 * (0.35 + dep * 0.65))); g.addColorStop(1, col + "00");
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 7, 0, 6.284); ctx.fill();
          }
          ctx.globalAlpha = Math.max(0.13, Math.min(1, (0.24 + e) * (0.34 + dep * 0.66)));
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, r), 0, 6.284); ctx.fill();
          if (isHub && dep > 0.45) {
            ctx.globalAlpha = Math.min(1, 0.3 + dep * 0.4);
            ctx.lineWidth = 0.8; ctx.strokeStyle = col;
            ctx.beginPath(); ctx.arc(p.x, p.y, r + 3.2, 0, 6.284); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        });

      // limb light + terminator
      const limb = ctx.createRadialGradient(cx, cy, orbR * 0.72, cx, cy, orbR * 1.18);
      limb.addColorStop(0, "rgba(176,162,255,0)");
      limb.addColorStop(0.66, "rgba(176,162,255,.07)");
      limb.addColorStop(1, "rgba(176,162,255,0)");
      ctx.fillStyle = limb; ctx.beginPath(); ctx.arc(cx, cy, orbR * 1.18, 0, 6.284); ctx.fill();

      sats.filter(s => satPos(s).z <= 0).forEach(drawSat);

      // domain labels in the margins, leader line to the region's surface point
      const half = Math.ceil(DOMAINS.length / 2);
      const order = DOMAINS.map((d, i) => ({ i, sy: S({ x: dirs[i].x * RAD, y: dirs[i].y * RAD, z: dirs[i].z * RAD }).y })).sort((a, b) => a.sy - b.sy);
      const slots = {};
      order.forEach((o, k) => { slots[o.i] = { right: k % 2 === 0, rank: (k / 2) | 0 }; });
      const top = 116, bottom = H - 46, pitch = Math.max(30, Math.min(38, (bottom - top) / half));
      DOMAINS.forEach((d, i) => {
        const sl = slots[i], lx = sl.right ? W - 13 : 13, ly = top + sl.rank * pitch;
        const a = S({ x: dirs[i].x * RAD, y: dirs[i].y * RAD, z: dirs[i].z * RAD });
        const facing = a.z < 20;
        const near = mx > -1e3 && ((Math.abs(mx - lx) < 150 && Math.abs(my - ly) < 18) || Math.hypot(a.x - mx, a.y - my) < 38);
        ctx.strokeStyle = hex(d.color, near ? 0.55 : facing ? 0.2 : 0.09);
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(sl.right ? lx - 118 : lx + 118, ly - 4);
        ctx.lineTo(sl.right ? lx - 8 : lx + 8, ly - 4);
        ctx.stroke();
        ctx.textAlign = sl.right ? "right" : "left";
        ctx.font = "600 11.5px 'Söhne',system-ui,sans-serif";
        const tw = Math.max(ctx.measureText(d.name).width, 76) + 30;
        const px = sl.right ? lx - tw - 2 : lx - 8;
        const grd = ctx.createLinearGradient(px, 0, px + tw, 0);
        grd.addColorStop(0, sl.right ? "rgba(16,14,26,0)" : "rgba(16,14,26,.62)");
        grd.addColorStop(1, sl.right ? "rgba(16,14,26,.62)" : "rgba(16,14,26,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(px, ly - 19, tw + 10, 32);
        ctx.fillStyle = hex(d.color, 0.95);
        ctx.beginPath(); ctx.arc(sl.right ? lx - 3 : lx + 3, ly - 8, 3, 0, 6.284); ctx.fill();
        ctx.font = "600 11.5px 'Söhne',system-ui,sans-serif";
        ctx.fillStyle = near ? "#FFFDF8" : "rgba(255,253,248,.8)";
        ctx.fillText(d.name, sl.right ? lx - 11 : lx + 11, ly - 4);
        ctx.font = "9.5px 'IBM Plex Mono',monospace";
        ctx.fillStyle = "rgba(255,253,248,.4)";
        ctx.fillText(d.docs + " docs · " + d.trained, sl.right ? lx - 11 : lx + 11, ly + 8);
      });

      if (hov >= 0) {
        const n = nodes[hov], p = P[hov], d = DOMAINS[n.d];
        const title = n.hub || d.name, l2 = n.hub ? d.name : n.shell ? "surface entity" : "interior entity";
        const l3 = n.deg + " links · " + n.cross + " cross-domain";
        ctx.font = "600 12.5px 'Söhne',system-ui,sans-serif";
        const w = Math.max(ctx.measureText(title).width, 168) + 26, h = 62;
        const bx = Math.min(Math.max(10, p.x + 14), W - w - 10), by = Math.min(Math.max(10, p.y - h - 12), H - h - 10);
        ctx.fillStyle = "rgba(7,6,13,.94)"; ctx.strokeStyle = hex(d.color, 0.5); ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 10); else ctx.rect(bx, by, w, h);
        ctx.fill(); ctx.stroke();
        ctx.textAlign = "left";
        ctx.fillStyle = d.color;
        ctx.beginPath(); ctx.arc(bx + 15, by + 19, 3.4, 0, 6.284); ctx.fill();
        ctx.fillStyle = "#FFFDF8"; ctx.font = "600 12.5px 'Söhne',system-ui,sans-serif";
        ctx.fillText(title, bx + 25, by + 23);
        ctx.font = "11px 'Söhne',system-ui,sans-serif"; ctx.fillStyle = "rgba(255,253,248,.62)";
        ctx.fillText(l2, bx + 14, by + 40);
        ctx.font = "10.5px 'IBM Plex Mono',monospace"; ctx.fillStyle = "rgba(255,253,248,.42)";
        ctx.fillText(l3, bx + 14, by + 54);
        cv.style.cursor = "pointer";
      } else if (!drag) cv.style.cursor = "grab";

      ctx.font = "600 10.5px 'Söhne',system-ui,sans-serif";
      const bl = (motion ? "Motion on" : "Motion off");
      const bw = ctx.measureText(bl).width + 30;
      btn = { x: W - bw - 14, y: H - 32, w: bw, h: 22 };
      ctx.fillStyle = motion ? "rgba(123,107,224,.22)" : "rgba(255,253,248,.06)";
      ctx.strokeStyle = motion ? "rgba(170,158,244,.5)" : "rgba(255,253,248,.2)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 11); else ctx.rect(btn.x, btn.y, btn.w, btn.h);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = motion ? "#D9D2FF" : "rgba(255,253,248,.55)";
      ctx.beginPath(); ctx.arc(btn.x + 13, btn.y + 11, 3, 0, 6.284); ctx.fill();
      ctx.textAlign = "left";
      ctx.fillStyle = motion ? "#EFEBFF" : "rgba(255,253,248,.6)";
      ctx.fillText(bl, btn.x + 21, btn.y + 15);

      ctx.textAlign = "left";
      ctx.font = "10.5px 'IBM Plex Mono',monospace";
      ctx.fillStyle = "rgba(255,253,248,.32)";
      ctx.fillText(nodes.length + " entities · " + edges.length + " links · " + bridgeCount + " cross-domain · " + sats.length + " sub-accounts in orbit", 19, H - 15);

    };

    const tick = () => draw();
    const clock = setInterval(tick, 25);
    tick();

    this.stop = () => {
      clearInterval(clock);
      if (ro) ro.disconnect();
      cv.removeEventListener("pointerdown", onDown);
      win.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerleave", onLeave);
      cv.removeEventListener("wheel", onWheel);
    };
  }
}
customElements.define("paige-brain", PaigeBrain);
