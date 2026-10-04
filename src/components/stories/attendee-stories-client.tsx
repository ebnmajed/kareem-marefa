"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/components/sessions/numerals";
import { REMOVE_ATTENDEE_FRAME_INITIAL, type RemoveAttendeeFrameState } from "@/components/stories/state";
import type { AttendeeStoryFrame } from "@/lib/dal/story-frames";

// The strip's tiles and the removal sheet. «أزل» asks for a reason (REQ-EVT-014: removal is audited with actor AND
// reason — the board's bare chip has none, content's plan §8.8) and goes through `remove_story_frame()`: a photo frame
// through `remove_photo()` with its audit row and its compensating ledger row, a video frame removed, audited and
// purged. Each tile names its author in text, not by a ring's colour alone (REQ-NFR-007); the row scrolls, so a
// seventh tile is reachable.

function length(ms: number | null): string {
  const s = Math.round((ms ?? 0) / 1000);
  return `${formatNumber(Math.floor(s / 60))}:${String(s % 60).padStart(2, "0")}`;
}

export function AttendeeStoriesClient({
  frames,
  title,
  removeAction,
}: {
  frames: AttendeeStoryFrame[];
  title: string;
  removeAction: (prev: RemoveAttendeeFrameState, form: FormData) => Promise<RemoveAttendeeFrameState>;
}) {
  const t = useTranslations("stories.admin");
  const tf = useTranslations("stories.frame");
  const tm = useTranslations("photos.moderation");
  const toast = useToast();
  const [target, setTarget] = useState<AttendeeStoryFrame | null>(null);
  // ★ Every answer is SAID, never swallowed: «سُجّل القرار» when the database removed it (or had already), the
  // reason at its field when it is missing, and any other refusal — not_authorized, not_found, a failure — as an error
  // toast with the sheet left open, so a removal that did not write never looks like one that did. The toast fires
  // inside the action, never from an effect (SCR-051's `Decide`, the same rule).
  const [state, formAction] = useActionState(async (prev: RemoveAttendeeFrameState, form: FormData) => {
    const next = await removeAction(prev, form);
    if (next.outcome === "removed" || next.outcome === "already_removed") {
      setTarget(null);
      toast.show({ title: tm("done"), tone: "success" });
    } else if (next.outcome !== "reason_required") {
      const key = next.outcome === "not_authorized" || next.outcome === "not_found" ? next.outcome : "unknown";
      toast.show({ title: tm(`error.${key}`), tone: "error" });
    }
    return next;
  }, REMOVE_ATTENDEE_FRAME_INITIAL);
  const reasonError = state.outcome === "reason_required" && state.frameId === target?.id;

  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-label font-bold text-fg-muted">
        <bdi>{title}</bdi>
      </h2>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {frames.map((f) => {
          const kind = f.kind === "video" ? t("video", { length: length(f.durationMs) }) : t("photo");
          return (
            <li key={f.id} data-frame-id={f.id} className="relative flex h-[8.75rem] w-24 shrink-0 flex-col justify-between overflow-hidden rounded-tile bg-surface p-1.5">
              {f.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a signed URL
                <img src={f.thumbUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : null}
              <span className="relative self-start rounded-pill bg-chrome px-1.5 py-0.5 text-caption font-bold">
                <bdi>{kind}</bdi>
              </span>
              {f.state !== "visible" || f.hidden ? (
                <span className="relative self-start rounded-pill bg-chrome px-1.5 py-0.5 text-caption">
                  {f.state === "failed" ? tf("failed") : f.state === "processing" ? tf("processing") : t("hidden")}
                </span>
              ) : null}
              <span className="relative flex flex-col gap-1">
                <span className="truncate rounded-pill bg-chrome px-1.5 py-0.5 text-caption">
                  <bdi>{f.authorName ?? ""}</bdi>
                </span>
                <button
                  type="button"
                  onClick={() => setTarget(f)}
                  aria-label={`${t("remove")} — ${kind} — ${f.authorName ?? ""}`}
                  className="min-h-9 rounded-pill bg-chrome px-2 text-caption font-bold text-fg-heading hover:bg-hover"
                >
                  {t("remove")}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <Sheet open={target !== null} onOpenChange={(o) => (o ? null : setTarget(null))} title={t("remove")} side="inline-end">
        <form action={formAction} noValidate className="flex flex-col gap-4">
          <input type="hidden" name="frameId" value={target?.id ?? ""} />
          <Field id="story-remove-reason" label={t("removeReason")} required error={reasonError ? t("removeReason") : undefined}>
            <Textarea name="reason" rows={3} minLength={3} maxLength={300} />
          </Field>
          <SubmitButton>{t("remove")}</SubmitButton>
        </form>
      </Sheet>
    </section>
  );
}
