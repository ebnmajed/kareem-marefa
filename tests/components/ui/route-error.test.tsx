// ui/route-error — the shared body of every error.tsx and not-found.tsx
// (`16` §7.4, REQ-UIX-016). Wave 7 made the retry optional: a not-found page
// for something that is gone has nothing to retry (`sessions`' R5).
import { fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { RouteError } from "@/components/ui/route-error";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => v.id)).toEqual([]);
}

describe("RouteError", () => {
  it("offers a retry wired to reset, a way back, and the digest last", async () => {
    const reset = vi.fn();
    const { container } = render(
      <RouteError
        title="تعذّر تحميل هذا القسم"
        description="حاول مرة أخرى بعد لحظات."
        retryLabel="أعد المحاولة"
        reset={reset}
        backLabel="العودة إلى الجلسات"
        backHref="/ar/app/sessions"
        digest="3037220022"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "العودة إلى الجلسات" })).toHaveAttribute("href", "/ar/app/sessions");
    expect(screen.getByText("3037220022").tagName).toBe("BDI");
    await expectAccessible(container);
  });

  it("renders no retry when there is nothing to retry — only the way back", async () => {
    const { container } = render(
      <RouteError title="هذه الجلسة غير متاحة" description="ربما أُلغيت أو لم تُنشر بعد." backLabel="الصفحة الرئيسية" backHref="/ar" />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "الصفحة الرئيسية" })).toBeInTheDocument();
    await expectAccessible(container);
  });

  it("renders no retry when a label is given without a reset", () => {
    render(<RouteError title="خطأ" description="وصف." retryLabel="أعد المحاولة" backLabel="رجوع" backHref="/ar/app" />);
    expect(screen.queryByRole("button", { name: "أعد المحاولة" })).toBeNull();
  });
});
