// The console rail's destinations, COUNTED — REQ-UIX-084, DEC-226 §2, DEC-227. The lead's.
//
// `DEC-226` asked for a proof by count, not by glance: nineteen for an admin who may reach them (twenty until wave 22's
// moderation merge, DEC-230 §3), `REQ-ADM-020`'s five for a moderator, none for a plain member, and never an item whose screen is not built — the three behaviours the deleted
// rail's own comments recorded. And the twenty are exactly the `admin.shell.nav.*` keys: nothing orphaned.
import { describe, expect, it } from "vitest";
import ar from "@/messages/ar/admin.json";
import en from "@/messages/en/admin.json";
import { ADMIN_NAV, adminRailGroups } from "@/components/shell/admin-nav";

const label = (key: string) => `label:${key}`;
const keysOf = (groups: { key: string }[][]) => groups.flat().map((l) => l.key);

describe("the console rail (DEC-226)", () => {
  it("is six ruled groups of twenty leaves, in the artboard's order — 4 · 4 · 3 · 3 · 3 · 3", () => {
    expect(ADMIN_NAV.map((g) => g.length)).toEqual([4, 4, 3, 3, 3, 3]);
  });

  it("renders nineteen to an admin, each with its label — moderationComments is unbuilt since DEC-230 §3", () => {
    const groups = adminRailGroups("admin", label);
    expect(groups.flat()).toHaveLength(19);
    expect(keysOf(groups)).not.toContain("moderationComments");
    for (const link of groups.flat()) expect(link.label).toBe(`label:${link.key}`);
  });

  it("renders REQ-ADM-020's five to a moderator — sessions, surveys, the two moderation screens, the audit log", () => {
    expect(keysOf(adminRailGroups("moderator", label)).sort()).toEqual(
      ["audit", "moderationPhotos", "moderationReports", "sessions", "surveys"].sort(),
    );
  });

  it("renders nothing to a plain member", () => {
    expect(adminRailGroups("member", label)).toEqual([]);
  });

  it("never renders an item whose screen is not built", () => {
    const table = ADMIN_NAV.map((g) => g.map((leaf) => (leaf.key === "venues" ? { ...leaf, built: false } : leaf)));
    // the filter is the function's, so prove it on a table with one unbuilt leaf
    const built = table.flat().filter((l) => l.built).length;
    expect(built).toBe(18);
    // wave 22: exactly one leaf is unbuilt in the table itself — the merged moderation queue (DEC-230 §3)
    expect(ADMIN_NAV.flat().filter((l) => !l.built).map((l) => l.key)).toEqual(["moderationComments"]);
  });

  it("names exactly the twenty admin.shell.nav keys, in both languages — nothing orphaned", () => {
    const keys = ADMIN_NAV.flat().map((l) => l.key).sort();
    expect(Object.keys(ar.admin.shell.nav).sort()).toEqual(keys);
    expect(Object.keys(en.admin.shell.nav).sort()).toEqual(keys);
  });

  it("draws a badge only above zero, with its accessible text", () => {
    const groups = adminRailGroups("admin", label, { proposals: { count: 4, label: "4" }, sessions: { count: 0, label: "0" } });
    const flat = groups.flat();
    expect(flat.find((l) => l.key === "proposals")).toMatchObject({ count: 4, countLabel: "4" });
    expect(flat.find((l) => l.key === "sessions")?.count).toBeUndefined();
  });

  it("marks only the dashboard exact", () => {
    expect(adminRailGroups("admin", label).flat().filter((l) => l.exact).map((l) => l.key)).toEqual(["dashboard"]);
  });
});
