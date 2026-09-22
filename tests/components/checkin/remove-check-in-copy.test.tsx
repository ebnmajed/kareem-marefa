// REQ-PTS-015, DEC-174 Q3 — the removal's confirm dialog says what is TRUE at
// the moment it is shown. Every session award is written at completion, so
// before it a removal has nothing to reverse: the member simply won't earn the
// points. After it, the compensating entry of REQ-CHK-017 is the truth, in the
// words the dialog has always used. `remove-check-in-form.test.tsx` covers the
// control itself and is untouched: without the prop, the form keeps its old copy.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { RemoveCheckInForm } from "@/app/[locale]/app/admin/sessions/[id]/attendance/remove-check-in-form";
import checkinAr from "@/messages/ar/checkin.json";
import uiAr from "@/messages/ar/ui.json";

const ar = { ...checkinAr, ...uiAr };

async function openDialog(paysOnCompletion?: boolean) {
  render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <RemoveCheckInForm
        action={vi.fn()}
        candidates={[{ memberId: "m1", displayName: "سارة العتيبي" }]}
        sessionTitle="جلسة اختبار"
        days={[{ id: "d1", label: "اليوم الأول" }]}
        defaultDayId="d1"
        candidatesByDay={{ d1: [{ memberId: "m1", displayName: "سارة العتيبي" }] }}
        {...(paysOnCompletion === undefined ? {} : { paysOnCompletion })}
      />
    </NextIntlClientProvider>,
  );
  await userEvent.selectOptions(screen.getByLabelText("العضو المراد إلغاء تسجيل حضوره", { exact: false }), "m1");
  await userEvent.type(screen.getByLabelText("سبب الإلغاء", { exact: false }), "خطأ في التسجيل");
  await userEvent.click(screen.getByRole("button", { name: "ألغِ تسجيل الحضور" }));
  return screen.findByRole("dialog", { name: "تأكيد إلغاء تسجيل الحضور" });
}

describe("RemoveCheckInForm — the dialog's copy follows completion", () => {
  it("before completion: «won't earn», never «reversed»", async () => {
    const dialog = await openDialog(true);
    expect(dialog).toHaveTextContent("لن تُحتسب له نقاط الحضور عند انتهاء الجلسة");
    expect(dialog).not.toHaveTextContent("تُعكس");
  });

  it("after completion: the compensating entry, in the words it always had", async () => {
    const dialog = await openDialog(false);
    expect(dialog).toHaveTextContent("تُعكس أي نقاط مرتبطة به بقيد منفصل");
    expect(within(dialog).getByText("سارة العتيبي")).toBeInTheDocument();
  });

  it("without the prop the form keeps its old copy — an existing caller is unchanged", async () => {
    const dialog = await openDialog();
    expect(dialog).toHaveTextContent("تُعكس أي نقاط مرتبطة به بقيد منفصل");
  });
});
