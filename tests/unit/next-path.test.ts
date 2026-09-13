// REQ-AUT-005: the stored destination is validated as an internal path; an
// external URL is discarded.
import { describe, expect, it } from "vitest";
import { appHome, isPlatformPath, safeNextPath } from "@/lib/auth/next-path";

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
  });
});
