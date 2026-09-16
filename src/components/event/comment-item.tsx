"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { Prose } from "@/components/ui/prose";
import { Avatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { AlertCircleIcon, AlertTriangleIcon, DotIcon, TrashIcon } from "@/components/ui/icons";
import { formatNumber } from "@/components/sessions/numerals";
import { deleteMyCommentAction, editCommentAction, moderateCommentAction, reportCommentAction, toggleReactionAction } from "@/components/event/actions";
import type { CommentDTO } from "@/lib/dal/comments";
import type { ReactionSummary } from "@/lib/dal/reactions";

// One comment or reply (REQ-EVT-002 … REQ-EVT-005, REQ-EVT-008, REQ-UIX-024).
// The tombstone rule is entirely client-side: a deleted, reply-less comment
// is filtered out by the caller before this ever mounts, so reaching this
// component with `deletedAt` set always means "leave the placeholder,
// replies depend on this thread standing" (docs/plan/notes/event.md §1).
//
// ★ Reaction, report and delete are `IconButton` (the lead's ruling on
// content's wave-6 plan §4.6); reply stays a labelled `ui/button` — it
// benefits from a visible word more than the other three, and the house
// icon set (34 exports) has no reply-shaped glyph to begin with. Edit and
// moderator remove/restore stay `ui/button` too: edit opens a whole editing
// UI, not a single unambiguous glyph action, and moderation is staff-only
// and infrequent enough that a visible Arabic label reads as more
// deliberate than an icon a moderator has to hover to confirm.

export function CommentItem({
  locale,
  comment,
  reactions,
  reported,
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
  onReply?: () => void;
  isReplyOpen?: boolean;
  /** Lets the list keep its own "already reported" set in sync (REQ-EVT-008). */
  onReported?: () => void;
}) {
  const t = useTranslations("event.comments");
  const format = useFormatter();
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [error, setError] = useState<string | null>(null);
  const [isReported, setIsReported] = useState(reported);
  const [pending, startTransition] = useTransition();

  const isDeleted = Boolean(comment.deletedAt);
  const likeCount = reactions.totals.like ?? 0;
  const iReacted = reactions.mine.includes("like");

  // ★ The reaction whisper (`DEC-100`, `REQ-EVT-004`, `REQ-UIX-018`) —
  // optimistic per `16` §7.1 layer 4 ("never for RSVP" — a reaction is
  // exactly the uncontended case that IS allowed to be optimistic). The
  // motion plays only on the transition INTO "reacted," never on a
  // re-render or on unreacting: `ignite` is a plain boolean the click
  // handler sets, cleared by a fixed timer rather than `onAnimationEnd`
  // because `.reaction-ring` (`--dur-slow`, 360 ms) outlives `.reaction-
  // ignite` (`--dur-base`, 200 ms) and is `display: none` under reduced
  // motion — an animation event on a never-painted element is not
  // something to depend on.
  const [optimisticReaction, setOptimisticReaction] = useOptimistic(
    { reacted: iReacted, count: likeCount },
    (_current, nextReacted: boolean) => ({ reacted: nextReacted, count: likeCount + (nextReacted ? 1 : -1) }),
  );
  const [ignite, setIgnite] = useState(false);

  function saveEdit() {
    const trimmed = editBody.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await editCommentAction(locale, comment.id, trimmed);
      if (result.error) {
        setError(result.error);
        toast.show({ tone: "error", title: t(`errors.${result.error}`) });
        return;
      }
      setEditing(false);
      toast.show({ tone: "success", title: t("toasts.editSuccess") });
      router.refresh(); // see comment-composer.tsx — the actor's own copy must not wait on the realtime echo
    });
  }

  function deleteMine() {
    startTransition(async () => {
      const result = await deleteMyCommentAction(locale, comment.id);
      if (result.error) {
        toast.show({ tone: "error", title: t(`errors.${result.error}`) });
      } else {
        // The tombstone IS the confirmation — no toast for a member's own
        // delete, unlike moderation below, which can change what a DIFFERENT
        // member sees.
        router.refresh();
      }
    });
  }

  function moderate(action: "remove" | "restore") {
    startTransition(async () => {
      const result = await moderateCommentAction(locale, comment.id, action);
      if (result.error) {
        toast.show({ tone: "error", title: t(`errors.${result.error}`) });
      } else {
        toast.show({ tone: "success", title: t(action === "remove" ? "toasts.moderateRemoveSuccess" : "toasts.moderateRestoreSuccess") });
        router.refresh();
      }
    });
  }

  function toggleLike() {
    const next = !optimisticReaction.reacted;
    if (next) setIgnite(true);
    startTransition(async () => {
      setOptimisticReaction(next);
      const result = await toggleReactionAction(locale, comment.id, "like");
      if (result.error) {
        // No inline slot for a glyph this small — a quiet, persistent toast
        // is the only honest place to say a reaction did not stick. The
        // optimistic value reverts on its own once this transition settles,
        // because router.refresh() below was never reached.
        toast.show({ tone: "error", title: t("toasts.reactionFailed") });
        return;
      }
      router.refresh();
    });
    window.setTimeout(() => setIgnite(false), 400); // clears after --dur-slow (360ms) + margin, both motion states
  }

  function submitReport(formData: FormData) {
    const reason = formData.get("reason")?.toString().trim() ?? "";
    if (reason.length < 3) return;
    startTransition(async () => {
      const result = await reportCommentAction(locale, comment.id, reason);
      if (!result.error) {
        setIsReported(true);
        onReported?.();
        toast.show({ tone: "success", title: t("report.success") });
      } else {
        setError(result.error);
        toast.show({ tone: "error", title: t(`errors.${result.error}`) });
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
    <div className="flex gap-3 py-3">
      <Avatar memberId={comment.author.id} displayName={comment.author.displayName} src={comment.author.avatarUrl} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-label text-fg-heading">
            <bdi>{comment.author.displayName ?? "—"}</bdi>
          </p>
          <time dateTime={comment.createdAt} className="shrink-0 text-caption text-fg-muted">
            {format.dateTime(new Date(comment.createdAt), { dateStyle: "medium", timeStyle: "short" })}
            {comment.editedAt ? ` · ${t("edited")}` : ""}
          </time>
        </div>

        {editing ? (
          <div className="mt-2">
            <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2} maxLength={4000} aria-label={t("edit")} />
            <div className="mt-2 flex gap-2">
              <Button type="button" onClick={saveEdit} pending={pending} pendingLabel={t("saving")} size="sm" className="h-9 px-4">
                {t("save")}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)} className="h-9 px-4">
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Prose size="sm" className="mt-1 max-w-none">
            <p className="whitespace-pre-wrap">{comment.body}</p>
          </Prose>
        )}

        {error ? (
          <Panel tone="error" className="mt-2 flex items-start gap-2 p-3">
            <AlertCircleIcon aria-hidden className="mt-0.5 shrink-0" />
            <p className="text-body-sm text-fg-heading">{t(`errors.${error}`)}</p>
          </Panel>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-1 text-body-sm text-fg-muted">
          <div className="inline-flex items-center gap-1">
            <IconButton
              label={t(optimisticReaction.reacted ? "reactions.unlike" : "reactions.like")}
              onClick={toggleLike}
              disabled={pending}
              size="sm"
              variant={optimisticReaction.reacted ? "secondary" : "ghost"}
            >
              <span className="relative inline-flex size-4 items-center justify-center">
                <DotIcon aria-hidden className={`${optimisticReaction.reacted ? "text-fg-heading" : "text-fg-muted"} ${ignite ? "reaction-ignite" : ""}`} />
                {ignite ? <span aria-hidden className="reaction-ring absolute inset-0 rounded-full border border-current text-fg-heading" /> : null}
              </span>
            </IconButton>
            {optimisticReaction.count > 0 ? <span className="text-caption text-fg-muted">{formatNumber(optimisticReaction.count)}</span> : null}
          </div>
          {onReply && !comment.parentId ? (
            <Button type="button" variant="ghost" size="sm" onClick={onReply} className="h-9 px-3">
              {isReplyOpen ? t("cancel") : t("reply")}
            </Button>
          ) : null}
          {comment.canEditNow ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing((v) => !v)} className="h-9 px-3">
              {t("edit")}
            </Button>
          ) : null}
          {comment.isMine ? <DeleteConfirm onConfirm={deleteMine} pending={pending} /> : null}
          {comment.isStaffViewer ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => moderate("remove")}
              pending={pending}
              pendingLabel={t("moderator.removing")}
              className="h-9 px-3"
            >
              {t("moderator.remove")}
            </Button>
          ) : null}
          {!comment.isMine && !isReported ? <ReportDialog onSubmit={submitReport} pending={pending} /> : null}
          {isReported ? <span>{t("report.already")}</span> : null}
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ onConfirm, pending }: { onConfirm: () => void; pending: boolean }) {
  const t = useTranslations("event.comments.delete");
  // ★ The dialog is CONTROLLED, and the confirm button is a plain button,
  // not `DialogClose asChild` — the lead's real-build e2e run found the
  // previous DialogClose-wraps-an-onClick-that-starts-a-transition pattern
  // timing out (both this and the same shape in photos' TakedownButton).
  // Composing Radix's own close-on-click with a caller's onClick via
  // `asChild` is documented Radix usage, but relying on it for a handler
  // that also has to survive whatever `Dialog.Close`'s own click handling
  // does first is a race this component does not need to run: closing
  // `open` and firing `onConfirm` are now two plain, ordered statements in
  // one handler I own end to end.
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <IconButton label={t("action")} disabled={pending} size="sm">
          <TrashIcon aria-hidden />
        </IconButton>
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
            className="h-10 px-5"
          >
            {t("confirm")}
          </Button>
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
  // ★ Same fix as `DeleteConfirm` above, adapted for a form submit: `open`
  // is controlled and closed from the form's own `onSubmit` (fires
  // synchronously the moment the button is activated, before the `action`
  // prop's async work even starts) rather than from `DialogClose` wrapping
  // the `type="submit"` button — removing any question of ordering between
  // Radix's own close handling and the native submit it would otherwise be
  // composed with.
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <IconButton label={t("action")} size="sm">
          <AlertTriangleIcon aria-hidden />
        </IconButton>
      </DialogTrigger>
      <DialogContent title={t("dialogTitle")} closeLabel={t("cancel")}>
        <form
          onSubmit={() => setOpen(false)}
          action={(formData) => {
            onSubmit(formData);
          }}
        >
          <label htmlFor="reason" className="text-label text-fg-heading">
            {t("reasonLabel")}
          </label>
          <p className="mt-1 text-body-sm text-fg-muted">{t("reasonHint")}</p>
          <Textarea id="reason" name="reason" required minLength={3} maxLength={1000} rows={3} className="mt-2" />
          <div className="mt-3 flex gap-2">
            <Button type="submit" pending={pending} pendingLabel={t("sending")} className="h-10 px-5">
              {t("submit")}
            </Button>
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
