// REQ-TSK-001's create-task form — real ar/tasks.json through
// NextIntlClientProvider; only the Server Action is mocked, same pattern as
// panel.test.tsx and comment-item.test.tsx.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/tasks.json";

const createTaskAction = vi.fn();
vi.mock("@/components/tasks/actions", () => ({
  createTaskAction: (...args: unknown[]) => createTaskAction(...args),
}));

afterEach(() => createTaskAction.mockReset());

const { CreateTaskForm } = await import("@/components/tasks/create-form");

function renderForm() {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <CreateTaskForm locale="ar" sessionId="s1" materials={[]} />
    </NextIntlClientProvider>,
  );
}

describe("CreateTaskForm", () => {
  // ★ The `noValidate` fix: `title` is a required native input with no
  // client-side check of its own — before this fix, the browser blocked the
  // submit event before `handleSubmit` ever ran, so an empty title showed
  // NOTHING (not even the generic failure message). Proving the action is
  // reached at all is the point, matching the same class of bug
  // `profile-form.tsx` had.
  it("submitting with an empty title reaches the action and shows the app's own failure, not silence", async () => {
    createTaskAction.mockResolvedValueOnce({ error: "invalid_type" });
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "إضافة" })); // title left empty

    await waitFor(() => expect(createTaskAction).toHaveBeenCalledTimes(1));
    expect(createTaskAction).toHaveBeenCalledWith(
      "ar",
      expect.objectContaining({ sessionId: "s1", kind: "checklist", title: "" }),
    );
    await screen.findByText("تعذّرت إضافة المهمة. حاول مرة أخرى.");
  });

  it("a successful submission clears the form back to its default kind", async () => {
    createTaskAction.mockResolvedValueOnce({ error: null });
    renderForm();
    fireEvent.change(screen.getByLabelText("عنوان المهمة"), { target: { value: "اقرأ المادة قبل الجلسة" } });
    fireEvent.click(screen.getByRole("button", { name: "إضافة" }));

    await waitFor(() => expect(createTaskAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText("عنوان المهمة")).toHaveValue(""));
  });
});
