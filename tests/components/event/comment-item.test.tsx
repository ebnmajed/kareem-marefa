// A single comment row (REQ-EVT-002, REQ-EVT-005, REQ-EVT-008). Real
// ar/event.json through NextIntlClientProvider; only the Server Actions
// module is mocked.
import { Component, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/event.json";
import { ToastProvider } from "@/components/ui/toast";
import type { CommentDTO } from "@/lib/dal/comments";

vi.mock("@/components/event/actions", () => ({
  deleteMyCommentAction: vi.fn().mockResolvedValue({ error: null }),
  editCommentAction: vi.fn().mockResolvedValue({ error: null }),
  moderateCommentAction: vi.fn().mockResolvedValue({ error: null }),
  reportCommentAction: vi.fn().mockResolvedValue({ error: null }),
  toggleReactionAction: vi.fn().mockResolvedValue({ error: null }),
}));
// router.refresh() after a successful action (comment-item.tsx) is what
// makes the actor's own edit/delete/react show up without waiting on the
// realtime echo — see actions.ts's module comment for why. jsdom has no
// app router mounted, so useRouter needs a stub — but the REST of
// next/navigation must stay real, since @/i18n/navigation's Link (used by
// the house Button component) is built on top of it.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { CommentItem } = await import("@/components/event/comment-item");

const baseComment: CommentDTO = {
  id: "c1",
  sessionId: "s1",
  parentId: null,
  author: { id: "a1", displayName: "سارة العتيبي", avatarUrl: null },
  body: "سؤال عن الجلسة",
  mentions: [],
  createdAt: new Date().toISOString(),
  editedAt: null,
  deletedAt: null,
  isMine: false,
  canEditNow: false,
  isStaffViewer: false,
};

function renderItem(comment: CommentDTO, extra: Partial<Parameters<typeof CommentItem>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <CommentItem locale="ar" comment={comment} reactions={{ totals: {}, mine: [] }} reported={false} {...extra} />
    </NextIntlClientProvider>,
  );
}

// ★ Stands in for the route's own `error.tsx` boundary — same reasoning as
// `comment-composer.test.tsx`'s identical class: a network-level failure
// (the action call itself rejects) used to be thrown out of
// `startTransition`'s async callback and replace the whole event page.
class TestErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return <p data-testid="boundary-reached">error boundary reached</p>;
    return this.props.children;
  }
}

describe("CommentItem", () => {
  it("a deleted comment (reached here, so it necessarily has replies) shows only the tombstone", () => {
    renderItem({ ...baseComment, deletedAt: new Date().toISOString() });
    expect(screen.getByText("حُذف هذا التعليق")).toBeInTheDocument();
    expect(screen.queryByText("سؤال عن الجلسة")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "حذف" })).not.toBeInTheDocument();
  });

  it("bidi-isolates the author's name", () => {
    renderItem(baseComment);
    const bdi = screen.getByText("سارة العتيبي").closest("bdi");
    expect(bdi).not.toBeNull();
  });

  it("offers edit only within the window, on the author's own comment", () => {
    renderItem({ ...baseComment, isMine: true, canEditNow: true });
    expect(screen.getByRole("button", { name: "تعديل" })).toBeInTheDocument();
  });

  it("offers no edit button once the window has closed, even for the author", () => {
    renderItem({ ...baseComment, isMine: true, canEditNow: false });
    expect(screen.queryByRole("button", { name: "تعديل" })).not.toBeInTheDocument();
  });

  it("the author can delete at any time regardless of the edit window (REQ-EVT-005)", () => {
    renderItem({ ...baseComment, isMine: true, canEditNow: false });
    expect(screen.getByRole("button", { name: "حذف" })).toBeInTheDocument();
  });

  it("a staff viewer sees Remove on someone else's comment; an ordinary member does not", () => {
    renderItem({ ...baseComment, isStaffViewer: true });
    expect(screen.getByRole("button", { name: "إزالة" })).toBeInTheDocument();
    renderItem({ ...baseComment, isStaffViewer: false });
    // getAllByRole across both renders — assert none has the staff-only label.
    expect(screen.queryAllByRole("button", { name: "إزالة" })).toHaveLength(1); // only from the first render
  });

  it("a member cannot report their own comment", () => {
    renderItem({ ...baseComment, isMine: true });
    expect(screen.queryByRole("button", { name: "إبلاغ" })).not.toBeInTheDocument();
  });

  it("shows the like count beside the reaction toggle — the IconButton itself carries no visible text, only the accessible name", () => {
    renderItem(baseComment, { reactions: { totals: { like: 3 }, mine: [] } });
    const toggle = screen.getByRole("button", { name: "إعجاب" });
    expect(toggle).toHaveTextContent(""); // icon-only — REQ-NFR-007's name is `aria-label`, not visible text
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("a count of zero renders no count text at all", () => {
    renderItem(baseComment);
    expect(screen.getByRole("button", { name: "إعجاب" })).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("reacting flips the accessible name and the count OPTIMISTICALLY — before the action resolves (`16` §7.1 layer 4)", () => {
    renderItem(baseComment, { reactions: { totals: {}, mine: [] } });
    fireEvent.click(screen.getByRole("button", { name: "إعجاب" }));
    // The mocked action's promise has not resolved yet at this point in the
    // test (no `await`) — a passing assertion here IS the proof the flip is
    // optimistic, not a wait for the server to confirm it.
    expect(screen.getByRole("button", { name: "إلغاء الإعجاب" })).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("a failed reaction reverts the optimistic state and tells the member, quietly and persistently", async () => {
    const { toggleReactionAction } = await import("@/components/event/actions");
    vi.mocked(toggleReactionAction).mockResolvedValueOnce({ error: "generic" });
    render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <ToastProvider closeLabel="إغلاق">
          <CommentItem locale="ar" comment={baseComment} reactions={{ totals: {}, mine: [] }} reported={false} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "إعجاب" }));
    expect(await screen.findByText("تعذّر تسجيل تفاعلك")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "إعجاب" })).toBeInTheDocument(); // reverted
  });

  // ★ The lead's real-build finding, the same class of bug as
  // `comment-composer.test.tsx`'s network-failure test: a network-level
  // failure (offline, a dropped connection) makes `toggleReactionAction`
  // REJECT rather than return an `{ error }` value. No explicit second
  // dispatch tries to "undo" the optimistic flip on this path (see
  // `comment-item.tsx`'s own comment on `toggleLike` for why that would
  // actually land on the WRONG count) — catching the throw lets the
  // transition settle normally, and `useOptimistic` reverts to the real
  // base props on its own, the same mechanism the returned-error test above
  // already relies on. This proves that holds for a THROW too, not just a
  // returned error, and that the whole component survives rather than
  // handing the error to a boundary above it.
  it("★ a network-level failure while reacting reverts the optimistic flip and never reaches the error boundary", async () => {
    const { toggleReactionAction } = await import("@/components/event/actions");
    vi.mocked(toggleReactionAction).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <ToastProvider closeLabel="إغلاق">
          <TestErrorBoundary>
            <CommentItem locale="ar" comment={baseComment} reactions={{ totals: {}, mine: [] }} reported={false} />
          </TestErrorBoundary>
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "إعجاب" }));
    expect(await screen.findByText("تعذّر تسجيل تفاعلك")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "إعجاب" })).toBeInTheDocument(); // reverted
    expect(screen.queryByTestId("boundary-reached")).not.toBeInTheDocument();
  });

  // ★ Same shape as `comment-composer.test.tsx`'s composer-level test,
  // proving the identical try/catch pattern holds here too: a network-level
  // failure keeps the edited text in the field (never enters `setEditing
  // (false)`) and never crashes to the error boundary.
  it("★ a network-level failure while saving an edit keeps the draft and never reaches the error boundary", async () => {
    const { editCommentAction } = await import("@/components/event/actions");
    vi.mocked(editCommentAction).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <ToastProvider closeLabel="إغلاق">
          <TestErrorBoundary>
            <CommentItem locale="ar" comment={{ ...baseComment, isMine: true, canEditNow: true }} reactions={{ totals: {}, mine: [] }} reported={false} />
          </TestErrorBoundary>
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "تعديل" }));
    const editField = screen.getByRole("textbox", { name: "تعديل" });
    fireEvent.change(editField, { target: { value: "نص معدَّل لن يصل" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ التعديل" }));

    // Not an exact count: the toast primitive (`ui/toast`, not this file's
    // own) can render its own screen-reader-only announcement alongside the
    // visible card, so the same string can legitimately appear more than
    // once — the adjacent `Panel` (REQ-UIX-010) is what this assertion is
    // really about, and at least one match proves the error surfaced at all.
    await waitFor(() => expect(screen.getAllByText("تعذّر الاتصال. تحقّق من الإنترنت وحاول مرة أخرى").length).toBeGreaterThan(0));
    expect(screen.getByRole("textbox", { name: "تعديل" })).toHaveValue("نص معدَّل لن يصل"); // still editing, text kept
    expect(screen.queryByTestId("boundary-reached")).not.toBeInTheDocument();
  });

  it("pressing reply calls onReply, and only top-level comments offer it", () => {
    const onReply = vi.fn();
    renderItem(baseComment, { onReply });
    fireEvent.click(screen.getByRole("button", { name: "رد" }));
    expect(onReply).toHaveBeenCalledTimes(1);

    renderItem({ ...baseComment, parentId: "parent1" }, { onReply });
    expect(screen.getAllByRole("button", { name: "رد" })).toHaveLength(1); // still just the top-level one from above
  });

  it("is accessible with every affordance showing at once — mine, editable, reported by someone else, reacted", async () => {
    const { container } = renderItem(
      { ...baseComment, isMine: true, canEditNow: true },
      { reactions: { totals: { like: 4 }, mine: ["like"] }, onReply: () => {} },
    );
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
