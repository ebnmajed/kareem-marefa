// ★ wave 16 (DEC-195 §3, REQ-UIX-043, STORY-UIX-032): the team colour is chosen
// while the company is added — the seven names and «بلا لون», a swatch and the
// name in words, never a hex field; the insert carries it. And no logo (§4).
// ★ wave 22: the same form creates and edits (`saveCompany`, `?new=1` / `?edit=<id>`).
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import adminAr from "@/messages/ar/admin.json";
import uiAr from "@/messages/ar/ui.json";

const ar = adminAr;
const messages = { ...adminAr, ...uiAr };

const createCompany = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/dal/admin-lists", async () => {
  const { z } = await import("zod");
  return {
    companyInput: z.object({ name: z.string().trim().min(1).max(120) }).strict(),
    createCompany,
    updateCompany: vi.fn(),
    setCompanyActive: vi.fn(),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { saveCompany } = await import("@/app/[locale]/app/admin/companies/actions");
const { CompanyForm } = await import("@/app/[locale]/app/admin/companies/company-form");
const { emptyCompanyState } = await import("@/app/[locale]/app/admin/companies/state");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => createCompany.mockClear());

describe("the add form — the team colour, chosen while adding", () => {
  function renderForm() {
    render(
      <NextIntlClientProvider locale="ar" messages={messages}>
        <ToastProvider closeLabel="إغلاق">
          <main>
            <CompanyForm action={async (s) => s} company={null} closeHref="/app/admin/companies" />
          </main>
        </ToastProvider>
      </NextIntlClientProvider>,
    );
  }

  it("offers the seven named colours and «بلا لون», each by name, with «بلا لون» chosen", () => {
    renderForm();
    const group = screen.getByRole("radiogroup", { name: "لون الفريق" });
    const radios = group.querySelectorAll('input[type="radio"]');
    expect(radios).toHaveLength(8);
    for (const name of Object.values(ar.admin.companies.teamColourNames)) expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "بلا لون" })).toBeChecked();
  });

  it("★ has no hex field, no free colour input and no logo — a company is a name and a colour (DEC-195 §4)", () => {
    renderForm();
    expect(document.querySelector('input[type="color"]')).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(document.querySelectorAll("input:not([type=radio]):not([type=hidden])")).toHaveLength(1); // the name
    expect(document.body.textContent).not.toMatch(/#[0-9a-f]{6}/i);
  });
});

describe("saveCompany — the insert carries the colour", () => {
  it("a named colour becomes its #rrggbb", async () => {
    await saveCompany("ar", null, emptyCompanyState, form({ name: "مواهب", teamColour: "cyan" }));
    expect(createCompany).toHaveBeenCalledWith("ar", { name: "مواهب" }, "#35d0ff");
  });

  it("«بلا لون» inserts null", async () => {
    await saveCompany("ar", null, emptyCompanyState, form({ name: "مواهب", teamColour: "none" }));
    expect(createCompany).toHaveBeenCalledWith("ar", { name: "مواهب" }, null);
  });

  it("a form that posts no colour — an older page across a deploy — inserts null", async () => {
    await saveCompany("ar", null, emptyCompanyState, form({ name: "مواهب" }));
    expect(createCompany).toHaveBeenCalledWith("ar", { name: "مواهب" }, null);
  });

  it("★ a hex or an unknown name is refused at the field and nothing is written", async () => {
    for (const bad of ["#35d0ff", "#35D0FF", "red", "logo"]) {
      const state = await saveCompany("ar", null, emptyCompanyState, form({ name: "مواهب", teamColour: bad }));
      expect(state.errors.teamColour).toBe("teamColourInvalid");
    }
    expect(createCompany).not.toHaveBeenCalled();
  });

  it("a missing name and a bad colour are both reported", async () => {
    const state = await saveCompany("ar", null, emptyCompanyState, form({ name: "", teamColour: "red" }));
    expect(state.errors.name).toBe("nameRequired");
    expect(state.errors.teamColour).toBe("teamColourInvalid");
  });
});

describe("the form's summary (wave 8, F4)", () => {
  it("the summary's link focuses the name", async () => {
    const { container } = render(
      <NextIntlClientProvider locale="ar" messages={messages}>
        <ToastProvider closeLabel="إغلاق">
          <main>
            <CompanyForm action={async (s) => ({ ...s, errors: { name: "nameRequired" }, attempt: s.attempt + 1 })} company={null} closeHref="/app/admin/companies" />
          </main>
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.submit(container.querySelector("form")!);
    const summary = await screen.findByRole("alert");
    fireEvent.click(within(summary).getAllByRole("link")[0]);
    expect(document.activeElement?.id).toBe("company-name");
  });
});
