// The discussion, rebuilt (DEC-208) — every case of the removed `comments`, `comment-list`, `comment-item` and
// `comment-composer` suites re-asserted against the new files, plus what the artboard added: the viewer's avatar
// by the composer, the company and «مقدِّم الجلسة» on a comment, the like as `reaction-bar`.
import { Component, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import eventAr from "@/messages/ar/event.json";
import feedAr from "@/messages/ar/feed.json";
import { ToastProvider } from "@/components/ui/toast";
import type { CommentAuthor, CommentDTO } from "@/lib/dal/comments";

vi.mock("@/components/event/actions", () => ({
  postCommentAction: vi.fn().mockResolvedValue({ error: null }),
  searchMentionsAction: vi.fn().mockResolvedValue([]),
  editCommentAction: vi.fn().mockResolvedValue({ error: null }),
  deleteMyCommentAction: vi.fn().mockResolvedValue({ error: null }),
  moderateCommentAction: vi.fn().mockResolvedValue({ error: null }),
  reportCommentAction: vi.fn().mockResolvedValue({ error: null }),
}));
// DEC-290: the like's write goes through the queue; the test holds each write and settles it by hand.
const queued: { body: { id: string; on?: boolean }; settle: (r: { ok: boolean; data?: Record<string, unknown> }) => void }[] = [];
vi.mock("@/lib/reactions/queue", () => ({
  queueReaction: vi.fn((body: { id: string; on?: boolean }, settle: (r: { ok: boolean }) => void) => queued.push({ body, settle })),
  isPending: vi.fn(() => queued.length > 0),
}));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/realtime/channel", () => ({ subscribeToSessionTopic: vi.fn(() => () => {}) }));
vi.mock("@/lib/dal/comments", () => ({ getCommentsPageData: vi.fn() }));
vi.mock("@/lib/dal/reactions", () => ({ getReactionTotalsForComments: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/dal/reports", () => ({ getReportedCommentIds: vi.fn().mockResolvedValue(new Set()) }));
vi.mock("@/lib/dal/sessions", () => ({ getSessionHeading: vi.fn().mockResolvedValue({ timeZone: "Asia/Riyadh" }) }));

const actions = await import("@/components/event/actions");
const { getCommentsPageData } = await import("@/lib/dal/comments");
const { Comments, commentsSummary } = await import("@/components/event/comments");
const { CommentList } = await import("@/components/event/comment-list");
const { CommentItem } = await import("@/components/event/comment-item");
const { CommentComposer } = await import("@/components/event/comment-composer");

const NOW = "2026-10-01T12:00:00Z";
const messages = { ...eventAr, ...feedAr };
const viewer: CommentAuthor = { id: "me", displayName: "يمان", avatarUrl: null, company: { name: "صنف", teamColor: "#ff9a2e" } };
const comment = (over: Partial<CommentDTO> = {}): CommentDTO => ({
  id: "c1", sessionId: "s1", parentId: null,
  author: { id: "a1", displayName: "سارة القحطاني", avatarUrl: null, company: { name: "مواهب", teamColor: "#35d0ff" }, isPresenter: false },
  body: "هل نحتاج إكسل؟", mentions: [], createdAt: "2026-10-01T10:00:00Z", editedAt: null, deletedAt: null,
  isMine: false, canEditNow: false, isStaffViewer: false, ...over,
});

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p data-testid="boundary">boundary</p> : this.props.children;
  }
}

function wrap(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <Boundary>
          <div data-testid="root">{node}</div>
        </Boundary>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const list = (comments: CommentDTO[], reactions: Record<string, { totals: Record<string, number>; mine: string[] }> = {}) =>
  wrap(
    <CommentList
      locale="ar"
      sessionId="s1"
      viewer={viewer}
      isStaffViewer={false}
      editWindowMinutes={15}
      initialComments={comments}
      initialReactions={reactions}
      initialReported={[]}
      frozen={false}
      now={NOW}
      timeZone="Asia/Riyadh"
    />,
  );

const item = (c: CommentDTO, extra: Partial<Parameters<typeof CommentItem>[0]> = {}) =>
  wrap(<CommentItem locale="ar" comment={c} reactions={{ totals: {}, mine: [] }} reported={false} now={NOW} timeZone="Asia/Riyadh" {...extra} />);

describe("Comments slot", () => {
  const data = { comments: [comment()], editWindowMinutes: 15, frozen: false, isStaffViewer: false, viewer };
  it("renders no heading of its own", async () => {
    vi.mocked(getCommentsPageData).mockResolvedValue(data);
    wrap(await Comments({ sessionId: "s1", memberId: "me", locale: "ar" }));
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
  it("renders null when frozen and nothing was ever posted — the page gates the section", async () => {
    vi.mocked(getCommentsPageData).mockResolvedValue({ ...data, comments: [], frozen: true });
    expect(await Comments({ sessionId: "s1", memberId: "me", locale: "ar" })).toBeNull();
  });
  it("still renders the composer for an empty, open thread — any member may post (REQ-EVT-003)", async () => {
    vi.mocked(getCommentsPageData).mockResolvedValue({ ...data, comments: [] });
    wrap(await Comments({ sessionId: "s1", memberId: "me", locale: "ar" }));
    expect(screen.getByRole("textbox", { name: "اكتب تعليقًا…" })).toBeInTheDocument();
  });
  it("passes frozen through: a cancelled session with comments shows them, read-only, with no composer (REQ-SES-010)", async () => {
    vi.mocked(getCommentsPageData).mockResolvedValue({ ...data, frozen: true });
    wrap(await Comments({ sessionId: "s1", memberId: "me", locale: "ar" }));
    expect(screen.getByText("التعليقات مغلقة — هذه الجلسة ملغاة")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("summary: visible with a count; soft-deleted comments do not count; not visible when empty and frozen", async () => {
    vi.mocked(getCommentsPageData).mockResolvedValue({ ...data, comments: [comment(), comment({ id: "c2", deletedAt: NOW })] });
    expect(await commentsSummary({ sessionId: "s1", memberId: "me", locale: "ar" })).toEqual({ visible: true, count: 1, outstanding: null });
    vi.mocked(getCommentsPageData).mockResolvedValue({ ...data, comments: [] });
    expect((await commentsSummary({ sessionId: "s1", memberId: "me", locale: "ar" })).visible).toBe(true);
    vi.mocked(getCommentsPageData).mockResolvedValue({ ...data, comments: [], frozen: true });
    expect((await commentsSummary({ sessionId: "s1", memberId: "me", locale: "ar" })).visible).toBe(false);
  });
});

describe("CommentList", () => {
  const list = (comments: CommentDTO[], frozen = false) =>
    wrap(<CommentList locale="ar" sessionId="s1" viewer={viewer} isStaffViewer={false} editWindowMinutes={15} initialComments={comments} initialReactions={{}} initialReported={[]} frozen={frozen} now={NOW} timeZone="Asia/Riyadh" />);

  it("empty: the composer and one quiet sentence — no second call to action", () => {
    list([]);
    expect(screen.getByText("لا تعليقات بعد. كن أول من يعلّق.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "نشر" })).toHaveLength(1);
  });
  it("the composer carries the viewer's avatar in their team's ring", () => {
    const { container } = list([]);
    expect(container.querySelector('[aria-hidden="true"].border-team')).not.toBeNull();
  });
  it("a reply nests one level under its comment; a deleted comment with no replies is not drawn", () => {
    list([comment(), comment({ id: "r1", parentId: "c1", body: "يكفي أي جدول" }), comment({ id: "gone", deletedAt: NOW, body: "محذوف" })]);
    const top = within(screen.getByTestId("root")).getAllByRole("list")[0]!;
    expect(top.children).toHaveLength(1);
    expect(within(top).getByText("يكفي أي جدول")).toBeInTheDocument();
    expect(screen.queryByText("محذوف")).not.toBeInTheDocument();
  });
  it("a deleted comment WITH replies stands as its tombstone (REQ-EVT-005)", () => {
    list([comment({ deletedAt: NOW }), comment({ id: "r1", parentId: "c1", body: "رد باقٍ" })]);
    expect(screen.getByText("حُذف هذا التعليق")).toBeInTheDocument();
    expect(screen.getByText("رد باقٍ")).toBeInTheDocument();
  });
  it("«رد» opens a reply composer under that comment's thread", async () => {
    list([comment(), comment({ id: "r1", parentId: "c1" })]);
    await userEvent.click(screen.getByRole("button", { name: "رد" }));
    expect(screen.getByRole("textbox", { name: "اكتب ردًا…" })).toHaveValue("");
  });
  it("★ DEC-290: a reply offers «رد» too — it opens the thread's composer with «@name» written, posted under the first comment", async () => {
    vi.mocked(actions.postCommentAction).mockClear();
    list([comment(), comment({ id: "r1", parentId: "c1", author: { id: "a2", displayName: "خالد", avatarUrl: null, company: null, isPresenter: false } })]);
    await userEvent.click(screen.getByRole("button", { name: "رد على خالد" }));
    const field = screen.getByRole("textbox", { name: "اكتب ردًا…" });
    expect(field).toHaveValue("@خالد ");
    fireEvent.change(field, { target: { value: "@خالد شكرًا" } });
    fireEvent.click(within(field.closest("div.flex.flex-col")!.parentElement!).getAllByRole("button", { name: "رد" }).at(-1)!);
    await waitFor(() => expect(actions.postCommentAction).toHaveBeenCalledWith("ar", "s1", "c1", ["a2"], "@خالد شكرًا"));
  });
  it("★ DEC-290: a deleted «@name» is not mentioned", async () => {
    vi.mocked(actions.postCommentAction).mockClear();
    list([comment(), comment({ id: "r1", parentId: "c1", author: { id: "a2", displayName: "خالد", avatarUrl: null, company: null, isPresenter: false } })]);
    await userEvent.click(screen.getByRole("button", { name: "رد على خالد" }));
    const field = screen.getByRole("textbox", { name: "اكتب ردًا…" });
    fireEvent.change(field, { target: { value: "شكرًا" } });
    fireEvent.click(within(field.closest("div.flex.flex-col")!.parentElement!).getAllByRole("button", { name: "رد" }).at(-1)!);
    await waitFor(() => expect(actions.postCommentAction).toHaveBeenCalledWith("ar", "s1", "c1", [], "شكرًا"));
  });
  it("★ DEC-290: a thread of more than two replies shows two and «عرض N ردود» for the rest", async () => {
    list([comment(), ...[1, 2, 3, 4, 5].map((n) => comment({ id: `r${n}`, parentId: "c1", body: `رد رقم ${n}`, createdAt: `2026-10-01T10:0${n}:00Z` }))]);
    expect(screen.getByText("رد رقم 2")).toBeInTheDocument();
    expect(screen.queryByText("رد رقم 3")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "عرض 3 ردود" }));
    expect(screen.getByText("رد رقم 5")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^عرض/ })).not.toBeInTheDocument();
  });
  it("★ post, then react on a sibling: the composer's own button is idle afterwards", async () => {
    list([comment()]);
    fireEvent.change(screen.getByRole("textbox", { name: "اكتب تعليقًا…" }), { target: { value: "تعليق" } });
    fireEvent.click(screen.getByRole("button", { name: "نشر" }));
    await waitFor(() => expect((screen.getByRole("textbox", { name: "اكتب تعليقًا…" }) as HTMLTextAreaElement).value).toBe(""));
    await userEvent.click(screen.getByRole("button", { name: /^إعجاب/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "اكتب تعليقًا…" }), { target: { value: "ثانٍ" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "نشر" })).not.toHaveAttribute("aria-busy", "true"));
  });
  it("is accessible, empty and populated", async () => {
    const { container } = list([comment(), comment({ id: "r1", parentId: "c1" })]);
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});

describe("CommentItem", () => {
  it("the author's name, company and when, isolated; «مقدِّم الجلسة» beside a presenter", () => {
    const { container } = item(comment({ author: { ...comment().author, isPresenter: true } }));
    expect(screen.getByText("سارة القحطاني").tagName).toBe("BDI");
    expect(container).toHaveTextContent("مواهب");
    expect(container).toHaveTextContent("مقدِّم الجلسة");
    expect(container).toHaveTextContent("قبل ساعتين");
  });
  it("a deleted comment shows only the tombstone", () => {
    const { container } = item(comment({ deletedAt: NOW }));
    expect(container).toHaveTextContent("حُذف هذا التعليق");
    expect(container).not.toHaveTextContent("هل نحتاج");
  });
  it("edit only on one's own comment inside the window; «(معدَّل)» once edited", () => {
    const { unmount } = item(comment({ isMine: true, canEditNow: true, editedAt: NOW }));
    expect(screen.getByRole("button", { name: "تعديل" })).toBeInTheDocument();
    expect(screen.getByTestId("root")).toHaveTextContent("(معدَّل)");
    unmount();
    item(comment({ isMine: true, canEditNow: false }));
    expect(screen.queryByRole("button", { name: "تعديل" })).not.toBeInTheDocument();
  });
  it("the author can delete at any time, after a confirm (REQ-EVT-005)", async () => {
    item(comment({ isMine: true, canEditNow: false }));
    await userEvent.click(screen.getByRole("button", { name: "حذف" }));
    expect(await screen.findByRole("dialog", { name: "حذف التعليق؟" })).toBeInTheDocument();
  });
  it("staff see «إزالة» on another's comment; a member does not; nobody reports their own", () => {
    const { unmount } = item(comment({ isStaffViewer: true }));
    expect(screen.getByRole("button", { name: "إزالة" })).toBeInTheDocument();
    unmount();
    item(comment({ isMine: true }));
    expect(screen.queryByRole("button", { name: "إزالة" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إبلاغ" })).not.toBeInTheDocument();
  });
  it("★ the like (DEC-290): pressed with its count AT ONCE, kept after the write lands — never a step back", async () => {
    queued.length = 0;
    list([comment()], { c1: { totals: { like: 4 }, mine: [] } });
    const like = screen.getByRole("button", { name: "إعجاب 4" });
    expect(like).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(like);
    expect(screen.getByRole("button", { name: "إعجاب 5" })).toHaveAttribute("aria-pressed", "true");
    expect(queued).toHaveLength(1);
    expect(queued[0].body).toMatchObject({ id: "c1", on: true });
    await act(async () => queued.splice(0).forEach((q) => q.settle({ ok: true, data: { on: true } })));
    expect(screen.getByRole("button", { name: "إعجاب 5" })).toHaveAttribute("aria-pressed", "true");
  });
  it("a tap that likes plays the whisper once; unliking plays nothing", () => {
    queued.length = 0;
    list([comment()], { c1: { totals: { like: 1 }, mine: [] } });
    expect(document.querySelector(".reaction-ignite")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "إعجاب 1" }));
    expect(document.querySelectorAll(".reaction-ignite")).toHaveLength(1);
    expect(document.querySelectorAll(".reaction-ring")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "إعجاب 2" }));
    expect(document.querySelector(".reaction-ignite")).toBeNull();
  });
  it("a count of zero draws no count", () => {
    item(comment(), { onLike: () => {} });
    expect(screen.getByRole("button", { name: "إعجاب" })).not.toHaveTextContent(/\d/);
  });
  it("★ frozen: nothing to press; a non-zero count shows read-only; the report stays (moderation works on a frozen thread)", () => {
    item(comment(), { reactions: { totals: { like: 3 }, mine: [] }, frozen: true });
    expect(screen.queryByRole("button", { name: /^إعجاب/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("root")).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: "إبلاغ" })).toBeInTheDocument();
  });
  it("a failed like puts back what the server held and says so, persistently", async () => {
    queued.length = 0;
    list([comment()], { c1: { totals: { like: 2 }, mine: [] } });
    fireEvent.click(screen.getByRole("button", { name: "إعجاب 2" }));
    await act(async () => queued.splice(0).forEach((q) => q.settle({ ok: false })));
    expect(await screen.findByText("تعذّر تسجيل تفاعلك")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إعجاب 2" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("boundary")).not.toBeInTheDocument();
  });
  it("★ a network failure while editing or reporting never reaches the error boundary", async () => {
    vi.mocked(actions.editCommentAction).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    item(comment({ isMine: true, canEditNow: true }));
    await userEvent.click(screen.getByRole("button", { name: "تعديل" }));
    fireEvent.change(screen.getByRole("textbox", { name: "تعديل" }), { target: { value: "معدّل" } });
    await userEvent.click(screen.getByRole("button", { name: "حفظ التعديل" }));
    expect(await screen.findByText("تعذّر الاتصال. تحقّق من الإنترنت وحاول مرة أخرى.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "تعديل" })).toHaveValue("معدّل");
    expect(screen.queryByTestId("boundary")).not.toBeInTheDocument();
  });
  it("an empty report reason reaches the action and shows its answer, not silence", async () => {
    vi.mocked(actions.reportCommentAction).mockResolvedValueOnce({ error: "invalid_comment" });
    item(comment());
    await userEvent.click(screen.getByRole("button", { name: "إبلاغ" }));
    await userEvent.click(await screen.findByRole("button", { name: "إرسال البلاغ" }));
    expect(await screen.findByText("تعليق غير صالح")).toBeInTheDocument();
  });
  it("is accessible with every affordance at once", async () => {
    const { container } = item(comment({ isMine: true, canEditNow: true, isStaffViewer: true }), { reactions: { totals: { like: 2 }, mine: ["like"] }, onReply: () => {} });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

describe("CommentComposer", () => {
  const composer = (props: Partial<Parameters<typeof CommentComposer>[0]> = {}) => wrap(<CommentComposer locale="ar" sessionId="s1" parentId={null} {...props} />);
  const field = () => screen.getByRole("textbox") as HTMLTextAreaElement;

  it("no counter far from the cap; the counter as the member nears it", () => {
    composer();
    expect(screen.queryByText(/متبق/)).not.toBeInTheDocument();
    fireEvent.change(field(), { target: { value: "ب".repeat(3900) } });
    expect(screen.getByText(/متبق/)).toBeInTheDocument();
  });
  it("keeps the typed text after a failed post", async () => {
    vi.mocked(actions.postCommentAction).mockResolvedValueOnce({ error: "generic" });
    composer();
    fireEvent.change(field(), { target: { value: "نص باقٍ" } });
    fireEvent.click(screen.getByRole("button", { name: "نشر" }));
    expect(await screen.findAllByText("حدث خطأ. حاول مرة أخرى")).not.toHaveLength(0);
    expect(field().value).toBe("نص باقٍ");
  });
  it("★ a network failure keeps the text, says it once beside the field, never reaches the boundary", async () => {
    vi.mocked(actions.postCommentAction).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    composer();
    fireEvent.change(field(), { target: { value: "نص" } });
    fireEvent.click(screen.getByRole("button", { name: "نشر" }));
    expect(await screen.findAllByText("تعذّر الاتصال. تحقّق من الإنترنت وحاول مرة أخرى.")).toHaveLength(1);
    expect(field().value).toBe("نص");
    expect(screen.queryByTestId("boundary")).not.toBeInTheDocument();
  });
  it("clears on success with no success toast", async () => {
    composer();
    fireEvent.change(field(), { target: { value: "نص" } });
    fireEvent.click(screen.getByRole("button", { name: "نشر" }));
    await waitFor(() => expect(field().value).toBe(""));
    // No success toast: the comment appearing in the thread is the feedback.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("★ a draft typed while a slow post is pending is never wiped by that post succeeding", async () => {
    let release: (v: { error: null }) => void = () => {};
    vi.mocked(actions.postCommentAction).mockImplementationOnce(() => new Promise((r) => (release = r)));
    composer();
    fireEvent.change(field(), { target: { value: "الأول" } });
    fireEvent.click(screen.getByRole("button", { name: "نشر" }));
    fireEvent.change(field(), { target: { value: "الثاني قيد الكتابة" } });
    await act(async () => release({ error: null }));
    expect(field().value).toBe("الثاني قيد الكتابة");
  });
  it("★ aria-busy clears after a successful post and stays clear when new text is typed", async () => {
    composer();
    fireEvent.change(field(), { target: { value: "تعليق" } });
    fireEvent.click(screen.getByRole("button", { name: "نشر" }));
    await waitFor(() => expect(field().value).toBe(""));
    fireEvent.change(field(), { target: { value: "جديد" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "نشر" })).not.toHaveAttribute("aria-busy", "true"));
  });
  it("«@» asks for members; a pick writes the name and posts the member's id (REQ-EVT-006)", async () => {
    vi.mocked(actions.searchMentionsAction).mockResolvedValueOnce([{ id: "m9", displayName: "نورة" }]);
    composer();
    fireEvent.change(field(), { target: { value: "@نو" } });
    await userEvent.click(await screen.findByRole("button", { name: "نورة" }));
    expect(field().value).toBe("@نورة ");
    fireEvent.click(screen.getByRole("button", { name: "نشر" }));
    await waitFor(() => expect(actions.postCommentAction).toHaveBeenLastCalledWith("ar", "s1", null, ["m9"], "@نورة"));
  });
  it("is accessible with the mention list and the counter showing", async () => {
    vi.mocked(actions.searchMentionsAction).mockResolvedValueOnce([{ id: "m9", displayName: "نورة" }]);
    const { container } = composer({ viewer });
    fireEvent.change(field(), { target: { value: `${"ب".repeat(3900)} @نو` } });
    await screen.findByRole("button", { name: "نورة" });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
