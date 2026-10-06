// REQ-SES-023 (0215) — deleting an event from SCR-042 and from the hub's header. Real messages, fake actions.
// One confirm for the row, the selection and the hub: it names the event (or «N فعاليات»), says what the delete
// takes back from `session_deletion_impact()` — a zero part not drawn — takes an optional reason, and calls the
// bound action with the ids. A failed id in a bulk run is named by its title.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/admin.json";
import browseAr from "@/messages/ar/browse.json";
import { ToastProvider } from "@/components/ui/toast";
import type { ConsoleSessionRow, SessionQuery } from "@/components/admin/sessions/session-query";
import type { DeleteState } from "@/components/admin/sessions/delete-state";
import type { DeletionImpact } from "@/lib/dal/sessions";

const replace = vi.fn();
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
  usePathname: () => "/ar/app/admin/sessions",
}));
vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

const { SessionsTable } = await import("@/app/[locale]/app/admin/sessions/sessions-table");
const { DeleteSessionButton } = await import("@/components/admin/sessions/delete-sessions");

const messages = { ...ar, ...browseAr };

const row = (over: Partial<ConsoleSessionRow>): ConsoleSessionRow => ({
  id: "s1",
  title: "جلسة الأمان السحابي",
  state: "published",
  phase: "open",
  seat: "available",
  startsAt: "2026-10-04T14:00:00Z",
  endsAt: "2026-10-04T15:00:00Z",
  dayCount: 1,
  venueName: "قاعة الرياض",
  capacity: 40,
  confirmed: 12,
  waitlisted: 0,
  categoryId: null,
  presenters: [],
  monthKey: "2026-10",
  ...over,
});
const ROWS = [row({}), row({ id: "s2", title: "أساسيات الشبكات", state: "completed", phase: "ended" })];
const QUERY: SessionQuery = { q: "", status: null, category: null, month: null, sort: "default", dir: "asc", page: 1 };

const impact = (over: Partial<DeletionImpact> = {}): DeletionImpact => ({ sessions: 1, toCancel: 0, membersWithPoints: 0, certificates: 0, ...over });
const done = (over: Partial<DeleteState> = {}): DeleteState => ({ error: null, deleted: [], failed: [], pointsReversed: 0, certificatesRevoked: 0, attempt: 1, ...over });

function renderTable(preview: (ids: string[]) => Promise<DeletionImpact | null>, run: (prev: DeleteState, fd: FormData) => Promise<DeleteState>) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <main>
          <SessionsTable
            mode="admin"
            rows={ROWS}
            query={QUERY}
            total={ROWS.length}
            from={1}
            to={ROWS.length}
            page={1}
            pageCount={1}
            timeZone="Asia/Riyadh"
            locale="ar"
            categories={[]}
            months={[]}
            actionsById={{ s1: ["cancel"], s2: ["archive"] }}
            transitionActions={{ s1: vi.fn(), s2: vi.fn() }}
            previewDelete={preview}
            runDelete={run}
          />
        </main>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

async function openRowDelete(title: string) {
  await userEvent.click(screen.getAllByRole("button", { name: new RegExp(`مزيد من الإجراءات على ${title}`) })[0]);
  await userEvent.click(await screen.findByRole("menuitem", { name: "احذف" }));
}

describe("REQ-SES-023 — the row's «احذف»", () => {
  it("names the event and words only the non-zero parts of the impact", async () => {
    const preview = vi.fn().mockResolvedValue(impact({ toCancel: 1, membersWithPoints: 0, certificates: 3 }));
    renderTable(preview, vi.fn());
    await openRowDelete("جلسة الأمان السحابي");
    const dialog = await screen.findByRole("dialog", { name: "حذف «جلسة الأمان السحابي»؟" });
    expect(preview).toHaveBeenCalledWith(["s1"]);
    const lines = await within(dialog).findByTestId("deletion-impact");
    expect(within(lines).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["ستُلغى فعالية قادمة ويُبلَّغ من حجز", "ستُلغى 3 شهادات"]);
    expect(within(dialog).queryByText(/ستُسحب نقاط/)).toBeNull();
  });

  it("an impact of nothing draws no consequence line at all", async () => {
    renderTable(vi.fn().mockResolvedValue(impact()), vi.fn());
    await openRowDelete("جلسة الأمان السحابي");
    const dialog = await screen.findByRole("dialog", { name: "حذف «جلسة الأمان السحابي»؟" });
    await waitFor(() => expect(within(dialog).queryByText("جارٍ حساب ما سيُسحب…")).toBeNull());
    expect(within(dialog).queryByTestId("deletion-impact")).toBeNull();
  });

  it("calls the bound action with the one id and the reason, toasts what was done, and closes", async () => {
    const run = vi.fn().mockResolvedValue(done({ deleted: ["s1"], pointsReversed: 4, certificatesRevoked: 1 }));
    renderTable(vi.fn().mockResolvedValue(impact({ membersWithPoints: 2 })), run);
    await openRowDelete("جلسة الأمان السحابي");
    const dialog = await screen.findByRole("dialog", { name: "حذف «جلسة الأمان السحابي»؟" });
    expect(await within(dialog).findByText("ستُسحب نقاط عضوين")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("السبب"), "مكررة");
    await userEvent.click(within(dialog).getByRole("button", { name: "احذف" }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const fd = run.mock.calls[0][1] as FormData;
    expect(fd.getAll("ids")).toEqual(["s1"]);
    expect(fd.get("reason")).toBe("مكررة");
    expect(await screen.findByText("حُذفت الفعالية · سُحبت نقاطها · أُلغيت شهادة واحدة")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("REQ-SES-023 — «احذف المحدّد»", () => {
  async function selectBoth() {
    const table = screen.getByRole("table", { hidden: true });
    await userEvent.click(within(table).getAllByRole("checkbox", { hidden: true })[0]);
  }

  it("titles the dialog with the count, lists the events, and sends every id", async () => {
    const preview = vi.fn().mockResolvedValue(impact({ sessions: 2, membersWithPoints: 5 }));
    const run = vi.fn().mockResolvedValue(done({ deleted: ["s1", "s2"] }));
    renderTable(preview, run);
    await selectBoth();
    await userEvent.click(screen.getByRole("button", { name: "احذف المحدّد" }));
    const dialog = await screen.findByRole("dialog", { name: "حذف فعاليتين؟" });
    expect(preview).toHaveBeenCalledWith(["s1", "s2"]);
    expect(await within(dialog).findByText("ستُسحب نقاط 5 أعضاء")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "احذف" }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect((run.mock.calls[0][1] as FormData).getAll("ids")).toEqual(["s1", "s2"]);
    expect(await screen.findByText("حُذفت فعاليتان")).toBeInTheDocument();
  });

  it("names a failed event by its title and keeps it selected", async () => {
    const run = vi.fn().mockResolvedValue(done({ deleted: ["s1"], failed: ["s2"] }));
    renderTable(vi.fn().mockResolvedValue(impact({ sessions: 2 })), run);
    await selectBoth();
    await userEvent.click(screen.getByRole("button", { name: "احذف المحدّد" }));
    const dialog = await screen.findByRole("dialog", { name: "حذف فعاليتين؟" });
    await userEvent.click(within(dialog).getByRole("button", { name: "احذف" }));
    expect(await screen.findByText(/تعذّر حذف: .*«أساسيات الشبكات»/)).toBeInTheDocument();
    expect(screen.getByText("حُذفت الفعالية")).toBeInTheDocument();
    // What failed stays selected: the bulk bar still offers the delete for it.
    expect(await screen.findByRole("button", { name: "احذف المحدّد" })).toBeInTheDocument();
    expect(screen.getByText("جلسة واحدة محدّدة")).toBeInTheDocument();
  });
});

describe("REQ-SES-023 — the hub's «احذف الفعالية»", () => {
  function renderHub(run: (prev: DeleteState, fd: FormData) => Promise<DeleteState>) {
    return render(
      <NextIntlClientProvider locale="ar" messages={messages}>
        <ToastProvider closeLabel="إغلاق">
          <DeleteSessionButton
            target={{ id: "s1", title: "جلسة الأمان السحابي" }}
            preview={vi.fn().mockResolvedValue(impact({ toCancel: 1 }))}
            run={run}
            redirectTo="/app/admin/sessions"
          />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
  }

  it("opens the same dialog and, once deleted, goes back to the sessions list", async () => {
    replace.mockClear();
    const run = vi.fn().mockResolvedValue(done({ deleted: ["s1"] }));
    renderHub(run);
    await userEvent.click(screen.getByRole("button", { name: "احذف الفعالية" }));
    const dialog = await screen.findByRole("dialog", { name: "حذف «جلسة الأمان السحابي»؟" });
    expect(await within(dialog).findByText("ستُلغى فعالية قادمة ويُبلَّغ من حجز")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "احذف" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/admin/sessions"));
    expect((run.mock.calls[0][1] as FormData).getAll("ids")).toEqual(["s1"]);
  });

  it("a refusal stays on the hub and says so", async () => {
    replace.mockClear();
    renderHub(vi.fn().mockResolvedValue(done({ error: "refused", failed: ["s1"] })));
    await userEvent.click(screen.getByRole("button", { name: "احذف الفعالية" }));
    const dialog = await screen.findByRole("dialog", { name: "حذف «جلسة الأمان السحابي»؟" });
    await userEvent.click(within(dialog).getByRole("button", { name: "احذف" }));
    expect(await screen.findByText("لا تملك صلاحية الحذف.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
