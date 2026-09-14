"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/event/star-rating";
import type { RatingDTO } from "@/lib/dal/ratings";
import { submitRatingAction, updateRatingAction } from "./actions";
import { emptyRateFormState } from "./state";

// SCR-015's form. ★ Both stars are required before submit is enabled — a
// zero-star rating is not "no opinion", it is invalid input (REQ-RAT-002).
export function RateForm({ locale, sessionId, checkInId, existing }: { locale: string; sessionId: string; checkInId: string; existing: RatingDTO | null }) {
  const t = useTranslations("ratings.form");
  const tErrors = useTranslations("ratings.errors");
  const [sessionStars, setSessionStars] = useState(existing?.sessionStars ?? 0);
  const [presenterStars, setPresenterStars] = useState(existing?.presenterStars ?? 0);

  const action = existing ? updateRatingAction.bind(null, locale, existing.id, sessionId) : submitRatingAction.bind(null, locale, sessionId, checkInId);
  const [state, formAction, pending] = useActionState(action, emptyRateFormState);

  return (
    <form action={formAction} className="max-w-md">
      <div>
        <span className="text-label text-fg-heading">{t("sessionLabel")}</span>
        <div className="mt-2">
          <StarRating label={t("sessionStarsLabel")} name="sessionStars" value={sessionStars} onChange={setSessionStars} disabled={pending} />
        </div>
      </div>

      <div className="mt-5">
        <span className="text-label text-fg-heading">{t("presenterLabel")}</span>
        <div className="mt-2">
          <StarRating label={t("presenterStarsLabel")} name="presenterStars" value={presenterStars} onChange={setPresenterStars} disabled={pending} />
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor="comment" className="text-label text-fg-heading">
          {t("commentLabel")}
        </label>
        <p className="mt-1 text-body-sm text-fg-muted">{t("commentHint")}</p>
        <textarea
          id="comment"
          name="comment"
          // ★ React 19 resets this form once the action resolves — reading
          // from `state.comment` (populated on every failed submission) is
          // what makes the reset restore what was typed instead of the
          // rating's ORIGINAL comment. `null` (no submission attempted yet)
          // is the only case that falls back to `existing`.
          defaultValue={state.comment ?? existing?.comment ?? ""}
          maxLength={2000}
          rows={4}
          className="mt-2 w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading"
        />
      </div>

      {state.error ? <p className="mt-3 text-body-sm text-fg-heading">{tErrors(state.error)}</p> : null}

      <Button type="submit" disabled={pending || sessionStars === 0 || presenterStars === 0} className="mt-5 h-12 px-8">
        {existing ? t("update") : t("submit")}
      </Button>
    </form>
  );
}
