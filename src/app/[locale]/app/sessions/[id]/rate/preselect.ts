import { z } from "zod";

// The after-session mail's «قيّم الجلسة 1 … 5» links land here as `?stars=N` (`DEC-289`, the owner's ruling on
// PR #115, REQ-RAT-001, REQ-UIX-066).
//
// ★ A PRE-SELECTION, NEVER A RATING. A GET link writes nothing: the number only fills the session's stars, and the
// member still submits the form, which is where `ratings_write_self` decides. It is ignored — the form opens as it
// always did — unless the window is open and there is no rating yet: a link must never overwrite a rating the member
// already made, nor reopen a closed window (REQ-RAT-003).

const Stars = z.coerce.number().int().min(1).max(5);

export function preselectStars(raw: string | string[] | undefined, eligibility: { eligible: boolean; existing: unknown | null }): 1 | 2 | 3 | 4 | 5 | null {
  if (!eligibility.eligible || eligibility.existing) return null;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const parsed = Stars.safeParse(raw);
  return parsed.success ? (parsed.data as 1 | 2 | 3 | 4 | 5) : null;
}
