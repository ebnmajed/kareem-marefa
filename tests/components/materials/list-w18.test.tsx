// The `Materials` slot, rebuilt (DEC-208) — every case of the removed `list.test.tsx` and `list-grouping.test.tsx`
// re-asserted against the new file, plus the audio row (REQ-MAT-007). Real `ar/materials.json`; the DAL mocked.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/materials.json";
import sessionsAr from "@/messages/ar/sessions.json";
import type { MaterialSummary, MaterialsPageData } from "@/lib/dal/materials";
import type { SessionDay } from "@/lib/dal/sessions";
import { ToastProvider } from "@/components/ui/toast";

vi.mock("@/lib/dal/materials", () => ({ getMaterialsPageData: vi.fn(), getMaterialPlaybackUrl: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    namespace === "sessions.days"
      ? createTranslator({ locale: "ar", messages: sessionsAr, namespace: "sessions.days" })
      : createTranslator({ locale: "ar", messages: ar, namespace: namespace as "materials.list" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/materials/actions", () => ({ rescopeMaterialAction: vi.fn().mockResolvedValue({ error: null }), saveMaterialSettings: vi.fn() }));

const { getMaterialsPageData, getMaterialPlaybackUrl } = await import("@/lib/dal/materials");
const { Materials, materialsSummary } = await import("@/components/materials/list");

const sessionId = "11111111-1111-1111-1111-111111111111";
const uploadLimits = { documentMb: 50, audioMb: 200, imageMb: 20 };
const base: MaterialsPageData = { materials: [], canManageAll: false, presenterOfSession: false, uploadLimits };
const mat = (over: Partial<MaterialSummary>): MaterialSummary => ({
  id: "mat1", kind: "pdf", title: "شرائح الجلسة الافتتاحية", phase: "after", allowDownload: true, renderStatus: "ready",
  fontSubstitutionWarning: null, externalUrl: null, currentVersionId: "v1", createdAt: "2026-09-14T00:00:00Z", ...over,
});
const day = (n: number): SessionDay => ({ id: `d${n}`, position: n, startsAt: `2026-10-0${n}T15:00:00Z`, endsAt: `2026-10-0${n}T17:00:00Z`, checkInOpen: false, venue: null });

async function renderSlot(data: MaterialsPageData, playback: string | null = null) {
  vi.mocked(getMaterialsPageData).mockResolvedValue(data);
  vi.mocked(getMaterialPlaybackUrl).mockResolvedValue(playback);
  const element = await Materials({ sessionId, memberId: "m1", locale: "ar" });
  return render(
    <NextIntlClientProvider locale="ar" messages={{ ...ar, ...sessionsAr }}>
      <ToastProvider closeLabel="إغلاق">
        <div data-testid="slot">{element}</div>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("Materials slot — rebuilt", () => {
  it("renders null for a non-manager with nothing to see", async () => {
    await renderSlot(base);
    expect(screen.getByTestId("slot")).toBeEmptyDOMElement();
  });

  it("a manager with nothing yet sees the empty line and the upload control — one action, no second primary", async () => {
    await renderSlot({ ...base, canManageAll: true });
    expect(screen.getByText("لا توجد مواد لهذه الجلسة بعد.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "رفع" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "أضف مادة" })).not.toBeInTheDocument();
  });

  it("renders no heading of its own at one day", async () => {
    await renderSlot({ ...base, materials: [mat({})] });
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("a ready PDF is ONE link to the viewer, named by its title, bidi-isolated, with its phase and what it is for", async () => {
    await renderSlot({ ...base, materials: [mat({})] });
    const row = screen.getByRole("link", { name: /شرائح الجلسة الافتتاحية/ });
    expect(row).toHaveAttribute("href", expect.stringContaining(`/app/sessions/${sessionId}/materials/mat1`));
    expect(row.querySelector("bdi")).toHaveTextContent("شرائح الجلسة الافتتاحية");
    expect(row).toHaveTextContent("بعد الجلسة");
    expect(row).toHaveTextContent("للقراءة في العارض والتحميل");
  });

  it("with download off, the row says the viewer only and draws no download glyph", async () => {
    await renderSlot({ ...base, materials: [mat({ allowDownload: false })] });
    const row = screen.getByRole("link", { name: /شرائح الجلسة/ });
    expect(row).toHaveTextContent("للقراءة في العارض");
    expect(row).not.toHaveTextContent("والتحميل");
  });

  it("a PDF still rendering is not a link, and says so", async () => {
    await renderSlot({ ...base, materials: [mat({ renderStatus: "rendering" })] });
    expect(screen.queryByRole("link", { name: /شرائح الجلسة/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("slot")).toHaveTextContent("جارٍ تجهيز الصفحات…");
  });

  it("REQ-MAT-011: the font warning names the family, on the material, for the presenter", async () => {
    await renderSlot({ ...base, presenterOfSession: true, materials: [mat({ fontSubstitutionWarning: "Amiri" })] });
    expect(screen.getByText("Amiri")).toBeInTheDocument();
  });

  it("REQ-MAT-007: a link opens with rel=noopener noreferrer and says it leaves the platform", async () => {
    await renderSlot({ ...base, materials: [mat({ kind: "external_link", externalUrl: "https://example.test/deck", title: "العرض على Google" })] });
    const link = screen.getByRole("link", { name: /العرض على Google/ });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveTextContent("يفتح خارج المنصة");
  });

  it("a video is a link, never an embed (DEC-209)", async () => {
    const { container } = await renderSlot({ ...base, materials: [mat({ kind: "video_link", externalUrl: "https://video.test/v", title: "التسجيل المرئي" })] });
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("link", { name: /التسجيل المرئي/ })).toHaveAttribute("href", "https://video.test/v");
  });

  it("REQ-MAT-005/006: the settings (phase, allow download) show to the session's presenter, never to a member", async () => {
    await renderSlot({ ...base, presenterOfSession: true, materials: [mat({})] });
    expect(screen.getByLabelText("السماح بالتحميل")).toBeInTheDocument();
  });

  it("…and not to a plain member", async () => {
    await renderSlot({ ...base, materials: [mat({})] });
    expect(screen.queryByLabelText("السماح بالتحميل")).not.toBeInTheDocument();
  });

  it("★ REQ-MAT-007: an audio material this viewer may fetch gets the player — keyboard play, a scrubber, the duration", async () => {
    await renderSlot({ ...base, materials: [mat({ kind: "audio", title: "التسجيل الصوتي" })] }, "https://storage.test/a.m4a");
    const play = screen.getByRole("button", { name: "تشغيل التسجيل الصوتي" });
    expect(play).toHaveAttribute("aria-pressed", "false");
    // The glyph, not a word: the name carries the meaning (PlayIcon, e7017f71).
    expect(play.querySelector("svg")).not.toBeNull();
    expect(play.textContent).toBe("");
    // The scrubber reads its place in words, the catalogue's <bdi> dropped from the attribute.
    expect(screen.getByRole("slider", { name: "موضع التشغيل" })).toHaveAttribute("aria-valuetext", "0:00 من —:—");
    expect(screen.getByTestId("slot").querySelector("audio")).toHaveAttribute("src", "https://storage.test/a.m4a");
  });

  it("★ an audio material this viewer may NOT fetch (download off, `0116`) draws no player and says why (DEC-209)", async () => {
    await renderSlot({ ...base, materials: [mat({ kind: "audio", title: "التسجيل الصوتي", allowDownload: false })] }, null);
    expect(screen.queryByRole("button", { name: "تشغيل التسجيل الصوتي" })).not.toBeInTheDocument();
    expect(screen.getByTestId("slot").querySelector("audio")).toBeNull();
    expect(screen.getByTestId("slot")).toHaveTextContent("الاستماع غير متاح لك");
  });

  it("is accessible with a populated list, a warning, the player and the uploader all showing", async () => {
    const { container } = await renderSlot(
      { ...base, canManageAll: true, materials: [mat({ fontSubstitutionWarning: "Amiri" }), mat({ id: "a1", kind: "audio", title: "صوت" })] },
      "https://storage.test/a.m4a",
    );
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });

  describe("summary", () => {
    it("is visible with a count when materials exist", async () => {
      vi.mocked(getMaterialsPageData).mockResolvedValue({ ...base, materials: [mat({})] });
      expect(await materialsSummary({ sessionId, memberId: "m1", locale: "ar" })).toEqual({ visible: true, count: 1, outstanding: null });
    });
    it("is visible with count 0 for a manager with nothing yet", async () => {
      vi.mocked(getMaterialsPageData).mockResolvedValue({ ...base, canManageAll: true });
      expect(await materialsSummary({ sessionId, memberId: "m1", locale: "ar" })).toEqual({ visible: true, count: 0, outstanding: null });
    });
    it("is NOT visible for a non-manager with nothing — exactly when the slot returns null", async () => {
      vi.mocked(getMaterialsPageData).mockResolvedValue(base);
      expect((await materialsSummary({ sessionId, memberId: "m1", locale: "ar" })).visible).toBe(false);
    });
  });

  describe("more than one day (REQ-SES-018, DEC-121)", () => {
    const days = [day(1), day(2)];
    const grouped = { ...base, days, timeZone: "Asia/Riyadh" };

    it("the session's own content first, then each day in order, each under its own <h3>", async () => {
      await renderSlot({ ...grouped, materials: [mat({ id: "d", title: "شرائح اليوم الأول", sessionDayId: "d1" }), mat({ id: "s", title: "للورشة", sessionDayId: null })] });
      const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
      expect(headings[0]).toBe(sessionsAr.sessions.days.sessionScope);
      expect(headings).toHaveLength(2);
    });

    it("a group with nothing in it is not rendered for a plain member", async () => {
      await renderSlot({ ...grouped, materials: [mat({ sessionDayId: "d1" })] });
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    });

    it("a manager sees every group, an empty one too, each with its own closed «أضف مادة» and no open form", async () => {
      await renderSlot({ ...grouped, canManageAll: true, materials: [] });
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
      const details = screen.getByTestId("slot").querySelectorAll("details");
      expect(details).toHaveLength(3);
      for (const d of details) expect(d).not.toHaveAttribute("open");
    });

    it("the header control opens exactly its own group's form and moves focus into it", async () => {
      await renderSlot({ ...grouped, canManageAll: true, materials: [] });
      const details = [...screen.getByTestId("slot").querySelectorAll("details")];
      await userEvent.click(details[1]!.querySelector("summary")!);
      fireEvent(details[1]!, new Event("toggle"));
      expect(details[1]).toHaveAttribute("open");
      expect(details[0]).not.toHaveAttribute("open");
      expect(details[1]!.contains(document.activeElement)).toBe(true);
    });

    it("a plain member sees no scope chip; a manager sees one per item", async () => {
      const { unmount } = await renderSlot({ ...grouped, materials: [mat({ sessionDayId: "d1" })] });
      expect(screen.queryByRole("button", { name: /تغيير نطاق المادة/ })).not.toBeInTheDocument();
      unmount();
      await renderSlot({ ...grouped, canManageAll: true, materials: [mat({ sessionDayId: "d1" })] });
      expect(screen.getByRole("button", { name: /تغيير نطاق المادة/ })).toBeInTheDocument();
    });

    it("a day-scoped «بعد» reads «بعد اليوم»; a session-scoped one «بعد الجلسة»", async () => {
      await renderSlot({ ...grouped, materials: [mat({ id: "a", title: "يومي", sessionDayId: "d1" }), mat({ id: "b", title: "عام", sessionDayId: null })] });
      expect(screen.getByRole("link", { name: /يومي/ })).toHaveTextContent("بعد اليوم");
      expect(screen.getByRole("link", { name: /عام/ })).toHaveTextContent("بعد الجلسة");
    });

    it("a plain member with nothing yet sees nothing at all", async () => {
      await renderSlot({ ...grouped, materials: [] });
      expect(screen.getByTestId("slot")).toBeEmptyDOMElement();
    });

    it("is accessible with two populated groups, the chip and the add controls", async () => {
      const { container } = await renderSlot({ ...grouped, canManageAll: true, materials: [mat({ id: "a", sessionDayId: "d1" }), mat({ id: "b", sessionDayId: null })] });
      const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
      expect(violations.map((v) => v.id)).toEqual([]);
      expect(within(container).getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(1);
    });
  });
});
