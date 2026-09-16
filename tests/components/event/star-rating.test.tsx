// SCR-015: "stars fill from the right in RTL" — the one detail `09` flags as
// the most-missed RTL bug in the product (REQ-RAT-002). Rewritten in wave 7 for
// the native-radio control (DEC-141); its guarantees carry over and one is added:
//
//   · star 1 is FIRST in DOM order, so a browser draws it at the inline start —
//     the right in this RTL jsdom document (`vitest.config.ts`);
//   · the row is never `row-reverse`, which would undo that;
//   · ★ each radio's accessible name is the plural COUNT («نجمتان», «5 نجوم»),
//     not a bare digit.
//
// The mechanism, not the picture: the fill is CSS (`:has()`), which jsdom does
// not evaluate; `tests/e2e/wave7-sessions-rate.spec.ts` measures it.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { StarDisplay, StarRating } from "@/components/event/star-rating";
import ratings from "@/messages/ar/ratings.json";
import ui from "@/messages/ar/ui.json";

const messages = { ...ratings, ...ui };

function renderStars(props: Partial<Parameters<typeof StarRating>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <form data-testid="form">
        <StarRating name="sessionStars" legend="تقييم الجلسة" {...props} />
      </form>
    </NextIntlClientProvider>,
  );
}

describe("StarRating", () => {
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
    renderStars({ required: true, error: "اختر عدد النجوم" });
    const group = screen.getByRole("radiogroup");
    expect(group).toHaveTextContent("مطلوب");
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAttribute("aria-describedby", "sessionStars-error");
    expect(document.getElementById("sessionStars-error")).toHaveTextContent("اختر عدد النجوم");
  });
});

describe("StarDisplay", () => {
  it("reads as the label and the count, and draws the chosen stars first in DOM order", () => {
    const { container } = render(
      <NextIntlClientProvider locale="ar" messages={messages}>
        <StarDisplay value={3} label="تقييم الجلسة" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("img", { name: "تقييم الجلسة: 3 نجوم" })).toBeInTheDocument();
    const fills = [...container.querySelectorAll("path")].map((p) => p.getAttribute("fill"));
    expect(fills).toEqual(["currentColor", "currentColor", "currentColor", "none", "none"]);
  });
});
