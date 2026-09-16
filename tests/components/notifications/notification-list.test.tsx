// `NotificationList` — SCR-026, REQ-NTF-006. Same pattern as
// points-history-list.test.tsx: an async server component, awaited
// directly rather than rendered as a nested JSX child (react-dom's plain
// client renderer, which is what RTL drives here, cannot resolve a Promise
// returned by an async component invoked as a normal JSX element — that is
// an RSC-pipeline behaviour this test does not have, which is why the page
// itself is not rendered this way; see `wave7-content-*.spec.ts` for the
// integration level).
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/notifications.json";
import type { Locale } from "@/i18n/routing";
import type { NotificationDTO } from "@/lib/dal/notifications";

vi.mock("@/app/[locale]/app/me/notifications/actions", () => ({ markNotificationRead: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "notifications" }),
}));

const { NotificationList } = await import("@/components/notifications/notification-list");

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

async function renderList(items: NotificationDTO[]) {
  const element = await NotificationList({ items, timeZone: "Asia/Riyadh", locale: "ar" as Locale });
  return render(<NextIntlClientProvider locale="ar" messages={ar}>{element}</NextIntlClientProvider>);
}

describe("NotificationList", () => {
  it("shows the empty inbox as an announced status", async () => {
    await renderList([]);
    expect(screen.getByRole("status")).toHaveTextContent("لا إشعارات بعد");
  });

  it("marks an unread notification with its own badge, a bidi-isolated title, and a mark-read control", async () => {
    await renderList([notification()]);
    expect(screen.getByText("غير مقروء")).toBeInTheDocument();
    expect(screen.getByText("جلسة الاختبار").closest("bdi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تعليم كمقروء" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "فتح الجلسة" })).toHaveAttribute("href", "/ar/app/sessions/s1");
  });

  it("gives a read notification neither the badge nor the control", async () => {
    await renderList([notification({ readAt: "2026-09-11T00:00:00Z" })]);
    expect(screen.queryByText("غير مقروء")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تعليم كمقروء" })).not.toBeInTheDocument();
  });

  it("falls back to no title line when the payload carries none, never the raw payload", async () => {
    await renderList([notification({ payload: {} })]);
    expect(screen.getByText("تغيّرت تفاصيل جلسة حجزت فيها")).toBeInTheDocument();
  });

  it("is axe-clean with a mixed inbox", async () => {
    const { container } = await renderList([notification(), notification({ id: "n2", readAt: "2026-09-11T00:00:00Z" })]);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
