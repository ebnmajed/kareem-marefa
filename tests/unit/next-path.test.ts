// REQ-AUT-005: the stored destination is validated as an internal path; an
// external URL is discarded.
import { describe, expect, it } from "vitest";
import { appHome, isPlatformPath, isPublicPlatformPath, isUnconfiguredGatedPath, safeNextPath } from "@/lib/auth/next-path";

describe("safeNextPath", () => {
  it("keeps a platform path, with its query", () => {
    expect(safeNextPath("/ar/app/sessions/abc?tab=materials", "ar")).toBe("/ar/app/sessions/abc?tab=materials");
    expect(safeNextPath("/ar/app", "ar")).toBe("/ar/app");
    expect(safeNextPath(encodeURIComponent("/ar/app/sessions/abc"), "ar")).toBe("/ar/app/sessions/abc");
  });

  it("drops a fragment", () => {
    expect(safeNextPath("/ar/app/sessions/abc#top", "ar")).toBe("/ar/app/sessions/abc");
  });

  it("discards anything external or scheme-bearing", () => {
    for (const bad of [
      "https://evil.example/",
      "//evil.example/ar/app",
      "/\\evil.example",
      "javascript:alert(1)",
      "http://localhost:3000/ar/app",
      " /ar/app",
      "/ar/app\n",
      "%2F%2Fevil.example",
      "%E0%A4%A",
    ]) {
      expect(safeNextPath(bad, "ar")).toBe("/ar/app");
    }
  });

  it("discards paths outside the platform or with an unknown locale", () => {
    expect(safeNextPath("/ar/register", "ar")).toBe("/ar/app");
    expect(safeNextPath("/xx/app", "ar")).toBe("/ar/app");
    expect(safeNextPath("/ar/apply", "ar")).toBe("/ar/app");
    expect(safeNextPath("", "ar")).toBe("/ar/app");
    expect(safeNextPath(null, "en")).toBe("/en/app");
  });

  it("appHome falls back to the default locale", () => {
    expect(appHome("ar")).toBe("/ar/app");
    expect(appHome("zz")).toBe("/ar/app");
  });

  it("isPlatformPath", () => {
    expect(isPlatformPath("/ar/app")).toBe(true);
    expect(isPlatformPath("/ar/app/me")).toBe(true);
    expect(isPlatformPath("/ar/apply")).toBe(false);
    expect(isPlatformPath("/ar")).toBe(false);
    // The public platform routes are NOT the session-required platform: a
    // stranger with a printed certificate is never sent to sign-in.
    expect(isPlatformPath("/ar/verify/abc")).toBe(false);
    expect(isPlatformPath("/ar/legal/privacy")).toBe(false);
  });

  it("isPublicPlatformPath — /verify and /legal, never the frozen routes", () => {
    expect(isPublicPlatformPath("/ar/verify/abc")).toBe(true);
    expect(isPublicPlatformPath("/en/verify/abc")).toBe(true);
    expect(isPublicPlatformPath("/ar/legal/privacy")).toBe(true);
    expect(isPublicPlatformPath("/ar/legal")).toBe(true);
    expect(isPublicPlatformPath("/ar/verify")).toBe(true);
    expect(isPublicPlatformPath("/ar/verified")).toBe(false);
    expect(isPublicPlatformPath("/ar/app/verify")).toBe(false);
    for (const frozen of ["/", "/ar", "/en", "/ar/register", "/og.png"]) {
      expect(isPublicPlatformPath(frozen), frozen).toBe(false);
    }
  });

  it("isUnconfiguredGatedPath covers every platform route and no frozen one (DEC-038)", () => {
    for (const p of ["/ar/app", "/ar/app/me", "/ar/sign-in", "/ar/choose-org", "/ar/no-access", "/ar/verify/abc", "/ar/legal/terms"]) {
      expect(isUnconfiguredGatedPath(p), p).toBe(true);
    }
    for (const p of ["/", "/ar", "/en", "/ar/register", "/og.png", "/ar/apply", "/ar/signal", "/ar/verified"]) {
      expect(isUnconfiguredGatedPath(p), p).toBe(false);
    }
  });
});
