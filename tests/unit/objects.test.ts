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
    // ★ Wave 29 (DEC-280): the avatar library is served from `public/avatars/<set>/` by decision — fifty shipped files,
    // never a member's upload — and `tests/unit/avatar-library.test.ts` holds each one inert and equal to the list.
    const added = served("public").filter(
      (f) => f.endsWith(".svg") && !/\/constellation[^/]*\.svg$/.test(f) && !/^public\/avatars\/(characters|objects)\/[a-z-]+\.svg$/.test(f),
    );
    expect(added).toEqual([]);
    for (const f of files) expect(source(f)).not.toMatch(/from ["'][^"']+\.svg["']/);
  });
});

// ★ wave 26 (REQ-UIX-119, REQ-UIX-120): the written wordmark is gone — both components are deleted — and the
// mark stands wherever it stood. What this block held about the wordmark it now holds about the mark.
describe("the mark", () => {
  const logo = readFileSync("src/components/brand/logo.tsx", "utf8");

  it("is a drawing a component inlines: no text, no font, no file fetched", () => {
    expect(logo).not.toMatch(/<text\b/);
    expect(logo).not.toMatch(/font-family|fontFamily/);
    expect(logo).not.toMatch(/\.svg["']|<img\b|<Image\b/);
    expect(logo).toContain("pathLength={1}");
  });

  it("is named in Arabic, and can stand unnamed beside the name in text", () => {
    expect(logo).toContain('label = "كريم معرفة"');
    expect(logo).toContain("aria-hidden={named ? undefined : true}");
  });

  it("has three moves and stillness, and still is the default", () => {
    expect(logo).toContain('export type LogoMotion = "none" | "reveal" | "loading" | "tap";');
    expect(logo).toContain('motion = "none"');
  });

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(tsx?|mjs)$/.test(e.name) ? [`${dir}/${e.name}`] : []));
  const all = walk("src");

  it("★ neither wordmark component exists, and nothing imports one", () => {
    expect(all.filter((f) => /(^|\/)wordmark\.tsx$/.test(f))).toEqual([]);
    expect(all.filter((f) => /components\/(brand\/)?wordmark["']/.test(readFileSync(f, "utf8")))).toEqual([]);
  });

  it("★ a console bar's mark never moves (REQ-UIX-053): the reveal is sign-in's and the landing's, the breath and the settle are the app bar's", () => {
    const moving = all
      .filter((f) => f !== "src/components/brand/logo.tsx" && /motion=(\{[^}]*"(reveal|loading|tap)"|"(reveal|loading|tap)")/.test(readFileSync(f, "utf8")))
      .sort();
    expect(moving).toEqual([
      "src/app/[locale]/(auth)/sign-in/page.tsx",
      "src/app/[locale]/(dev)/ui/playground.tsx",
      "src/components/intro-sting.tsx",
      "src/components/shell/home-mark.tsx",
    ]);
  });
});
