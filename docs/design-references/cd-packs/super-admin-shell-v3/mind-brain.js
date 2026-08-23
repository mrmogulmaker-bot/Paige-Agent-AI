// <mind-brain> — the memory substrate, rendered.
//
// A rotating point cloud inside a bilobed envelope. Every point is one memory; every
// edge is an association the platform actually holds. A firing is a real event —
// a recall, a skill call, a write — travelling along an edge from its source lobe.
//
// Canvas 2D on an interval clock: animation frames are suspended in embedded frames,
// so rAF cannot be relied on here. Motion-safe: prefers-reduced-motion freezes the
// rotation and draws firings as a static mark rather than a travelling pulse.
(function () {
  if (window.customElements && customElements.get('mind-brain')) return;
  const TAU = Math.PI * 2;

  const rgb = h => { const c = h.replace('#', ''); return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)]; };
  const rgba = (h, a) => { const c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };

  function mulberry(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5; let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Two overlapping ellipsoids with a central fissure and a stem taper below.
  function envelopePoint(rng) {
    for (let i = 0; i < 300; i++) {
      const x = (rng() * 2 - 1) * 1.04;
      const y = (rng() * 2 - 1) * 0.82;
      const z = (rng() * 2 - 1) * 0.86;
      const inside = (x * x) / 1.08 + (y * y) / 0.68 + (z * z) / 0.74 <= 1;
      if (!inside) continue;
      if (Math.abs(x) < 0.055 && y > -0.15) continue;      // the fissure
      if (y < -0.42 && Math.abs(x) > 0.30 + (y + 0.42) * 0.9) continue; // stem taper
      return [x, y, z];
    }
    return [0, 0, 0];
  }


  // Latitude/longitude rings over the two lobes. Generated once; rotated per frame with
  // the cloud, so the mass reads as a solid rather than a scatter.
  function hullRings() {
    const rings = [];
    [-1, 1].forEach(side => {
      const cx = side * 0.30;
      for (let li = 0; li < 5; li++) {
        const v = -0.6 + li * 0.3;
        const ring = [];
        for (let a = 0; a <= 26; a++) {
          const t = (a / 26) * TAU;
          const rr = Math.sqrt(Math.max(0, 1 - v * v));
          ring.push([cx + Math.cos(t) * 0.62 * rr, v * 0.72, Math.sin(t) * 0.68 * rr]);
        }
        rings.push(ring);
      }
      for (let mi = 0; mi < 6; mi++) {
        const t = (mi / 6) * Math.PI;
        const ring = [];
        for (let a = 0; a <= 22; a++) {
          const p = -Math.PI / 2 + (a / 22) * Math.PI;
          const rr = Math.cos(p);
          ring.push([cx + Math.cos(t) * rr * 0.62, Math.sin(p) * 0.72, Math.sin(t) * rr * 0.68]);
        }
        rings.push(ring);
      }
    });
    return rings;
  }

  class MindBrain extends HTMLElement {
    connectedCallback() {
      if (this._up) { this._start(); return; }
      this._up = true;
      this.style.display = 'block';
      this.style.position = 'relative';
      this.style.minHeight = '0';
      this._canvas = document.createElement('canvas');
      this._canvas.style.cssText = 'display:block;width:100%;height:100%';
      this.appendChild(this._canvas);
      this._ctx = this._canvas.getContext('2d');
      this._t = 0;
      this._pulses = [];
      this._sel = -1;
      this._hover = -1;
      this._focus = null;
      this._reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
      this._yaw = 0; this._pitch = 0.14; this._zoom = 1;
      this._vy = 0; this._vp = 0; this._drag = null; this._moved = 0;
      this._onMove = e => {
        if (this._drag) {
          const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
          this._moved += Math.abs(dx) + Math.abs(dy);
          this._vy = dx * 0.006; this._vp = -dy * 0.005;
          this._yaw += this._vy; this._pitch = Math.max(-1.1, Math.min(1.1, this._pitch + this._vp));
          this._drag = { x:e.clientX, y:e.clientY };
          return;
        }
        this._pick(e, false);
      };
      this._canvas.addEventListener('mousedown', e => {
        this._drag = { x:e.clientX, y:e.clientY }; this._moved = 0;
        this.style.cursor = 'grabbing'; e.preventDefault();
      });
      const release = () => { if (this._drag) { this._drag = null; this.style.cursor = 'grab'; } };
      window.addEventListener('mouseup', release);
      this._release = release;
      // A click is a click only if the pointer barely moved; otherwise it was a drag.
      this._onClick = e => { if (this._moved > 5) { this._moved = 0; return; } this._pick(e, true); };
      this._canvas.addEventListener('mousemove', this._onMove);
      this._canvas.addEventListener('click', this._onClick);
      this._canvas.addEventListener('wheel', e => {
        e.preventDefault();
        this._zoom = Math.max(0.55, Math.min(2.6, (this._zoom || 1) * (e.deltaY > 0 ? 0.93 : 1.075)));
      }, { passive:false });
      this._canvas.addEventListener('dblclick', () => {
        this._yaw = 0; this._pitch = 0.14; this._zoom = 1; this._vy = 0; this._vp = 0;
        this.dispatchEvent(new CustomEvent('settle', { bubbles:true }));
      });
      // Touch: one finger orbits, two pinch.
      this._canvas.addEventListener('touchstart', e => {
        if (e.touches.length === 1) this._drag = { x:e.touches[0].clientX, y:e.touches[0].clientY };
        if (e.touches.length === 2) this._pinch = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }, { passive:true });
      this._canvas.addEventListener('touchmove', e => {
        if (e.touches.length === 2 && this._pinch) {
          const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY);
          this._zoom = Math.max(0.55, Math.min(2.6, (this._zoom || 1) * (d / this._pinch)));
          this._pinch = d; e.preventDefault(); return;
        }
        if (this._drag && e.touches.length === 1) {
          const dx = e.touches[0].clientX - this._drag.x, dy = e.touches[0].clientY - this._drag.y;
          this._vy = dx * 0.006; this._vp = -dy * 0.005;
          this._yaw += this._vy; this._pitch = Math.max(-1.1, Math.min(1.1, this._pitch + this._vp));
          this._drag = { x:e.touches[0].clientX, y:e.touches[0].clientY };
          e.preventDefault();
        }
      }, { passive:false });
      this._canvas.addEventListener('touchend', () => { this._drag = null; this._pinch = null; });
      this._canvas.addEventListener('mouseleave', () => { this._hover = -1; if (!this._drag) this.style.cursor = 'grab'; });
      this.style.cursor = 'grab';
      // Deferred: resizing the canvas inside the observer callback re-triggers it, which
      // the browser reports as an undelivered-notification loop.
      this._ro = new ResizeObserver(() => {
        if (this._rt) return;
        this._rt = setTimeout(() => { this._rt = null; this._resize(); }, 60);
      });
      this._ro.observe(this);
      this._resize();
      this._start();
    }
    disconnectedCallback() { this._stop(); if (this._rt) clearTimeout(this._rt);
      if (this._release) window.removeEventListener('mouseup', this._release);
      if (this._ro) this._ro.disconnect(); }
    _start() { if (!this._clock) this._clock = setInterval(() => this._frame(), 33); }
    _stop() { if (this._clock) { clearInterval(this._clock); this._clock = null; } }

    // { lobes:[{id,name,hue,n}], theme:'dark'|'light' }
    setModel(m) {
      this.model = m;
      const rng = mulberry(20260822);
      const pts = [];
      (m.lobes || []).forEach((lobe, li) => {
        // Each lobe owns a territory: a centre inside the envelope, points scattered near it.
        const c = lobe.at || [Math.cos(li / (m.lobes.length) * TAU) * 0.52, Math.sin(li / m.lobes.length * TAU) * 0.34, (li % 2 ? 0.3 : -0.3)];
        for (let i = 0; i < lobe.n; i++) {
          let p = envelopePoint(rng);
          // ~20% inhibitory interneurons, the cortical ratio. Held in a const because p is
          // reassigned twice below — writing the flag onto p loses it.
          const inh = rng() < 0.2;
          // Push most points outward onto a shell; keep a tenth deep for the core.
          const deep = rng() < 0.12;
          const push = deep ? 0.42 : 0.86 + rng() * 0.2;
          const len = Math.sqrt(p[0]*p[0] + p[1]*p[1] + p[2]*p[2]) || 1;
          p = [p[0] / len * push, p[1] / len * push * 0.8, p[2] / len * push * 0.86];
          p = [c[0] * 0.5 + p[0] * 0.66, c[1] * 0.5 + p[1] * 0.66, c[2] * 0.45 + p[2] * 0.7];
          // An interneuron is smaller and denser than a pyramidal cell, and reads as one.
          pts.push({ x:p[0], y:p[1], z:p[2], lobe:li, inh:inh,
            r:inh ? 0.42 + rng() * 0.4 : 0.6 + rng() * 0.95, seed:rng(), heat:0 });
        }
      });
      this.points = pts;
      // Edges: nearest neighbours, mostly within a lobe, a few across it. An association
      // that crosses lobes is the interesting one, so those are drawn brighter.
      const edges = [];
      for (let i = 0; i < pts.length; i++) {
        let best = [], a = pts[i];
        for (let j = 0; j < pts.length; j++) {
          if (i === j) continue;
          const b = pts[j];
          const d = (a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2;
          if (d < 0.028) best.push([d, j]);
        }
        best.sort((p, q) => p[0] - q[0]);
        best.slice(0, 4).forEach(e => { if (i < e[1]) edges.push([i, e[1], pts[i].lobe !== pts[e[1]].lobe, 0]); });
      }
      this.edges = edges;
      this.hull = hullRings();
      this._frame();
    }

    setTheme(t) { this._theme = t; }
    setFocus(lobeId) { this._focus = lobeId; }
    select(i) { this._sel = i; }

    // Attach a memory to a firing, so what lights up also says what it is.
    say(lobeIndex, text, src) {
      if (!this.points) return;
      const cand = this.points.map((p, i) => [p, i]).filter(x => x[0].lobe === lobeIndex);
      if (!cand.length) return;
      const pick = cand[(Math.random() * cand.length) | 0][1];
      this.labels = (this.labels || []).filter(l => this._t - l.t < 300).slice(-1);
      this.labels.push({ i:pick, text:text, src:src, t:this._t });
      this.fire(lobeIndex);
    }

    // Growth. A memory written is a point added, wired into the three nearest neurons in
    // its region. The substrate is meant to thicken over time, so this is permanent —
    // the same call is what a tenant's brain does as it learns.
    grow(lobeIndex, text, src) {
      if (!this.points) return;
      const same = this.points.map((p, i) => [p, i]).filter(x => x[0].lobe === lobeIndex);
      if (!same.length) return;
      const anchor = same[(Math.random() * same.length) | 0][0];
      const jitter = () => (Math.random() - 0.5) * 0.22;
      const p = { x:anchor.x + jitter(), y:anchor.y + jitter(), z:anchor.z + jitter(),
        lobe:lobeIndex, r:0.9 + Math.random() * 0.6, heat:1, born:this._t };
      const idx = this.points.length;
      this.points.push(p);
      const near = same.map(x => [
        (x[0].x - p.x) ** 2 + (x[0].y - p.y) ** 2 + (x[0].z - p.z) ** 2, x[1]])
        .sort((a, c) => a[0] - c[0]).slice(0, 3);
      near.forEach(n => this.edges.push([n[1], idx, false]));
      // One cross-region association, because a new memory rarely stands alone.
      const other = this.points.map((q, i) => [q, i]).filter(x => x[0].lobe !== lobeIndex);
      if (other.length) this.edges.push([idx, other[(Math.random() * other.length) | 0][1], true]);
      if (text) {
        this.labels = (this.labels || []).filter(l => this._t - l.t < 300).slice(-1);
        this.labels.push({ i:idx, text:text, src:src, t:this._t });
      }
      this.fire(lobeIndex);
      this.dispatchEvent(new CustomEvent('grew', { bubbles:true,
        detail:{ lobe:lobeIndex, points:this.points.length, edges:this.edges.length } }));
      return this.points.length;
    }

    // Light a feature: a direction distributed across many neurons in several regions,
    // not a location. One neuron belongs to several features, which is superposition —
    // the reason a substrate holds far more than it has cells for.
    feature(regions, n) {
      if (!this.points) return;
      const want = Math.min(n || 200, 460);
      const pool = this.points.map((p, i) => [p, i]).filter(x => regions.indexOf(x[0].lobe) >= 0);
      if (!pool.length) return;
      this._feat = [];
      for (let k = 0; k < want && pool.length; k++) {
        const pick = pool[(Math.random() * pool.length) | 0][1];
        this._feat.push(pick);
        const p = this.points[pick];
        p.heat = Math.max(p.heat || 0, 0.55 + Math.random() * 0.45);
      }
      this._featT = this._t;
      // Firing a feature is binding: several regions pulled into one answer, which is
      // what gamma is for.
      this.band = 'gamma'; this._bandT = 140;
      regions.forEach((r, i) => setTimeout(() => this.fire(r, '#f0c46a'), i * 90));
    }

    // A firing: travels from a random point in the lobe outward along its edges.
    fire(lobeIndex, tone) {
      if (!this.points) return;
      // The transmitter is drawn first, because it decides which cell can emit it: GABA
      // comes from an interneuron, everything else from a pyramidal cell.
      const NTx = (window.PAIGE_IA && window.PAIGE_IA.NEUROTRANSMITTERS) || [];
      let nt0 = NTx[0], r0 = Math.random(), acc0 = 0;
      for (const t of NTx) { acc0 += t.share; if (r0 <= acc0) { nt0 = t; break; } }
      const wantInh = !!(nt0 && nt0.id === 'gaba');
      const all = this.points.map((p, i) => [p, i]).filter(x => x[0].lobe === lobeIndex);
      if (!all.length) return;
      const typed = all.filter(x => !!x[0].inh === wantInh);
      const cand = typed.length ? typed : all;
      const start = cand[(Math.random() * cand.length) | 0][1];
      const path = [start];
      let cur = start;
      for (let hop = 0; hop < 4; hop++) {
        const nb = this.edges.filter(e => e[0] === cur || e[1] === cur);
        if (!nb.length) break;
        const e = nb[(Math.random() * nb.length) | 0];
        cur = e[0] === cur ? e[1] : e[0];
        path.push(cur);
      }
      const nt = nt0, inhib = wantInh;
      this._pulses.push({ path, node:0, phase:0, dwell:0, inhib:inhib, nt:nt && nt.id,
        tone:tone || (nt ? nt.tone : '#c7a978'),
        sp:(0.11 + Math.random() * 0.07) * (inhib ? 0.8 : 1), gen:0 });
      if (this._pulses.length > 220) this._pulses.shift();
    }

    _resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.clientWidth || 600, h = this.clientHeight || 400;
      this._canvas.width = w * dpr; this._canvas.height = h * dpr;
      this._w = w; this._h = h; this._dpr = dpr;
      this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    _project(p) { return this._proj3(p.x, p.y, p.z); }
    // Yaw plus pitch, both yours to set. The clock only drifts it while you are not
    // holding it, so an idle brain turns and a held one obeys.
    _proj3(px, py, pz) {
      const a = this._yaw === undefined ? 0 : this._yaw;
      const tilt = this._pitch === undefined ? 0 : this._pitch;
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = px * ca - pz * sa;
      let z = px * sa + pz * ca;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const y = py * ct - z * st;
      z = py * st + z * ct;
      const persp = 1.55 / (1.85 - z * 0.62);
      const s = Math.min(this._w * 0.55, this._h * 0.64) * (this._zoom || 1);
      return { sx:this._w / 2 + x * s * persp, sy:this._h * 0.60 + y * s * persp,
        near:(z + 1) / 2, persp, z:z };
    }

    _pick(e, commit) {
      if (!this.points) return;
      const r = this._canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let hit = -1, bd = 90;
      this.points.forEach((p, i) => {
        const q = this._project(p);
        const d = (q.sx - mx) ** 2 + (q.sy - my) ** 2;
        if (d < bd) { bd = d; hit = i; }
      });
      this._hover = hit;
      this.style.cursor = hit >= 0 ? 'pointer' : 'grab';
      if (commit && hit >= 0) {
        this._sel = hit;
        this.dispatchEvent(new CustomEvent('pick', { detail:{ index:hit, lobe:this.points[hit].lobe }, bubbles:true }));
      }
    }

    _frame() {
      const ctx = this._ctx, m = this.model;
      if (!ctx || !m || !this.points) return;
      const still = this._reduce && this.getAttribute('motion') !== 'on';
      if (!still) {
        this._t += 1;
        if (this._drag) { this._vy *= 0.4; this._vp *= 0.4; }
        else {
          // Inertia, then a slow idle drift once the throw has died away.
          this._vy *= 0.94; this._vp *= 0.90;
          // The band sets the cadence. Alpha is idle-and-ready; a write pushes theta,
          // an act pushes beta, a recall pulls gamma. A cortex is never silent.
          const BANDS = (window.PAIGE_IA && window.PAIGE_IA.BANDS) || [];
          if (this._bandT === undefined) { this._bandT = 0; this.band = 'alpha'; }
          if (this._bandT > 0) this._bandT--; else if (this.band !== 'alpha') this.band = 'alpha';
          const bd = BANDS.filter(x => x.id === this.band)[0] || { rate:0.44 };
          this._osc = (this._osc || 0) + bd.rate * 0.16;
          const every = Math.max(1, Math.round(7 - bd.rate * 5));
          if (this._t % every === 0 && this._pulses.length < 150) {
            const w = [0, 0, 0, 1, 1, 2, 3, 4];
            this.fire(w[(Math.random() * w.length) | 0]);
          }
          // Sharp-wave ripple: at rest the hippocampus replays a sequence to consolidate it
          // into cortex. That is what an idle memory substrate is doing, so it is visible.
          if (this.band === 'alpha' && this._t % 190 === 0) {
            this.band = 'delta'; this._bandT = 90;
            for (let k = 0; k < 7; k++) setTimeout(() => this.fire(k % 2 ? 1 : 0, '#c7a978'), k * 55);
            this.dispatchEvent(new CustomEvent('replay', { bubbles:true }));
          }
          this._yaw += this._vy;
          this._pitch = Math.max(-1.1, Math.min(1.1, this._pitch + this._vp));
          if (Math.abs(this._vy) < 0.0016) this._yaw += 0.0034;
          this._pitch += Math.sin(this._t * 0.0019) * 0.0006;
        }
      }
      // The chamber is always dark — a substrate you look into, like a scope. Mineral
      // changes the page around it, not the well itself, so firing stays legible.
      const light = false;
      ctx.clearRect(0, 0, this._w, this._h);
      const gg = ctx.createRadialGradient(this._w / 2, this._h * 0.545, 0,
        this._w / 2, this._h * 0.545, Math.min(this._w, this._h) * 0.62);
      gg.addColorStop(0, 'rgba(199,169,120,.085)');
      gg.addColorStop(0.55, 'rgba(155,141,224,.035)');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg; ctx.fillRect(0, 0, this._w, this._h);
      // A ground, so the mass sits in space rather than on paper.
      const cx = this._w / 2, cy = this._h * 0.60;
      const rr = Math.min(this._w * 0.55, this._h * 0.64) * (this._zoom || 1);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, light ? 'rgba(122,92,46,.055)' : 'rgba(120,140,200,.075)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this._w, this._h);
      // On mineral white the same alpha vanishes, so ink and opacity both step up.
      // Light mode uses an authored darker hue per region rather than a computed mix:
      // mixing toward a neutral desaturates, and five desaturated hues are one hue.
      const shade = li => light ? (m.lobes[li].hueLight || m.lobes[li].hue) : m.lobes[li].hue;
      const boost = 1.24;

      const proj = this.points.map(p => this._project(p));
      const order = this.points.map((p, i) => i).sort((a, b) => proj[a].near - proj[b].near);
      const dim = i => this._focus !== null && this._focus !== undefined && this.points[i].lobe !== this._focus;

      // The hull: back half first so the cloud sits inside it, front half after so the
      // form closes around what it holds.
      const hullPts = this.hull.map(r => r.map(p => this._proj3(p[0], p[1], p[2])));
      const drawHull = front => {
        hullPts.forEach(r => {
          for (let i = 1; i < r.length; i++) {
            const p0 = r[i - 1], p1 = r[i];
            const nearAvg = (p0.near + p1.near) / 2;
            if (front ? nearAvg < 0.5 : nearAvg >= 0.5) continue;
            const t = front ? (nearAvg - 0.5) * 2 : nearAvg * 2;
            ctx.strokeStyle = rgba(light ? '#7a5c2e' : '#9fb0d8',
              (front ? 0.05 + t * 0.13 : 0.02 + t * 0.05) * (light ? 1.5 : 1));
            ctx.lineWidth = front ? 0.7 : 0.5;
            ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.stroke();
          }
        });
      };
      drawHull(false);

      // Which edges a firing is currently travelling — those get lit, not just the point.
      const litEdge = {};
      this._wt = this._wt || {};
      this._pulses.forEach(pu => {
        const i0 = Math.min(pu.node, pu.path.length - 2);
        const key = pu.path[i0] + '-' + pu.path[i0 + 1];
        litEdge[key] = pu; litEdge[pu.path[i0 + 1] + '-' + pu.path[i0]] = pu;
      });

      // Edges, back to front.
      this.edges.forEach(e => {
        const a = proj[e[0]], b = proj[e[1]];
        const near = (a.near + b.near) / 2;
        const faded = dim(e[0]) && dim(e[1]);
        const li = this.points[e[0]].lobe;
        const wk = Math.min(e[0], e[1]) + '-' + Math.max(e[0], e[1]);
        const wt = (this._wt && this._wt[wk]) || 0;
        ctx.strokeStyle = e[2] ? rgba(shade(li), Math.min(0.85, (faded ? 0.06 : 0.16 + near * 0.24 + wt * 0.3) * boost))
          : rgba(light ? '#5c5762' : '#3a4152', Math.min(0.7, (faded ? 0.05 : 0.10 + near * 0.18 + wt * 0.26) * boost));
        if (wt > 0.3) ctx.lineWidth = Math.min(2.4, ctx.lineWidth * (1 + wt * 0.9));
        ctx.lineWidth = e[2] ? 0.7 : 0.5;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        const pu = litEdge[e[0] + '-' + e[1]];
        if (pu) {
          const ph = Math.min(0.999, Math.max(0.001, pu.phase));
          const g2 = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
          g2.addColorStop(0, rgba(pu.tone, 0.05));
          g2.addColorStop(Math.max(0.001, ph - 0.34), rgba(pu.tone, 0.18));
          g2.addColorStop(ph, rgba('#fff6e2', 0.95));
          g2.addColorStop(Math.min(0.999, ph + 0.05), rgba(pu.tone, 0.10));
          g2.addColorStop(1, rgba(pu.tone, 0.03));
          ctx.strokeStyle = g2; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        }
      });

      // Points.
      order.forEach(i => {
        const p = this.points[i], q = proj[i];
        const hue = shade(p.lobe);
        const fresh = p.born !== undefined ? Math.max(0, 1 - (this._t - p.born) / 240) : 0;
        if (p.refr) p.refr -= 1;
        if (p.hush) p.hush -= 1;
        const faded = dim(i);
        const heat = p.heat;
        const rad = (p.r * (0.72 + q.near * 0.78)) * (1 + heat * 0.8) * (this._sel === i ? 2.1 : 1);
        // The band reaches the render: the whole field breathes at whatever rhythm it is
        // running, and a suppressed cell sits visibly below its neighbours.
        const osc = 1 + Math.sin((this._osc || 0) + p.x * 2.4 + p.z * 1.6) * 0.15;
        const hush = p.hush ? p.hush / 40 : 0;
        const alpha = (faded ? 0.16 : (0.42 + q.near * 0.55 + heat * 0.45))
          * (p.refr > 0 ? 0.45 : 1) * osc * (1 - hush * 0.62);
        if (heat > 0.02 && !faded) {
          ctx.fillStyle = rgba(hue, heat * 0.20);
          ctx.beginPath(); ctx.arc(q.sx, q.sy, rad * (light ? 3.0 : 5.5), 0, TAU); ctx.fill();
        }
        ctx.fillStyle = rgba(heat > 0.3 || fresh > 0.05 ? '#f6e8cb' : hue,
          Math.min((alpha + fresh * 0.5) * boost, 1));
        if (p.inh) {
          // An interneuron is a small square: the 20% that only ever suppresses should be
          // countable on screen, not an assertion in a caption.
          const s2 = rad * 1.35;
          ctx.fillRect(q.sx - s2, q.sy - s2, s2 * 2, s2 * 2);
        } else {
          ctx.beginPath(); ctx.arc(q.sx, q.sy, rad, 0, TAU); ctx.fill();
        }
        if (this._sel === i || this._hover === i) {
          ctx.strokeStyle = rgba(light ? '#7a5c2e' : '#e8d5ac', 0.85);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(q.sx, q.sy, rad + 4.5, 0, TAU); ctx.stroke();
        }
        p.heat *= 0.93;
      });

      drawHull(true);

      // A firing neuron says what it holds, so the field shows content rather than only
      // activity. Two at a time — more and it becomes a labelled diagram.
      if (this.labels && this.labels.length) {
        ctx.textBaseline = 'middle';
        this.labels.forEach(lb => {
          const p = this.points[lb.i]; if (!p) return;
          const q = this._proj3(p.x, p.y, p.z);
          const age = (this._t - lb.t) / 300;
          if (age > 1) return;
          const fade = age < 0.1 ? age / 0.1 : age > 0.8 ? (1 - age) / 0.2 : 1;
          const left = q.sx < this._w * 0.55;
          const tx = q.sx + (left ? 14 : -14);
          ctx.textAlign = left ? 'left' : 'right';
          const hue = shade(p.lobe);
          ctx.strokeStyle = rgba(hue, 0.45 * fade);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(q.sx, q.sy); ctx.lineTo(tx - (left ? 5 : -5), q.sy); ctx.stroke();
          ctx.font = '11.5px ui-sans-serif, system-ui, sans-serif';
          ctx.fillStyle = rgba(light ? '#2f2b36' : '#ece8f2', 0.95 * fade);
          ctx.fillText(lb.text, tx, q.sy - 6);
          ctx.font = '9.5px ui-monospace, SFMono-Regular, monospace';
          ctx.fillStyle = rgba(hue, 0.85 * fade);
          ctx.fillText(lb.src, tx, q.sy + 8);
        });
      }

      // Firings travelling along their path.
      this._pulses = this._pulses.filter(pu => {
        if (this._reduce) { pu.node = pu.path.length - 1; return false; }
        // Dwell at the node: the impulse regenerates here before it jumps again.
        if (pu.dwell > 0) { pu.dwell -= 1; return true; }
        pu.phase += pu.sp;
        if (pu.phase >= 1) {
          pu.phase = 0; pu.node += 1;
          if (pu.node >= pu.path.length - 1) return false;
          const at = pu.path[pu.node];
          const p = this.points[at];
          if (pu.inhib) {
            // GABA hyperpolarises: the target is held down, not lit up. Inhibition is a
            // signal, and roughly a fifth of a cortex does nothing else.
            p.heat = 0; p.hush = 40; p.refr = 20;
          } else {
            p.heat = 1; p.refr = 34;          // all-or-nothing, then refractory
            // Hebb: cells that fire together wire together. The weight persists, which is
            // what consolidation means on a memory substrate.
            if (pu.node > 0) {
              const k = Math.min(pu.path[pu.node - 1], at) + '-' + Math.max(pu.path[pu.node - 1], at);
              this._wt = this._wt || {};
              this._wt[k] = Math.min(1, (this._wt[k] || 0) + 0.12);
            }
          }
          pu.dwell = 2 + (Math.random() * 3 | 0);
          // Branching: at a well-connected node the impulse forks, the way an axon
          // collateral carries the same signal down a second path.
          if (pu.gen < 2 && Math.random() < 0.26 && this._pulses.length < 56) {
            const alts = this.edges.filter(e => e[0] === at || e[1] === at)
              .map(e => (e[0] === at ? e[1] : e[0]))
              .filter(n => n !== pu.path[pu.node + 1]);
            if (alts.length) {
              const branch = [at];
              let cur = alts[(Math.random() * alts.length) | 0];
              branch.push(cur);
              for (let k = 0; k < 4; k++) {
                const nx = this.edges.filter(e => e[0] === cur || e[1] === cur)
                  .map(e => (e[0] === cur ? e[1] : e[0]))
                  .filter(n => branch.indexOf(n) < 0);
                if (!nx.length) break;
                cur = nx[(Math.random() * nx.length) | 0];
                branch.push(cur);
              }
              if (branch.length > 2) this._pulses.push({ path:branch, node:0, phase:0,
                dwell:0, tone:pu.tone, sp:pu.sp * 0.92, gen:pu.gen + 1 });
            }
          }
        }
        const i0 = Math.min(pu.node, pu.path.length - 2);
        const f = pu.dwell > 0 ? 0 : pu.phase;
        const a = proj[pu.path[i0]], b = proj[pu.path[i0 + 1]];
        // A pulse whose node index has walked onto the last hop has no next node to
        // interpolate toward. Rare and timing-dependent — it needs the frame to land in
        // the one tick between arrival and retirement — which is why it read as
        // intermittent rather than deterministic. Guarded rather than reordered: the
        // pulse is retired by its own lifecycle, not by the renderer.
        if (!a || !b) return;
        const x = a.sx + (b.sx - a.sx) * f, y = a.sy + (b.sy - a.sy) * f;
        // All-or-nothing: full amplitude the whole way, fading only near the path's end.
        const fade = Math.min(1, (pu.path.length - 1 - pu.node) * 0.9);
        // A tail behind the head, so a firing has direction rather than just position.
        for (let k = 1; k <= 6; k++) {
          const tf = Math.max(0, f - k * 0.11);
          const tx = a.sx + (b.sx - a.sx) * tf, ty = a.sy + (b.sy - a.sy) * tf;
          ctx.fillStyle = rgba(pu.tone, Math.max(0, fade) * (0.30 - k * 0.045));
          ctx.beginPath(); ctx.arc(tx, ty, 3.4 - k * 0.4, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = rgba(pu.tone, Math.max(0, fade) * 0.26);
        ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(light ? '#4a3208' : '#fff6e2', Math.max(0, fade));
        ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill();
        return true;
      });
    }
  }

  customElements.define('mind-brain', MindBrain);
})();
