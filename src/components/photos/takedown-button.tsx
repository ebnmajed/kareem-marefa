"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
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

  function run() {
    startTransition(async () => {
      const action = mode === "request" ? requestPhotoTakedownAction : restorePhotoAction;
      const result = await action(locale, sessionId, photoId);
      if (result.error) {
        // The DAL/action layer returns the raw thrown message here (there is
        // no structured error-code set for takedown/restore, unlike
        // comments' `KNOWN_ERRORS`) — never shown raw to a member; one
        // honest, generic toast either way.
        toast.show({ tone: "error", title: mode === "request" ? t("requestHideFailed") : t("restoreFailed") });
      } else {
        setDone(true);
        toast.show({ tone: "success", title: mode === "request" ? t("requestedHide") : t("restored") });
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

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-9 self-start px-3 text-error hover:bg-error-bg">
          {t("requestHide")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("requestHideConfirmTitle")} description={t("requestHideConfirm")} closeLabel={t("cancel")}>
        <div className="flex gap-2">
          <DialogClose asChild>
            <Button type="button" variant="danger" onClick={run} className="h-10 px-5">
              {t("requestHide")}
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
