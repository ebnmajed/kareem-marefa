// SCR-046, written for wave 22 from `AdminVenues.dc.html` (`REQ-UIX-093`, `REQ-ADM-022`, `DEC-232`).
// The job: the owner sets every venue's company, one move per row. These cases hold what the screen must say and do;
// the audit rows are the database's (`tests/rls/console-audit*`, the lead's).
import type React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { ToastProvider } from "@/components/ui/toast";
import type { AdminVenue } from "@/lib/dal/sessions";
import adminAr from "@/messages/ar/admin.json";
import uiAr from "@/messages/ar/ui.json";

const replace = vi.fn();
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/sessions", async () => {
  const { z } = await import("zod");
  return {
    venueInput: z
      .object({
        name: z.string().trim().min(1).max(120),
        address: z.string().trim().max(300).nullable(),
        mapUrl: z.url().startsWith("https://").nullable(),
        capacity: z.int().min(1).max(10000).nullable(),
        notes: z.string().trim().max(2000).nullable(),
        timeZone: z.string().trim().max(64).nullable(),
        companyId: z.uuid().nullable().optional(),
      })
      .strict(),
    createVenue: vi.fn(),
    updateVenue: vi.fn(),
    setVenueActive: vi.fn(),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const dal = await import("@/lib/dal/sessions");
const { saveVenue, setVenueActiveAction } = await import("@/app/[locale]/app/admin/venues/actions");
const { VenuesTable } = await import("@/app/[locale]/app/admin/venues/venues-table");
const { VenueForm } = await import("@/app/[locale]/app/admin/venues/venue-form");
const { emptyVenueState } = await import("@/app/[locale]/app/admin/venues/state");

const messages = { ...adminAr, ...uiAr };
const Wrap = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={messages}>
    <ToastProvider closeLabel="إغلاق">
      <main>{children}</main>
    </ToastProvider>
  </NextIntlClientProvider>
);

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const venue = (over: Partial<AdminVenue>): AdminVenue => ({
  id: "33333333-3333-4333-8333-333333333333",
  name: "قاعة الرياض",
  address: "الدور الثالث، الرياض",
  capacity: 40,
  mapUrl: null,
  notes: null,
  timeZone: null,
  deactivatedAt: null,
  upcomingSessions: 2,
  sessionCount: 27,
  company: { id: C1, name: "شبه الجزيرة", teamColor: "#e9e4d6", deactivated: false },
  ...over,
});

const ROWS: AdminVenue[] = [
  venue({}),
  venue({ id: "44444444-4444-4444-8444-444444444444", name: "مقهى عام", company: null, capacity: null, sessionCount: 0 }),
  venue({ id: "55555555-5555-4555-8555-555555555555", name: "معرض قديم", deactivatedAt: "2026-09-01T00:00:00Z", company: { id: C2, name: "دبابيس", teamColor: null, deactivated: true } }),
];

const table = () => screen.getByRole("table");
const cardList = (container: HTMLElement) => container.querySelector("ul") as HTMLElement;

beforeEach(() => {
  vi.mocked(dal.createVenue).mockReset();
  vi.mocked(dal.updateVenue).mockReset();
  vi.mocked(dal.setVenueActive).mockReset();
  replace.mockReset();
});

describe("SCR-046 — the table", () => {
  it("draws the artboard's columns: المكان · الشركة · العنوان · السعة · الجلسات, and a named ⋯", () => {
    render(<VenuesTable venues={ROWS} locale="ar" />, { wrapper: Wrap });
    const headers = within(table()).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["المكان", "الشركة", "العنوان", "السعة", "الجلسات", "إجراءات"]);
    expect(within(table()).getByRole("button", { name: "مزيد من الإجراءات على قاعة الرياض" })).toBeVisible();
    expect(within(within(table()).getAllByRole("row")[1]).getAllByRole("cell")[4].textContent).toBe("27");
  });

  it("★ the company is a swatch AND its name; a venue owned by nobody says «لا شركة» and draws no swatch (REQ-UIX-093)", () => {
    render(<VenuesTable venues={ROWS} locale="ar" />, { wrapper: Wrap });
    const [first, second] = within(table()).getAllByRole("row").slice(1);
    expect(within(first).getByText("شبه الجزيرة")).toBeVisible();
    expect(first.querySelector("[aria-hidden='true'].bg-team")).not.toBeNull();
    expect(within(second).getByText("لا شركة")).toBeVisible();
    expect(second.querySelector("[aria-hidden='true'].size-4")).toBeNull();
  });

  it("★ a deactivated owner is named as inactive — it earns no hosting points (DEC-232 §1.2)", () => {
    render(<VenuesTable venues={ROWS} locale="ar" />, { wrapper: Wrap });
    const row = within(table()).getAllByRole("row")[3];
    expect(within(row).getByText("دبابيس")).toBeVisible();
    expect(within(row).getByText("معطّلة")).toBeVisible();
  });

  it("state lives in the row: «معطّل» beside a deactivated venue, nothing beside an active one", () => {
    render(<VenuesTable venues={ROWS} locale="ar" />, { wrapper: Wrap });
    const rows = within(table()).getAllByRole("row").slice(1);
    expect(within(rows[0]).queryByText("معطّل")).toBeNull();
    expect(within(rows[0]).queryByText("نشط")).toBeNull();
    expect(within(rows[2]).getByText("معطّل")).toBeVisible();
  });

  it("the phone card carries the ⋯ too (wave 8, F1)", () => {
    const { container } = render(<VenuesTable venues={ROWS} locale="ar" />, { wrapper: Wrap });
    const [card] = within(cardList(container)).getAllByRole("listitem");
    expect(within(card).getByRole("button", { name: "مزيد من الإجراءات على قاعة الرياض" })).toBeVisible();
  });

  it("«عدّل» opens the row's form by URL; «عطّل» confirms naming the venue, and the toast is what the server WROTE", async () => {
    vi.mocked(dal.setVenueActive).mockResolvedValue({ ok: true });
    render(<VenuesTable venues={ROWS} locale="ar" />, { wrapper: Wrap });
    await userEvent.click(within(table()).getByRole("button", { name: "مزيد من الإجراءات على قاعة الرياض" }));
    expect(screen.getByRole("menuitem", { name: "عدّل" }).closest("a")?.getAttribute("href")).toContain("?edit=33333333-3333-4333-8333-333333333333");
    await userEvent.click(screen.getByRole("menuitem", { name: "عطّل" }));
    const dialog = screen.getByRole("dialog", { name: "تعطيل «قاعة الرياض»؟" });
    await userEvent.click(within(dialog).getByRole("button", { name: "تأكيد التعطيل" }));
    await waitFor(() => expect(dal.setVenueActive).toHaveBeenCalledWith("ar", "33333333-3333-4333-8333-333333333333", false));
    expect(await screen.findByText("تم التعطيل.", { exact: true })).toBeInTheDocument();
  });

  it("★ a write that matched no row says «لم يُحفظ», never «تم التعطيل.» (DEC-232 §3.1)", async () => {
    vi.mocked(dal.setVenueActive).mockResolvedValue({ ok: false });
    render(<VenuesTable venues={ROWS} locale="ar" />, { wrapper: Wrap });
    await userEvent.click(within(table()).getByRole("button", { name: "مزيد من الإجراءات على قاعة الرياض" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "عطّل" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "تأكيد التعطيل" }));
    expect(await screen.findByText("لم يُحفظ — حاول مرة أخرى.", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("تم التعطيل.", { exact: true })).toBeNull();
  });

  it("an empty list offers «مكان جديد»", () => {
    render(<VenuesTable venues={[]} locale="ar" />, { wrapper: Wrap });
    expect(screen.getByText("لا أماكن بعد.")).toBeVisible();
    expect(screen.getByRole("link", { name: "مكان جديد" }).getAttribute("href")).toContain("?new=1");
  });

  it("has no axe violations", async () => {
    const { container } = render(<VenuesTable venues={ROWS} locale="ar" />, { wrapper: Wrap });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

describe("SCR-046 — the form", () => {
  const companies = [
    { id: C1, name: "شبه الجزيرة", deactivated: false },
    { id: C2, name: "دبابيس", deactivated: true },
  ];

  it("★ «لا شركة» is the first choice and a real one; a deactivated company is offered only to the venue it owns, named inactive", () => {
    const { unmount } = render(<VenueForm action={vi.fn()} venue={null} companies={companies} closeHref="/app/admin/venues" />, { wrapper: Wrap });
    const select = screen.getByLabelText("الشركة") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["لا شركة", "شبه الجزيرة"]);
    expect(select.value).toBe("none");
    unmount();
    render(<VenueForm action={vi.fn()} venue={ROWS[2]} companies={companies} closeHref="/app/admin/venues" />, { wrapper: Wrap });
    const owned = screen.getByLabelText("الشركة") as HTMLSelectElement;
    expect(Array.from(owned.options).map((o) => o.textContent)).toEqual(["لا شركة", "شبه الجزيرة", "دبابيس — معطّلة"]);
    expect(owned.value).toBe(C2);
  });

  it("edit opens on the venue as stored", () => {
    render(<VenueForm action={vi.fn()} venue={ROWS[0]} companies={companies} closeHref="/app/admin/venues" />, { wrapper: Wrap });
    expect((screen.getByLabelText(/الاسم/) as HTMLInputElement).value).toBe("قاعة الرياض");
    expect((screen.getByLabelText("الشركة") as HTMLSelectElement).value).toBe(C1);
  });

  it("the summary's links focus the control (wave 8, F4)", async () => {
    const action = vi.fn(async () => ({ ...emptyVenueState, errors: { name: "nameRequired" }, attempt: 1 }));
    const { container } = render(<VenueForm action={action} venue={null} companies={companies} closeHref="/app/admin/venues" />, { wrapper: Wrap });
    fireEvent.submit(container.querySelector("form")!);
    const summary = await screen.findByRole("alert");
    fireEvent.click(within(summary).getAllByRole("link")[0]);
    expect(document.activeElement?.id).toBe("venue-name");
  });

  it("a save that wrote toasts and returns to the list", async () => {
    const action = vi.fn(async () => ({ ...emptyVenueState, saved: true }));
    const { container } = render(<VenueForm action={action} venue={ROWS[0]} companies={companies} closeHref="/app/admin/venues" />, { wrapper: Wrap });
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findAllByText("حُفظ المكان.")).not.toHaveLength(0);
    expect(replace).toHaveBeenCalledWith("/ar/app/admin/venues", { scroll: false });
  });
});

describe("SCR-046 — the actions", () => {
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };

  it("«لا شركة» posts null; a company posts its id; an edit goes to updateVenue", async () => {
    vi.mocked(dal.updateVenue).mockResolvedValue({ ok: true });
    vi.mocked(dal.createVenue).mockResolvedValue({ ok: true });
    expect((await saveVenue("ar", null, emptyVenueState, form({ name: "قاعة", companyId: "none" }))).saved).toBe(true);
    expect(vi.mocked(dal.createVenue).mock.calls[0][1].companyId).toBeNull();
    await saveVenue("ar", "33333333-3333-4333-8333-333333333333", emptyVenueState, form({ name: "قاعة", companyId: C1 }));
    expect(vi.mocked(dal.updateVenue).mock.calls[0][1]).toBe("33333333-3333-4333-8333-333333333333");
    expect(vi.mocked(dal.updateVenue).mock.calls[0][2].companyId).toBe(C1);
  });

  it("another org's company (0180's 23514) is refused at the field; a write that matched nothing is «not saved»", async () => {
    vi.mocked(dal.updateVenue).mockResolvedValueOnce({ ok: false, error: "companyInvalid" }).mockResolvedValueOnce({ ok: false, error: "failed" });
    const refused = await saveVenue("ar", "33333333-3333-4333-8333-333333333333", emptyVenueState, form({ name: "قاعة", companyId: C2 }));
    expect(refused.saved).toBe(false);
    expect(refused.errors.companyId).toBe("companyInvalid");
    const nothing = await saveVenue("ar", "33333333-3333-4333-8333-333333333333", emptyVenueState, form({ name: "قاعة", companyId: C1 }));
    expect(nothing.saved).toBe(false);
    expect(nothing.formError).toBe("failed");
  });

  it("a malformed id writes nothing; the toggle passes the DAL's answer through", async () => {
    expect(await setVenueActiveAction("ar", "not-a-uuid", false)).toEqual({ ok: false });
    expect(dal.setVenueActive).not.toHaveBeenCalled();
    vi.mocked(dal.setVenueActive).mockResolvedValue({ ok: false });
    expect(await setVenueActiveAction("ar", "33333333-3333-4333-8333-333333333333", false)).toEqual({ ok: false });
  });
});
