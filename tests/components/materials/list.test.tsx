// The `Materials` slot — real ar/materials.json through next-intl's
// createTranslator, only src/lib/dal/materials.ts mocked.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/materials.json";
import type { MaterialsPageData } from "@/lib/dal/materials";

vi.mock("@/lib/dal/materials", () => ({ getMaterialsPageData: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "materials.list" }),
}));
// The slot renders `UploadForm` whenever the viewer can manage this
// session's materials (canManageAll/presenterOfSession) — it calls
// useRouter() for its post-upload refresh, which jsdom has no app router
// mounted for (comment-item.test.tsx's own convention).
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { getMaterialsPageData } = await import("@/lib/dal/materials");
const { Materials } = await import("@/components/materials/list");

const sessionId = "11111111-1111-1111-1111-111111111111";
const base: MaterialsPageData = { materials: [], numerals: "western", canManageAll: false, presenterOfSession: false };

describe("Materials slot", () => {
  it("shows the empty state when the session has no materials visible to this viewer", async () => {
    vi.mocked(getMaterialsPageData).mockResolvedValue({ ...base });
    render(await Materials({ sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText("لا توجد مواد لهذه الجلسة بعد.")).toBeInTheDocument();
  });

  it("bidi-isolates the title, and shows kind + phase", async () => {
    vi.mocked(getMaterialsPageData).mockResolvedValue({
      materials: [
        {
          id: "mat1",
          kind: "pdf",
          title: "شرائح الجلسة الافتتاحية",
          phase: "after",
          allowDownload: true,
          renderStatus: "ready",
          fontSubstitutionWarning: null,
          externalUrl: null,
          currentVersionId: "v1",
          createdAt: "2026-09-14T00:00:00Z",
        },
      ],
      numerals: "western",
      canManageAll: false,
      presenterOfSession: false,
    });
    render(await Materials({ sessionId, memberId: "m1", locale: "ar" }));
    const title = screen.getByText("شرائح الجلسة الافتتاحية");
    expect(title.closest("bdi")).not.toBeNull();
    expect(screen.getByText(/PDF/)).toBeInTheDocument();
    expect(screen.getByText(/بعد الجلسة/)).toBeInTheDocument();
  });

  it("★ marks a Keynote material download-only, with the export-to-PDF hint (DEC-006)", async () => {
    vi.mocked(getMaterialsPageData).mockResolvedValue({
      materials: [
        {
          id: "mat2",
          kind: "keynote",
          title: "عرض المؤتمر",
          phase: "after",
          allowDownload: true,
          renderStatus: "not_applicable",
          fontSubstitutionWarning: null,
          externalUrl: null,
          currentVersionId: "v1",
          createdAt: "2026-09-14T00:00:00Z",
        },
      ],
      numerals: "western",
      canManageAll: false,
      presenterOfSession: false,
    });
    render(await Materials({ sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText("للتحميل فقط")).toBeInTheDocument();
    expect(screen.getByText(/صدّر العرض إلى PDF/)).toBeInTheDocument();
  });

  it("shows the font-substitution warning ON THE MATERIAL, naming the family (REQ-MAT-011)", async () => {
    vi.mocked(getMaterialsPageData).mockResolvedValue({
      materials: [
        {
          id: "mat3",
          kind: "powerpoint",
          title: "الشريحة الرئيسية",
          phase: "after",
          allowDownload: true,
          renderStatus: "ready",
          fontSubstitutionWarning: "Amiri",
          externalUrl: null,
          currentVersionId: "v1",
          createdAt: "2026-09-14T00:00:00Z",
        },
      ],
      numerals: "western",
      canManageAll: false,
      presenterOfSession: false,
    });
    render(await Materials({ sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText(/استُبدل الخط "Amiri"/)).toBeInTheDocument();
  });

  it("an external link opens with rel=noopener noreferrer and leaves-the-platform copy (REQ-MAT-007)", async () => {
    vi.mocked(getMaterialsPageData).mockResolvedValue({
      materials: [
        {
          id: "mat4",
          kind: "video_link",
          title: "تسجيل الجلسة",
          phase: "after",
          allowDownload: true,
          renderStatus: "not_applicable",
          fontSubstitutionWarning: null,
          externalUrl: "https://youtube.com/watch?v=x",
          currentVersionId: null,
          createdAt: "2026-09-14T00:00:00Z",
        },
      ],
      numerals: "western",
      canManageAll: false,
      presenterOfSession: false,
    });
    render(await Materials({ sessionId, memberId: "m1", locale: "ar" }));
    const link = screen.getByRole("link", { name: /يغادر المنصة/ });
    expect(link).toHaveAttribute("href", "https://youtube.com/watch?v=x");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("REQ-MAT-005/006: the phase/allow_download toggle is shown to the session's presenter, hidden from a plain member", async () => {
    const oneMaterial = {
      materials: [
        {
          id: "mat5",
          kind: "pdf" as const,
          title: "ملف",
          phase: "after" as const,
          allowDownload: true,
          renderStatus: "ready",
          fontSubstitutionWarning: null,
          externalUrl: null,
          currentVersionId: "v1",
          createdAt: "2026-09-14T00:00:00Z",
        },
      ],
      numerals: "western" as const,
    };

    vi.mocked(getMaterialsPageData).mockResolvedValue({ ...oneMaterial, canManageAll: false, presenterOfSession: false });
    const hidden = await Materials({ sessionId, memberId: "m1", locale: "ar" });
    render(<NextIntlClientProvider locale="ar" messages={ar}>{hidden}</NextIntlClientProvider>);
    expect(screen.queryByText("السماح بالتحميل")).not.toBeInTheDocument();

    vi.mocked(getMaterialsPageData).mockResolvedValue({ ...oneMaterial, canManageAll: false, presenterOfSession: true });
    const shown = await Materials({ sessionId, memberId: "m1", locale: "ar" });
    render(<NextIntlClientProvider locale="ar" messages={ar}>{shown}</NextIntlClientProvider>);
    expect(screen.getByText("السماح بالتحميل")).toBeInTheDocument();
  });
});
