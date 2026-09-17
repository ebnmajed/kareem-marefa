// SCR-060's Server Action — REQ-ADM-016, REQ-NTF-004. Each rule the DAL's
// `reminderScheduleInput` enforces is refused at the ROW it concerns, keyed by
// the row's own key, and a duplicate is refused rather than merged silently.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const setReminderSchedule = vi.fn();
vi.mock("@/lib/dal/notifications", () => ({ setReminderSchedule: (...args: unknown[]) => setReminderSchedule(...args) }));

const { saveReminderSchedule } = await import("@/app/[locale]/app/admin/reminders/actions");
const { emptyRemindersState } = await import("@/app/[locale]/app/admin/reminders/state");

function form(rows: [key: string, amount: string, unit: string][], prompt: [string, string] = ["1", "hours"]): FormData {
  const data = new FormData();
  for (const [key, amount, unit] of rows) {
    data.append("offsetKey", key);
    data.append("offsetAmount", amount);
    data.append("offsetUnit", unit);
  }
  data.set("promptAmount", prompt[0]);
  data.set("promptUnit", prompt[1]);
  return data;
}

describe("saveReminderSchedule", () => {
  beforeEach(() => setReminderSchedule.mockReset());

  it("saves the rows in minutes and reports saved", async () => {
    const result = await saveReminderSchedule("ar", emptyRemindersState, form([["r0", "7", "days"], ["r1", "1", "days"], ["r2", "2", "hours"]]));
    expect(setReminderSchedule).toHaveBeenCalledWith("ar", { offsetsMinutes: [10080, 1440, 120], ratingPromptDelayMinutes: 60 });
    expect(result).toMatchObject({ saved: true, errors: {}, formError: null, attempt: 0 });
  });

  it("refuses each bad row at its own key, and writes nothing", async () => {
    const result = await saveReminderSchedule(
      "ar",
      emptyRemindersState,
      form([["r0", "", "days"], ["r4", "2", "minutes"], ["r7", "31", "days"], ["r8", "1.5", "hours"], ["r9", "0", "hours"]], ["8", "days"]),
    );
    expect(setReminderSchedule).not.toHaveBeenCalled();
    expect(result.saved).toBe(false);
    expect(result.attempt).toBe(1);
    expect(result.errors).toEqual({
      "offset-r0": "offsetRequired",
      "offset-r4": "offsetTooShort",
      "offset-r7": "offsetTooLong",
      "offset-r8": "offsetInvalid",
      "offset-r9": "offsetInvalid",
      prompt: "promptTooLong",
    });
    // What was typed comes back, for the summary and the rows.
    expect(result.lists.offsetAmount).toEqual(["", "2", "31", "1.5", "0"]);
  });

  it("a duplicate is refused on the LATER row, even when typed in another unit", async () => {
    const result = await saveReminderSchedule("ar", emptyRemindersState, form([["r0", "1", "days"], ["r1", "24", "hours"]]));
    expect(result.errors).toEqual({ "offset-r1": "offsetDuplicate" });
    expect(setReminderSchedule).not.toHaveBeenCalled();
  });

  it("zero is a valid rating prompt — at once — and more than six reminders is refused", async () => {
    const seven = Array.from({ length: 7 }, (_, i) => [`r${i}`, String(i + 1), "days"] as [string, string, string]);
    const result = await saveReminderSchedule("ar", emptyRemindersState, form(seven, ["0", "minutes"]));
    expect(result.errors).toEqual({ offsets: "offsetsTooMany" });
  });

  it("a failed write is a form error, with the typed rows kept", async () => {
    setReminderSchedule.mockRejectedValueOnce(new Error("org_settings: boom"));
    const result = await saveReminderSchedule("ar", emptyRemindersState, form([["r0", "3", "days"]]));
    expect(result).toMatchObject({ saved: false, formError: "failed" });
    expect(result.lists.offsetAmount).toEqual(["3"]);
  });
});
