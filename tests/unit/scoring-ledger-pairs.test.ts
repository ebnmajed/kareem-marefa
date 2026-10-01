// Wave 20 — SCR-022's ledger read, its pure parts (REQ-UIX-072, REQ-PTS-003, DEC-216 §5.6, §5.9).
// ★ Every ledger row is drawn exactly once; the reversal pair is one item; the month is the ORG's.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: async () => ({}) }));

const { pairReversals, orgMonthRange, orgMonthOf, lastOrgMonths } = await import("@/lib/dal/points");
type Entry = Parameters<typeof pairReversals>[0][number];

const row = (id: string, at: string, amount: number, extra: Partial<Entry> = {}): Entry => ({
  id,
  occurredAt: at,
  amount,
  reason: "حضور جلسة",
  ruleKey: "check_in",
  source: "check_in",
  sessionId: "s1",
  sessionTitle: "ورشة",
  isReversal: false,
  isManualAdjustment: false,
  sourceId: null,
  actorName: null,
  ...extra,
});
const reversal = (id: string, at: string, of: string, amount: number) =>
  row(id, at, amount, { source: "reversal", isReversal: true, sourceId: of, reason: "أُلغي تسجيل الحضور", ruleKey: "check_in" });

function ids(items: ReturnType<typeof pairReversals>): string[] {
  return items.flatMap((i) => (i.kind === "reversal" ? [i.entry.id, ...(i.reversed ? [i.reversed.id] : [])] : [i.entry.id]));
}

describe("pairReversals", () => {
  it("★ a reversal and the row it reverses are ONE item, at the reversal's place; the reversed row leaves its own", () => {
    const rows = [row("a", "2026-10-02", 5), reversal("r", "2026-09-16", "x", -50), row("x", "2026-09-15", 50), row("b", "2026-09-14", 5)];
    const items = pairReversals(rows);
    expect(items.map((i) => i.kind)).toEqual(["entry", "reversal", "entry"]);
    expect(items[1]).toMatchObject({ entry: { id: "r" }, reversed: { id: "x" } });
  });

  it("★★ every ledger row exactly once — none lost, none twice", () => {
    const rows = [reversal("r2", "5", "y", -10), reversal("r1", "4", "x", -50), row("y", "3", 10), row("x", "2", 50), row("z", "1", 7)];
    const out = ids(pairReversals(rows));
    expect(out.sort()).toEqual(rows.map((r) => r.id).sort());
  });

  it("a reversed row beyond the page or the filter is fetched and drawn inside its reversal, once", () => {
    const outside = [row("old", "2026-08-01", 50)];
    const items = pairReversals([reversal("r", "2026-10-01", "old", -50)], outside);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "reversal", reversed: { id: "old" } });
  });

  it("a reversal that names no row of the caller is drawn alone", () => {
    expect(pairReversals([reversal("r", "1", "ghost", -5)])[0]).toMatchObject({ kind: "reversal", reversed: null });
  });

  it("a row with no reversal is a plain entry", () => {
    expect(pairReversals([row("a", "1", 5)])).toEqual([{ kind: "entry", at: "1", entry: expect.objectContaining({ id: "a" }) }]);
  });
});

describe("the ORG's month", () => {
  it("★ Riyadh's October begins at 21:00 UTC on 30 September — not at UTC midnight", () => {
    expect(orgMonthRange("2026-10", "Asia/Riyadh")).toEqual({ gte: "2026-09-30T21:00:00.000Z", lt: "2026-10-31T21:00:00.000Z" });
  });

  it("follows a zone with summer time", () => {
    const r = orgMonthRange("2026-07", "Europe/London")!;
    expect(r.gte).toBe("2026-06-30T23:00:00.000Z");
  });

  it("refuses a malformed key", () => {
    expect(orgMonthRange("2026-13", "Asia/Riyadh")).toBeNull();
    expect(orgMonthRange("x", "Asia/Riyadh")).toBeNull();
  });

  it("names an instant's month in the org's zone, and lists the last twelve, newest first", () => {
    expect(orgMonthOf("2026-09-30T22:00:00Z", "Asia/Riyadh")).toBe("2026-10");
    const months = lastOrgMonths("Asia/Riyadh", 12, new Date("2026-01-15T00:00:00Z"));
    expect(months.slice(0, 3)).toEqual(["2026-01", "2025-12", "2025-11"]);
    expect(months).toHaveLength(12);
  });
});
