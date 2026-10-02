// SCR-022's ledger, rebuilt (wave 20, REQ-UIX-072, REQ-PTS-003, REQ-SES-017, DEC-216 §5.5, §5.9). Re-homes the
// retired `points-history-list` and `points-history-days` cases (scoring's note, «Where each retired case goes»).
// ★ Every row its own reason; the reversal pair one row with the fixed reason only; the cap a `0` explanation; the
// missed day a notice with no figure; Western numerals; axe-clean.
import { render, within } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import scoring from "@/messages/ar/scoring.json";
import sessions from "@/messages/ar/sessions.json";
import admin from "@/messages/ar/admin.json";
import type { LedgerEntry, LedgerItem } from "@/lib/dal/points";

const messages = { ...scoring, ...sessions, ...admin };
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => createTranslator({ locale: "ar", messages, namespace: namespace as never }),
}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: async () => ({}) }));

const { PointsLedger } = await import("@/components/scoring/points-ledger");

const TZ = "Asia/Riyadh";
const entry = (id: string, at: string, amount: number, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id,
  occurredAt: at,
  amount,
  reason: "تسجيل حضور مؤكَّد",
  ruleKey: "check_in",
  source: "check_in",
  sessionId: "11111111-1111-4111-8111-111111111111",
  sessionTitle: "الأرقام التي تكذب",
  isReversal: false,
  isManualAdjustment: false,
  sourceId: null,
  actorName: null,
  ...extra,
});

function intl(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="ar" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

async function draw(items: LedgerItem[], extra: { filtered?: boolean; moreHref?: string | null } = {}) {
  const ui = await PointsLedger({ items, rowCount: items.length, shown: items.length, moreHref: extra.moreHref ?? null, filtered: extra.filtered ?? false, timeZone: TZ, locale: "ar" });
  return render(intl(ui)).container;
}
const phone = (c: HTMLElement) => c.querySelector("#history") as HTMLElement;

describe("the ledger — a row", () => {
  it("a plain award: its own reason, the signed figure, the session title as the link, no tag", async () => {
    const c = await draw([{ kind: "entry", at: "2026-10-01T17:02:00Z", entry: entry("a", "2026-10-01T17:02:00Z", 20) }]);
    const li = phone(c).querySelector("li")!;
    expect(li.textContent).toContain("تسجيل حضور مؤكَّد");
    expect(li.querySelector("[data-slot=figure] bdi")!.textContent).toBe("+20");
    expect(within(li).getByRole("link", { name: "الأرقام التي تكذب" })).toHaveAttribute("href", expect.stringContaining("/app/sessions/11111111-1111-4111-8111-111111111111"));
    expect(li.textContent).not.toContain("إلغاء نقاط سابقة");
    expect(li.textContent).not.toContain("تعديل يدوي");
  });

  it("★ a manual adjustment: «تعديل يدوي من الإدارة», its reason AND the admin's name (REQ-PTS-009)", async () => {
    const e = entry("m", "2026-09-20T09:00:00Z", 5, { source: "manual_adjustment", isManualAdjustment: true, reason: "تنظيم قاعة جدة", actorName: "عبدالله المطيري", sessionId: null, sessionTitle: null });
    const li = phone(await draw([{ kind: "entry", at: e.occurredAt, entry: e }])).querySelector("li")!;
    expect(li.textContent).toContain("تعديل يدوي من الإدارة");
    expect(li.textContent).toContain("«تنظيم قاعة جدة» — عبدالله المطيري");
  });

  it("★★ the reversal pair is ONE row: the fixed reason, a Western minus, the reversed row struck beneath — never the admin's free text", async () => {
    const original = entry("x", "2026-09-15T10:00:00Z", 20);
    const rev = entry("r", "2026-09-16T10:00:00Z", -20, { source: "reversal", isReversal: true, sourceId: "x", reason: "أُلغي تسجيل الحضور" });
    const c = await draw([{ kind: "reversal", at: rev.occurredAt, entry: rev, reversed: original }]);
    const lis = phone(c).querySelectorAll("li");
    expect(lis).toHaveLength(1);
    const li = lis[0];
    expect(li.textContent).toContain("إلغاء نقاط سابقة");
    expect(li.textContent).toContain("أُلغي تسجيل الحضور");
    expect(li.textContent).not.toContain("لم يحضر فعليًا");
    expect(li.querySelector("[data-slot=figure] bdi")!.textContent).toBe("−20");
    expect(li.querySelector("[data-slot=reversed]")!.textContent).toContain("+20");
    expect(li.textContent).not.toMatch(/[٠-٩]/);
  });

  it("★ the cap is an explanation drawn as 0 — «الحد: …» — and no ledger figure", async () => {
    const c = await draw([
      { kind: "cap", at: "2026-10-01T16:05:00Z", cap: { sessionId: "s", sessionTitle: "الأرقام التي تكذب", ruleKey: "comment", reason: "تعليق", capPerSession: 3, at: "2026-10-01T16:05:00Z" } },
    ]);
    const li = phone(c).querySelector("li")!;
    expect(li.getAttribute("data-kind")).toBe("cap");
    expect(li.querySelector("[data-slot=figure] bdi")!.textContent).toBe("0");
    expect(li.textContent).toContain("الحد: 3 تعليقات لكل جلسة");
  });

  it("no row draws a running total", async () => {
    const c = await draw([
      { kind: "entry", at: "2026-10-02T10:00:00Z", entry: entry("a", "2026-10-02T10:00:00Z", 20) },
      { kind: "entry", at: "2026-10-01T10:00:00Z", entry: entry("b", "2026-10-01T10:00:00Z", 5) },
    ]);
    expect(phone(c).textContent).not.toContain("25");
  });
});

describe("the ledger — the missed day (REQ-SES-017)", () => {
  const notice = (days: Array<{ position: number; startsAt: string }>): LedgerItem => ({
    kind: "missed",
    at: "2026-09-30T18:00:00Z",
    notice: { sessionId: "w", sessionTitle: "ورشة ثلاثة أيام", completedAt: "2026-09-30T18:00:00Z", dayCount: 3, days },
  });

  it("names the day, states the rule, shows no figure", async () => {
    const li = phone(await draw([notice([{ position: 2, startsAt: "2026-09-29T15:00:00Z" }])])).querySelector("li")!;
    expect(li.textContent).toContain("لم تُحتسب نقاط الحضور");
    expect(li.textContent).toContain("اليوم الثاني");
    expect(li.textContent).toContain("نقاط الحضور تُمنح مرة واحدة عند حضور جميع أيام الجلسة.");
    expect(li.querySelector("[data-slot=figure]")).toBeNull();
  });

  it("joins several days in the locale's conjunction, with Western numerals only", async () => {
    const li = phone(await draw([notice([{ position: 2, startsAt: "2026-09-29T15:00:00Z" }, { position: 3, startsAt: "2026-09-30T15:00:00Z" }])])).querySelector("li")!;
    expect(li.textContent).toMatch(/اليوم الثاني و\s?اليوم الثالث/);
    expect(li.textContent).not.toMatch(/[٠-٩]/);
  });

  it("a notice beats the empty state", async () => {
    const c = await draw([notice([{ position: 2, startsAt: "2026-09-29T15:00:00Z" }])]);
    expect(c.textContent).not.toContain("لا نقاط بعد");
  });
});

describe("the ledger — grouping and states", () => {
  it("groups by the ORG's month, newest first — a row at 22:00 UTC on 30 September is October's in Riyadh", async () => {
    const c = await draw([
      { kind: "entry", at: "2026-09-30T22:00:00Z", entry: entry("a", "2026-09-30T22:00:00Z", 5) },
      { kind: "entry", at: "2026-09-20T10:00:00Z", entry: entry("b", "2026-09-20T10:00:00Z", 5) },
    ]);
    const heads = Array.from(phone(c).querySelectorAll("h2")).map((h) => h.textContent);
    expect(heads).toEqual(["أكتوبر 2026", "سبتمبر 2026"]);
  });

  it("the empty state names its next action (REQ-UIX-012)", async () => {
    const c = await draw([]);
    expect(c.textContent).toContain("لا نقاط بعد");
    expect(within(c).getByRole("link", { name: "تصفّح الجلسات" })).toBeTruthy();
  });

  it("★ filtered empty says so and offers to clear the filter", async () => {
    const c = await draw([], { filtered: true });
    expect(c.textContent).toContain("لا سطور في هذه التصفية");
    expect(within(c).getByRole("link", { name: "مسح التصفية" })).toHaveAttribute("href", expect.stringContaining("/app/me/points"));
  });

  it("«المزيد» when older rows exist", async () => {
    const c = await draw([{ kind: "entry", at: "2026-10-01T10:00:00Z", entry: entry("a", "2026-10-01T10:00:00Z", 5) }], { moreHref: "/app/me/points?rows=100" });
    expect(within(phone(c)).getByRole("link", { name: "المزيد" })).toHaveAttribute("href", expect.stringContaining("rows=100"));
  });

  it("★ the desktop table is outside #history — and draws a reversal as two rows, the reversed one struck", async () => {
    const original = entry("x", "2026-09-15T10:00:00Z", 20);
    const rev = entry("r", "2026-09-16T10:00:00Z", -20, { source: "reversal", isReversal: true, sourceId: "x", reason: "أُلغي تسجيل الحضور" });
    const c = await draw([{ kind: "reversal", at: rev.occurredAt, entry: rev, reversed: original }]);
    const table = c.querySelector("#history-table")!;
    expect(table.closest("#history")).toBeNull();
    expect(table.textContent).toContain("يلغي سطر");
    expect(table.querySelector(".line-through")!.textContent).toContain("تسجيل حضور مؤكَّد");
  });

  it("is axe-clean with a mixed history", async () => {
    const original = entry("x", "2026-09-15T10:00:00Z", 20);
    const rev = entry("r", "2026-09-16T10:00:00Z", -20, { source: "reversal", isReversal: true, sourceId: "x", reason: "أُلغي تسجيل الحضور" });
    const c = await draw([
      { kind: "entry", at: "2026-10-01T10:00:00Z", entry: entry("a", "2026-10-01T10:00:00Z", 5) },
      { kind: "reversal", at: rev.occurredAt, entry: rev, reversed: original },
    ]);
    const { violations } = await axe.run(phone(c), { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  }, 30_000);
});
