import { useEffect, useRef } from "react";

/**
 * HeroCanvas — a self-contained, dependency-free WebGL hero background.
 *
 * Renders a flowing, GPU-shaded navy→gold field (domain-warped fractal noise)
 * with a soft cursor-reactive glow. Designed as the ambient backdrop behind the
 * landing hero copy for a "dominant tech platform" feel.
 *
 * Safe by construction: pointer-events-none, DPR-capped, pauses when offscreen,
 * honors prefers-reduced-motion (renders a single static frame), and no-ops if
 * WebGL is unavailable (the CSS gradient behind it remains the fallback).
 */
export function HeroCanvas({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) return; // graceful fallback to the CSS gradient underneath

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const vert = `
      attribute vec2 p;
      void main() { gl_Position = vec4(p, 0.0, 1.0); }
    `;

    // Domain-warped fractal-noise field, mapped from deep navy to brand gold,
    // with a subtle cursor glow and a vignette for depth.
    const frag = `
      precision highp float;
      uniform vec2  u_res;
      uniform float u_time;
      uniform vec2  u_mouse;   // 0..1
      uniform float u_mouseOn;

      // hash / value noise
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i+vec2(0,0)), hash(i+vec2(1,0)), u.x),
                   mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a*noise(p); p *= 2.02; a *= 0.5; }
        return v;
      }

      void main(){
        vec2 uv = gl_FragCoord.xy / u_res.xy;
        vec2 asp = vec2(u_res.x / u_res.y, 1.0);
        vec2 p = (uv - 0.5) * asp;

        float t = u_time * 0.05;

        // domain warp for organic flow
        vec2 q = vec2(fbm(p*1.5 + vec2(0.0, t)), fbm(p*1.5 + vec2(5.2, -t)));
        vec2 r = vec2(fbm(p*1.5 + 3.0*q + vec2(1.7, 9.2) + t*0.5),
                      fbm(p*1.5 + 3.0*q + vec2(8.3, 2.8) - t*0.5));
        float f = fbm(p*1.5 + 2.5*r);

        // brand palette
        vec3 navy   = vec3(0.039, 0.086, 0.157); // #0a1628
        vec3 navy2  = vec3(0.055, 0.118, 0.212);
        vec3 gold   = vec3(0.812, 0.682, 0.439); // #CFAE70
        vec3 col = mix(navy, navy2, clamp(f*1.4, 0.0, 1.0));
        // gold filaments in the ridges of the field
        float ridge = smoothstep(0.55, 0.85, f) * (0.35 + 0.65*r.x);
        col = mix(col, gold, ridge * 0.55);

        // cursor glow
        vec2 m = (u_mouse - 0.5) * asp;
        float d = length(p - m);
        col += gold * u_mouseOn * smoothstep(0.6, 0.0, d) * 0.18;

        // vignette
        float vig = smoothstep(1.15, 0.25, length((uv-0.5)*asp));
        col *= 0.55 + 0.45*vig;

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("[HeroCanvas] shader error:", gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, vert);
    const fs = compile(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");
    const uMouseOn = gl.getUniformLocation(prog, "u_mouseOn");

    const mouse = { x: 0.5, y: 0.5, on: 0 };
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) / rect.width;
      mouse.y = 1.0 - (e.clientY - rect.top) / rect.height;
      mouse.on = 1;
    };
    const onLeave = () => { mouse.on = 0; };
    canvas.parentElement?.addEventListener("pointermove", onMove);
    canvas.parentElement?.addEventListener("pointerleave", onLeave);

    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true; }, { threshold: 0.01 });
    io.observe(canvas);

    const start = performance.now();
    const draw = (now: number) => {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uMouseOn, mouse.on);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduceMotion && visible) raf = requestAnimationFrame(draw);
    };
    if (reduceMotion) {
      draw(start); // single static frame
    } else {
      const loop = (now: number) => { if (visible) draw(now); else raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.parentElement?.removeEventListener("pointermove", onMove);
      canvas.parentElement?.removeEventListener("pointerleave", onLeave);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`absolute inset-0 h-full w-full pointer-events-none ${className}`}
    />
  );
}
