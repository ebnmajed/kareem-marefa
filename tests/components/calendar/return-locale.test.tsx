// The Google OAuth round trip returns to the member's locale — REQ-CAL-003, wave 20 C18 (DEC-218 §2.5).
//
// ★ The value comes from a query string and a cookie, so it is matched against the routing's list and never
// interpolated raw: junk returns to the default locale's calendar on the SAME origin — never an open redirect.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calendarReturnUrl, LOCALE_COOKIE, returnLocale } from "@/components/calendar/return-locale";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));
const requireSession = vi.fn();
vi.mock("@/lib/dal/session", () => ({ requireSession: (locale: string) => requireSession(locale), sessionClient: async () => ({ supabase: {} }) }));
vi.mock("@/app/api/calendar/oauth", () => ({ oauthClient: () => null, consentUrl: vi.fn(), exchangeCode: vi.fn(), STATE_COOKIE: "kareem_cal_state" }));

const ORIGIN = "https://app.example.test";
const req = (path: string) => new Request(`${ORIGIN}${path}`);

beforeEach(() => {
  jar.clear();
  requireSession.mockReset();
});

describe("returnLocale", () => {
  it("keeps a locale the routing serves", () => {
    expect(returnLocale("en")).toBe("en");
    expect(returnLocale("ar")).toBe("ar");
  });

  it.each([null, undefined, "", "fr", "EN", "//evil.example", "ar/../x", "https:", "en?x=1"])("falls back to the default for %j", (raw) => {
    expect(returnLocale(raw)).toBe("ar");
  });
});

describe("calendarReturnUrl", () => {
  it("an en start returns to /en/app/me/calendar on the request's origin, with its reason", () => {
    const url = calendarReturnUrl(req("/api/calendar/callback"), "en", { connected: "1" });
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe("/en/app/me/calendar");
    expect(url.searchParams.get("connected")).toBe("1");
  });

  it("★ a junk value returns to the default locale on the SAME origin — never another host", () => {
    for (const raw of ["//evil.example", "https://evil.example", "\\\\evil.example"]) {
      const url = calendarReturnUrl(req("/api/calendar/callback"), raw);
      expect(url.origin).toBe(ORIGIN);
      expect(url.pathname).toBe("/ar/app/me/calendar");
    }
  });
});

describe("the two routes carry it", () => {
  it("connect reads ?locale=, checks the member in it, and returns there", async () => {
    const { GET } = await import("@/app/api/calendar/connect/route");
    const res = await GET(req("/api/calendar/connect?locale=en"));
    expect(requireSession).toHaveBeenCalledWith("en");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/en/app/me/calendar");
  });

  it("connect with a junk ?locale= goes to the default locale, same origin", async () => {
    const { GET } = await import("@/app/api/calendar/connect/route");
    const res = await GET(req("/api/calendar/connect?locale=%2F%2Fevil.example"));
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/ar/app/me/calendar");
  });

  it("the callback returns to the locale its cookie names — a forged one to the default", async () => {
    const { GET } = await import("@/app/api/calendar/callback/route");
    jar.set(LOCALE_COOKIE, "en");
    let res = await GET(req("/api/calendar/callback?error=access_denied"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/en/app/me/calendar");

    jar.set(LOCALE_COOKIE, "//evil.example");
    res = await GET(req("/api/calendar/callback?error=access_denied"));
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/ar/app/me/calendar");
  });
});
