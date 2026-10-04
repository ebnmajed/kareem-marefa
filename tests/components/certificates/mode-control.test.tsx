// SCR-045's mode control (wave 23: moved with the rebuild to the route folder, its cases unchanged) — DEC-178 contract 2 (the mode's one writer),
// REQ-DSG-031 (the stated preflight, before the act), REQ-UIX-013.
//
// What the control decides, with the server action mocked: nothing is saved
// until the mode changes; «لا شهادات» saves at once (it issues nothing); turning
// certificates ON opens the preflight first — the fonts, each kind's design,
// who qualifies, the serial as an estimate — and saves only on «ثبّت الوضع».
import type React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import arCertificates from "@/messages/ar/certificates.json";
import arUi from "@/messages/ar/ui.json";

const saveCertificateMode = vi.fn();
vi.mock("@/app/[locale]/app/admin/sessions/[id]/certificates/actions", () => ({
  saveCertificateMode: (...a: unknown[]) => saveCertificateMode(...a),
}));
const show = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show }) }));

const { CertificateModeControl } = await import("@/app/[locale]/app/admin/sessions/[id]/certificates/mode-control");

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={{ ...arCertificates, ...arUi }}>
    <div dir="rtl">{children}</div>
  </NextIntlClientProvider>
);

const preflight = {
  fontsLoaded: true,
  designs: [
    { kind: "attendance" as const, saved: true },
    { kind: "presenter" as const, saved: false },
  ],
  eligible: 12,
  serial: "KM-2026-000124",
};

// ★ DEC-245: `completed` defaults to false, so every case written before this
// change asserts exactly what it asserted then — the before-completion control.
function mount(mode: "off" | "automatic" | "review" = "off", completed = false) {
  return render(<CertificateModeControl locale="ar" sessionId="s1" mode={mode} completed={completed} preflight={preflight} />, { wrapper: Wrap });
}

beforeEach(() => {
  saveCertificateMode.mockReset().mockResolvedValue({ status: "ok" });
  show.mockReset();
});

describe("the certificate mode on SCR-045", () => {
  it("offers the three modes as a named group, the current one chosen, and saves nothing until it changes", () => {
    mount("off");
    const group = screen.getByRole("radiogroup", { name: "من يستحق شهادة، ومتى" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "لا شهادات لهذه الجلسة" })).toBeChecked();
    expect(screen.getByRole("button", { name: "احفظ الوضع" })).toBeDisabled();
  });

  it("★ turning certificates ON shows the preflight first, and saves only on «ثبّت الوضع»", async () => {
    mount("off");
    await userEvent.click(screen.getByRole("radio", { name: "تصدر تلقائيًا عند اكتمال الجلسة" }));
    await userEvent.click(screen.getByRole("button", { name: "احفظ الوضع" }));
    expect(saveCertificateMode).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("الخطوط محمّلة من مجموعة المنصة");
    expect(dialog).toHaveTextContent("تصميم «شهادة حضور» محفوظ");
    expect(dialog).toHaveTextContent("تصميم «شهادة تقديم» لم يُحفظ بعد");
    expect(dialog).toHaveTextContent("12 شخصًا يستحقون الآن");
    expect(dialog).toHaveTextContent("KM-2026-000124");
    expect(dialog).toHaveTextContent("تقدير لا حجز");

    await userEvent.click(screen.getByRole("button", { name: "ثبّت الوضع" }));
    expect(saveCertificateMode).toHaveBeenCalledWith("ar", "s1", "automatic");
    expect(show).toHaveBeenCalledWith({ tone: "success", title: "حُفظ وضع الإصدار." });
  });

  it("switching OFF issues nothing, so it saves without a preflight", async () => {
    mount("review");
    await userEvent.click(screen.getByRole("radio", { name: "لا شهادات لهذه الجلسة" }));
    await userEvent.click(screen.getByRole("button", { name: "احفظ الوضع" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saveCertificateMode).toHaveBeenCalledWith("ar", "s1", "off");
  });

  // ★ DEC-245: the live refusal is the CANCELLED one. `session_completed` is no
  // longer raised by `set_session_certificate_mode()` (`0194`), so pinning its
  // copy here would pin a state the product cannot reach.
  it("a refusal says why, in the function's own terms", async () => {
    saveCertificateMode.mockResolvedValueOnce({ status: "refused", error: "session_cancelled" });
    mount("review");
    await userEvent.click(screen.getByRole("radio", { name: "لا شهادات لهذه الجلسة" }));
    await userEvent.click(screen.getByRole("button", { name: "احفظ الوضع" }));
    expect(show).toHaveBeenCalledWith({ tone: "error", title: "أُلغيت الجلسة، فلا شهادات لها." });
  });

  // ★ DEC-245 (REQ-CRT-017). The defect was that this control did not exist for a
  // completed session at all. Where it does, the act is different in kind — it
  // issues NOW — and the screen has to say so, or «حُفظ» followed by an empty
  // «محجوزة · 0» reads as a failure.
  describe("★ on a session that has already completed", () => {
    it("the confirmation says it issues now, and the button is «أصدر الآن»", async () => {
      mount("off", true);
      await userEvent.click(screen.getByRole("radio", { name: "تُجهَّز وتبقى محجوزة حتى تُطلقها" }));
      await userEvent.click(screen.getByRole("button", { name: "احفظ الوضع" }));

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("اكتملت الجلسة، فالشهادات تصدر الآن لا لاحقًا.");
      expect(dialog).toHaveTextContent("تصدر لـ 12 شخصًا");
      expect(screen.queryByRole("button", { name: "ثبّت الوضع" })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "أصدر الآن" }));
      expect(saveCertificateMode).toHaveBeenCalledWith("ar", "s1", "review");
    });

    it("«fanned_out» is reported as being prepared, not as saved", async () => {
      saveCertificateMode.mockResolvedValueOnce({ status: "fanned_out" });
      mount("off", true);
      await userEvent.click(screen.getByRole("radio", { name: "تصدر تلقائيًا عند اكتمال الجلسة" }));
      await userEvent.click(screen.getByRole("button", { name: "احفظ الوضع" }));
      await userEvent.click(screen.getByRole("button", { name: "أصدر الآن" }));
      expect(show).toHaveBeenCalledWith({
        tone: "success",
        title: "يجري تجهيز الشهادات الآن، وتظهر في «محجوزة» أو «صادرة» بعد قليل.",
      });
    });

    it("switching OFF on a completed session still needs no preflight", async () => {
      mount("review", true);
      await userEvent.click(screen.getByRole("radio", { name: "لا شهادات لهذه الجلسة" }));
      await userEvent.click(screen.getByRole("button", { name: "احفظ الوضع" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(saveCertificateMode).toHaveBeenCalledWith("ar", "s1", "off");
    });
  });
});
