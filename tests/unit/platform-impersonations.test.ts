// SCR-085's three states, decided in the DAL (`listMyImpersonations()`) — wave 8,
// `docs/plan/notes/platform.md` W8.8. REQ-ADM-002, REQ-ADM-019.
//
// The two writers of `ended_at` leave different marks, and the screen tells the
// operator which happened: `expire_impersonation_sessions()` writes
// `ended_at = expires_at`, `end_impersonation()` writes `least(now(), expires_at)`.
// So a stop is an end BEFORE the expiry, anything at or past it ended on its own
// — including a session the job has not swept yet.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/dal/session", () => ({ getSessionState: vi.fn(async () => ({ kind: "no_org", userId: "u", platformAdmin: true })) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc, auth: { getClaims: async () => ({ data: { claims: { sub: "u" } }, error: null }) } })),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T extends (...a: never[]) => unknown>(fn: T) => fn };
});

import { listMyImpersonations } from "@/lib/dal/platform";

const NOW = Date.parse("2026-09-17T12:00:00Z");
const at = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString();
const row = (id: string, startedAt: string, expiresAt: string, endedAt: string | null) => ({
  id,
  org_id: "o",
  org_name: "مؤسسة",
  org_slug: "org",
  reason: "سبب",
  started_at: startedAt,
  expires_at: expiresAt,
  ended_at: endedAt,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  rpc.mockReset();
});

async function states(rows: ReturnType<typeof row>[]) {
  rpc.mockImplementation(async (name: string) => (name === "platform_impersonations" ? { data: rows, error: null } : { data: null, error: null }));
  return Object.fromEntries((await listMyImpersonations("ar")).map((s) => [s.id, { isActive: s.isActive, endedBy: s.endedBy, endedRecently: s.endedRecently }]));
}

describe("listMyImpersonations — how a session ended", () => {
  it("live: no end, the expiry ahead", async () => {
    expect((await states([row("live", at(-10), at(20), null)])).live).toEqual({ isActive: true, endedBy: null, endedRecently: false });
  });

  it("stopped: an end before the expiry", async () => {
    expect((await states([row("stop", at(-30), at(30), at(-5))])).stop).toEqual({ isActive: false, endedBy: "stopped", endedRecently: true });
  });

  it("expired by the job: `ended_at = expires_at`", async () => {
    expect((await states([row("job", at(-40), at(-10), at(-10))])).job).toEqual({ isActive: false, endedBy: "expired", endedRecently: true });
  });

  it("★ expired before the job has swept it: no end, the expiry behind", async () => {
    expect((await states([row("unswept", at(-40), at(-1), null)])).unswept).toEqual({ isActive: false, endedBy: "expired", endedRecently: true });
  });

  it("a stop pressed after the expiry reads as an expiry, because that is what `least(now(), expires_at)` stores", async () => {
    expect((await states([row("late", at(-60), at(-20), at(-20))])).late.endedBy).toBe("expired");
  });

  it("recent means within the hour, and not after it", async () => {
    const s = await states([row("hour", at(-200), at(-60), at(-60)), row("old", at(-300), at(-61), at(-61))]);
    expect(s.hour.endedRecently).toBe(true);
    expect(s.old.endedRecently).toBe(false);
  });
});
