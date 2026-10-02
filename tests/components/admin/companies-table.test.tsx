// SCR-048's team colour (REQ-UIX-043, DEC-183 §4.11, DEC-186 §8) — the seven
// named colours and «بلا لون», each with a swatch AND its name in words
// (never colour alone), through a per-row `ui/menu` since the screen has no
// other per-row edit form.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { AdminCompany } from "@/lib/dal/admin-lists";
import ar from "@/messages/ar/admin.json";

const toggleCompany = vi.fn();
const setCompanyTeamColour = vi.fn();
vi.mock("@/app/[locale]/app/admin/companies/actions", () => ({ toggleCompany, setCompanyTeamColour }));

const { CompaniesTable } = await import("@/app/[locale]/app/admin/companies/companies-table");

function Wrap({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider locale="ar" messages={ar}>{children}</NextIntlClientProvider>;
}

const COMPANIES: AdminCompany[] = [
  { id: "co1", name: "شركة الأولى", deactivatedAt: null, memberCount: 3, activeMemberCount: 3, teamColor: "#35d0ff" },
  { id: "co2", name: "شركة الثانية", deactivatedAt: null, memberCount: 0, activeMemberCount: 0, teamColor: null },
];

describe("CompaniesTable — the team colour", () => {
  it("a company with a colour shows its name, not just the swatch — colour is never the only channel", () => {
    render(<Wrap><CompaniesTable companies={COMPANIES} locale="ar" /></Wrap>);
    expect(screen.getAllByText("سماوي").length).toBeGreaterThan(0);
  });

  it("a company with none shows «بلا لون»", () => {
    render(<Wrap><CompaniesTable companies={COMPANIES} locale="ar" /></Wrap>);
    expect(screen.getAllByText("بلا لون").length).toBeGreaterThan(0);
  });

  it("the menu offers all seven named colours plus «بلا لون», and marks the current one", async () => {
    const user = userEvent.setup();
    render(<Wrap><CompaniesTable companies={COMPANIES} locale="ar" /></Wrap>);
    const triggers = screen.getAllByRole("button", { name: /سماوي/ });
    await user.click(triggers[0]);
    const menu = screen.getByRole("menu");
    const names = ["فضي", "يوسفي", "فوشي", "سماوي", "ذهبي", "بنفسجي", "نعناعي", "بلا لون"];
    for (const name of names) expect(within(menu).getByRole("menuitem", { name })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "سماوي" })).toHaveAttribute("aria-current", "page");
  });

  it("choosing a colour posts its NAME through the server action — never a hex from the client", async () => {
    const user = userEvent.setup();
    render(<Wrap><CompaniesTable companies={COMPANIES} locale="ar" /></Wrap>);
    const triggers = screen.getAllByRole("button", { name: /بلا لون/ });
    await user.click(triggers[triggers.length - 1]);
    const menu = screen.getByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "ذهبي" }));
    expect(setCompanyTeamColour).toHaveBeenCalledWith("ar", "co2", "gold");
  });

  it("choosing «بلا لون» posts null", async () => {
    const user = userEvent.setup();
    render(<Wrap><CompaniesTable companies={COMPANIES} locale="ar" /></Wrap>);
    const triggers = screen.getAllByRole("button", { name: /سماوي/ });
    await user.click(triggers[0]);
    const menu = screen.getByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "بلا لون" }));
    expect(setCompanyTeamColour).toHaveBeenCalledWith("ar", "co1", null);
  });
});
