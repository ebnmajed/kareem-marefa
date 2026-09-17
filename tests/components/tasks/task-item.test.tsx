// TaskItem — REQ-TSK-001/003/004. Real ar/tasks.json through
// NextIntlClientProvider; only src/components/tasks/actions.ts (the "use
// server" module) is mocked, the same pattern tests/components/event/
// comment-item.test.tsx uses for its own actions module — calling a real
// Server Action from jsdom would try to read cookies/hit Supabase.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/tasks.json";
import type { TaskSummary } from "@/lib/dal/tasks";

const toggleTaskCompletionAction = vi.fn().mockResolvedValue({ error: null });
const submitTaskFormResponseAction = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/components/tasks/actions", () => ({ toggleTaskCompletionAction, submitTaskFormResponseAction, createTaskAction: vi.fn() }));

const { TaskItem } = await import("@/components/tasks/task-item");

const sessionId = "11111111-1111-1111-1111-111111111111";
const checklistTask: TaskSummary = {
  id: "t1",
  kind: "checklist",
  title: "أحضر جهازك المحمول",
  description: null,
  materialId: null,
  formSchema: null,
  externalUrl: null,
  sortOrder: 0,
  completed: false,
  myFormResponse: null,
};

function renderTask(task: TaskSummary) {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <ul>
        <TaskItem locale="ar" sessionId={sessionId} task={task} />
      </ul>
    </NextIntlClientProvider>,
  );
}

describe("TaskItem", () => {
  it("★ REQ-TSK-004: marking a checklist task done calls the action with completed=true", async () => {
    renderTask(checklistTask);
    fireEvent.click(screen.getByRole("button", { name: "أنجزتها" }));
    await waitFor(() => expect(toggleTaskCompletionAction).toHaveBeenCalledWith("ar", sessionId, "t1", true));
  });

  it("shows the undo affordance and the completed badge once already completed", () => {
    renderTask({ ...checklistTask, completed: true });
    expect(screen.getByText("أُنجزت")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "التراجع عن الإنجاز" })).toBeInTheDocument();
  });

  it("★ REQ-TSK-003: submitting a form task calls the action with every field keyed by its id, and never shows a separate mark-done toggle", async () => {
    const formTask: TaskSummary = {
      ...checklistTask,
      id: "t2",
      kind: "form",
      title: "استبيان ما قبل الجلسة",
      formSchema: [{ id: "q1", label: "ما توقعك من الجلسة؟", type: "text" }],
    };
    renderTask(formTask);
    expect(screen.queryByRole("button", { name: "أنجزتها" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("ما توقعك من الجلسة؟"), { target: { value: "أتوقع الكثير" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }));
    await waitFor(() => expect(submitTaskFormResponseAction).toHaveBeenCalledWith("ar", sessionId, "t2", { q1: "أتوقع الكثير" }));
  });
});
