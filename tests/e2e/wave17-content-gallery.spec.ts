import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// wave 17 · content's gallery captures (DEC-199 §3 and §6, REQ-UIX-050, REQ-UIX-051; row N4).
//
// ★ THESE ARE EVIDENCE FOR THE OWNER'S REVIEW ON A PHONE, NOT A SUBSTITUTE FOR IT. The wave's
// acceptance is the owner opening `/ar/ui` (D4); what lands here is what the lead opens first,
// in bands, never downscaled.
//
// The ten demos this wave adds — the eight primitives the design's list never named, `button`
// and `route-progress` — and content's fourteen again, on the ground the whole app now stands
// on. A capture is a demo's own box on one ground, never the whole gallery: its length moves
// with every demo wired, and past 16,384 px a capture wraps. A demo not yet wired is skipped,
// not failed. The lead runs this against a build made with `KAREEM_GALLERY=1` — the gallery
// 404s otherwise (`proxy.ts`).
//
// Three things no prop can hold still are driven here instead: a row moved by a press alone
// (DEC-093), and the link's pending dot with the route bar, both of which exist only while a
// navigation is pending (sync 1).
//
// Captures land at `.qa-shots/rtl/wave17-content-<primitive>-<ground>-<width>.png`, honouring
// `E2E_SHOTS_DIR`.

const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

const NEW = ["page-header", "section-header", "prose", "link", "button", "icon-button", "submit-button", "reorderable-list", "icons", "route-progress"] as const;

const MINE = [
  "tag-chip",
  "badge",
  "avatar",
  "card",
  "progress",
  "empty-state",
  "stat",
  "panel",
  "file-drop",
  "sticker",
  "poster",
  "reaction-bar",
  "progress-bar",
  "story-ring",
] as const;

// The scope's class is written in `ui/scope.tsx` alone; a test may select by it.
const GROUNDS = [
  { name: "dark", scope: ".theme-play:not(.theme-play-light)" },
  { name: "light", scope: ".theme-play.theme-play-light" },
] as const;

const WIDTHS = [
  { name: "390", size: { width: 390, height: 844 } },
  { name: "desktop", size: { width: 1280, height: 900 } },
] as const;

const demoOn = (primitive: string, scope: string) => `${scope} [data-demo="${primitive}"]`;

// The widths are set here, so one project is enough.
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "one project takes both widths");
});

async function openGallery(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  const res = await page.goto("/ar/ui");
  expect(res?.status(), "the gallery needs KAREEM_GALLERY=1").toBe(200);
  await page.evaluate(() => document.fonts.ready);
}

async function skipUnlessWired(page: Page, primitive: string) {
  test.skip((await page.locator(`[data-demo="${primitive}"]`).count()) === 0, `${primitive}'s demo is not wired into the gallery yet`);
}

for (const primitive of [...NEW, ...MINE]) {
  for (const width of WIDTHS) {
    test(`${primitive} at ${width.name}`, async ({ page }) => {
      await openGallery(page, width.size);
      await skipUnlessWired(page, primitive);

      // No sideways scroll at any width (one column, logical properties).
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);

      for (const ground of GROUNDS) {
        const box = page.locator(demoOn(primitive, ground.scope));
        await expect(box).toHaveCount(1);
        await expect(box).toBeVisible();
        await box.scrollIntoViewIfNeeded();
        // A demo wider than its ground is a demo that scrolls the phone sideways inside a clip.
        const spill = await box.evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(spill, `${primitive} is wider than its box on the ${ground.name} ground`).toBeLessThanOrEqual(1);
        await box.screenshot({ path: join(SHOTS, `wave17-content-${primitive}-${ground.name}-${width.name}.png`), animations: "disabled" });
      }
    });
  }
}

test("every demo is in both grounds, once each", async ({ page }) => {
  await openGallery(page, WIDTHS[1].size);
  for (const primitive of [...NEW, ...MINE]) {
    const count = await page.locator(`[data-demo="${primitive}"]`).count();
    // 0 while the lead has not wired it; once wired, exactly one per ground.
    expect([0, GROUNDS.length], primitive).toContain(count);
  }
});

// ── `icons`: every export of the file, drawn, at both sizes (REQ-UIX-052). ──
// The demo reads the module; `data-count` is what it found. What is measured here is that each
// one PAINTS: a glyph that compiles and draws nothing (a path with no stroke, a size of 0) passes
// every unit test.
for (const ground of GROUNDS) {
  test(`every glyph paints at both sizes on the ${ground.name} ground`, async ({ page }) => {
    await openGallery(page, WIDTHS[0].size);
    await skipUnlessWired(page, "icons");

    const demo = page.locator(demoOn("icons", ground.scope));
    const declared = Number(await demo.getAttribute("data-count"));
    expect(declared).toBeGreaterThan(0);

    const cells = await demo.locator("[data-glyph]").evaluateAll((items) =>
      items.map((li) => {
        const sizes = [...li.querySelectorAll("svg")].map((svg) => {
          const r = svg.getBoundingClientRect();
          return { w: r.width, h: r.height };
        });
        return { name: li.getAttribute("data-glyph"), sizes, text: li.textContent ?? "" };
      }),
    );
    expect(cells).toHaveLength(declared);
    for (const cell of cells) {
      expect(cell.sizes.length, `${cell.name}: a body size and a display size`).toBeGreaterThanOrEqual(2);
      for (const s of cell.sizes) {
        expect(s.w, `${cell.name} has no width`).toBeGreaterThan(0);
        expect(s.h, `${cell.name} is not square`).toBeCloseTo(s.w, 0);
      }
      // The display size is larger than the body size: `1em` follows the text.
      expect(Math.max(...cell.sizes.map((s) => s.w)), `${cell.name} does not follow the text size`).toBeGreaterThan(Math.min(...cell.sizes.map((s) => s.w)));
      expect(cell.text, `${cell.name} is not named`).toContain(cell.name!);
    }
  });
}

// ── `reorderable-list`: a press and a release, and the row is one place down (DEC-093). ──
test("a press alone moves a row, and only in the list that was pressed", async ({ page }) => {
  await openGallery(page, WIDTHS[0].size);
  await skipUnlessWired(page, "reorderable-list");

  const demo = page.locator(demoOn("reorderable-list", GROUNDS[0].scope));
  const side = demo.locator('[data-state="side"]');
  const dense = demo.locator('[data-state="sm"]');
  const first = (list: typeof side) => list.locator("ol > li").first().locator("bdi").first();

  const before = await first(side).textContent();
  await side.locator("ol > li").first().getByRole("button", { name: "انقل لأسفل" }).click();
  await expect(first(side)).not.toHaveText(before!);
  await expect(side.locator("ol > li").nth(1).locator("bdi").first()).toHaveText(before!);
  await expect(first(dense)).toHaveText(before!);

  // At an end a control is inert and still focusable: `aria-disabled`, never `disabled`.
  const top = side.locator("ol > li").first().getByRole("button", { name: "انقل لأعلى" });
  await expect(top).toHaveAttribute("aria-disabled", "true");
  await expect(top).toBeEnabled();

  await demo.scrollIntoViewIfNeeded();
  await demo.screenshot({ path: join(SHOTS, "wave17-content-reorderable-list-moved-dark-390.png"), animations: "disabled" });
});

// ── The pending dot and the route bar: drawn only while a navigation is pending. ──
// No prop holds either still, so the link's own navigation is stalled at the network: the dot
// stands beside the link and the bar at the top of the viewport until the request is released.
// ★ The bar is `fixed` to the viewport and outside every demo's box, so it is captured as the
// viewport's top band, not as an element.
for (const width of WIDTHS) {
  test(`a stalled navigation draws the link's dot and the route bar at ${width.name}`, async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Installed before the page opens, so the link's prefetch is held too.
    await page.route(/from=route-progress/, async (route) => {
      await held;
      // A test skipped or ended while the request is held closes the page under it.
      await route.continue().catch(() => undefined);
    });

    await openGallery(page, width.size);
    await skipUnlessWired(page, "route-progress");

    const demo = page.locator(demoOn("route-progress", GROUNDS[0].scope));
    await expect(page.locator("[data-route-progress]")).toHaveCount(0);
    await demo.scrollIntoViewIfNeeded();
    await demo.getByRole("link").click();

    const dot = demo.locator("[data-link-pending]");
    const bar = page.locator("[data-route-progress]");
    await expect(dot).toBeVisible();
    await expect(bar).toHaveCount(1);
    await expect(bar).toBeVisible();

    // The bar spans the viewport's top edge and is the scope's accent, not the old navy.
    const geometry = await bar.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const fill = el.firstElementChild!;
      const probe = document.createElement("span");
      probe.className = "bg-accent";
      el.parentElement!.appendChild(probe);
      const accent = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { top: r.top, width: r.width, viewport: window.innerWidth, fill: getComputedStyle(fill).backgroundColor, accent, inScope: el.closest(".theme-play") !== null };
    });
    expect(geometry.top).toBe(0);
    expect(geometry.width).toBe(geometry.viewport);
    expect(geometry.inScope, "the bar is mounted inside the scope").toBe(true);
    expect(geometry.fill).toBe(geometry.accent);

    await demo.screenshot({ path: join(SHOTS, `wave17-content-link-pending-dark-${width.name}.png`) });
    await page.screenshot({ path: join(SHOTS, `wave17-content-route-progress-visible-dark-${width.name}.png`), clip: { x: 0, y: 0, width: width.size.width, height: 64 } });

    release();
    await expect(bar).toHaveCount(0);
    await expect(dot).toHaveCount(0);
  });
}
