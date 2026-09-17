// REQ-SES-018/DEC-121, contract 7 — the grouped view at `days.length > 1`. New behaviour, new
// file (rule 4) — gallery.test.tsx (the byte-identical proof at n <= 1) is untouched.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/photos.json";
import sessionsAr from "@/messages/ar/sessions.json";
import { ToastProvider } from "@/components/ui/toast";
import type { PhotosPageData } from "@/lib/dal/photos";
import type { SessionDay } from "@/lib/dal/sessions";

vi.mock("@/lib/dal/photos", () => ({ getPhotosPageData: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    namespace === "sessions.days"
      ? createTranslator({ locale: "ar", messages: sessionsAr, namespace: "sessions.days" })
      : createTranslator({ locale: "ar", messages: ar, namespace: namespace as "photos.gallery" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/photos/actions", () => ({
  requestPhotoTakedownAction: vi.fn().mockResolvedValue({ error: null }),
  restorePhotoAction: vi.fn().mockResolvedValue({ error: null }),
  rescopePhotoAction: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("@/lib/realtime/channel", () => ({ subscribeToSessionTopic: vi.fn(() => () => {}) }));

const { getPhotosPageData } = await import("@/lib/dal/photos");
const { Photos } = await import("@/components/photos/gallery");

const sessionId = "11111111-1111-1111-1111-111111111111";
const day1: SessionDay = { id: "d1", position: 1, startsAt: "2026-10-04T15:00:00Z", endsAt: "2026-10-04T17:00:00Z", checkInOpen: true, venue: null };
const day2: SessionDay = { id: "d2", position: 2, startsAt: "2026-10-05T15:00:00Z", endsAt: "2026-10-05T17:00:00Z", checkInOpen: true, venue: null };
const days = [day1, day2];

const sessionPhoto = { id: "p-session", uploaderId: "u1", createdAt: "2026-10-04T16:00:00Z", url: "https://example.com/p1.jpg", hiddenAt: null, sessionDayId: null };
const day1Photo = { ...sessionPhoto, id: "p-day1", url: "https://example.com/p2.jpg", sessionDayId: "d1" };

async function renderSlot(data: PhotosPageData) {
  vi.mocked(getPhotosPageData).mockResolvedValue(data);
  const element = await Photos({ sessionId, memberId: "m1", locale: "ar" });
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <ToastProvider closeLabel="إغلاق">{element}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("Photos slot, grouped (days.length > 1)", () => {
  it("groups by day, session-scoped photos first, no add control per group (photos never ask)", async () => {
    await renderSlot({ photos: [sessionPhoto, day1Photo], canUpload: false, isStaff: false, myMemberId: "m1", imageLimitMb: 20, days, timeZone: "Asia/Riyadh" });
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings[0]).toBe("للورشة كاملة");
    expect(headings.some((h) => h?.includes("الأول"))).toBe(true);
    // No day-2 heading — REQ-SES-018: an empty group is never rendered, even for photos, which
    // have no manager view that would need to see it (no per-group add control exists at all).
    expect(headings.some((h) => h?.includes("الثاني"))).toBe(false);
    // The images are decorative (`alt=""`, matching the flat branch's own markup) so they carry
    // no accessible role — two photo tiles show as two list items instead.
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("a plain member sees no scope chip; staff sees one, opening a menu of every day", async () => {
    await renderSlot({ photos: [day1Photo], canUpload: false, isStaff: false, myMemberId: "m1", imageLimitMb: 20, days, timeZone: "Asia/Riyadh" });
    expect(screen.queryByText("▾")).not.toBeInTheDocument();

    await renderSlot({ photos: [day1Photo], canUpload: false, isStaff: true, myMemberId: "m1", imageLimitMb: 20, days, timeZone: "Asia/Riyadh" });
    const trigger = screen.getByText("▾").closest("summary")!;
    expect(trigger.closest("details")!.querySelectorAll("button")).toHaveLength(3);
  });
});
