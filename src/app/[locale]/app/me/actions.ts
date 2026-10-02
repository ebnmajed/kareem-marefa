"use server";

import { revalidatePath } from "next/cache";
import type { Locale } from "@/i18n/routing";
import { interestsInput, profileInput, setMyInterests, updateMyProfile } from "@/lib/dal/members";
import { formStateFrom, was, withErrors, withFormError, zodErrors } from "@/lib/form-state";
import { PROFILE_FIELDS, type ProfileField, type ProfileState } from "./state";

// SCR-021's Server Action — REQ-PRF-001. Zod first (REQ-NFR-002), then the
// DAL: authority is not in the form — `updateMyProfile` writes the session's
// own row, and the column grant on `members` (0004) refuses anything beyond
// the five self-service fields regardless of what is sent.
//
// ★ `useActionState`, not the old redirect + `?saved=1`/`?error=1` query
// param. That shape's confirmation could be lost when a save was submitted
// before hydration landed (wave 6 sync 2, `docs/plan/notes/content.md`'s
// wave-7 plan §4 item 2) — nothing in a URL can race a value that comes back
// structurally in the action's own returned state.
//
// ★ wave 20 (SCR-021 rebuilt, DEC-218 §4.2): the interests travel with the profile — one «حفظ» for the whole edit
// mode — as repeated `interests` values (category ids). ★ PR B: the leaderboard opt-out is not sent — it lives on
// `/app/me/settings` (contract 5), and `updateMyProfile` leaves the column alone when it is absent. `setMyInterests()` writes the session's own rows only. Edit
// mode is `/app/me?edit`; a success returns `saved` and the client goes back to read mode.

function errorKey(field: ProfileField, code: string, empty: boolean): string {
  switch (field) {
    case "displayName":
      return empty ? "displayNameRequired" : code === "too_big" ? "displayNameTooLong" : "displayNameRequired";
    case "companyId":
      return "companyInvalid";
    case "jobTitle":
      return "jobTitleTooLong";
    case "bio":
      return "bioTooLong";
    default:
      return "failed";
  }
}

export async function saveProfile(locale: Locale, prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const captured = formStateFrom<ProfileField>(formData, { fields: PROFILE_FIELDS, previous: prev });
  const state: ProfileState = { ...captured, saved: false };

  const raw = {
    displayName: was(state, "displayName"),
    companyId: was(state, "companyId") || null,
    jobTitle: was(state, "jobTitle") || null,
    bio: was(state, "bio") || null,
  };

  const parsed = profileInput.safeParse(raw);
  // The member's text stays in the form — `formStateFrom` already captured it.
  if (!parsed.success) return { ...withErrors(state, zodErrors<ProfileField>(parsed.error, errorKey, raw)), saved: false };
  const interests = interestsInput.safeParse(formData.getAll("interests").filter((v): v is string => typeof v === "string"));
  if (!interests.success) return { ...withFormError(state, "failed"), saved: false };

  try {
    await updateMyProfile(locale, parsed.data);
    await setMyInterests(locale, interests.data);
  } catch {
    return { ...withFormError(state, "failed"), saved: false };
  }

  revalidatePath(`/${locale}/app/me`);
  return { ...state, errors: {}, formError: null, saved: true };
}
