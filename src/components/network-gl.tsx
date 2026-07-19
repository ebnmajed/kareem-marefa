"use client";

import { useEffect, useRef, useState } from "react";
import { NetworkBg } from "@/components/network-bg";

/**
 * The hero "knowledge network" as a 3D constellation. Composition is
 * DESIGNED, not uniform noise: a handful of constellation clusters (local
 * webs of short links) joined by a few long bridge lines, one glowing
 * focal node, and a sparse tail of unconnected dots drifting toward the
 * headline — knowledge not yet shared. Connections are flat solid strokes.
 *
 * The signature motion is a slow, ~11s choreographed loop: a wavefront of
 * light spreads outward from the focal node along the graph (balls of light
 * riding each edge, lighting every node the front crosses) until the whole
 * constellation is lit — one idea shared across the network — then the whole
 * thing blooms, holds, and fades back to rest before the next pass. Driven
 * purely by a loop clock, so a backgrounded tab resumes cleanly. The camera
 * breathes on a slow dolly with gentle scroll/pointer parallax. Hand-rolled
 * WebGL, no library.
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
       World units: camera sits ~22 away with a 40° fov. The visible box is
       ~16 tall; its width is 16·aspect — so a wide desktop frame shows
       x∈[-12,12] but a portrait phone only x∈[-4,4]. The desktop layout is
       authored WIDE (a landscape sprawl on the headline-adjacent half); a
       portrait phone would crop nearly all of it off the inline edge. So
       mobile gets its own layout — the same constellation re-composed to run
       vertically down the tall frame, centered, at the SAME node scale (fit,
       not shrink). Each cluster is a tight local web either way. */
    // `mobile` gates performance/interaction (DPR, frame cap, pointer parallax)
    // — true for touch OR small screens. `portrait` gates the LAYOUT and keys
    // off ORIENTATION, not a width number: a tall frame (any phone, or a tablet
    // held upright — which can report a CSS width >767) can't fit the wide
    // desktop composition, so it gets the vertical one. Landscape/wide screens
    // (desktop, tablet on its side, touch laptop) keep the desktop placement.
    const mobile =
      window.matchMedia("(max-width: 767px)").matches ||
      window.matchMedia("(pointer: coarse)").matches;
    const portrait = window.matchMedia("(orientation: portrait)").matches;
    // `nd` = normalized graph distance from the focal seed (0 at the focal,
    // 1 at the farthest reachable node, Infinity for the unconnected tail).
    // It's what the wavefront is compared against to decide when each node
    // lights. Assigned after the graph is built (Dijkstra, below).
    type P = { x: number; y: number; z: number; size: number; alpha: number; soft: number; nd: number };
    const points: P[] = [];
    const links: [P, P][] = [];

    // Portrait layout: just three clusters stacked down the frame — kept
    // simple for a small screen, but each still a small local web (generous
    // radius so links have air, a light chord) so it doesn't read as a cramped
    // knot. Footprint stays moderate (reach ~±3.2, inside the phone's x∈[-4,4]).
    const clusters: { cx: number; cy: number; cz: number; r: number; n: number }[] = portrait
      ? [
          { cx: -1.6, cy: 3.9, cz: -0.6, r: 1.6, n: 5 },
          { cx: 1.5, cy: -0.2, cz: 0.6, r: 1.6, n: 5 },
          { cx: -1.4, cy: -4.2, cz: 0.4, r: 1.5, n: 4 },
        ]
      : [
          { cx: -8.2, cy: 2.4, cz: -1.0, r: 2.0, n: 8 },
          { cx: -4.0, cy: 1.4, cz: 0.8, r: 2.3, n: 10 },
          { cx: -6.8, cy: -2.2, cz: 0.3, r: 1.9, n: 8 },
          { cx: -2.4, cy: -2.8, cz: -0.8, r: 1.7, n: 6 },
          { cx: -10.4, cy: -0.4, cz: 1.0, r: 1.4, n: 5 },
        ];

    const anchors: P[] = []; // one emphasized node per cluster, used for bridges
    for (const c of clusters) {
      const members: P[] = [];
      const n = c.n;
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
          nd: Infinity,
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
        nd: Infinity,
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
      // extra chords so clusters read as webs, not chains (just one on the
      // simpler portrait layout — enough to hint a web without crowding)
      for (let i = 0; i < (portrait ? 1 : 2) && all.length > 3; i++) {
        const p = all[Math.floor(rand() * all.length)];
        const q = all[Math.floor(rand() * all.length)];
        if (p !== q && Math.hypot(p.x - q.x, p.y - q.y) < c.r * 1.8) links.push([p, q]);
      }
    }

    // bridges: chain neighboring anchors so the whole constellation connects.
    // Portrait chains top→bottom down the stack; desktop is a hand-picked path.
    const order = portrait ? [0, 1, 2] : [4, 0, 2, 1, 3];
    for (let i = 0; i < order.length - 1; i++) {
      links.push([anchors[order[i]], anchors[order[i + 1]]]);
    }

    // the focal node: brightest point + a soft halo behind it. Central on
    // mobile (the seed the light spreads from), off-center on desktop.
    const focal: P = portrait
      ? { x: 0.2 * mirror, y: 0.6, z: 1.2, size: 11, alpha: 1, soft: 0, nd: Infinity }
      : { x: -4.4 * mirror, y: 0.1, z: 1.2, size: 11, alpha: 1, soft: 0, nd: Infinity };
    points.push(focal);
    points.push({ ...focal, size: 42, alpha: 0.08, soft: 0.42 }); // halo
    links.push([focal, anchors[1]], [focal, anchors[2]]);

    // sparse unconnected tail — knowledge not yet shared. Kept in-frame on
    // portrait (x∈±2.5, full height); drifting toward the headline on desktop.
    const tailN = portrait ? 3 : 9;
    for (let i = 0; i < tailN; i++) {
      points.push({
        x: (portrait ? (rand() - 0.5) * 5 : 0.5 + rand() * 8.5) * mirror,
        y: portrait ? -6.5 + rand() * 13 : -4 + rand() * 8,
        z: -2 + rand() * 4,
        size: 2.6 + rand() * 2,
        alpha: 0.18 + rand() * 0.16,
        soft: 0,
        nd: Infinity,
      });
    }

    /* -------------------- propagation field (Dijkstra) -------------------
       Distance from the focal seed along the graph defines when the
       wavefront reaches each node and each edge. Weighted by real world
       length, so the front advances at a roughly constant visual speed and
       the long bridges take dramatically longer to cross than short local
       links. The unconnected tail is unreachable → stays at rest until the
       final full-network bloom. */
    const wadj = new Map<P, { to: P; w: number }[]>();
    for (const [a, b] of links) {
      const w = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (!wadj.has(a)) wadj.set(a, []);
      if (!wadj.has(b)) wadj.set(b, []);
      wadj.get(a)!.push({ to: b, w });
      wadj.get(b)!.push({ to: a, w });
    }
    const dist = new Map<P, number>();
    for (const p of points) dist.set(p, Infinity);
    dist.set(focal, 0);
    const seen = new Set<P>();
    for (;;) {
      // small graph (≤~60 nodes) → plain O(V²) Dijkstra, no heap needed
      let u: P | null = null;
      let best = Infinity;
      for (const [p, d] of dist) if (!seen.has(p) && d < best) ((best = d), (u = p));
      if (!u) break;
      seen.add(u);
      for (const { to, w } of wadj.get(u) ?? []) {
        if (best + w < dist.get(to)!) dist.set(to, best + w);
      }
    }
    let maxD = 0;
    for (const d of dist.values()) if (isFinite(d) && d > maxD) maxD = d;
    maxD = maxD || 1;
    for (const p of points) {
      const d = dist.get(p)!;
      p.nd = isFinite(d) ? d / maxD : Infinity;
    }

    // per-edge endpoints ordered near→far by distance: the ball rides from
    // the already-lit end toward the dark end as the front passes.
    const edges: { near: P; far: P; dN: number; dF: number }[] = [];
    const lineData: number[] = [];
    for (const [a, b] of links) {
      const near = a.nd <= b.nd ? a : b;
      const far = a.nd <= b.nd ? b : a;
      const dN = near.nd;
      const dF = far.nd;
      edges.push({ near, far, dN, dF });
      // vertex layout: pos(3), edgeT (0=near,1=far), dNear, dFar
      lineData.push(near.x, near.y, near.z, 0, dN, dF);
      lineData.push(far.x, far.y, far.z, 1, dN, dF);
    }

    const pointData: number[] = [];
    for (const p of points) {
      pointData.push(p.x, p.y, p.z, p.size, p.alpha, rand(), p.soft, 0);
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
      `attribute vec3 aPos; attribute float aSize, aAlpha, aSeed, aSoft, aGlow;
       uniform mat4 uMvp; uniform float uTime, uDpr;
       varying float vAlpha, vSoft, vGlow;
       void main() {
         gl_Position = uMvp * vec4(aPos, 1.0);
         float w = gl_Position.w;
         // a lit node swells noticeably as the wavefront reaches it
         gl_PointSize = aSize * (1.0 + aGlow * 0.7) * uDpr * (22.0 / w);
         float twinkle = 0.82 + 0.18 * sin(uTime * 0.7 + aSeed * 40.0);
         vAlpha = min(1.0, aAlpha * twinkle + aGlow * 0.9);
         vGlow = aGlow;
         // depth-of-field: focus plane at w≈22; away = softer disc (bokeh).
         // Cap BELOW 0.5: smoothstep(0.5, vSoft, d) degenerates at 0.5 and
         // renders the whole point quad as a square.
         vSoft = clamp(max(abs(w - 22.0) * 0.09, aSoft), 0.07, 0.44);
       }`,
      `precision mediump float;
       varying float vAlpha, vSoft, vGlow;
       void main() {
         float d = length(gl_PointCoord - 0.5);
         float a = smoothstep(0.5, vSoft, d) * vAlpha;
         vec3 c = mix(vec3(0.812, 0.831, 0.867), vec3(1.0), clamp(vGlow, 0.0, 1.0));
         gl_FragColor = vec4(c, a);
       }`,
    );

    // the traveling balls of light — drawn additively so they read as light.
    // aAlpha gates each ball on only while the front is crossing its edge.
    const trProg = program(
      `attribute vec3 aPos; attribute float aAlpha;
       uniform mat4 uMvp; uniform float uDpr;
       varying float vA;
       void main() {
         gl_Position = uMvp * vec4(aPos, 1.0);
         gl_PointSize = 15.0 * uDpr * (22.0 / gl_Position.w);
         vA = aAlpha;
       }`,
      `precision mediump float;
       varying float vA;
       void main() {
         float d = length(gl_PointCoord - 0.5);
         // bright core with a quadratic falloff halo
         float a = pow(1.0 - clamp(d * 2.0, 0.0, 1.0), 2.5);
         gl_FragColor = vec4(0.95, 0.97, 1.0, a * vA * 0.9);
       }`,
    );

    // lines brighten as the wavefront (uWave) passes each pixel's graph
    // distance; a glint rides the front, a soft trail lingers behind it, and
    // uFull blooms every reached edge to white at the climax.
    const lnProg = program(
      `attribute vec3 aPos; attribute float aT, aDN, aDF;
       uniform mat4 uMvp;
       varying float vDist;
       void main() {
         gl_Position = uMvp * vec4(aPos, 1.0);
         vDist = mix(aDN, aDF, aT);
       }`,
      `precision mediump float;
       uniform float uWave, uTrail, uFull;
       varying float vDist;
       void main() {
         float past = uWave - vDist;
         float lit = clamp(past / 0.045, 0.0, 1.0);
         float pop = max(0.0, 1.0 - abs(past) / 0.09);
         float glow = clamp(lit * (0.28 + 0.95 * pop) * uTrail + lit * uFull, 0.0, 1.25);
         float a = clamp(0.2 + glow * 0.55, 0.0, 0.85);
         vec3 c = mix(vec3(0.659, 0.702, 0.769), vec3(0.95, 0.97, 1.0), clamp(glow, 0.0, 1.0));
         gl_FragColor = vec4(c, a);
       }`,
    );

    const buf = (data: number[]) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      return b;
    };
    const lnBuf = buf(lineData); // geometry + per-edge distances are static
    // points (per-frame glow) and balls (per-frame position + on/off) are
    // re-uploaded each frame; both are tiny — a few hundred floats.
    const ptArray = new Float32Array(pointData);
    const ptBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf);
    gl.bufferData(gl.ARRAY_BUFFER, ptArray, gl.DYNAMIC_DRAW);
    const trArray = new Float32Array(edges.length * 4); // pos(3) + alpha
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

    /* choreography timeline (seconds within one loop) + easing.
       The spread is the long, unhurried act: the wavefront takes ~11s to
       reach and light the whole network (brief: ≥10s to light all of it),
       then it blooms, holds, and fades back to rest. */
    const LOOP = 16.5; // total loop length
    const SPREAD = 11.5; // wavefront lights the whole network by here (≥10s)
    const BLOOM = 12.6; // full-constellation ignition peaks (overshoot)
    const HOLD = 14.2; // ...holds bright, then fades to rest over the remainder
    const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
    const smooth = (x: number) => ((x = clamp01(x)), x * x * (3 - 2 * x));

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
      lastDraw = now;

      /* ---- choreography clock: one ~11s propagate → bloom → fade loop ----
         Everything below is a pure function of loop time, so a tab hidden for
         minutes resumes at the right phase with nothing to catch up. */
      const tl = t % LOOP;
      // wavefront position: a steady linear advance (the drama is the long
      // duration, not easing), overshooting 1 so the farthest node/edge fully
      // lights and its ball completes the crossing
      const wave = Math.min((tl / SPREAD) * 1.1, 1.1);
      // full-network bloom: 0 while spreading, overshoots at ignition, settles
      // to a hold, then fades back to rest
      let full: number;
      if (tl < SPREAD - 0.5) full = 0;
      else if (tl < BLOOM) full = smooth((tl - SPREAD + 0.5) / (BLOOM - SPREAD + 0.5)) * 1.22;
      else if (tl < HOLD) full = 1.22 - 0.22 * smooth((tl - BLOOM) / (HOLD - BLOOM));
      else full = 1 - smooth((tl - HOLD) / (LOOP - HOLD));
      // trailing glow behind the front; lingers through the hold, then fades
      const trail = tl < HOLD ? 1 : 1 - smooth((tl - HOLD) / (LOOP - HOLD));
      // ambient lift so even the unconnected tail glows at the climax
      const ambient = full * 0.5;

      // node glow: spreading trail + a brighter pop right as the front arrives,
      // lifted to full-white at the bloom
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const past = wave - p.nd; // -Infinity for the unconnected tail
        const lit = past > 0 ? Math.min(past / 0.045, 1) : 0;
        // a slow, pronounced flare as the front crosses (wide window → the
        // node lights over ~1.5s), settling to a dim trail behind it
        const pop = past > -0.08 && past < 0.08 ? 1 - Math.abs(past) / 0.08 : 0;
        let glow = lit * (0.28 + 1.05 * pop) * trail + lit * full;
        if (glow < ambient) glow = ambient;
        if (p.soft > 0) glow *= 0.25; // damp the big halo — soft bloom, not blowout
        ptArray[i * 8 + 7] = glow > 1.3 ? 1.3 : glow;
      }

      // balls of light: one per edge, riding the front from the near (lit) end
      // toward the far (dark) end; visible only while actually crossing
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const tb = (wave - e.dN) / Math.max(e.dF - e.dN, 0.02);
        const on = tb > 0 && tb < 1 ? Math.sin(Math.PI * tb) * trail : 0;
        const pt = tb < 0 ? 0 : tb > 1 ? 1 : tb;
        trArray[i * 4] = e.near.x + (e.far.x - e.near.x) * pt;
        trArray[i * 4 + 1] = e.near.y + (e.far.y - e.near.y) * pt;
        trArray[i * 4 + 2] = e.near.z + (e.far.z - e.near.z) * pt;
        trArray[i * 4 + 3] = on;
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
      attr(lnProg, "aPos", 3, 24, 0);
      attr(lnProg, "aT", 1, 24, 12);
      attr(lnProg, "aDN", 1, 24, 16);
      attr(lnProg, "aDF", 1, 24, 20);
      gl.uniformMatrix4fv(gl.getUniformLocation(lnProg, "uMvp"), false, mvp);
      gl.uniform1f(gl.getUniformLocation(lnProg, "uWave"), wave);
      gl.uniform1f(gl.getUniformLocation(lnProg, "uTrail"), trail);
      gl.uniform1f(gl.getUniformLocation(lnProg, "uFull"), full);
      gl.drawArrays(gl.LINES, 0, links.length * 2);

      gl.useProgram(ptProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, ptArray);
      attr(ptProg, "aPos", 3, 32, 0);
      attr(ptProg, "aSize", 1, 32, 12);
      attr(ptProg, "aAlpha", 1, 32, 16);
      attr(ptProg, "aSeed", 1, 32, 20);
      attr(ptProg, "aSoft", 1, 32, 24);
      attr(ptProg, "aGlow", 1, 32, 28);
      gl.uniformMatrix4fv(gl.getUniformLocation(ptProg, "uMvp"), false, mvp);
      gl.uniform1f(gl.getUniformLocation(ptProg, "uTime"), t);
      gl.uniform1f(gl.getUniformLocation(ptProg, "uDpr"), dpr);
      gl.drawArrays(gl.POINTS, 0, points.length);

      // balls last, additively, so the light sits on top of the network
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(trProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, trBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, trArray);
      attr(trProg, "aPos", 3, 16, 0);
      attr(trProg, "aAlpha", 1, 16, 12);
      gl.uniformMatrix4fv(gl.getUniformLocation(trProg, "uMvp"), false, mvp);
      gl.uniform1f(gl.getUniformLocation(trProg, "uDpr"), dpr);
      gl.drawArrays(gl.POINTS, 0, edges.length);

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
