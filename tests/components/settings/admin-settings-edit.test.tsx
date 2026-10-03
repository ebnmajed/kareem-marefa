// SCR-063 in edit mode (REQ-UIX-091, REQ-UIX-102, DEC-232 §3): the four cards editable, the unsaved count, «(معدّل)»
// to a screen reader, the refusal at its field with the summary's link focusing the control (the case
// `form-summary-links.test.tsx` held for the deleted form — ledger, wave 22), «حُفظ» only from a receipt that wrote
// something, «لم يتغيّر شيء» from an empty one, and axe.
import type React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }), Link: (props: React.ComponentProps<"a">) => <a {...props} /> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { SettingsEdit } = await import("@/app/[locale]/app/admin/settings/settings-edit");
const { ToastProvider } = await import("@/components/ui/toast");
const { formStateFrom, withErrors } = await import("@/lib/form-state");
import type { SettingsState } from "@/app/[locale]/app/admin/settings/state";
import adminAr from "@/messages/ar/admin.json";
import settingsAr from "@/messages/ar/settings.json";
import uiAr from "@/messages/ar/ui.json";

const messages = { ...adminAr, ...settingsAr, ...uiAr };
type Action = (previous: SettingsState, formData: FormData) => Promise<SettingsState>;
const empty = { errors: {}, formError: null, values: {}, lists: {}, attempt: 0 };

const VIEW = {
  name: "كريم معرفة",
  domains: [{ id: "d1", domain: "pp.sa" }],
  timeZone: "Asia/Riyadh",
  companyMetric: "points_per_active_member",
  companyMinActiveMembers: 3,
  checkInRotationSeconds: 600,
  checkInGraceSeconds: 120,
  maxCoPresenters: 4,
  priorityRsvpHours: 24,
  limitDocumentMb: 50,
  limitAudioMb: 200,
  limitImageMb: 20,
  limitPosterMb: 30,
  ratingMinAggregate: 3,
  emailFromName: null,
  emailReplyTo: null,
  allowJpegExport: false,
};

function renderEdit(action: Action) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <main>
          <SettingsEdit action={action} view={VIEW} derived={{ calendar: "غير مُعدّ", verify: "localhost/ar/verify" }} timeZones={["Asia/Dubai", "Asia/Riyadh"]} />
        </main>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SettingsEdit", () => {
  it("four titled cards; a change is counted and named to a screen reader; the deployment's rows stay read", () => {
    renderEdit(vi.fn());
    for (const title of ["المؤسسة", "الجلسات", "الخصوصية", "الربط"]) expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^احفظ/ })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "الاسم" }), { target: { value: "اسم جديد" } });
    expect(screen.getByText("تغيير واحد غير محفوظ")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "الاسم (معدّل)" })).toHaveValue("اسم جديد");
    expect(screen.getByText("غير مُعدّ")).toBeInTheDocument();
  });

  it("a refusal lands at its field and the summary's link focuses the control", async () => {
    const refusing: Action = async (_prev, formData) => ({ ...withErrors(formStateFrom<string>(formData, { fields: ["emailReplyTo"] }), { emailReplyTo: "emailReplyTo" }), receipt: null });
    renderEdit(refusing);
    const reply = screen.getByRole("textbox", { name: "عنوان الرد" });
    fireEvent.change(reply, { target: { value: "nope" } });
    fireEvent.submit(reply.closest("form")!);
    const summary = await screen.findByRole("alert");
    const link = within(summary).getByRole("link", { name: /عنوان الرد/ });
    fireEvent.click(link);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: /عنوان الرد/ }));
    expect(screen.getByRole("textbox", { name: /عنوان الرد/ })).toHaveAccessibleDescription("اكتب بريدًا إلكترونيًا صالحًا.");
  });

  it("«حُفظ» only from a receipt that wrote something; then back to read mode", async () => {
    renderEdit(async () => ({ ...empty, receipt: { at: "2026-10-02T11:05:00+00:00", wrote: ["time_zone"] } }));
    fireEvent.change(screen.getByRole("combobox", { name: "المنطقة الزمنية" }), { target: { value: "Asia/Dubai" } });
    fireEvent.submit(screen.getByRole("button", { name: /^احفظ/ }).closest("form")!);
    expect(await screen.findByText("حُفظ", { exact: true })).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/app/admin/settings");
  });

  it("an empty receipt says «لم يتغيّر شيء», never «حُفظ»", async () => {
    renderEdit(async () => ({ ...empty, receipt: { at: null, wrote: [] } }));
    fireEvent.submit(screen.getByRole("button", { name: /^احفظ/ }).closest("form")!);
    expect(await screen.findByText("لم يتغيّر شيء", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("حُفظ", { exact: true })).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = renderEdit(vi.fn());
    const result = await axe.run(container, { rules: { region: { enabled: false } } });
    await waitFor(() => expect(result.violations.map((v) => v.id)).toEqual([]));
  }, 20000);
});
