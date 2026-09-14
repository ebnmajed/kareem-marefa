// The `Photos` slot — real ar/photos.json through next-intl's
// createTranslator, only src/lib/dal/photos.ts mocked. useRouter is stubbed
// (jsdom has no app router mounted) the same way tests/components/event/
// comment-item.test.tsx and tests/components/materials/list.test.tsx do,
// since UploadWidget/TakedownButton both need it.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/photos.json";
import type { PhotosPageData } from "@/lib/dal/photos";

vi.mock("@/lib/dal/photos", () => ({ getPhotosPageData: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "photos.gallery" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { getPhotosPageData } = await import("@/lib/dal/photos");
const { Photos } = await import("@/components/photos/gallery");

const sessionId = "11111111-1111-1111-1111-111111111111";
const base: PhotosPageData = { photos: [], canUpload: false, isStaff: false, myMemberId: "m1", numerals: "western" };

function renderWithIntl(element: React.ReactElement) {
  return render(<NextIntlClientProvider locale="ar" messages={ar}>{element}</NextIntlClientProvider>);
}

describe("Photos slot", () => {
  it("shows the empty state and hides the upload widget when the viewer cannot upload", async () => {
    vi.mocked(getPhotosPageData).mockResolvedValue({ ...base });
    renderWithIntl(await Photos({ sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText("لا توجد صور لهذه الجلسة بعد.")).toBeInTheDocument();
    expect(screen.queryByText("إضافة صورة")).not.toBeInTheDocument();
  });

  it("★ REQ-EVT-013: shows the upload notice and widget once the viewer can upload (checked in / presenter / staff)", async () => {
    vi.mocked(getPhotosPageData).mockResolvedValue({ ...base, canUpload: true });
    renderWithIntl(await Photos({ sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText(/ستظهر هذه الصور لجميع أعضاء المؤسسة/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إضافة صورة" })).toBeInTheDocument();
  });

  it("shows the count and a photo grid, with a request-hide action per photo (REQ-EVT-012)", async () => {
    vi.mocked(getPhotosPageData).mockResolvedValue({
      photos: [
        { id: "p1", uploaderId: "u1", createdAt: "2026-09-14T00:00:00Z", url: "https://example.com/p1.jpg", hiddenAt: null },
        { id: "p2", uploaderId: "u2", createdAt: "2026-09-14T00:00:00Z", url: "https://example.com/p2.jpg", hiddenAt: null },
      ],
      canUpload: false,
      isStaff: false,
      myMemberId: "m1",
      numerals: "western",
    });
    renderWithIntl(await Photos({ sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText("صورتان")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "احذف الصور التي أظهر فيها" })).toHaveLength(2);
  });

  it("★ a hidden photo shows the pending-review badge, and a restore action to staff instead of a request-hide action", async () => {
    vi.mocked(getPhotosPageData).mockResolvedValue({
      photos: [{ id: "p1", uploaderId: "u1", createdAt: "2026-09-14T00:00:00Z", url: "https://example.com/p1.jpg", hiddenAt: "2026-09-14T01:00:00Z" }],
      canUpload: false,
      isStaff: true,
      myMemberId: "m1",
      numerals: "western",
    });
    renderWithIntl(await Photos({ sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText("مخفية — بانتظار المراجعة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "استعادة" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "احذف الصور التي أظهر فيها" })).not.toBeInTheDocument();
  });
});
