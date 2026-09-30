// `ui/code-input` — wave 18's `align`, add-only (`checkin`'s request for SCR-014, DEC-209 §2). The existing
// suites (`code-input.test.tsx`, `code-input-no-js.test.tsx`) pass untouched: the default is where the label
// and the boxes have always stood.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodeInput } from "@/components/ui/code-input";

const POSITIONS = ["الخانة 1 من 6", "الخانة 2 من 6", "الخانة 3 من 6", "الخانة 4 من 6", "الخانة 5 من 6", "الخانة 6 من 6"];

function draw(align?: "start" | "center") {
  return render(<CodeInput name="code" label="رمز الحضور" positionLabels={POSITIONS} align={align} />);
}

describe("CodeInput — align", () => {
  it("★ center: the label and the boxes are centred", () => {
    const { container } = draw("center");
    expect(container.firstElementChild).toHaveClass("text-center");
    expect(screen.getByRole("group", { name: "رمز الحضور" })).toHaveClass("justify-center");
  });

  it("the default — and «start» — is exactly the old layout: no centring class anywhere", () => {
    for (const align of [undefined, "start"] as const) {
      const { container, unmount } = draw(align);
      expect(container.firstElementChild?.className ?? "").not.toMatch(/text-center/);
      expect(screen.getByRole("group", { name: "رمز الحضور" }).className).toBe("mt-2 flex gap-2");
      unmount();
    }
  });
});
