// The camera is allowed inside the app and nowhere else — REQ-STO-011, REQ-NFR-019.
//
// `src/proxy.ts` sent `camera=(), microphone=()` on every route, which refused `getUserMedia` before any prompt: the
// story capture could never have opened a camera in production (found by `content` on the first build of PR D). The
// header now allows this origin alone, on `/app` paths alone. This holds both halves: the app may ask, and ★ the
// public site and the sign-in pages still may not — their header is what it was, byte for byte.
import { expect, test } from "@playwright/test";

// ★ DEC-274: one policy on every route. The policy is fixed when a document loads and the app is reached by
// client-side navigation from sign-in, so a route-scoped grant left the camera refused inside the app.
const APP = "camera=(self), microphone=(self), geolocation=()";

// On the UNCONFIGURED build (DEC-038, CI's «platform unconfigured» job) the proxy answers every platform path — sign-in
// and `/app` among them — with a redirect to the «not configured» page before it reaches the header, so only the
// public routes can be asked there. They are the half that must never change, and they are asked on both builds.
const UNCONFIGURED = process.env.E2E_PLATFORM_UNCONFIGURED === "1";

test("★ the public routes and sign-in carry the same policy as the app, so navigating in keeps the camera", async ({ request }) => {
  for (const path of UNCONFIGURED ? ["/ar", "/en", "/ar/register"] : ["/ar", "/en", "/ar/register", "/ar/sign-in", "/ar/legal/privacy"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.headers()["permissions-policy"], path).toBe(APP);
  }
});

test("an /app path allows the camera and the microphone to this origin only, and never geolocation", async ({ request }) => {
  test.skip(UNCONFIGURED, "there is no /app on the unconfigured build: the proxy sends it to the «not configured» page");
  // Signed out, the proxy answers with a redirect to sign-in — the header is on that answer too, and the page it
  // lands on is refused again.
  const response = await request.get("/ar/app", { maxRedirects: 0 });
  expect(response.headers()["permissions-policy"]).toBe(APP);
  const landed = await request.get("/ar/app");
  expect(landed.url()).toContain("/sign-in");
  expect(landed.headers()["permissions-policy"]).toBe(APP);
});
