// SCR-058 · /app/admin/emails on the M9 system (wave 8, K6) — what it does
// today: the catalogue with `08` §1's matrix, the editor with the trigger's
// refusal at the field and a confirmed restore, and the delivery log with its
// reasons. Not the email studio.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { formStateFrom, withErrors } from "@/lib/form-state";
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
}));
const actions = { saveEmailTemplate: vi.fn(), restoreDefaultTemplate: vi.fn() };
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
  templates: [{ id: "t1", key: "MSG-session_cancelled", channel: "email", locale: "ar", subject: "أُلغيت الجلسة", body: "نأسف", requiredFields: ["title"], updatedAt: "2026-09-10T09:00:00Z" }],
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

  it("the catalogue lists every email message with the matrix: channels, whether a member can switch it off, and whose template", async () => {
    const { container } = await renderPage({});
    const rows = cards(container);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("يمكن للعضو إيقافها");
    expect(rows[0]).toHaveTextContent("الافتراضي");
    expect(rows[1]).toHaveTextContent("تصل دائمًا");
    expect(rows[1]).toHaveTextContent("قالب المؤسسة");
    expect(screen.queryByText(/تعذّر إرسال/)).toBeNull();
  });

  it("a failure in the last seven days is said at the top, with the way to it", async () => {
    await renderPage({}, 3);
    expect(screen.getByText((_, el) => el?.tagName === "P" && (el.textContent ?? "").startsWith("تعذّر إرسال 3 رسائل خلال آخر سبعة أيام."))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "اعرض الإخفاقات" })).toHaveAttribute("href", "/ar/app/admin/emails?view=log&status=failed");
  });

  it("★ the editor: the trigger's refusal at the body, naming the field, with what was typed kept", async () => {
    actions.saveEmailTemplate.mockImplementation(async (_l: string, previous: never, formData: FormData) => {
      const refused = withErrors(formStateFrom<string>(formData, { fields: ["key", "subject", "body", "requiredFields"], previous }), { body: "missingRequiredField" });
      return { ...refused, values: { ...refused.values, missingField: "title" }, saved: false };
    });
    const { container } = await renderPage({ key: "MSG-reminder_1d" });
    // Named by what it is, not by the member's «غدًا».
    expect(screen.getByRole("heading", { name: "قالب «تذكير قبل الجلسة بيوم»", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("تصل هذه الرسالة بالقالب الافتراضي، ونصه لا يظهر هنا بعد: قالب المؤسسة يُكتب من البداية.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("الموضوع مطلوب"), { target: { value: "جلستك غدًا" } });
    fireEvent.change(screen.getByLabelText("النص مطلوب"), { target: { value: "مرحبًا" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("النص مطلوب")).toHaveAccessibleDescription(/النص والموضوع لا يحتويان على الحقل title\./);
    expect(screen.getByLabelText("النص مطلوب")).toHaveValue("مرحبًا");
    expect(screen.getByLabelText("الموضوع مطلوب")).toHaveValue("جلستك غدًا");
  });

  it("restoring the default confirms, naming the message and saying the template cannot be recovered", async () => {
    actions.restoreDefaultTemplate.mockResolvedValue(undefined);
    await renderPage({ key: "MSG-session_cancelled" });
    fireEvent.click(screen.getByRole("button", { name: "استعد القالب الافتراضي" }));
    const confirm = await screen.findByRole("dialog");
    expect(confirm).toHaveTextContent("لا يمكن استرجاع قالبك بعد ذلك");
    fireEvent.click(within(confirm).getByRole("button", { name: "احذف قالب المؤسسة" }));
    await waitFor(() => expect(actions.restoreDefaultTemplate).toHaveBeenCalledWith("ar", "t1"));
  });

  it("the delivery log: the failure's reason in words, and the provider's own beneath", async () => {
    const { container } = await renderPage({ view: "log" }, 1);
    const [row] = cards(container);
    expect(row).toHaveTextContent("فشلت");
    expect(row).toHaveTextContent("رفض مزوّد البريد الرسالة.");
    expect(row).toHaveTextContent("resend 422");
    expect(row).toHaveTextContent("سارة العتيبي");
    expect(dal.listDeliveryLog).toHaveBeenCalledWith("ar", { status: "failed", before: undefined });
  });

  it("no failures: the empty log says so and offers every message", async () => {
    await renderPage({ view: "log" }, 0);
    expect(screen.getByText("لا إخفاقات — خرجت كل الرسائل")).toBeInTheDocument();
  });

  it("has no axe violations — catalogue, editor and log", async () => {
    for (const query of [{}, { key: "MSG-session_cancelled" }, { view: "log" }] as Record<string, string>[]) {
      const { container, unmount } = await renderPage(query, 1);
      const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
      unmount();
    }
  }, 45000);
});
