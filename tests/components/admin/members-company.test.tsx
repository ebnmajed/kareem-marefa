// Wave 27 — «غيّر الشركة» on SCR-049's row (REQ-PRF-013, DEC-254 §2.6, DEC-255 §4; STORY-ADM-013). The RPC is the
// authority and is proved in `tests/rls/member-company.test.ts`; this file proves what the menu offers and posts.
import type React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { ConsoleMemberRow } from "@/lib/dal/admin-members";
import type { RowState } from "@/app/[locale]/app/admin/members/actions";
import adminAr from "@/messages/ar/admin.json";
import uiAr from "@/messages/ar/ui.json";

const changeCompany = vi.fn<(locale: string, memberId: string, prev: RowState, fd: FormData) => Promise<RowState>>();
vi.mock("@/app/[locale]/app/admin/members/actions", () => ({
  changeCompany: (...a: unknown[]) => changeCompany(...(a as Parameters<typeof changeCompany>)),
  changeRole: vi.fn(),
  deactivate: vi.fn(),
  reactivate: vi.fn(),
  removeUnbound: vi.fn(),
  resendInvitation: vi.fn(),
}));

const { MemberRowMenu } = await import("@/app/[locale]/app/admin/members/member-row-menu");

const messages = { ...adminAr, ...uiAr };
const MEMBER = {
  id: "m1",
  email: "sara@acme.example",
  displayName: "سارة العتيبي",
  companyId: null,
  companyName: null,
  teamColor: undefined,
  jobTitle: null,
  role: "member",
  status: "active",
  deactivatedAt: null,
  deactivatedReason: null,
  createdAt: "2026-01-01T00:00:00Z",
  avatarUrl: null,
  points: 0,
  levelName: null,
  hasSignedIn: true,
  invitedBy: null,
} as unknown as ConsoleMemberRow;
const COMPANIES = [
  { id: "11111111-1111-4111-8111-111111111111", name: "أكمي", active: true },
  { id: "22222222-2222-4222-8222-222222222222", name: "شركة معطّلة", active: false },
];

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <main>{children}</main>
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

const openDialog = async () => {
  render(<MemberRowMenu member={MEMBER} locale="ar" lastAdmin={false} companies={COMPANIES} />, { wrapper: Wrap });
  await userEvent.click(screen.getByRole("button", { name: "مزيد من الإجراءات على سارة العتيبي" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "غيّر الشركة" }));
  return screen.getByRole("dialog");
};

beforeEach(() => changeCompany.mockReset());

describe("«غيّر الشركة» — REQ-PRF-013", () => {
  it("offers «بلا شركة» and the ACTIVE companies — a deactivated one places nobody (DEC-255 §4)", async () => {
    const dialog = await openDialog();
    expect(within(dialog).getByRole("heading")).toHaveTextContent("سارة العتيبي");
    const options = within(dialog).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["بلا شركة", "أكمي"]);
    expect(within(dialog).getByRole("combobox", { name: "الشركة" })).toHaveValue("none");
  });

  it("posts the chosen company, toasts from the result and closes", async () => {
    changeCompany.mockResolvedValue({ error: null, done: true });
    const dialog = await openDialog();
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "الشركة" }), "أكمي");
    await userEvent.click(within(dialog).getByRole("button", { name: "احفظ" }));
    await waitFor(() => expect(changeCompany).toHaveBeenCalled());
    const [, memberId, , fd] = changeCompany.mock.calls[0];
    expect(memberId).toBe("m1");
    expect(fd.get("companyId")).toBe(COMPANIES[0].id);
    expect(await screen.findByText("حُفظت الشركة.", { exact: true })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a refusal is said, and the dialog stays", async () => {
    changeCompany.mockResolvedValue({ error: "company_deactivated", done: false });
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole("button", { name: "احفظ" }));
    expect(await screen.findByText("هذه الشركة معطّلة.", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("is axe-clean", async () => {
    const dialog = await openDialog();
    expect((await axe.run(dialog)).violations).toEqual([]);
  });
});
