// The `Photos` slot, rebuilt (DEC-208) — every case of the removed `gallery.test.tsx` and `gallery-grouping.test.tsx`
// re-asserted against the new file. Real `ar/photos.json`; the DAL and the actions mocked.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/photos.json";
import sessionsAr from "@/messages/ar/sessions.json";
import { ToastProvider } from "@/components/ui/toast";
import type { PhotoSummary, PhotosPageData } from "@/lib/dal/photos";
import type { SessionDay } from "@/lib/dal/sessions";

vi.mock("@/lib/dal/photos", () => ({ getPhotosPageData: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    namespace === "sessions.days"
      ? createTranslator({ locale: "ar", messages: sessionsAr, namespace: "sessions.days" })
      : createTranslator({ locale: "ar", messages: ar, namespace: namespace as "photos.gallery" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/photos/actions", () => ({
  requestPhotoTakedownAction: vi.fn().mockResolvedValue({ error: null }),
  restorePhotoAction: vi.fn().mockResolvedValue({ error: null }),
  rescopePhotoAction: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("@/lib/realtime/channel", () => ({ subscribeToSessionTopic: vi.fn(() => () => {}) }));

const { getPhotosPageData } = await import("@/lib/dal/photos");
const { requestPhotoTakedownAction } = await import("@/components/photos/actions");
const { Photos, photosSummary } = await import("@/components/photos/gallery");

const sessionId = "11111111-1111-1111-1111-111111111111";
const base: PhotosPageData = { photos: [], canUpload: false, isStaff: false, myMemberId: "m1", imageLimitMb: 20 };
const photo = (id: string, over: Partial<PhotoSummary> = {}): PhotoSummary => ({ id, uploaderId: "u", createdAt: "2026-09-14T00:00:00Z", url: `https://example.test/${id}.webp`, hiddenAt: null, ...over });
const day = (n: number): SessionDay => ({ id: `d${n}`, position: n, startsAt: `2026-10-0${n}T15:00:00Z`, endsAt: `2026-10-0${n}T17:00:00Z`, checkInOpen: false, venue: null });

async function renderSlot(data: PhotosPageData, phase: "live" | "ended" = "ended") {
  vi.mocked(getPhotosPageData).mockResolvedValue(data);
  const element = await Photos({ sessionId, memberId: "m1", locale: "ar", phase });
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <ToastProvider closeLabel="إغلاق">
        <div data-testid="slot">{element}</div>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("Photos slot — rebuilt", () => {
  it("renders null for a viewer who cannot upload and has nothing to see", async () => {
    await renderSlot(base);
    expect(screen.getByTestId("slot")).toBeEmptyDOMElement();
  });

  it("★ REQ-EVT-013: with the right to add, the empty text, the org-wide notice, what it accepts, and the control", async () => {
    await renderSlot({ ...base, canUpload: true });
    const slot = screen.getByTestId("slot");
    expect(slot).toHaveTextContent("لا توجد صور لهذه الجلسة بعد.");
    expect(slot).toHaveTextContent(/ستظهر هذه الصور لجميع أعضاء المؤسسة/);
    expect(slot).toHaveTextContent("JPEG أو PNG أو WebP");
    expect(screen.getByLabelText("إضافة صورة")).toHaveAttribute("type", "file");
  });

  it("live, the add control is the FIRST tile of the grid; after, it is under the grid (DEC-209)", async () => {
    const { unmount } = await renderSlot({ ...base, canUpload: true, photos: [photo("p1")] }, "live");
    const first = within(screen.getByTestId("slot")).getByRole("list").querySelector("li");
    expect(within(first as HTMLElement).getByLabelText("إضافة صورة")).toBeInTheDocument();
    unmount();
    await renderSlot({ ...base, canUpload: true, photos: [photo("p1")] }, "ended");
    expect(within(within(screen.getByTestId("slot")).getByRole("list")).queryByLabelText("إضافة صورة")).not.toBeInTheDocument();
    expect(screen.getByLabelText("إضافة صورة")).toBeInTheDocument();
  });

  it("each tile is the lightbox's button and carries no other control; the takedown is IN the lightbox (DEC-209)", async () => {
    await renderSlot({ ...base, photos: [photo("p1"), photo("p2")] });
    const list = within(screen.getByTestId("slot")).getByRole("list");
    expect(within(list).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["افتح الصورة 1 من 2", "افتح الصورة 2 من 2"]);
    expect(screen.queryByRole("button", { name: "احذف الصور التي أظهر فيها" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "افتح الصورة 1 من 2" }));
    const dialog = await screen.findByRole("dialog", { name: "صور الجلسة" });
    expect(within(dialog).getByRole("button", { name: "احذف الصور التي أظهر فيها" })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "تنزيل الصورة" })).toHaveAttribute("href", "/api/photos/p1/download");
  });

  it("★ REQ-EVT-012 / REQ-UIX-013: the takedown confirms in a dialog naming the object, then requests the hide", async () => {
    await renderSlot({ ...base, photos: [photo("p1")] });
    await userEvent.click(screen.getByRole("button", { name: "افتح الصورة 1 من 1" }));
    await userEvent.click(await screen.findByRole("button", { name: "احذف الصور التي أظهر فيها" }));
    expect(await screen.findByRole("heading", { name: "إخفاء هذه الصورة؟" })).toBeInTheDocument();
    const confirm = screen.getAllByRole("button", { name: "احذف الصور التي أظهر فيها" }).at(-1)!;
    await userEvent.click(confirm);
    expect(requestPhotoTakedownAction).toHaveBeenCalledWith("ar", sessionId, "p1");
  });

  it("★ a hidden photograph: staff see it badged with a restore, and it is never in the lightbox", async () => {
    await renderSlot({ ...base, isStaff: true, photos: [photo("p1"), photo("p2", { hiddenAt: "2026-09-14T01:00:00Z" })] });
    expect(screen.getByText("مخفية — بانتظار المراجعة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "استعادة" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^افتح الصورة \d+ من 1$/ })).toHaveLength(1);
  });

  it("«افتح الألبوم» opens the lightbox at the first photograph (DEC-209)", async () => {
    await renderSlot({ ...base, photos: [photo("p1"), photo("p2")] });
    await userEvent.click(screen.getByRole("button", { name: "افتح الألبوم" }));
    const dialog = await screen.findByRole("dialog", { name: "صور الجلسة" });
    expect(dialog.querySelector("img[data-photo-id]")).toHaveAttribute("data-photo-id", "p1");
  });

  it("REQ-ADM-021: staff see «تنزيل الكل»; a member does not", async () => {
    const { unmount } = await renderSlot({ ...base, isStaff: true, photos: [photo("p1")] });
    expect(screen.getByRole("button", { name: "تنزيل الكل" })).toBeInTheDocument();
    unmount();
    await renderSlot({ ...base, photos: [photo("p1")] });
    expect(screen.queryByRole("button", { name: "تنزيل الكل" })).not.toBeInTheDocument();
  });

  it("the uploader's company colour reaches the tile only as --team; none draws the neutral ring", async () => {
    await renderSlot({ ...base, photos: [photo("p1", { uploaderTeamColor: "#35d0ff" }), photo("p2", { uploaderTeamColor: null })] });
    const dots = within(screen.getByTestId("slot")).getByRole("list").querySelectorAll("span[aria-hidden].rounded-pill");
    expect((dots[0] as HTMLElement).style.getPropertyValue("--team")).toBe("#35d0ff");
    expect(dots[1]).toHaveClass("border-team-neutral");
  });

  it("the grid's crop is square and deliberate; the lightbox never crops", async () => {
    await renderSlot({ ...base, photos: [photo("p1")] });
    expect(within(screen.getByTestId("slot")).getByRole("list").querySelector("img")).toHaveClass("aspect-square", "object-cover");
  });

  it("renders no heading of its own at one day", async () => {
    await renderSlot({ ...base, photos: [photo("p1")] });
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("is accessible with a populated grid, the notice and the control", async () => {
    const { container } = await renderSlot({ ...base, canUpload: true, isStaff: true, photos: [photo("p1"), photo("p2")] }, "live");
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });

  describe("summary", () => {
    it("is visible with a count when photos exist", async () => {
      vi.mocked(getPhotosPageData).mockResolvedValue({ ...base, photos: [photo("p1")] });
      expect(await photosSummary({ sessionId, memberId: "m1", locale: "ar" })).toEqual({ visible: true, count: 1, outstanding: null });
    });
    it("is NOT visible for a viewer who cannot add with nothing to see", async () => {
      vi.mocked(getPhotosPageData).mockResolvedValue(base);
      expect((await photosSummary({ sessionId, memberId: "m1", locale: "ar" })).visible).toBe(false);
    });
  });

  describe("more than one day — display only, photos never ask", () => {
    const grouped = { ...base, days: [day(1), day(2)], timeZone: "Asia/Riyadh" };
    it("groups by day, session-scoped first, with no add control per group", async () => {
      await renderSlot({ ...grouped, canUpload: true, photos: [photo("a", { sessionDayId: "d1" }), photo("b", { sessionDayId: null })] });
      const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
      expect(headings[0]).toBe(sessionsAr.sessions.days.sessionScope);
      expect(screen.getAllByLabelText("إضافة صورة")).toHaveLength(1);
    });
    it("a plain member sees no scope chip; staff see one", async () => {
      const { unmount } = await renderSlot({ ...grouped, photos: [photo("a", { sessionDayId: "d1" })] });
      expect(screen.queryByRole("button", { name: /تغيير نطاق الصورة/ })).not.toBeInTheDocument();
      unmount();
      await renderSlot({ ...grouped, isStaff: true, photos: [photo("a", { sessionDayId: "d1" })] });
      expect(screen.getByRole("button", { name: /تغيير نطاق الصورة/ })).toBeInTheDocument();
    });
  });
});
