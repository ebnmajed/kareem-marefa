// SCR-060's Server Action as the owner ruled it (`DEC-232` §1.3) — three fixed rows and the prompt. Re-says the cases
// of the deleted `admin-reminders-action.test.ts` against the new form (ledger, wave 22): each refusal at its row and
// nothing written; a save that changes nothing sends nothing and answers an EMPTY receipt; a stale page is refused;
// and the «other» offsets an org already holds go back untouched.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const setReminderSchedule = vi.fn();
vi.mock("@/lib/dal/notifications", async () => {
  const { z } = await import("zod");
  return {
    setReminderSchedule: (...args: unknown[]) => setReminderSchedule(...args),
    reminderScheduleInput: z.object({
      offsetsMinutes: z.array(z.number().int().min(5).max(43200)).min(1).max(6),
      ratingPromptDelayMinutes: z.number().int().min(0).max(10080),
    }),
  };
});

const { saveReminderSchedule } = await import("@/app/[locale]/app/admin/reminders/actions");
const { emptyRemindersState } = await import("@/app/[locale]/app/admin/reminders/state");

type Rows = Partial<Record<"week" | "day" | "hours", [amount: string, unit: string] | null>>;
const DEFAULT_ROWS: Rows = { week: ["7", "days"], day: ["1", "days"], hours: ["2", "hours"] };

function form(rows: Rows = DEFAULT_ROWS, prompt: [string, string] = ["1", "hours"], opened = { offsets: [10080, 1440, 120], prompt: 60 }): FormData {
  const data = new FormData();
  for (const key of ["week", "day", "hours"] as const) {
    const row = rows[key];
    if (!row) continue;
    data.set(`${key}-on`, "on");
    data.set(`${key}-amount`, row[0]);
    data.set(`${key}-unit`, row[1]);
  }
  data.set("promptAmount", prompt[0]);
  data.set("promptUnit", prompt[1]);
  data.set("opened", JSON.stringify(opened));
  return data;
}

describe("saveReminderSchedule (SCR-060, DEC-232 §1.3)", () => {
  beforeEach(() => setReminderSchedule.mockReset());

  it("an unchanged schedule sends nothing and answers an empty receipt — «لم يتغيّر شيء»", async () => {
    const result = await saveReminderSchedule("ar", emptyRemindersState, form());
    expect(setReminderSchedule).not.toHaveBeenCalled();
    expect(result.receipt).toEqual({ at: null, wrote: [] });
  });

  it("switching a row off removes its offset, guarded by the schedule the page opened with, and returns the DAL's receipt", async () => {
    const receipt = { at: "2026-10-02T11:05:00.123456+00:00", wrote: ["reminder_offsets_minutes"] };
    setReminderSchedule.mockResolvedValue(receipt);
    const result = await saveReminderSchedule("ar", emptyRemindersState, form({ ...DEFAULT_ROWS, hours: null }));
    expect(setReminderSchedule).toHaveBeenCalledWith(
      "ar",
      { offsetsMinutes: [10080, 1440], ratingPromptDelayMinutes: 60 },
      { offsetsMinutes: [10080, 1440, 120], ratingPromptDelayMinutes: 60 },
    );
    expect(result.receipt).toEqual(receipt);
    expect(result.errors).toEqual({});
  });

  it("a timing outside its row's band is refused AT THE ROW, keeps what was typed, and writes nothing", async () => {
    const result = await saveReminderSchedule("ar", emptyRemindersState, form({ week: ["3", "days"], day: ["2", "days"], hours: ["90", "minutes"] }));
    expect(setReminderSchedule).not.toHaveBeenCalled();
    expect(result.receipt).toBeNull();
    expect(result.errors).toEqual({ week: "band.week", day: "band.day", hours: "band.hours" });
    expect(result.values["week-amount"]).toBe("3");
  });

  it("an edge of each band is accepted (0062: 8064, 1728, 96)", async () => {
    setReminderSchedule.mockResolvedValue({ at: "x", wrote: ["reminder_offsets_minutes"] });
    await saveReminderSchedule("ar", emptyRemindersState, form({ week: ["8064", "minutes"], day: ["1728", "minutes"], hours: ["96", "minutes"] }));
    expect(setReminderSchedule.mock.calls[0][1].offsetsMinutes).toEqual([8064, 1728, 96]);
  });

  it("every row off is refused — at least one reminder stays", async () => {
    const result = await saveReminderSchedule("ar", emptyRemindersState, form({}));
    expect(result.errors).toEqual({ week: "noneOn" });
    expect(setReminderSchedule).not.toHaveBeenCalled();
  });

  it("an empty or non-whole timing is refused at its row; zero is a valid prompt, past a week is not", async () => {
    const empty = await saveReminderSchedule("ar", emptyRemindersState, form({ ...DEFAULT_ROWS, day: ["", "days"] }, ["8", "days"]));
    expect(empty.errors).toEqual({ day: "timingRequired", prompt: "promptTooLong" });
    setReminderSchedule.mockResolvedValue({ at: "x", wrote: ["rating_prompt_delay_minutes"] });
    await saveReminderSchedule("ar", emptyRemindersState, form(DEFAULT_ROWS, ["0", "minutes"]));
    expect(setReminderSchedule.mock.calls[0][1].ratingPromptDelayMinutes).toBe(0);
  });

  it("nothing stored is dropped: an «other» offset goes back untouched with the rows", async () => {
    setReminderSchedule.mockResolvedValue({ at: "x", wrote: ["reminder_offsets_minutes"] });
    await saveReminderSchedule("ar", emptyRemindersState, form({ ...DEFAULT_ROWS, hours: null }, ["1", "hours"], { offsets: [10080, 1440, 120, 4320], prompt: 60 }));
    expect(setReminderSchedule.mock.calls[0][1].offsetsMinutes).toEqual([10080, 1440, 4320]);
  });

  it("a stale page is refused with its own word; any other failure is a form error, the typed rows kept", async () => {
    setReminderSchedule.mockRejectedValueOnce(new Error("stale"));
    const stale = await saveReminderSchedule("ar", emptyRemindersState, form({ ...DEFAULT_ROWS, week: ["6", "days"] }));
    expect(stale).toMatchObject({ formError: "stale", receipt: null });
    setReminderSchedule.mockRejectedValueOnce(new Error("not_written"));
    const failed = await saveReminderSchedule("ar", emptyRemindersState, form({ ...DEFAULT_ROWS, week: ["6", "days"] }));
    expect(failed).toMatchObject({ formError: "failed", receipt: null });
    expect(failed.values["week-amount"]).toBe("6");
  });
});
