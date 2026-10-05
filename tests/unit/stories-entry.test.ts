// «شاهد القصة» is rendered once per width (REQ-STO-008, DEC-251 §4.7) — accepted on one condition: at any width only
// ONE entry is in the accessibility tree and the tab order. So the other must be `display: none` (`hidden`, or the
// row's `lg:hidden`), never a visual hiding (`sr-only`, `opacity-0`, `invisible`), which would leave a second button a
// screen reader and Tab both reach. jsdom applies no Tailwind, so this reads the two wrappers' classes from source;
// `tests/e2e/wave26-sessions-story.spec.ts` counts the role at 390 and at 1280 in a real browser.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("one «شاهد القصة» per width", () => {
  it("the phone's entry lives in the top row, which is display:none from lg", () => {
    const row = read("src/components/sessions/event-top-row.tsx");
    expect(row).toMatch(/<div className="flex items-center gap-2\.5 py-3 lg:hidden">/);
    expect(row).toMatch(/phase === "live" && story \? \(\s*story/);
  });

  it("the desktop's entry is display:none below lg and nothing hides it only from sight", () => {
    const hero = read("src/components/sessions/event-hero.tsx");
    expect(hero).toContain('{story ? <span className="hidden lg:inline-flex">{story}</span> : null}');
    expect(hero).not.toMatch(/sr-only[^"]*">\{story\}|opacity-0[^"]*">\{story\}|invisible[^"]*">\{story\}/);
  });

  it("the page gives both the same story, and only while live", () => {
    const page = read("src/app/[locale]/app/sessions/[id]/page.tsx");
    expect(page).toContain('phase === "live" ? getSessionStory(locale, id)');
    expect(page.match(/story=\{story \? <StoryEntry story=\{story\} \/> : undefined\}/g)).toHaveLength(2);
  });
});
