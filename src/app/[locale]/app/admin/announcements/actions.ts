"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { savedState } from "@/components/admin/saved-form-state";
import { ANNOUNCEMENT_MAX, atZone } from "@/components/announcements/rules";
import type { Locale } from "@/i18n/routing";
import { announcementTimeZone, createAnnouncement, deleteAnnouncement, updateAnnouncement } from "@/lib/dal/announcements";
import { formStateFrom, was, withErrors, withFormError } from "@/lib/form-state";
import { ANNOUNCEMENT_FIELDS, type AnnouncementField, type AnnouncementState } from "./state";

// /app/admin/announcements' Server Actions — REQ-ADM-025, DEC-267. Zod first (the DAL's `announcementInput`), then the
// DAL; who may write is 0164's policies. The form's wall clock is read in the org's zone. ★ Every action answers with
// what it WROTE (`DEC-232` §3.1).

const PATH = (locale: Locale) => `/${locale}/app/admin/announcements`;
/** A minute's grace: «الآن» picked a moment ago is not «a time that has passed». */
const GRACE_MS = 60_000;

/** Create (`announcementId` null) or edit. */
export async function saveAnnouncement(locale: Locale, announcementId: string | null, prev: AnnouncementState, formData: FormData): Promise<AnnouncementState> {
  const captured = formStateFrom<AnnouncementField>(formData, { fields: ANNOUNCEMENT_FIELDS, previous: prev });
  const creating = announcementId === null;
  const errors: Partial<Record<AnnouncementField, string>> = {};
  const now = Date.now();

  const body = was(captured, "body").trim();
  if (!body) errors.body = "bodyRequired";
  else if (body.length > ANNOUNCEMENT_MAX) errors.body = "bodyTooLong";

  const timeZone = await announcementTimeZone(locale);
  const at = was(captured, "publish") === "at";
  const publishLocal = was(captured, "publishAt");
  const publishAt = at ? atZone(publishLocal, timeZone) : null;
  if (at && publishAt === null) errors.publishAt = "publishAtRequired";
  else if (creating && publishAt !== null && new Date(publishAt).getTime() < now - GRACE_MS) errors.publishAt = "publishAtPast";

  const expiresLocal = was(captured, "expiresAt");
  const expiresAt = expiresLocal ? atZone(expiresLocal, timeZone) : null;
  if (expiresAt !== null && !errors.publishAt) {
    const from = publishAt ? new Date(publishAt).getTime() : now;
    if (new Date(expiresAt).getTime() <= from) errors.expiresAt = "expiresBeforePublish";
    else if (creating && new Date(expiresAt).getTime() <= now) errors.expiresAt = "expiresPast";
  }

  if (Object.keys(errors).length > 0) return { ...withErrors(captured, errors), saved: false };

  const input = { body, publishAt, expiresAt };
  const result = creating ? await createAnnouncement(locale, input) : await updateAnnouncement(locale, announcementId, input);
  if (!result.ok) return { ...withFormError(captured, "failed"), saved: false };
  revalidatePath(PATH(locale));
  revalidatePath(`/${locale}/app`);
  return savedState<AnnouncementField>();
}

export async function deleteAnnouncementAction(locale: Locale, announcementId: string): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(announcementId).success) return { ok: false };
  const result = await deleteAnnouncement(locale, announcementId);
  if (result.ok) {
    revalidatePath(PATH(locale));
    revalidatePath(`/${locale}/app`);
  }
  return result;
}
