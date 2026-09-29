// SCR-048's team colour — REQ-UIX-043, DEC-183 §4.11, DEC-186 §8. Two
// boundaries, both proven: `setCompanyTeamColour` (the Server Action) only
// ever posts one of the seven NAMES to the DAL, translated to its `#rrggbb`
// here, never a hex the client invented; `setCompanyTeamColor` (the DAL)
// writes exactly that column, nothing else.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/session", () => ({ sessionClient: vi.fn() }));

const setCompanyTeamColor = vi.fn();
vi.mock("@/lib/dal/admin-lists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dal/admin-lists")>()),
  setCompanyTeamColor: (...a: unknown[]) => setCompanyTeamColor(...a),
}));

const { setCompanyTeamColour } = await import("@/app/[locale]/app/admin/companies/actions");
const { TEAM_COLOUR_HEX } = await import("@/app/[locale]/app/admin/companies/team-colours");

const ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => setCompanyTeamColor.mockReset());

describe("setCompanyTeamColour — the Server Action", () => {
  it("translates every one of the seven names into its exact globals.css hex", async () => {
    for (const [name, hex] of Object.entries(TEAM_COLOUR_HEX)) {
      await setCompanyTeamColour("ar", ID, name);
      expect(setCompanyTeamColor).toHaveBeenLastCalledWith("ar", ID, hex);
    }
  });

  it("«بلا لون» posts null, not the string 'null' or an empty string", async () => {
    await setCompanyTeamColour("ar", ID, null);
    expect(setCompanyTeamColor).toHaveBeenCalledWith("ar", ID, null);
  });

  it("refuses a name outside the seven — never reaches the DAL with an invented value", async () => {
    await setCompanyTeamColour("ar", ID, "#c6ff3d");
    await setCompanyTeamColour("ar", ID, "lime");
    await setCompanyTeamColour("ar", ID, "");
    expect(setCompanyTeamColor).not.toHaveBeenCalled();
  });

  it("refuses a malformed company id — never reaches the DAL", async () => {
    await setCompanyTeamColour("ar", "not-a-uuid", "gold");
    expect(setCompanyTeamColor).not.toHaveBeenCalled();
  });
});
