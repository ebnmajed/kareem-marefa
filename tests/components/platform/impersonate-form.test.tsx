// SCR-085's form — wave 8 (`docs/plan/notes/platform.md` W8.8, F2). REQ-ADM-002,
// REQ-UIX-009 … 011.
//
// ★ The case this file exists for is the second: once the action reports the
// session STARTED, the token is refreshed BEFORE the page re-renders, in the
// submit path itself. The refresh once lived in an effect of this form, and the
// response that started the session also unmounted the form — so it never ran,
// and the org never reached the token (measured red on the build before it).
import { NextIntlClientProvider } from "next-intl";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import arPlatform from "@/messages/ar/platform.json";
import arUi from "@/messages/ar/ui.json";

const calls: string[] = [];
const refreshSession = vi.fn(async () => {
  calls.push("refreshSession");
  return {};
});
const refresh = vi.fn(() => calls.push("router.refresh"));
vi.mock("@/lib/supabase/browser", () => ({ createBrowserClient: () => ({ auth: { refreshSession } }) }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh }),
}));

const { ImpersonateForm } = await import("@/app/[locale]/app/platform/impersonate/impersonate-form");
const { emptyImpersonationState } = await import("@/app/[locale]/app/platform/impersonate/state");
type State = ReturnType<typeof emptyImpersonationState>;

const ORGS = [
  { id: "0c1a3a2e-6a55-4d6f-8f1e-3f5b0b9e2a11", name: "مؤسسة أ" },
  { id: "1d2b4b3f-7b66-4e70-9f2f-4a6c1caf3b22", name: "Acme" },
];

function renderForm(action: (prev: State, fd: FormData) => Promise<State>) {
  return render(
    <NextIntlClientProvider locale="ar" messages={{ ...arPlatform, ...arUi }}>
      <ImpersonateForm orgs={ORGS} action={action} />
    </NextIntlClientProvider>,
  );
}

describe("ImpersonateForm", () => {
  it("is `noValidate`, marks its required fields, and offers five durations ending at the ceiling, one hour by default", () => {
    const { container } = renderForm(async (prev) => prev);
    expect(container.querySelector("form")).toHaveAttribute("novalidate");
    expect(screen.getByLabelText(/^المؤسسة/)).toBeRequired();
    const group = screen.getByRole("radiogroup", { name: "المدة" });
    const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.value)).toEqual(["15", "30", "60", "120", "240"]);
    expect(within(group).getByRole("radio", { name: "ساعة واحدة" })).toBeChecked();
    expect(group).toHaveTextContent("الحد الأعلى");
    expect(group.textContent).not.toMatch(/[٠-٩۰-۹]/);
  });

  it("★ F2: a started session refreshes the token, THEN re-renders the page — from the submit path", async () => {
    calls.length = 0;
    const action = vi.fn(async (): Promise<State> => {
      calls.push("action");
      return { ...emptyImpersonationState(), started: true };
    });
    renderForm(action);
    await userEvent.selectOptions(screen.getByLabelText(/^المؤسسة/), ORGS[1].id);
    await userEvent.type(screen.getByLabelText(/^السبب/), "مراجعة بلاغ");
    await userEvent.click(screen.getByRole("radio", { name: "30 دقيقة" }));
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /ابدأ الجلسة/ }));
    });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(calls).toEqual(["action", "refreshSession", "router.refresh"]);
    const sent = action.mock.calls[0] as unknown as [State, FormData];
    expect(sent[1].get("orgId")).toBe(ORGS[1].id);
    expect(sent[1].get("minutes")).toBe("30");
  });

  it("a refused submit keeps what was typed, summarises, and never touches the token", async () => {
    refreshSession.mockClear();
    const action = vi.fn(async (prev: State, fd: FormData): Promise<State> => ({
      errors: { orgId: "orgRequired" },
      formError: null,
      values: { reason: String(fd.get("reason")), minutes: String(fd.get("minutes")) },
      lists: {},
      attempt: prev.attempt + 1,
      started: false,
    }));
    const { container } = renderForm(action);
    await userEvent.type(screen.getByLabelText(/^السبب/), "سبب مكتوب بعناية");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /ابدأ الجلسة/ }));
    });
    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("المؤسسة");
    expect(summary).toHaveTextContent("اختر المؤسسة.");
    expect(screen.getByLabelText(/^السبب/)).toHaveValue("سبب مكتوب بعناية");
    expect(refreshSession).not.toHaveBeenCalled();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
  });
});
