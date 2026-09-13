"use server";

import { redirect } from "next/navigation";
import { submitRating, submitRatingInput, updateRating, updateRatingInput } from "@/lib/dal/ratings";

// SCR-015's Server Actions. Zod first (REQ-NFR-002), then the DAL — the
// `with check` on `ratings_write_self` (0010) is the real authority
// boundary (someone else's check-in id, a non-completed session, an
// org mismatch all fail there regardless of what this validates).

export type RateFormState = {
  error: string | null;
  /**
   * What the member typed in the comment box, handed straight back.
   *
   * ★ React 19 resets a `<form action={…}>` once the action resolves, so an
   * uncontrolled textarea comes back to its ORIGINAL defaultValue on a
   * failure — a stale-window or already-rated race would silently discard
   * whatever the member had just written. `null` means "no submission
   * attempted yet"; the field falls back to the existing rating's comment
   * (or empty) only in that case. tests/e2e/event-comments.spec.ts's
   * sibling for this form is the reason it's tested at all — the same bug
   * sessions found on the propose form (26772e2) applied here too.
   */
  comment: string | null;
};

function readStars(formData: FormData, field: string): number {
  return Number(formData.get(field));
}

function readComment(formData: FormData): string {
  return formData.get("comment")?.toString() ?? "";
}

export async function submitRatingAction(
  locale: string,
  sessionId: string,
  checkInId: string,
  _prev: RateFormState,
  formData: FormData,
): Promise<RateFormState> {
  const comment = readComment(formData);
  const parsed = submitRatingInput.safeParse({
    sessionId,
    checkInId,
    sessionStars: readStars(formData, "sessionStars"),
    presenterStars: readStars(formData, "presenterStars"),
    comment: comment.trim() || null,
  });
  if (!parsed.success) return { error: "generic", comment };
  try {
    await submitRating(locale, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "generic", comment };
  }
  redirect(`/${locale}/app/sessions/${sessionId}?rated=1`);
}

export async function updateRatingAction(locale: string, ratingId: string, sessionId: string, _prev: RateFormState, formData: FormData): Promise<RateFormState> {
  const comment = readComment(formData);
  const parsed = updateRatingInput.safeParse({
    ratingId,
    sessionStars: readStars(formData, "sessionStars"),
    presenterStars: readStars(formData, "presenterStars"),
    comment: comment.trim() || null,
  });
  if (!parsed.success) return { error: "generic", comment };
  try {
    await updateRating(locale, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "generic", comment };
  }
  redirect(`/${locale}/app/sessions/${sessionId}?rated=1`);
}
