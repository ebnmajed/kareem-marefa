// Seeded generator for the "Knowledge Network" hero SVG.
// Authored RTL-first: headline sits at inline-start (high x stays sparse),
// density thickens toward center-left (x 420–820) where the focal node lives.
// Coordinates chosen so the focal node survives the mobile `slice` crop
// (visible band on a 390px-wide hero ≈ x ∈ [485, 955]).

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260713);

const W = 1440, H = 720;
const MIN_DIST = 95;
const dots = [];

// Density: heavy in x∈[380,860], sparse tail toward the headline side (x>860)
function densityAccept(x) {
  if (x < 380) return rand() < 0.35; // outer edge — a few detail dots
  if (x < 860) return true;          // dense zone
  return rand() < 0.30;              // sparse, isolated (unshared knowledge)
}

let attempts = 0;
while (dots.length < 34 && attempts < 4000) {
  attempts++;
  const x = 120 + rand() * (W - 200);
  const y = 70 + rand() * (H - 150);
  if (!densityAccept(x)) continue;
  if (dots.some((d) => Math.hypot(d.x - x, d.y - y) < MIN_DIST)) continue;
  dots.push({ x: Math.round(x), y: Math.round(y) });
}

// Sizes/opacity: three dot sizes; opacity fades toward the headline side
for (const d of dots) {
  const r = [1.5, 2.2, 3][Math.floor(rand() * 3)];
  const falloff = d.x > 860 ? Math.max(0.35, 1 - (d.x - 860) / 700) : 1;
  d.r = r;
  d.o = +(Math.min(0.55, 0.25 + rand() * 0.3) * falloff).toFixed(2);
  d.detail = d.x < 380 || d.x > 1150; // hidden on mobile
}

// Knowledge nodes: 3 emphasized dots in the dense zone + the focal node
const nodes = [
  { x: 470, y: 170, r: 3.5, o: 0.9 },
  { x: 760, y: 250, r: 3.5, o: 0.85 },
  { x: 640, y: 520, r: 4, o: 0.9 },
];
const focal = { x: 560, y: 300, r: 4, o: 0.95 };
const all = [...dots, ...nodes, focal];

// Links: nearest neighbors, ~1.2 per dot, only inside/near the dense zone.
// Several sparse-side dots stay unconnected — knowledge not yet shared.
const lines = [];
const linkCount = new Map();
function key(a) { return `${a.x},${a.y}`; }
for (const a of all) {
  if (a.x > 980 && rand() < 0.65) continue; // most headline-side dots stay isolated
  const neighbors = all
    .filter((b) => b !== a)
    .map((b) => ({ b, d: Math.hypot(a.x - b.x, a.y - b.y) }))
    .sort((p, q) => p.d - q.d)
    .slice(0, 2);
  for (const { b, d } of neighbors) {
    if (d > 230) continue;
    if ((linkCount.get(key(a)) ?? 0) >= 2 || (linkCount.get(key(b)) ?? 0) >= 3) continue;
    const id = [key(a), key(b)].sort().join("|");
    if (lines.some((l) => l.id === id)) continue;
    if (rand() < 0.35) continue; // thin out to ~1.2 lines/dot
    const o = +(0.08 + rand() * 0.06).toFixed(2);
    lines.push({ id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, o });
    linkCount.set(key(a), (linkCount.get(key(a)) ?? 0) + 1);
    linkCount.set(key(b), (linkCount.get(key(b)) ?? 0) + 1);
  }
}

// Ensure focal is connected (it's the point of the composition)
console.error(`dots=${dots.length} lines=${lines.length}`);

const pulseIdx = [2, 9, 17]; // hand-picked pulse dots
let out = "";
out += `      <g stroke="#A8B3C4" strokeWidth="0.75" fill="none">\n`;
for (const l of lines) {
  out += `        <line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" opacity="${l.o}" />\n`;
}
out += `      </g>\n`;
out += `      <g fill="#C9CED6">\n`;
dots.forEach((d, i) => {
  const pulse = pulseIdx.includes(i);
  const cls = [pulse ? "pulse-dot" : "", d.detail ? "max-md:hidden" : ""].filter(Boolean).join(" ");
  const clsAttr = cls ? ` className="${cls}"` : "";
  const delay = pulse ? ` style={{ animationDelay: "${(pulseIdx.indexOf(i) * 1.9).toFixed(1)}s" }}` : "";
  out += `        <circle cx="${d.x}" cy="${d.y}" r="${d.r}" opacity="${d.o}"${clsAttr}${delay} />\n`;
});
for (const n of nodes) {
  out += `        <circle cx="${n.x}" cy="${n.y}" r="${n.r}" opacity="${n.o}" />\n`;
}
out += `        <circle cx="${focal.x}" cy="${focal.y}" r="${focal.r}" opacity="${focal.o}" />\n`;
out += `      </g>\n`;

console.log(out);
