// ★ Contract 5's third proof — the computed-style fingerprint of the register form's controls
// (DEC-186 §2, §6; REQ-UIX-030, REQ-NFR-019; sessions' plan W15.3).
//
// `visual` compares a screenshot of the RESTING page: it never focuses a field, never hovers one
// and never shows an error. `field`, `input` and `textarea` are the three of `sessions'` primitives
// the public site renders, and each wave-15 commit to them adds `pg:` classes that must do NOTHING
// outside the scope. This spec records what the browser actually computes for every part of those
// controls, in five states, so a class that leaks out of the scope shows up as a changed number.
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

/**
 * Everything the browser computes for one part of each control. Runs in the page.
 * `next/font` names a family `__IBM_Plex_Sans_Arabic_5a1b2c`; the suffix is a build hash, so it is
 * dropped — a different FACE still shows, a rebuilt one does not.
 */
async function snapshot(page: Page, ids: readonly string[]): Promise<Snapshot> {
  return page.evaluate(
    ({ ids, props }) => {
      const read = (el: Element | null, pseudo?: string) => {
        if (!el) return null;
        const cs = getComputedStyle(el, pseudo);
        const out: Record<string, string | number | boolean | null> = {};
        for (const p of props) out[p] = cs.getPropertyValue(p).replace(/(__[A-Za-z0-9_]+?)_[0-9a-f]{6}\b/g, "$1");
        if (!pseudo) {
          const box = el.getBoundingClientRect();
          out.width = Math.round(box.width * 100) / 100;
          out.height_box = Math.round(box.height * 100) / 100;
          out.focusVisible = el.matches(":focus-visible");
        }
        return out;
      };
      const snap: Record<string, Record<string, string | number | boolean | null> | null> = {};
      for (const id of ids) {
        const control = document.getElementById(id);
        const label = document.querySelector(`label[for="${id}"]`);
        snap[`${id}`] = read(control);
        snap[`${id}::placeholder`] = read(control, "::placeholder");
        snap[`${id} label`] = read(label);
        // «مطلوب» — the label's one child element.
        snap[`${id} label>span`] = read(label?.querySelector("span") ?? null);
        // `<Field>`'s root: the label's parent, and the wrapper the control sits in.
        snap[`${id} field`] = read(label?.parentElement ?? null);
        snap[`${id} slot`] = read(control?.parentElement ?? null);
        snap[`${id}-hint`] = read(document.getElementById(`${id}-hint`));
        snap[`${id}-privacy`] = read(document.getElementById(`${id}-privacy`));
        const error = document.getElementById(`${id}-error`);
        snap[`${id}-error`] = read(error);
        snap[`${id}-error svg`] = read(error?.querySelector("svg") ?? null);
      }
      return snap;
    },
    { ids, props: PROPS as readonly string[] },
  );
}

/** Mouse off every control and nothing focused, so a state is only ever the one asked for. */
async function neutral(page: Page) {
  await page.mouse.move(1, 1);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function fingerprint(page: Page, locale: string) {
  await page.goto(`/${locale}/register`, { waitUntil: "networkidle" });
  // The provider's role reveals the two topic fields (CSS `:has`, `globals.css` `.provider-fields`).
  await page.click('label[for="reg-role-provider"]');
  await expect(page.locator("#reg-topic-description")).toBeVisible();
  // `.provider-fields` fades in over 200 ms (`rise-in`); a sample mid-fade would read its opacity.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await neutral(page);

  const ids = CONTROLS.map((c) => c.id);
  const states: Record<string, Snapshot> = {};

  states.rest = await snapshot(page, ids);

  for (const { id } of CONTROLS) {
    await page.locator(`#${id}`).hover();
    states[`hover ${id}`] = await snapshot(page, [id]);
    await neutral(page);
  }

  // A text field matches `:focus-visible` on any focus in Chromium, so `focus()` is the keyboard
  // ring; the snapshot records `focusVisible` so a change in that heuristic is seen, not assumed.
  for (const { id } of CONTROLS) {
    await page.locator(`#${id}`).focus();
    states[`focus ${id}`] = await snapshot(page, [id]);
    await neutral(page);
  }

  // Invalid: the empty submit. Client validation refuses it and marks every field.
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator("#reg-name-error")).toBeVisible();
  await expect(page.locator("#reg-topic-description-error")).toBeVisible();
  // The form moves focus to the first invalid field in a `requestAnimationFrame`; let it land
  // before clearing it, or it lands after.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await neutral(page);
  states.invalid = await snapshot(page, ids);

  for (const { id } of CONTROLS) {
    await page.locator(`#${id}`).focus();
    states[`invalid+focus ${id}`] = await snapshot(page, [id]);
    await neutral(page);
  }

  return states;
}

test.describe("wave 15 — the register form's controls, computed", () => {
  test("every part of field, input and textarea computes what it computed before", async ({ page }) => {
    // One file, one run: the viewport is set per pass, so the phone project would only repeat it.
    test.skip(test.info().project.name !== "desktop", "recorded once, on the desktop project");
    test.setTimeout(180_000);
    const result: Record<string, Record<string, Snapshot>> = {};

    for (const locale of LOCALES) {
      for (const size of WIDTHS) {
        await page.setViewportSize({ width: size.width, height: size.height });
        result[`${locale}@${size.name}`] = await fingerprint(page, locale);
      }
    }

    // Every part it looks for exists where it should: a renamed id is a failure, not a silent null.
    for (const [key, states] of Object.entries(result)) {
      for (const { id, hint } of CONTROLS) {
        expect(states.rest[id], `${key} #${id}`).not.toBeNull();
        expect(states.rest[`${id} label`], `${key} label[for=${id}]`).not.toBeNull();
        expect(states.rest[`${id} label>span`], `${key} «مطلوب» on ${id}`).not.toBeNull();
        if (hint) expect(states.rest[`${id}-hint`], `${key} #${id}-hint`).not.toBeNull();
        expect(states.rest[`${id}-error`], `${key} no error at rest`).toBeNull();
        expect(states.invalid[`${id}-error`], `${key} #${id}-error`).not.toBeNull();
        expect(states[`focus ${id}`][id]?.focusVisible, `${key} #${id} focus-visible`).toBe(true);
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
      for (const [key, states] of Object.entries(before)) {
        for (const [state, parts] of Object.entries(states)) {
          for (const [part, values] of Object.entries(parts)) {
            const now = result[key]?.[state]?.[part] ?? null;
            if (JSON.stringify(now) === JSON.stringify(values)) continue;
            if (!values || !now) {
              moved.push(`${key} · ${state} · ${part}: ${values ? "present" : "absent"} → ${now ? "present" : "absent"}`);
              continue;
            }
            for (const [prop, value] of Object.entries(values)) {
              if (now[prop] !== value) moved.push(`${key} · ${state} · ${part} · ${prop}: ${String(value)} → ${String(now[prop])}`);
            }
          }
        }
      }
      expect(moved.slice(0, 40), `${moved.length} computed values moved`).toEqual([]);
      expect(result).toEqual(before);
    }
  });
});
