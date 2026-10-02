// ★ REQ-ADM-017, REQ-UIX-098 (wave 22): one export's BYTES, opened as Excel opens them — the UTF-8 BOM first, an
// Arabic header, Western numerals, a sortable date — and every row past PostgREST's `max_rows`, because the read pages
// (`admin-paging.ts`, DEC-232 §4.3). The stub answers a range like PostgREST does: at most 1000 rows to any request.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/proposals", () => ({ getOrgPrefs: async () => ({ timeZone: "Asia/Riyadh", maxCoPresenters: 4 }) }));

const MAX_ROWS = 1000;
const ledger = Array.from({ length: 2345 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  amount: i === 0 ? 1240 : -5,
  source: i === 0 ? "check_in" : "late_cancellation",
  reason: "سبب",
  occurred_at: "2026-09-17T12:05:00Z",
  member_id: "m",
  members: { display_name: "سارة العتيبي" },
}));
const audit = vi.fn(async () => ({ data: null, error: null }));

function builder(rows: Record<string, unknown>[]) {
  const q = {
    select: () => q,
    eq: () => q,
    order: () => q,
    range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null }),
  };
  return q;
}

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { role: "admin", orgId: "org" }, supabase: { from: () => builder(ledger), rpc: audit } }),
}));

const { exportPointsCsv } = await import("@/lib/dal/admin-exports");

beforeEach(() => audit.mockClear());

describe("an export's bytes", () => {
  it("open with the BOM, an Arabic header, Western digits and a sortable date — and hold every row", async () => {
    const csv = (await exportPointsCsv("ar"))!;
    const bytes = Buffer.from(csv, "utf8");
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const [header, first] = csv.slice(1).split("\r\n");
    expect(header).toBe("العضو,القيمة,المصدر,السبب,التاريخ (Asia/Riyadh)");
    expect(first).toBe('سارة العتيبي,"1,240",تسجيل حضور,سبب,2026-09-17 15:05');
    expect(csv).not.toMatch(/[٠-٩]/);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(1 + ledger.length);
  });

  it("is audited once, as the points export", async () => {
    await exportPointsCsv("ar");
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith("write_admin_export_audit", { p_export_type: "points", p_subject_type: null, p_subject_id: null });
  });
});
