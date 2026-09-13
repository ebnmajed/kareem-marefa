// The unauthenticated side of M1, against the stubbed server: the proxy's
// optimistic check with its preserved destination (REQ-AUT-005), the three
// auth screens' Arabic copy (SCR-002 … SCR-004), the report-only CSP on the
// frozen routes (DEC-036), and the English platform redirect (STORY-INT-004).
import { expect, test } from "@playwright/test";

test("a signed-out request to /ar/app lands on sign-in with next preserved", async ({ page }) => {
  await page.goto("/ar/app/sessions/abc?tab=materials");
  await expect(page).toHaveURL(/\/ar\/sign-in\?next=%2Far%2Fapp%2Fsessions%2Fabc%3Ftab%3Dmaterials$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("الدخول إلى كريم معرفة");
  const button = page.getByRole("button", { name: /Google/ });
  await expect(button).toBeVisible();
  await expect(page.locator('input[name="next"]')).toHaveValue("/ar/app/sessions/abc?tab=materials");
});

test("an external next is discarded", async ({ page }) => {
  await page.goto("/ar/sign-in?next=https%3A%2F%2Fevil.example%2F");
  await expect(page.locator('input[name="next"]')).toHaveValue("/ar/app");
});

test("sign-in shows the closed-door message for a refused domain, naming no org", async ({ page }) => {
  await page.goto("/ar/sign-in?error=domain");
  const alert = page.locator("#sign-in-error");
  await expect(alert).toContainText("منصة خاصة بمؤسسات محددة");
  await expect(alert).not.toContainText("example");
});

test("/ar/no-access explains each reason in Arabic", async ({ page }) => {
  await page.goto("/ar/no-access");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("لا يمكن الدخول");
  await page.goto("/ar/no-access?reason=suspended");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("هذه المؤسسة موقوفة حاليًا");
  await page.goto("/ar/no-access?reason=deactivated");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("تم إيقاف حسابك");
});

test("/en/app and the English auth screens redirect to Arabic", async ({ page }) => {
  await page.goto("/en/app");
  await expect(page).toHaveURL(/\/ar\/sign-in\?next=%2Far%2Fapp$/);
  await page.goto("/en/no-access");
  await expect(page).toHaveURL(/\/ar\/no-access$/);
});

test("the frozen routes carry a report-only CSP and no enforced one, and their HTML has no nonce", async ({ request }) => {
  for (const path of ["/ar", "/en", "/ar/register"]) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const headers = res.headers();
    // Nonce-less on purpose: a nonce would make Next render the prerendered
    // pages dynamically and stamp every script tag (DEC-036).
    expect(headers["content-security-policy-report-only"]).toMatch(/script-src 'self' 'report-sample'/);
    expect(headers["content-security-policy-report-only"]).not.toMatch(/nonce-/);
    expect(headers["content-security-policy"]).toBeUndefined();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(await res.text()).not.toContain("nonce=");
  }
});

test("the sign-in page carries the report-only CSP too", async ({ request }) => {
  const res = await request.get("/ar/sign-in");
  expect(res.headers()["content-security-policy-report-only"]).toMatch(/report-uri \/api\/csp-report/);
});

test("the auth Route Handlers are reachable unprefixed and answer with a redirect, not a locale rewrite", async ({ request }) => {
  const out = await request.post("/api/auth/sign-out", { maxRedirects: 0 });
  expect(out.status()).toBe(303);
  expect(out.headers()["location"]).toMatch(/\/ar\/sign-in$/);
  // Starting Google sign-in hands off to Supabase Auth's authorize endpoint
  // (which performs the Google hop) with our callback and the validated next
  // — or, against the stub, lands back on sign-in with an error. Never on
  // /ar/api/…
  const start = await request.post("/api/auth/sign-in", { form: { next: "/ar/app" }, maxRedirects: 0 });
  expect(start.status()).toBe(303);
  const location = start.headers()["location"] ?? "";
  expect(location).toMatch(/\/auth\/v1\/authorize\?provider=google|\/ar\/sign-in\?error=1$/);
  if (location.includes("authorize")) {
    expect(location).toContain(encodeURIComponent("/api/auth/callback?next=%2Far%2Fapp"));
  }
});
