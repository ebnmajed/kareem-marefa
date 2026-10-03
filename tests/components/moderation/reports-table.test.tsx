// SCR-050/052's table (REQ-UIX-103, REQ-EVT-014, REQ-UIX-013) — the deleted comment-report card's five cases carried
// against the table that replaced it (notes/content.md W22.8), and what the rebuild adds: one row per comment with
// every report on it, the comment quoted whole in the dialog, no reason owed for a comment already deleted, and the
// closed list showing the outcome and who decided.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { ReportsTable } from "@/app/[locale]/app/admin/moderation/reports/_components/reports-table";
import type { ModerationState } from "@/app/[locale]/app/admin/moderation/state";
import type { CommentReportRow, ReportState } from "@/lib/dal/admin-moderation";
import admin from "@/messages/ar/admin.json";
import event from "@/messages/ar/event.json";
import ui from "@/messages/ar/ui.json";

const messages = { ...admin, ...event, ...ui };

const person = (memberId: string, name: string) => ({ memberId, name, avatarUrl: null, teamColor: null });

const row = (over: Partial<CommentReportRow> = {}): CommentReportRow => ({
  commentId: "c1",
  reportId: "r1",
  body: "هذا الكلام لا يصلح لجلسة عمل، وفيه إساءة واضحة لأحد الحضور",
  deleted: false,
  author: person("m1", "خالد الغامدي"),
  sessionId: "s1",
  sessionTitle: "العرض في 5 شرائح",
  reports: [
    { reporter: person("m2", "ريم الشهري"), reason: "إساءة" },
    { reporter: person("m3", "نورة العتيبي"), reason: "لغة غير لائقة" },
  ],
  ageDays: 3,
  decision: null,
  ...over,
});

type Remove = (reportId: string, prev: ModerationState, fd: FormData) => Promise<ModerationState>;
type Dismiss = (reportId: string) => Promise<ModerationState>;

function mount({
  rows = [row()],
  state = "open",
  remove = vi.fn<Remove>(),
  dismiss = vi.fn<Dismiss>(),
}: { rows?: CommentReportRow[]; state?: ReportState; remove?: Remove; dismiss?: Dismiss } = {}) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ReportsTable rows={rows} state={state} remove={remove} dismiss={dismiss} />
    </NextIntlClientProvider>,
  );
}

const done: ModerationState = { error: null, done: true };

describe("ReportsTable — open", () => {
  it("one row per comment: the excerpt and its author, the session, the first reporter with +1, the reason, the age", () => {
    mount();
    const table = screen.getAllByRole("table")[0] ?? document.body;
    expect(within(table).getAllByText(/هذا الكلام لا يصلح/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("خالد الغامدي").length).toBeGreaterThan(0);
    expect(screen.getAllByText("العرض في 5 شرائح").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ريم الشهري").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3 أيام").length).toBeGreaterThan(0);
  });

  it("the content links to the comment's place on the event page", () => {
    mount();
    const link = screen.getAllByRole("link", { name: /هذا الكلام لا يصلح/ })[0];
    expect(link.getAttribute("href")).toMatch(/\/app\/sessions\/s1#discussion$/);
  });

  it("«تجاهل» decides in one press, with no dialog", async () => {
    const dismiss = vi.fn<Dismiss>().mockResolvedValue(done);
    mount({ dismiss });
    await userEvent.click(screen.getAllByRole("button", { name: /^تجاهل — / })[0]);
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith("r1"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("★ «أزل» opens a dialog naming the session, quoting the comment whole with every report, and the reason travels", async () => {
    const remove = vi.fn<Remove>().mockResolvedValue(done);
    mount({ remove });
    await userEvent.click(screen.getAllByRole("button", { name: /^أزل — / })[0]);
    const dialog = await screen.findByRole("dialog", { name: "إزالة تعليق من «العرض في 5 شرائح»؟" });
    expect(within(dialog).getByText("هذا الكلام لا يصلح لجلسة عمل، وفيه إساءة واضحة لأحد الحضور")).toBeInTheDocument();
    expect(within(dialog).getByText("لغة غير لائقة")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("السبب — يُسجَّل في سجل التدقيق", { exact: false }), "لغة مسيئة");
    await userEvent.click(within(dialog).getByRole("button", { name: "أزل" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(remove.mock.calls[0][0]).toBe("r1");
    expect((remove.mock.calls[0][2] as FormData).get("reason")).toBe("لغة مسيئة");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("cancelling never calls the action", async () => {
    const remove = vi.fn<Remove>();
    mount({ remove });
    await userEvent.click(screen.getAllByRole("button", { name: /^أزل — / })[0]);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "تراجع" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(remove).not.toHaveBeenCalled();
  });

  it("a missing reason is said at the field, and the dialog stays open", async () => {
    const remove = vi.fn<Remove>().mockResolvedValue({ error: "reason_required", done: false });
    mount({ remove });
    await userEvent.click(screen.getAllByRole("button", { name: /^أزل — / })[0]);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "أزل" }));
    expect(await within(dialog).findByText("اكتب السبب أولًا.")).toBeVisible();
    expect(dialog).toBeVisible();
  });

  it("a comment its author already deleted says so in the row, and owes no reason", async () => {
    const remove = vi.fn<Remove>().mockResolvedValue(done);
    mount({ rows: [row({ deleted: true })], remove });
    expect(screen.getAllByText("محذوف").length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole("button", { name: /^أزل — / })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText("السبب — يُسجَّل في سجل التدقيق", { exact: false })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "أزل" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
  });

  it("has no axe violations, closed or with the dialog open", async () => {
    const { container } = mount();
    const rules = { rules: { "color-contrast": { enabled: false } } };
    expect((await axe.run(container, rules)).violations).toEqual([]);
    await userEvent.click(screen.getAllByRole("button", { name: /^أزل — / })[0]);
    await screen.findByRole("dialog");
    expect((await axe.run(container, rules)).violations).toEqual([]);
  }, 20000);
});

describe("ReportsTable — closed", () => {
  it("shows the outcome and who decided, and offers no decision", () => {
    mount({ state: "closed", rows: [row({ decision: { outcome: "removed", by: person("a1", "سلمى الحربي"), ageDays: 0 } })] });
    expect(screen.getAllByText("أُزيل").length).toBeGreaterThan(0);
    expect(screen.getAllByText("سلمى الحربي").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^أزل — / })).not.toBeInTheDocument();
  });

  it("an empty list says so", () => {
    mount({ state: "closed", rows: [] });
    expect(screen.getByText("لا بلاغات مغلقة")).toBeInTheDocument();
  });
});
