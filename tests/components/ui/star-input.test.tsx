// `ui/star-input` — REQ-UIX-064, DEC-213 §5.124. «Stars fill from the right in RTL» is the one detail
// `09` flags as the most-missed RTL bug in the product (REQ-RAT-002).
//
// ★ The seven cases of the first block are `tests/components/event/star-rating.test.tsx`'s, carried with the
// component they tested (wave 19, one ledger line each): the subject is now the primitive and «مطلوب»
// arrives as a prop; every expectation is unchanged. The rest are the primitive's own.
//
// The mechanism, not the picture: the fill, the hover preview and the read-back are CSS (`:has()`),
// which jsdom does not evaluate; `tests/e2e/wave7-sessions-rate.spec.ts` and
// `tests/e2e/wave19-event-rate.spec.ts` measure them in a browser. jsdom's document is RTL
// (`vitest.config.ts`).
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StarInputEditableProps, StarLabels } from "@/components/ui";
import { StarInput } from "@/components/ui/star-input";

const LABELS: StarLabels = ["نجمة واحدة", "نجمتان", "3 نجوم", "4 نجوم", "5 نجوم"];

function renderStars(props: Partial<StarInputEditableProps> = {}) {
  return render(
    <form data-testid="form">
      <StarInput name="sessionStars" legend="تقييم الجلسة" starLabels={LABELS} {...props} />
    </form>,
  );
}

describe("StarInput — carried from star-rating.test.tsx", () => {
  it("is one radiogroup named by its legend, with five native radios in ascending DOM order", () => {
    renderStars();
    const group = screen.getByRole("radiogroup", { name: /تقييم الجلسة/ });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(5);
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(["1", "2", "3", "4", "5"]);
    expect(radios.every((r) => r.tagName === "INPUT")).toBe(true);
  });

  it("names each star as a count with its Arabic plural, not a bare digit", () => {
    renderStars();
    expect(screen.getByRole("radio", { name: "نجمة واحدة" })).toHaveAttribute("value", "1");
    expect(screen.getByRole("radio", { name: "نجمتان" })).toHaveAttribute("value", "2");
    expect(screen.getByRole("radio", { name: "3 نجوم" })).toHaveAttribute("value", "3");
    expect(screen.getByRole("radio", { name: "5 نجوم" })).toHaveAttribute("value", "5");
  });

  it("★ never lays the row out reversed — that is what would make five stars read as one in Arabic", () => {
    const { container } = renderStars();
    for (const el of container.querySelectorAll("*")) expect(el.getAttribute("class") ?? "").not.toMatch(/row-reverse/);
  });

  it("the star picked is the value the form submits", () => {
    renderStars();
    fireEvent.click(screen.getByRole("radio", { name: "5 نجوم" }));
    expect(new FormData(screen.getByTestId("form") as HTMLFormElement).get("sessionStars")).toBe("5");
  });

  it("starts from the value it is given — a saved rating, or what a failed round trip handed back", () => {
    renderStars({ defaultValue: 4 });
    expect(screen.getByRole("radio", { name: "4 نجوم" })).toBeChecked();
    expect(new FormData(screen.getByTestId("form") as HTMLFormElement).get("sessionStars")).toBe("4");
  });

  it("marks required with «مطلوب» and an error as an adjacent, described message", () => {
    renderStars({ required: true, requiredLabel: "مطلوب", error: "اختر عدد النجوم" });
    const group = screen.getByRole("radiogroup");
    expect(group).toHaveTextContent("مطلوب");
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAttribute("aria-describedby", "sessionStars-error");
    expect(document.getElementById("sessionStars-error")).toHaveTextContent("اختر عدد النجوم");
  });

  it("the read-only face reads as the label and the count, and draws the chosen stars first in DOM order", () => {
    const { container } = render(<StarInput readOnly value={3} legend="تقييم الجلسة" label="تقييم الجلسة: 3 نجوم" starLabels={LABELS} />);
    expect(screen.getByRole("img", { name: "تقييم الجلسة: 3 نجوم" })).toBeInTheDocument();
    const fills = [...container.querySelectorAll("path")].map((p) => p.getAttribute("fill"));
    expect(fills).toEqual(["currentColor", "currentColor", "currentColor", "none", "none"]);
  });
});

describe("StarInput — the primitive's own", () => {
  it("★ star 1 is the first child of the row, so in an RTL document it stands at the inline start — the right", () => {
    renderStars();
    const first = screen.getByRole("radio", { name: "نجمة واحدة" }).closest("label")!;
    expect(first.parentElement!.firstElementChild).toBe(first);
    expect(document.documentElement.dir || getComputedStyle(document.documentElement).direction).toMatch(/rtl/);
  });

  it("each radio's parent is its star, so pressing the star is what chooses it", () => {
    renderStars();
    const radio = screen.getByRole("radio", { name: "3 نجوم" });
    expect(radio.parentElement!.tagName).toBe("LABEL");
    fireEvent.click(radio.parentElement!);
    expect(radio).toBeChecked();
  });

  it("an empty row submits nothing — no opinion is not zero", () => {
    renderStars();
    expect(new FormData(screen.getByTestId("form") as HTMLFormElement).get("sessionStars")).toBeNull();
  });

  it("the read-back holds one line per count, hidden from assistive technology, each shown by its own checked radio", () => {
    const { container } = renderStars();
    const back = container.querySelector('[data-slot="read-back"]')!;
    expect(back).toHaveAttribute("aria-hidden", "true");
    const lines = [...back.querySelectorAll("[data-value]")];
    expect(lines.map((l) => l.textContent)).toEqual([...LABELS]);
    lines.forEach((line, i) => {
      expect(line.className).toContain("hidden");
      expect(line.className).toContain(`input[value='${i + 1}']:checked`);
    });
    expect(back.querySelector("svg")).toBeNull();
  });

  it("the fill and the hover preview are classes on the star, from the right: a later sibling's state fills it", () => {
    renderStars();
    const star = screen.getByRole("radio", { name: "نجمتان" }).closest("label")!;
    expect(star.className).toContain("[&:has(~label_:checked)]:text-signal");
    expect(star.className).toContain("[@media(hover:hover)]:[&:has(~label:hover)]:text-signal");
    expect(star.className).toContain("[@media(hover:hover)]:[label:hover~&:not(:hover)]:text-edge-strong");
    expect(star.className).not.toMatch(/scale-|transition|animate-|team/);
  });

  it("disabled disables every radio through the fieldset", () => {
    renderStars({ disabled: true });
    expect(screen.getByRole("radiogroup")).toBeDisabled();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  });

  it("the read-only face has no radio and no radiogroup — the closed window offers nothing to change", () => {
    render(<StarInput readOnly value={5} legend="تقييم المُقدِّم" label="تقييم المُقدِّم: 5 نجوم" starLabels={LABELS} size="lg" />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("img", { name: "تقييم المُقدِّم: 5 نجوم" })).toBeInTheDocument();
  });
});
