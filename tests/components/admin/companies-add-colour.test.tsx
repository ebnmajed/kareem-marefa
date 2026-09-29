// ★ wave 16 (DEC-195 §3, REQ-UIX-043, STORY-UIX-032): the team colour is chosen
// while the company is added — the seven names and «بلا لون», a swatch and the
// name in words, never a hex field; the insert carries it. And no logo (§4).
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/admin.json";

const createCompany = vi.fn(async () => {});
vi.mock("@/lib/dal/admin-lists", async () => {
  const { z } = await import("zod");
  return {
    companyInput: z.object({ name: z.string().trim().min(1).max(120) }).strict(),
    createCompany,
    setCompanyActive: vi.fn(),
    setCompanyTeamColor: vi.fn(),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { addCompany } = await import("@/app/[locale]/app/admin/companies/actions");
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
      <NextIntlClientProvider locale="ar" messages={ar}>
        <CompanyForm action={async (s) => s} />
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

describe("addCompany — the insert carries the colour", () => {
  it("a named colour becomes its #rrggbb", async () => {
    await addCompany("ar", emptyCompanyState, form({ name: "مواهب", teamColour: "cyan" }));
    expect(createCompany).toHaveBeenCalledWith("ar", { name: "مواهب" }, "#35d0ff");
  });

  it("«بلا لون» inserts null", async () => {
    await addCompany("ar", emptyCompanyState, form({ name: "مواهب", teamColour: "none" }));
    expect(createCompany).toHaveBeenCalledWith("ar", { name: "مواهب" }, null);
  });

  it("a form that posts no colour — an older page across a deploy — inserts null", async () => {
    await addCompany("ar", emptyCompanyState, form({ name: "مواهب" }));
    expect(createCompany).toHaveBeenCalledWith("ar", { name: "مواهب" }, null);
  });

  it("★ a hex or an unknown name is refused at the field and nothing is written", async () => {
    for (const bad of ["#35d0ff", "#35D0FF", "red", "logo"]) {
      const state = await addCompany("ar", emptyCompanyState, form({ name: "مواهب", teamColour: bad }));
      expect(state.errors.teamColour).toBe("teamColourInvalid");
    }
    expect(createCompany).not.toHaveBeenCalled();
  });

  it("a missing name and a bad colour are both reported", async () => {
    const state = await addCompany("ar", emptyCompanyState, form({ name: "", teamColour: "red" }));
    expect(state.errors.name).toBe("nameRequired");
    expect(state.errors.teamColour).toBe("teamColourInvalid");
  });
});
