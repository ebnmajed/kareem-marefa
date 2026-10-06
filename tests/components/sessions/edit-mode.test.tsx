// The event page's edit mode — the owner's ruling (2026-10-06): staff and presenters open the member's page, and
// «تعديل» reveals in place what only they may change; «تم» puts the member's page back. Real `ar` messages; the
// materials DAL mocked; the slot rendered inside the provider exactly as the event page renders it.
import type { ReactNode } from "react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/materials.json";
import sessionsAr from "@/messages/ar/sessions.json";
import photosAr from "@/messages/ar/photos.json";
import rsvpAr from "@/messages/ar/rsvp.json";
import type { MaterialSummary, MaterialsPageData } from "@/lib/dal/materials";
import type { PhotoSummary, PhotosPageData } from "@/lib/dal/photos";
import type { EventAttendeeFace, EventSession } from "@/lib/dal/sessions";
import type { AffordanceCell } from "@/components/checkin/session-matrix";
import { ToastProvider } from "@/components/ui/toast";
import { EditModeProvider, EditModeToggle, EditOnly } from "@/components/sessions/edit-mode";
import { EventSubnav } from "@/components/sessions/event-subnav";

vi.mock("@/lib/dal/materials", () => ({ getMaterialsPageData: vi.fn(), getMaterialPlaybackUrl: vi.fn() }));
vi.mock("@/lib/dal/photos", () => ({ getPhotosPageData: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    namespace.startsWith("sessions.")
      ? createTranslator({ locale: "ar", messages: sessionsAr, namespace: namespace as "sessions.days" })
      : namespace.startsWith("photos.")
        ? createTranslator({ locale: "ar", messages: photosAr, namespace: namespace as "photos.gallery" })
        : namespace === "rsvp"
          ? createTranslator({ locale: "ar", messages: rsvpAr, namespace: "rsvp" })
          : createTranslator({ locale: "ar", messages: ar, namespace: namespace as "materials.list" }),
}));
vi.mock("@/components/photos/actions", () => ({
  requestPhotoTakedownAction: vi.fn().mockResolvedValue({ error: null }),
  restorePhotoAction: vi.fn().mockResolvedValue({ error: null }),
  rescopePhotoAction: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("@/lib/realtime/channel", () => ({ subscribeToSessionTopic: vi.fn(() => () => {}) }));
// The action card's children that read the DAL or hold a moment: stubs. What is under test is where the card puts
// the poster download and «إدارة الجلسة», and the card itself is rendered as the event page renders it.
vi.mock("@/components/checkin/rsvp-panel", () => ({ RsvpReserve: () => null, RsvpStatus: () => null, reserveMomentLabels: async () => ({}) }));
vi.mock("@/components/checkin/actions", () => ({ reserveSeatAction: vi.fn() }));
vi.mock("@/components/checkin/award-state", () => ({ AwardState: () => null }));
vi.mock("@/components/calendar/add-to-calendar", () => ({ AddToCalendar: () => null }));
vi.mock("@/components/sessions/event-meta", () => ({ EventMeta: () => null }));
vi.mock("@/components/sessions/outcome-card", () => ({ OutcomeCard: () => null, CertificateRow: () => null }));
vi.mock("@/components/sessions/moment-reserve", () => ({
  ReserveMoment: ({ children }: { children: ReactNode }) => <>{children}</>,
  MomentPart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ReserveRefused: () => null,
}));
vi.mock("@/components/sessions/session-download", () => ({ SessionDownload: () => <p data-session-download="">تنزيل الملصق</p> }));
vi.mock("@/lib/dal/checkin", () => ({ checkInOfferFor: () => "none" }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/materials/actions", () => ({ rescopeMaterialAction: vi.fn().mockResolvedValue({ error: null }), saveMaterialSettings: vi.fn() }));

const { getMaterialsPageData, getMaterialPlaybackUrl } = await import("@/lib/dal/materials");
const { Materials } = await import("@/components/materials/list");
const { getPhotosPageData } = await import("@/lib/dal/photos");
const { Photos, photosSummary } = await import("@/components/photos/gallery");
const { ActionCard } = await import("@/components/sessions/action-card");
const { EventAside } = await import("@/components/sessions/event-aside");

const editMode = sessionsAr.sessions.event.editMode;
const sessionId = "11111111-1111-1111-1111-111111111111";
const base: MaterialsPageData = { materials: [], canManageAll: false, presenterOfSession: false, uploadLimits: { documentMb: 50, audioMb: 200, imageMb: 20 } };
const mat: MaterialSummary = {
  id: "mat1", kind: "pdf", title: "شرائح الجلسة", phase: "after", allowDownload: true, renderStatus: "ready",
  fontSubstitutionWarning: "Amiri", externalUrl: null, currentVersionId: "v1", createdAt: "2026-09-14T00:00:00Z",
};

async function renderPage(data: MaterialsPageData, initialEditing = false) {
  vi.mocked(getMaterialsPageData).mockResolvedValue(data);
  vi.mocked(getMaterialPlaybackUrl).mockResolvedValue(null);
  const slot = await Materials({ sessionId, memberId: "m1", locale: "ar" });
  return render(
    <NextIntlClientProvider locale="ar" messages={{ ...ar, ...sessionsAr }}>
      <ToastProvider closeLabel="إغلاق">
        <EditModeProvider initialEditing={initialEditing}>
          <EditModeToggle editLabel={editMode.edit} doneLabel={editMode.done} editingStatus={editMode.editingStatus} readingStatus={editMode.readingStatus} />
          <div data-testid="slot">{slot}</div>
        </EditModeProvider>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const settings = () => screen.queryByRole("checkbox", { name: "السماح بالتحميل" });
const uploader = () => screen.queryByRole("button", { name: "رفع" });

describe("the event page's edit mode", () => {
  it("staff see the member's page on load: no settings, no uploader, no font warning — the row itself is there", async () => {
    await renderPage({ ...base, canManageAll: true, materials: [mat] });
    expect(screen.getByRole("link", { name: /شرائح الجلسة/ })).toBeInTheDocument();
    expect(settings()).not.toBeInTheDocument();
    expect(uploader()).not.toBeInTheDocument();
    expect(screen.queryByText(/Amiri/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تعديل" })).toBeInTheDocument();
  });

  it("«تعديل» reveals the settings and the uploader in place; «تم» hides them again", async () => {
    const user = userEvent.setup();
    await renderPage({ ...base, canManageAll: true, materials: [mat] });

    await user.click(screen.getByRole("button", { name: "تعديل" }));
    expect(settings()).toBeInTheDocument();
    expect(uploader()).toBeInTheDocument();
    expect(screen.getByText(/Amiri/)).toBeInTheDocument();
    // The same button, now named for what it does next; focus stays on it.
    const done = screen.getByRole("button", { name: "تم" });
    expect(done).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(editMode.editingStatus);

    await user.click(done);
    expect(settings()).not.toBeInTheDocument();
    expect(uploader()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تعديل" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(editMode.readingStatus);
  });

  it("keeps the mode in the address, so a reload keeps it", async () => {
    const user = userEvent.setup();
    await renderPage({ ...base, canManageAll: true, materials: [mat] });
    await user.click(screen.getByRole("button", { name: "تعديل" }));
    expect(new URL(window.location.href).searchParams.get("edit")).toBe("1");
    await user.click(screen.getByRole("button", { name: "تم" }));
    expect(new URL(window.location.href).searchParams.has("edit")).toBe(false);
  });

  it("opens in edit mode when the page says so (`?edit=1`)", async () => {
    await renderPage({ ...base, canManageAll: true, materials: [mat] }, true);
    expect(settings()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تم" })).toBeInTheDocument();
  });

  it("a member's page is unchanged: no toggle is drawn outside a provider, and nothing a member does is hidden", async () => {
    vi.mocked(getMaterialsPageData).mockResolvedValue({ ...base, materials: [mat] });
    const slot = await Materials({ sessionId, memberId: "m1", locale: "ar" });
    render(
      <NextIntlClientProvider locale="ar" messages={{ ...ar, ...sessionsAr }}>
        <EditModeToggle editLabel={editMode.edit} doneLabel={editMode.done} editingStatus={editMode.editingStatus} readingStatus={editMode.readingStatus} />
        <div data-testid="slot">{slot}</div>
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("button", { name: "تعديل" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /شرائح الجلسة/ })).toBeInTheDocument();
  });

  it("outside a provider, EditOnly shows its children — a slot rendered on its own keeps its controls", () => {
    render(
      <EditOnly>
        <p>إعداد</p>
      </EditOnly>,
    );
    expect(screen.getByText("إعداد")).toBeInTheDocument();
  });

  it("the sub-nav lists a manager-only section in edit mode alone", async () => {
    const user = userEvent.setup();
    const items = [
      { id: "about" as const, label: "نبذة" },
      { id: "discussion" as const, label: "النقاش" },
      { id: "tasks" as const, label: "المهام", editOnly: true },
    ];
    render(
      <EditModeProvider>
        <EditModeToggle editLabel={editMode.edit} doneLabel={editMode.done} editingStatus={editMode.editingStatus} readingStatus={editMode.readingStatus} />
        <EventSubnav label="أقسام الجلسة" items={items} />
      </EditModeProvider>,
    );
    const nav = () => screen.getByRole("navigation", { name: "أقسام الجلسة" });
    expect(nav()).not.toHaveTextContent("المهام");
    await user.click(screen.getByRole("button", { name: "تعديل" }));
    expect(nav()).toHaveTextContent("المهام");
  });

  describe("★ everything only staff or a presenter sees is behind «تعديل» (the owner's ruling)", () => {
    const messages = { ...ar, ...sessionsAr, ...photosAr, ...rsvpAr };
    const inMode = (node: ReactNode, initialEditing = false) =>
      render(
        <NextIntlClientProvider locale="ar" messages={messages}>
          <ToastProvider closeLabel="إغلاق">
            <EditModeProvider initialEditing={initialEditing}>
              <EditModeToggle editLabel={editMode.edit} doneLabel={editMode.done} editingStatus={editMode.editingStatus} readingStatus={editMode.readingStatus} />
              <div data-testid="slot">{node}</div>
            </EditModeProvider>
          </ToastProvider>
        </NextIntlClientProvider>,
      );

    const staffSession = {
      id: sessionId, state: "published", startsAt: "2026-11-01T15:00:00Z", endsAt: "2026-11-01T17:00:00Z", capacity: 40, timeZone: "Asia/Riyadh",
      viewerIsStaff: true, viewerIsPresenter: false, viewerRelation: "staff", rsvpStatus: null, checkedIn: false, checkedInDayIds: [],
      allowWalkIns: false, checkInOpen: false,
    } as unknown as EventSession;
    const card = (session: EventSession = staffSession) =>
      ActionCard({
        session, phase: "open", days: [], can: { hostConsole: true, calendar: false } as unknown as AffordanceCell, rsvp: null, primary: null,
        slot: { sessionId, memberId: "m1", locale: "ar" }, points: null, figures: { attendedCount: null, rotationSeconds: null }, faces: [],
        ratingClosesAt: null, certificateHref: null, bookmark: () => null, share: () => null, isAdmin: true, locale: "ar",
      });
    const manage = () => screen.queryByRole("navigation", { name: "إدارة الجلسة" });
    const poster = () => screen.queryByText("تنزيل الملصق");

    it("the action card: the poster download and «إدارة الجلسة» are hidden in read mode and shown in edit mode", async () => {
      const user = userEvent.setup();
      inMode(await card());
      expect(poster()).not.toBeInTheDocument();
      expect(manage()).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "تعديل" }));
      expect(poster()).toBeInTheDocument();
      const nav = manage();
      expect(nav).toBeInTheDocument();
      for (const name of ["الجدولة", "الحضور", "الشهادات"]) expect(within(nav as HTMLElement).getByRole("link", { name })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "تم" }));
      expect(poster()).not.toBeInTheDocument();
      expect(manage()).not.toBeInTheDocument();
    });

    it("a presenter's poster download and host view link follow the same mode", async () => {
      const presenter = { ...staffSession, viewerIsStaff: false, viewerIsPresenter: true, viewerRelation: "presenter" } as unknown as EventSession;
      const { unmount } = inMode(await card(presenter));
      expect(poster()).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "شاشة التقديم" })).not.toBeInTheDocument();
      unmount();
      inMode(await card(presenter), true);
      expect(poster()).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "شاشة التقديم" })).toBeInTheDocument();
    });

    it("a manager's material row says «download» in edit mode only — read mode is the member's row", async () => {
      const user = userEvent.setup();
      vi.mocked(getMaterialsPageData).mockResolvedValue({ ...base, canManageAll: true, materials: [mat] });
      vi.mocked(getMaterialPlaybackUrl).mockResolvedValue(null);
      inMode(await Materials({ sessionId, memberId: "m1", locale: "ar" }));
      const row = () => screen.getByRole("link", { name: /شرائح الجلسة/ });
      expect(row()).toHaveTextContent(ar.materials.list.row.viewer);
      expect(row()).not.toHaveTextContent(ar.materials.list.row.viewerAndDownload);
      await user.click(screen.getByRole("button", { name: "تعديل" }));
      expect(row()).toHaveTextContent(ar.materials.list.row.viewerAndDownload);
    });

    const photo = (id: string, over: Partial<PhotoSummary> = {}): PhotoSummary => ({ id, uploaderId: "u", createdAt: "2026-09-14T00:00:00Z", url: `https://example.test/${id}.webp`, hiddenAt: null, ...over });
    const staffPhotos: PhotosPageData = { photos: [photo("p1")], canUpload: true, uploadAsStaffOnly: true, isStaff: true, myMemberId: "m1", imageLimitMb: 20, album: null };

    it("the album: «تنزيل الكل», the lightbox's «تنزيل الصورة» and a staff-only add control are edit mode's", async () => {
      const user = userEvent.setup();
      vi.mocked(getPhotosPageData).mockResolvedValue(staffPhotos);
      inMode(await Photos({ sessionId, memberId: "m1", locale: "ar", phase: "ended" }));
      expect(screen.queryByRole("button", { name: "تنزيل الكل" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("إضافة صورة")).not.toBeInTheDocument();
      // What a member sees stays: the album opens.
      await user.click(screen.getByRole("button", { name: "افتح الصورة 1 من 1" }));
      expect(screen.queryByRole("link", { name: "تنزيل الصورة" })).not.toBeInTheDocument();
      await user.keyboard("{Escape}");

      await user.click(screen.getByRole("button", { name: "تعديل" }));
      expect(screen.getByRole("button", { name: "تنزيل الكل" })).toBeInTheDocument();
      expect(screen.getByLabelText("إضافة صورة")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "افتح الصورة 1 من 1" }));
      expect(screen.getByRole("link", { name: "تنزيل الصورة" })).toBeInTheDocument();
    });

    it("a member who may add keeps the add control in read mode — only staff's own right is moved", async () => {
      vi.mocked(getPhotosPageData).mockResolvedValue({ ...staffPhotos, uploadAsStaffOnly: false });
      inMode(await Photos({ sessionId, memberId: "m1", locale: "ar", phase: "ended" }));
      expect(screen.getByLabelText("إضافة صورة")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "تنزيل الكل" })).not.toBeInTheDocument();
    });

    it("a photos section that holds only staff's things is edit-only, so read mode draws no empty heading", async () => {
      vi.mocked(getPhotosPageData).mockResolvedValue({ ...staffPhotos, photos: [photo("p1", { hiddenAt: "2026-09-15T00:00:00Z" })] });
      expect(await photosSummary({ sessionId, memberId: "m1", locale: "ar" })).toMatchObject({ visible: true, editOnly: true });
      vi.mocked(getPhotosPageData).mockResolvedValue(staffPhotos);
      expect((await photosSummary({ sessionId, memberId: "m1", locale: "ar" })).editOnly).toBeUndefined();
    });

    it("«من يحضر»: faces in edit mode, the member's count in words in read mode", async () => {
      const user = userEvent.setup();
      const faces: EventAttendeeFace[] = [{ memberId: "a1", displayName: "سارة", avatarUrl: null, teamColor: null } as EventAttendeeFace];
      inMode(await EventAside({ session: { ...staffSession, venue: null } as unknown as EventSession, phase: "live", reserved: null, attended: 1, faces }));
      expect(screen.getByText("حاضر واحد")).toBeInTheDocument();
      expect(screen.queryByText("سارة")).toBeNull();
      await user.click(screen.getByRole("button", { name: "تعديل" }));
      expect(screen.queryByText("سارة")).not.toBeNull();
    });
  });
});
