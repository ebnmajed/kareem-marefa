"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { postCommentAction, searchMentionsAction } from "@/components/event/actions";
import type { MentionCandidate } from "@/lib/dal/comments";

// The composer for a new top-level comment or a reply (REQ-EVT-002,
// REQ-EVT-006). One component for both — a reply only differs by carrying a
// `parentId` and a smaller placeholder.
//
// Mentions: typing "@" opens a small candidate list from
// `members_member_view` (org-scoped by its own RLS, REQ-EVT-006's actual
// guarantee); picking one inserts the name as plain text and records the
// member id in `mentioned`, sent alongside the comment. Delivery — a
// notification reaching that member — is M3's `notify` (docs/plan/notes/event.md §1).

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
  const [body, setBody] = useState("");
  const [mentioned, setMentioned] = useState<Map<string, string>>(new Map()); // id -> displayName
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleChange(value: string) {
    setBody(value);
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
        return;
      }
      setBody("");
      setMentioned(new Map());
      setCandidates([]);
      onPosted?.();
      // The realtime echo (03 §7.4) is what shows this to everyone ELSE
      // live; the poster's own copy must not depend on a websocket round
      // trip completing, so a server-rendered refresh guarantees it — the
      // gap this closes is real, not defensive: a subscription that has not
      // finished establishing yet by the time the insert commits leaves the
      // poster staring at their own empty composer with no comment to show
      // for it (caught by tests/e2e/event-comments.spec.ts against the real
      // page, not assumed from the component test alone).
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={parentId ? t("replyPlaceholder") : t("placeholder")}
        rows={parentId ? 2 : 3}
        maxLength={4000}
        autoFocus={autoFocus}
        aria-label={parentId ? t("replyPlaceholder") : t("placeholder")}
        className="w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading"
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
      <p className="mt-1 text-body-sm text-fg-muted">{t("mentionHint")}</p>
      {error ? <p className="mt-1 text-body-sm text-fg-heading">{t(`errors.${error}`)}</p> : null}
      <div className="mt-2 flex gap-2">
        <Button type="button" onClick={submit} disabled={pending || body.trim().length === 0} className="h-10 px-5">
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
