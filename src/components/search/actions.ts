"use server";

import { revalidatePath } from "next/cache";
import { toggleBookmark } from "@/lib/dal/bookmarks";

// REQ-DSC-006 — a small, non-upload mutation, so a Server Action (not a
// Route Handler), matching every other track's own actions.ts.

export async function toggleBookmarkAction(locale: string, sessionId: string, bookmarked: boolean): Promise<{ error: string | null }> {
  try {
    await toggleBookmark(locale, { sessionId, bookmarked });
    revalidatePath(`/${locale}/app/me/bookmarks`);
    revalidatePath(`/${locale}/app/sessions/${sessionId}`);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unknown_error" };
  }
}
