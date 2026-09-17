// REQ-SES-018/DEC-121, contract 7 — the grouped view at `days.length > 1`. New behaviour, new
// file (rule 4) — panel.test.tsx (the byte-identical proof at n <= 1) is untouched.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    // ★ `RescopeChip` (shared, `src/components/materials/rescope-chip.tsx`) moved onto `ui/menu`
    // (Radix) after `ui-lint` flagged the chip's hand-rolled floating panel — see materials' own
    // twin test for the reasoning.
    const trigger = screen.getByText("▾").closest("button")!;
    await userEvent.click(trigger);
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });
});

// ★ The lead's finding against the real build: mounting every group's own create-task form OPEN
// made a three-day presenter page 9,000 CSS px tall. `GroupDisclosure` (native
// <details>/<summary>, no client state machine) keeps each group's form closed until its own
// header control opens it — see `tests/components/materials/list-grouping.test.tsx`'s identical
// suite for the twin.
describe("REQ-SES-018/DEC-121 — a group's own form sits behind its header control, closed by default", () => {
  // ★ `tasks.create.submit` ("إضافة") is both this trigger's visible label AND
  // `CreateTaskForm`'s own submit button — the lead's wording keeps the header control's label
  // ("«إضافة»/«أضف مادة» in the header"), so the two elements share text once a group is open.
  // jsdom does not hide a closed `<details>`'s non-summary children the way a real browser does,
  // so `getAllByText` alone would match both the 3 triggers and the 3 forms' own submit buttons.
  // Scoping to `<summary>` picks out exactly the header controls this suite is about.
  function summaryTriggers() {
    return screen.getAllByText("إضافة").filter((el) => el.tagName === "SUMMARY");
  }

  it("no group's form is open when the grouped view first renders", async () => {
    await renderSlot({ tasks: [day1Task], canManage: true, materials: [], days, timeZone: "Asia/Riyadh" });
    const triggers = summaryTriggers(); // session + day1 + day2, one per group
    expect(triggers).toHaveLength(3);
    for (const trigger of triggers) {
      expect(trigger.closest("details")!.open).toBe(false);
    }
  });

  it("the header control opens exactly its own group's form and leaves the others closed", async () => {
    await renderSlot({ tasks: [day1Task], canManage: true, materials: [], days, timeZone: "Asia/Riyadh" });
    const triggers = summaryTriggers();
    const day1Trigger = triggers[1]; // session, then days in order
    fireEvent.click(day1Trigger);

    const opened = day1Trigger.closest("details")!;
    expect(opened.open).toBe(true);
    for (const trigger of triggers) {
      if (trigger === day1Trigger) continue;
      expect(trigger.closest("details")!.open).toBe(false);
    }
  });

  it("opening moves focus to the form's first field", async () => {
    await renderSlot({ tasks: [day1Task], canManage: true, materials: [], days, timeZone: "Asia/Riyadh" });
    const trigger = summaryTriggers()[0];
    fireEvent.click(trigger);
    // ★ jsdom toggles `<details>.open` correctly on a real click (proven above) but does not
    // reliably dispatch the accompanying native `toggle` event a real browser fires per spec —
    // dispatched by hand, exactly as materials' own twin test does, and for the same reason.
    fireEvent(trigger.closest("details")!, new Event("toggle"));
    expect(document.activeElement).toHaveAccessibleName("نوع المهمة");
  });
});
