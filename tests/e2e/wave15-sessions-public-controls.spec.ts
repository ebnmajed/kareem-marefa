// ★ Contract 5's third proof — the computed-style fingerprint of the register form's controls
// (DEC-186 §2, §6; REQ-UIX-030, REQ-NFR-019; sessions' plan W15.3).
//
// `visual` compares a screenshot of the RESTING page: it never focuses a field, never hovers one
// and never shows an error. The public site renders five primitives (DEC-186 §1): `field`, `input`
// and `textarea` (`sessions'`), `button` and `icons` (the lead's). Each wave-15 commit to them adds
// `pg:` classes that must do NOTHING outside the scope. This spec records what the browser actually
// computes for every part of those controls, so a class that leaks out of the scope shows up as a
// changed number:
//   · on `/ar/register` and `/en/register` — the four `<Field>` controls at rest, hovered, focused,
//     invalid, and invalid and focused; the submit `button` at rest, hovered and keyboard-focused;
//   · on `/ar` and `/en` — the header's two doors, «تسجيل الدخول» and «سجّل اهتمامك», at rest,
//     hovered and keyboard-focused (the lead's request, for its `button` commit).
//
// How the lead runs it (one server at a time, through the gate lock):
//
//   E2E_FINGERPRINT_OUT=.qa-shots/fingerprint/main.json   npx playwright test wave15-sessions-public-controls --project=desktop
//     … on a build of `main` (or of the tree before the first primitive commit), then:
//   E2E_FINGERPRINT_OUT=.qa-shots/fingerprint/branch.json \
//   E2E_FINGERPRINT_BASELINE=.qa-shots/fingerprint/main.json npx playwright test wave15-sessions-public-controls --project=desktop
//
// With a baseline the test FAILS on any difference, and names it. Without one it only records,
// and asserts that every part it looks for exists — so a renamed id fails here too.
//
// ★ It reads nothing but computed styles and boxes. It never submits to the server: the empty
// submit is refused by the form's own client validation (`registration-form.tsx` `onSubmit`),
// which is the path a real visitor takes first.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const OUT = process.env.E2E_FINGERPRINT_OUT;
const BASELINE = process.env.E2E_FINGERPRINT_BASELINE;

const LOCALES = ["ar", "en"] as const;
const WIDTHS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

/** The four controls `<Field>` wraps on the form, and whether each carries a hint. */
const CONTROLS = [
  { id: "reg-name", hint: false },
  { id: "reg-email", hint: true },
  { id: "reg-topic-title", hint: true },
  { id: "reg-topic-description", hint: true },
] as const;

const PROPS = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-inline-start",
  "height",
  "min-height",
  "font-family",
  "font-size",
  "line-height",
  "font-weight",
  "outline-color",
  "outline-width",
  "outline-style",
  "outline-offset",
  "box-shadow",
  "opacity",
  "cursor",
  "color-scheme",
  "accent-color",
  "transition-property",
  "transition-duration",
] as const;

type Values = Record<string, string | number | boolean | null>;
type Snapshot = Record<string, Values | null>;

/** One part: a name in the JSON, a CSS selector, and an optional pseudo-element. */
type Part = [name: string, selector: string, pseudo?: string];

/** Every part of one `<Field>`-wrapped control, as selectors — the relations are `:has()`. */
function controlParts(id: string): Part[] {
  return [
    [id, `#${id}`],
    [`${id}::placeholder`, `#${id}`, "::placeholder"],
    [`${id} label`, `label[for="${id}"]`],
    // «مطلوب» — the label's one child element.
    [`${id} label>span`, `label[for="${id}"] > span`],
    // `<Field>`'s root (the label's parent) and the wrapper the control sits in.
    [`${id} field`, `:has(> label[for="${id}"])`],
    [`${id} slot`, `:has(> #${id})`],
    [`${id}-hint`, `#${id}-hint`],
    [`${id}-privacy`, `#${id}-privacy`],
    [`${id}-error`, `#${id}-error`],
    [`${id}-error svg`, `#${id}-error svg`],
  ];
}

/** The lead's `button`, where the public site shows it (the lead's request, sync 1). */
const SUBMIT: Part[] = [
  ["submit", 'form button[type="submit"]'],
  ["submit label", 'form button[type="submit"] > span'],
];
const DOORS: Part[] = [
  // «تسجيل الدخول» — always Arabic (the platform is Arabic-only) — and «سجّل اهتمامك».
  ["door sign-in", 'header a[href$="/sign-in"]'],
  ["door register", 'header a[href$="/register"]'],
];

/**
 * Everything the browser computes for each part. Runs in the page.
 * `next/font` names a family `__IBM_Plex_Sans_Arabic_5a1b2c`; the suffix is a build hash, so it is
 * dropped — a different FACE still shows, a rebuilt one does not.
 */
async function snapshot(page: Page, parts: readonly Part[]): Promise<Snapshot> {
  return page.evaluate(
    ({ parts, props }) => {
      const snap: Record<string, Record<string, string | number | boolean | null> | null> = {};
      for (const [name, selector, pseudo] of parts) {
        const el = document.querySelector(selector);
        if (!el) {
          snap[name] = null;
          continue;
        }
        const cs = getComputedStyle(el, pseudo);
        const out: Record<string, string | number | boolean | null> = {};
        for (const p of props) out[p] = cs.getPropertyValue(p).replace(/(__[A-Za-z0-9_]+?)_[0-9a-f]{6}\b/g, "$1");
        if (!pseudo) {
          const box = el.getBoundingClientRect();
          out.width = Math.round(box.width * 100) / 100;
          out.height_box = Math.round(box.height * 100) / 100;
          out.focusVisible = el.matches(":focus-visible");
          out.hovered = el.matches(":hover");
        }
        snap[name] = out;
      }
      return snap;
    },
    { parts, props: PROPS as readonly string[] },
  );
}

/**
 * Wait for every FINITE animation and transition to end, and never for an infinite one.
 *
 * ★ The public pages run infinite animations (`globals.css`: `.ripple-ring`, `.pulse-dot`,
 * `.loader-dot`), whose `finished` never settles — waiting on all of them hung for the whole
 * timeout on `main`'s build (the lead, sync 1). A finite one — `.provider-fields`' `rise-in`, a
 * button's 150 ms colour transition after a hover, the landing page's intro — must end before a
 * sample, or the sample reads a value mid-way. Capped, so a finite but long one cannot hang it.
 */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => {
            const end = a.effect?.getComputedTiming().endTime;
            return typeof end === "number" && Number.isFinite(end);
          })
          .map((a) => a.finished.catch(() => undefined)),
      ),
      new Promise((done) => setTimeout(done, 10_000)),
    ]),
  );
}

/** Mouse off every control and nothing focused, so a state is only ever the one asked for. */
async function neutral(page: Page) {
  await page.mouse.move(1, 1);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await settle(page);
}

/**
 * Focus by the KEYBOARD. A link or a button focused by script matches `:focus-visible` only by
 * Chromium's heuristic, which the mouse moves; Tab is what a member does and is not a guess.
 */
async function keyboardFocus(page: Page, selector: string) {
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return;
  }
  throw new Error(`Tab never reached ${selector}`);
}

/**
 * Hover and keyboard focus for each target that is not a text field, recording the target with
 * its own sub-parts (`submit` with `submit label`). A target hidden at this width — «سجّل اهتمامك»
 * is `max-sm:hidden` — has its rest state only.
 */
async function interactive(page: Page, targets: readonly Part[], parts: readonly Part[], states: Record<string, Snapshot>) {
  for (const [name, selector] of targets) {
    const target = page.locator(selector).first();
    if (!(await target.count()) || !(await target.isVisible())) continue;
    const group = parts.filter(([n]) => n === name || n.startsWith(`${name} `));
    await target.hover();
    await settle(page);
    states[`hover ${name}`] = await snapshot(page, group);
    await neutral(page);
    await keyboardFocus(page, selector);
    await settle(page);
    states[`focus ${name}`] = await snapshot(page, group);
    await neutral(page);
  }
}

async function register(page: Page, locale: string) {
  await page.goto(`/${locale}/register`, { waitUntil: "networkidle" });
  // The provider's role reveals the two topic fields (CSS `:has`, `globals.css` `.provider-fields`).
  await page.click('label[for="reg-role-provider"]');
  await expect(page.locator("#reg-topic-description")).toBeVisible();
  await neutral(page);

  const all = [...CONTROLS.flatMap((c) => controlParts(c.id)), ...SUBMIT];
  const states: Record<string, Snapshot> = {};

  states.rest = await snapshot(page, all);

  for (const { id } of CONTROLS) {
    await page.locator(`#${id}`).hover();
    await settle(page);
    states[`hover ${id}`] = await snapshot(page, controlParts(id));
    await neutral(page);
  }

  // A text field matches `:focus-visible` on any focus in Chromium, so `focus()` is the keyboard
  // ring; the snapshot records `focusVisible` so a change in that heuristic is seen, not assumed.
  for (const { id } of CONTROLS) {
    await page.locator(`#${id}`).focus();
    await settle(page);
    states[`focus ${id}`] = await snapshot(page, controlParts(id));
    await neutral(page);
  }

  await interactive(page, SUBMIT.slice(0, 1), SUBMIT, states);

  // Invalid: the empty submit. Client validation refuses it and marks every field.
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator("#reg-name-error")).toBeVisible();
  await expect(page.locator("#reg-topic-description-error")).toBeVisible();
  // The form moves focus to the first invalid field in a `requestAnimationFrame`; let it land
  // before clearing it, or it lands after.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await neutral(page);
  states.invalid = await snapshot(page, all);

  for (const { id } of CONTROLS) {
    await page.locator(`#${id}`).focus();
    await settle(page);
    states[`invalid+focus ${id}`] = await snapshot(page, controlParts(id));
    await neutral(page);
  }

  return states;
}

async function landing(page: Page, locale: string) {
  await page.goto(`/${locale}`, { waitUntil: "networkidle" });
  // The intro sting is finite (~3.8 s); `settle` waits it out and ignores the infinite ones.
  await neutral(page);
  const states: Record<string, Snapshot> = {};
  states.rest = await snapshot(page, DOORS);
  await interactive(page, DOORS, DOORS, states);
  return states;
}

test.describe("wave 15 — the public site's controls, computed", () => {
  test("every part of field, input, textarea and the doors computes what it computed before", async ({ page }) => {
    // One file, one run: the viewport is set per pass, so the phone project would only repeat it.
    test.skip(test.info().project.name !== "desktop", "recorded once, on the desktop project");
    test.setTimeout(300_000);
    const result: Record<string, Record<string, Snapshot>> = {};

    for (const locale of LOCALES) {
      for (const size of WIDTHS) {
        await page.setViewportSize({ width: size.width, height: size.height });
        result[`/${locale}/register@${size.name}`] = await register(page, locale);
        result[`/${locale}@${size.name}`] = await landing(page, locale);
      }
    }

    // Every part it looks for exists where it should: a renamed id is a failure, not a silent null.
    for (const [key, states] of Object.entries(result)) {
      if (key.includes("/register@")) {
        for (const { id, hint } of CONTROLS) {
          expect(states.rest[id], `${key} #${id}`).not.toBeNull();
          expect(states.rest[`${id} label`], `${key} label[for=${id}]`).not.toBeNull();
          expect(states.rest[`${id} label>span`], `${key} «مطلوب» on ${id}`).not.toBeNull();
          expect(states.rest[`${id} field`], `${key} the Field root of ${id}`).not.toBeNull();
          if (hint) expect(states.rest[`${id}-hint`], `${key} #${id}-hint`).not.toBeNull();
          expect(states.rest[`${id}-error`], `${key} no error at rest`).toBeNull();
          expect(states.invalid[`${id}-error`], `${key} #${id}-error`).not.toBeNull();
          expect(states[`focus ${id}`][id]?.focusVisible, `${key} #${id} focus-visible`).toBe(true);
        }
        expect(states.rest.submit, `${key} the submit button`).not.toBeNull();
        expect(states["focus submit"]?.submit?.focusVisible, `${key} submit focus-visible`).toBe(true);
      } else {
        expect(states.rest["door sign-in"], `${key} «تسجيل الدخول»`).not.toBeNull();
        expect(states.rest["door register"], `${key} «سجّل اهتمامك»`).not.toBeNull();
        expect(states["focus door sign-in"]?.["door sign-in"]?.focusVisible, `${key} sign-in focus-visible`).toBe(true);
      }
    }

    if (OUT) {
      const path = resolve(OUT);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
    }

    if (BASELINE) {
      const before = JSON.parse(readFileSync(resolve(BASELINE), "utf8")) as typeof result;
      // Name the first differences, so a failure says which part moved and how.
      const moved: string[] = [];
      for (const key of new Set([...Object.keys(before), ...Object.keys(result)])) {
        for (const state of new Set([...Object.keys(before[key] ?? {}), ...Object.keys(result[key] ?? {})])) {
          const was = before[key]?.[state] ?? {};
          const is = result[key]?.[state] ?? {};
          for (const part of new Set([...Object.keys(was), ...Object.keys(is)])) {
            const values = was[part] ?? null;
            const now = is[part] ?? null;
            if (JSON.stringify(now) === JSON.stringify(values)) continue;
            if (!values || !now) {
              moved.push(`${key} · ${state} · ${part}: ${values ? "present" : "absent"} → ${now ? "present" : "absent"}`);
              continue;
            }
            for (const prop of new Set([...Object.keys(values), ...Object.keys(now)])) {
              if (now[prop] !== values[prop]) moved.push(`${key} · ${state} · ${part} · ${prop}: ${String(values[prop])} → ${String(now[prop])}`);
            }
          }
        }
      }
      expect(moved.slice(0, 40), `${moved.length} computed values moved`).toEqual([]);
    }
  });
});
