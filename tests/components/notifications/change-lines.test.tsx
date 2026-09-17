// notify (wave 9) — the inbox card says WHICH day moved and what it moved to
// (REQ-SES-009, REQ-NTF-005, DEC-119).
//
// ★ WHY THIS FILE EXISTS. `wave9-notify-days.spec.ts` was green on a capture
// whose card read «تغيّرت تفاصيل جلسة حجزت فيها» and nothing else: the spec
// asserted the PAYLOAD, which was right, while the screen said nothing a member
// could act on. A member of a three-day workshop told only «details changed»
// has to open the session and work out which evening moved — the diffing
// `08` §3.3 exists to spare them. So the day and the values are asserted here,
// on the component, and in the spec on the rendered page.
//
// `tests/components/notifications/notification-list.test.tsx` is `main`'s
// evidence for the one-day card and is not edited (rule 4).
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import arNotifications from "@/messages/ar/notifications.json";
import arSessions from "@/messages/ar/sessions.json";
import type { Locale } from "@/i18n/routing";
import type { NotificationDTO } from "@/lib/dal/notifications";

// The card reads its own namespace and `sessions.days` for the day's words.
const messages = { ...arNotifications, ...arSessions };

vi.mock("@/app/[locale]/app/me/notifications/actions", () => ({ markNotificationRead: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "notifications" }),
}));

const { NotificationList } = await import("@/components/notifications/notification-list");

const DAY_2_WAS = "2026-10-02T15:00:00Z";
const DAY_2_IS = "2026-10-02T18:00:00Z";

/** The Arabic-Indic digits, built from their codepoints. `DEC-124` forbids
 *  typing them anywhere in this repository, and a test that guards the rule is
 *  the last place that should break it. */
const ARABIC_INDIC = new RegExp(`[${String.fromCharCode(0x0660)}-${String.fromCharCode(0x0669)}]`);

function changed(changes: unknown[], extra: Record<string, unknown> = {}): NotificationDTO {
  return {
    id: "n1",
    key: "MSG-session_changed",
    payload: { title: "ورشة ثلاثة أيام", startsAt: "2026-10-01T15:00:00Z", changes, ...extra },
    sessionId: "s1",
    readAt: null,
    createdAt: "2026-09-17T10:00:00Z",
  };
}

/** The whole change line, by the label inside it.
 *
 *  Every value is wrapped in `<bdi>` (`tests/unit/notify-i18n.test.ts` requires
 *  it), so `getByText` returns the innermost `<bdi>` rather than the sentence —
 *  the line is its enclosing `<li>`. */
function line(label: RegExp): string {
  const node = screen.getByText(label).closest("li");
  expect(node, `no change line contains ${label}`).not.toBeNull();
  return node!.textContent ?? "";
}

async function renderList(items: NotificationDTO[]) {
  const element = await NotificationList({ items, timeZone: "Asia/Riyadh", locale: "ar" as Locale });
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );
}

describe("a change on a session with SEVERAL days", () => {
  it("★ names the day, in sessions' own words, and gives both values", async () => {
    await renderList([changed([{ field: "starts_at", from: DAY_2_WAS, to: DAY_2_IS, day: 2, days: 3 }])]);

    const text = line(/^الموعد$/);
    // «الموعد · اليوم الثاني» — the ordinal is `sessions.days.ordinal.2`.
    expect(text).toContain("اليوم الثاني");
    // Asia/Riyadh is UTC+3: 15:00Z is 6:00 م and 18:00Z is 9:00 م.
    expect(text).toContain("6:00");
    expect(text).toContain("9:00");
    // Never the raw instant, and never Arabic-Indic digits (DEC-124) — the
    // range is BUILT from codepoints rather than typed, because the rule
    // forbids those glyphs in any file, test and comment included.
    expect(text).not.toContain("2026-10-02T");
    expect(text).not.toMatch(ARABIC_INDIC);
  });

  it("a venue change prints the two places, not a date", async () => {
    await renderList([changed([{ field: "venue", from: "قاعة الابتكار", to: "قاعة التدريب", day: 3, days: 3 }])]);
    const text = line(/^المكان$/);
    expect(text).toContain("قاعة الابتكار");
    expect(text).toContain("قاعة التدريب");
    expect(text).toContain("اليوم الثالث");
  });

  it("a day added or removed reads as a change to the number of days, with no day of its own", async () => {
    await renderList([
      changed([
        { field: "days", from: 3, to: 4 },
        { field: "starts_at", from: DAY_2_WAS, to: DAY_2_IS, day: 2, days: 4 },
      ]),
    ]);
    const text = line(/^عدد الأيام$/);
    expect(text).toContain("3");
    expect(text).toContain("4");
    // The count entry carries no `day`, so it is not qualified by one.
    expect(text).not.toContain("اليوم");
  });

  it("the end of a day is announced too — at several days nothing else mentions it", async () => {
    await renderList([changed([{ field: "ends_at", from: DAY_2_WAS, to: DAY_2_IS, day: 1, days: 2 }])]);
    expect(line(/^الانتهاء$/)).toContain("اليوم الأول");
  });

  it("is axe-clean with the lines rendered", async () => {
    const { container } = await renderList([
      changed([
        { field: "starts_at", from: DAY_2_WAS, to: DAY_2_IS, day: 2, days: 3 },
        { field: "venue", from: "قاعة الابتكار", to: "قاعة التدريب", day: 2, days: 3 },
      ]),
    ]);
    expect((await axe.run(container)).violations).toEqual([]);
  });
});

describe("★ a change on a ONE-day session — the card does not move", () => {
  it("renders no change line at all when the entries carry no day", async () => {
    // Exactly what `sessions_notify()` has written since M3: `day` and `days`
    // absent. `REQ-SES-018`'s first rule — a session with one day has no day
    // concept anywhere.
    await renderList([changed([{ field: "starts_at", from: DAY_2_WAS, to: DAY_2_IS }])]);

    expect(screen.getByText("ورشة ثلاثة أيام")).toBeInTheDocument();
    expect(screen.queryByText(/^الموعد$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/اليوم/)).not.toBeInTheDocument();
  });

  it("and none when `days` is 1, which is the same fact spelt out", async () => {
    await renderList([changed([{ field: "starts_at", from: DAY_2_WAS, to: DAY_2_IS, day: 1, days: 1 }])]);
    expect(screen.queryByText(/^الموعد$/)).not.toBeInTheDocument();
  });

  it("a card with no `changes` at all is untouched — every other message in the matrix", async () => {
    await renderList([
      { id: "n2", key: "MSG-rsvp_confirmed", payload: { title: "جلسة" }, sessionId: "s1", readAt: null, createdAt: "2026-09-17T10:00:00Z" },
    ]);
    expect(screen.getByText("جلسة")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /تغيّر/ })).not.toBeInTheDocument();
  });
});
