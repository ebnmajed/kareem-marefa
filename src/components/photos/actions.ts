"use server";

import { revalidatePath } from "next/cache";
import { requestPhotoTakedown, rescopePhoto, restorePhoto } from "@/lib/dal/photos";

// REQ-EVT-012 — the two staff-facing/member-facing mutations the gallery
// needs that aren't the upload flow (uploads are Route Handlers, never
// Server Actions — CLAUDE.md, "no route, action or job may build a storage
// path any other way" applies just as much to which door a WRITE takes:
// uploads are large bytes, these are not, so a Server Action is the right
// shape here). `revalidatePath` (not `router.refresh()`) since these are
// invoked from a plain `<form action={...}>`, one per photo card, matching
// `src/components/materials/actions.ts`'s own shape.

export async function requestPhotoTakedownAction(locale: string, sessionId: string, photoId: string): Promise<{ error: string | null }> {
  try {
    await requestPhotoTakedown(locale, photoId);
    revalidatePath(`/${locale}/app/sessions/${sessionId}`);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unknown_error" };
  }
}

export async function restorePhotoAction(locale: string, sessionId: string, photoId: string): Promise<{ error: string | null }> {
  try {
    await restorePhoto(locale, photoId);
    revalidatePath(`/${locale}/app/sessions/${sessionId}`);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unknown_error" };
  }
}

// REQ-SES-018/DEC-121 — the scope chip, staff alone.
export async function rescopePhotoAction(locale: string, sessionId: string, photoId: string, sessionDayId: string | null): Promise<{ error: string | null }> {
  try {
    await rescopePhoto(locale, { photoId, sessionDayId });
    revalidatePath(`/${locale}/app/sessions/${sessionId}`);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unknown_error" };
  }
}
