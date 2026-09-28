import { join } from "node:path";
import { expect, test } from "@playwright/test";

// wave 15 · console's captures (DEC-186 §9, contract 4): `data-table`,
// `combobox`, `menu`, `tabs`, `sheet` and `date-time` in the gallery, on both
// of the scope's grounds, at 390 px and at desktop width. The lead runs this
// against a build made with `KAREEM_GALLERY=1`; the gallery 404s otherwise
// (`proxy.ts`).
//
// Each demo carries a `data-demo="<primitive>"` root with a `data-ground`
// child per scope, so a capture is the demo's own box — never the whole
// gallery, whose length moves every time another track's demo is wired
// (the pattern `wave15-scoring-gallery.spec.ts` already established).
//
// A demo not yet wired into `page.tsx` is skipped, not failed: the lead
// wires each on its own commit.
//
// Captures land at
// `.qa-shots/rtl/wave15-console-<primitive>-<ground>-<width>.png`, honouring
// `E2E_SHOTS_DIR`.

const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

const PRIMITIVES = ["data-table", "combobox", "menu", "tabs", "sheet", "date-time"] as const;
const GROUNDS = ["dark", "light"] as const;
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

      const demo = page.locator(`[data-demo="${primitive}"]`);
      test.skip((await demo.count()) === 0, `${primitive}'s demo is not wired into the gallery yet`);

      // No sideways scroll at 390 px (DEC-183 rule: logical properties, one column).
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);

      await page.evaluate(() => document.fonts.ready);
      for (const ground of GROUNDS) {
        const box = demo.locator(`[data-ground="${ground}"]`);
        await expect(box).toBeVisible();
        await box.scrollIntoViewIfNeeded();
        await box.screenshot({ path: join(SHOTS, `wave15-console-${primitive}-${ground}-${width.name}.png`), animations: "disabled" });
      }
    });
  }
}
