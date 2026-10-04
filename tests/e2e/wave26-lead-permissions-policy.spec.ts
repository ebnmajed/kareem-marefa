// The camera is allowed inside the app and nowhere else — REQ-STO-011, REQ-NFR-019.
//
// `src/proxy.ts` sent `camera=(), microphone=()` on every route, which refused `getUserMedia` before any prompt: the
// story capture could never have opened a camera in production (found by `content` on the first build of PR D). The
// header now allows this origin alone, on `/app` paths alone. This holds both halves: the app may ask, and ★ the
// public site and the sign-in pages still may not — their header is what it was, byte for byte.
import { expect, test } from "@playwright/test";

const REFUSED = "camera=(), microphone=(), geolocation=()";
const APP = "camera=(self), microphone=(self), geolocation=()";

test("the public routes and sign-in keep the camera refused", async ({ request }) => {
  for (const path of ["/ar", "/en", "/ar/register", "/ar/sign-in", "/ar/legal/privacy"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.headers()["permissions-policy"], path).toBe(REFUSED);
  }
});

test("an /app path allows the camera and the microphone to this origin only, and never geolocation", async ({ request }) => {
  // Signed out, the proxy answers with a redirect to sign-in — the header is on that answer too, and the page it
  // lands on is refused again.
  const response = await request.get("/ar/app", { maxRedirects: 0 });
  expect(response.headers()["permissions-policy"]).toBe(APP);
  const landed = await request.get("/ar/app");
  expect(landed.url()).toContain("/sign-in");
  expect(landed.headers()["permissions-policy"]).toBe(REFUSED);
});
