"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requestPhotoTakedown } from "@/lib/dal/photos";
import {
  removeStoryFrame,
  reportStoryFrame,
  requestStoryFrameTakedown,
  type FrameReportOutcome,
} from "@/lib/dal/story-frames";
import type { RemoveAttendeeFrameState } from "@/components/stories/state";

// ★ DEC-290: a reaction is not written here any more — it goes through `POST /api/reactions` beside these, so it
// never waits behind the views' flush.
// Session stories — the viewer's and the strip's small writes (REQ-STO-014, REQ-STO-015, REQ-STO-017). Uploads are
// Route Handlers (`src/app/api/stories/**`), never these. ★ A view is not written here any more (DEC-297, REQ-VEW-006):
// it goes through the page's view tracker to `POST /api/views`.

export async function reportStoryFrameAction(locale: string, frameId: string, reason: string): Promise<{ outcome: FrameReportOutcome } | { error: string }> {
  try {
    return { outcome: await reportStoryFrame(locale, frameId, reason) };
  } catch (e) {
    unstable_rethrow(e);
    return { error: e instanceof Error ? e.message : "unknown_error" };
  }
}

/** «أزلني» — a photo frame is the photograph's own takedown (it hides both, DEC-251 §4.8); a video frame its own. */
export async function removeMeFromFrameAction(
  locale: string,
  frame: { id: string; kind: "photo" | "video"; photoId?: string; sessionId: string },
): Promise<{ done: true } | { error: string }> {
  try {
    if (frame.kind === "photo" && frame.photoId) await requestPhotoTakedown(locale, frame.photoId);
    else {
      const outcome = await requestStoryFrameTakedown(locale, frame.id);
      if (outcome !== "hidden" && outcome !== "already_requested") return { error: outcome };
    }
    revalidatePath(`/${locale}/app/sessions/${frame.sessionId}`);
    return { done: true };
  } catch (e) {
    unstable_rethrow(e);
    return { error: e instanceof Error ? e.message : "unknown_error" };
  }
}

/** SCR-044's «أزل», from a sheet with its reason (REQ-EVT-014, REQ-STO-017). Bound to the locale and the session. */
export async function removeAttendeeFrameAction(locale: string, sessionId: string, _prev: RemoveAttendeeFrameState, form: FormData): Promise<RemoveAttendeeFrameState> {
  const frameId = String(form.get("frameId") ?? "");
  const reason = String(form.get("reason") ?? "");
  try {
    const outcome = await removeStoryFrame(locale, frameId, reason);
    if (outcome === "removed") revalidatePath(`/${locale}/app/admin/sessions/${sessionId}/attendance`);
    return { outcome, frameId };
  } catch (e) {
    unstable_rethrow(e);
    return { outcome: "error", frameId };
  }
}
