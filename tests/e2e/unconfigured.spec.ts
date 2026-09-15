// DEC-038: with the platform's NEXT_PUBLIC_ variables unset — production's
// state until PR C — the build succeeds, every platform route and auth
// screen is a 404, the auth Route Handlers refuse, and the frozen routes are
// untouched. Runs only against a build made WITHOUT the variables
// (`npm run test:e2e:unconfigured`); the served app gets them as empty too.
import { expect, test } from "@playwright/test";

test.skip(process.env.E2E_PLATFORM_UNCONFIGURED !== "1", "needs a build made without NEXT_PUBLIC_SUPABASE_*: `npm run test:e2e:unconfigured`");

test("platform routes and auth screens are 404 with the marketing 404 page", async ({ page, request }) => {
  // The public platform routes too — /verify served a 500 on the live site
  // until DEC-050; the proxy's predicate now covers them (DEC-051).
  for (const path of ["/ar/app", "/ar/app/me", "/ar/sign-in", "/ar/choose-org", "/ar/no-access", "/ar/verify/AbCdEfGhIjKlMnOpQrStUvWx", "/ar/legal/privacy"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
    expect(await res.text(), path).toContain("الصفحة غير موجودة");
  }
  await page.goto("/ar/app");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("الصفحة غير موجودة");
});

test("the auth Route Handlers refuse", async ({ request }) => {
  expect((await request.post("/api/auth/sign-out", { maxRedirects: 0 })).status()).toBe(404);
  expect((await request.post("/api/auth/sign-in", { form: { next: "/ar/app" }, maxRedirects: 0 })).status()).toBe(404);
  expect((await request.get("/api/auth/callback?code=x", { maxRedirects: 0 })).status()).toBe(404);
});

test("the frozen routes are untouched", async ({ request }) => {
  for (const path of ["/ar", "/en", "/ar/register"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-security-policy-report-only"]).toMatch(/report-sample/);
    expect(await res.text()).not.toContain("nonce=");
  }
  const og = await request.get("/og.png");
  expect(og.status()).toBe(200);
  const root = await request.get("/", { maxRedirects: 0 });
  expect(root.status()).toBe(307);
});
