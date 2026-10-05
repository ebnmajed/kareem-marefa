"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { postCommentAction, searchMentionsAction } from "@/components/event/actions";
import { formatNumber } from "@/components/sessions/numerals";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import type { CommentAuthor, MentionCandidate } from "@/lib/dal/comments";

// The discussion's composer — `Event.dc.html:101-106`, `EventLive.dc.html:72-76`, `EventDesktop.dc.html:88`
// (DEC-208: written anew). The viewer's own avatar in their team's ring, one field that grows, and «نشر».
//
// Kept, requirement by requirement (`docs/plan/notes/content.md` § PR B):
//   · REQ-EVT-003 — any member posts, reserved or not; the page never renders this on a cancelled session;
//   · REQ-EVT-006 — «@» plus letters asks `searchMentionsAction` (same-org members only, REQ-TEN-003); a pick
//     writes «@name» and posts the member's id with the body;
//   · a post that fails keeps the text and says why beside the field — no toast covering the thread
//     (REQ-UIX-010); a network failure never throws the page to its error boundary;
//   · a post that succeeds clears the field ONLY if nothing was typed since it was sent;
//   · «نشر» stays visible (DEC-209): the field is multi-line, so Enter is a new line, not a send.
// ★ The photo button the artboard draws is not built (DEC-206 §4.70).

const MAX_LENGTH = 4000;
const COUNTER_THRESHOLD = 200;
const COUNTER_ANNOUNCE = [20, 10, 0];
const MAX_GROW_PX = 240;

export function CommentComposer({
  locale,
  sessionId,
  parentId,
  viewer,
  onPosted,
  onCancel,
  autoFocus,
}: {
  locale: string;
  sessionId: string;
  parentId: string | null;
  /** Drawn beside a top-level composer; a reply's composer sits under its comment without one. */
  viewer?: CommentAuthor | null;
  onPosted?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations("event.comments");
  const router = useRouter();
  const toast = useToast();
  const counterId = useId();
  const hintId = useId();
  const [body, setBody] = useState("");
  const [mentioned, setMentioned] = useState<Map<string, string>>(new Map());
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const field = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(body);
  useEffect(() => {
    latest.current = body;
  }, [body]);

  function grow() {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_GROW_PX)}px`;
  }

  function change(value: string) {
    setBody(value);
    grow();
    const cursor = field.current?.selectionStart ?? value.length;
    const match = /(?:^|\s)@([^\s@]{1,40})$/.exec(value.slice(0, cursor));
    if (!match) {
      setCandidates([]);
      return;
    }
    startTransition(async () => {
      try {
        setCandidates(await searchMentionsAction(locale, match[1]!));
      } catch {
        setCandidates([]);
      }
    });
  }

  function pick(candidate: MentionCandidate) {
    const name = candidate.displayName ?? "";
    const cursor = field.current?.selectionStart ?? body.length;
    const next = body.slice(0, cursor).replace(/@([^\s@]{0,40})$/, `@${name} `) + body.slice(cursor);
    setBody(next);
    setMentioned((prev) => new Map(prev).set(candidate.id, name));
    setCandidates([]);
    field.current?.focus();
  }

  function submit() {
    const sent = body.trim();
    if (!sent) return;
    setError(null);
    startTransition(async () => {
      let result: { error: string | null };
      try {
        result = await postCommentAction(locale, sessionId, parentId, Array.from(mentioned.keys()), sent);
      } catch {
        setError("network");
        return;
      }
      if (result.error) {
        setError(result.error);
        toast.show({ tone: "error", title: t(`errors.${result.error}`) });
        return;
      }
      if (latest.current.trim() === sent) {
        setBody("");
        setMentioned(new Map());
        setCandidates([]);
        if (field.current) field.current.style.height = "";
      }
      onPosted?.();
      router.refresh();
    });
  }

  const remaining = MAX_LENGTH - body.length;
  const label = parentId ? t("replyPlaceholder") : t("placeholder");
  const describedBy = [hintId, remaining <= COUNTER_THRESHOLD ? counterId : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2.5">
        {viewer ? <Avatar memberId={viewer.id} displayName={viewer.displayName} src={viewer.avatarUrl} size={32} teamColor={viewer.company?.teamColor ?? null} decorative /> : null}
        <div className="relative min-w-0 flex-1">
          {/* ui-lint-disable-next-line field — self-labelled via aria-label; a chat composer with no visible label by design (16, discussion); approved by the lead, wave 11 sync 1 */}
          <textarea
            ref={field}
            value={body}
            onChange={(e) => change(e.target.value)}
            placeholder={label}
            rows={1}
            maxLength={MAX_LENGTH}
            autoFocus={autoFocus}
            aria-label={label}
            aria-describedby={describedBy}
            className={controlClass(false, "md", "min-h-11 resize-none overflow-y-auto rounded-panel")}
          />
          {candidates.length > 0 ? (
            <Panel className="absolute z-10 mt-1 w-full max-w-xs bg-raised! p-0! shadow-card">
              <ul>
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => pick(c)} className="block min-h-11 w-full px-4 py-2 text-start text-body-sm text-fg-heading hover:bg-hover">
                      <bdi>{c.displayName ?? "—"}</bdi>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
        <Button type="button" onClick={submit} disabled={body.trim().length === 0} pending={pending} pendingLabel={t("sending")} size="md" className="shrink-0">
          {parentId ? t("reply") : t("submit")}
        </Button>
      </div>
      <div className={`flex items-center justify-between gap-3 ${viewer ? "ps-[42px]" : ""}`}>
        <p id={hintId} className="text-caption text-fg-muted">
          {t("mentionHint")}
        </p>
        {remaining <= COUNTER_THRESHOLD ? (
          <p id={counterId} className="shrink-0 text-caption text-fg-muted">
            {t("remainingChars", { count: remaining, value: formatNumber(remaining) })}
          </p>
        ) : null}
        {/* The visible counter is described, not live — a live one reads every keystroke. Only these marks are spoken. */}
        <p aria-live="polite" className="sr-only">
          {COUNTER_ANNOUNCE.includes(remaining) ? t("remainingChars", { count: remaining, value: formatNumber(remaining) }) : null}
        </p>
      </div>
      {error ? (
        <Panel tone="error" className="flex items-start gap-2 p-3">
          <AlertCircleIcon aria-hidden className="mt-0.5 shrink-0" />
          <p className="text-body-sm text-fg-heading">{t(`errors.${error}`)}</p>
        </Panel>
      ) : null}
      {onCancel ? (
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="self-start">
          {t("cancel")}
        </Button>
      ) : null}
    </div>
  );
}
