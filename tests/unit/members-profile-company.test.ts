// Wave 27 (`DEC-254` §2.5, `REQ-PRF-012`, `STORY-PRF-007`): the member never sets their company. The profile's input
// refuses a `companyId` outright, and `updateMyProfile()`'s payload never names `company_id` — PostgREST's UPDATE names
// only the payload's columns, which is why the save passes on both sides of the lead's revoke of the column from the
// member's grant (the database half is `tests/rls/member-company-self.test.ts`).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ME = "00000000-0000-4000-8000-0000000000dd";
const calls: { table: string; payload: Record<string, unknown>; id: unknown }[] = [];

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({
    session: { memberId: ME, orgId: "00000000-0000-4000-8000-0000000000aa", role: "member" },
    supabase: {
      from: (table: string) => ({
        update: (payload: Record<string, unknown>) => ({
          eq: async (_col: string, id: unknown) => {
            calls.push({ table, payload, id });
            return { error: null };
          },
        }),
      }),
    },
  }),
}));

const { profileInput, updateMyProfile } = await import("@/lib/dal/members");

beforeEach(() => {
  calls.length = 0;
});

describe("the profile carries no company (REQ-PRF-012)", () => {
  it("a crafted companyId is refused by the input, not ignored", () => {
    const parsed = profileInput.safeParse({ displayName: "ريم", companyId: "11111111-1111-4111-8111-111111111111", jobTitle: null, bio: null });
    expect(parsed.success).toBe(false);
  });

  it("the input accepts the profile without one", () => {
    expect(profileInput.safeParse({ displayName: "ريم", jobTitle: null, bio: null }).success).toBe(true);
  });

  it("updateMyProfile writes the session's own row and never names company_id", async () => {
    await updateMyProfile("ar", { displayName: "ريم", jobTitle: "مهندسة", bio: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("members");
    expect(calls[0].id).toBe(ME);
    expect(Object.keys(calls[0].payload).sort()).toEqual(["bio", "display_name", "job_title"]);
    expect(calls[0].payload).not.toHaveProperty("company_id");
  });

  it("the opt-out is still written only when it is sent", async () => {
    await updateMyProfile("ar", { displayName: "ريم", jobTitle: null, bio: null, leaderboardOptOut: true });
    expect(Object.keys(calls[0].payload).sort()).toEqual(["bio", "display_name", "job_title", "leaderboard_opt_out"]);
  });
});
