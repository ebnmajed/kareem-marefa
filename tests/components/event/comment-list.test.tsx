// The live thread's outer shell (REQ-EVT-015, REQ-UIX-012's empty state).
// `subscribeToSessionTopic` is mocked — a jsdom environment cannot open a
// Realtime socket, and that wiring is proven separately (docs/plan/notes/
// event.md §3, `tests/rls/realtime.test.ts`).
import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/event.json";
import { ToastProvider } from "@/components/ui/toast";

vi.mock("@/lib/realtime/channel", () => ({ subscribeToSessionTopic: vi.fn(() => () => {}) }));
vi.mock("@/components/event/actions", () => ({
  postCommentAction: vi.fn(),
  searchMentionsAction: vi.fn().mockResolvedValue([]),
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
  it("shows the composer and an EmptyState naming a next action when there is nothing yet (REQ-UIX-012, REQ-EVT-003)", () => {
    renderList();
    expect(screen.getByRole("textbox")).toBeInTheDocument(); // the composer — any member may post at any time
    expect(screen.getByText("لا تعليقات بعد. كن أول من يعلّق.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "اكتب أول تعليق" })).toHaveAttribute("href", "#comment-composer");
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

  it("is accessible in its empty state", async () => {
    const { container } = renderList();
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
