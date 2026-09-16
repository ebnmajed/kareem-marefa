// The live thread's outer shell (REQ-EVT-015, REQ-UIX-012's empty state).
// `subscribeToSessionTopic` is mocked — a jsdom environment cannot open a
// Realtime socket, and that wiring is proven separately (docs/plan/notes/
// event.md §3, `tests/rls/realtime.test.ts`).
import { NextIntlClientProvider } from "next-intl";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/event.json";
import { ToastProvider } from "@/components/ui/toast";
import type { CommentDTO } from "@/lib/dal/comments";

vi.mock("@/lib/realtime/channel", () => ({ subscribeToSessionTopic: vi.fn(() => () => {}) }));
vi.mock("@/components/event/actions", () => ({
  postCommentAction: vi.fn(),
  searchMentionsAction: vi.fn().mockResolvedValue([]),
  toggleReactionAction: vi.fn().mockResolvedValue({ error: null }),
  deleteMyCommentAction: vi.fn().mockResolvedValue({ error: null }),
  editCommentAction: vi.fn().mockResolvedValue({ error: null }),
  moderateCommentAction: vi.fn().mockResolvedValue({ error: null }),
  reportCommentAction: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { CommentList } = await import("@/components/event/comment-list");

function renderList(props: Partial<Parameters<typeof CommentList>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <ToastProvider closeLabel="إغلاق">
        <CommentList
          locale="ar"
          sessionId="s1"
          viewerMemberId="m1"
          isStaffViewer={false}
          editWindowMinutes={15}
          initialComments={[]}
          initialReactions={{}}
          initialReported={[]}
          frozen={false}
          {...props}
        />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("CommentList", () => {
  // ★ Not an `EmptyState` with its own action — the lead's live-build 390 px
  // review: the composer is already the visible, primary next action right
  // above this text (unconditionally, whenever this is reachable at all —
  // frozen+empty never gets here), so a second card offering the same
  // action duplicated it. A quiet sentence, no button (REQ-EVT-003: any
  // member may post at any time; REQ-UIX-012 does not apply to a state with
  // an already-visible next action right next to it).
  it("shows the composer and a quiet sentence, with no duplicate call to action, when there is nothing yet (REQ-EVT-003)", () => {
    renderList();
    expect(screen.getByRole("textbox")).toBeInTheDocument(); // the composer — any member may post at any time
    expect(screen.getByText("لا تعليقات بعد. كن أول من يعلّق.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /اكتب/ })).not.toBeInTheDocument();
  });

  it("shows a frozen notice instead of the composer, and no EmptyState, on a cancelled session (REQ-SES-010)", () => {
    renderList({ frozen: true });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("التعليقات مغلقة — هذه الجلسة ملغاة")).toBeInTheDocument();
    expect(screen.queryByText("لا تعليقات بعد. كن أول من يعلّق.")).not.toBeInTheDocument();
  });

  it("renders a thread with a reply nested one level, and no EmptyState", () => {
    const comments = [
      {
        id: "c1",
        sessionId: "s1",
        parentId: null,
        author: { id: "a1", displayName: "سارة", avatarUrl: null },
        body: "سؤال",
        mentions: [],
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        isMine: false,
        canEditNow: false,
        isStaffViewer: false,
      },
      {
        id: "c2",
        sessionId: "s1",
        parentId: "c1",
        author: { id: "a2", displayName: "يمان", avatarUrl: null },
        body: "جواب",
        mentions: [],
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        isMine: false,
        canEditNow: false,
        isStaffViewer: false,
      },
    ];
    renderList({ initialComments: comments });
    expect(screen.getByText("سؤال")).toBeInTheDocument();
    expect(screen.getByText("جواب")).toBeInTheDocument();
    expect(screen.queryByText("لا تعليقات بعد. كن أول من يعلّق.")).not.toBeInTheDocument();
  });

  // ★ The lead's re-drive, verbatim: "add a jsdom test: post, then react,
  // then the composer's button is idle." This is the cross-component shape
  // blocker 1 actually was — the composer (`CommentComposer`) and the
  // reaction toggle (`CommentItem`) are SIBLINGS under this list, each with
  // its own `useTransition`, and the live-build failure was one sibling's
  // `router.refresh()` leaving ANOTHER sibling's transition with no signal
  // that it had finished. Fixed at 44485b8 (not e533ad8, which predates
  // it) by moving every `router.refresh()` in both files into its own
  // `setTimeout(…, 0)`, outside the transition each button's own `pending`
  // is read from.
  //
  // Full honesty, as in comment-composer.test.tsx's blocker-1 test: jsdom
  // has no real Next.js router, so `useRouter().refresh` here is a `vi.fn()`
  // that does nothing and cannot fold two calls into one the way the real
  // router did in the live build. This test cannot reproduce the actual
  // failure mechanism — it can only prove the composer's `pending` never
  // depends on a sibling's action at all, which is exactly what the
  // `setTimeout` decoupling is FOR, and would already have passed before
  // 44485b8 for the same reason (nothing here ever hung in jsdom). The real
  // mechanism is only provable against a real build —
  // `tests/e2e/wave6-discussion-review.spec.ts` and
  // `tests/e2e/event-comments.spec.ts` are what the lead reruns for that.
  it("★ BLOCKER 1 cross-component repro: post, then react on a sibling comment, then the composer's own button is idle", async () => {
    const { postCommentAction, toggleReactionAction } = await import("@/components/event/actions");
    vi.mocked(postCommentAction).mockResolvedValueOnce({ error: null });
    vi.mocked(toggleReactionAction).mockResolvedValueOnce({ error: null });

    const existing: CommentDTO = {
      id: "c1",
      sessionId: "s1",
      parentId: null,
      author: { id: "a1", displayName: "سالم الحربي", avatarUrl: null },
      body: "سؤال قائم",
      mentions: [],
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      isMine: false,
      canEditNow: false,
      isStaffViewer: false,
    };
    renderList({ initialComments: [existing] });

    const composerBox = screen.getByPlaceholderText("اكتب تعليقًا…") as HTMLTextAreaElement;
    const postButton = () => screen.getByRole("button", { name: "نشر" });

    // Post — the top-level composer's own transition settles.
    fireEvent.change(composerBox, { target: { value: "تعليق جديد" } });
    fireEvent.click(postButton());
    await waitFor(() => expect(composerBox.value).toBe(""));

    // React on the EXISTING comment — a sibling `CommentItem`'s own
    // transition, entirely independent of the composer's.
    fireEvent.click(screen.getByRole("button", { name: "إعجاب" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "إلغاء الإعجاب" })).toBeInTheDocument());

    // The composer's own button — not the reaction's — is idle. Fresh text
    // first, the same guard comment-composer.test.tsx's blocker-1 test
    // uses: right after posting, `disabled` is already true because there
    // is nothing to submit, which is a different, unrelated gate from
    // `pending`/`aria-busy` and would hide a still-stuck transition.
    fireEvent.change(composerBox, { target: { value: "نص جديد بعد التفاعل" } });
    await waitFor(() => expect(postButton()).not.toHaveAttribute("aria-busy", "true"), { timeout: 3000 });
    expect(postButton()).toBeEnabled();
  });

  it("is accessible in its empty state", async () => {
    const { container } = renderList();
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
