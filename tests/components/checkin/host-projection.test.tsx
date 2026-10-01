// SCR-016's projection and the screen kept awake — REQ-UIX-062 («Projection shows the code alone and
// keeps the screen awake while the session is live»), DEC-209 D4: awake while live, projecting or not;
// where the Screen Wake Lock API is absent or refuses, no lock and no sentence that promises one.
import { NextIntlClientProvider } from "next-intl";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import checkin from "@/messages/ar/checkin.json";
import { AwakeNote, DimNote, ProjectionRoot, ProjectionToggle } from "@/components/checkin/host-projection";

type Sentinel = { release: ReturnType<typeof vi.fn>; addEventListener: (type: "release", cb: () => void) => void; fire: () => void };

function fakeWakeLock(outcome: "grant" | "refuse") {
  const sentinels: Sentinel[] = [];
  const request = vi.fn(async () => {
    if (outcome === "refuse") throw new DOMException("refused", "NotAllowedError");
    let onRelease = () => {};
    const s: Sentinel = { release: vi.fn(async () => {}), addEventListener: (_t, cb) => (onRelease = cb), fire: () => onRelease() };
    sentinels.push(s);
    return s;
  });
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  return { request, sentinels };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "wakeLock");
});

function screenOf(live: boolean) {
  return (
    <NextIntlClientProvider locale="ar" messages={checkin}>
      <ProjectionRoot live={live}>
        <ProjectionToggle />
        <p dir="ltr">M7K2QX</p>
        <DimNote>قد تنطفئ الشاشة</DimNote>
        <p data-testid="footnote">
          الإبطال
          <AwakeNote>تبقى الشاشة مضاءة أثناء الجلسة.</AwakeNote>
        </p>
      </ProjectionRoot>
    </NextIntlClientProvider>
  );
}

const flush = () => act(async () => {});

describe("the wake lock (DEC-209 D4)", () => {
  it("is asked for while live, and only then does the footnote promise a lit screen", async () => {
    const { request } = fakeWakeLock("grant");
    render(screenOf(true));
    await flush();
    expect(request).toHaveBeenCalledWith("screen");
    expect(screen.getByTestId("footnote")).toHaveTextContent("تبقى الشاشة مضاءة");
  });

  it("is not asked for when the day is not live", async () => {
    const { request } = fakeWakeLock("grant");
    render(screenOf(false));
    await flush();
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByTestId("footnote")).not.toHaveTextContent("تبقى الشاشة مضاءة");
  });

  it("★ unsupported: no lock, and no sentence that claims one", async () => {
    render(screenOf(true));
    await flush();
    expect(screen.getByTestId("footnote")).not.toHaveTextContent("تبقى الشاشة مضاءة");
  });

  it("★ refused: the same — the screen never claims what it does not do", async () => {
    fakeWakeLock("refuse");
    render(screenOf(true));
    await flush();
    expect(screen.getByTestId("footnote")).not.toHaveTextContent("تبقى الشاشة مضاءة");
  });

  it("the browser dropping the lock withdraws the sentence; returning to the page asks again", async () => {
    const { request, sentinels } = fakeWakeLock("grant");
    render(screenOf(true));
    await flush();
    act(() => sentinels[0].fire());
    expect(screen.getByTestId("footnote")).not.toHaveTextContent("تبقى الشاشة مضاءة");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("footnote")).toHaveTextContent("تبقى الشاشة مضاءة");
  });

  it("is released on unmount", async () => {
    const { sentinels } = fakeWakeLock("grant");
    const { unmount } = render(screenOf(true));
    await flush();
    unmount();
    expect(sentinels[0].release).toHaveBeenCalled();
  });
});

describe("projection", () => {
  it("is a pressed toggle on the same page: one code element, the root marked, Escape leaves", async () => {
    render(screenOf(true));
    const toggle = screen.getByRole("button", { name: "اعرض على الشاشة" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    const root = document.querySelector("[data-projecting]");
    expect(root).not.toBeNull();
    expect(screen.getByRole("button", { name: "إنهاء العرض" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelectorAll("p[dir='ltr']")).toHaveLength(1);
    // No lock held (none supported here): the honest line shows under the code while projecting.
    expect(screen.getByText("قد تنطفئ الشاشة")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.querySelector("[data-projecting]")).toBeNull();
  });

  it("the root is never transformed or filtered — the moment's rule for the scope (DEC-188 §5)", () => {
    const { container } = render(screenOf(true));
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("style") ?? "").not.toMatch(/transform|filter/);
    expect(root.className).not.toMatch(/\b(transform|scale-|rotate-|translate-|blur|filter)/);
  });
});

