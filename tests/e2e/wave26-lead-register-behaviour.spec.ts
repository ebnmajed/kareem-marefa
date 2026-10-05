// ★★ The registration form's BEHAVIOUR fingerprint — REQ-NFR-019, REQ-UIX-114, DEC-167, DEC-247, DEC-248 §3.4.
//
// Wave 26 rebuilds the public site. Its APPEARANCE changes, on purpose; what the form DOES may not. A broken
// screen is noticed by looking; a broken registration form is not — so this spec looks for it.
//
// `wave15-sessions-public-controls.spec.ts` fingerprints computed STYLES, which this wave moves deliberately.
// This one records everything about `/register` that is behaviour and nothing that is appearance:
//   · the form: its method, encoding, `novalidate`, and the names of React's server-action fields;
//   · every control in document order: tag, type, name, id, the value where it is part of the contract
//     (radios, `locale`), `required`, `maxlength`, `pattern`, `autocomplete`, `inputmode`, `enterkeyhint`,
//     `dir`, `tabindex`, `rows`, its `aria-*`, whether its label and each described-by target exist — and
//     whether a person can SEE it, which is how the honeypot and the CSS-revealed provider fields are held;
//   · every `role="alert"` and `role="status"` region, with the in-page links an error summary carries;
//   · where focus lands after a refused submit;
// in each state a visitor can reach WITHOUT a successful insert: at rest, with each role picked, after an empty
// submit refused in the browser — and, with JavaScript OFF, at rest, with the provider role picked (the reveal
// is CSS, `.role-choice:has(…) ~ .provider-fields`), and after an empty submit refused BY THE SERVER.
//
// Then one real submission with JavaScript off, against the QA stub (never a real project — DEC-023): the
// no-JS path must still end on the success panel.
//
// ★ The baseline is `tests/e2e/fixtures/wave26-register-behaviour.json`, recorded from `main`'s code at
// `3d22c33a` BEFORE any public file was touched, and committed — so this fails in CI, at every commit, on any
// difference, and names it. To re-record (only ever from `main`'s code): E2E_REGISTER_BEHAVIOUR_RECORD=1.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

test.skip(
  process.env.E2E_PLATFORM_UNCONFIGURED === "1",
  "on the unconfigured build /ar/register never reaches network-idle, on main too (wave 15's finding)",
);
test.describe.configure({ mode: "serial" });

const BASELINE = resolve("tests/e2e/fixtures/wave26-register-behaviour.json");
const RECORD = process.env.E2E_REGISTER_BEHAVIOUR_RECORD === "1";
const LOCALES = ["ar", "en"] as const;

type Snapshot = Record<string, unknown>;
const recorded: Record<string, Snapshot> = {};

/** Runs in the page. Reads attributes and visibility only — never a class, a colour or a size. */
function snapshot(): Snapshot {
  const form = document.querySelector("form");
  if (!form) {
    const status = document.querySelector('[role="status"]');
    return { form: null, status: status ? { tag: status.tagName, heading: status.querySelector("h2") !== null } : null };
  }
  const attr = (el: Element, name: string) => el.getAttribute(name);
  const seen = (el: Element) => {
    const h = el as HTMLElement;
    if (!h.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    const r = h.getBoundingClientRect();
    // `sr-only` radios are 1 px and still operable through their label; the honeypot is moved off the page.
    return r.right > 0 && r.bottom > 0 && r.left < document.documentElement.scrollWidth && r.width > 0 && r.height > 0;
  };
  const controls = [...form.elements].map((el) => {
    const name = attr(el, "name") ?? "";
    const serverAction = name.startsWith("$ACTION");
    const volatile = serverAction || name === "form_token";
    const input = el as HTMLInputElement;
    const describedBy = (attr(el, "aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    return {
      tag: el.tagName,
      type: attr(el, "type"),
      // A server action's field names carry a build's action id; the contract is that they are there.
      name: serverAction ? name.replace(/[:_][0-9a-f]{6,}.*$/i, "").replace(/\d+/g, "N") : name,
      id: el.id || null,
      value: volatile ? (input.value ? "<set>" : "<empty>") : el.tagName === "BUTTON" || el.tagName === "FIELDSET" ? null : (attr(el, "value") ?? null),
      checked: input.type === "radio" ? input.checked : null,
      required: input.required ?? null,
      disabled: (el as HTMLButtonElement).disabled ?? null,
      maxlength: attr(el, "maxlength"),
      minlength: attr(el, "minlength"),
      pattern: attr(el, "pattern"),
      autocomplete: attr(el, "autocomplete"),
      inputmode: attr(el, "inputmode"),
      autocapitalize: attr(el, "autocapitalize"),
      autocorrect: attr(el, "autocorrect"),
      spellcheck: attr(el, "spellcheck"),
      enterkeyhint: attr(el, "enterkeyhint"),
      dir: attr(el, "dir"),
      tabindex: attr(el, "tabindex"),
      rows: attr(el, "rows"),
      ariaRequired: attr(el, "aria-required"),
      ariaInvalid: attr(el, "aria-invalid"),
      ariaBusy: attr(el, "aria-busy"),
      describedBy: describedBy.map((id) => `${id}:${document.getElementById(id) ? "present" : "MISSING"}`),
      labelled: el.id ? document.querySelector(`label[for="${el.id}"]`) !== null || el.closest("label") !== null : el.closest("label") !== null,
      ariaHiddenAncestor: el.closest('[aria-hidden="true"]') !== null,
      seen: el.tagName === "FIELDSET" ? null : input.type === "hidden" ? false : input.type === "radio" ? seen(el.closest("label") ?? el) : seen(el),
    };
  });
  return {
    form: {
      method: (attr(form, "method") ?? "").toLowerCase() || null,
      enctype: attr(form, "enctype"),
      novalidate: form.noValidate,
      // With JavaScript on React owns the action; with it off the form posts to its own URL.
      action: /^javascript:/i.test(attr(form, "action") ?? "") ? "<react>" : (attr(form, "action") ?? null),
    },
    controls,
    legends: form.querySelectorAll("fieldset > legend").length,
    alerts: [...document.querySelectorAll('[role="alert"]')].map((a) => ({
      tag: a.tagName,
      inForm: form.contains(a),
      links: [...a.querySelectorAll("a")].map((l) => `${attr(l, "href")}:${document.querySelector(attr(l, "href") ?? "#-") ? "present" : "MISSING"}`),
    })),
    errors: [...form.querySelectorAll('[id$="-error"]')].map((e) => ({ id: e.id, live: attr(e, "aria-live"), role: attr(e, "role") })),
    status: document.querySelector('[role="status"]') !== null,
    focus: document.activeElement && document.activeElement !== document.body ? document.activeElement.id || document.activeElement.tagName : null,
  };
}

async function open(page: Page, locale: string) {
  await page.goto(`/${locale}/register`, { waitUntil: "networkidle" });
  await expect(page.locator("form")).toBeVisible();
}
async function take(page: Page, key: string) {
  // Let a refused submit's `requestAnimationFrame` focus land before reading it.
  await page.waitForTimeout(250);
  recorded[key] = await page.evaluate(snapshot);
}
const pick = (page: Page, id: string) => page.locator(`label[for="${id}"], label:has(#${id})`).first().click();

for (const locale of LOCALES) {
  test(`${locale}: with JavaScript — at rest, each role, and an empty submit refused in the browser`, async ({ page }) => {
    await open(page, locale);
    await take(page, `${locale}/js/rest`);
    await pick(page, "reg-role-provider");
    await take(page, `${locale}/js/provider`);
    await pick(page, "reg-role-attendee");
    await take(page, `${locale}/js/attendee`);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('form [role="alert"]')).toBeVisible();
    await take(page, `${locale}/js/refused-empty`);
    await pick(page, "reg-role-provider");
    await page.locator('form button[type="submit"]').click();
    await take(page, `${locale}/js/refused-provider`);
  });

  test(`${locale}: WITHOUT JavaScript — at rest, the CSS reveal, and an empty submit refused by the server`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, locale: "ar-SA" });
    const page = await context.newPage();
    await open(page, locale);
    await take(page, `${locale}/nojs/rest`);
    await pick(page, "reg-role-provider");
    await take(page, `${locale}/nojs/provider`);
    // Past the signed minimum time (3 s), so the server VALIDATES rather than answering «too fast».
    await page.waitForTimeout(3_500);
    await page.locator('form button[type="submit"]').click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator('form [role="alert"]').first()).toBeVisible();
    await take(page, `${locale}/nojs/refused-by-server`);
    await context.close();
  });
}

test("WITHOUT JavaScript a whole registration reaches the stub and ends on the success panel", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, locale: "ar-SA" });
  const page = await context.newPage();
  await open(page, "ar");
  await pick(page, "reg-role-attendee");
  await page.locator("#reg-name").fill("زائر بلا جافاسكربت");
  await page.locator("#reg-email").fill(`wave26-nojs-${Date.now()}@example.com`);
  await page.waitForTimeout(3_500);
  await page.locator('form button[type="submit"]').click();
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[role="status"]')).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
  await take(page, "ar/nojs/success");
  await context.close();
});

test("the behaviour is what main's was", async () => {
  expect(Object.keys(recorded).length).toBe(LOCALES.length * 8 + 1);
  if (RECORD) {
    mkdirSync(dirname(BASELINE), { recursive: true });
    writeFileSync(BASELINE, `${JSON.stringify(recorded, null, 2)}\n`);
    return;
  }
  expect(existsSync(BASELINE), "the baseline recorded from main is committed").toBe(true);
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as Record<string, Snapshot>;
  expect(Object.keys(recorded).sort()).toEqual(Object.keys(baseline).sort());
  for (const key of Object.keys(baseline)) expect(recorded[key], key).toEqual(baseline[key]);
});
