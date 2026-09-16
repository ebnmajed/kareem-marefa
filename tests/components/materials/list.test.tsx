// The `Materials` slot — real ar/materials.json through next-intl's
// createTranslator, only src/lib/dal/materials.ts mocked.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
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
const { Materials, materialsSummary } = await import("@/components/materials/list");

const sessionId = "11111111-1111-1111-1111-111111111111";
const uploadLimits = { documentMb: 50, audioMb: 200, imageMb: 20 };
const base: MaterialsPageData = { materials: [], canManageAll: false, presenterOfSession: false, uploadLimits };

// ★ `ui/link` (a ready PDF's viewer link, and `EmptyState`'s action via
// `ButtonLink`) both need next-intl's routing context now — every render
// below goes through this, not a bare `render(await Materials(...))`.
async function renderSlot(data: MaterialsPageData) {
  vi.mocked(getMaterialsPageData).mockResolvedValue(data);
  const element = await Materials({ sessionId, memberId: "m1", locale: "ar" });
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      {element}
    </NextIntlClientProvider>,
  );
}

describe("Materials slot", () => {
  // ★ wave 6 (`sessions.md` §22.4's invariant): `visible === false` EXACTLY
  // when the slot returns `null` — a non-manager with nothing to see has no
  // next action `EmptyState` could honestly offer (REQ-UIX-012's own limit
  // is that the action is REQUIRED, not optional).
  it("renders null for a non-manager with nothing to see — no fabricated action", async () => {
    const { container } = await renderSlot({ ...base });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an EmptyState naming the next action for a manager with nothing yet", async () => {
    await renderSlot({ ...base, canManageAll: true });
    expect(screen.getByText("لا توجد مواد لهذه الجلسة بعد.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "أضف مادة" })).toHaveAttribute("href", "#materials-upload-form");
  });

  it("bidi-isolates the title, and shows kind + phase", async () => {
    await renderSlot({
      ...base,
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
    });
    const title = screen.getByText("شرائح الجلسة الافتتاحية");
    expect(title.closest("bdi")).not.toBeNull();
    expect(screen.getByText(/PDF/)).toBeInTheDocument();
    expect(screen.getByText("بعد الجلسة")).toBeInTheDocument();
  });

  it("shows the font-substitution warning ON THE MATERIAL, naming the family (REQ-MAT-011)", async () => {
    await renderSlot({
      ...base,
      materials: [
        {
          id: "mat3",
          kind: "pdf",
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
    });
    // The family name is now inside its own <bdi>, so the sentence spans
    // multiple text nodes — match on the <p>'s own full textContent
    // (narrowed to the tag: the wrapping Panel <div> has the identical
    // textContent, which a bare textContent match would also catch).
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "الخط «Amiri» غير مضمَّن في ملف PDF، فقد تختلف الحروف العربية عن الأصل. صدّر الملف مع تضمين الخطوط وارفعه من جديد."),
    ).toBeInTheDocument();
  });

  it("an external link opens with rel=noopener noreferrer and leaves-the-platform copy (REQ-MAT-007)", async () => {
    await renderSlot({
      ...base,
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
    });
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
    };

    await renderSlot({ ...base, ...oneMaterial, canManageAll: false, presenterOfSession: false });
    expect(screen.queryByText("السماح بالتحميل")).not.toBeInTheDocument();

    await renderSlot({ ...base, ...oneMaterial, canManageAll: false, presenterOfSession: true });
    expect(screen.getByText("السماح بالتحميل")).toBeInTheDocument();
  });

  it("is accessible with a populated list, a warning and the uploader all showing", async () => {
    const { container } = await renderSlot({
      ...base,
      canManageAll: true,
      materials: [
        {
          id: "mat1",
          kind: "pdf",
          title: "شرائح الجلسة",
          phase: "after",
          allowDownload: true,
          renderStatus: "ready",
          fontSubstitutionWarning: "Amiri",
          externalUrl: null,
          currentVersionId: "v1",
          createdAt: "2026-09-14T00:00:00Z",
        },
      ],
    });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

describe("materialsSummary", () => {
  it("is visible with a count when materials exist", async () => {
    vi.mocked(getMaterialsPageData).mockResolvedValue({
      ...base,
      materials: [{ id: "m1", kind: "pdf", title: "t", phase: "after", allowDownload: true, renderStatus: "ready", fontSubstitutionWarning: null, externalUrl: null, currentVersionId: "v1", createdAt: "now" }],
    });
    await expect(materialsSummary({ sessionId, memberId: "m1", locale: "ar" })).resolves.toEqual({ visible: true, count: 1, outstanding: null });
  });

  it("is visible with count 0 for a manager with nothing yet", async () => {
    vi.mocked(getMaterialsPageData).mockResolvedValue({ ...base, canManageAll: true });
    await expect(materialsSummary({ sessionId, memberId: "m1", locale: "ar" })).resolves.toEqual({ visible: true, count: 0, outstanding: null });
  });

  it("is NOT visible for a non-manager with nothing — exactly when `Materials` returns null", async () => {
    vi.mocked(getMaterialsPageData).mockResolvedValue({ ...base });
    await expect(materialsSummary({ sessionId, memberId: "m1", locale: "ar" })).resolves.toEqual({ visible: false, count: 0, outstanding: null });
  });
});
