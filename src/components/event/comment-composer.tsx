"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { controlClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { AlertCircleIcon } from "@/components/ui/icons";
import { formatNumber } from "@/components/sessions/numerals";
import { postCommentAction, searchMentionsAction } from "@/components/event/actions";
import type { MentionCandidate } from "@/lib/dal/comments";

// The composer for a new top-level comment or a reply (REQ-EVT-002,
// REQ-EVT-006, REQ-UIX-024). One component for both — a reply only differs
// by carrying a `parentId` and a smaller placeholder.
//
// ★ A real editing affordance, wave 6 (REQ-UIX-024's "not a bare textarea"):
// the field auto-grows with its content (measured, not `field-sizing` alone
// — a JS measurement works everywhere `field-sizing: content` does not yet),
// and a remaining-length counter appears once the member is close to the
// 4000-character cap rather than staying silent until the 4001st character
// is simply refused. `controlClass()` (`ui/field.tsx`, `sessions`' shared
// style function) is used directly rather than `<Textarea>` — this field
// needs a live DOM ref for both the grow measurement and the mention
// cursor-position lookup below, and `Textarea` is a plain function
// component with no `ref` of its own to forward one through.
//
// Mentions: typing "@" opens a small candidate list from
// `members_member_view` (org-scoped by its own RLS, REQ-EVT-006's actual
// guarantee); picking one inserts the name as plain text and records the
// member id in `mentioned`, sent alongside the comment. Delivery — a
// notification reaching that member — is M3's `notify` (docs/plan/notes/event.md §1).
//
// Pending/success/failure on every action (REQ-UIX-007, REQ-UIX-024): the
// submit control shows its own pending state via `ui/button`'s `pending`
// override (this is a `useTransition` call, not a native form submission, so
// `useFormStatus` never fires); success clears the composer AND raises a
// brief toast (real feedback for a REPLY, which can land below the fold of
// what the member is looking at); failure keeps the typed text — it was
// never cleared on the error path, before or after this rewrite — shows an
// adjacent `Panel` (REQ-UIX-010: field errors are adjacent, coloured,
// icon-marked) AND a persistent toast, since a composer scrolled out of view
// still owes its author the truth.

const MAX_LENGTH = 4000;
const COUNTER_THRESHOLD = 200; // show the counter only once this close to the cap — visible from character zero is noise
const MAX_GROW_PX = 240; // roughly ten rows before the box scrolls instead of growing further

export function CommentComposer({
  locale,
  sessionId,
  parentId,
  onPosted,
  onCancel,
  autoFocus,
}: {
  locale: string;
  sessionId: string;
  parentId: string | null;
  onPosted?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations("event.comments");
  const router = useRouter();
  const toast = useToast();
  const counterId = useId();
  const [body, setBody] = useState("");
  const [mentioned, setMentioned] = useState<Map<string, string>>(new Map()); // id -> displayName
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function grow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_GROW_PX)}px`;
  }

  function handleChange(value: string) {
    setBody(value);
    grow();
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const upToCursor = value.slice(0, cursor);
    const match = /(?:^|\s)@([^\s@]{1,40})$/.exec(upToCursor);
    if (!match) {
      setCandidates([]);
      return;
    }
    const query = match[1];
    startTransition(async () => {
      const results = await searchMentionsAction(locale, query);
      setCandidates(results);
    });
  }

  function pickMention(candidate: MentionCandidate) {
    const name = candidate.displayName ?? "";
    const cursor = textareaRef.current?.selectionStart ?? body.length;
    const upToCursor = body.slice(0, cursor);
    const replaced = upToCursor.replace(/@([^\s@]{0,40})$/, `@${name} `);
    const next = replaced + body.slice(cursor);
    setBody(next);
    setMentioned((prev) => new Map(prev).set(candidate.id, name));
    setCandidates([]);
    textareaRef.current?.focus();
  }

  function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await postCommentAction(locale, sessionId, parentId, Array.from(mentioned.keys()), trimmed);
      if (result.error) {
        setError(result.error);
        toast.show({ tone: "error", title: t(`errors.${result.error}`) });
        return;
      }
      setBody("");
      setMentioned(new Map());
      setCandidates([]);
      if (textareaRef.current) textareaRef.current.style.height = "";
      onPosted?.();
      // ★ BLOCKER 1, the lead's live-build finding: router.refresh() used to
      // be the last statement inside THIS SAME startTransition callback —
      // the one this Button's own `pending`/`aria-busy` is read from. Reply
      // to a comment, post at the top level, then react, and the MAIN
      // composer's «نشر» was found stuck busy for 80+ seconds: three
      // sibling components (this composer, a reply composer, a reaction)
      // each call router.refresh() in close succession, and Next's router
      // can fold overlapping refreshes into one underlying request without
      // signalling every caller's own transition that ITS work is done —
      // React then has no way to know this transition ever finished.
      // `setTimeout(…, 0)` runs router.refresh() in a genuinely separate
      // macrotask, outside any transition React is tracking here, so this
      // component's own pending state resolves the moment postCommentAction
      // itself settles and never depends on the refresh's own timing again.
      // The realtime echo (03 §7.4) is what shows this to everyone ELSE
      // live; the poster's own copy must not depend on a websocket round
      // trip completing, so a server-rendered refresh guarantees it — the
      // gap this closes is real, not defensive: a subscription that has not
      // finished establishing yet by the time the insert commits leaves the
      // poster staring at their own empty composer with no comment to show
      // for it (caught by tests/e2e/event-comments.spec.ts against the real
      // page, not assumed from the component test alone). The success toast
      // that used to sit here is gone too (★ BLOCKER 2) — the comment
      // appearing in the list IS the success feedback, and a full-width
      // toast was covering exactly the new content it was announcing.
      setTimeout(() => router.refresh(), 0);
    });
  }

  const remaining = MAX_LENGTH - body.length;
  const showCounter = remaining <= COUNTER_THRESHOLD;
  const label = parentId ? t("replyPlaceholder") : t("placeholder");

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={label}
        rows={parentId ? 2 : 3}
        maxLength={MAX_LENGTH}
        autoFocus={autoFocus}
        aria-label={label}
        aria-describedby={showCounter ? counterId : undefined}
        className={controlClass(false, "md", "resize-none overflow-hidden")}
      />
      {candidates.length > 0 ? (
        <ul className="absolute z-10 mt-1 w-full max-w-xs rounded-field border border-edge-strong bg-[var(--color-canvas)] shadow-card">
          {candidates.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => pickMention(c)}
                className="block w-full px-4 py-2 text-start text-body-sm text-fg-heading hover:bg-[var(--btn2-bg-hover)]"
              >
                <bdi>{c.displayName ?? "—"}</bdi>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="text-body-sm text-fg-muted">{t("mentionHint")}</p>
        {showCounter ? (
          // No `<bdi>` here — matching the house convention every other
          // `{count, value}` line in this codebase already follows
          // (`materials.list.count`, `photos.gallery.count`,
          // `event.comments.count`): a short digit count embedded in an
          // otherwise-Arabic sentence does not reorder the surrounding text
          // the way an interpolated NAME or TITLE can, so isolation is
          // reserved for those (`10` §3).
          <p id={counterId} aria-live="polite" className="shrink-0 text-caption text-fg-muted">
            {t("remainingChars", { count: remaining, value: formatNumber(remaining) })}
          </p>
        ) : null}
      </div>
      {error ? (
        <Panel tone="error" className="mt-2 flex items-start gap-2 p-3">
          <AlertCircleIcon aria-hidden className="mt-0.5 shrink-0" />
          <p className="text-body-sm text-fg-heading">{t(`errors.${error}`)}</p>
        </Panel>
      ) : null}
      <div className="mt-2 flex gap-2">
        <Button type="button" onClick={submit} disabled={body.trim().length === 0} pending={pending} pendingLabel={t("sending")} className="h-10 px-5">
          {parentId ? t("reply") : t("submit")}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel} className="h-10 px-5">
            {t("cancel")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
