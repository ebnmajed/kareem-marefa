// SCR-080's per-row acts — wave 8 (`docs/plan/notes/platform.md` W8.3).
// REQ-TEN-006, REQ-NFR-014, REQ-UIX-013, REQ-UIX-007.
//
// What a capture cannot show: each destructive dialog NAMES THE ORG and states
// the consequence before the press, both forms are `noValidate` with the app's
// error beside its field, a refused slug keeps what was typed and deletes
// nothing, and reinstating answers even when it is refused (notes F4).
import { NextIntlClientProvider } from "next-intl";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Direction } from "radix-ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import arPlatform from "@/messages/ar/platform.json";
import arUi from "@/messages/ar/ui.json";

const suspendOrgAction = vi.fn();
const deleteOrgAction = vi.fn();
const reinstateOrgAction = vi.fn();
vi.mock("@/app/[locale]/app/platform/orgs/actions", () => ({
  suspendOrgAction: (...a: unknown[]) => suspendOrgAction(...a),
  deleteOrgAction: (...a: unknown[]) => deleteOrgAction(...a),
  reinstateOrgAction: (...a: unknown[]) => reinstateOrgAction(...a),
}));
const show = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show }) }));

const { OrgActions } = await import("@/app/[locale]/app/platform/orgs/org-actions");
import type { OrgSummary } from "@/lib/dal/platform";

const ORG: OrgSummary = {
  id: "0c1a3a2e-6a55-4d6f-8f1e-3f5b0b9e2a11",
  name: "Acme للاستشارات",
  slug: "acme",
  status: "active",
  createdAt: "2026-09-01T00:00:00Z",
  members: 12,
  activeMembers: 10,
  sessions: 4,
  publishedSessions: 2,
  completedSessions: 1,
  certificates: 3,
};

function renderActions(org: OrgSummary = ORG) {
  return render(
    <NextIntlClientProvider locale="ar" messages={{ ...arPlatform, ...arUi }}>
      <Direction.Provider dir="rtl">
        <OrgActions org={org} locale="ar" />
      </Direction.Provider>
    </NextIntlClientProvider>,
  );
}

async function choose(item: string) {
  await userEvent.click(screen.getByRole("button", { name: "إجراءات Acme للاستشارات" }));
  await userEvent.click(screen.getByRole("menuitem", { name: item }));
}

beforeEach(() => {
  suspendOrgAction.mockReset();
  deleteOrgAction.mockReset();
  reinstateOrgAction.mockReset();
  show.mockReset();
});

describe("OrgActions", () => {
  it("suspension confirms in a dialog that names the org and says what suspension does, before the press", async () => {
    renderActions();
    await choose("إيقاف المؤسسة");
    const dialog = screen.getByRole("dialog");
    const title = within(dialog).getByRole("heading");
    expect(title).toHaveTextContent("إيقاف Acme للاستشارات");
    expect(within(title).getByText("Acme للاستشارات").tagName).toBe("BDI");
    expect(dialog).toHaveTextContent("لا يحذف شيئًا");
    expect(dialog.querySelector("form")).toHaveAttribute("novalidate");
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
  });

  it("a refused reason stays in the dialog, beside its field; an accepted one closes it and says so", async () => {
    suspendOrgAction
      .mockResolvedValueOnce({ errors: { reason: "reason_required" }, formError: null, values: { reason: "" }, lists: {}, attempt: 1 })
      .mockResolvedValueOnce({ errors: {}, formError: null, values: { reason: "مخالفة" }, lists: {}, attempt: 0 });
    renderActions();
    await choose("إيقاف المؤسسة");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /^أوقف/ }));
    });
    expect(await screen.findByText("السبب مطلوب، ولا يقلّ عن ثلاثة أحرف.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.type(screen.getByRole("textbox"), "مخالفة شروط الاستخدام");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /^أوقف/ }));
    });
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ tone: "success", title: expect.stringContaining("Acme للاستشارات") }));
  });

  it("★ deletion asks for the slug typed back; a mismatch keeps the dialog, the typing and the org", async () => {
    deleteOrgAction.mockResolvedValueOnce({
      errors: { confirmSlug: "slug_mismatch" },
      formError: null,
      values: { confirmSlug: "acme-typo" },
      lists: {},
      attempt: 1,
    });
    renderActions();
    await choose("حذف المؤسسة");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading")).toHaveTextContent("حذف Acme للاستشارات نهائيًا");
    expect(dialog).toHaveTextContent("لا يمكن التراجع عنه");
    const slug = within(dialog).getByText("acme");
    expect(slug.tagName).toBe("BDI");
    const input = within(dialog).getByRole("textbox");
    expect(input).toHaveAttribute("dir", "ltr");
    await userEvent.type(input, "acme-typo");
    await act(async () => {
      await userEvent.click(within(dialog).getByRole("button", { name: /احذف نهائيًا/ }));
    });
    expect(await screen.findByText(/لا يطابق معرّف المؤسسة/)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("acme-typo");
    expect(show).not.toHaveBeenCalled();
  });

  it("a suspended org offers reinstatement, and a refused one says why rather than nothing (F4)", async () => {
    reinstateOrgAction.mockResolvedValueOnce({ error: "org_not_found_or_active" });
    renderActions({ ...ORG, status: "suspended" });
    await choose("أعد التفعيل");
    await vi.waitFor(() => expect(show).toHaveBeenCalledWith({ title: "المؤسسة غير موقوفة، أو لم تعد موجودة.", tone: "error" }));
  });
});
