// SCR-082 — wave 8 (`docs/plan/notes/platform.md` W8.5). REQ-TEN-007, REQ-UIX-013.
//
// Contract 4 at the screen: the add form accepts any case and the acknowledgement
// names the domain AS STORED; removing one confirms by name and says, before the
// press, that nobody loses access; the first-admin form is `noValidate`.
import { NextIntlClientProvider } from "next-intl";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Direction } from "radix-ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import arPlatform from "@/messages/ar/platform.json";
import arUi from "@/messages/ar/ui.json";
import arAdmin from "@/messages/ar/admin.json";

const show = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show }) }));

const { AddDomainForm, FirstAdminForm } = await import("@/app/[locale]/app/platform/orgs/[id]/domains/forms");
const { DomainsTable } = await import("@/app/[locale]/app/platform/orgs/[id]/domains/domains-table");
import type { AddDomainState } from "@/app/[locale]/app/platform/orgs/[id]/domains/state";

const messages = { ...arPlatform, ...arUi, ...arAdmin };
const wrap = (node: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <Direction.Provider dir="rtl">{node}</Direction.Provider>
    </NextIntlClientProvider>,
  );

beforeEach(() => show.mockReset());

describe("SCR-082 domains", () => {
  it("★ contract 4: a mixed-case domain is accepted and the toast names the stored, lowercase form", async () => {
    const action = vi.fn(async (): Promise<AddDomainState> => ({ errors: {}, formError: null, values: {}, lists: {}, attempt: 0, done: "added", stored: "mixed-case.example" }));
    const { container } = wrap(<AddDomainForm action={action} />);
    expect(container.querySelector("form")).toHaveAttribute("novalidate");
    const input = screen.getByLabelText(/^النطاق/);
    expect(input).toHaveAttribute("dir", "ltr");
    expect(screen.getByText(/بأي حالة أحرف/)).toBeInTheDocument();
    await userEvent.type(input, "Mixed-Case.Example");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /أضف النطاق/ }));
    });
    await vi.waitFor(() => expect(show).toHaveBeenCalled());
    expect(show.mock.calls[0][0].title).toContain("mixed-case.example");
    expect(show.mock.calls[0][0].title).not.toContain("Mixed-Case");
  });

  it("a domain already on the list says so instead of «saved»", async () => {
    const action = vi.fn(async (): Promise<AddDomainState> => ({ errors: {}, formError: null, values: {}, lists: {}, attempt: 0, done: "present", stored: "example.com" }));
    wrap(<AddDomainForm action={action} />);
    await userEvent.type(screen.getByLabelText(/^النطاق/), "EXAMPLE.com");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /أضف النطاق/ }));
    });
    await vi.waitFor(() => expect(show).toHaveBeenCalledWith(expect.objectContaining({ tone: "info", title: expect.stringContaining("موجود في القائمة") })));
  });

  it("removal confirms by name and says, before the press, that nobody loses access", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    wrap(<DomainsTable domains={["example.com"]} remove={remove} />);
    const buttons = screen.getAllByRole("button", { name: "احذف example.com" });
    await userEvent.click(buttons[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading")).toHaveTextContent("إزالة example.com");
    expect(dialog).toHaveTextContent("لا يفقد أحد وصوله");
    expect(remove).not.toHaveBeenCalled();
    await act(async () => {
      await userEvent.click(within(dialog).getByRole("button", { name: "احذف" }));
    });
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith("example.com"));
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ tone: "success" }));
  });

  it("the first-admin form shows the stored address, is noValidate, and is axe-clean", async () => {
    const { container } = wrap(<FirstAdminForm current="boss@example.com" action={async (prev) => prev} />);
    expect(container.querySelector("form")).toHaveAttribute("novalidate");
    expect(screen.getByLabelText(/^بريد أول مشرف/)).toHaveValue("boss@example.com");
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
  });
});
