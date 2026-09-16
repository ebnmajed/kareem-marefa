"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { usePendingNudge } from "@/components/ui/pending-nudge";
import { requestPhotoTakedownAction, restorePhotoAction } from "@/components/photos/actions";

interface TakedownButtonProps {
  locale: string;
  sessionId: string;
  photoId: string;
  mode: "request" | "restore";
}

/** REQ-EVT-012 — "one click, hides instantly" for `mode="request"` (any member); a staff-only
 *  `mode="restore"` clears a mistaken hide. `mode="request"` confirms in `ui/dialog` naming the
 *  object (`REQ-UIX-013` — every destructive action confirms in a dialog; the previous
 *  `window.confirm` was unstyled, felt native rather than platform, and every other destructive
 *  confirmation in the product already uses this same dialog, `comment-item.tsx`'s own
 *  `DeleteConfirm`). `mode="restore"` keeps no confirmation — it is staff-only and reversible by
 *  construction (another restore/request undoes it), matching `notice`'s own framing that the hide,
 *  not the restore, is the irreversible-by-the-requester-alone act. */
export function TakedownButton({ locale, sessionId, photoId, mode }: TakedownButtonProps) {
  const t = useTranslations("photos.gallery");
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);

  // `DEC-135`: both `requestPhotoTakedownAction` and `restorePhotoAction`
  // call `revalidatePath` server-side, so this transition waits on the SAME
  // re-render React 19.2.4 can lose the ping for. `usePendingNudge`
  // re-renders this component every 300ms while pending to force the lost
  // retry through.
  usePendingNudge(pending);

  function run() {
    startTransition(async () => {
      try {
        const action = mode === "request" ? requestPhotoTakedownAction : restorePhotoAction;
        const result = await action(locale, sessionId, photoId);
        if (result.error) {
          // The DAL/action layer returns the raw thrown message here (there
          // is no structured error-code set for takedown/restore, unlike
          // comments' `KNOWN_ERRORS`) — never shown raw to a member; one
          // honest, generic toast either way.
          toast.show({ tone: "error", title: mode === "request" ? t("requestHideFailed") : t("restoreFailed") });
        } else {
          setDone(true);
          toast.show({ tone: "success", title: mode === "request" ? t("requestedHide") : t("restored") });
        }
      } catch {
        // ★ A request that fails at the NETWORK level (offline, a dropped
        // connection) makes the action REJECT rather than return an
        // `{ error }` value — left uncaught, React would replace the whole
        // event page with the route's error boundary (the lead's real-build
        // finding on the discussion, same shape here). Same toast as the
        // returned-error path above; `done` is never set.
        toast.show({ tone: "error", title: mode === "request" ? t("requestHideFailed") : t("restoreFailed") });
      }
    });
  }

  if (done) {
    return <p className="text-body-sm text-fg-muted">{mode === "request" ? t("requestedHide") : t("restored")}</p>;
  }

  if (mode === "restore") {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={run} pending={pending} pendingLabel={t("restoring")} className="h-9 px-3 self-start">
        {t("restore")}
      </Button>
    );
  }

  // ★ The dialog is CONTROLLED, and the confirm button is a plain button,
  // not `DialogClose asChild` — the lead's real-build e2e run timed out on
  // this exact shape (DialogClose wrapping an onClick that starts a
  // transition). See `comment-item.tsx`'s `DeleteConfirm`, the identical
  // fix for the identical shape.
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-9 self-start px-3 text-error hover:bg-error-bg">
          {t("requestHide")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("requestHideConfirmTitle")} description={t("requestHideConfirm")} closeLabel={t("cancel")}>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              setOpen(false);
              run();
            }}
            className="h-10 px-5"
          >
            {t("requestHide")}
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
