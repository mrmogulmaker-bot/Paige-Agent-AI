// <fleet-field> — projected 3D orbital field of every tenant on the platform.
// Nodes: radius by revenue, hue by tier, ring by health. Driven by an interval clock
// (animation frames are suspended in embedded frames), motion-safe with an in-canvas toggle.
(function () {
  const TIER = {
    Agency: "#7C6CE0",
    Solo: "#3F7F5C",
    Enterprise: "#B5822A",
    Sub: "#2F6B8F"
  };

  class FleetField extends HTMLElement {
    connectedCallback() {
      if (this._up) return;
      this._up = true;
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML =
        '<style>:host{display:block;position:relative;width:100%;height:100%}' +
        'canvas{display:block;width:100%;height:100%;cursor:grab}' +
        '.t{position:absolute;right:10px;bottom:10px;padding:5px 10px;border-radius:20px;' +
        'border:1px solid rgba(255,253,248,.74);background:rgba(25,18,49,.6);color:#EDE9F6;' +
        'font:600 10.5px/1 Söhne,system-ui,sans-serif;letter-spacing:.04em;cursor:pointer;user-select:none}' +
        '</style><canvas></canvas><div class="t"></div>';
      this.cv = root.querySelector("canvas");
      this.tg = root.querySelector(".t");
      this.ctx = this.cv.getContext("2d");
      this.nodes = [];
      this.motion = true;
      this.t = 0;
      this.yaw = 0.4;
      this.tilt = -0.2;
      this.mx = -1e4;
      this.my = -1e4;
      this.drag = null;
      this.hot = -1;

      this.tg.textContent = "Motion on";
      this.tg.onclick = () => {
        this.motion = !this.motion;
        this.tg.textContent = this.motion ? "Motion on" : "Motion off";
      };
      this.cv.onpointerdown = e => {
        this.drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, tilt: this.tilt };
        this.cv.setPointerCapture(e.pointerId);
      };
      this.cv.onpointermove = e => {
        const r = this.cv.getBoundingClientRect();
        this.mx = e.clientX - r.left;
        this.my = e.clientY - r.top;
        if (this.drag) {
          this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.006;
          this.tilt = Math.max(-0.9, Math.min(0.9, this.drag.tilt + (e.clientY - this.drag.y) * 0.004));
        }
      };
      this.cv.onpointerup = () => { this.drag = null; };
      this.cv.onpointerleave = () => { this.mx = -1e4; this.my = -1e4; };
      this.cv.onclick = () => {
        if (this.hot < 0) return;
        this.dispatchEvent(new CustomEvent("pick", { detail: this.nodes[this.hot].data, bubbles: true, composed: true }));
      };

      this.clock = setInterval(() => this.draw(), 25);
      this.draw();
    }

    disconnectedCallback() { clearInterval(this.clock); }

    setTenants(list) {
      const n = list.length;
      const max = list.reduce((a, t) => Math.max(a, t.mrr || 0), 1);
      this.nodes = list.map((t, i) => {
        // fibonacci shell so the field reads volumetric rather than as a ring
        const k = (i + 0.5) / n;
        const phi = Math.acos(1 - 2 * k);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const shell = 0.62 + ((i * 37) % 100) / 260;
        return {
          x: Math.sin(phi) * Math.cos(theta) * shell,
          y: Math.cos(phi) * shell * 0.82,
          z: Math.sin(phi) * Math.sin(theta) * shell,
          r: 3.4 + Math.sqrt((t.mrr || 0) / max) * 7.5,
          hue: TIER[t.tier] || TIER.Solo,
          risk: !!t.risk,
          data: t,
          seed: (i * 91) % 360
        };
      });
    }

    draw() {
      const ctx = this.ctx, cv = this.cv;
      const rect = cv.getBoundingClientRect();
      if (!rect.width) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = rect.width, H = rect.height;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      if (this.motion) {
        this.t += 1 / 40;
        if (!this.drag) {
          this.yaw += 0.0055;
          this.tilt = -0.2 + Math.sin(this.t * 0.18) * 0.09;
        }
      }

      // volumetric ground
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.62);
      g.addColorStop(0, "rgba(30,51,88,.26)");
      g.addColorStop(0.55, "rgba(16,24,40,.12)");
      g.addColorStop(1, "rgba(25,18,49,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      const cx = W / 2, cy = H / 2;
      const scale = Math.min(W, H) * 0.40;
      const cy1 = Math.cos(this.yaw), sy1 = Math.sin(this.yaw);
      const ct = Math.cos(this.tilt), st = Math.sin(this.tilt);

      const pts = this.nodes.map((n, i) => {
        const x1 = n.x * cy1 - n.z * sy1;
        const z1 = n.x * sy1 + n.z * cy1;
        const y2 = n.y * ct - z1 * st;
        const z2 = n.y * st + z1 * ct;
        const persp = 1 / (1 + z2 * 0.34);
        return {
          i, n,
          sx: cx + x1 * scale * persp,
          sy: cy + y2 * scale * persp,
          sz: z2,
          rr: n.r * persp,
          fade: Math.max(0.18, Math.min(1, 0.72 - z2 * 0.42))
        };
      }).sort((a, b) => b.sz - a.sz);

      // proximity pick
      this.hot = -1;
      let best = 1e9;
      pts.forEach(p => {
        const d = Math.hypot(p.sx - this.mx, p.sy - this.my);
        if (d < Math.max(14, p.rr + 8) && d < best) { best = d; this.hot = p.i; }
      });

      // sparse connective tissue between neighbours
      ctx.lineWidth = 1;
      for (let a = 0; a < pts.length; a += 1) {
        for (let b = a + 1; b < Math.min(pts.length, a + 4); b++) {
          const d = Math.hypot(pts[a].sx - pts[b].sx, pts[a].sy - pts[b].sy);
          if (d > scale * 0.52) continue;
          const al = (1 - d / (scale * 0.52)) * 0.16 * Math.min(pts[a].fade, pts[b].fade);
          ctx.strokeStyle = "rgba(150,178,224," + al.toFixed(3) + ")";
          ctx.beginPath();
          ctx.moveTo(pts[a].sx, pts[a].sy);
          ctx.lineTo(pts[b].sx, pts[b].sy);
          ctx.stroke();
        }
      }

      pts.forEach(p => {
        const hot = p.i === this.hot;
        const pulse = this.motion ? 1 + Math.sin(this.t * 1.5 + p.n.seed) * 0.05 : 1;
        const r = p.rr * pulse * (hot ? 1.28 : 1);
        const glow = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 3.1);
        glow.addColorStop(0, hex(p.n.hue, 0.34 * p.fade));
        glow.addColorStop(1, hex(p.n.hue, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r * 3.1, 0, 6.2832);
        ctx.fill();

        ctx.fillStyle = hex(p.n.hue, Math.min(1, p.fade + 0.18));
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, 6.2832);
        ctx.fill();

        if (p.n.risk) {
          ctx.strokeStyle = "rgba(224,120,96," + (0.85 * p.fade).toFixed(3) + ")";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, r + 4.5, 0, 6.2832);
          ctx.stroke();
        }

        if (hot) {
          const t = p.n.data;
          const label = t.name;
          const meta = t.tier + " · $" + (t.mrr || 0).toLocaleString() + "/mo";
          ctx.font = "600 12px Söhne,system-ui,sans-serif";
          const w = Math.max(ctx.measureText(label).width, ctx.measureText(meta).width) + 22;
          const bx = Math.min(W - w - 6, p.sx + 14), by = p.sy - 30;
          ctx.fillStyle = "rgba(25,18,49,.88)";
          ctx.strokeStyle = hex(p.n.hue, 0.5);
          ctx.lineWidth = 1;
          rr(ctx, bx, by, w, 42, 9);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#FFFDF8";
          ctx.fillFrom = null;
          ctx.fillText(label, bx + 11, by + 18);
          ctx.font = "10.5px 'IBM Plex Mono',monospace";
          ctx.fillStyle = hex(p.n.hue, 0.95);
          ctx.fillText(meta, bx + 11, by + 33);
        }
      });
    }
  }

  function hex(h, a) {
    const c = h.replace("#", "");
    const v = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16));
    return "rgba(" + v.join(",") + "," + a + ")";
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  if (!customElements.get("fleet-field")) customElements.define("fleet-field", FleetField);
})();
