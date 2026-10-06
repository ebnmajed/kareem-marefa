// /app/admin/announcements (REQ-ADM-025, DEC-267, 0164 + 0213). An announcement is not a session: a short text an
// admin publishes now or at a time, shown on every member's feed and notified once when it goes live. Every write
// answers with what it wrote.
import type React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { ToastProvider } from "@/components/ui/toast";
import type { AdminAnnouncement } from "@/lib/dal/announcements";
import adminAr from "@/messages/ar/admin.json";
import announcementsAr from "@/messages/ar/announcements.json";
import uiAr from "@/messages/ar/ui.json";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/announcements", () => ({
  announcementTimeZone: vi.fn(async () => "Asia/Riyadh"),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
}));

const dal = await import("@/lib/dal/announcements");
const { saveAnnouncement, deleteAnnouncementAction } = await import("@/app/[locale]/app/admin/announcements/actions");
const { AnnouncementsTable } = await import("@/app/[locale]/app/admin/announcements/announcements-table");
const { AnnouncementForm } = await import("@/app/[locale]/app/admin/announcements/announcement-form");
const { emptyAnnouncementState } = await import("@/app/[locale]/app/admin/announcements/state");

const messages = { ...adminAr, ...uiAr, ...announcementsAr };
const Wrap = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={messages}>
    <ToastProvider closeLabel="إغلاق">
      <main>{children}</main>
    </ToastProvider>
  </NextIntlClientProvider>
);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const ROWS: AdminAnnouncement[] = [
  { id: A, body: "يُفتتح مختبر الابتكار يوم الأحد", publishedAt: "2099-01-01T15:00:00Z", expiresAt: null, announcedAt: null, status: "scheduled", announced: false },
  { id: B, body: "تهانينا لفريق المبيعات", publishedAt: "2026-10-01T09:00:00Z", expiresAt: null, announcedAt: "2026-10-01T09:00:05Z", status: "live", announced: true },
  { id: C, body: "إغلاق مؤقت للقاعة", publishedAt: "2026-09-01T09:00:00Z", expiresAt: "2026-09-02T09:00:00Z", announcedAt: "2026-09-01T09:00:03Z", status: "ended", announced: true },
];
const table = () => screen.getByRole("table");
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  vi.mocked(dal.createAnnouncement).mockReset();
  vi.mocked(dal.updateAnnouncement).mockReset();
  vi.mocked(dal.deleteAnnouncement).mockReset();
});

describe("the table", () => {
  it("draws الإعلان · النشر · ينتهي and a named ⋯", () => {
    render(<AnnouncementsTable rows={ROWS} timeZone="Asia/Riyadh" locale="ar" />, { wrapper: Wrap });
    expect(within(table()).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["الإعلان", "النشر", "ينتهي", "إجراءات"]);
  });

  it("★ state lives in the row — مجدول · منشور · منتهٍ, and «أُرسل» once members were notified", () => {
    render(<AnnouncementsTable rows={ROWS} timeZone="Asia/Riyadh" locale="ar" />, { wrapper: Wrap });
    const [scheduled, live, ended] = within(table()).getAllByRole("row").slice(1);
    expect(within(scheduled).getByText("مجدول")).toBeVisible();
    expect(within(scheduled).queryByText("أُرسل")).toBeNull();
    expect(within(live).getByText("منشور")).toBeVisible();
    expect(within(live).getByText("أُرسل")).toBeVisible();
    expect(within(ended).getByText("منتهٍ")).toBeVisible();
  });

  it("★ «احذف» confirms first, naming the announcement, then deletes and says so", async () => {
    vi.mocked(dal.deleteAnnouncement).mockResolvedValue({ ok: true });
    render(<AnnouncementsTable rows={ROWS} timeZone="Asia/Riyadh" locale="ar" />, { wrapper: Wrap });
    await userEvent.click(within(table()).getByRole("button", { name: "مزيد من الإجراءات على «يُفتتح مختبر الابتكار يوم الأحد»" }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["عدّل", "احذف"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "احذف" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("حذف «يُفتتح مختبر الابتكار يوم الأحد»؟");
    // A scheduled one that was never sent: the consequence is that nobody is told.
    expect(dialog).toHaveTextContent("لن يُنشر ولن يصل إشعاره لأحد.");
    expect(dal.deleteAnnouncement).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "احذف الإعلان" }));
    await waitFor(() => expect(dal.deleteAnnouncement).toHaveBeenCalledWith("ar", A));
    expect(await screen.findByText("حُذف الإعلان.")).toBeInTheDocument();
  });

  it("a delete that wrote nothing is «لم يُحفظ», and the dialog stays", async () => {
    vi.mocked(dal.deleteAnnouncement).mockResolvedValue({ ok: false });
    render(<AnnouncementsTable rows={ROWS} timeZone="Asia/Riyadh" locale="ar" />, { wrapper: Wrap });
    await userEvent.click(within(table()).getByRole("button", { name: "مزيد من الإجراءات على «تهانينا لفريق المبيعات»" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "احذف" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("يختفي من الصفحة الرئيسية لكل الأعضاء.");
    await userEvent.click(within(dialog).getByRole("button", { name: "احذف الإعلان" }));
    expect(await screen.findByText("لم يُحفظ — حاول مرة أخرى.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("empty: one sentence and the way to make one", () => {
    render(<AnnouncementsTable rows={[]} timeZone="Asia/Riyadh" locale="ar" />, { wrapper: Wrap });
    expect(screen.getByText("لا إعلانات بعد.")).toBeVisible();
    expect(screen.getByRole("link", { name: "إعلان جديد" })).toHaveAttribute("href", expect.stringContaining("/app/admin/announcements?new=1"));
  });

  it("has no axe violations", async () => {
    const { container } = render(<AnnouncementsTable rows={ROWS} timeZone="Asia/Riyadh" locale="ar" />, { wrapper: Wrap });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

describe("the form", () => {
  it("creates «now» by default — no time to pick — and counts the text against 500", async () => {
    const action = vi.fn(async () => emptyAnnouncementState);
    render(<AnnouncementForm action={action} announcement={null} timeZone="Asia/Riyadh" closeHref="/app/admin/announcements" />, { wrapper: Wrap });
    expect(screen.getByRole("radio", { name: "الآن" })).toBeChecked();
    expect(screen.queryByText("موعد النشر")).toBeNull();
    expect(screen.getByText("500", { exact: false }).closest("p")?.textContent).toBe("0 / 500");
    fireEvent.change(screen.getByLabelText(/النص/), { target: { value: "مرحبًا" } });
    expect(screen.getByText("500", { exact: false }).closest("p")?.textContent).toBe("6 / 500");
    expect(screen.getByLabelText(/النص/)).toHaveAttribute("maxlength", "500");
  });

  it("«في موعد» opens the picker", async () => {
    render(<AnnouncementForm action={vi.fn()} announcement={null} timeZone="Asia/Riyadh" closeHref="/app/admin/announcements" />, { wrapper: Wrap });
    await userEvent.click(screen.getByRole("radio", { name: "في موعد" }));
    expect(screen.getAllByText("موعد النشر").length).toBeGreaterThan(0);
  });

  it("editing one members were told of says the edit does not tell them again", () => {
    render(<AnnouncementForm action={vi.fn()} announcement={ROWS[1]} timeZone="Asia/Riyadh" closeHref="/app/admin/announcements" />, { wrapper: Wrap });
    expect(screen.getByText("وصل إشعاره للأعضاء، والتعديل لا يعيد إرساله.")).toBeVisible();
    expect((screen.getByLabelText(/النص/) as HTMLTextAreaElement).value).toBe("تهانينا لفريق المبيعات");
    expect(screen.getByRole("radio", { name: "في موعد" })).toBeChecked();
  });
});

describe("the actions", () => {
  it("★ «now» creates with no publish time — the column's now()", async () => {
    vi.mocked(dal.createAnnouncement).mockResolvedValue({ ok: true });
    const out = await saveAnnouncement("ar", null, emptyAnnouncementState, form({ body: "  إعلان  ", publish: "now", expiresAt: "" }));
    expect(out.saved).toBe(true);
    expect(dal.createAnnouncement).toHaveBeenCalledWith("ar", { body: "إعلان", publishAt: null, expiresAt: null });
  });

  it("★ scheduled: the wall clock is the org's — 18:00 in Riyadh is 15:00Z", async () => {
    vi.mocked(dal.createAnnouncement).mockResolvedValue({ ok: true });
    await saveAnnouncement("ar", null, emptyAnnouncementState, form({ body: "إعلان", publish: "at", publishAt: "2099-01-01T18:00", expiresAt: "2099-01-02T18:00" }));
    expect(dal.createAnnouncement).toHaveBeenCalledWith("ar", { body: "إعلان", publishAt: "2099-01-01T15:00:00.000Z", expiresAt: "2099-01-02T15:00:00.000Z" });
  });

  it("refuses at the field — empty text, a missing or past time, an end before the start", async () => {
    const empty = await saveAnnouncement("ar", null, emptyAnnouncementState, form({ body: " ", publish: "now" }));
    expect(empty.errors.body).toBe("bodyRequired");
    const long = await saveAnnouncement("ar", null, emptyAnnouncementState, form({ body: "ا".repeat(501), publish: "now" }));
    expect(long.errors.body).toBe("bodyTooLong");
    const missing = await saveAnnouncement("ar", null, emptyAnnouncementState, form({ body: "x", publish: "at", publishAt: "" }));
    expect(missing.errors.publishAt).toBe("publishAtRequired");
    const past = await saveAnnouncement("ar", null, emptyAnnouncementState, form({ body: "x", publish: "at", publishAt: "2020-01-01T10:00" }));
    expect(past.errors.publishAt).toBe("publishAtPast");
    const before = await saveAnnouncement("ar", null, emptyAnnouncementState, form({ body: "x", publish: "at", publishAt: "2099-01-02T10:00", expiresAt: "2099-01-01T10:00" }));
    expect(before.errors.expiresAt).toBe("expiresBeforePublish");
    expect(dal.createAnnouncement).not.toHaveBeenCalled();
  });

  it("an edit goes to updateAnnouncement; a write that matched nothing is «not saved»", async () => {
    vi.mocked(dal.updateAnnouncement).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    const fd = form({ body: "نص", publish: "at", publishAt: "2026-10-01T12:00" });
    // An edit may keep a time that has passed — the row was published then.
    expect((await saveAnnouncement("ar", B, emptyAnnouncementState, fd)).saved).toBe(true);
    expect(dal.updateAnnouncement).toHaveBeenCalledWith("ar", B, { body: "نص", publishAt: "2026-10-01T09:00:00.000Z", expiresAt: null });
    const nothing = await saveAnnouncement("ar", B, emptyAnnouncementState, fd);
    expect(nothing.saved).toBe(false);
    expect(nothing.formError).toBe("failed");
  });

  it("a malformed id deletes nothing", async () => {
    expect(await deleteAnnouncementAction("ar", "x")).toEqual({ ok: false });
    expect(dal.deleteAnnouncement).not.toHaveBeenCalled();
  });
});
