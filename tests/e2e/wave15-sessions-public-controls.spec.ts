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
// ★ Time. Every wait is polled and bounded (8 s per sample, 10 s between states), so the worst case
// is finite, and a still page costs a few frames per sample. It prints each pass's time. It has NOT
// been timed on the author's machine: the spec needs a production build, and building is the lead's
// — the first of the lead's runs records it here.
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
 * Everything the browser computes for each part, once it has stopped changing. Runs in the page.
 *
 * ★ A sample is taken only when the parts are STILL (the lead, sync 1: a hover sampled mid-way
 * through `button`'s 150 ms colour transition read a colour between two tokens). Three things make
 * a part still, and each is checked, never slept for:
 *   1. two animation frames have passed — Chromium applies `:hover` and `:focus` at the next
 *      frame, so a transition does not exist yet at the instant the pointer arrives;
 *   2. no FINITE animation or transition is still inside its own timing on a sampled part or an
 *      ancestor of one (an ancestor's transform moves the part's box); an infinite one is ignored;
 *   3. two readings two frames apart are identical.
 * ★ «Still inside its timing» is `currentTime < endTime`, polled once a frame — never an `await` on
 * `finished`. The browser does not always keep that promise: on `main`'s build the hero's
 * `svg.network-svg` (`network-fade`, 1100 ms) read `playState: "running"` at a `currentTime` of
 * 4150 ms and its `finished` never settled (the lead, sync 1). Past its end, an animation is over,
 * whatever its `playState` says.
 * Every wait is bounded, in frames and in time, and a part that never settles is recorded as
 * `unsettled`: a visible difference, not a hang.
 *
 * `next/font` names a family `__IBM_Plex_Sans_Arabic_5a1b2c`; the suffix is a build hash, so it is
 * dropped — a different FACE still shows, a rebuilt one does not.
 */
async function snapshot(page: Page, parts: readonly Part[]): Promise<Snapshot> {
  return page.evaluate(
    async ({ parts, props }) => {
      type Values = Record<string, string | number | boolean | null>;
      const frames = (n: number) =>
        new Promise<void>((done) => {
          const step = (left: number) => (left === 0 ? done() : requestAnimationFrame(() => step(left - 1)));
          step(n);
        });
      const read = (): Record<string, Values | null> => {
        const snap: Record<string, Values | null> = {};
        for (const [name, selector, pseudo] of parts) {
          const el = document.querySelector(selector);
          if (!el) {
            snap[name] = null;
            continue;
          }
          const cs = getComputedStyle(el, pseudo);
          const out: Values = {};
          for (const p of props) out[p] = cs.getPropertyValue(p).replace(/(__[A-Za-z0-9_]+?)_[0-9a-f]{6}\b/g, "$1");
          if (!pseudo) {
            const box = el.getBoundingClientRect();
            out.width = Math.round(box.width * 100) / 100;
            out.height_box = Math.round(box.height * 100) / 100;
            out.focusVisible = el.matches(":focus-visible");
            out.focused = document.activeElement === el;
            out.hovered = el.matches(":hover");
          }
          snap[name] = out;
        }
        return snap;
      };
      const sampled = parts.map(([, selector]) => document.querySelector(selector)).filter((el): el is Element => el !== null);
      const moving = () =>
        document.getAnimations().some((a) => {
          if (a.playState !== "running") return false; // finished, idle or paused: nothing to wait for
          const end = a.effect?.getComputedTiming().endTime;
          if (typeof end !== "number" || !Number.isFinite(end)) return false; // infinite, or scroll-driven
          if (typeof a.currentTime !== "number" || a.currentTime >= end) return false; // over, whatever playState says
          const target = a.effect instanceof KeyframeEffect ? a.effect.target : null;
          return target !== null && sampled.some((el) => target === el || target.contains(el));
        });

      const deadline = performance.now() + 8_000;
      for (let round = 0; round < 40 && performance.now() < deadline; round++) {
        await frames(2);
        // Polled a frame at a time, never awaited: bounded by the same deadline.
        while (moving() && performance.now() < deadline) await frames(1);
        const first = read();
        await frames(2);
        const second = read();
        if (JSON.stringify(first) === JSON.stringify(second)) return first;
      }
      const last = read();
      for (const values of Object.values(last)) if (values) values.unsettled = true;
      return last;
    },
    { parts, props: PROPS as readonly string[] },
  );
}

/**
 * Wait for every FINITE animation and transition in the document to end, and never for an
 * infinite one — used between states, before the next interaction.
 *
 * ★ The public pages run infinite animations (`globals.css`: `.ripple-ring`, `.pulse-dot`,
 * `.loader-dot`), whose `finished` never settles — waiting on all of them hung for the whole
 * timeout on `main`'s build (the lead, sync 1). And a FINITE one's `finished` is not a promise the
 * browser always keeps either (see `snapshot`), so nothing here awaits it: it polls
 * `currentTime < endTime` once a frame, under a deadline.
 */
async function settle(page: Page) {
  await page.evaluate(async () => {
    const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
    const moving = () =>
      document.getAnimations().some((a) => {
        if (a.playState !== "running") return false;
        const end = a.effect?.getComputedTiming().endTime;
        if (typeof end !== "number" || !Number.isFinite(end)) return false;
        return typeof a.currentTime === "number" && a.currentTime < end;
      });
    // Two frames first, so a transition the last interaction started exists; then one frame at a
    // time until nothing finite is inside its timing. Bounded: the landing's intro is ~3.8 s.
    const deadline = performance.now() + 10_000;
    await frame();
    await frame();
    while (moving() && performance.now() < deadline) await frame();
  });
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
 * ★ A STATE IS RECORDED ONLY WHEN IT HOLDS. The lead's first run on `main` recorded the submit
 * button AT REST under «hover submit»: on the first, cold page the button moved from under the
 * pointer after `hover()` returned. So the sample itself is the check — its `hovered` (or
 * `focused`) on the target must be true — and a sample that fails it is retried, a bounded number
 * of times, with the pointer (or focus) cleared first. Never a rest state under a hover's name:
 * after the last attempt the test FAILS, naming the part.
 */
const ATTEMPTS = 5;

async function sampleHovered(page: Page, name: string, selector: string, parts: readonly Part[]): Promise<Snapshot> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    await neutral(page);
    await page.locator(selector).first().hover();
    await settle(page);
    const snap = await snapshot(page, parts);
    if (snap[name]?.hovered === true) return snap;
  }
  throw new Error(`«hover ${name}»: ${selector} never matched :hover in ${ATTEMPTS} attempts`);
}

async function sampleFocused(page: Page, name: string, selector: string, parts: readonly Part[], focus: () => Promise<void>): Promise<Snapshot> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    await neutral(page);
    await focus();
    await settle(page);
    const snap = await snapshot(page, parts);
    if (snap[name]?.focused === true) return snap;
  }
  throw new Error(`«focus ${name}»: ${selector} was never document.activeElement in ${ATTEMPTS} attempts`);
}

/** The first page of a run measured like the rest: its fonts loaded and its network quiet. */
async function arrive(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
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
    states[`hover ${name}`] = await sampleHovered(page, name, selector, group);
    states[`focus ${name}`] = await sampleFocused(page, name, selector, group, () => keyboardFocus(page, selector));
    await neutral(page);
  }
}

async function register(page: Page, locale: string) {
  await arrive(page, `/${locale}/register`);
  // The provider's role reveals the two topic fields (CSS `:has`, `globals.css` `.provider-fields`).
  await page.click('label[for="reg-role-provider"]');
  await expect(page.locator("#reg-topic-description")).toBeVisible();
  await neutral(page);

  const all = [...CONTROLS.flatMap((c) => controlParts(c.id)), ...SUBMIT];
  const states: Record<string, Snapshot> = {};

  states.rest = await snapshot(page, all);

  for (const { id } of CONTROLS) {
    states[`hover ${id}`] = await sampleHovered(page, id, `#${id}`, controlParts(id));
    await neutral(page);
  }

  // A text field matches `:focus-visible` on any focus in Chromium, so `focus()` is the keyboard
  // ring; the snapshot records `focusVisible` so a change in that heuristic is seen, not assumed.
  for (const { id } of CONTROLS) {
    states[`focus ${id}`] = await sampleFocused(page, id, `#${id}`, controlParts(id), () => page.locator(`#${id}`).focus());
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
    states[`invalid+focus ${id}`] = await sampleFocused(page, id, `#${id}`, controlParts(id), () => page.locator(`#${id}`).focus());
    await neutral(page);
  }

  return states;
}

async function landing(page: Page, locale: string) {
  await arrive(page, `/${locale}`);
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

    // Warm the server and the font cache, so the first measured page is measured like the other seven.
    await page.setViewportSize({ width: WIDTHS[0].width, height: WIDTHS[0].height });
    for (const locale of LOCALES) {
      await arrive(page, `/${locale}/register`);
      await arrive(page, `/${locale}`);
    }

    for (const locale of LOCALES) {
      for (const size of WIDTHS) {
        await page.setViewportSize({ width: size.width, height: size.height });
        let started = Date.now();
        result[`/${locale}/register@${size.name}`] = await register(page, locale);
        console.log(`fingerprint /${locale}/register@${size.name}: ${((Date.now() - started) / 1000).toFixed(1)} s`);
        started = Date.now();
        result[`/${locale}@${size.name}`] = await landing(page, locale);
        console.log(`fingerprint /${locale}@${size.name}: ${((Date.now() - started) / 1000).toFixed(1)} s`);
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
