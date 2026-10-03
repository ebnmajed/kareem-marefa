// SCR-048's team colour — REQ-UIX-043, DEC-183 §4.11, DEC-186 §8. Two
// boundaries, both proven: `saveCompany` (the Server Action, wave 22 — the edit
// sheet's one save, which replaced the row's colour menu) only ever posts one of
// the seven NAMES to the DAL, translated to its `#rrggbb` here, never a hex the
// client invented; the column's check (`0160`) is the second boundary.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/session", () => ({ sessionClient: vi.fn() }));

const updateCompany = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/dal/admin-lists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dal/admin-lists")>()),
  updateCompany: (...a: unknown[]) => updateCompany(...(a as [])),
}));

const { saveCompany } = await import("@/app/[locale]/app/admin/companies/actions");
const { TEAM_COLOUR_HEX } = await import("@/app/[locale]/app/admin/companies/team-colours");
const { emptyCompanyState } = await import("@/app/[locale]/app/admin/companies/state");

const ID = "11111111-1111-4111-8111-111111111111";
const form = (teamColour: string) => {
  const fd = new FormData();
  fd.set("name", "مواهب");
  fd.set("teamColour", teamColour);
  return fd;
};

beforeEach(() => updateCompany.mockClear());

describe("saveCompany — the colour, through the Server Action", () => {
  it("translates every one of the seven names into its exact globals.css hex", async () => {
    for (const [name, hex] of Object.entries(TEAM_COLOUR_HEX)) {
      await saveCompany("ar", ID, emptyCompanyState, form(name));
      expect(updateCompany).toHaveBeenLastCalledWith("ar", ID, { name: "مواهب" }, hex);
    }
  });

  it("«بلا لون» posts null, not the string 'null' or an empty string", async () => {
    await saveCompany("ar", ID, emptyCompanyState, form("none"));
    expect(updateCompany).toHaveBeenCalledWith("ar", ID, { name: "مواهب" }, null);
  });

  it("refuses a name outside the seven — never reaches the DAL with an invented value", async () => {
    for (const bad of ["#c6ff3d", "lime"]) {
      const state = await saveCompany("ar", ID, emptyCompanyState, form(bad));
      expect(state.errors.teamColour).toBe("teamColourInvalid");
    }
    expect(updateCompany).not.toHaveBeenCalled();
  });

  it("refuses a malformed company id — never reaches the DAL", async () => {
    const state = await saveCompany("ar", "not-a-uuid", emptyCompanyState, form("gold"));
    expect(state.saved).toBe(false);
    expect(updateCompany).not.toHaveBeenCalled();
  });
});
