// SCR-058 · /app/admin/emails — the gallery rebuilt in wave 23 (REQ-UIX-112, DEC-238 §4) and the delivery log kept
// as it was (REQ-NTF-008). ★ The log's two cases are unchanged. The catalogue case became the gallery's; the string
// editor's refusal and its restore left with the editor — the restore lives on the builder's bar now and is the
// builder's to prove (STATUS ledger).
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { DeliveryDTO, MatrixRow, TemplateCatalogue } from "@/lib/dal/notifications";
import adminAr from "@/messages/ar/admin.json";
import notificationsAr from "@/messages/ar/notifications.json";
import uiAr from "@/messages/ar/ui.json";

const messages = { ...adminAr, ...notificationsAr, ...uiAr };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/proposals", () => ({ getOrgPrefs: async () => ({ timeZone: "Asia/Riyadh", maxCoPresenters: 4 }) }));
vi.mock("@/lib/dal/notifications", () => ({
  getTemplateCatalogue: vi.fn(),
  countDeliveryFailures: vi.fn(),
  getNotificationMatrix: vi.fn(),
  listDeliveryLog: vi.fn(),
  // Wave 10: the page reads what each message key offers, so the properties
  // pane can LIST the fields rather than let one be typed (`REQ-NTF-012`).
  // A harness line — every case below is still about the string editor, which
  // this org's `blocks: null` template opens.
  getMessageBindings: vi.fn(async () => new Map([["MSG-session_cancelled", ["title", "startsAt", "reason", "url", "member.name", "org"]]])),
  // Wave 23: the gallery's «أُرسلت N مرة».
  countSentByKey: vi.fn(async () => new Map([["MSG-reminder_1d", 218], ["MSG-session_cancelled", 0]])),
}));
vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  redirect: (args: { href: string }) => {
    throw new Error(`NEXT_REDIRECT ${args.href}`);
  },
}));
// `convertTemplateToDesign` and `saveEmailDesign` are wave 10's: the page
// binds the first for an org that HAS a string override (§X9) and the second
// for a block template. Harness lines — no case below exercises either.
const actions = {
  restoreDefaultTemplate: vi.fn(),
  saveEmailDesign: vi.fn(),
  sendTestEmailAction: vi.fn(),
};
vi.mock("@/app/[locale]/app/admin/emails/actions", () => actions);
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "notifications" }),
  setRequestLocale: () => {},
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const dal = await import("@/lib/dal/notifications");
const { default: EmailsPage } = await import("@/app/[locale]/app/admin/emails/page");

const MATRIX: MatrixRow[] = [
  { key: "MSG-reminder_1d", category: "reminders", inApp: true, email: true, optional: true },
  { key: "MSG-session_cancelled", category: "my_sessions", inApp: true, email: true, optional: false },
  { key: "MSG-comment_reply", category: "social", inApp: true, email: false, optional: true },
];
const CATALOGUE: TemplateCatalogue = {
  // `blocks: null` is a STRING template — what this org has, and what every row
  // that existed before wave 10 is (`REQ-NTF-009`). The cases below are the
  // string editor's and are unchanged by the two fields.
  templates: [
    { id: "t1", key: "MSG-session_cancelled", channel: "email", locale: "ar", subject: "أُلغيت الجلسة", body: "نأسف", requiredFields: ["title"], blocks: null, sourceFamily: null, updatedAt: "2026-09-10T09:00:00Z" },
  ],
  emailMessages: ["MSG-reminder_1d", "MSG-session_cancelled"],
};
const failed: DeliveryDTO = {
  id: "d1",
  key: "MSG-reminder_1d",
  status: "failed",
  error: 'resend 422: {"message":"Invalid `to` field"}',
  createdAt: "2026-09-17T06:00:00Z",
  sentAt: null,
  member: { id: "m1", displayName: "سارة العتيبي" },
};

async function renderPage(query: Record<string, string>, failures = 0) {
  vi.mocked(dal.getTemplateCatalogue).mockResolvedValue(CATALOGUE);
  vi.mocked(dal.countDeliveryFailures).mockResolvedValue(failures);
  vi.mocked(dal.getNotificationMatrix).mockResolvedValue(MATRIX);
  vi.mocked(dal.listDeliveryLog).mockResolvedValue({ rows: failures > 0 ? [failed] : [], nextBefore: null });
  const page = await EmailsPage({ params: Promise.resolve({ locale: "ar" }), searchParams: Promise.resolve(query) });
  // The two views are async server components nested in the page: resolved first, as the server would.
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <main>{await resolveAsync(page)}</main>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

/** Awaits async server components in the tree, the way the server renders them. */
async function resolveAsync(node: React.ReactNode): Promise<React.ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveAsync));
  if (!node || typeof node !== "object" || !("props" in node)) return node;
  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  if (typeof element.type === "function" && element.type.constructor.name === "AsyncFunction") {
    return resolveAsync(await (element.type as (p: unknown) => Promise<React.ReactNode>)(element.props));
  }
  const children = element.props?.children;
  if (children === undefined) return element;
  return { ...element, props: { ...element.props, children: await resolveAsync(children) } } as React.ReactElement;
}

const cards = (container: HTMLElement) => within(container.querySelector("ul.space-y-3") as HTMLElement).getAllByRole("listitem");

describe("EmailsPage", () => {
  beforeEach(() => Object.values(actions).forEach((a) => a.mockReset()));


  it("★ the gallery: a card per email message — its name, whose design it wears, its kind, the matrix, and the send count", async () => {
    const { container } = await renderPage({});
    const list = screen.getByRole("list", { name: "رسائل البريد" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("تذكير قبل الجلسة بيوم");
    expect(items[0]).toHaveTextContent("التصميم الافتراضي");
    expect(items[0]).toHaveTextContent("يمكن للعضو إيقافها");
    expect(items[0]).toHaveTextContent("أُرسلت 218 مرة");
    expect(items[1]).toHaveTextContent("تصميم المؤسسة");
    expect(items[1]).toHaveTextContent("تصل دائمًا");
    expect(items[1]).toHaveTextContent("—");
    // Each card opens its builder, by key — the identifier is in the link, never in the words.
    expect(within(items[0]!).getByRole("link")).toHaveAttribute("href", "/ar/app/admin/emails/MSG-reminder_1d");
    expect(container.textContent).not.toContain("MSG-");
    expect(screen.getByRole("link", { name: "سجل الإرسال" })).toHaveAttribute("href", "/ar/app/admin/emails?view=log");
    expect(screen.getByRole("button", { name: "رسالة جديدة" })).toBeInTheDocument();
    expect(screen.queryByText(/تعذّر إرسال/)).toBeNull();
  });

  it("the category chips: «الكل» with the count, then each kind; one chosen shows its messages only", async () => {
    await renderPage({ category: "reminders" });
    const chips = screen.getByRole("group", { name: "أنواع الرسائل" });
    expect(within(chips).getAllByRole("link").map((a) => a.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("الكل")]));
    expect(within(screen.getByRole("list", { name: "رسائل البريد" })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("a link from before the builder — `?key=` — goes to the builder's own route", async () => {
    await expect(renderPage({ key: "MSG-reminder_1d" })).rejects.toThrow("NEXT_REDIRECT /app/admin/emails/MSG-reminder_1d");
  });

  it("a failure in the last seven days is said at the top, with the way to it", async () => {
    await renderPage({}, 3);
    expect(screen.getByText((_, el) => el?.tagName === "P" && (el.textContent ?? "").startsWith("تعذّر إرسال 3 رسائل خلال آخر سبعة أيام."))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "اعرض الإخفاقات" })).toHaveAttribute("href", "/ar/app/admin/emails?view=log&status=failed");
  });

  it("the delivery log: the failure's reason in words, and the provider's own beneath", async () => {
    const { container } = await renderPage({ view: "log" }, 1);
    const [row] = cards(container);
    expect(row).toHaveTextContent("فشلت");
    expect(row).toHaveTextContent("رفض مزوّد البريد الرسالة.");
    expect(row).toHaveTextContent("resend 422");
    expect(row).toHaveTextContent("سارة العتيبي");
    expect(row).not.toHaveTextContent("MSG-");
    expect(dal.listDeliveryLog).toHaveBeenCalledWith("ar", { status: "failed", before: undefined });
  });

  it("no failures: the empty log says so and offers every message", async () => {
    await renderPage({ view: "log" }, 0);
    expect(screen.getByText("لا إخفاقات — خرجت كل الرسائل")).toBeInTheDocument();
  });

  it("has no axe violations — the gallery and the log", async () => {
    for (const query of [{}, { view: "log" }] as Record<string, string>[]) {
      const { container, unmount } = await renderPage(query, 1);
      const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
      unmount();
    }
  }, 45000);
});
