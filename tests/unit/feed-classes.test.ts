// The feed's classes are written out in full — wave 18, the lead's 1280 capture. Tailwind generates a class only
// when its whole name appears in the source, so a variant prefix held in a constant and interpolated is silently
// never generated: the home's desktop post lost its poster width that way and the poster collapsed to a strip.
// This refuses the pattern in every file the home renders.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const FILES = [
  ...readdirSync(join(ROOT, "src/components/feed"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `src/components/feed/${f}`),
  "src/components/ui/feed-item.tsx",
  "src/components/ui/attendee-stack.tsx",
  "src/app/[locale]/app/page.tsx",
  "src/app/[locale]/app/loading.tsx",
];

/** An interpolation followed straight by a colon: a variant built at runtime. */
const BUILT_VARIANT = /\$\{[^}]*\}:[\w@[!-]/;

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("the home's classes are literal", () => {
  it("finds the files", () => expect(FILES.length).toBeGreaterThan(8));

  it.each(FILES)("%s builds no Tailwind variant from an interpolation", (file) => {
    const found = code(readFileSync(join(ROOT, file), "utf8")).match(BUILT_VARIANT);
    expect(found?.[0], 'write the whole class out, e.g. "@min-[34rem]:w-40"').toBeUndefined();
  });

  it("the guard bites on the shape that broke the desktop post", () => {
    const broken = 'const WIDE = "@min-[34rem]";\nconst c = `block ${WIDE}:w-40 ${WIDE}:shrink-0`;';
    expect(code(broken)).toMatch(BUILT_VARIANT);
    expect('className="@min-[34rem]:w-40"').not.toMatch(BUILT_VARIANT);
  });
});
