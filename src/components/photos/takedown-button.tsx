"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { requestPhotoTakedownAction, restorePhotoAction } from "@/components/photos/actions";

interface TakedownButtonProps {
  locale: string;
  sessionId: string;
  photoId: string;
  mode: "request" | "restore";
}

/** REQ-EVT-012 — "one click, hides instantly" for `mode="request"` (any member); a staff-only
 *  `mode="restore"` clears a mistaken hide. `window.confirm` for the request only: the hide is
 *  irreversible-by-the-requester-alone (only a moderator can undo it), so a stray click deserves
 *  one confirmation, matching `notice`'s own "this happens immediately" framing (07 §9.3). */
export function TakedownButton({ locale, sessionId, photoId, mode }: TakedownButtonProps) {
  const t = useTranslations("photos.gallery");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (mode === "request" && !window.confirm(t("requestHideConfirm"))) return;
    startTransition(async () => {
      const action = mode === "request" ? requestPhotoTakedownAction : restorePhotoAction;
      const result = await action(locale, sessionId, photoId);
      if (result.error) setError(result.error);
      else setDone(true);
    });
  }

  if (done) {
    return <p className="text-body-sm text-fg-muted">{mode === "request" ? t("requestedHide") : t("restored")}</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={handleClick} disabled={pending} className="text-body-sm text-fg-body underline hover:text-fg-heading disabled:opacity-40">
        {mode === "request" ? t("requestHide") : t("restore")}
      </button>
      {error ? <p className="text-body-sm text-fg-heading">{error}</p> : null}
    </div>
  );
}
