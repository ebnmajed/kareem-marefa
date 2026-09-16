// The `ProposalMaterials` slot — REQ-PRO-004. Real ar/materials.json through
// next-intl's createTranslator; only src/lib/dal/materials.ts is mocked.
// UploadForm calls useRouter() for its post-upload refresh, which jsdom has
// no app router mounted for (tests/components/materials/list.test.tsx's own
// convention).
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/materials.json";
import arBrowse from "@/messages/ar/browse.json";
import type { ProposalMaterialsPageData } from "@/lib/dal/materials";

// `UploadForm`'s `ui/file-drop` reads `browse.fileDrop` — merged in here so
// the (canManage) tests below, which render it, do not hit a missing-message
// error the moment the drop zone paints.
const messages = { ...ar, browse: { fileDrop: arBrowse.browse.fileDrop } };

vi.mock("@/lib/dal/materials", () => ({ getProposalMaterialsPageData: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "materials.list" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { getProposalMaterialsPageData } = await import("@/lib/dal/materials");
const { ProposalMaterials } = await import("@/components/materials/proposal-list");

const proposalId = "11111111-1111-1111-1111-111111111111";
const uploadLimits = { documentMb: 50, audioMb: 200, imageMb: 20 };
const base: ProposalMaterialsPageData = { materials: [], canManage: false, uploadLimits };

async function renderSlot(data: ProposalMaterialsPageData) {
  vi.mocked(getProposalMaterialsPageData).mockResolvedValue(data);
  const element = await ProposalMaterials({ proposalId, memberId: "m1", locale: "ar" });
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );
}

describe("ProposalMaterials slot", () => {
  it("shows the empty state and hides the upload form from a viewer who cannot manage the proposal", async () => {
    await renderSlot({ ...base });
    expect(screen.getByText("لا توجد مواد لهذه الجلسة بعد.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "رفع" })).not.toBeInTheDocument();
  });

  it("★ REQ-PRO-004: shows the upload form to the proposal's own owner, with no phase selector (a draft carries no session yet)", async () => {
    await renderSlot({ ...base, canManage: true });
    expect(screen.getByRole("button", { name: "رفع" })).toBeInTheDocument();
    expect(screen.queryByText("التوقيت")).not.toBeInTheDocument();
  });

  it("lists a draft material, bidi-isolated, with the font-substitution warning when present, and no viewer link", async () => {
    await renderSlot({
      materials: [
        {
          id: "mat1",
          kind: "pdf",
          title: "شرائح المقترح",
          phase: "after",
          allowDownload: true,
          renderStatus: "pending",
          fontSubstitutionWarning: "Amiri",
          externalUrl: null,
          currentVersionId: null,
          createdAt: "2026-09-14T00:00:00Z",
        },
      ],
      canManage: true,
      uploadLimits,
    });
    const title = screen.getByText("شرائح المقترح");
    expect(title.closest("bdi")).not.toBeNull();
    // The family name is now inside its own <bdi>, so the sentence spans
    // multiple text nodes — match on the paragraph's own full textContent.
    expect(screen.getByText((_, el) => el?.textContent === 'الخط "Amiri" غير مضمَّن في ملف PDF، فقد تختلف الحروف العربية عن الأصل. صدّر الملف مع تضمين الخطوط وارفعه من جديد.')).toBeInTheDocument();
    expect(screen.queryByText("فتح العارض")).not.toBeInTheDocument();
  });
});
