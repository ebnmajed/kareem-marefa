// The `Photos` slot — real ar/photos.json through next-intl's
// createTranslator, only src/lib/dal/photos.ts mocked. useRouter is stubbed
// (jsdom has no app router mounted) the same way tests/components/event/
// comment-item.test.tsx and tests/components/materials/list.test.tsx do,
// since UploadWidget/TakedownButton both need it.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/photos.json";
import { ToastProvider } from "@/components/ui/toast";
import type { PhotosPageData } from "@/lib/dal/photos";

vi.mock("@/lib/dal/photos", () => ({ getPhotosPageData: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "photos.gallery" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/photos/actions", () => ({
  requestPhotoTakedownAction: vi.fn().mockResolvedValue({ error: null }),
  restorePhotoAction: vi.fn().mockResolvedValue({ error: null }),
}));
// T8: UploadWidget now subscribes to the session's realtime topic —
// createBrowserClient() throws outside a real browser env (no
// NEXT_PUBLIC_SUPABASE_* here), so this needs the same mock
// upload-widget.test.tsx's own header explains.
vi.mock("@/lib/realtime/channel", () => ({ subscribeToSessionTopic: vi.fn(() => () => {}) }));

const { getPhotosPageData } = await import("@/lib/dal/photos");
const { Photos, photosSummary } = await import("@/components/photos/gallery");

const sessionId = "11111111-1111-1111-1111-111111111111";
const base: PhotosPageData = { photos: [], canUpload: false, isStaff: false, myMemberId: "m1", imageLimitMb: 20 };

async function renderSlot(data: PhotosPageData) {
  vi.mocked(getPhotosPageData).mockResolvedValue(data);
  const element = await Photos({ sessionId, memberId: "m1", locale: "ar" });
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      {/* `ToastProvider` always renders its (empty) viewport region, so the
          slot's own null-vs-something is asserted on THIS marked div, not
          on the render's outer `container`. */}
      <ToastProvider closeLabel="إغلاق">
        <div data-testid="slot">{element}</div>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("Photos slot", () => {
  // ★ wave 6 (`sessions.md` §22.4's invariant): `visible === false` EXACTLY
  // when the slot returns `null` — no upload right and nothing to show
  // leaves no next action `EmptyState` could honestly offer.
  it("renders null for a viewer who cannot upload and has nothing to see", async () => {
    await renderSlot({ ...base });
    expect(screen.getByTestId("slot")).toBeEmptyDOMElement();
  });

  it("★ REQ-EVT-013: shows the empty text, the upload notice and the widget once the viewer can upload (checked in / presenter / staff)", async () => {
    await renderSlot({ ...base, canUpload: true });
    expect(screen.getByText("لا توجد صور لهذه الجلسة بعد.")).toBeInTheDocument();
    expect(screen.getByText(/ستظهر هذه الصور لجميع أعضاء المؤسسة/)).toBeInTheDocument();
    // ★ the lead's 390 px review of the ended-event capture: this text used
    // to carry its own EmptyState action button, wired to the exact same
    // "إضافة صورة" label as the uploader's own submit button right below it
    // — a screen reader listed two buttons with the identical accessible
    // name, one of them disabled, for one task. `photos.length === 0 &&
    // !canUpload` already returns `null` above (the previous test), so this
    // branch is only ever reached with `canUpload === true` — the uploader
    // is never absent here, and the empty text has nowhere else to point.
    // Exactly ONE "إضافة صورة" button — the uploader's own — guards the
    // regression directly.
    expect(screen.getAllByRole("button", { name: "إضافة صورة" })).toHaveLength(1);
  });

  it("shows the count and a photo grid, with a request-hide action per photo (REQ-EVT-012)", async () => {
    await renderSlot({
      ...base,
      photos: [
        { id: "p1", uploaderId: "u1", createdAt: "2026-09-14T00:00:00Z", url: "https://example.com/p1.jpg", hiddenAt: null, sessionDayId: null },
        { id: "p2", uploaderId: "u2", createdAt: "2026-09-14T00:00:00Z", url: "https://example.com/p2.jpg", hiddenAt: null, sessionDayId: null },
      ],
    });
    expect(screen.getByText("صورتان")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "احذف الصور التي أظهر فيها" })).toHaveLength(2);
  });

  it("★ a hidden photo shows the pending-review badge, and a restore action to staff instead of a request-hide action", async () => {
    await renderSlot({
      ...base,
      photos: [{ id: "p1", uploaderId: "u1", createdAt: "2026-09-14T00:00:00Z", url: "https://example.com/p1.jpg", hiddenAt: "2026-09-14T01:00:00Z", sessionDayId: null }],
      isStaff: true,
    });
    expect(screen.getByText("مخفية — بانتظار المراجعة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "استعادة" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "احذف الصور التي أظهر فيها" })).not.toBeInTheDocument();
  });

  it("is accessible with a populated grid, the notice and the uploader all showing", async () => {
    const { container } = await renderSlot({
      ...base,
      canUpload: true,
      photos: [{ id: "p1", uploaderId: "u1", createdAt: "2026-09-14T00:00:00Z", url: "https://example.com/p1.jpg", hiddenAt: null, sessionDayId: null }],
    });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  it("★ REQ-UIX-013: the request-hide action confirms in a dialog naming the object, then toasts success", async () => {
    await renderSlot({
      ...base,
      photos: [{ id: "p1", uploaderId: "u1", createdAt: "2026-09-14T00:00:00Z", url: "https://example.com/p1.jpg", hiddenAt: null, sessionDayId: null }],
    });
    fireEvent.click(screen.getByRole("button", { name: "احذف الصور التي أظهر فيها" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "إخفاء هذه الصورة؟" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "احذف الصور التي أظهر فيها" }));
    // The same confirmation appears twice by design — the photo's own
    // "done" state AND the toast — so this asserts on both.
    await waitFor(() => expect(screen.getAllByText("تم إرسال طلب الإخفاء.")).toHaveLength(2));
  });
});

describe("photosSummary", () => {
  it("is visible with a count when photos exist", async () => {
    vi.mocked(getPhotosPageData).mockResolvedValue({ ...base, photos: [{ id: "p1", uploaderId: "u1", createdAt: "now", url: "u", hiddenAt: null, sessionDayId: null }] });
    await expect(photosSummary({ sessionId, memberId: "m1", locale: "ar" })).resolves.toEqual({ visible: true, count: 1, outstanding: null });
  });

  it("is NOT visible for a viewer who cannot upload with nothing to see — exactly when `Photos` returns null", async () => {
    vi.mocked(getPhotosPageData).mockResolvedValue({ ...base });
    await expect(photosSummary({ sessionId, memberId: "m1", locale: "ar" })).resolves.toEqual({ visible: false, count: 0, outstanding: null });
  });
});
