import { join } from "node:path";
import { expect, test } from "@playwright/test";

// wave 15 · the lead's primitives in the gallery — contracts 4 and 6 (DEC-186,
// DEC-188). What a capture of the gallery cannot hold is what is closed: a
// dialog and a toast render nothing until someone asks. So this spec asks, on
// each of the scope's grounds, and measures what the browser computed.
//
// ★ THE POINT OF CONTRACT 6 IS HERE. A dialog is a portal, and a portal lands
// in `<body>`, outside the scope. jsdom can show where the node lands
// (`tests/components/ui/scope-portal.test.tsx`); only a browser can show that
// it then WEARS the scope — the panel's corner, the scope's surface, its scrim
// — and that a dialog opened on the light ground is light.
//
// Run against a build made with `KAREEM_GALLERY=1`; the gallery 404s otherwise.
// Captures land at `.qa-shots/rtl/wave15-lead-<surface>-<ground>-390.png`,
// honouring `E2E_SHOTS_DIR`. They are of the VIEWPORT: the gallery is taller
// than one Chromium surface, and a full-page capture of it wraps.

const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

const GROUNDS = [
  { name: "dark", scope: ".theme-play:not(.theme-play-light)" },
  { name: "light", scope: ".theme-play.theme-play-light" },
] as const;

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "390 px is the review width; one project is enough");
  await page.setViewportSize({ width: 390, height: 844 });
  const res = await page.goto("/ar/ui");
  expect(res?.status(), "the gallery needs KAREEM_GALLERY=1").toBe(200);
  await page.evaluate(() => document.fonts.ready);
  // ★ The page scrolls SMOOTHLY (`html { scroll-behavior: smooth }`), and a press or a focus can
  // start a scroll. A viewport capture taken while it runs shows the fixed layers and the page
  // out of step: the first captures of the dialog had an undimmed band at one edge, and a sheet
  // that seemed to stop short of the screen's bottom. Measured in a browser, the scrim covered
  // 0 – 844 and nothing was wrong. So scrolling is instant here, and `still()` waits it out.
  await page.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
});

/** Wait until the page has stopped scrolling: three equal readings, a frame apart. */
async function still(page: import("@playwright/test").Page) {
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        let last = -1;
        let equal = 0;
        let frames = 0;
        const step = () => {
          equal = scrollY === last ? equal + 1 : 0;
          last = scrollY;
          if (equal >= 3 || ++frames > 120) done();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
}

/** The colour a scope's own element computes for a utility, so nothing here names a hex. */
async function scopeComputes(page: import("@playwright/test").Page, scope: string, className: string, property: string) {
  return page.locator(scope).first().evaluate(
    (el, { className, property }) => {
      const probe = document.createElement("div");
      probe.className = className;
      el.appendChild(probe);
      const value = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      return value;
    },
    { className, property },
  );
}

/**
 * Whether a computed `box-shadow` paints anything. Tailwind's `shadow-none` does not compute to
 * `none`: it composes five layers, each `rgba(0, 0, 0, 0) 0px 0px 0px 0px`. What is asked is that
 * nothing is drawn, so every layer must be fully transparent or have no extent.
 */
function paintsAShadow(value: string) {
  if (value === "none") return false;
  const layers = value.split(/,(?![^(]*\))/).map((l) => l.trim());
  return layers.some((layer) => {
    const transparent = /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)|transparent/.test(layer);
    const lengths = (layer.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g) ?? []).map(parseFloat);
    return !transparent && lengths.some((n) => n !== 0);
  });
}

for (const ground of GROUNDS) {
  test(`a dialog opened on the ${ground.name} ground lands inside the scope and wears it`, async ({ page }) => {
    const demo = page.locator(`${ground.scope} [data-demo="dialog"]`);
    await expect(demo).toHaveCount(1);
    await demo.getByRole("button", { name: "إلغاء الحجز" }).click();

    const dialog = page.getByRole("dialog", { name: "إلغاء حجزك؟" });
    await expect(dialog).toBeVisible();

    const where = await dialog.evaluate((el) => ({
      inScope: el.closest(".theme-play") !== null,
      light: el.closest(".theme-play-light") !== null,
      inLanding: el.closest("[data-play-portal]") !== null,
      underBodyDirectly: el.parentElement === document.body,
    }));
    expect(where.inScope, "the dialog is outside the scope").toBe(true);
    expect(where.inLanding).toBe(true);
    expect(where.underBodyDirectly).toBe(false);
    expect(where.light, "the dialog is on the wrong ground").toBe(ground.name === "light");

    // It wears the scope: the panel's corner, a line and no shadow, the scope's ground.
    const computed = await dialog.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, border: cs.borderTopWidth, background: cs.backgroundColor, color: cs.color, position: cs.position };
    });
    expect(computed.radius).toBe("22px");
    expect(paintsAShadow(computed.shadow), `the dialog draws a shadow: ${computed.shadow}`).toBe(false);
    expect(computed.border).toBe("1px");
    expect(computed.position).toBe("fixed");
    // ★ The scope's SURFACE — and its text is the scope's too, so the two are a pair the scope chose.
    // The frame's own background resolves at the root and is white on every ground; this failed
    // on the first run, with the scope's light text on it.
    expect(computed.background).toBe(await scopeComputes(page, ground.scope, "bg-surface", "background-color"));
    expect(computed.color).toBe(await scopeComputes(page, ground.scope, "text-fg-body", "color"));

    // It is whole inside the viewport at 390 px, and it covers the page beneath it.
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);

    // The buttons inside it are the scope's: a pill.
    const danger = dialog.getByRole("button", { name: "ألغِ الحجز" });
    expect(await danger.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("999px");

    // The scrim covers the whole screen, measured and not judged from a picture.
    const scrim = await dialog.evaluate((el) => {
      const r = (el.previousElementSibling as HTMLElement).getBoundingClientRect();
      return { top: r.top, left: r.left, width: r.width, height: r.height, innerWidth, innerHeight };
    });
    expect(scrim.top).toBe(0);
    expect(scrim.left).toBe(0);
    expect(scrim.width).toBe(scrim.innerWidth);
    expect(scrim.height).toBe(scrim.innerHeight);

    await still(page);
    await page.screenshot({ path: join(SHOTS, `wave15-lead-dialog-${ground.name}-390.png`), animations: "disabled" });

    // Escape closes it and focus returns to what opened it — unchanged by the landing place.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(demo.getByRole("button", { name: "إلغاء الحجز" })).toBeFocused();
  });

  test(`a toast raised on the ${ground.name} ground is inside the scope, each tone`, async ({ page }) => {
    const demo = page.locator(`${ground.scope} [data-demo="toast"]`);
    await expect(demo).toHaveCount(1);
    await demo.scrollIntoViewIfNeeded();
    for (const name of ["نجاح", "خطأ", "معلومة مع تراجع"]) await demo.getByRole("button", { name, exact: true }).click();

    const titles = ["حُجز مقعدك", "تعذّر الحجز", "أُلغي حجزك"];
    for (const title of titles) {
      const toast = demo.locator("li", { hasText: title });
      await expect(toast).toBeVisible();
      const c = await toast.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, inScope: el.closest(".theme-play") !== null };
      });
      expect(c.inScope).toBe(true);
      expect(c.radius).toBe("16px");
      expect(paintsAShadow(c.shadow), `the toast draws a shadow: ${c.shadow}`).toBe(false);
    }
    await still(page);
    await page.screenshot({ path: join(SHOTS, `wave15-lead-toast-${ground.name}-390.png`), animations: "disabled" });
  });

  test(`the lead's static demos on the ${ground.name} ground`, async ({ page }) => {
    for (const primitive of ["page-header", "skeleton", "route-error"]) {
      const box = page.locator(`${ground.scope} [data-demo="${primitive}"]`);
      await expect(box).toHaveCount(1);
      await box.scrollIntoViewIfNeeded();
      await box.screenshot({ path: join(SHOTS, `wave15-lead-${primitive}-${ground.name}-390.png`), animations: "disabled" });
    }
    // The retry is the scope's accent and a pill; the mark reads on the ground.
    const retry = page.locator(`${ground.scope} [data-demo="route-error"]`).getByRole("button", { name: "أعد المحاولة" });
    const c = await retry.evaluate((el) => ({ radius: getComputedStyle(el).borderTopLeftRadius, background: getComputedStyle(el).backgroundColor }));
    expect(c.radius).toBe("999px");
    expect(c.background).toBe(await scopeComputes(page, ground.scope, "bg-accent", "background-color"));
  });
}

test("outside the scope the gallery's own dialog-free page has no landing place but the two grounds'", async ({ page }) => {
  expect(await page.locator("[data-play-portal]").count()).toBe(2);
  expect(await page.locator("body > [data-play-portal]").count()).toBe(0);
});
