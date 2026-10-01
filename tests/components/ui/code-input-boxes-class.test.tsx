// `ui/code-input` — wave 18's `boxesClassName`, add-only (`checkin`'s request for DEC-212: a refused code shakes
// the six boxes once). It reaches the boxes' group and nothing else. The existing suites pass untouched.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodeInput } from "@/components/ui/code-input";

const POSITIONS = ["الخانة 1 من 6", "الخانة 2 من 6", "الخانة 3 من 6", "الخانة 4 من 6", "الخانة 5 من 6", "الخانة 6 من 6"];

describe("CodeInput — boxesClassName", () => {
  it("★ lands on the group of six, beside its own classes", () => {
    render(<CodeInput name="code" label="رمز الحضور" positionLabels={POSITIONS} align="center" boxesClassName="code-shake" error="الرمز غير صحيح" />);
    const group = screen.getByRole("group", { name: "رمز الحضور" });
    expect(group).toHaveClass("code-shake", "justify-center", "mt-2", "flex", "gap-2");
  });

  it("nowhere else — not the wrapper, the label, a box or the error line", () => {
    const { container } = render(<CodeInput name="code" label="رمز الحضور" positionLabels={POSITIONS} boxesClassName="code-shake" error="الرمز غير صحيح" />);
    const group = screen.getByRole("group", { name: "رمز الحضور" });
    expect(container.querySelectorAll(".code-shake")).toHaveLength(1);
    expect(container.querySelector(".code-shake")).toBe(group);
  });

  it("unset, the group's class string is exactly the old one", () => {
    render(<CodeInput name="code" label="رمز الحضور" positionLabels={POSITIONS} />);
    expect(screen.getByRole("group", { name: "رمز الحضور" }).className).toBe("mt-2 flex gap-2");
  });
});
