// SCR-043's presenters section (REQ-SES-019, DEC-172, DEC-174) — what it
// offers and what it withholds. The rules are the RPCs' (proven in
// `tests/rls/session-presenters-admin.test.ts`); this file proves the screen
// does not OFFER what they would refuse, and words what they do refuse.
//
// Rendered against the real `ar/` catalogues, so a missing key fails here.
// A NEW file (wave-12 rule 3).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import adminAr from "@/messages/ar/admin.json";
import proposalsAr from "@/messages/ar/proposals.json";
import scheduleAr from "@/messages/ar/schedule.json";
import uiAr from "@/messages/ar/ui.json";
import { PresentersSection, type PresenterRow } from "@/app/[locale]/app/admin/sessions/[id]/schedule/presenters-section";
import type { AddPresenterState } from "@/app/[locale]/app/admin/sessions/[id]/schedule/presenters-state";

const MESSAGES = { ...adminAr, ...proposalsAr, ...scheduleAr, ...uiAr };
const T = scheduleAr.schedule.presenters;

const SARA = "00000000-0000-4000-8000-00000000000a";
const KHALID = "00000000-0000-4000-8000-00000000000b";
const NORA = "00000000-0000-4000-8000-00000000000c";

const MEMBERS = [
  { id: SARA, displayName: "سارة العتيبي", email: "sara@example.com" },
  { id: KHALID, displayName: "خالد", email: "khalid@example.com" },
  { id: NORA, displayName: "نورة", email: "nora@example.com" },
];

const row = (memberId: string, displayName: string, over: Partial<PresenterRow> = {}): PresenterRow => ({
  memberId,
  displayName,
  accepted: true,
  declinedAt: null,
  ...over,
});

function mount(
  presenters: PresenterRow[],
  over: { completed?: boolean; locked?: boolean; addAction?: (prev: AddPresenterState, fd: FormData) => Promise<AddPresenterState> } = {},
) {
  const removeActions = Object.fromEntries(presenters.map((p) => [p.memberId, vi.fn(async () => {})]));
  render(
    <NextIntlClientProvider locale="ar" messages={MESSAGES}>
      <PresentersSection
        presenters={presenters}
        members={MEMBERS}
        completed={over.completed ?? false}
        locked={over.locked}
        addAction={over.addAction ?? (async () => ({ status: "idle" }))}
        removeActions={removeActions}
      />
    </NextIntlClientProvider>,
  );
  return removeActions;
}

describe("the last accepted presenter", () => {
  it("has no «أزل», and the screen says why", () => {
    mount([row(SARA, "سارة العتيبي")]);
    expect(screen.queryByRole("button", { name: /^أزل/ })).not.toBeInTheDocument();
    expect(screen.getByText(T.onlyOne)).toBeInTheDocument();
  });

  it("two accepted presenters can each be removed, by name", () => {
    mount([row(SARA, "سارة العتيبي"), row(KHALID, "خالد")]);
    expect(screen.getByRole("button", { name: "أزل سارة العتيبي من المُقدِّمين" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "أزل خالد من المُقدِّمين" })).toBeInTheDocument();
    expect(screen.queryByText(T.onlyOne)).not.toBeInTheDocument();
  });

  it("a pending row beside the one accepted presenter is removable, and badged", () => {
    mount([row(SARA, "سارة العتيبي"), row(KHALID, "خالد", { accepted: false })]);
    expect(screen.queryByRole("button", { name: /أزل سارة/ })).not.toBeInTheDocument();
    const khalid = screen.getAllByRole("listitem").find((li) => li.textContent?.includes("خالد"))!;
    expect(within(khalid).getByText(T.pending)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /أزل خالد/ })).toBeInTheDocument();
  });
});

describe("the confirm speaks of the session, and of points only after completion", () => {
  it("before completion: no word about points", async () => {
    mount([row(SARA, "سارة العتيبي"), row(KHALID, "خالد")]);
    await userEvent.click(screen.getByRole("button", { name: /أزل خالد/ }));
    const dialog = await screen.findByRole("dialog", { name: "إزالة خالد من مُقدِّمي الجلسة؟" });
    expect(dialog).toHaveTextContent(T.removeConfirmBody);
    expect(dialog).not.toHaveTextContent("نقاط");
  });

  it("after completion: the reversal is named, in the confirm and above the picker", async () => {
    mount([row(SARA, "سارة العتيبي"), row(KHALID, "خالد")], { completed: true });
    expect(screen.getByText(T.completedNote)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /أزل خالد/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent(T.removeConfirmBodyCompleted);
  });
});

describe("the add form", () => {
  it("offers nobody who already presents", async () => {
    mount([row(SARA, "سارة العتيبي"), row(KHALID, "خالد", { accepted: false })]);
    await userEvent.click(screen.getByRole("combobox", { name: T.addLabel }));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent ?? "");
    expect(options.some((o) => o.includes("سارة"))).toBe(false);
    // A pending row stays pickable — adding them is how they become a presenter.
    expect(options.some((o) => o.includes("خالد"))).toBe(true);
    expect(options.some((o) => o.includes("نورة"))).toBe(true);
  });

  it("a refusal is the field's error, worded — the checked-in case says what to do first", async () => {
    const addAction = vi.fn(async (): Promise<AddPresenterState> => ({ status: "refused", error: "member_checked_in", memberId: NORA }));
    mount([row(SARA, "سارة العتيبي")], { addAction });
    await userEvent.click(screen.getByRole("button", { name: T.add }));
    await waitFor(() => expect(addAction).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(T.errors.member_checked_in)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: T.addLabel })).toHaveAttribute("aria-invalid", "true");
  });

  it("a success is announced by name in the status region", async () => {
    const addAction = vi.fn(async (): Promise<AddPresenterState> => ({ status: "added", memberId: NORA }));
    mount([row(SARA, "سارة العتيبي")], { addAction });
    await userEvent.click(screen.getByRole("button", { name: T.add }));
    const status = await screen.findByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("أُضيف نورة إلى المُقدِّمين."));
    expect(within(status).getByText("نورة").tagName).toBe("BDI");
  });
});

describe("a cancelled session", () => {
  it("shows who presented it and offers nothing", () => {
    mount([row(SARA, "سارة العتيبي"), row(KHALID, "خالد")], { locked: true });
    expect(screen.getByText("سارة العتيبي")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
