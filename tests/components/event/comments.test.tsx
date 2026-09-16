// The `Comments` slot (REQ-EVT-001, REQ-EVT-002, REQ-EVT-015). Renders
// against the REAL ar/event.json catalogue through next-intl's
// createTranslator (same pattern as tests/components/checkin/rsvp-panel.test.tsx),
// so a broken ICU plural or a renamed key fails here. Only the DAL boundary
// and the CommentList client component are mocked — CommentList owns its
// own realtime/browser-client wiring, which is out of scope for this slot's
// own test (a jsdom environment cannot open a Realtime socket).
import { createTranslator } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/event.json";
import type { CommentsPageData } from "@/lib/dal/comments";

vi.mock("@/lib/dal/comments", () => ({ getCommentsPageData: vi.fn() }));
vi.mock("@/lib/dal/reactions", () => ({ getReactionTotalsForComments: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/dal/reports", () => ({ getReportedCommentIds: vi.fn().mockResolvedValue(new Set()) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "event.comments" }),
}));
vi.mock("@/components/event/comment-list", () => ({
  CommentList: (props: { initialComments: unknown[]; frozen: boolean }) => (
    <div data-testid="comment-list" data-count={props.initialComments.length} data-frozen={String(props.frozen)} />
  ),
}));

const { getCommentsPageData } = await import("@/lib/dal/comments");
const { Comments, commentsSummary } = await import("@/components/event/comments");

const sessionId = "11111111-1111-1111-1111-111111111111";

const emptyPage: CommentsPageData = {
  comments: [],
  editWindowMinutes: 15,
  frozen: false,
  isStaffViewer: false,
};

describe("Comments slot", () => {
  it("renders no heading of its own — the event page already provides one (a real duplicate-heading bug this pins)", async () => {
    vi.mocked(getCommentsPageData).mockResolvedValue({ ...emptyPage });
    render(await Comments({ sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("shows the Arabic plural count as plain text, and passes every comment through", async () => {
    const comments = [
      { id: "c1", sessionId, parentId: null, author: { id: "a1", displayName: "سارة", avatarUrl: null }, body: "س", mentions: [], createdAt: "now", editedAt: null, deletedAt: null, isMine: false, canEditNow: false, isStaffViewer: false },
      { id: "c2", sessionId, parentId: null, author: { id: "a2", displayName: "يمان", avatarUrl: null }, body: "ي", mentions: [], createdAt: "now", editedAt: null, deletedAt: null, isMine: false, canEditNow: false, isStaffViewer: false },
    ];
    vi.mocked(getCommentsPageData).mockResolvedValue({ ...emptyPage, comments });
    render(await Comments({ sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText("تعليقان")).toBeInTheDocument();
    expect(screen.getByTestId("comment-list")).toHaveAttribute("data-count", "2");
  });

  it("a soft-deleted comment does not count toward the visible total, and no count renders at zero", async () => {
    const comments = [
      { id: "c1", sessionId, parentId: null, author: { id: "a1", displayName: "سارة", avatarUrl: null }, body: "س", mentions: [], createdAt: "now", editedAt: null, deletedAt: "now", isMine: false, canEditNow: false, isStaffViewer: false },
    ];
    vi.mocked(getCommentsPageData).mockResolvedValue({ ...emptyPage, comments });
    render(await Comments({ sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.queryByText(/تعليق/)).not.toBeInTheDocument();
  });

  it("passes `frozen` through for a cancelled session with existing comments (REQ-SES-010)", async () => {
    const comments = [
      { id: "c1", sessionId, parentId: null, author: { id: "a1", displayName: "سارة", avatarUrl: null }, body: "س", mentions: [], createdAt: "now", editedAt: null, deletedAt: null, isMine: false, canEditNow: false, isStaffViewer: false },
    ];
    vi.mocked(getCommentsPageData).mockResolvedValue({ ...emptyPage, comments, frozen: true });
    render(await Comments({ sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByTestId("comment-list")).toHaveAttribute("data-frozen", "true");
  });

  // ★ wave 6 (`sessions.md` §22.4's invariant): `visible === false` EXACTLY
  // when the slot itself returns `null` — a cancelled session with nothing
  // ever posted has nothing to read and no composer worth showing.
  it("renders null when frozen and nothing was ever posted — the page then gates the whole section", async () => {
    vi.mocked(getCommentsPageData).mockResolvedValue({ ...emptyPage, frozen: true });
    const { container } = render(await Comments({ sessionId, memberId: "m1", locale: "ar" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("still renders (the composer) for a non-frozen, empty thread — any member may post at any time (REQ-EVT-003)", async () => {
    vi.mocked(getCommentsPageData).mockResolvedValue({ ...emptyPage });
    const { container } = render(await Comments({ sessionId, memberId: "m1", locale: "ar" }));
    expect(container).not.toBeEmptyDOMElement();
  });
});

describe("commentsSummary", () => {
  it("is visible with a count when there are active comments", async () => {
    const comments = [
      { id: "c1", sessionId, parentId: null, author: { id: "a1", displayName: "سارة", avatarUrl: null }, body: "س", mentions: [], createdAt: "now", editedAt: null, deletedAt: null, isMine: false, canEditNow: false, isStaffViewer: false },
    ];
    vi.mocked(getCommentsPageData).mockResolvedValue({ ...emptyPage, comments });
    await expect(commentsSummary({ sessionId, memberId: "m1", locale: "ar" })).resolves.toEqual({ visible: true, count: 1, outstanding: null });
  });

  it("is visible with count 0 when empty but not frozen — a member may still post", async () => {
    vi.mocked(getCommentsPageData).mockResolvedValue({ ...emptyPage });
    await expect(commentsSummary({ sessionId, memberId: "m1", locale: "ar" })).resolves.toEqual({ visible: true, count: 0, outstanding: null });
  });

  it("is NOT visible when empty and frozen — exactly when `Comments` returns null", async () => {
    vi.mocked(getCommentsPageData).mockResolvedValue({ ...emptyPage, frozen: true });
    await expect(commentsSummary({ sessionId, memberId: "m1", locale: "ar" })).resolves.toEqual({ visible: false, count: 0, outstanding: null });
  });
});
