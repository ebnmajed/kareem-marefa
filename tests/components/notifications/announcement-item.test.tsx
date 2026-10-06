// REQ-ADM-025 (DEC-267) — an announcement in the inbox: the catalogue's title, and the admin's own text as its
// detail line, isolated in <bdi>. It has no session, so nothing offers to open one.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import arNotifications from "@/messages/ar/notifications.json";
import arSessions from "@/messages/ar/sessions.json";
import type { Locale } from "@/i18n/routing";

const messages = { ...arNotifications, ...arSessions };
vi.mock("@/app/[locale]/app/me/notifications/actions", () => ({ openNotificationAction: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "notifications" }),
}));

const { InboxItem } = await import("@/components/notifications/inbox-item");

describe("MSG-announcement_published in the inbox", () => {
  it("reads «إعلان جديد» with the text beneath it, and no «open the session»", async () => {
    const element = await InboxItem({
      item: { id: "n1", key: "MSG-announcement_published", payload: { announcement_id: "a1", body: "يُفتتح المختبر يوم الأحد" }, sessionId: null, readAt: null, createdAt: "2026-10-06T10:00:00Z" },
      group: "older",
      timeZone: "Asia/Riyadh",
      locale: "ar" as Locale,
    });
    render(<NextIntlClientProvider locale="ar" messages={messages}>{element}</NextIntlClientProvider>);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("إعلان جديد");
    const detail = screen.getByText("يُفتتح المختبر يوم الأحد");
    expect(detail.tagName).toBe("BDI");
    expect(screen.queryByText(arNotifications.notifications.inbox.openSession)).toBeNull();
  });
});
