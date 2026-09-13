"use server";

import { redirect } from "next/navigation";
import { submitRating, submitRatingInput, updateRating, updateRatingInput } from "@/lib/dal/ratings";

// SCR-015's Server Actions. Zod first (REQ-NFR-002), then the DAL — the
// `with check` on `ratings_write_self` (0010) is the real authority
// boundary (someone else's check-in id, a non-completed session, an
// org mismatch all fail there regardless of what this validates).

export type RateFormState = { error: string | null };

function readStars(formData: FormData, field: string): number {
  return Number(formData.get(field));
}

export async function submitRatingAction(
  locale: string,
  sessionId: string,
  checkInId: string,
  _prev: RateFormState,
  formData: FormData,
): Promise<RateFormState> {
  const parsed = submitRatingInput.safeParse({
    sessionId,
    checkInId,
    sessionStars: readStars(formData, "sessionStars"),
    presenterStars: readStars(formData, "presenterStars"),
    comment: formData.get("comment")?.toString().trim() || null,
  });
  if (!parsed.success) return { error: "generic" };
  try {
    await submitRating(locale, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "generic" };
  }
  redirect(`/${locale}/app/sessions/${sessionId}?rated=1`);
}

export async function updateRatingAction(locale: string, ratingId: string, sessionId: string, _prev: RateFormState, formData: FormData): Promise<RateFormState> {
  const parsed = updateRatingInput.safeParse({
    ratingId,
    sessionStars: readStars(formData, "sessionStars"),
    presenterStars: readStars(formData, "presenterStars"),
    comment: formData.get("comment")?.toString().trim() || null,
  });
  if (!parsed.success) return { error: "generic" };
  try {
    await updateRating(locale, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "generic" };
  }
  redirect(`/${locale}/app/sessions/${sessionId}?rated=1`);
}
