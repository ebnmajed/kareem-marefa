"use client";

import { useId, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteMyCommentAction, editCommentAction, removeCommentAction, reportCommentAction, toggleReactionAction } from "@/components/event/actions";
import { timeAgo } from "@/components/feed/relative";
import { orgDay } from "@/components/browse/session-post";
import { formatDateTime } from "@/components/sessions/numerals";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { HeartIcon, AlertCircleIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { ReactionBar } from "@/components/ui/reaction-bar";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { CommentDTO } from "@/lib/dal/comments";
import type { ReactionSummary } from "@/lib/dal/reactions";

// One comment or reply — `Event.dc.html:107-116`, `EventLive.dc.html:77-80` (DEC-208: written anew). The avatar in
// its team ring; a bubble with «name · company · when» and the body; under it the like and «رد», and the author's
// own and staff's actions.
//
// Kept, requirement by requirement (`docs/plan/notes/content.md` § PR B):
//   · REQ-EVT-002 — «رد» only on a top-level comment: there is no third level;
//   · REQ-EVT-004, REQ-UIX-034 — the like earns nothing; the pressed state is its acknowledgement, optimistic,
//     reverting on its own when the write fails; its name is the catalogue's «إعجاب» and its count;
//   · REQ-EVT-005 — edit own inside the org's window, marked «(معدَّل)»; delete own at any time, confirmed; a
//     deleted comment with replies stands as «حُذف هذا التعليق» (the list drops one without);
//   · REQ-EVT-008 — report with a reason, once; «تم إرسال بلاغك…» after;
//   · REQ-EVT-014 — staff remove any comment — ★ wave 22 (F6): with a reason, in a dialog, and every open report on it
//     closes in the same transaction (`remove_comment()`); the audit rows are the database's triggers;
//   · a frozen thread (a cancelled session, REQ-SES-010) shows counts and offers nothing;
//   · every action that fails at the network says so and never takes the page to its error boundary.
// ★ «· مقدِّم الجلسة» beside an author who presents; the company in words (DEC-209). Names in `<bdi>`.

const ACTION = "inline-flex min-h-11 items-center rounded-pill px-2 text-caption font-bold text-fg-muted hover:text-fg-heading";

export function CommentItem({
  locale,
  comment,
  reactions,
  reported,
  onReply,
  isReplyOpen,
  onReported,
  frozen,
  now,
  timeZone,
}: {
  locale: string;
  comment: CommentDTO;
  reactions: ReactionSummary;
  reported: boolean;
  onReply?: () => void;
  isReplyOpen?: boolean;
  onReported?: () => void;
  frozen?: boolean;
  /** The server's render instant, so the relative time is the same on both sides of hydration. */
  now: string;
  timeZone: string;
}) {
  const t = useTranslations("event.comments");
  const tFeed = useTranslations("feed");
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [error, setError] = useState<string | null>(null);
  const [isReported, setIsReported] = useState(reported);
  const [pending, startTransition] = useTransition();

  const likes = reactions.totals.like ?? 0;
  const liked = reactions.mine.includes("like");
  const [like, flip] = useOptimistic({ liked, count: likes }, (_s, next: boolean) => ({ liked: next, count: Math.max(0, likes + (next ? 1 : -1)) }));

  const reply = Boolean(comment.parentId);

  function run(action: () => Promise<{ error: string | null }>, onDone: () => void, quiet = false) {
    startTransition(async () => {
      let result: { error: string | null };
      try {
        result = await action();
      } catch {
        if (quiet) setError("network");
        else toast.show({ tone: "error", title: t("errors.network") });
        return;
      }
      if (result.error) {
        if (quiet) setError(result.error);
        else toast.show({ tone: "error", title: t(`errors.${result.error}`) });
        return;
      }
      onDone();
    });
  }

  function toggleLike() {
    const next = !like.liked;
    startTransition(async () => {
      flip(next);
      try {
        const result = await toggleReactionAction(locale, comment.id, "like");
        if (result.error) {
          toast.show({ tone: "error", title: t("toasts.reactionFailed") });
          return;
        }
      } catch {
        toast.show({ tone: "error", title: t("toasts.reactionFailed") });
        return;
      }
      router.refresh();
    });
  }

  function saveEdit() {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    run(() => editCommentAction(locale, comment.id, body), () => {
      setEditing(false);
      router.refresh();
    }, true);
  }

  function report(formData: FormData) {
    const reason = formData.get("reason")?.toString().trim() ?? "";
    run(() => reportCommentAction(locale, comment.id, reason), () => {
      setIsReported(true);
      onReported?.();
      toast.show({ tone: "success", title: t("report.success") });
    }, true);
  }

  if (comment.deletedAt) {
    return (
      <div className="py-2">
        <p className="text-body-sm italic text-fg-muted">{t("deletedTombstone")}</p>
      </div>
    );
  }

  const today = orgDay(new Date(now), timeZone);
  const day = orgDay(new Date(comment.createdAt), timeZone);
  const when = timeAgo(comment.createdAt, new Date(now), day, today, tFeed, locale);
  const company = comment.author.company?.name ?? null;

  return (
    <article className="flex gap-2.5 py-2">
      <Avatar memberId={comment.author.id} displayName={comment.author.displayName} src={comment.author.avatarUrl} size={reply ? 24 : 32} teamColor={comment.author.company?.teamColor ?? null} decorative />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className={`rounded-panel border border-edge bg-surface ${reply ? "px-3 py-2" : "px-3.5 py-2.5"}`}>
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-caption">
            <span className="font-bold text-fg-heading">
              <bdi>{comment.author.displayName ?? "—"}</bdi>
            </span>
            {comment.author.isPresenter ? <span className="text-fg-muted">· {t("presenter")}</span> : null}
            {company ? (
              <span className="text-fg-muted">
                · <bdi>{company}</bdi>
              </span>
            ) : null}
            <span className="text-fg-muted">
              · <time dateTime={comment.createdAt} title={formatDateTime(comment.createdAt, timeZone, locale)}>{when}</time>
              {comment.editedAt ? ` ${t("edited")}` : ""}
            </span>
          </p>
          {editing ? (
            <div className="mt-2 flex flex-col gap-2">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={4000} aria-label={t("edit")} />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={saveEdit} pending={pending} pendingLabel={t("saving")}>
                  {t("save")}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
                  {t("cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <p className={`whitespace-pre-wrap break-words text-fg-body ${reply ? "text-body-sm" : "text-body"}`}>{comment.body}</p>
          )}
        </div>

        {error ? (
          <Panel tone="error" className="flex items-start gap-2 p-3">
            <AlertCircleIcon aria-hidden className="mt-0.5 shrink-0" />
            <p className="text-body-sm text-fg-heading">{t(`errors.${error}`)}</p>
          </Panel>
        ) : null}

        <div className="flex flex-wrap items-center gap-1">
          <ReactionBar
            label={t("reactions.label")}
            readOnly={frozen}
            pending={pending}
            onToggle={toggleLike}
            items={[{ kind: "like", label: t("reactions.like"), count: like.count, pressed: like.liked, icon: <HeartIcon filled={like.liked} className="text-base" /> }]}
          />
          {onReply && !reply && !frozen ? (
            <button type="button" onClick={onReply} aria-expanded={isReplyOpen} className={ACTION}>
              {isReplyOpen ? t("cancel") : t("reply")}
            </button>
          ) : null}
          {comment.canEditNow && !frozen ? (
            <button type="button" onClick={() => setEditing((v) => !v)} className={ACTION}>
              {t("edit")}
            </button>
          ) : null}
          {comment.isMine ? <DeleteConfirm pending={pending} onConfirm={() => run(() => deleteMyCommentAction(locale, comment.id), () => router.refresh())} /> : null}
          {comment.isStaffViewer ? <StaffRemove locale={locale} commentId={comment.id} authorName={comment.author.displayName ?? "—"} onRemoved={() => router.refresh()} /> : null}
          {!comment.isMine && !isReported ? <ReportDialog pending={pending} onSubmit={report} /> : null}
          {isReported ? <span className="px-2 text-caption text-fg-muted">{t("report.already")}</span> : null}
        </div>
      </div>
    </article>
  );
}

/** Controlled, with the confirm a plain button: closing and confirming are two ordered statements (the
 *  real-build finding that `DialogClose` around a transition timed out). */
function DeleteConfirm({ onConfirm, pending }: { onConfirm: () => void; pending: boolean }) {
  const t = useTranslations("event.comments.delete");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" disabled={pending} className={ACTION}>
          {t("action")}
        </button>
      </DialogTrigger>
      <DialogContent title={t("confirmTitle")} description={t("confirmBody")} closeLabel={t("cancel")}>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {t("confirm")}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t("cancel")}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** `noValidate`: a short reason reaches the action, whose Zod `min(3)` answers at the field (DEC-149 §1). */
function ReportDialog({ onSubmit, pending }: { onSubmit: (formData: FormData) => void; pending: boolean }) {
  const t = useTranslations("event.comments.report");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={ACTION}>
          {t("action")}
        </button>
      </DialogTrigger>
      <DialogContent title={t("dialogTitle")} closeLabel={t("cancel")}>
        <form noValidate onSubmit={() => setOpen(false)} action={(formData) => onSubmit(formData)}>
          <label htmlFor="report-reason" className="text-label text-fg-heading">
            {t("reasonLabel")}
          </label>
          <p className="mt-1 text-body-sm text-fg-muted">{t("reasonHint")}</p>
          <Textarea id="report-reason" name="reason" required minLength={3} maxLength={1000} rows={3} className="mt-2" />
          <div className="mt-3 flex gap-2">
            <Button type="submit" pending={pending} pendingLabel={t("sending")}>
              {t("submit")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t("cancel")}
              </Button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** REQ-EVT-014, wave 22 (F6) — staff remove a comment from the event page: a dialog naming whose comment and what follows
 *  (REQ-UIX-013), the reason required at the field, one transaction in `remove_comment()` that also closes every open
 *  report on it. Controlled, closing on the answer; `onSubmit`, so a refused reason stays typed (React resets a form
 *  after an action). A network failure toasts and never reaches the error boundary. */
function StaffRemove({ locale, commentId, authorName, onRemoved }: { locale: string; commentId: string; authorName: string; onRemoved: () => void }) {
  const t = useTranslations("event.comments");
  const toast = useToast();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(reason: string) {
    setFieldError(null);
    startTransition(async () => {
      let outcome: string;
      try {
        outcome = (await removeCommentAction(locale, commentId, reason)).outcome;
      } catch {
        toast.show({ tone: "error", title: t("errors.network") });
        return;
      }
      if (outcome === "reason_required") {
        setFieldError(t("moderator.reasonRequired"));
        return;
      }
      setOpen(false);
      if (outcome === "removed" || outcome === "already_removed") {
        toast.show({ tone: "success", title: t("moderator.removed") });
        onRemoved();
      } else {
        toast.show({ tone: "error", title: t(outcome === "not_authorized" ? "errors.not_permitted" : "errors.generic") });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" disabled={pending} className={ACTION}>
          {pending ? t("moderator.removing") : t("moderator.remove")}
        </button>
      </DialogTrigger>
      <DialogContent
        title={t.rich("moderator.dialogTitle", { name: authorName, bdi: (chunks) => <bdi>{chunks}</bdi> })}
        description={t("moderator.dialogBody")}
        closeLabel={t("moderator.close")}
      >
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget).get("reason")?.toString() ?? "");
          }}
        >
          <Field id={reasonId} label={t("moderator.reasonLabel")} required error={fieldError ?? undefined}>
            {/* A refusal is the field's until the member types again — never a stale error under a valid reason. */}
            <Textarea name="reason" rows={3} maxLength={300} onChange={() => setFieldError(null)} />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button type="submit" variant="danger" pending={pending} pendingLabel={t("moderator.removing")}>
              {t("moderator.confirm")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t("moderator.cancel")}
              </Button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
