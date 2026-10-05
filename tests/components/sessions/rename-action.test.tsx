// A session renamed from the hub's header — REQ-SES-021, DEC-254 §5, DEC-255 (wave 27).
//
// Three layers, each pinned: WHEN the header offers it (the five states before `published`, an admin's only); the
// DIALOG (the bounds at the field, what was typed kept, the saved title from the server's answer, closed by the
// result); and the DAL's reading of the database's three answers (a row, no row, `session_title_locked`).
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import sessionsAr from "@/messages/ar/sessions.json";
import uiAr from "@/messages/ar/ui.json";
import type { RenameState } from "@/app/[locale]/app/admin/sessions/[id]/_hub/rename-state";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));

const show = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show }) }));

const ORG = "00000000-0000-4000-8000-0000000000aa";
const SESSION = "00000000-0000-4000-8000-0000000000cc";
const db: { role: "admin" | "moderator" | "member"; answer: { data: unknown; error: unknown }; sent: unknown[] } = {
  role: "admin",
  answer: { data: [], error: null },
  sent: [],
};

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({
    session: { memberId: "m", orgId: ORG, role: db.role },
    supabase: {
      from: (table: string) => ({
        update: (values: unknown) => {
          db.sent.push({ table, values });
          return { eq: () => ({ select: async () => db.answer }) };
        },
      }),
    },
  }),
}));

const { RENAMEABLE_STATES, renameSession } = await import("@/lib/dal/sessions");
const { RenameAction } = await import("@/components/sessions/session-rename");

const R = sessionsAr.sessions.hub.rename;
const MESSAGES = { ...sessionsAr, ...uiAr };

function mount(action: (prev: RenameState, formData: FormData) => Promise<RenameState>, title = "مقدمة في التحليل") {
  return render(
    <NextIntlClientProvider locale="ar" messages={MESSAGES}>
      <RenameAction action={action} title={title} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  show.mockClear();
  db.role = "admin";
  db.answer = { data: [], error: null };
  db.sent = [];
});

describe("offered before publication only (DEC-255)", () => {
  const ALL = ["draft", "submitted", "in_review", "changes_requested", "approved", "published", "in_progress", "completed", "archived", "cancelled"] as const;

  it("the five states before `published` — and none from it on, a cancelled one included", () => {
    expect(ALL.filter((s) => RENAMEABLE_STATES.has(s))).toEqual(["draft", "submitted", "in_review", "changes_requested", "approved"]);
    for (const s of ["published", "in_progress", "completed", "archived", "cancelled"] as const) expect(RENAMEABLE_STATES.has(s)).toBe(false);
  });
});

describe("the dialog", () => {
  it("opens on «عدّل الاسم», names the session in <bdi>, and holds its current name", async () => {
    mount(async (p) => p);
    await userEvent.click(screen.getByRole("button", { name: R.open }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector("bdi")?.textContent).toBe("مقدمة في التحليل");
    expect(screen.getByRole("textbox", { name: R.label })).toHaveValue("مقدمة في التحليل");
  });

  it("a refusal at the bounds is said at the field, and what was typed is kept", async () => {
    const action = vi.fn(async (_p: RenameState, fd: FormData): Promise<RenameState> => ({ error: "tooShort", saved: null, title: String(fd.get("title")) }));
    mount(action);
    await userEvent.click(screen.getByRole("button", { name: R.open }));
    const field = await screen.findByRole("textbox", { name: R.label });
    await userEvent.clear(field);
    await userEvent.type(field, "اب");
    await userEvent.click(screen.getByRole("button", { name: R.save }));
    await waitFor(() => expect(screen.getByText(R.tooShort)).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: R.label })).toHaveValue("اب");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(show).not.toHaveBeenCalled();
  });

  it("saved: the toast from the server's answer, and the dialog closes by the result", async () => {
    mount(async () => ({ error: null, saved: "الاسم الجديد", title: "" }));
    await userEvent.click(screen.getByRole("button", { name: R.open }));
    await userEvent.click(await screen.findByRole("button", { name: R.save }));
    await waitFor(() => expect(show).toHaveBeenCalledWith({ title: R.saved, tone: "success" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("locked — published since it opened: said once, and the dialog closes", async () => {
    mount(async (_p, fd) => ({ error: "locked", saved: null, title: String(fd.get("title")) }));
    await userEvent.click(screen.getByRole("button", { name: R.open }));
    await userEvent.click(await screen.findByRole("button", { name: R.save }));
    await waitFor(() => expect(show).toHaveBeenCalledWith({ title: R.locked, tone: "error" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("failed: said, and the dialog stays with the words typed", async () => {
    mount(async (_p, fd) => ({ error: "failed", saved: null, title: String(fd.get("title")) }));
    await userEvent.click(screen.getByRole("button", { name: R.open }));
    await userEvent.click(await screen.findByRole("button", { name: R.save }));
    await waitFor(() => expect(show).toHaveBeenCalledWith({ title: R.failed, tone: "error" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("renameSession() reads the database's answer", () => {
  it("one row: the ROW's title, trimmed on the way in", async () => {
    db.answer = { data: [{ id: SESSION, title: "الاسم الجديد" }], error: null };
    await expect(renameSession("ar", SESSION, "  الاسم الجديد  ")).resolves.toEqual({ ok: true, title: "الاسم الجديد" });
    expect(db.sent).toEqual([{ table: "sessions", values: { title: "الاسم الجديد" } }]);
  });

  it("no row is RLS's refusal", async () => {
    await expect(renameSession("ar", SESSION, "اسم كافٍ")).resolves.toEqual({ ok: false, reason: "refused" });
  });

  it("★ the guard's `session_title_locked` is «locked»", async () => {
    db.answer = { data: null, error: { code: "55000", message: "session_title_locked" } };
    await expect(renameSession("ar", SESSION, "اسم كافٍ")).resolves.toEqual({ ok: false, reason: "locked" });
  });

  it("any other error is «failed»", async () => {
    db.answer = { data: null, error: { code: "23514", message: "new row violates check constraint" } };
    await expect(renameSession("ar", SESSION, "اسم كافٍ")).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("out of bounds, or not an admin: nothing is sent", async () => {
    await expect(renameSession("ar", SESSION, "اب")).resolves.toEqual({ ok: false, reason: "failed" });
    await expect(renameSession("ar", SESSION, "ا".repeat(151))).resolves.toEqual({ ok: false, reason: "failed" });
    db.role = "moderator";
    await expect(renameSession("ar", SESSION, "اسم كافٍ")).resolves.toEqual({ ok: false, reason: "refused" });
    expect(db.sent).toEqual([]);
  });
});
