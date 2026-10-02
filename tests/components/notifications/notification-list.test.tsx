// An inbox item — SCR-026, REQ-NTF-006, REQ-UIX-076. An async server component, awaited directly (react-dom's client
// renderer, which RTL drives, cannot resolve an async component nested as JSX).
//
// ★ Wave 20 (DEC-208, ledger): `NotificationList` was deleted with SCR-026's page, and its cards are `inbox-item.tsx`,
// drawn from `Notifications.dc.html`. The five cases carry over, each a ledger line:
//   · the empty inbox → `inbox-page.test.tsx` (the page owns the empty state now);
//   · unread: «غير مقروء» stays in the text (the badge became a dot + fill — the word is for AT, SC 1.4.1); the title
//     is still in <bdi>; ★ the per-item «تعليم كمقروء» beside «فتح الجلسة» became ONE form whose button opens the
//     session after marking it read (D7, DEC-218 §2.4) — the link «فتح الجلسة» is a button in a form now;
//   · read: no unread word, and — new — a read item WITH a session keeps «فتح الجلسة»; one without has no control;
//   · no payload title → no title line, never the raw payload (unchanged);
//   · axe (unchanged).
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import arNotifications from "@/messages/ar/notifications.json";
import arSessions from "@/messages/ar/sessions.json";
import type { Locale } from "@/i18n/routing";
import type { NotificationDTO } from "@/lib/dal/notifications";
import type { InboxGroup } from "@/components/notifications/inbox-groups";

const messages = { ...arNotifications, ...arSessions };

vi.mock("@/app/[locale]/app/me/notifications/actions", () => ({ openNotificationAction: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "notifications" }),
}));

const { InboxItem } = await import("@/components/notifications/inbox-item");

function notification(overrides: Partial<NotificationDTO> = {}): NotificationDTO {
  return {
    id: "n1",
    key: "MSG-session_changed",
    payload: { title: "جلسة الاختبار" },
    sessionId: "s1",
    readAt: null,
    createdAt: "2026-09-10T10:00:00Z",
    ...overrides,
  };
}

async function renderItems(items: NotificationDTO[], group: InboxGroup = "older") {
  const elements = await Promise.all(items.map((item) => InboxItem({ item, group, timeZone: "Asia/Riyadh", locale: "ar" as Locale })));
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ul>
        {elements.map((element, i) => (
          <li key={i}>{element}</li>
        ))}
      </ul>
    </NextIntlClientProvider>,
  );
}

describe("InboxItem", () => {
  it("an unread item says so in words, isolates its title, and opens its session through one form", async () => {
    const { container } = await renderItems([notification()]);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("غير مقروء");
    expect(screen.getByText("جلسة الاختبار").closest("bdi")).toBeInTheDocument();
    const open = screen.getByRole("button", { name: "فتح الجلسة" });
    expect(open.closest("form")!.querySelector('input[type="hidden"][name="id"]')).toHaveAttribute("value", "n1");
    expect(container.querySelector("article")).toHaveAttribute("data-unread", "true");
    expect(screen.queryByRole("button", { name: "تعليم كمقروء" })).not.toBeInTheDocument();
  });

  it("an unread item with no session is marked read by its one control", async () => {
    await renderItems([notification({ key: "MSG-badge_earned", sessionId: null, payload: {} })]);
    expect(screen.getByRole("button", { name: "تعليم كمقروء" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "فتح الجلسة" })).not.toBeInTheDocument();
  });

  it("a read item carries no unread word; with a session it still opens it, without one it has no control", async () => {
    await renderItems([
      notification({ readAt: "2026-09-11T00:00:00Z" }),
      notification({ id: "n2", key: "MSG-badge_earned", sessionId: null, readAt: "2026-09-11T00:00:00Z", payload: {} }),
    ]);
    expect(screen.queryByText(/غير مقروء/)).not.toBeInTheDocument();
    const [withSession, without] = screen.getAllByRole("article");
    expect(within(withSession).getByRole("button", { name: "فتح الجلسة" })).toBeInTheDocument();
    expect(within(without).queryByRole("button")).not.toBeInTheDocument();
  });

  it("falls back to no title line when the payload carries none, never the raw payload", async () => {
    await renderItems([notification({ payload: {} })]);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("تغيّرت تفاصيل جلسة حجزت فيها");
    expect(screen.queryByText(/\{|\}/)).not.toBeInTheDocument();
  });

  it("shows a clock today, a weekday this week and a date before — in the org's zone", async () => {
    await renderItems([notification({ createdAt: "2026-09-10T15:00:00Z" })], "today");
    expect(screen.getByRole("article")).toHaveTextContent("6:00"); // 15:00Z is 6:00 م in Riyadh
  });

  it("is axe-clean with a mixed inbox", async () => {
    const { container } = await renderItems([notification(), notification({ id: "n2", readAt: "2026-09-11T00:00:00Z" })]);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
