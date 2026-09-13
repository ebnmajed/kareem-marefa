// A single comment row (REQ-EVT-002, REQ-EVT-005, REQ-EVT-008). Real
// ar/event.json through NextIntlClientProvider; only the Server Actions
// module is mocked.
import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/event.json";
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
      <CommentItem locale="ar" comment={comment} reactions={{ totals: {}, mine: [] }} reported={false} numerals="western" {...extra} />
    </NextIntlClientProvider>,
  );
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

  it("shows the like count next to the reaction toggle, formatted in the org's numeral system", () => {
    renderItem(baseComment, { reactions: { totals: { like: 3 }, mine: [] } });
    expect(screen.getByRole("button", { name: /إعجاب/ })).toHaveTextContent("3");
  });

  it("pressing reply calls onReply, and only top-level comments offer it", () => {
    const onReply = vi.fn();
    renderItem(baseComment, { onReply });
    fireEvent.click(screen.getByRole("button", { name: "رد" }));
    expect(onReply).toHaveBeenCalledTimes(1);

    renderItem({ ...baseComment, parentId: "parent1" }, { onReply });
    expect(screen.getAllByRole("button", { name: "رد" })).toHaveLength(1); // still just the top-level one from above
  });
});
