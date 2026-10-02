// SCR-026, the inbox page — REQ-UIX-076, REQ-NTF-006, kept behaviours N1 – N16 (`docs/plan/notes/notify.md` §W2).
// Mocked DAL, real messages; the lead's frame is stubbed to the page's heading.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import arNotifications from "@/messages/ar/notifications.json";
import arSessions from "@/messages/ar/sessions.json";
import type { InboxPage, NotificationDTO } from "@/lib/dal/notifications";

const messages = { ...arNotifications, ...arSessions };

vi.mock("@/lib/dal/notifications", () => ({ listInbox: vi.fn(), getUnreadCount: vi.fn() }));
vi.mock("@/app/[locale]/app/me/notifications/actions", () => ({ markAllNotificationsRead: vi.fn(), openNotificationAction: vi.fn() }));
vi.mock("@/components/shell/hub-top-row", () => ({ HubTopRow: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/shell/hub-strip", () => ({ HubStrip: () => null }));
vi.mock("@/components/notifications/unread-filter", () => ({
  UnreadFilter: ({ checked, label }: { checked: boolean; label: string }) => (
    <label>
      <input type="checkbox" name="unread" defaultChecked={checked} />
      {label}
    </label>
  ),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "notifications" }),
  setRequestLocale: () => {},
}));

const { listInbox, getUnreadCount } = await import("@/lib/dal/notifications");
const { default: NotificationsPage } = await import("@/app/[locale]/app/me/notifications/page");

const now = new Date();
const item = (over: Partial<NotificationDTO> = {}): NotificationDTO => ({
  id: "n1",
  key: "MSG-rsvp_confirmed",
  payload: { title: "جلسة" },
  sessionId: "s1",
  readAt: null,
  createdAt: now.toISOString(),
  ...over,
});

/** Render the page. Its items are async server components, so each one is awaited the way the RSC pipeline would. */
async function renderPage(page: Partial<InboxPage>, unread: number, searchParams: Record<string, string> = {}) {
  vi.mocked(listInbox).mockResolvedValue({ items: [], timeZone: "Asia/Riyadh", nextCursor: null, ...page });
  vi.mocked(getUnreadCount).mockResolvedValue(unread);
  const element = await NotificationsPage({ params: Promise.resolve({ locale: "ar" }), searchParams: Promise.resolve(searchParams) });
  return render(<NextIntlClientProvider locale="ar" messages={messages}>{await resolve(element)}</NextIntlClientProvider>);
}

/** Await every async component in a tree, as the server would before sending it. */
async function resolve(node: unknown): Promise<React.ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolve)) as Promise<React.ReactNode>;
  if (!node || typeof node !== "object" || !("props" in node)) return node as React.ReactNode;
  const el = node as React.ReactElement<{ children?: unknown }>;
  if (typeof el.type === "function" && el.type.constructor.name === "AsyncFunction") {
    return resolve(await (el.type as (p: unknown) => Promise<unknown>)(el.props));
  }
  const children = el.props.children === undefined ? undefined : await resolve(el.props.children);
  return children === undefined ? el : { ...el, props: { ...el.props, children } };
}

describe("NotificationsPage", () => {
  it("the empty inbox is an announced status with somewhere to go (was notification-list.test's first case)", async () => {
    await renderPage({}, 0);
    expect(screen.getAllByRole("status").some((s) => s.textContent?.includes("لا إشعارات بعد"))).toBe(true);
    expect(screen.getByRole("link", { name: "تصفّح الجلسات" })).toBeInTheDocument();
  });

  it("with nothing unread, «لا شيء غير مقروء» replaces mark-all; the filtered empty list offers «عرض الكل»", async () => {
    await renderPage({}, 0, { unread: "1" });
    expect(screen.queryByRole("button", { name: "تعليم الكل كمقروء" })).not.toBeInTheDocument();
    expect(screen.getAllByText("لا شيء غير مقروء").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "عرض الكل" })).toBeInTheDocument();
  });

  it("offers mark-all while something is unread, and «ما يصلني» opens the settings — no preference on this page", async () => {
    await renderPage({ items: [item()] }, 1);
    expect(screen.getByRole("button", { name: "تعليم الكل كمقروء" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ما يصلني/ }).getAttribute("href")).toMatch(/\/app\/me\/settings$/);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText("يصلك دائمًا")).not.toBeInTheDocument();
  });

  it("groups items by their own day under a heading each", async () => {
    const old = new Date(now.getTime() - 40 * 86_400_000).toISOString();
    await renderPage({ items: [item(), item({ id: "n2", createdAt: old })] }, 2);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe("اليوم");
    expect(headings.at(-1)).toBe("أقدم");
    expect(within(screen.getByRole("region", { name: "أقدم" })).getAllByRole("article")).toHaveLength(1);
  });

  it("«عرض الأقدم» carries the cursor, and the filter with it", async () => {
    await renderPage({ items: [item()], nextCursor: "abc" }, 1, { unread: "1" });
    const href = screen.getByRole("link", { name: "عرض الأقدم" }).getAttribute("href")!;
    expect(href).toContain("before=abc");
    expect(href).toContain("unread=1");
  });

  it("a failed action says so as an alert", async () => {
    await renderPage({}, 0, { error: "inbox" });
    expect(screen.getByRole("alert")).toHaveTextContent("تعذّر تنفيذ الطلب");
  });

  it("is axe-clean with items", async () => {
    const { container } = await renderPage({ items: [item(), item({ id: "n2", readAt: now.toISOString(), sessionId: null })] }, 1);
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
