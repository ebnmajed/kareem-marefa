// REQ-SES-018/DEC-121, contract 7 — the grouped view at `days.length > 1`. New behaviour, new
// file (rule 4) — panel.test.tsx (the byte-identical proof at n <= 1) is untouched.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/tasks.json";
import sessionsAr from "@/messages/ar/sessions.json";
import type { TasksPageData } from "@/lib/dal/tasks";
import type { SessionDay } from "@/lib/dal/sessions";

vi.mock("@/lib/dal/tasks", () => ({ getTasksPageData: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    namespace === "sessions.days"
      ? createTranslator({ locale: "ar", messages: sessionsAr, namespace: "sessions.days" })
      : createTranslator({ locale: "ar", messages: ar, namespace: namespace as "tasks.list" }),
}));
vi.mock("@/components/tasks/actions", () => ({
  toggleTaskCompletionAction: vi.fn(),
  submitTaskFormResponseAction: vi.fn(),
  createTaskAction: vi.fn(),
  rescopeTaskAction: vi.fn().mockResolvedValue({ error: null }),
}));

const { getTasksPageData } = await import("@/lib/dal/tasks");
const { Tasks } = await import("@/components/tasks/panel");

const sessionId = "11111111-1111-1111-1111-111111111111";
const day1: SessionDay = { id: "d1", position: 1, startsAt: "2026-10-04T15:00:00Z", endsAt: "2026-10-04T17:00:00Z", checkInOpen: true, venue: null };
const day2: SessionDay = { id: "d2", position: 2, startsAt: "2026-10-05T15:00:00Z", endsAt: "2026-10-05T17:00:00Z", checkInOpen: true, venue: null };
const days = [day1, day2];

const sessionTask = {
  id: "t-session",
  kind: "checklist" as const,
  title: "أحضر جهازك المحمول",
  description: null,
  materialId: null,
  formSchema: null,
  externalUrl: null,
  sortOrder: 0,
  completed: false,
  myFormResponse: null,
  sessionDayId: null,
};
const day1Task = { ...sessionTask, id: "t-day1", title: "اقرأ الملف قبل اليوم الأول", sessionDayId: "d1" };

async function renderSlot(data: TasksPageData) {
  vi.mocked(getTasksPageData).mockResolvedValue(data);
  const element = await Tasks({ sessionId, memberId: "m1", locale: "ar" });
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      {element}
    </NextIntlClientProvider>,
  );
}

describe("Tasks slot, grouped (days.length > 1)", () => {
  it("shows the session's own content first, then day 1, under their own <h3>", async () => {
    await renderSlot({ tasks: [sessionTask, day1Task], canManage: false, materials: [], days, timeZone: "Asia/Riyadh" });
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings[0]).toBe("للورشة كاملة");
    expect(headings.some((h) => h?.includes("الأول"))).toBe(true);
    expect(screen.getByText("أحضر جهازك المحمول")).toBeInTheDocument();
    expect(screen.getByText("اقرأ الملف قبل اليوم الأول")).toBeInTheDocument();
  });

  it("a group with nothing in it is not rendered for a plain member", async () => {
    await renderSlot({ tasks: [day1Task], canManage: false, materials: [], days, timeZone: "Asia/Riyadh" });
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toHaveLength(1);
  });

  it("a manager sees every group's own header, including an empty one", async () => {
    await renderSlot({ tasks: [day1Task], canManage: true, materials: [], days, timeZone: "Asia/Riyadh" });
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
  });

  it("a plain member sees no scope chip; a manager sees one, opening a menu of every day", async () => {
    await renderSlot({ tasks: [day1Task], canManage: false, materials: [], days, timeZone: "Asia/Riyadh" });
    expect(screen.queryByText("▾")).not.toBeInTheDocument();

    await renderSlot({ tasks: [day1Task], canManage: true, materials: [], days, timeZone: "Asia/Riyadh" });
    const trigger = screen.getByText("▾").closest("summary")!;
    expect(trigger.closest("details")!.querySelectorAll("button")).toHaveLength(3);
  });
});
