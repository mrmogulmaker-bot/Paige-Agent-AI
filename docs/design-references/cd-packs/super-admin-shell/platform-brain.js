// <platform-brain> — platform-scale second brain.
//
// Rendered as a genuine depth composition rather than a decorated diagram:
// every element (mote, dendrite, hub, nucleus, core) is depth-sorted into one
// painter list, so near structures occlude far ones; z-fog desaturates depth;
// a dendritic mesh links neighbouring documents so the corpus reads as tissue,
// not dust; and spikes travel that mesh to the hub, then to the core.
//
// Canvas 2D on an interval clock (animation frames are suspended in embedded
// frames), motion-safe, with an explicit MOTION toggle.
(function () {
  if (window.customElements && customElements.get('platform-brain')) return;

  const TAU = Math.PI * 2;

  const rgbOf = h => {
    const c = h.replace('#', '');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  };
  const hex = (h, a) => { const c = rgbOf(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  // z-fog: mix a colour toward the field's deep navy by depth
  const fog = (h, near, a) => {
    const c = rgbOf(h), k = 0.72 + near * 0.28;
    const r = Math.round(c[0] * k + 10 * (1 - k));
    const g = Math.round(c[1] * k + 14 * (1 - k));
    const b = Math.round(c[2] * k + 26 * (1 - k));
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  };

  function mulberry(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Rejection-sample inside a bilobed envelope: two overlapping ellipsoids with
  // a central fissure and a lower stem taper.
  function envelopePoint(rng, shell) {
    for (let i = 0; i < 400; i++) {
      const x = (rng() * 2 - 1) * 1.02;
      const y = (rng() * 2 - 1) * 0.80;
      const z = (rng() * 2 - 1) * 0.86;
      const cx = (x < 0 ? -1 : 1) * 0.30;
      const dx = (x - cx) / 0.74, dy = y / 0.74, dz = z / 0.80;
      const d = dx * dx + dy * dy + dz * dz;
      if (d > 1) continue;
      if (Math.abs(x) < 0.075 && y > -0.30) continue;
      if (y < -0.46 && Math.abs(x) > 0.34) continue;
      if (shell > 0 && Math.sqrt(d) < 1 - shell * 0.34) continue;
      return [x, y, z];
    }
    return [0.4, 0, 0];
  }

  class PlatformBrain extends HTMLElement {
    connectedCallback() {
      if (this._up) { if (!this._clock && this._tick) this._clock = setInterval(this._tick, 25); return; }
      this._up = true;

      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML =
        '<style>' +
        ':host{display:block;position:relative;width:100%;height:100%;}' +
        'canvas{display:block;width:100%;height:100%;cursor:grab;}' +
        'canvas.drag{cursor:grabbing;}' +
        '.ui{position:absolute;bottom:10px;right:12px;display:flex;gap:6px;font:600 10px/1 ui-sans-serif,system-ui,sans-serif;}' +
        '.ui button{appearance:none;border:1px solid rgba(255,253,248,.28);background:rgba(25,18,49,.55);' +
        'color:rgba(255,253,248,.86);border-radius:20px;padding:5px 10px;cursor:pointer;letter-spacing:.06em;}' +
        '.ui button:hover{background:rgba(255,253,248,.16);color:#FFFDF8;}' +
        '.ui button[data-on="1"]{border-color:rgba(231,201,122,.7);color:#E7C97A;}' +
        'font:500 9.5px/1.3 ui-sans-serif,system-ui,sans-serif;color:rgba(255,253,248,.74);pointer-events:none;}' +
        '.tip{position:absolute;pointer-events:none;padding:5px 9px;border-radius:8px;' +
        'background:rgba(25,18,49,.9);border:1px solid rgba(255,253,248,.18);color:#FFFDF8;' +
        'font:600 10.5px/1.3 ui-sans-serif,system-ui,sans-serif;opacity:0;transition:opacity .12s;white-space:nowrap;}' +
        '.tip b{display:block;font-weight:500;color:rgba(255,253,248,.7);margin-top:2px;}' +
        '</style>' +
        '<canvas></canvas>' +
        '<div class="tip"></div>' +
        '<div class="ui"><button data-k="motion">MOTION</button><button data-k="reset">RECENTER</button></div>';

      const cv = root.querySelector('canvas');
      const ctx = cv.getContext('2d');
      const tip = root.querySelector('.tip');
      const btnMotion = root.querySelector('[data-k="motion"]');
      const btnReset = root.querySelector('[data-k="reset"]');

      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let motion = true;
      btnMotion.dataset.on = '1';

      let yaw = 0.42, tilt = -0.20, zoom = 1, t = 0;
      let W = 0, H = 0;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      let drag = null, mx = -1e4, my = -1e4, focus = -1, hover = -1, hoverMote = -1;

      let domains = [], hubs = [], cortex = [], edges = [], nuclei = [], spikes = [];

      const build = () => {
        const rng = mulberry(20260817);
        hubs = domains.map((d, i) => {
          const p = envelopePoint(rng, 0.22);
          return { x: p[0], y: p[1], z: p[2], color: d.color, name: d.name, docs: d.docs, i: i };
        });

        cortex = [];
        const total = domains.reduce((a, d) => a + (d.docs || 1), 0) || 1;
        const budget = 980;
        domains.forEach((d, i) => {
          const n = Math.max(8, Math.round(((d.docs || 1) / total) * budget));
          const h = hubs[i];
          for (let k = 0; k < n; k++) {
            // most motes sit near the surface so the bilobed shape stays legible;
            // a third fill the interior so it reads as volume, not a hollow husk
            const surface = rng() < 0.66;
            const p = envelopePoint(rng, surface ? 0.94 : 0.42);
            const w = surface ? 0.14 + rng() * 0.20 : 0.44 + rng() * 0.26;
            cortex.push({
              x: p[0] * (1 - w) + h.x * w,
              y: p[1] * (1 - w) + h.y * w,
              z: p[2] * (1 - w) + h.z * w,
              hub: i, ph: rng() * TAU, sp: 0.5 + rng() * 0.9, idx: cortex.length
            });
          }
        });

        // dendritic mesh — link each mote to its two nearest same-domain neighbours,
        // which is what turns a point cloud into tissue.
        edges = [];
        const byHub = {};
        cortex.forEach(m => { (byHub[m.hub] = byHub[m.hub] || []).push(m); });
        Object.keys(byHub).forEach(k => {
          const list = byHub[k];
          list.forEach(a => {
            const near = list
              .filter(b => b !== a)
              .map(b => [(a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2, b])
              .sort((p, q) => p[0] - q[0])
              .slice(0, 4);
            near.forEach(([d2, b]) => {
              if (d2 > 0.062) return;
              if (a.idx < b.idx) edges.push({ a: a, b: b, hub: a.hub, myelin: 2 + ((a.idx + b.idx) % 3), fired: -99 });
            });
          });
        });

        nuclei = [];
        for (let k = 0; k < 13; k++) {
          const ang = (k / 13) * TAU;
          const r = 0.28 + (k % 3) * 0.05;
          nuclei.push({ x: Math.cos(ang) * r * 1.1, y: Math.sin(ang * 1.7) * 0.19 - 0.04, z: Math.sin(ang) * r, ph: k * 0.48 });
        }
        spikes = [];
      };

      // a spike walks the dendrite mesh toward its hub, then jumps to the core
      // stimulus strength is encoded as firing frequency, so spikes arrive in bursts
      const spawn = () => {
        if (!cortex.length) return;
        const burst = 1 + ((Math.random() * 3) | 0);
        for (let i = 0; i < burst; i++) {
          const m = cortex[(Math.random() * cortex.length) | 0];
          spikes.push({ node: m, hub: m.hub, k: -i * 0.5, hops: 0, leg: 0, prev: null, next: null, life: 1, edge: null, flash: 0 });
        }
        if (spikes.length > 40) spikes.splice(0, spikes.length - 40);
      };
      const stepSpike = s => {
        const hub = hubs[s.hub];
        const cands = edges
          .filter(e => e.a === s.node || e.b === s.node)
          .map(e => (e.a === s.node ? e.b : e.a))
          .filter(n => n !== s.prev);
        // walk toward the hub
        cands.sort((a, b) => {
          const da = (a.x - hub.x) ** 2 + (a.y - hub.y) ** 2 + (a.z - hub.z) ** 2;
          const db = (b.x - hub.x) ** 2 + (b.y - hub.y) ** 2 + (b.z - hub.z) ** 2;
          return da - db;
        });
        if (!cands.length || s.hops >= 4) { s.leg = 1; s.next = hub; s.edge = null; return; }
        s.prev = s.node;
        s.next = cands[0];
        // the segment just traversed enters its refractory period — it cannot carry
        // another spike backward, and it glows cool while it recovers
        s.edge = edges.find(e => (e.a === s.node && e.b === s.next) || (e.b === s.node && e.a === s.next)) || null;
        if (s.edge) s.edge.fired = t;
        s.hops++;
      };

      const project = (p, cs, sn, ct, st2) => {
        const x = p.x * cs - p.z * sn;
        let z = p.x * sn + p.z * cs;
        const y = p.y * ct - z * st2;
        z = p.y * st2 + z * ct;
        const persp = 1 / (1 + z * 0.30);
        return { sx: x * persp, sy: y * persp, d: z, s: persp, near: (z + 1.2) / 2.4 };
      };

      const draw = () => {
        const r = this.getBoundingClientRect();
        const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
        if (w !== W || h !== H) {
          W = w; H = h;
          cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        if (!W || !hubs.length) return;

        if (motion) {
          t += 1 / 40;
          if (!drag) { yaw += 0.0039; tilt = -0.20 + Math.sin(t * 0.09) * 0.08; }
          if (Math.random() < 0.055) spawn();
        }

        ctx.clearRect(0, 0, W, H);

        const breath = motion ? 0.5 + Math.sin(t * 0.5) * 0.5 : 0.5;
        const bg = ctx.createRadialGradient(W / 2, H * 0.48, 0, W / 2, H * 0.48, Math.max(W, H) * 0.64);
        bg.addColorStop(0, 'rgba(30,26,74,' + (0.30 + breath * 0.08).toFixed(3) + ')');
        bg.addColorStop(0.55, 'rgba(11,13,28,.34)');
        bg.addColorStop(1, 'rgba(8,10,22,0)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        const cs = Math.cos(yaw), sn = Math.sin(yaw), ct = Math.cos(tilt), st2 = Math.sin(tilt);

        // project, then fit the measured mass to the panel
        const pts = cortex.map(p => project(p, cs, sn, ct, st2));
        let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        pts.forEach(q => { if (q.sx < minX) minX = q.sx; if (q.sx > maxX) maxX = q.sx; if (q.sy < minY) minY = q.sy; if (q.sy > maxY) maxY = q.sy; });
        const fit = Math.min((W * 0.80) / Math.max(0.2, maxX - minX), (H * 0.82) / Math.max(0.2, maxY - minY)) * zoom;
        const cxp = W / 2 - ((minX + maxX) / 2) * fit;
        const cyp = H / 2 - ((minY + maxY) / 2) * fit;
        const X = q => cxp + q.sx * fit, Y = q => cyp + q.sy * fit;

        const core = project({ x: 0, y: -0.02, z: 0 }, cs, sn, ct, st2);
        const hubQ = hubs.map(p => project(p, cs, sn, ct, st2));
        const nucQ = nuclei.map(p => project(p, cs, sn, ct, st2));
        const dim = i => (focus >= 0 && focus !== i) ? 0.16 : (hover >= 0 && hover !== i) ? 0.30 : 1;

        // ---- one depth-sorted painter list: this is what makes it read as volume
        const paint = [];

        edges.forEach(e => {
          const qa = pts[e.a.idx], qb = pts[e.b.idx];
          paint.push({ z: (qa.d + qb.d) / 2, kind: 'edge', qa: qa, qb: qb, hub: e.hub, e: e });
        });
        cortex.forEach((m, i) => paint.push({ z: pts[i].d, kind: 'mote', q: pts[i], m: m, i: i }));
        hubQ.forEach((q, i) => paint.push({ z: q.d, kind: 'hub', q: q, i: i }));
        nucQ.forEach((q, i) => paint.push({ z: q.d, kind: 'nucleus', q: q, i: i }));
        paint.push({ z: core.d, kind: 'core', q: core });
        paint.sort((a, b) => b.z - a.z);

        ctx.globalCompositeOperation = 'lighter';

        paint.forEach(it => {
          if (it.kind === 'edge') {
            const near = (it.qa.near + it.qb.near) / 2;
            const d = dim(it.hub);
            const ax = X(it.qa), ay = Y(it.qa), bx = X(it.qb), by = Y(it.qb);
            const since = t - (it.e.fired == null ? -99 : it.e.fired);
            const refractory = since >= 0 && since < 2.2 ? 1 - since / 2.2 : 0;

            // myelin: n insulated segments with unmyelinated gaps between them
            const segs = it.e.myelin || 2;
            const gap = 0.13;
            const base = (0.085 + near * 0.20) * d;
            for (let s = 0; s < segs; s++) {
              const t0 = s / segs + gap / 2, t1 = (s + 1) / segs - gap / 2;
              ctx.strokeStyle = refractory
                ? 'rgba(126,166,255,' + ((base + refractory * 0.30) * d).toFixed(3) + ')'
                : fog(hubs[it.hub].color, near, base);
              ctx.lineWidth = (0.5 + near * 0.7) * (refractory ? 1.7 : 1);
              ctx.beginPath();
              ctx.moveTo(ax + (bx - ax) * t0, ay + (by - ay) * t0);
              ctx.lineTo(ax + (bx - ax) * t1, ay + (by - ay) * t1);
              ctx.stroke();
            }
            // nodes of Ranvier — the bare points where a spike regenerates
            if (near > 0.62) {
              for (let s = 1; s < segs; s++) {
                const tn = s / segs;
                ctx.fillStyle = refractory
                  ? 'rgba(126,166,255,' + (0.2 + refractory * 0.4).toFixed(3) + ')'
                  : fog(hubs[it.hub].color, near, 0.16 * d);
                ctx.beginPath();
                ctx.arc(ax + (bx - ax) * tn, ay + (by - ay) * tn, 0.9 * it.qa.s, 0, TAU);
                ctx.fill();
              }
            }
            return;
          }

          if (it.kind === 'mote') {
            const tw = motion ? 0.74 + Math.sin(t * it.m.sp + it.m.ph) * 0.26 : 1;
            const on = hoverMote === it.i;
            const a = Math.min(1, (0.36 + it.q.near * 0.58) * tw * dim(it.m.hub));
            ctx.fillStyle = fog(hubs[it.m.hub].color, it.q.near, on ? 0.95 : a);
            const rr = (0.62 + it.q.near * 1.3) * it.q.s * (on ? 2.6 : 1);
            ctx.beginPath(); ctx.arc(X(it.q), Y(it.q), rr, 0, TAU); ctx.fill();
            return;
          }

          if (it.kind === 'nucleus') {
            const pulse = motion ? 0.6 + Math.sin(t * 1.1 + nuclei[it.i].ph) * 0.4 : 0.8;
            ctx.fillStyle = fog('#B0A2FF', it.q.near, 0.16 + pulse * 0.30);
            ctx.beginPath(); ctx.arc(X(it.q), Y(it.q), (1.5 + pulse * 1.1) * it.q.s, 0, TAU); ctx.fill();
            return;
          }

          if (it.kind === 'hub') {
            const q = it.q, d = hubs[it.i], a = dim(it.i);
            // myelinated pathway to the core, drawn at the hub's own depth
            const g = ctx.createLinearGradient(X(q), Y(q), X(core), Y(core));
            g.addColorStop(0, fog(d.color, q.near, 0.20 * a));
            g.addColorStop(1, 'rgba(176,162,255,' + (0.13 * a).toFixed(3) + ')');
            ctx.strokeStyle = g;
            ctx.lineWidth = (1.0 + q.near * 1.1) * q.s;
            ctx.beginPath(); ctx.moveTo(X(q), Y(q)); ctx.lineTo(X(core), Y(core)); ctx.stroke();

            const rr = (3.2 + q.near * 1.7) * q.s;
            const inbound = spikes.filter(sp => sp.hub === it.i).length;
            const bl = Math.min(1, inbound / 5);
            if (bl > 0) {
              const hb = ctx.createRadialGradient(X(q), Y(q), 0, X(q), Y(q), rr * 5);
              hb.addColorStop(0, fog(d.color, q.near, 0.22 * bl * a));
              hb.addColorStop(1, fog(d.color, q.near, 0));
              ctx.fillStyle = hb;
              ctx.beginPath(); ctx.arc(X(q), Y(q), rr * 5, 0, TAU); ctx.fill();
            }
            ctx.fillStyle = fog(d.color, q.near, 0.18 * a);
            ctx.beginPath(); ctx.arc(X(q), Y(q), rr * 2.7, 0, TAU); ctx.fill();
            ctx.fillStyle = fog(d.color, q.near, 0.95 * a);
            ctx.beginPath(); ctx.arc(X(q), Y(q), rr, 0, TAU); ctx.fill();
            ctx.strokeStyle = 'rgba(255,253,248,' + (0.42 * a * q.near).toFixed(3) + ')';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(X(q), Y(q), rr + 2.4, 0, TAU); ctx.stroke();
            return;
          }

          // core: layered shells with a specular arc that tracks the rotation
          const q = it.q;
          const pulse = motion ? 0.6 + Math.sin(t * 0.8) * 0.4 : 0.8;
          const halo = ctx.createRadialGradient(X(q), Y(q), 0, X(q), Y(q), 32 + pulse * 18);
          halo.addColorStop(0, 'rgba(231,201,122,.58)');
          halo.addColorStop(0.42, 'rgba(200,160,46,.22)');
          halo.addColorStop(1, 'rgba(200,160,46,0)');
          ctx.fillStyle = halo;
          ctx.beginPath(); ctx.arc(X(q), Y(q), 32 + pulse * 18, 0, TAU); ctx.fill();
          for (let s = 3; s >= 1; s--) {
            ctx.strokeStyle = 'rgba(231,201,122,' + (0.10 + s * 0.05).toFixed(3) + ')';
            ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.arc(X(q), Y(q), 5 + s * 4.5, 0, TAU); ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#F6E7BC';
          ctx.beginPath(); ctx.arc(X(q), Y(q), 4.4, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,253,248,.85)';
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(X(q), Y(q), 6.6, yaw + 0.6, yaw + 1.9); ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';
        });

        // ---- spikes travelling the mesh
        if (motion) {
          spikes.forEach(s => {
            if (s.k < 0) { s.k += 0.045; return; }
            if (!s.next) stepSpike(s);
            // saltatory: the front leaps a whole segment, it does not slide along it
            s.k += s.leg === 1 ? 0.024 : 0.048;
            if (s.flash > 0) s.flash -= 0.05;
            if (s.k >= 1) {
              s.k = 0;
              s.flash = 1;
              if (s.leg === 1) { s.life = 0; return; }
              s.node = s.next; s.next = null;
              return;
            }
            const qa = project(s.node, cs, sn, ct, st2);
            const qb = project(s.next, cs, sn, ct, st2);
            const ax = X(qa), ay = Y(qa), bx = X(qb), by = Y(qb);
            // ease the leap so it reads as a jump between nodes, not a constant crawl
            const e = s.k < 0.5 ? 2 * s.k * s.k : 1 - Math.pow(-2 * s.k + 2, 2) / 2;
            const px = ax + (bx - ax) * e, py = ay + (by - ay) * e;

            // depolarised segment behind the front, still bright
            const g = ctx.createLinearGradient(ax, ay, px, py);
            g.addColorStop(0, 'rgba(126,166,255,.12)');
            g.addColorStop(0.55, 'rgba(95,211,168,.42)');
            g.addColorStop(1, 'rgba(190,255,228,.92)');
            ctx.strokeStyle = g;
            ctx.lineWidth = s.leg === 1 ? 2.1 : 1.6;
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px, py); ctx.stroke();

            // the front: a small bloom, brightest at the leading edge
            const bloom = ctx.createRadialGradient(px, py, 0, px, py, 7);
            bloom.addColorStop(0, 'rgba(220,255,240,.95)');
            bloom.addColorStop(0.4, 'rgba(120,230,190,.42)');
            bloom.addColorStop(1, 'rgba(95,211,168,0)');
            ctx.fillStyle = bloom;
            ctx.beginPath(); ctx.arc(px, py, 7, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(235,255,246,.98)';
            ctx.beginPath(); ctx.arc(px, py, 1.7, 0, TAU); ctx.fill();

            // regeneration flash at the node it just reached
            if (s.flash > 0) {
              ctx.strokeStyle = 'rgba(170,246,216,' + (s.flash * 0.7).toFixed(3) + ')';
              ctx.lineWidth = 1.1;
              ctx.beginPath(); ctx.arc(ax, ay, (1 - s.flash) * 9 + 2, 0, TAU); ctx.stroke();
            }
          });
          spikes = spikes.filter(s => s.life > 0);
        }

        ctx.globalCompositeOperation = 'source-over';

        // ---- hub labels, painted front-to-back so near labels win
        const drawn = [];
        hubQ.map((q, i) => [q.d, i]).sort((a, b) => a[0] - b[0]).forEach(([, i]) => {
          const q = hubQ[i], d = hubs[i], a = dim(i);
          if (a < 0.5) return;
          ctx.font = "600 11.5px 'Söhne',system-ui,sans-serif";
          const tw = Math.max(ctx.measureText(d.name).width, 74) + 26;
          // keep the whole plate inside the canvas, flipping side when there is no room
          let right = X(q) > W / 2;
          if (right && X(q) + 15 + tw > W - 6) right = false;
          if (!right && X(q) - 15 - tw < 6) right = true;
          const ly = Math.max(24, Math.min(H - 16, Y(q)));
          let lx = X(q) + (right ? 15 : -15);
          let px = right ? lx - 10 : lx - tw + 6;
          px = Math.max(4, Math.min(W - tw - 10, px));
          lx = right ? px + 10 : px + tw - 6;
          // one label per band: skip anything overlapping a plate already drawn
          const box = { x: px, y: ly - 17, w: tw + 6, h: 30 };
          const hit = drawn.some(b => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y);
          if (hit) return;
          drawn.push(box);
          ctx.textAlign = right ? 'left' : 'right';
          const gp = ctx.createLinearGradient(px, 0, px + tw, 0);
          gp.addColorStop(0, right ? 'rgba(25,18,49,.72)' : 'rgba(25,18,49,0)');
          gp.addColorStop(1, right ? 'rgba(25,18,49,0)' : 'rgba(25,18,49,.72)');
          ctx.fillStyle = gp;
          ctx.fillRect(px, ly - 17, tw + 6, 30);
          ctx.fillStyle = hex(d.color, 0.97);
          ctx.fillText(d.name, right ? lx : px + tw - 6, ly - 2);
          ctx.font = "9.5px 'IBM Plex Mono',monospace";
          ctx.fillStyle = 'rgba(255,253,248,.62)';
          ctx.fillText(d.docs + ' docs', right ? lx : px + tw - 6, ly + 11);
        });

        // ---- hover picking: hubs first, then individual documents
        hover = -1; hoverMote = -1;
        if (mx > -1e3) {
          let best = 1e9;
          hubQ.forEach((q, i) => { const dx = X(q) - mx, dy = Y(q) - my, dd = dx * dx + dy * dy; if (dd < 900 && dd < best) { best = dd; hover = i; } });
          if (hover < 0) {
            let bm = 1e9;
            pts.forEach((q, i) => { const dx = X(q) - mx, dy = Y(q) - my, dd = dx * dx + dy * dy; if (dd < 90 && dd < bm) { bm = dd; hoverMote = i; } });
          }
        }
        if (hoverMote >= 0) {
          const m = cortex[hoverMote], q = pts[hoverMote];
          tip.innerHTML = 'One indexed document<b>' + hubs[m.hub].name + '</b>';
          tip.style.left = Math.min(W - 170, X(q) + 12) + 'px';
          tip.style.top = Math.max(4, Y(q) - 34) + 'px';
          tip.style.opacity = '1';
        } else {
          tip.style.opacity = '0';
        }
      };

      this._tick = draw;
      this._clock = setInterval(draw, 25);
      draw();

      cv.addEventListener('pointerdown', e => {
        drag = { x: e.clientX, y: e.clientY, yaw: yaw, tilt: tilt, moved: false };
        cv.classList.add('drag');
        cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointermove', e => {
        const r = cv.getBoundingClientRect();
        mx = e.clientX - r.left; my = e.clientY - r.top;
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        yaw = drag.yaw + dx * 0.006;
        tilt = Math.max(-0.85, Math.min(0.85, drag.tilt + dy * 0.005));
      });
      cv.addEventListener('pointerup', () => {
        if (drag && !drag.moved) {
          focus = hover >= 0 && focus !== hover ? hover : -1;
          zoom = focus >= 0 ? 1.34 : 1;
          this.dispatchEvent(new CustomEvent('pick', { detail: focus >= 0 ? domains[focus] : null }));
        }
        drag = null;
        cv.classList.remove('drag');
      });
      cv.addEventListener('pointerleave', () => { mx = my = -1e4; });
      cv.addEventListener('wheel', e => {
        e.preventDefault();
        zoom = Math.max(0.7, Math.min(2.1, zoom - e.deltaY * 0.0011));
      }, { passive: false });

      btnMotion.addEventListener('click', () => { motion = !motion; btnMotion.dataset.on = motion ? '1' : '0'; });
      btnReset.addEventListener('click', () => { yaw = 0.42; tilt = -0.20; zoom = 1; focus = -1; });

      this.setDomains = list => { domains = (list || []).slice(); build(); };
      if (!domains.length) this.setDomains([{ name: 'Domain', docs: 40, color: '#7C6CE0' }]);
    }

    disconnectedCallback() { clearInterval(this._clock); this._clock = null; }
  }

  customElements.define('platform-brain', PlatformBrain);
})();
