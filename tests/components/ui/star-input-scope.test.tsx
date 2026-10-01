// `<StarInput>` inside the playground's scope — REQ-UIX-064. Born inside it: semantic names only —
// a filled star is `--signal` (DEC-214 §3), never a company's colour — and no animation of its own.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { StarLabels } from "@/components/ui";
import { StarInput } from "@/components/ui/star-input";

const LABELS: StarLabels = ["نجمة واحدة", "نجمتان", "3 نجوم", "4 نجوم", "5 نجوم"];

function scoped(dir: "rtl" | "ltr" = "rtl") {
  return render(
    <div className="theme-play" dir={dir}>
      <form>
        <StarInput name="sessionStars" legend="تقييم الجلسة" starLabels={LABELS} size="lg" defaultValue={4} required requiredLabel="مطلوب" />
        <StarInput readOnly value={3} legend="تقييم المُقدِّم" label="تقييم المُقدِّم: 3 نجوم" starLabels={LABELS} />
      </form>
    </div>,
  );
}

describe("StarInput inside the scope", () => {
  it("reads the scope's semantic names — signal for a filled star, edge-strong for an empty one — and no raw colour", () => {
    const { container } = scoped();
    const star = screen.getByRole("radio", { name: "4 نجوم" }).closest("label")!;
    expect(star.className).toContain("text-edge-strong");
    expect(star.className).toContain("[&:has(:checked)]:text-signal");
    const html = container.innerHTML;
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|team-gold|sticker-gold|(?:bg|text|fill)-(?:navy|silver|lime|white|black|play-)/i);
  });

  it("declares no transform, transition or keyframe — nothing scales on hover, nothing animates", () => {
    const { container } = scoped();
    for (const el of container.querySelectorAll("[class]")) {
      expect(el.getAttribute("class")).not.toMatch(/(?:^|\s|:)(?:scale-|rotate-|translate-|transition|animate-|duration-|will-change)/);
    }
  });

  it("RTL and LTR: star 1 is first in the DOM in both, so it stands at the inline start in both", () => {
    for (const dir of ["rtl", "ltr"] as const) {
      const { unmount } = scoped(dir);
      const group = screen.getByRole("radiogroup", { name: /تقييم الجلسة/ });
      const first = group.querySelector("label")!.querySelector("input")!;
      expect(first).toHaveAttribute("value", "1");
      unmount();
    }
  });

  it("is accessible inside the scope", async () => {
    const { container } = scoped();
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
