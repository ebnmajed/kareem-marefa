// ui/page-header, ui/section-header, ui/icon-button, ui/prose — the four
// lead primitives that were still M9 stubs when wave 6 opened (DEC-130).
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { describe, expect, it } from "vitest";
import { IconButton } from "@/components/ui/icon-button";
import { CloseIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Prose } from "@/components/ui/prose";
import { SectionHeader } from "@/components/ui/section-header";

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={{}}>
      <Direction.Provider dir="rtl">{children}</Direction.Provider>
    </NextIntlClientProvider>
  );
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => v.id)).toEqual([]);
}

describe("PageHeader", () => {
  it("owns the page's one h1, isolates the title, and names its breadcrumb landmark", async () => {
    const { container } = render(
      <PageHeader
        title="How we halved reporting time — تقرير"
        description="جلسة عملية"
        breadcrumb={[{ href: "/app/sessions", label: "الجلسات" }]}
        breadcrumbLabel="مسار الصفحة"
        actions={<button type="button">احجز</button>}
      />,
      { wrapper: Wrap },
    );
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.querySelector("bdi")).not.toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const nav = screen.getByRole("navigation", { name: "مسار الصفحة" });
    // Through ui/link: the locale is prefixed, so a header written with
    // `/app/sessions` lands on `/ar/app/sessions`.
    expect(nav.querySelector("a")).toHaveAttribute("href", "/ar/app/sessions");
    await expectAccessible(container);
  });

  it("renders no breadcrumb, eyebrow, description or action row that was not given", () => {
    const { container } = render(<PageHeader title="الجلسات" />, { wrapper: Wrap });
    expect(container.querySelector("nav")).toBeNull();
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});

describe("SectionHeader", () => {
  it("is an h2 by default, carries the jump target id, and prints its count in Western digits", async () => {
    const { container } = render(<SectionHeader title="المواد" id="materials" count={12} />);
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2).toHaveAttribute("id", "materials");
    expect(h2.textContent).toContain("12");
    expect(h2.textContent ?? "").not.toMatch(/[٠-٩۰-۹]/);
    await expectAccessible(container);
  });

  it("renders as h3 when asked", () => {
    render(<SectionHeader title="الملفات" as="h3" />);
    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
  });
});

describe("IconButton", () => {
  it("is named by its label, is a 44 px square by default, and is not a submit button", async () => {
    const { container } = render(
      <IconButton label="إغلاق">
        <CloseIcon />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "إغلاق" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("size-11");
    await expectAccessible(container);
  });

  it("keeps its name while pending, and cannot be pressed twice", () => {
    render(
      <IconButton label="حفظ" pending>
        <CloseIcon />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "حفظ" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
  });
});

describe("Prose", () => {
  it("applies the body ramp and a readable measure, and never justifies", () => {
    const { container } = render(
      <Prose>
        <p>فقرة أولى</p>
        <p>فقرة ثانية</p>
      </Prose>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("text-body");
    expect(root.className).toContain("max-w-prose");
    expect(root.className).not.toMatch(/text-justify|tracking-/);
  });
});
