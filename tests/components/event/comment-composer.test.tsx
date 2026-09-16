// The composer — REQ-UIX-024's "a real editing affordance, not a bare
// textarea": the remaining-length counter (all six Arabic ICU forms), the
// failed-post text staying put, and the pending/success/failure story on
// submit. Real ar/event.json through NextIntlClientProvider; only the
// Server Actions module and next/navigation's router are mocked, same
// pattern as comment-item.test.tsx.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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

  // ★ The lead's SECOND real-build finding, measured with a 500 ms
  // `aria-busy` poll against a served build: holding the POST for ~1.5 s
  // before releasing it left `aria-busy="true"` and the button disabled for
  // several MORE seconds after the response arrived, clearing only once the
  // member typed. The real cause, per `DEC-135`, is not a timing race this
  // component's own code could ever fully own: React 19.2.4 can lose the
  // ping that would resume a suspended transition once a Server Action's or
  // `router.refresh()`'s RSC chunk finishes resolving mid-render, and
  // nothing is then scheduled to retry — the lead measured this at one
  // press in three on a real build, from an instrumented `react-dom`. Two
  // earlier attempts here — a `setTimeout(…, 0)` decoupling at 44485b8, then
  // a paint-deferred `requestAnimationFrame` version at 4582b17 — each only
  // moved the odds, because both treated a SYMPTOM (the refresh racing this
  // transition's own completion) of a cause that was never actually about
  // timing. The real fix is `usePendingNudge(pending)` (comment-
  // composer.tsx): while pending, it re-renders this component every 300ms,
  // and each re-render un-suspends the root and lets the lost retry run.
  // `router.refresh()` is back as the LAST statement inside the SAME
  // `startTransition`, its pre-44485b8 shape — `pending` now honestly lasts
  // until the refresh has actually committed.
  //
  // Full honesty, as required by this file's own earlier blocker-1 test:
  // extensive attempts to reproduce the STUCK state itself in jsdom —
  // fake timers, real timers, an `act()`-wrapped settle, and a mocked
  // `router.refresh()` that itself calls `startTransition` around its own
  // slow (2 s) update to simulate what Next's real refresh does — ALL
  // resolved `aria-busy` to idle promptly, even against code with NEITHER
  // fix. `postCommentAction` is a full mock here; the actual lost-ping race
  // lives inside `next/dist/compiled`'s bundled `react-dom` reconciling a
  // REAL Flight stream, which never runs in this test at all — a mocked
  // promise resolving is not a Flight chunk transitioning `pending` →
  // `resolved_model` mid-render. So this test cannot discriminate the bug
  // from the fix — it passes on both, with or without `usePendingNudge`. It
  // stays as the regression guard the lead asked for (a slow action must
  // never leave `aria-busy` stuck without further input), not as proof the
  // live symptom is gone; only a real build settles that (`DEC-135`'s own
  // e2e reserve probe and the discussion review are what does).
  it("★ a slow post (1.5s) still clears aria-busy on its own, with no further input", async () => {
    vi.useFakeTimers();
    try {
      const { postCommentAction } = await import("@/components/event/actions");
      let resolveAction: (value: { error: null }) => void = () => {};
      vi.mocked(postCommentAction).mockImplementationOnce(
        () => new Promise((resolve) => { resolveAction = resolve; }),
      );
      renderComposer();
      fireEvent.change(textarea(), { target: { value: "تعليق بطيء" } });
      fireEvent.click(screen.getByRole("button", { name: "نشر" }));
      expect(screen.getByRole("button", { name: /نشر|جارٍ/ })).toHaveAttribute("aria-busy", "true");

      await act(async () => {
        resolveAction({ error: null });
        await vi.advanceTimersByTimeAsync(1500);
      });

      // No further fireEvent of any kind below this line.
      expect(screen.getByRole("button", { name: /نشر|جارٍ/ })).not.toHaveAttribute("aria-busy", "true");
      expect(textarea().value).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("is accessible with the mention list and the counter both showing", async () => {
    const { container } = renderComposer();
    fireEvent.change(textarea(), { target: { value: "ا".repeat(3990) } });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
