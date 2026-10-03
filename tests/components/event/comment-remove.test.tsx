// REQ-EVT-014, REQ-UIX-013 (wave 22, F6) — staff remove a comment on the event page with a reason: a dialog naming
// whose comment, the reason required at the field and kept when refused, the answer the database gave.
import { type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import eventAr from "@/messages/ar/event.json";
import feedAr from "@/messages/ar/feed.json";
import uiAr from "@/messages/ar/ui.json";
import { ToastProvider } from "@/components/ui/toast";
import type { CommentDTO } from "@/lib/dal/comments";

vi.mock("@/components/event/actions", () => ({
  editCommentAction: vi.fn().mockResolvedValue({ error: null }),
  deleteMyCommentAction: vi.fn().mockResolvedValue({ error: null }),
  removeCommentAction: vi.fn().mockResolvedValue({ outcome: "removed" }),
  toggleReactionAction: vi.fn().mockResolvedValue({ error: null }),
  reportCommentAction: vi.fn().mockResolvedValue({ error: null }),
}));
const refresh = vi.fn();
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh }) }));

const actions = await import("@/components/event/actions");
const { CommentItem } = await import("@/components/event/comment-item");

const NOW = "2026-10-01T12:00:00Z";
const messages = { ...eventAr, ...feedAr, ...uiAr };
const comment: CommentDTO = {
  id: "c1",
  sessionId: "s1",
  parentId: null,
  author: { id: "a1", displayName: "سارة القحطاني", avatarUrl: null, company: null, isPresenter: false },
  body: "رابط لمنتج خارجي",
  mentions: [],
  createdAt: "2026-10-01T10:00:00Z",
  editedAt: null,
  deletedAt: null,
  isMine: false,
  canEditNow: false,
  isStaffViewer: true,
};

function mount(node: ReactNode = <CommentItem locale="ar" comment={comment} reactions={{ totals: {}, mine: [] }} reported={false} now={NOW} timeZone="Asia/Riyadh" />) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">{node}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

async function openDialog() {
  await userEvent.click(screen.getByRole("button", { name: "إزالة" }));
  return screen.findByRole("dialog", { name: "إزالة تعليق سارة القحطاني؟" });
}

describe("staff removal on the event page", () => {
  it("★ opens a dialog naming whose comment, and sends the reason; the page refreshes on the answer", async () => {
    mount();
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText("السبب — يُسجَّل في سجل التدقيق", { exact: false }), "دعاية");
    await userEvent.click(within(dialog).getByRole("button", { name: "إزالة" }));
    await waitFor(() => expect(actions.removeCommentAction).toHaveBeenCalledWith("ar", "c1", "دعاية"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("a refused reason is said at the field, and what was typed stays", async () => {
    vi.mocked(actions.removeCommentAction).mockResolvedValueOnce({ outcome: "reason_required" });
    mount();
    const dialog = await openDialog();
    const box = within(dialog).getByLabelText("السبب — يُسجَّل في سجل التدقيق", { exact: false });
    await userEvent.type(box, "ab");
    await userEvent.click(within(dialog).getByRole("button", { name: "إزالة" }));
    expect(await within(dialog).findByText("اكتب السبب أولًا.")).toBeVisible();
    expect(box).toHaveValue("ab");
    // Typing again clears the refusal — no stale error under a reason being corrected.
    await userEvent.type(box, "c");
    expect(within(dialog).queryByText("اكتب السبب أولًا.")).not.toBeInTheDocument();
  });

  it("cancelling sends nothing", async () => {
    vi.mocked(actions.removeCommentAction).mockClear();
    mount();
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole("button", { name: "تراجع" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(actions.removeCommentAction).not.toHaveBeenCalled();
  });

  it("a network failure toasts and keeps the page", async () => {
    vi.mocked(actions.removeCommentAction).mockRejectedValueOnce(new Error("offline"));
    mount();
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText("السبب — يُسجَّل في سجل التدقيق", { exact: false }), "دعاية");
    await userEvent.click(within(dialog).getByRole("button", { name: "إزالة" }));
    expect(await screen.findByText("تعذّر الاتصال. تحقّق من الإنترنت وحاول مرة أخرى.")).toBeInTheDocument();
  });

  it("has no axe violations with the dialog open", async () => {
    const { container } = mount();
    await openDialog();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  }, 20000);
});
