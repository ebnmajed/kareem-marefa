import { join } from "node:path";
import { expect, test } from "@playwright/test";

// wave 15 · scoring's captures (DEC-186 §9, contract 4): `rank-row`, `race-bar`
// and `level-card` in the gallery, on both of the scope's grounds, at 390 px and
// at desktop width. The lead runs this against a build made with
// `KAREEM_GALLERY=1`; the gallery 404s otherwise (`proxy.ts`).
//
// A demo carries no scope of its own: the gallery's `playground.tsx` renders it
// once under the dark scope and once under the light one. Each demo's root is
// `data-demo="<primitive>"`, so a capture is the demo's own box on one ground —
// never the whole gallery, whose length moves every time another demo is wired.
//
// A demo not yet wired into `playground.tsx` is skipped, not failed: the lead wires
// each on its own commit.
//
// Captures land at `.qa-shots/rtl/wave15-scoring-<primitive>-<ground>-<width>.png`,
// honouring `E2E_SHOTS_DIR`.

const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

const PRIMITIVES = ["rank-row", "race-bar", "level-card"] as const;
// The scope's class is written in `ui/scope.tsx` alone; a test may select by it.
const GROUNDS = [
  { name: "dark", scope: ".theme-play:not(.theme-play-light)" },
  { name: "light", scope: ".theme-play.theme-play-light" },
] as const;

// What counts as one row's frame, per primitive: a board row, a race row, the
// level card's visible face.
const FRAMES: Record<(typeof PRIMITIVES)[number], string> = {
  "rank-row": "li",
  "race-bar": "li",
  "level-card": '[role="group"][data-visible="true"]',
};

const demoOn = (primitive: string, scope: string) => `${scope} [data-demo="${primitive}"]`;
const WIDTHS = [
  { name: "390", size: { width: 390, height: 844 } },
  { name: "desktop", size: { width: 1280, height: 900 } },
] as const;

// The widths are set here, so one project is enough: the phone project would
// shoot the same boxes again at the same sizes.
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "one project takes both widths");
});

for (const primitive of PRIMITIVES) {
  for (const width of WIDTHS) {
    test(`${primitive} at ${width.name}`, async ({ page }) => {
      await page.setViewportSize(width.size);
      const res = await page.goto("/ar/ui");
      expect(res?.status(), "the gallery needs KAREEM_GALLERY=1").toBe(200);

      test.skip((await page.locator(`[data-demo="${primitive}"]`).count()) === 0, `${primitive}'s demo is not wired into the gallery yet`);

      // No sideways scroll at 390 px (DEC-183 rule: logical properties, one column).
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);

      await page.evaluate(() => document.fonts.ready);
      for (const ground of GROUNDS) {
        // ★ Every row's content inside the row's frame (the lead's 390 px finding on
        // race-bar). The page-level check above misses it: in RTL an overflow runs
        // toward the inline END, the left, and does not always widen the page.
        const escapes = await page.locator(demoOn(primitive, ground.scope)).evaluate((demo, selector) => {
          const out: string[] = [];
          for (const frame of demo.querySelectorAll<HTMLElement>(selector)) {
            const box = frame.getBoundingClientRect();
            for (const el of frame.querySelectorAll<HTMLElement>("*")) {
              if (el.closest(".sr-only")) continue; // 1 px and clipped by design
              const r = el.getBoundingClientRect();
              if (r.width === 0 && r.height === 0) continue;
              if (r.left < box.left - 0.5 || r.right > box.right + 0.5) {
                out.push(`${(frame.textContent ?? "").slice(0, 40)} › <${el.tagName.toLowerCase()}> ${Math.round(r.left)}–${Math.round(r.right)} outside ${Math.round(box.left)}–${Math.round(box.right)}`);
              }
            }
          }
          return out;
        }, FRAMES[primitive]);
        expect(escapes, `${primitive} on ${ground.name} at ${width.name}: content outside its row`).toEqual([]);

        const box = page.locator(demoOn(primitive, ground.scope));
        await expect(box).toHaveCount(1);
        await expect(box).toBeVisible();
        await box.scrollIntoViewIfNeeded();
        await box.screenshot({ path: join(SHOTS, `wave15-scoring-${primitive}-${ground.name}-${width.name}.png`), animations: "disabled" });
      }
    });
  }
}

test("level-card: both faces are in the accessibility tree, whichever shows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ar/ui");
  const demo = page.locator(demoOn("level-card", GROUNDS[0].scope));
  test.skip((await demo.count()) === 0, "level-card's demo is not wired into the gallery yet");
  // The «after the flip» state: the held face is visually hidden, and still named.
  const card = demo.locator('[data-shown="reached"]').first();
  await expect(card.getByRole("group", { name: "مستواك الحالي" })).toHaveCount(1);
  await expect(card.getByRole("group", { name: "مستوى جديد" })).toBeVisible();
});
