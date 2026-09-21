// SCR-064's «أزل الاستبانة» — offered only when it can work.
//
// `survey_detach()` refuses once anyone has answered, and the screen used to
// offer the button anyway and say «لا يمكن إزالة استبانة أجاب عنها أحد» AFTER
// the press. The sentence is the same either way; saying it first is the
// difference between a rule and a trap, and it is the kind of thing only a
// capture shows — every test passed while the button sat there.
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { DetachControl } from "@/components/survey/detach-control";
import ui from "@/messages/ar/ui.json";

const STRINGS = {
  detachLabel: "أزل الاستبانة",
  confirmText: "هل تزيل الاستبانة من هذه الجلسة؟",
  blockedText: "لا يمكن إزالة استبانة أجاب عنها أحد",
};

// `ButtonLink` renders the localised `Link`, which reads the locale from
// context — the provider is the harness, not the subject.
const renderControl = (over: Partial<Parameters<typeof DetachControl>[0]> = {}) =>
  render(
    <NextIntlClientProvider locale="ar" messages={ui}>
      <DetachControl
        canDetach
        confirming={false}
        confirmHref="/app/admin/sessions/s1/survey?confirm=1"
        action={vi.fn()}
        {...STRINGS}
        {...over}
      />
    </NextIntlClientProvider>,
  );

describe("DetachControl", () => {
  it("★ once anyone has answered there is NO control at all — the sentence takes its place", () => {
    renderControl({ canDetach: false });
    expect(screen.getByText(STRINGS.blockedText)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("offers a link that asks first — never a one-press removal", () => {
    renderControl();
    const link = screen.getByRole("link", { name: STRINGS.detachLabel });
    expect(link).toHaveAttribute("href", expect.stringContaining("confirm=1"));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(STRINGS.confirmText)).toBeNull();
  });

  it("the second step asks in words and submits a form, so it survives a reload", () => {
    const action = vi.fn();
    const { container } = renderControl({ confirming: true, action });
    expect(screen.getByText(STRINGS.confirmText)).toBeTruthy();
    expect(screen.getByRole("button", { name: STRINGS.detachLabel })).toBeTruthy();
    expect(container.querySelector("form")).toBeTruthy();
  });

  it("a survey with responses says so even while the confirmation step is open — a stale URL cannot reopen it", () => {
    renderControl({ canDetach: false, confirming: true });
    expect(screen.getByText(STRINGS.blockedText)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
