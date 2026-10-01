// SCR-014's mistyped-code shake — DEC-212 (REQ-UIX-046 as amended), `M10a.md` §8. The boxes' group takes the
// lead's `.code-shake` once per refused SUBMISSION this client made, only for `invalid_code`; a re-render, a fresh
// mount (a reload, a back navigation) and every other refusal leave it still. The class's motion lives in
// `globals.css` under `prefers-reduced-motion: no-preference`, so the reduced-motion case is the e2e's.
import { NextIntlClientProvider } from "next-intl";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import checkin from "@/messages/ar/checkin.json";
import { CheckInForm, CheckInSurface } from "@/components/checkin/moment-check-in";
import { CodeEntry } from "@/components/checkin/code-entry";

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const positions = Array.from({ length: 6 }, (_, i) => `الخانة ${i + 1} من 6`);

function Screen({ refusal, momentAction }: { refusal: string | null; momentAction: (fd: FormData) => Promise<{ checkInId: string }> }) {
  return (
    <NextIntlClientProvider locale="ar" messages={checkin}>
      <CheckInSurface rest={null} announce={false}>
        <CheckInForm action={async () => {}} momentAction={momentAction}>
          <CodeEntry refusal={refusal} id="code-0" name="code" label="أدخل رمز الحضور" positionLabels={positions} invalid={refusal !== null} />
          <button type="submit">تسجيل الحضور</button>
        </CheckInForm>
      </CheckInSurface>
    </NextIntlClientProvider>
  );
}

// A refusal: the action resolves with no check-in (in the app, the router has navigated to `?error=`).
const refused = vi.fn(async () => undefined as unknown as { checkInId: string });
const group = () => screen.getByRole("group", { name: "أدخل رمز الحضور" });
const frames = () => act(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
});

/** jsdom has no AnimationEvent, so the event carries its name by hand — under both names React may listen to. */
function animationEnd(el: Element) {
  for (const type of ["animationend", "webkitAnimationEnd"]) {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, "animationName", { value: "code-shake" });
    act(() => {
      el.dispatchEvent(event);
    });
  }
}

async function submit() {
  await act(async () => {
    fireEvent.submit(screen.getByRole("button", { name: "تسجيل الحضور" }).closest("form")!);
  });
}

describe("CodeEntry — the mistyped code's shake (DEC-212)", () => {
  it("a refused submission whose refusal is invalid_code shakes the boxes' group — not the label", async () => {
    const view = render(<Screen refusal={null} momentAction={refused} />);
    await submit();
    view.rerender(<Screen refusal="invalid_code" momentAction={refused} />);
    await frames();
    expect(group()).toHaveClass("code-shake");
    expect(screen.getByText("أدخل رمز الحضور").closest(".code-shake")).toBeNull();
  });

  it("★ a re-render does not replay it: once it has ended, it stays still", async () => {
    const view = render(<Screen refusal={null} momentAction={refused} />);
    await submit();
    view.rerender(<Screen refusal="invalid_code" momentAction={refused} />);
    await frames();
    animationEnd(group());
    expect(group()).not.toHaveClass("code-shake");
    view.rerender(<Screen refusal="invalid_code" momentAction={refused} />);
    await frames();
    expect(group()).not.toHaveClass("code-shake");
  });

  it("a second wrong code is a second submission, and shakes again", async () => {
    const view = render(<Screen refusal={null} momentAction={refused} />);
    await submit();
    view.rerender(<Screen refusal="invalid_code" momentAction={refused} />);
    await frames();
    animationEnd(group());
    await submit();
    await frames();
    expect(group()).toHaveClass("code-shake");
  });

  it("★ a fresh mount on a refused page — a reload, a back navigation — does not shake", async () => {
    render(<Screen refusal="invalid_code" momentAction={refused} />);
    await frames();
    expect(group()).not.toHaveClass("code-shake");
  });

  it("★ every other refusal is the system's, and does not move", async () => {
    const view = render(<Screen refusal={null} momentAction={refused} />);
    await submit();
    view.rerender(<Screen refusal="rate_limited" momentAction={refused} />);
    await frames();
    expect(group()).not.toHaveClass("code-shake");
    // …and a mistyped code after it still shakes: the rate limit answered its own submission.
    await submit();
    view.rerender(<Screen refusal="invalid_code" momentAction={refused} />);
    await frames();
    expect(group()).toHaveClass("code-shake");
  });
});
