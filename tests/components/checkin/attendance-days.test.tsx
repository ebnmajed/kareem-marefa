// SCR-044's two forms at three days, and at one — DEC-119, DEC-150 contract 4.
//
// ★ What this file guards is the rule the whole track turns on: the day
// controls EXIST above one day and DO NOT below it. A regression in either
// direction is invisible in a screenshot of the common case — a stray «اليوم»
// select on a talk reads as a bug to every admin in the product, and a missing
// one on a workshop makes Tuesday uncorrectable.
//
// The existing files stay as they are (rule 4): `remove-check-in-form.test.tsx`
// is the one-day form and every assertion in it is unchanged.
import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { ManualMarkForm } from "@/app/[locale]/app/admin/sessions/[id]/attendance/manual-mark-form";
import { RemoveCheckInForm } from "@/app/[locale]/app/admin/sessions/[id]/attendance/remove-check-in-form";
import type { ManualMarkState, RemoveState } from "@/app/[locale]/app/admin/sessions/[id]/attendance/actions";
import type { UncheckedAttendee } from "@/lib/dal/checkin";
import checkinAr from "@/messages/ar/checkin.json";
import uiAr from "@/messages/ar/ui.json";

const ar = { ...checkinAr, ...uiAr };

const SARA: UncheckedAttendee = { memberId: "m1", displayName: "سارة العتيبي" };
const KHALID: UncheckedAttendee = { memberId: "m2", displayName: "خالد الحربي" };
const NOURA: UncheckedAttendee = { memberId: "m3", displayName: "نورة القحطاني" };

const THREE_DAYS = [
  { id: "d1", label: "اليوم الأول" },
  { id: "d2", label: "اليوم الثاني" },
  { id: "d3", label: "اليوم الثالث" },
];
const ONE_DAY = [{ id: "d1", label: "اليوم الأول" }];

const wrap = (node: ReactNode) => render(<NextIntlClientProvider locale="ar" messages={ar}>{node}</NextIntlClientProvider>);

// Day 2 is the one nobody attended — the shape the demonstrable uses.
const MARKABLE = { d1: [NOURA], d2: [SARA, KHALID, NOURA], d3: [NOURA] };
const REMOVABLE = { d1: [SARA, KHALID], d2: [], d3: [SARA, KHALID] };

function markForm(days = THREE_DAYS, action: (p: ManualMarkState, f: FormData) => Promise<ManualMarkState> = vi.fn()) {
  return wrap(
    <ManualMarkForm
      action={action}
      unchecked={[SARA, KHALID, NOURA]}
      days={days}
      defaultDayId="d2"
      candidatesByDay={days.length > 1 ? MARKABLE : { d1: [SARA, KHALID, NOURA] }}
    />,
  );
}

function removeForm(days = THREE_DAYS, action: (p: RemoveState, f: FormData) => Promise<RemoveState> = vi.fn()) {
  return wrap(
    <RemoveCheckInForm
      action={action}
      candidates={[SARA, KHALID]}
      sessionTitle="ورشة ثلاثة أيام"
      days={days}
      defaultDayId="d1"
      candidatesByDay={days.length > 1 ? REMOVABLE : { d1: [SARA, KHALID] }}
    />,
  );
}

describe("the manual mark at three days", () => {
  it("offers the day, opens on the day the room is on, and lists THAT day's missing members", () => {
    markForm();
    const day = screen.getByLabelText("اليوم") as HTMLSelectElement;
    expect(day.value).toBe("d2");
    const members = screen.getByLabelText("العضو المراد تسجيل حضوره", { exact: false }) as HTMLSelectElement;
    expect([...members.options].map((o) => o.textContent).filter((x) => x !== "اختر عضوًا")).toEqual(["سارة العتيبي", "خالد الحربي", "نورة القحطاني"]);
  });

  it("★ switching the day switches the list — an admin correcting Tuesday sees TUESDAY's missing members", async () => {
    markForm();
    await userEvent.selectOptions(screen.getByLabelText("اليوم"), "d1");
    const members = screen.getByLabelText("العضو المراد تسجيل حضوره", { exact: false }) as HTMLSelectElement;
    await waitFor(() => expect([...members.options].map((o) => o.textContent).filter((x) => x !== "اختر عضوًا")).toEqual(["نورة القحطاني"]));
  });

  it("sends the chosen day with the mark", async () => {
    const seen: FormData[] = [];
    const action = vi.fn(async (_p: ManualMarkState, f: FormData) => {
      seen.push(f);
      return { error: null, done: true };
    });
    markForm(THREE_DAYS, action);
    await userEvent.selectOptions(screen.getByLabelText("اليوم"), "d3");
    await userEvent.selectOptions(screen.getByLabelText("العضو المراد تسجيل حضوره", { exact: false }), "m3");
    await userEvent.type(screen.getByLabelText("السبب"), "حضر بلا هاتف");
    await userEvent.click(screen.getByRole("button", { name: "سجّل حضوره" }));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].get("dayId")).toBe("d3");
    expect(seen[0].get("memberId")).toBe("m3");
  });
});

describe("the removal at three days", () => {
  it("offers the day and lists only members with an ACTIVE check-in on it", async () => {
    removeForm();
    expect((screen.getByLabelText("اليوم", { exact: false }) as HTMLSelectElement).value).toBe("d1");
    const members = screen.getByLabelText("العضو المراد إلغاء تسجيل حضوره", { exact: false }) as HTMLSelectElement;
    expect([...members.options].map((o) => o.value).filter(Boolean)).toEqual(["m1", "m2"]);

    // Day 2: nobody attended, so there is nobody to remove.
    await userEvent.selectOptions(screen.getByLabelText("اليوم", { exact: false }), "d2");
    await waitFor(() => expect([...(screen.getByLabelText("العضو المراد إلغاء تسجيل حضوره", { exact: false }) as HTMLSelectElement).options].map((o) => o.value).filter(Boolean)).toEqual([]));
  });

  it("sends the chosen day with the removal", async () => {
    const seen: FormData[] = [];
    const action = vi.fn(async (_p: RemoveState, f: FormData) => {
      seen.push(f);
      return { error: null, done: true };
    });
    removeForm(THREE_DAYS, action);
    await userEvent.selectOptions(screen.getByLabelText("اليوم", { exact: false }), "d3");
    await userEvent.selectOptions(screen.getByLabelText("العضو المراد إلغاء تسجيل حضوره", { exact: false }), "m1");
    await userEvent.type(screen.getByLabelText("سبب الإلغاء", { exact: false }), "سُجّل خطأً");
    await userEvent.click(screen.getByRole("button", { name: "ألغِ تسجيل الحضور" }));
    const dialog = await screen.findByRole("dialog", { name: "تأكيد إلغاء تسجيل الحضور" });
    await userEvent.click(within(dialog).getByRole("button", { name: "ألغِ تسجيل الحضور" }));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].get("dayId")).toBe("d3");
  });
});

describe("★ at ONE day neither form says a word about days", () => {
  it("the manual mark has no day select, and the day still travels in a hidden field", () => {
    // ★ The helper hands it `defaultDayId="d2"`, which is NOT a day of this
    // one-day session — a stale default, the shape a page rendered before a
    // day was deleted would produce. The form falls back to a real day rather
    // than sending the RPC an id it will refuse `not_found`.
    const { container } = markForm(ONE_DAY);
    expect(screen.queryByLabelText("اليوم")).toBeNull();
    expect(screen.queryByText("اليوم الأول")).toBeNull();
    const hidden = container.querySelector('input[type="hidden"][name="dayId"]') as HTMLInputElement | null;
    expect(hidden?.value).toBe("d1");
  });

  it("the removal has no day select either", () => {
    const { container } = removeForm(ONE_DAY);
    expect(screen.queryByLabelText("اليوم", { exact: false })).toBeNull();
    expect((container.querySelector('input[type="hidden"][name="dayId"]') as HTMLInputElement | null)?.value).toBe("d1");
  });
});
