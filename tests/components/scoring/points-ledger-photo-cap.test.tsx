// The photo cap's explanation row on SCR-022 (wave 20, PR C, REQ-UIX-083, STORY-UIX-073, DEC-222). A photo past the
// cap earns 0 and says so (DEC-043): the row names photos, not comments, on the phone list and in the desktop table.
import { render } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import scoring from "@/messages/ar/scoring.json";
import sessions from "@/messages/ar/sessions.json";
import admin from "@/messages/ar/admin.json";
import en from "@/messages/en/scoring.json";
import type { LedgerItem } from "@/lib/dal/points";

const messages = { ...scoring, ...sessions, ...admin };
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => createTranslator({ locale: "ar", messages, namespace: namespace as never }),
}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: async () => ({}) }));

const { PointsLedger } = await import("@/components/scoring/points-ledger");

const intl = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ar" messages={messages} timeZone="Asia/Riyadh">
    {ui}
  </NextIntlClientProvider>
);
const cap = (ruleKey: string, capPerSession: number): LedgerItem => ({
  kind: "cap",
  at: "2026-10-01T16:05:00Z",
  cap: { sessionId: "s", sessionTitle: "الأرقام التي تكذب", ruleKey, reason: "صورة من الجلسة", capPerSession, at: "2026-10-01T16:05:00Z" },
});
async function draw(items: LedgerItem[]) {
  const ui = await PointsLedger({ items, rowCount: items.length, shown: items.length, moreHref: null, filtered: false, timeZone: "Asia/Riyadh", locale: "ar" });
  return render(intl(ui)).container;
}

describe("the ledger — the photo cap", () => {
  it("★ a photo cap names photos, drawn as 0, on the phone and in the table", async () => {
    const c = await draw([cap("photo", 5)]);
    const li = c.querySelector("#history li")!;
    expect(li.getAttribute("data-kind")).toBe("cap");
    expect(li.querySelector("[data-slot=figure] bdi")!.textContent).toBe("0");
    expect(li.textContent).toContain("الحد: 5 صور لكل جلسة");
    expect(li.textContent).not.toContain("تعليق");
    expect(c.querySelector("#history-table")!.textContent).toContain("الحد: 5 صور لكل جلسة");
  });

  it("a comment cap still names comments", async () => {
    const c = await draw([cap("comment", 3)]);
    expect(c.querySelector("#history li")!.textContent).toContain("الحد: 3 تعليقات لكل جلسة");
  });

  it("the Arabic key has the six forms, the English two, and neither an Eastern digit", () => {
    const ar = scoring.scoring.points.ledger.capPhoto;
    for (const form of ["zero", "one", "two", "few", "many", "other"]) expect(ar).toContain(`${form} {`);
    expect(en.scoring.points.ledger.capPhoto).toContain("one {");
    expect(ar + en.scoring.points.ledger.capPhoto).not.toMatch(/[٠-٩]/);
  });
});
