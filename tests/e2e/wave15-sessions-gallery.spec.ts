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
  // ★ Wave 16 (F1, ledger): `code-input` is served as ONE named field and becomes the six boxes once
  // hydrated. A locator taken before the swap holds a field that leaves the DOM. So every case waits
  // until no server field is left — page-wide, which is also every ground's demo.
  await expect(page.locator("input[autocomplete='one-time-code'][maxlength='6']")).toHaveCount(0);
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

// ── What the browser computes inside each scope, which jsdom cannot see. ──
// A class that reads a colour through a variable resolved at `:root` (the lead's dialog, sync 2:
// `var(--color-canvas)` stayed white inside the scope) paints the page's colour under the scope's
// text. So each control's computed background and text colour are compared with what the scope's
// OWN utilities compute on a probe placed beside it — on the same ground, in the same scope.

const COMPUTED: { primitive: string; target: string; background: string; text: string }[] = [
  { primitive: "field", target: "input:not([type=hidden])", background: "bg-raised", text: "text-fg-heading" },
  { primitive: "input", target: "input:not([type=hidden]):not([disabled])", background: "bg-raised", text: "text-fg-heading" },
  { primitive: "textarea", target: "textarea", background: "bg-raised", text: "text-fg-heading" },
  { primitive: "select", target: "select:not([disabled])", background: "bg-raised", text: "text-fg-heading" },
  { primitive: "code-input", target: "input:not([type=hidden]):not([disabled])", background: "bg-raised", text: "text-fg-heading" },
  { primitive: "session-cta", target: "button:not([disabled])", background: "bg-accent", text: "text-on-accent" },
  { primitive: "form-summary", target: "[role=alert]", background: "bg-transparent", text: "text-fg-body" },
];

for (const { primitive, target, background, text } of COMPUTED) {
  test(`${primitive} paints the scope's own colours on both grounds`, async ({ page }) => {
    await openGallery(page, WIDTHS[1].size);
    test.skip(!(await wired(page, primitive)), `${primitive}'s demo is not wired into the gallery yet`);
    for (const ground of GROUNDS) {
      const got = await page.locator(demoOn(primitive, ground.scope)).locator(target).first().evaluate(
        (el, probes) => {
          const probe = document.createElement("span");
          el.parentElement!.appendChild(probe);
          probe.className = probes.background;
          const wantBackground = getComputedStyle(probe).backgroundColor;
          probe.className = probes.text;
          const wantText = getComputedStyle(probe).color;
          probe.remove();
          const cs = getComputedStyle(el);
          return { background: cs.backgroundColor, wantBackground, text: cs.color, wantText };
        },
        { background, text },
      );
      // form-summary's dark ground is an outline on the page; on the light ground it keeps its box.
      if (!(primitive === "form-summary" && ground.name === "light")) {
        expect(got.background, `${primitive} background on ${ground.name}`).toBe(got.wantBackground);
      }
      if (!(primitive === "form-summary")) expect(got.text, `${primitive} text on ${ground.name}`).toBe(got.wantText);
    }
  });
}

// ── session-cta's layout, measured (the lead's review of the 390 px captures, sync 3). ──
// A chip that touched its label, a label cut by a fixed 52 px, a chip that wrapped to the
// control's height: each was seen by eye first. Now a gate: at 390 px on both grounds, for every
// control and face in the demo, every part sits inside the control's box, the label and the chip
// do not overlap, and the chip is one line.

test("session-cta's parts fit their control at 390 px, on both grounds", async ({ page }) => {
  await openGallery(page, WIDTHS[0].size);
  test.skip(!(await wired(page, "session-cta")), "session-cta's demo is not wired into the gallery yet");
  for (const ground of GROUNDS) {
    const problems = await page.locator(demoOn("session-cta", ground.scope)).evaluate((demo) => {
      const found: string[] = [];
      const EPS = 0.5;
      const inside = (a: DOMRect, b: DOMRect) =>
        a.left >= b.left - EPS && a.right <= b.right + EPS && a.top >= b.top - EPS && a.bottom <= b.bottom + EPS;
      const overlap = (a: DOMRect, b: DOMRect) =>
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > EPS && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > EPS;
      const controls = Array.from(demo.querySelectorAll<HTMLElement>('button, a[href], [data-part="face"]'));
      controls.forEach((control, i) => {
        const name = `${i + 1}: ${control.textContent?.trim()}`;
        const box = control.getBoundingClientRect();
        const label = control.querySelector('[data-part="label"]');
        const chip = control.querySelector('[data-part="chip"]');
        if (label && !inside(label.getBoundingClientRect(), box)) found.push(`${name} — the label leaves the control`);
        if (chip) {
          const c = chip.getBoundingClientRect();
          if (!inside(c, box)) found.push(`${name} — the chip leaves the control`);
          if (label && overlap(label.getBoundingClientRect(), c)) found.push(`${name} — the label and the chip overlap`);
          const range = document.createRange();
          range.selectNodeContents(chip);
          const lines = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top)));
          if (lines.size > 1) found.push(`${name} — the chip wraps to ${lines.size} lines`);
        }
      });
      if (controls.length === 0) found.push("no control or face found in the demo");
      return found;
    });
    expect(problems, `session-cta on the ${ground.name} ground`).toEqual([]);
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
