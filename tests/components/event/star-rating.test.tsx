// SCR-015: "stars fill from the right in RTL" — the one detail 09 flags as
// the single most-missed RTL bug in the product. This asserts the actual
// mechanism, not just the visual outcome: DOM order is 1..5 regardless of
// direction (no flex-row-reverse, no mirrored icon), and clicking the FIRST
// star in DOM order — which a browser renders at the document's start edge,
// the right in this RTL test document (see vitest.config.ts's
// `dir="rtl"` jsdom document) — selects a 1-star rating, not 5.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StarRating } from "@/components/event/star-rating";

describe("StarRating", () => {
  it("renders five radios in ascending DOM order, unfilled at zero", () => {
    render(<StarRating label="تقييم الجلسة" name="sessionStars" value={0} onChange={vi.fn()} />);
    const stars = screen.getAllByRole("radio");
    expect(stars).toHaveLength(5);
    expect(stars.map((s) => s.getAttribute("aria-label"))).toEqual(["1", "2", "3", "4", "5"]);
    expect(stars.every((s) => s.getAttribute("aria-checked") === "false")).toBe(true);
  });

  it("clicking the star labelled 1 — the DOM-first star, which sits at the document's start edge — reports 1, not 5", () => {
    const onChange = vi.fn();
    render(<StarRating label="تقييم الجلسة" name="sessionStars" value={0} onChange={onChange} />);
    const first = screen.getByRole("radio", { name: "1" });
    first.click();
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("does not lay the row out with flex-row-reverse — that would undo the RTL fill direction", () => {
    render(<StarRating label="تقييم الجلسة" name="sessionStars" value={0} onChange={vi.fn()} />);
    const group = screen.getByRole("radiogroup");
    expect(group.className).not.toMatch(/row-reverse/);
  });

  it("a value of 3 fills exactly the first three stars in DOM order — the three at the document's start edge in RTL — and marks star 3 as the radiogroup's checked item", () => {
    render(<StarRating label="تقييم الجلسة" name="sessionStars" value={3} onChange={vi.fn()} />);
    const stars = screen.getAllByRole("radio");
    expect(stars.map((s) => s.textContent)).toEqual(["★", "★", "★", "☆", "☆"]);
    expect(stars.map((s) => s.getAttribute("aria-checked"))).toEqual(["false", "false", "true", "false", "false"]);
  });

  it("carries the value in a hidden input under the given name, for FormData", () => {
    render(<StarRating label="تقييم الجلسة" name="sessionStars" value={4} onChange={vi.fn()} />);
    const hidden = document.querySelector('input[type="hidden"][name="sessionStars"]') as HTMLInputElement;
    expect(hidden.value).toBe("4");
  });
});
