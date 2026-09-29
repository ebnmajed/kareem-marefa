// «Tokens only» — DEC-186 §9, REQ-UIX-030, REQ-UIX-001.
//
// `ui-lint` excludes `src/components/ui/` by design: the primitives are where a
// raw `<input>` and a control class string are SUPPOSED to live. So the rule
// «a primitive holds no hex, no literal duration and no raw palette name» held
// only where somebody looked. This is the gate.
//
// Two rules, and neither has an allowlist:
//   1. A FILE CREATED THIS WAVE holds none of the three, anywhere.
//   2. IN EVERY FILE, no class that follows `pg:`, `pg-dark:` or `pg-light:`
//      holds one. The classes that existed before wave 15 are untouched —
//      that is the wave's promise, not an exemption from this rule.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const UI = "src/components/ui";

// The files `main` had when wave 15 opened. Anything else under `ui/` is new.
const BEFORE_WAVE_15 = new Set([
  "avatar.tsx", "badge.tsx", "button.tsx", "card.tsx", "checkbox.tsx", "combobox.tsx", "data-table.tsx",
  "date-time.tsx", "dialog.tsx", "empty-state.tsx", "field.tsx", "file-drop.tsx", "form-summary.tsx",
  "icon-button.tsx", "icons.tsx", "index.ts", "input.tsx", "link.tsx", "menu.tsx", "page-header.tsx",
  "panel.tsx", "progress.tsx", "prose.tsx", "radio-group.tsx", "reorderable-list.tsx", "route-error.tsx",
  "route-progress.tsx", "section-header.tsx", "select.tsx", "sheet.tsx", "skeleton.tsx", "stat.tsx",
  "submit-button.tsx", "switch.tsx", "tabs.tsx", "tag-chip.tsx", "textarea.tsx", "toast.tsx",
]);

// ★ The one reasoned exception, and it is a directory, not a file list: the six
// objects are ARTWORK. A toy-gloss coin is drawn with gradient stops, and a
// gradient stop is a colour. They are not primitives and they carry no class.
const ARTWORK = "objects/";

function walk(dir: string, base = ""): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    return statSync(path).isDirectory() ? walk(path, rel) : /\.tsx?$/.test(name) ? [rel] : [];
  });
}

/** Comments explain, and an explanation may quote a hex. Code may not. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const LITERAL_DURATION = /(?:\bduration-\d|\bdelay-\d|\[\d+(?:\.\d+)?m?s\]|:\s*["'`]?\d+(?:\.\d+)?m?s\b)/;
// `theme-play` and `theme-play-light` are the scope's own class, written in `scope.tsx` alone
// (`public-graph.test.ts` holds that); they are not the palette.
//
// ★ The playground's palette is refused by its COLOURS' names, not by the word «play»: the
// display scale is `text-play-sm` … `-xl` and the curve is `ease-play`, and both are tokens a
// primitive is meant to read (DEC-186 §2).
const RAW_PALETTE = /\b(?:navy|silver|slate)-[a-z0-9]|\bplay-(?:ink|surface|line|bone|muted|lime|coral|paper|edge)\b/;
const PROTOTYPE_CLASS = /className=["'`](?:[^"'`]*\s)?(?:cta|bx|lvl|lvl-in|celebrate|confetti|panelc)(?:\s|["'`])/;

const files = walk(UI);

describe("tokens only, in src/components/ui", () => {
  it("finds the primitives", () => {
    expect(files.length).toBeGreaterThanOrEqual(BEFORE_WAVE_15.size);
    for (const name of BEFORE_WAVE_15) expect(files, name).toContain(name);
  });

  const created = files.filter((f) => !BEFORE_WAVE_15.has(f) && !f.startsWith(ARTWORK));

  it.each(created.length ? created : ["(none yet)"])("a file created this wave holds no hex, no literal duration, no raw palette name — %s", (file) => {
    if (file === "(none yet)") return;
    const source = code(readFileSync(join(UI, file), "utf8"));
    expect(source.match(HEX)?.[0], "a hex").toBeUndefined();
    expect(source.match(LITERAL_DURATION)?.[0], "a literal duration").toBeUndefined();
    expect(source.match(RAW_PALETTE)?.[0], "a raw palette name").toBeUndefined();
  });

  it.each(files.filter((f) => !f.startsWith(ARTWORK)))("no class under pg:, pg-dark: or pg-light: holds one — %s", (file) => {
    const source = code(readFileSync(join(UI, file), "utf8"));
    const scoped = source.match(/\bpg(?:-dark|-light)?:[^\s"'`}]+/g) ?? [];
    for (const cls of scoped) {
      expect(HEX.test(cls), `${cls} holds a hex`).toBe(false);
      expect(LITERAL_DURATION.test(cls), `${cls} holds a literal duration`).toBe(false);
      expect(RAW_PALETTE.test(cls), `${cls} names the raw palette`).toBe(false);
    }
  });

  it.each(files)("no prototype class name appears — %s", (file) => {
    // `docs/design/prototypes/*.html` are behaviour references. Nothing in them is pasted.
    expect(code(readFileSync(join(UI, file), "utf8")).match(PROTOTYPE_CLASS)?.[0]).toBeUndefined();
  });

  it("the gate bites: it refuses what it is meant to refuse", () => {
    // A guard against a vacuous pass — a regex that matches nothing passes every file.
    expect(HEX.test('className="bg-[#C6FF3D]"')).toBe(true);
    expect(LITERAL_DURATION.test('className="duration-150"')).toBe(true);
    expect(LITERAL_DURATION.test('className="transition-[transform] duration-[220ms]"')).toBe(true);
    expect(LITERAL_DURATION.test('style={{ transitionDuration: "220ms" }}')).toBe(true);
    expect(RAW_PALETTE.test('className="pg:bg-play-lime"')).toBe(true);
    expect(RAW_PALETTE.test('className="hover:bg-silver-100"')).toBe(true);
    expect(RAW_PALETTE.test('className="theme-play theme-play-light"')).toBe(false);
    // And lets through what it must.
    expect(HEX.test('className="pg:bg-accent pg:text-on-accent"')).toBe(false);
    expect(LITERAL_DURATION.test('className="duration-(--duration-fast)"')).toBe(false);
    expect(RAW_PALETTE.test('className="pg:rounded-pill pg:bg-raised"')).toBe(false);
    expect(RAW_PALETTE.test('className="pg:text-play-sm pg:ease-play pg:font-display"')).toBe(false);
    expect(RAW_PALETTE.test('className="pg:text-play-bone"')).toBe(true);
    expect(RAW_PALETTE.test('className="pg:border-play-line"')).toBe(true);
  });
});
