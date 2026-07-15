"use client";

import { useEffect, useRef, useState } from "react";
import { NetworkBg } from "@/components/network-bg";

/**
 * The hero "knowledge network" as a 3D constellation. Composition is
 * DESIGNED, not uniform noise: a handful of constellation clusters (local
 * webs of short links) joined by a few long bridge lines, one glowing
 * focal node, and a sparse tail of unconnected dots drifting toward the
 * headline — knowledge not yet shared. Light pulses travel along the
 * connections; the camera breathes on a slow dolly with gentle
 * scroll/pointer parallax. Hand-rolled WebGL, no library.
 *
 * Fallback chain: reduced motion or no WebGL → the committed SVG artwork
 * (rendered underneath, crossfaded away only when GL is live).
 * Authored RTL-first (clusters on the inline-end side); mirrored for LTR
 * by flipping X at generation time.
 */
export function NetworkGL() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Low-end / data-saver bail: keep the already-rendered static SVG rather
    // than run a GL loop on devices that will struggle. Conservative — only the
    // weakest tier (Save-Data on, or ≤2GB RAM); capable mid-range phones still
    // get the constellation. deviceMemory/connection are absent on iOS Safari
    // (→ never bails there, which is correct — iPhones are capable).
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean };
      deviceMemory?: number;
    };
    if (nav.connection?.saveData || (nav.deviceMemory ?? 8) <= 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    if (!gl) return;

    const mirror = document.documentElement.dir === "ltr" ? -1 : 1;

    let seed = 20260713;
    const rand = () => {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    /* --------------------------- composition ----------------------------
       World units: camera sits ~22 away with a 40° fov, so x∈[-11,11]
       roughly spans the frame. Clusters occupy the half away from the
       headline; each is a tight local web. */
    const mobile =
      window.matchMedia("(max-width: 767px)").matches ||
      window.matchMedia("(pointer: coarse)").matches;
    type P = { x: number; y: number; z: number; size: number; alpha: number; soft: number };
    const points: P[] = [];
    const links: [P, P][] = [];

    const clusters: { cx: number; cy: number; cz: number; r: number; n: number }[] = [
      { cx: -8.2, cy: 2.4, cz: -1.0, r: 2.0, n: 8 },
      { cx: -4.0, cy: 1.4, cz: 0.8, r: 2.3, n: 10 },
      { cx: -6.8, cy: -2.2, cz: 0.3, r: 1.9, n: 8 },
      { cx: -2.4, cy: -2.8, cz: -0.8, r: 1.7, n: 6 },
      { cx: -10.4, cy: -0.4, cz: 1.0, r: 1.4, n: 5 },
    ];

    const anchors: P[] = []; // one emphasized node per cluster, used for bridges
    for (const c of clusters) {
      const members: P[] = [];
      const n = mobile ? Math.max(4, c.n - 3) : c.n;
      for (let i = 0; i < n; i++) {
        // scatter in a flattened sphere; slight shell bias keeps shapes open
        const a = rand() * Math.PI * 2;
        const rr = c.r * (0.35 + 0.65 * Math.sqrt(rand()));
        const p: P = {
          x: (c.cx + Math.cos(a) * rr) * mirror,
          y: c.cy + Math.sin(a) * rr * 0.85,
          z: c.cz + (rand() - 0.5) * 2.2,
          size: 3.2 + rand() * 3.0,
          alpha: 0.55 + rand() * 0.4,
          soft: 0,
        };
        members.push(p);
        points.push(p);
      }
      // emphasized anchor near the cluster heart
      const anchor: P = {
        x: (c.cx + (rand() - 0.5) * 0.8) * mirror,
        y: c.cy + (rand() - 0.5) * 0.8,
        z: c.cz,
        size: 8.5,
        alpha: 0.95,
        soft: 0,
      };
      anchors.push(anchor);
      points.push(anchor);

      // local web: every member links to its nearest sibling (short,
      // coherent edges only)
      const all = [...members, anchor];
      for (const p of all) {
        let best: P | null = null;
        let bestD = Infinity;
        for (const q of all) {
          if (q === p) continue;
          const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2;
          if (d < bestD && d > 0.1) {
            bestD = d;
            best = q;
          }
        }
        if (best && bestD < (c.r * 1.6) ** 2 && !links.some(([a2, b2]) => (a2 === p && b2 === best) || (a2 === best && b2 === p))) {
          links.push([p, best]);
        }
      }
      // a couple of extra chords so clusters read as webs, not chains
      for (let i = 0; i < 2 && all.length > 3; i++) {
        const p = all[Math.floor(rand() * all.length)];
        const q = all[Math.floor(rand() * all.length)];
        if (p !== q && Math.hypot(p.x - q.x, p.y - q.y) < c.r * 1.8) links.push([p, q]);
      }
    }

    // bridges: chain neighboring anchors so the whole constellation connects
    const order = [4, 0, 2, 1, 3]; // hand-picked path across the clusters
    for (let i = 0; i < order.length - 1; i++) {
      links.push([anchors[order[i]], anchors[order[i + 1]]]);
    }

    // the focal node: brightest point + a soft halo behind it
    const focal: P = { x: -4.4 * mirror, y: 0.1, z: 1.2, size: 11, alpha: 1, soft: 0 };
    points.push(focal);
    points.push({ ...focal, size: 42, alpha: 0.08, soft: 0.42 }); // halo
    links.push([focal, anchors[1]], [focal, anchors[2]]);

    // sparse unconnected tail drifting toward the headline side
    const tailN = mobile ? 5 : 9;
    for (let i = 0; i < tailN; i++) {
      points.push({
        x: (0.5 + rand() * 8.5) * mirror,
        y: -4 + rand() * 8,
        z: -2 + rand() * 4,
        size: 2.6 + rand() * 2,
        alpha: 0.18 + rand() * 0.16,
        soft: 0,
      });
    }

    const pointData: number[] = [];
    for (const p of points) {
      pointData.push(p.x, p.y, p.z, p.size, p.alpha, rand(), p.soft);
    }
    const lineData: number[] = [];
    for (const [a, b] of links) {
      const phase = rand();
      lineData.push(a.x, a.y, a.z, 0, phase, b.x, b.y, b.z, 1, phase);
    }

    /* ------------------------------ shaders ------------------------------ */
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const program = (vs: string, fs: string) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      return p;
    };

    const ptProg = program(
      `attribute vec3 aPos; attribute float aSize, aAlpha, aSeed, aSoft;
       uniform mat4 uMvp; uniform float uTime, uDpr;
       varying float vAlpha, vSoft;
       void main() {
         gl_Position = uMvp * vec4(aPos, 1.0);
         float w = gl_Position.w;
         gl_PointSize = aSize * uDpr * (22.0 / w);
         float twinkle = 0.82 + 0.18 * sin(uTime * 0.7 + aSeed * 40.0);
         vAlpha = aAlpha * twinkle;
         // depth-of-field: focus plane at w≈22; away = softer disc (bokeh).
         // Cap BELOW 0.5: smoothstep(0.5, vSoft, d) degenerates at 0.5 and
         // renders the whole point quad as a square.
         vSoft = clamp(max(abs(w - 22.0) * 0.09, aSoft), 0.07, 0.44);
       }`,
      `precision mediump float;
       varying float vAlpha, vSoft;
       void main() {
         float d = length(gl_PointCoord - 0.5);
         float a = smoothstep(0.5, vSoft, d) * vAlpha;
         gl_FragColor = vec4(0.812, 0.831, 0.867, a);
       }`,
    );

    const lnProg = program(
      `attribute vec3 aPos; attribute float aT, aPhase;
       uniform mat4 uMvp;
       varying float vT, vPhase;
       void main() { gl_Position = uMvp * vec4(aPos, 1.0); vT = aT; vPhase = aPhase; }`,
      `precision mediump float;
       uniform float uTime;
       varying float vT, vPhase;
       void main() {
         // a pulse of light travels along each connection
         float p = fract(uTime * 0.06 + vPhase);
         float glow = smoothstep(0.22, 0.0, abs(vT - p));
         float a = 0.16 + glow * 0.45;
         vec3 c = mix(vec3(0.659, 0.702, 0.769), vec3(0.92, 0.93, 0.95), glow);
         gl_FragColor = vec4(c, a);
       }`,
    );

    const buf = (data: number[]) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      return b;
    };
    const ptBuf = buf(pointData);
    const lnBuf = buf(lineData);

    /* ------------------------------ matrices ----------------------------- */
    const mat = new Float32Array(16);
    const proj = new Float32Array(16);
    const mvp = new Float32Array(16);
    const perspective = (fovy: number, aspect: number) => {
      const f = 1 / Math.tan(fovy / 2);
      proj.fill(0);
      proj[0] = f / aspect;
      proj[5] = f;
      proj[10] = -1.002;
      proj[11] = -1;
      proj[14] = -0.2;
    };
    const modelView = (t: number, scroll: number, px: number, py: number) => {
      const dolly = 22 + Math.sin(t * 0.05) * 1.3;
      const ry = Math.sin(t * 0.07) * 0.03 + px * 0.028;
      const rx = scroll * 0.09 + py * 0.018;
      const cy = Math.cos(ry), sy = Math.sin(ry);
      const cx = Math.cos(rx), sx = Math.sin(rx);
      mat.set([
        cy, sx * sy, -cx * sy, 0,
        0, cx, sx, 0,
        sy, -sx * cy, cx * cy, 0,
        0, 0, -dolly, 1,
      ]);
    };
    const mul = (out: Float32Array, a: Float32Array, b: Float32Array) => {
      for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
          out[c * 4 + r] =
            a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    };

    /* ------------------------------ loop --------------------------------- */
    // Cap DPR lower on mobile: the soft point sprites (esp. the size-42 halo)
    // are fill-rate bound; 1.5 is a large saving without looking fuzzy.
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
      perspective(0.7, w / h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let pointerX = 0, pointerY = 0, targetPX = 0, targetPY = 0;
    const onPointer = (e: PointerEvent) => {
      targetPX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetPY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    if (!mobile) window.addEventListener("pointermove", onPointer, { passive: true });

    let raf = 0;
    let running = true;
    const start = performance.now();
    // Cap the draw rate on mobile (~30fps): the ambient breathe/pulse is
    // imperceptible at 30 and it roughly halves GPU/CPU; desktop stays uncapped.
    const minInterval = mobile ? 1000 / 30 : 0;
    let lastDraw = 0;
    const attr = (p: WebGLProgram, name: string, size: number, stride: number, off: number) => {
      const loc = gl.getAttribLocation(p, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
    };

    const frame = () => {
      if (!running) return;
      const now = performance.now();
      if (now - lastDraw < minInterval) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastDraw = now;
      const t = (now - start) / 1000;
      pointerX += (targetPX - pointerX) * 0.04;
      pointerY += (targetPY - pointerY) * 0.04;
      const scroll = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1);

      modelView(t, scroll, pointerX, pointerY);
      mul(mvp, proj, mat);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(lnProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, lnBuf);
      attr(lnProg, "aPos", 3, 20, 0);
      attr(lnProg, "aT", 1, 20, 12);
      attr(lnProg, "aPhase", 1, 20, 16);
      gl.uniformMatrix4fv(gl.getUniformLocation(lnProg, "uMvp"), false, mvp);
      gl.uniform1f(gl.getUniformLocation(lnProg, "uTime"), t);
      gl.drawArrays(gl.LINES, 0, links.length * 2);

      gl.useProgram(ptProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf);
      attr(ptProg, "aPos", 3, 28, 0);
      attr(ptProg, "aSize", 1, 28, 12);
      attr(ptProg, "aAlpha", 1, 28, 16);
      attr(ptProg, "aSeed", 1, 28, 20);
      attr(ptProg, "aSoft", 1, 28, 24);
      gl.uniformMatrix4fv(gl.getUniformLocation(ptProg, "uMvp"), false, mvp);
      gl.uniform1f(gl.getUniformLocation(ptProg, "uTime"), t);
      gl.uniform1f(gl.getUniformLocation(ptProg, "uDpr"), dpr);
      gl.drawArrays(gl.POINTS, 0, points.length);

      raf = requestAnimationFrame(frame);
    };

    // pause when the hero is off-screen or the tab is hidden
    const io = new IntersectionObserver(([entry]) => {
      const shouldRun = entry.isIntersecting && !document.hidden;
      if (shouldRun && !running) {
        running = true;
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun) {
        running = false;
        cancelAnimationFrame(raf);
      }
    });
    io.observe(canvas);
    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    raf = requestAnimationFrame(frame);
    setLive(true);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (!mobile) window.removeEventListener("pointermove", onPointer);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <>
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${live ? "opacity-0" : "opacity-100"}`}
      >
        <NetworkBg />
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-700 ${live ? "opacity-100" : "opacity-0"}`}
      />
    </>
  );
}
