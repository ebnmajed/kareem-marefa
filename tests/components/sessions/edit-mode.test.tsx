// The event page's edit mode — the owner's ruling (2026-10-06): staff and presenters open the member's page, and
// «تعديل» reveals in place what only they may change; «تم» puts the member's page back. Real `ar` messages; the
// materials DAL mocked; the slot rendered inside the provider exactly as the event page renders it.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/materials.json";
import sessionsAr from "@/messages/ar/sessions.json";
import type { MaterialSummary, MaterialsPageData } from "@/lib/dal/materials";
import { ToastProvider } from "@/components/ui/toast";
import { EditModeProvider, EditModeToggle, EditOnly } from "@/components/sessions/edit-mode";
import { EventSubnav } from "@/components/sessions/event-subnav";

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
const { Materials } = await import("@/components/materials/list");

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
});
