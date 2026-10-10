"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import { AVATAR_KEYS } from "@/lib/avatar-library";
import { getAvatarSheet, pickAvatarKey, removeAvatarPhoto, requestAvatarGoogle, type AvatarSheet, type AvatarWriteResult } from "@/lib/dal/avatars";
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
//
// ★ wave 27 (`DEC-254` §2.5, `REQ-PRF-012`): no company. It follows the member's email domain or an admin's placement;
// `profileInput` is strict, so a crafted `companyId` is refused here, and the column leaves the member's grant after.

function errorKey(field: ProfileField, code: string, empty: boolean): string {
  switch (field) {
    case "displayName":
      return empty ? "displayNameRequired" : code === "too_big" ? "displayNameTooLong" : "displayNameRequired";
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
  } catch (e) {
    unstable_rethrow(e);
    return { ...withFormError(state, "failed"), saved: false };
  }

  revalidatePath(`/${locale}/app/me`);
  return { ...state, errors: {}, formError: null, saved: true };
}

// ★ Wave 29 — the sheet «صورتك»'s «حفظ» (REQ-PRF-016, REQ-PRF-018, REQ-PRF-019, DEC-280 §2, DEC-281). Zod first; the
// write is `platform`'s (contract 3), one RPC and one transaction, the member re-derived from the session. A removal
// keeps the held key and declines Google (`removeAvatarPhoto`); «من Google» answers `ok` while the copy is made. An
// upload is not here: it is a Route Handler, for the 1 MB body cap.
const pictureChoice = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("library"), key: z.enum(AVATAR_KEYS) }),
  z.object({ kind: z.literal("remove") }),
  z.object({ kind: z.literal("google") }),
]);

export async function savePicture(locale: Locale, choice: unknown): Promise<AvatarWriteResult> {
  const parsed = pictureChoice.safeParse(choice);
  if (!parsed.success) return { status: "failed" };
  let result: AvatarWriteResult;
  try {
    const c = parsed.data;
    result = c.kind === "library" ? await pickAvatarKey(locale, c.key) : c.kind === "remove" ? await removeAvatarPhoto(locale) : await requestAvatarGoogle(locale);
  } catch (e) {
    unstable_rethrow(e);
    return { status: "failed" };
  }
  // The shell's account avatar, the standing and every hub page reread the picture.
  if (result.status === "ok") revalidatePath(`/${locale}/app`, "layout");
  return result;
}

/** The sheet's state, re-read after «من Google» to learn when the copy lands. */
export async function readPicture(locale: Locale): Promise<AvatarSheet> {
  return getAvatarSheet(locale);
}
