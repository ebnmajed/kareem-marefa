// The `Tasks` slot, rebuilt (DEC-208, DEC-209) — every case of the removed `panel`, `panel-grouping` and
// `task-item` suites re-asserted against the new files. Real `ar/tasks.json`; the DAL and the actions mocked.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/tasks.json";
import sessionsAr from "@/messages/ar/sessions.json";
import type { TaskSummary, TasksPageData } from "@/lib/dal/tasks";
import type { SessionDay } from "@/lib/dal/sessions";
import { ToastProvider } from "@/components/ui/toast";

vi.mock("@/lib/dal/tasks", () => ({ getTasksPageData: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    namespace === "sessions.days"
      ? createTranslator({ locale: "ar", messages: sessionsAr, namespace: "sessions.days" })
      : createTranslator({ locale: "ar", messages: ar, namespace: namespace as "tasks.list" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/tasks/actions", () => ({
  toggleTaskCompletionAction: vi.fn().mockResolvedValue({ error: null }),
  submitTaskFormResponseAction: vi.fn().mockResolvedValue({ error: null }),
  createTaskAction: vi.fn(),
  rescopeTaskAction: vi.fn().mockResolvedValue({ error: null }),
}));

const { getTasksPageData } = await import("@/lib/dal/tasks");
const actions = await import("@/components/tasks/actions");
const { Tasks, tasksSummary } = await import("@/components/tasks/panel");

const sessionId = "11111111-1111-1111-1111-111111111111";
const base: TasksPageData = { tasks: [], canManage: false, materials: [] };
const task = (over: Partial<TaskSummary>): TaskSummary => ({
  id: "t1", kind: "checklist", title: "أحضر جهازك المحمول", description: null, materialId: null, formSchema: null, externalUrl: null,
  sortOrder: 0, completed: false, myFormResponse: null, ...over,
});
const day = (n: number): SessionDay => ({ id: `d${n}`, position: n, startsAt: `2026-10-0${n}T15:00:00Z`, endsAt: `2026-10-0${n}T17:00:00Z`, checkInOpen: false, venue: null });

async function renderSlot(data: TasksPageData) {
  vi.mocked(getTasksPageData).mockResolvedValue(data);
  const element = await Tasks({ sessionId, memberId: "m1", locale: "ar" });
  return render(
    <NextIntlClientProvider locale="ar" messages={{ ...ar, ...sessionsAr }}>
      <ToastProvider closeLabel="إغلاق">
        <div data-testid="slot">{element}</div>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("Tasks slot — rebuilt", () => {
  it("renders null for a plain member with no tasks", async () => {
    await renderSlot(base);
    expect(screen.getByTestId("slot")).toBeEmptyDOMElement();
  });

  it("a presenter with nothing yet sees the empty line and the create form (REQ-TSK-001)", async () => {
    await renderSlot({ ...base, canManage: true });
    expect(screen.getByText("لا توجد مهام تحضيرية لهذه الجلسة.")).toBeInTheDocument();
    expect(screen.getByLabelText("عنوان المهمة", { exact: false })).toBeInTheDocument();
  });

  it("renders no heading of its own at one day — the heading row's «N من M» is the page's", async () => {
    await renderSlot({ ...base, tasks: [task({})] });
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("★ REQ-TSK-001: each kind its own affordance, the title bidi-isolated", async () => {
    await renderSlot({
      ...base,
      tasks: [
        task({ id: "c", kind: "checklist" }),
        task({ id: "r", kind: "read_material", title: "اقرأ النموذج", materialId: "mat1" }),
        task({ id: "e", kind: "external", title: "ثبّت البرنامج", externalUrl: "https://example.test/app" }),
        task({ id: "f", kind: "form", title: "استبيان قصير", formSchema: [{ id: "q1", label: "ما توقعك؟", type: "text" }] }),
      ],
    });
    expect(screen.getByRole("checkbox", { name: /أحضر جهازك المحمول/ })).toBeInTheDocument();
    expect(screen.getByText("أحضر جهازك المحمول").tagName).toBe("BDI");
    expect(screen.getByRole("link", { name: "فتح المادة" })).toHaveAttribute("href", expect.stringContaining(`/app/sessions/${sessionId}/materials/mat1`));
    const out = screen.getByRole("link", { name: "فتح الرابط — يغادر المنصة" });
    expect(out).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByLabelText("ما توقعك؟")).toBeInTheDocument();
  });

  it("★ REQ-TSK-004: ticking a checklist task calls the action with completed=true, optimistically", async () => {
    await renderSlot({ ...base, tasks: [task({})] });
    const box = screen.getByRole("checkbox", { name: /أحضر جهازك/ });
    await userEvent.click(box);
    expect(actions.toggleTaskCompletionAction).toHaveBeenCalledWith("ar", sessionId, "t1", true);
  });

  it("a completed task shows as ticked, and un-ticking undoes it", async () => {
    await renderSlot({ ...base, tasks: [task({ completed: true })] });
    const box = screen.getByRole("checkbox", { name: /أحضر جهازك/ });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(actions.toggleTaskCompletionAction).toHaveBeenCalledWith("ar", sessionId, "t1", false);
  });

  it("a failed toggle says so at the row", async () => {
    vi.mocked(actions.toggleTaskCompletionAction).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await renderSlot({ ...base, tasks: [task({})] });
    await userEvent.click(screen.getByRole("checkbox", { name: /أحضر جهازك/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذّر تسجيل ذلك. حاول مرة أخرى.");
  });

  it("★ REQ-TSK-003/004: a form task is completed by submitting it — every field keyed by its id — and has no checkbox", async () => {
    await renderSlot({ ...base, tasks: [task({ id: "f", kind: "form", title: "استبيان", formSchema: [{ id: "q1", label: "سؤال", type: "text" }] })] });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("سؤال"), { target: { value: "جواب" } });
    await userEvent.click(screen.getByRole("button", { name: "إرسال" }));
    await waitFor(() => expect(actions.submitTaskFormResponseAction).toHaveBeenCalledWith("ar", sessionId, "f", { q1: "جواب" }));
    expect(await screen.findByText("تم إرسال إجابتك.")).toBeInTheDocument();
  });

  it("is accessible with every kind showing", async () => {
    const { container } = await renderSlot({
      ...base,
      canManage: true,
      tasks: [task({}), task({ id: "e", kind: "external", externalUrl: "https://example.test" }), task({ id: "f", kind: "form", formSchema: [{ id: "q", label: "س", type: "textarea" }] })],
    });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });

  describe("summary", () => {
    it("carries this viewer's outstanding count, for the action card and the heading row", async () => {
      vi.mocked(getTasksPageData).mockResolvedValue({ ...base, tasks: [task({}), task({ id: "t2", completed: true })] });
      expect(await tasksSummary({ sessionId, memberId: "m1", locale: "ar" })).toEqual({ visible: true, count: 2, outstanding: 1 });
    });
    it("is NOT visible for a plain member with nothing — exactly when the slot returns null", async () => {
      vi.mocked(getTasksPageData).mockResolvedValue(base);
      expect((await tasksSummary({ sessionId, memberId: "m1", locale: "ar" })).visible).toBe(false);
    });
  });

  describe("more than one day", () => {
    const grouped = { ...base, days: [day(1), day(2)], timeZone: "Asia/Riyadh" };
    it("the session's own tasks first, then each day, under their own <h3>; an empty group hidden from a member", async () => {
      await renderSlot({ ...grouped, tasks: [task({ id: "a", sessionDayId: "d1" }), task({ id: "b", title: "للجلسة", sessionDayId: null })] });
      const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
      expect(headings[0]).toBe(sessionsAr.sessions.days.sessionScope);
      expect(headings).toHaveLength(2);
    });
    it("a manager sees every group, each with its own closed add control, and no open form", async () => {
      await renderSlot({ ...grouped, canManage: true });
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
      for (const d of screen.getByTestId("slot").querySelectorAll("details")) expect(d).not.toHaveAttribute("open");
    });
    it("the header control opens exactly its own group's form and moves focus into it", async () => {
      await renderSlot({ ...grouped, canManage: true });
      const details = [...screen.getByTestId("slot").querySelectorAll("details")];
      await userEvent.click(details[2]!.querySelector("summary")!);
      fireEvent(details[2]!, new Event("toggle"));
      expect(details[2]).toHaveAttribute("open");
      expect(details[0]).not.toHaveAttribute("open");
      expect(details[2]!.contains(document.activeElement)).toBe(true);
    });
    it("a plain member sees no scope chip; a manager sees one", async () => {
      const { unmount } = await renderSlot({ ...grouped, tasks: [task({ sessionDayId: "d1" })] });
      expect(screen.queryByRole("button", { name: /تغيير نطاق المهمة/ })).not.toBeInTheDocument();
      unmount();
      await renderSlot({ ...grouped, canManage: true, tasks: [task({ sessionDayId: "d1" })] });
      expect(within(screen.getByTestId("slot")).getByRole("button", { name: /تغيير نطاق المهمة/ })).toBeInTheDocument();
    });
    it("a plain member with nothing yet sees nothing at all", async () => {
      await renderSlot(grouped);
      expect(screen.getByTestId("slot")).toBeEmptyDOMElement();
    });
  });
});
