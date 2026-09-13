"use client";

import { useState, useTransition } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { formatNumber, type NumeralSystem } from "@/components/sessions/numerals";
import { deleteMyCommentAction, editCommentAction, moderateCommentAction, reportCommentAction, toggleReactionAction } from "@/components/event/actions";
import type { CommentDTO } from "@/lib/dal/comments";
import type { ReactionSummary } from "@/lib/dal/reactions";

// One comment or reply (REQ-EVT-002 … REQ-EVT-005, REQ-EVT-008). The
// tombstone rule is entirely client-side: a deleted, reply-less comment is
// filtered out by the caller before this ever mounts, so reaching this
// component with `deletedAt` set always means "leave the placeholder,
// replies depend on this thread standing" (docs/plan/notes/event.md §1).

export function CommentItem({
  locale,
  comment,
  reactions,
  reported,
  numerals,
  onReply,
  isReplyOpen,
  onReported,
}: {
  locale: string;
  comment: CommentDTO;
  reactions: ReactionSummary;
  /** The caller has already decided this row is worth rendering: a deleted
   *  comment reaching this component always has replies, so a tombstone is
   *  always the right thing to show (docs/plan/notes/event.md §1). */
  reported: boolean;
  numerals: NumeralSystem;
  onReply?: () => void;
  isReplyOpen?: boolean;
  /** Lets the list keep its own "already reported" set in sync (REQ-EVT-008). */
  onReported?: () => void;
}) {
  const t = useTranslations("event.comments");
  const format = useFormatter();
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [error, setError] = useState<string | null>(null);
  const [isReported, setIsReported] = useState(reported);
  const [pending, startTransition] = useTransition();

  const isDeleted = Boolean(comment.deletedAt);
  const likeCount = reactions.totals.like ?? 0;
  const iReacted = reactions.mine.includes("like");

  function saveEdit() {
    const trimmed = editBody.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await editCommentAction(locale, comment.id, trimmed);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  function deleteMine() {
    startTransition(async () => {
      const result = await deleteMyCommentAction(locale, comment.id);
      if (result.error) setError(result.error);
    });
  }

  function moderate(action: "remove" | "restore") {
    startTransition(async () => {
      const result = await moderateCommentAction(locale, comment.id, action);
      if (result.error) setError(result.error);
    });
  }

  function toggleLike() {
    startTransition(async () => {
      const result = await toggleReactionAction(locale, comment.id, "like");
      if (result.error) setError(result.error);
    });
  }

  function submitReport(formData: FormData) {
    const reason = formData.get("reason")?.toString().trim() ?? "";
    if (reason.length < 3) return;
    startTransition(async () => {
      const result = await reportCommentAction(locale, comment.id, reason);
      if (!result.error) {
        setIsReported(true);
        onReported?.();
      } else {
        setError(result.error);
      }
    });
  }

  if (isDeleted) {
    return (
      <div className="py-3">
        <p className="text-body-sm italic text-fg-muted">{t("deletedTombstone")}</p>
      </div>
    );
  }

  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-label text-fg-heading">
          <bdi>{comment.author.displayName ?? "—"}</bdi>
        </p>
        <time dateTime={comment.createdAt} className="text-caption text-fg-muted">
          {format.dateTime(new Date(comment.createdAt), { dateStyle: "medium", timeStyle: "short" })}
          {comment.editedAt ? ` · ${t("edited")}` : ""}
        </time>
      </div>

      {editing ? (
        <div className="mt-2">
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={2}
            maxLength={4000}
            className="w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading"
          />
          <div className="mt-2 flex gap-2">
            <Button type="button" onClick={saveEdit} disabled={pending} className="h-9 px-4">
              {t("save")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)} className="h-9 px-4">
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-body text-fg-body">{comment.body}</p>
      )}

      {error ? <p className="mt-1 text-body-sm text-fg-heading">{t(`errors.${error}`)}</p> : null}

      <div className="mt-2 flex flex-wrap items-center gap-4 text-body-sm text-fg-muted">
        <button type="button" onClick={toggleLike} disabled={pending} aria-pressed={iReacted} className={iReacted ? "font-semibold text-fg-heading" : ""}>
          {t("reactions.like")} {likeCount > 0 ? `· ${formatNumber(likeCount, numerals)}` : ""}
        </button>
        {onReply && !comment.parentId ? (
          <button type="button" onClick={onReply}>
            {isReplyOpen ? t("cancel") : t("reply")}
          </button>
        ) : null}
        {comment.canEditNow ? (
          <button type="button" onClick={() => setEditing((v) => !v)}>
            {t("edit")}
          </button>
        ) : null}
        {comment.isMine ? (
          <DeleteConfirm onConfirm={deleteMine} pending={pending} />
        ) : null}
        {comment.isStaffViewer ? (
          <button type="button" onClick={() => moderate("remove")} disabled={pending}>
            {t("moderator.remove")}
          </button>
        ) : null}
        {!comment.isMine && !isReported ? (
          <ReportDialog onSubmit={submitReport} pending={pending} />
        ) : null}
        {isReported ? <span>{t("report.already")}</span> : null}
      </div>
    </div>
  );
}

function DeleteConfirm({ onConfirm, pending }: { onConfirm: () => void; pending: boolean }) {
  const t = useTranslations("event.comments.delete");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" disabled={pending}>
          {t("action")}
        </button>
      </DialogTrigger>
      <DialogContent title={t("confirmTitle")} description={t("confirmBody")} closeLabel={t("cancel")}>
        <div className="flex gap-2">
          <DialogClose asChild>
            <Button type="button" onClick={onConfirm} className="h-10 px-5">
              {t("confirm")}
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button type="button" variant="secondary" className="h-10 px-5">
              {t("cancel")}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({ onSubmit, pending }: { onSubmit: (formData: FormData) => void; pending: boolean }) {
  const t = useTranslations("event.comments.report");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button">{t("action")}</button>
      </DialogTrigger>
      <DialogContent title={t("dialogTitle")} closeLabel={t("cancel")}>
        <form
          action={(formData) => {
            onSubmit(formData);
          }}
        >
          <label htmlFor="reason" className="text-label text-fg-heading">
            {t("reasonLabel")}
          </label>
          <p className="mt-1 text-body-sm text-fg-muted">{t("reasonHint")}</p>
          <textarea
            id="reason"
            name="reason"
            required
            minLength={3}
            maxLength={1000}
            rows={3}
            className="mt-2 w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading"
          />
          <div className="mt-3 flex gap-2">
            <DialogClose asChild>
              <Button type="submit" disabled={pending} className="h-10 px-5">
                {t("submit")}
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button type="button" variant="secondary" className="h-10 px-5">
                {t("cancel")}
              </Button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
