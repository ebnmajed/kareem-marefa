// FiltersForm — REQ-DSC-005: "Filters combine, and the active set is
// visible and clearable." Real ar/search.json through NextIntlClientProvider;
// next/navigation's router/pathname/searchParams are stubbed since this
// component only reads and writes the URL, never fetches anything itself.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ar from "@/messages/ar/search.json";
import type { SearchFilterOptions } from "@/lib/dal/search";

const push = vi.fn();
let params = new URLSearchParams();
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push }),
  usePathname: () => "/ar/app/sessions",
  useSearchParams: () => params,
}));

const { FiltersForm } = await import("@/components/search/filters-form");

const options: SearchFilterOptions = {
  categories: [{ id: "cat1", name: "فني" }],
  venues: [{ id: "v1", name: "القاعة الكبرى" }],
  companies: [{ id: "c1", name: "شركة أ" }],
};

function renderForm() {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <FiltersForm options={options} />
    </NextIntlClientProvider>,
  );
}

describe("FiltersForm", () => {
  beforeEach(() => {
    push.mockClear();
    params = new URLSearchParams();
  });

  it("★ REQ-DSC-005: applying the query and category filters combines them into one URL", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(ar.search.filters.queryLabel), { target: { value: "الذكاء" } });
    fireEvent.change(screen.getByLabelText(ar.search.filters.categoryLabel), { target: { value: "cat1" } });
    fireEvent.click(screen.getByRole("button", { name: ar.search.filters.apply }));

    expect(push).toHaveBeenCalledTimes(1);
    const url = new URL(push.mock.calls[0][0], "https://example.com");
    expect(url.searchParams.get("q")).toBe("الذكاء");
    expect(url.searchParams.get("category")).toBe("cat1");
  });

  it("shows the active filters as removable chips, and clear-all navigates to the bare path", () => {
    params = new URLSearchParams({ q: "الذكاء", level: "advanced" });
    renderForm();
    expect(screen.getByText("الذكاء", { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: ar.search.filters.clearAll }));
    expect(push).toHaveBeenCalledWith("/ar/app/sessions");
  });

  it("removing one chip keeps the others", () => {
    params = new URLSearchParams({ q: "الذكاء", level: "advanced" });
    renderForm();
    const chip = screen.getByRole("button", { name: /الذكاء/ });
    fireEvent.click(chip);

    const url = new URL(push.mock.calls[0][0], "https://example.com");
    expect(url.searchParams.get("q")).toBeNull();
    expect(url.searchParams.get("level")).toBe("advanced");
  });
});
