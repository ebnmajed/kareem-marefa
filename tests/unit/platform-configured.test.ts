// DEC-038: main stays deployable with the platform unconfigured. The switch
// is one function; the proxy and the auth Route Handlers key off it.
import { afterEach, describe, expect, it } from "vitest";
import { platformConfigured } from "@/lib/supabase/env";
import { isAuthScreenPath, isPlatformPath } from "@/lib/auth/next-path";

const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
afterEach(() => {
  if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
  if (saved.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = saved.key;
});

describe("platformConfigured", () => {
  it("is false when either variable is missing or empty", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(platformConfigured()).toBe(false);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    expect(platformConfigured()).toBe(false);
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";
    expect(platformConfigured()).toBe(false);
  });
  it("is true only when both are set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x";
    expect(platformConfigured()).toBe(true);
  });
});

describe("the paths the guard covers", () => {
  it("platform routes and the auth screens, never the frozen routes", () => {
    for (const p of ["/ar/app", "/ar/app/me", "/ar/sign-in", "/ar/choose-org", "/ar/no-access?reason=suspended".split("?")[0]]) {
      expect(isPlatformPath(p) || isAuthScreenPath(p)).toBe(true);
    }
    for (const p of ["/", "/ar", "/en", "/ar/register", "/og.png", "/ar/apply", "/ar/signal"]) {
      expect(isPlatformPath(p) || isAuthScreenPath(p)).toBe(false);
    }
  });
});
