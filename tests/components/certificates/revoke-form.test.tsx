// SCR-045's revoke sheet (wave 23) — REQ-CRT-011: the reason is mandatory, refused at the field and kept where it was
// typed; a done revoke toasts and returns to the list.
import type React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import arCertificates from "@/messages/ar/certificates.json";
import arUi from "@/messages/ar/ui.json";

const revokeIssued = vi.fn();
vi.mock("@/app/[locale]/app/admin/sessions/[id]/certificates/actions", () => ({ revokeIssued: (...a: unknown[]) => revokeIssued(...a) }));
const show = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show }) }));
const replace = vi.fn();
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace }) }));

const { RevokeForm } = await import("@/app/[locale]/app/admin/sessions/[id]/certificates/revoke-form");

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={{ ...arCertificates, ...arUi }}>
    <div dir="rtl">{children}</div>
  </NextIntlClientProvider>
);

beforeEach(() => {
  revokeIssued.mockReset();
  show.mockReset();
  replace.mockReset();
});

describe("SCR-045 — revoke", () => {
  it("★ a missing reason is refused at the field; what was typed stays; nothing is toasted", async () => {
    const user = userEvent.setup();
    revokeIssued.mockResolvedValue({ status: "reason_required" });
    render(<RevokeForm locale="ar" sessionId="s1" certificateId="c1" closeHref="/app/admin/sessions/s1/certificates" />, { wrapper: Wrap });
    await user.type(screen.getByLabelText(/سبب الإلغاء/), "قص");
    await user.click(screen.getByRole("button", { name: "ألغِ الشهادة" }));
    expect(await screen.findByText(arCertificates.certificates.session.reasonRequired)).toBeInTheDocument();
    expect(screen.getByLabelText(/سبب الإلغاء/)).toHaveValue("قص");
    expect(show).not.toHaveBeenCalled();
  });

  it("a revoke with its reason toasts «أُلغيت الشهادة.» and returns to the list", async () => {
    const user = userEvent.setup();
    revokeIssued.mockResolvedValue({ status: "ok" });
    render(<RevokeForm locale="ar" sessionId="s1" certificateId="c1" closeHref="/app/admin/sessions/s1/certificates" />, { wrapper: Wrap });
    await user.type(screen.getByLabelText(/سبب الإلغاء/), "حضر بالنيابة عن غيره");
    await user.click(screen.getByRole("button", { name: "ألغِ الشهادة" }));
    expect(revokeIssued).toHaveBeenCalledWith("ar", "s1", "c1", expect.any(FormData));
    expect((revokeIssued.mock.calls[0][3] as FormData).get("reason")).toBe("حضر بالنيابة عن غيره");
    expect(show).toHaveBeenCalledWith({ tone: "success", title: "أُلغيت الشهادة." });
    expect(replace).toHaveBeenCalledWith("/app/admin/sessions/s1/certificates", { scroll: false });
  });
});
