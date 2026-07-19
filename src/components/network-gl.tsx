"use client";

import { useEffect, useRef, useState } from "react";
import { NetworkBg } from "@/components/network-bg";

/**
 * The hero "knowledge network" as a 3D constellation. Composition is
 * DESIGNED, not uniform noise: a handful of constellation clusters (local
 * webs of short links) joined by a few long bridge lines, one glowing
 * focal node, and a sparse tail of unconnected dots drifting toward the
 * headline — knowledge not yet shared. Connections are flat solid strokes;
 * the camera breathes on a slow dolly with gentle scroll/pointer
 * parallax. Hand-rolled WebGL, no library.
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
    // `flash` is transient: driven to 1 when a traveling light arrives, then
    // decayed each frame. Everything else is fixed at generation time.
    type P = { x: number; y: number; z: number; size: number; alpha: number; soft: number; flash: number };
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
          flash: 0,
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
        flash: 0,
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
    const focal: P = { x: -4.4 * mirror, y: 0.1, z: 1.2, size: 11, alpha: 1, soft: 0, flash: 0 };
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
        flash: 0,
      });
    }

    /* ---------------------------- travelers ------------------------------
       Balls of light that walk the graph edge by edge. On arrival a node is
       flashed and the traveler picks a fresh outgoing edge, preferring not
       to double back — so a light reads as a thought propagating through the
       network rather than bouncing on one link. */
    const adj = new Map<P, P[]>();
    for (const [a, b] of links) {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a)!.push(b);
      adj.get(b)!.push(a);
    }
    const linked = [...adj.keys()];
    type T = { from: P; to: P; t: number };
    const travelers: T[] = [];
    const travelerN = mobile ? 4 : 9;
    for (let i = 0; i < travelerN; i++) {
      const from = linked[Math.floor(rand() * linked.length)];
      const nbrs = adj.get(from)!;
      travelers.push({ from, to: nbrs[Math.floor(rand() * nbrs.length)], t: rand() });
    }
    // step a traveler onto its next edge once it lands
    const advance = (tr: T) => {
      tr.to.flash = 1;
      const nbrs = adj.get(tr.to)!;
      let next = nbrs[Math.floor(rand() * nbrs.length)];
      if (nbrs.length > 1 && next === tr.from) {
        next = nbrs[(nbrs.indexOf(next) + 1) % nbrs.length];
      }
      tr.from = tr.to;
      tr.to = next;
      tr.t = 0;
    };

    const pointData: number[] = [];
    for (const p of points) {
      pointData.push(p.x, p.y, p.z, p.size, p.alpha, rand(), p.soft, p.flash);
    }
    const lineData: number[] = [];
    for (const [a, b] of links) {
      lineData.push(a.x, a.y, a.z, b.x, b.y, b.z);
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
      `attribute vec3 aPos; attribute float aSize, aAlpha, aSeed, aSoft, aFlash;
       uniform mat4 uMvp; uniform float uTime, uDpr;
       varying float vAlpha, vSoft, vFlash;
       void main() {
         gl_Position = uMvp * vec4(aPos, 1.0);
         float w = gl_Position.w;
         // a flashed node swells briefly as it lights up
         gl_PointSize = aSize * (1.0 + aFlash * 0.55) * uDpr * (22.0 / w);
         float twinkle = 0.82 + 0.18 * sin(uTime * 0.7 + aSeed * 40.0);
         vAlpha = min(1.0, aAlpha * twinkle + aFlash * 0.85);
         vFlash = aFlash;
         // depth-of-field: focus plane at w≈22; away = softer disc (bokeh).
         // Cap BELOW 0.5: smoothstep(0.5, vSoft, d) degenerates at 0.5 and
         // renders the whole point quad as a square.
         vSoft = clamp(max(abs(w - 22.0) * 0.09, aSoft), 0.07, 0.44);
       }`,
      `precision mediump float;
       varying float vAlpha, vSoft, vFlash;
       void main() {
         float d = length(gl_PointCoord - 0.5);
         float a = smoothstep(0.5, vSoft, d) * vAlpha;
         vec3 c = mix(vec3(0.812, 0.831, 0.867), vec3(1.0), vFlash);
         gl_FragColor = vec4(c, a);
       }`,
    );

    // the traveling balls of light — drawn additively so they read as light
    const trProg = program(
      `attribute vec3 aPos;
       uniform mat4 uMvp; uniform float uDpr;
       void main() {
         gl_Position = uMvp * vec4(aPos, 1.0);
         gl_PointSize = 13.0 * uDpr * (22.0 / gl_Position.w);
       }`,
      `precision mediump float;
       void main() {
         float d = length(gl_PointCoord - 0.5);
         // bright core with a quadratic falloff halo
         float a = pow(1.0 - clamp(d * 2.0, 0.0, 1.0), 2.5);
         gl_FragColor = vec4(0.94, 0.96, 0.99, a * 0.85);
       }`,
    );

    const lnProg = program(
      `attribute vec3 aPos; attribute float aT, aPhase;
       uniform mat4 uMvp;
       void main() { gl_Position = uMvp * vec4(aPos, 1.0); }`,
      `precision mediump float;
       void main() {
         // flat stroke: one solid color and opacity end to end
         gl_FragColor = vec4(0.659, 0.702, 0.769, 0.24);
       }`,
    );

    const buf = (data: number[]) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      return b;
    };
    const lnBuf = buf(lineData);
    // points and travelers are re-uploaded each frame (node flash decay /
    // traveler motion); both are tiny — a few hundred floats.
    const ptArray = new Float32Array(pointData);
    const ptBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf);
    gl.bufferData(gl.ARRAY_BUFFER, ptArray, gl.DYNAMIC_DRAW);
    const trArray = new Float32Array(travelers.length * 3);
    const trBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, trBuf);
    gl.bufferData(gl.ARRAY_BUFFER, trArray, gl.DYNAMIC_DRAW);

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
      const t = (now - start) / 1000;
      // Clamp dt: after a tab-hidden pause `now - lastDraw` can be minutes,
      // which would teleport every traveler across the graph on resume.
      const dt = Math.min((now - lastDraw) / 1000, 0.05);
      lastDraw = now;

      // travelers march at a constant world-space speed, so the light moves
      // at one visual pace regardless of how long the edge is
      for (const tr of travelers) {
        const len =
          Math.hypot(tr.to.x - tr.from.x, tr.to.y - tr.from.y, tr.to.z - tr.from.z) || 1;
        tr.t += (2.6 * dt) / len;
        if (tr.t >= 1) advance(tr);
      }
      for (let i = 0; i < travelers.length; i++) {
        const tr = travelers[i];
        trArray[i * 3] = tr.from.x + (tr.to.x - tr.from.x) * tr.t;
        trArray[i * 3 + 1] = tr.from.y + (tr.to.y - tr.from.y) * tr.t;
        trArray[i * 3 + 2] = tr.from.z + (tr.to.z - tr.from.z) * tr.t;
      }
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 1.6);
        ptArray[i * 8 + 7] = p.flash;
      }

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
      attr(lnProg, "aPos", 3, 12, 0);
      gl.uniformMatrix4fv(gl.getUniformLocation(lnProg, "uMvp"), false, mvp);
      gl.drawArrays(gl.LINES, 0, links.length * 2);

      gl.useProgram(ptProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, ptArray);
      attr(ptProg, "aPos", 3, 32, 0);
      attr(ptProg, "aSize", 1, 32, 12);
      attr(ptProg, "aAlpha", 1, 32, 16);
      attr(ptProg, "aSeed", 1, 32, 20);
      attr(ptProg, "aSoft", 1, 32, 24);
      attr(ptProg, "aFlash", 1, 32, 28);
      gl.uniformMatrix4fv(gl.getUniformLocation(ptProg, "uMvp"), false, mvp);
      gl.uniform1f(gl.getUniformLocation(ptProg, "uTime"), t);
      gl.uniform1f(gl.getUniformLocation(ptProg, "uDpr"), dpr);
      gl.drawArrays(gl.POINTS, 0, points.length);

      // travelers last, additively, so the light sits on top of the network
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(trProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, trBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, trArray);
      attr(trProg, "aPos", 3, 12, 0);
      gl.uniformMatrix4fv(gl.getUniformLocation(trProg, "uMvp"), false, mvp);
      gl.uniform1f(gl.getUniformLocation(trProg, "uDpr"), dpr);
      gl.drawArrays(gl.POINTS, 0, travelers.length);

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
