import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// wave 15 · sessions' captures (DEC-186 §9, contract 4, REQ-UIX-001): the ten primitives in the
// gallery — the eight form primitives, `session-cta` and `code-input` — on both of the scope's
// grounds, at 390 px and at desktop width; the focus ring each control shows inside the scope,
// which lives in the browser and not in props; and the two new primitives' counterparts in the
// prototypes, for the lead to open beside them. The lead runs this against a build made with
// `KAREEM_GALLERY=1` — the gallery 404s otherwise (`proxy.ts`).
//
// ★ A capture is ONE DEMO'S BOX on one ground (`[data-demo="<primitive>"]`, set by the lead's
// `playground.tsx`), never a full-page shot of `/ar/ui`: the gallery is taller than 16,384 px,
// past which Chromium repaints a full-page capture from the top (the lead, b7b050a4). A demo not yet
// wired is skipped, not failed.
//
// Captures land at `.qa-shots/rtl/wave15-sessions-<primitive>-<ground>-<width>.png`, honouring
// `E2E_SHOTS_DIR`.

const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

const PRIMITIVES = [
  "field",
  "input",
  "textarea",
  "select",
  "checkbox",
  "radio-group",
  "switch",
  "form-summary",
  "session-cta",
  "code-input",
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
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function wired(page: Page, primitive: string) {
  return (await page.locator(`[data-demo="${primitive}"]`).count()) > 0;
}

for (const primitive of PRIMITIVES) {
  for (const width of WIDTHS) {
    test(`${primitive} at ${width.name}`, async ({ page }) => {
      await openGallery(page, width.size);
      test.skip(!(await wired(page, primitive)), `${primitive}'s demo is not wired into the gallery yet`);

      // No sideways scroll at any width (one column, logical properties). `code-input`'s six
      // boxes are 328 px inside the scope, which is the tightest fit at 390.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);

      for (const ground of GROUNDS) {
        const box = page.locator(demoOn(primitive, ground.scope));
        await expect(box).toHaveCount(1);
        await expect(box).toBeVisible();
        // `form-summary` focuses itself on mount (REQ-UIX-010); take focus off it so its ring is
        // not in every other demo's capture.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await box.scrollIntoViewIfNeeded();
        await box.screenshot({ path: join(SHOTS, `wave15-sessions-${primitive}-${ground.name}-${width.name}.png`), animations: "disabled" });
      }
    });
  }
}

// ── The scope's focus ring, on the controls that show one (REQ-UIX-030: visible at 3:1). ──
// Focused by the keyboard's Tab from the element before, so `:focus-visible` is the browser's own
// answer. The ring is 3 px in `--ring`: the accent on the dark ground, the ink on the light one.

const FOCUSABLE: { primitive: string; target: string }[] = [
  { primitive: "input", target: "input:not([type=hidden])" },
  { primitive: "checkbox", target: "input[type=checkbox]:not([disabled])" },
  { primitive: "radio-group", target: "input[type=radio]:checked" },
  { primitive: "switch", target: 'input[role="switch"]:not([disabled])' },
  { primitive: "code-input", target: "input:not([type=hidden]):not([disabled])" },
  { primitive: "session-cta", target: "button:not([disabled])" },
];

for (const { primitive, target } of FOCUSABLE) {
  test(`${primitive}'s focus ring on both grounds`, async ({ page }) => {
    await openGallery(page, WIDTHS[0].size);
    test.skip(!(await wired(page, primitive)), `${primitive}'s demo is not wired into the gallery yet`);
    for (const ground of GROUNDS) {
      const demo = page.locator(demoOn(primitive, ground.scope));
      const control = demo.locator(target).first();
      await control.scrollIntoViewIfNeeded();
      await control.focus();
      // Chromium shows `:focus-visible` after a keyboard move; step off and back with the keyboard.
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(control).toBeFocused();
      expect(await control.evaluate((el) => el.matches(":focus-visible")), "the ring is the keyboard's").toBe(true);
      await demo.screenshot({ path: join(SHOTS, `wave15-sessions-${primitive}-focus-${ground.name}-390.png`), animations: "disabled" });
    }
  });
}

test("every primitive's demo is in both grounds, once each", async ({ page }) => {
  await openGallery(page, WIDTHS[1].size);
  for (const primitive of PRIMITIVES) {
    const count = await page.locator(`[data-demo="${primitive}"]`).count();
    // 0 while the lead has not wired it; once wired, exactly one per ground.
    expect([0, GROUNDS.length], primitive).toContain(count);
  }
});

test("no id is written twice on the gallery page — a label on one ground never focuses the other", async ({ page }) => {
  await openGallery(page, WIDTHS[1].size);
  const duplicates = await page.evaluate(() => {
    const seen = new Map<string, number>();
    for (const el of Array.from(document.querySelectorAll("[id]"))) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
    return Array.from(seen.entries()).filter(([, n]) => n > 1).map(([id]) => id);
  });
  expect(duplicates).toEqual([]);
});

// ── The prototypes, for the side-by-side (DEC-183 rule 4: behaviour references, never code). ──
// Opened from disk; their Google Fonts `<link>` is the prototype's own and may not load here,
// which changes the face and nothing about hierarchy, spacing or shape — the bar the README sets.

const PROTOTYPES = resolve(process.cwd(), "docs/design/prototypes");

async function openPrototype(page: Page) {
  // Wide enough that the prototype's phone is drawn at 1:1 (its stage scales it to fit).
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(pathToFileURL(join(PROTOTYPES, "motion-story.html")).href);
  // It plays itself; stop it on its first scene.
  const auto = page.locator("#btnAuto");
  if ((await auto.count()) && (await auto.getAttribute("aria-pressed")) === "true") await auto.click();
}

test("prototype counterpart — motion-story's reserve control", async ({ page }) => {
  await openPrototype(page);
  const cta = page.locator("#cta");
  await expect(cta).toBeVisible();
  await cta.screenshot({ path: join(SHOTS, "wave15-sessions-prototype-motion-story-session-cta.png"), animations: "disabled" });
});

test("prototype counterpart — motion-story's code boxes", async ({ page }) => {
  await openPrototype(page);
  // The check-in sheet slides in on a later scene; show it in place — a reference page, not ours.
  await page.evaluate(() => document.getElementById("sheet")?.classList.add("show"));
  const boxes = page.locator("#boxes");
  await expect(boxes).toBeVisible();
  await boxes.screenshot({ path: join(SHOTS, "wave15-sessions-prototype-motion-story-code-input.png"), animations: "disabled" });
});
