// SCR-080's list — wave 8 (`docs/plan/notes/platform.md` W8.3), sync 4's finding.
// REQ-NFR-014, REQ-UIX-012.
//
// An org with a deletion requested is offered no acts (`0097`), and its card must
// say why in one line rather than show «الإجراءات» beside nothing. A live org's
// row still carries its menu.
import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { Direction } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import arPlatform from "@/messages/ar/platform.json";
import arAdmin from "@/messages/ar/admin.json";
import type { OrgSummary } from "@/lib/dal/platform";

vi.mock("@/app/[locale]/app/platform/orgs/actions", () => ({
  suspendOrgAction: vi.fn(),
  deleteOrgAction: vi.fn(),
  reinstateOrgAction: vi.fn(),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));

const { OrgsTable } = await import("@/app/[locale]/app/platform/orgs/orgs-table");

const org = (over: Partial<OrgSummary>): OrgSummary => ({
  id: "0c1a3a2e-6a55-4d6f-8f1e-3f5b0b9e2a11",
  name: "مؤسسة",
  slug: "org",
  status: "active",
  createdAt: "2026-09-01T00:00:00Z",
  members: 1,
  activeMembers: 1,
  sessions: 0,
  publishedSessions: 0,
  completedSessions: 0,
  certificates: 0,
  deletionPending: false,
  ...over,
});

describe("OrgsTable", () => {
  it("★ a pending-deletion org says why it has no acts, badged «قيد الحذف»; a live org keeps its menu", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={{ ...arPlatform, ...arAdmin }}>
        <Direction.Provider dir="rtl">
          <OrgsTable
            locale="ar"
            orgs={[
              org({ id: "0c1a3a2e-6a55-4d6f-8f1e-3f5b0b9e2a11", name: "مؤسسة للحذف", status: "suspended", deletionPending: true }),
              org({ id: "1d2b4b3f-7b66-4e70-9f2f-4a6c1caf3b22", name: "مؤسسة قائمة" }),
            ]}
          />
        </Direction.Provider>
      </NextIntlClientProvider>,
    );
    // jsdom has no media queries, so the table and the card list are both present.
    expect(screen.getAllByText("لا إجراء — الحذف قيد التنفيذ.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("قيد الحذف").length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: "إجراءات مؤسسة للحذف" })).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "إجراءات مؤسسة قائمة" }).length).toBeGreaterThan(0);
  });
});
