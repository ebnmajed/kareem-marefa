// The `Tasks` slot — real ar/tasks.json through next-intl's createTranslator,
// only src/lib/dal/tasks.ts mocked.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/tasks.json";
import type { TasksPageData } from "@/lib/dal/tasks";

vi.mock("@/lib/dal/tasks", () => ({ getTasksPageData: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "tasks.list" }),
}));
// TaskItem/CreateTaskForm are client components (they use `useTranslations`,
// not `getTranslations`) rendered inside this server component's tree —
// same reason tests/components/materials/list.test.tsx wraps its
// SettingsForm cases in NextIntlClientProvider.
vi.mock("@/components/tasks/actions", () => ({ toggleTaskCompletionAction: vi.fn(), submitTaskFormResponseAction: vi.fn(), createTaskAction: vi.fn() }));

const { getTasksPageData } = await import("@/lib/dal/tasks");
const { Tasks } = await import("@/components/tasks/panel");

const sessionId = "11111111-1111-1111-1111-111111111111";
const base: TasksPageData = { tasks: [], canManage: false, materials: [] };

async function renderSlot(data: TasksPageData) {
  vi.mocked(getTasksPageData).mockResolvedValue(data);
  const element = await Tasks({ sessionId, memberId: "m1", locale: "ar" });
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      {element}
    </NextIntlClientProvider>,
  );
}

describe("Tasks slot", () => {
  it("shows the empty state when the session has no tasks, and hides the create-task form from a plain member", async () => {
    await renderSlot({ ...base });
    expect(screen.getByText("لا توجد مهام تحضيرية لهذه الجلسة.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إضافة" })).not.toBeInTheDocument();
  });

  it("★ REQ-TSK-004: shows the count and the completed-of-them progress line", async () => {
    await renderSlot({
      tasks: [
        { id: "t1", kind: "checklist", title: "أحضر جهازك", description: null, materialId: null, formSchema: null, externalUrl: null, sortOrder: 0, completed: true, myFormResponse: null },
        { id: "t2", kind: "checklist", title: "اقرأ الملخص", description: null, materialId: null, formSchema: null, externalUrl: null, sortOrder: 1, completed: false, myFormResponse: null },
      ],
      canManage: false,
      materials: [],
    });
    expect(screen.getByText("مهمتان تحضيريتان")).toBeInTheDocument();
    // The count is now inside its own <bdi>, so the sentence spans multiple text nodes.
    expect(screen.getByText((_, el) => el?.textContent === "أنجزت 1 منها.")).toBeInTheDocument();
  });

  it("REQ-TSK-001: shows the create-task form to a presenter/admin", async () => {
    await renderSlot({ ...base, canManage: true });
    expect(screen.getByRole("button", { name: "إضافة" })).toBeInTheDocument();
  });

  it("shows the matching affordance per kind, and bidi-isolates the task title", async () => {
    await renderSlot({
      tasks: [
        { id: "t1", kind: "read_material", title: "اقرأ الشرائح", description: null, materialId: "mat1", formSchema: null, externalUrl: null, sortOrder: 0, completed: false, myFormResponse: null },
        { id: "t2", kind: "external", title: "ثبّت التطبيق", description: null, materialId: null, formSchema: null, externalUrl: "https://example.com", sortOrder: 1, completed: false, myFormResponse: null },
      ],
      canManage: false,
      materials: [],
    });
    const title = screen.getByText("اقرأ الشرائح");
    expect(title.closest("bdi")).not.toBeNull();
    expect(screen.getByRole("link", { name: "فتح المادة" })).toHaveAttribute("href", `/ar/app/sessions/${sessionId}/materials/mat1`);
    const externalLink = screen.getByRole("link", { name: "فتح الرابط — يغادر المنصة" });
    expect(externalLink).toHaveAttribute("href", "https://example.com");
    expect(externalLink).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});
