import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// wave 15 · content's captures (DEC-186 §9, contract 4): the fourteen primitives in
// the gallery, on both of the scope's grounds, at 390 px and at desktop width; the
// file drop's own states, which live in the control and not in props; and each new
// primitive's counterpart in the prototypes, for the lead to open beside it. The
// lead runs this against a build made with `KAREEM_GALLERY=1` — the gallery 404s
// otherwise (`proxy.ts`).
//
// A demo carries no scope of its own: `playground.tsx` renders it once under the
// dark scope and once under the light one. Each demo's root is
// `data-demo="<primitive>"`, so a capture is the demo's own box on one ground —
// never the whole gallery, whose length moves every time a demo is wired. A demo
// not yet wired is skipped, not failed.
//
// Captures land at `.qa-shots/rtl/wave15-content-<primitive>-<ground>-<width>.png`,
// honouring `E2E_SHOTS_DIR`.

const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

const PRIMITIVES = [
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

for (const primitive of PRIMITIVES) {
  for (const width of WIDTHS) {
    test(`${primitive} at ${width.name}`, async ({ page }) => {
      await openGallery(page, width.size);
      test.skip((await page.locator(`[data-demo="${primitive}"]`).count()) === 0, `${primitive}'s demo is not wired into the gallery yet`);

      // No sideways scroll at any width (one column, logical properties).
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);

      for (const ground of GROUNDS) {
        const box = page.locator(demoOn(primitive, ground.scope));
        await expect(box).toHaveCount(1);
        await expect(box).toBeVisible();
        await box.scrollIntoViewIfNeeded();
        await box.screenshot({ path: join(SHOTS, `wave15-content-${primitive}-${ground.name}-${width.name}.png`), animations: "disabled" });
      }
    });
  }
}

// The file drop's picked, refused and drag-over states live in the control, not in props: the
// demo cannot set them, so a real file is dropped on the first zone here.
for (const width of WIDTHS) {
  test(`file-drop's picked and refused files at ${width.name}`, async ({ page }) => {
    await openGallery(page, width.size);
    test.skip((await page.locator('[data-demo="file-drop"]').count()) === 0, "file-drop's demo is not wired into the gallery yet");
    for (const ground of GROUNDS) {
      const demo = page.locator(demoOn("file-drop", ground.scope));
      // Hidden by design (`file-drop.tsx`); Playwright can still hand it files.
      await demo.locator('input[name="demo-material"]').setInputFiles([
        { name: "الدرس-الأول.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n") },
        { name: "عرض.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: Buffer.from("x") },
      ]);
      await expect(demo.getByText("الدرس-الأول.pdf")).toBeVisible();
      await expect(demo.getByText("عرض.pptx")).toBeVisible();
      await demo.scrollIntoViewIfNeeded();
      await demo.screenshot({ path: join(SHOTS, `wave15-content-file-drop-picked-${ground.name}-${width.name}.png`), animations: "disabled" });
    }
  });
}

test("file-drop's drag-over state, on both grounds", async ({ page }) => {
  await openGallery(page, WIDTHS[0].size);
  test.skip((await page.locator('[data-demo="file-drop"]').count()) === 0, "file-drop's demo is not wired into the gallery yet");
  for (const ground of GROUNDS) {
    const demo = page.locator(demoOn("file-drop", ground.scope));
    const zone = demo.locator("div.border-dashed").first();
    await zone.scrollIntoViewIfNeeded();
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await zone.dispatchEvent("dragover", { dataTransfer });
    await zone.screenshot({ path: join(SHOTS, `wave15-content-file-drop-dragover-${ground.name}-390.png`), animations: "disabled" });
    await zone.dispatchEvent("dragleave", { dataTransfer });
  }
});

test("every primitive's demo is in both grounds, once each", async ({ page }) => {
  await openGallery(page, WIDTHS[1].size);
  for (const primitive of PRIMITIVES) {
    const count = await page.locator(`[data-demo="${primitive}"]`).count();
    // 0 while the lead has not wired it; once wired, exactly one per ground.
    expect([0, GROUNDS.length], primitive).toContain(count);
  }
});

// ── The prototypes, for the side-by-side (DEC-183 rule 4: behaviour references, never code). ──
// Opened from disk; their Google Fonts `<link>` is the prototype's own and may not load here,
// which changes the face and nothing about hierarchy, spacing or shape — the bar the README sets.

const PROTOTYPES = resolve(process.cwd(), "docs/design/prototypes");

const COUNTERPARTS = [
  { file: "motion-story.html", selector: "#stories", name: "story-ring" },
  { file: "motion-story.html", selector: "#card", name: "poster-sticker-reaction-bar" },
  { file: "motion-story.html", selector: "#race", name: "progress-bar" },
  { file: "stories.html", selector: "#rings", name: "story-ring" },
  { file: "stories.html", selector: ".feed .card", name: "poster" },
] as const;

for (const c of COUNTERPARTS) {
  test(`prototype counterpart — ${c.file} ${c.name}`, async ({ page }) => {
    // Wide enough that the prototype's phone is drawn at 1:1 (its stage scales it to fit).
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(pathToFileURL(join(PROTOTYPES, c.file)).href);
    // motion-story plays itself; stop it on its first scene, the one these elements are drawn on.
    const auto = page.locator("#btnAuto");
    if ((await auto.count()) && (await auto.getAttribute("aria-pressed")) === "true") await auto.click();
    const el = page.locator(c.selector).first();
    await expect(el).toBeVisible();
    const stem = c.file.replace(/\.html$/, "");
    await el.screenshot({ path: join(SHOTS, `wave15-content-prototype-${stem}-${c.name}.png`), animations: "disabled" });
  });
}
