// The six objects and the wordmark — REQ-UIX-042, DEC-183 §4.8 – §4.10, §4.14.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const OBJECTS = "src/components/ui/objects";
const files = readdirSync(OBJECTS).filter((f) => f.endsWith(".tsx"));
const source = (f: string) => readFileSync(`${OBJECTS}/${f}`, "utf8");

describe("the six objects", () => {
  it("are six, and they are the design's", () => {
    expect(files.sort()).toEqual(["coin.tsx", "cup.tsx", "flame.tsx", "rocket.tsx", "star.tsx", "ticket.tsx"]);
  });

  it.each(files)("%s is decoration: aria-hidden, not focusable, on the masters' 160 grid", (f) => {
    const s = source(f);
    expect(s).toContain('viewBox="0 0 160 160"');
    expect(s).toContain('aria-hidden="true"');
    expect(s).toContain('focusable="false"');
    expect(s).not.toMatch(/role="img"/);
  });

  it.each(files)("%s can drop its shadow, for a coloured ground", (f) => {
    expect(source(f)).toMatch(/\{shadow \? \(\s*<g>\s*<ellipse /);
  });

  it.each(files)("%s names its gradients per instance, so two on a page do not share an id", (f) => {
    const s = source(f);
    const ids = [...s.matchAll(/\bid=(\{`[^`]+`\}|"[^"]+")/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id, f).toMatch(/^\{`\$\{uid\}-/);
    for (const ref of s.matchAll(/url\(#([^)]+)\)/g)) expect(ref[1]).toMatch(/^\$\{uid\}-/);
  });

  it("★ the coin carries no numeral: the master's «+50» is not in the component (DEC-183 §4.14)", () => {
    const master = readFileSync("docs/design/assets/objects/svg/coin.svg", "utf8");
    const label = master.match(/<path fill="#0B0C12" d="([^"]+)"\/>/);
    expect(label, "the master still carries its label, as a path").not.toBeNull();
    const coin = source("coin.tsx");
    // No ink-filled path at all: the only ink on the coin is the amount, and that is text.
    expect(coin).not.toMatch(/<path[^>]*fill="#0B0C12"/i);
    expect(coin).not.toMatch(/<text\b/);
    expect(coin).toContain("<bdi dir=\"ltr\">{amount}</bdi>");
  });

  it("the ticket's «محجوز» is a fixed word and stays in the drawing, as outlines", () => {
    const ticket = source("ticket.tsx");
    expect(ticket).not.toMatch(/<text\b/);
    expect(ticket.length).toBeGreaterThan(4000);
  });

  it("no SVG file is served from public/, and none is imported as a file", () => {
    const served = (dir: string): string[] => {
      try {
        return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? served(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
      } catch {
        return [];
      }
    };
    // The public site's constellation SVGs predate the wave and are the public site's own.
    const added = served("public").filter((f) => f.endsWith(".svg") && !/\/constellation[^/]*\.svg$/.test(f));
    expect(added).toEqual([]);
    for (const f of files) expect(source(f)).not.toMatch(/from ["'][^"']+\.svg["']/);
  });
});

describe("the playground's wordmark", () => {
  const wordmark = readFileSync("src/components/brand/wordmark.tsx", "utf8");

  it("is outlines in currentColor: no font is asked for, and the tone is where it stands", () => {
    expect(wordmark).toContain('fill="currentColor"');
    expect(wordmark).not.toMatch(/<text\b/);
    expect(wordmark).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(wordmark).not.toMatch(/font-family|fontFamily/);
  });

  it("is named in Arabic, and can stand unnamed beside the name in text", () => {
    expect(wordmark).toContain('label = "كريم معرفة"');
    expect(wordmark).toContain("aria-hidden={named ? undefined : true}");
  });

  // ★ wave 18 (DEC-183 §4.9 → REQ-UIX-054, REQ-UIX-058): «built and not yet worn … until the
  // screens wave changes the shell». The screens wave has come: the rebuilt shell and the rebuilt
  // door wear it. What still holds is the other half of §4.9 — the public site keeps its own mark,
  // so nothing a public route renders imports this one (`public-graph` walks that graph).
  it("★ is worn by the rebuilt shell and the rebuilt door, and by nothing the public site renders", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(tsx?|mjs)$/.test(e.name) ? [`${dir}/${e.name}`] : []));
    const importers = walk("src").filter((f) => /components\/brand\/wordmark["']/.test(readFileSync(f, "utf8")));
    const allowed = ["src/app/[locale]/(dev)/", "src/app/[locale]/app/layout.tsx", "src/app/[locale]/(auth)/door.tsx"];
    for (const f of importers) expect(allowed.some((a) => f.startsWith(a)), `${f} wears the new wordmark`).toBe(true);
    expect(importers).toContain("src/app/[locale]/app/layout.tsx");
  });
});
