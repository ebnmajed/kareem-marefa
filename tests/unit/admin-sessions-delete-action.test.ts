// REQ-SES-023 (0215) — SCR-042's delete action: Zod first, then one id → `deleteSession()`, several →
// `deleteSessions()`, answered per event. The DAL is faked; the database's own refusals are `delete-events.test.ts`'s.
import { beforeEach, describe, expect, it, vi } from "vitest";

const dal = vi.hoisted(() => ({
  deleteSession: vi.fn(),
  deleteSessions: vi.fn(),
  getDeletionImpact: vi.fn(),
}));
vi.mock("@/lib/dal/sessions", () => ({
  ...dal,
  createSessionDirect: vi.fn(),
  createSessionFromProposal: vi.fn(),
  directSessionInput: { safeParse: vi.fn() },
  transitionSession: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ redirect: vi.fn() }));

const { runDelete, previewDeletion } = await import("@/app/[locale]/app/admin/sessions/actions");
const { emptyDeleteState } = await import("@/app/[locale]/app/admin/sessions/state");

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const fd = (ids: string[], reason = "") => {
  const f = new FormData();
  for (const id of ids) f.append("ids", id);
  f.set("reason", reason);
  return f;
};
const ok = { ok: true, status: "deleted", cancelled: false, pointsReversed: 2, companyPointsReversed: 0, certificatesRevoked: 1 };

beforeEach(() => {
  dal.deleteSession.mockReset();
  dal.deleteSessions.mockReset();
  dal.getDeletionImpact.mockReset();
});

describe("runDelete", () => {
  it("one id calls deleteSession with the reason, never the bulk function", async () => {
    dal.deleteSession.mockResolvedValue(ok);
    const state = await runDelete("ar", emptyDeleteState, fd([A], "  مكررة "));
    expect(dal.deleteSession).toHaveBeenCalledWith("ar", A, "مكررة");
    expect(dal.deleteSessions).not.toHaveBeenCalled();
    expect(state).toMatchObject({ error: null, deleted: [A], failed: [], pointsReversed: 2, certificatesRevoked: 1 });
  });

  it("an empty reason is sent as null — the database writes «حُذفت الفعالية»", async () => {
    dal.deleteSession.mockResolvedValue(ok);
    await runDelete("ar", emptyDeleteState, fd([A]));
    expect(dal.deleteSession).toHaveBeenCalledWith("ar", A, null);
  });

  it("several ids call deleteSessions once and split the answer per event", async () => {
    dal.deleteSessions.mockResolvedValue({
      ok: true,
      items: [
        { sessionId: A, ...ok },
        { sessionId: B, ok: false, error: "failed" },
      ],
    });
    const state = await runDelete("ar", emptyDeleteState, fd([A, B, A]));
    expect(dal.deleteSessions).toHaveBeenCalledWith("ar", [A, B], null);
    expect(dal.deleteSession).not.toHaveBeenCalled();
    expect(state).toMatchObject({ error: null, deleted: [A], failed: [B] });
  });

  it("a refusal of the whole run marks every id failed with its reason", async () => {
    dal.deleteSessions.mockResolvedValue({ ok: false, error: "refused" });
    const state = await runDelete("ar", emptyDeleteState, fd([A, B]));
    expect(state).toMatchObject({ error: "refused", deleted: [], failed: [A, B] });
  });

  it("refuses a malformed id and a reason over 300 before the DAL", async () => {
    expect((await runDelete("ar", emptyDeleteState, fd(["nope"]))).error).toBe("invalid");
    expect((await runDelete("ar", emptyDeleteState, fd([A], "x".repeat(301)))).error).toBe("invalid");
    expect(dal.deleteSession).not.toHaveBeenCalled();
  });

  it("refuses more than 200 at once", async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect((await runDelete("ar", emptyDeleteState, fd(ids))).error).toBe("tooMany");
    expect(dal.deleteSessions).not.toHaveBeenCalled();
  });
});

describe("previewDeletion", () => {
  it("reads the impact for well-formed ids and nothing for a malformed one", async () => {
    dal.getDeletionImpact.mockResolvedValue({ sessions: 1, toCancel: 0, membersWithPoints: 3, certificates: 0 });
    expect(await previewDeletion("ar", [A])).toMatchObject({ membersWithPoints: 3 });
    expect(await previewDeletion("ar", ["nope"])).toBeNull();
    expect(dal.getDeletionImpact).toHaveBeenCalledTimes(1);
  });
});
