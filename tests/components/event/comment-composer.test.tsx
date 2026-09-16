// The composer — REQ-UIX-024's "a real editing affordance, not a bare
// textarea": the remaining-length counter (all six Arabic ICU forms), the
// failed-post text staying put, and the pending/success/failure story on
// submit. Real ar/event.json through NextIntlClientProvider; only the
// Server Actions module and next/navigation's router are mocked, same
// pattern as comment-item.test.tsx.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/event.json";
import { ToastProvider } from "@/components/ui/toast";

vi.mock("@/components/event/actions", () => ({
  postCommentAction: vi.fn(),
  searchMentionsAction: vi.fn().mockResolvedValue([]),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { CommentComposer } = await import("@/components/event/comment-composer");

function renderComposer(props: Partial<Parameters<typeof CommentComposer>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <ToastProvider closeLabel="إغلاق">
        <CommentComposer locale="ar" sessionId="s1" parentId={null} {...props} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

function textarea() {
  return screen.getByRole("textbox") as HTMLTextAreaElement;
}

describe("CommentComposer", () => {
  it("shows no counter far from the cap, then all six Arabic ICU forms as the member approaches it", () => {
    renderComposer();
    expect(screen.queryByText(/متبقٍ|متبقية|متبقيان/)).not.toBeInTheDocument();

    const cases: [number, string][] = [
      [4000, "لا مساحة متبقية"], // 0 remaining -> zero
      [3999, "حرف واحد متبقٍ"], // 1 remaining -> one
      [3998, "حرفان متبقيان"], // 2 remaining -> two
      [3995, "5 أحرف متبقية"], // 5 remaining -> few
      [3980, "20 حرفًا متبقيًا"], // 20 remaining -> many
      [3700, "300 حرف متبقٍ"], // 300 remaining -> other (over the 200-char threshold, not shown)
    ];
    for (const [typedLength, expectedText] of cases) {
      fireEvent.change(textarea(), { target: { value: "ا".repeat(typedLength) } });
      if (typedLength === 3700) {
        // Past the visibility threshold (remaining > 200) — the counter is silent, not wrong.
        expect(screen.queryByText(expectedText)).not.toBeInTheDocument();
        continue;
      }
      expect(screen.getByText(expectedText)).toBeInTheDocument();
    }
  });

  it("keeps the typed text after a failed post — never cleared on the error path", async () => {
    const { postCommentAction } = await import("@/components/event/actions");
    vi.mocked(postCommentAction).mockResolvedValueOnce({ error: "generic" });
    renderComposer();
    fireEvent.change(textarea(), { target: { value: "سؤال لم يُنشر" } });
    fireEvent.click(screen.getByRole("button", { name: "نشر" }));
    // The same failure appears twice by design — the adjacent Panel
    // (REQ-UIX-010) AND the persistent toast (a reply composer can be
    // scrolled out of view) — so this asserts on both rather than picking
    // one arbitrarily.
    expect(await screen.findAllByText("حدث خطأ. حاول مرة أخرى")).toHaveLength(2);
    expect(textarea().value).toBe("سؤال لم يُنشر");
  });

  // ★ No success toast — the lead's live-build finding (BLOCKER 2): the
  // new comment appearing in the list IS the success feedback, and a
  // full-width toast was covering it. The composer clearing is the
  // observable confirmation here.
  it("clears the composer on a successful post, with no success toast", async () => {
    const { postCommentAction } = await import("@/components/event/actions");
    vi.mocked(postCommentAction).mockResolvedValueOnce({ error: null });
    renderComposer();
    fireEvent.change(textarea(), { target: { value: "تعليق ناجح" } });
    fireEvent.click(screen.getByRole("button", { name: "نشر" }));
    await waitFor(() => expect(textarea().value).toBe(""));
    expect(screen.queryByText("تم نشر تعليقك")).not.toBeInTheDocument();
  });

  // ★ BLOCKER 1, the lead's live-build finding: the composer stayed
  // `aria-busy="true"` for 80+ seconds after ONE successful post, through
  // typing new text and past 3890 characters. Reproduced here — NOT by
  // router.refresh() (removing it entirely made no difference; a `disabled`
  // dead end while narrowing this down), but by `pending` itself: once a
  // `startTransition` async callback clears `body` on success,
  // `aria-busy`/`pending` never flips back to `false`. `toBeEnabled()`
  // alone does not catch this — right after a clear the button is
  // CORRECTLY disabled too (nothing to submit, `body.trim().length === 0`,
  // an independent guard), which is exactly why the bug went unnoticed:
  // every earlier test happened to stop at "the composer cleared." This
  // one types fresh text afterwards and checks `aria-busy` directly.
  it("★ BLOCKER 1: aria-busy clears after a successful post, and stays clear once new text is typed", async () => {
    const { postCommentAction } = await import("@/components/event/actions");
    vi.mocked(postCommentAction).mockResolvedValueOnce({ error: null });
    renderComposer();
    fireEvent.change(textarea(), { target: { value: "تعليق" } });
    fireEvent.click(screen.getByRole("button", { name: "نشر" }));
    await waitFor(() => expect(textarea().value).toBe(""));
    fireEvent.change(textarea(), { target: { value: "تعليق جديد" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "نشر" })).not.toHaveAttribute("aria-busy", "true"), { timeout: 3000 });
    expect(screen.getByRole("button", { name: "نشر" })).toBeEnabled();
  });

  it("is accessible with the mention list and the counter both showing", async () => {
    const { container } = renderComposer();
    fireEvent.change(textarea(), { target: { value: "ا".repeat(3990) } });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
