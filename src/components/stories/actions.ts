"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requestPhotoTakedown } from "@/lib/dal/photos";
import { setStoryReaction, type StoryReactionKind } from "@/lib/dal/reactions";
import {
  recordStoryViews,
  removeStoryFrame,
  reportStoryFrame,
  requestStoryFrameTakedown,
  type FrameReportOutcome,
} from "@/lib/dal/story-frames";
import type { RemoveAttendeeFrameState } from "@/components/stories/state";

// Session stories — the viewer's and the strip's small writes (REQ-STO-005, REQ-STO-010, REQ-STO-014, REQ-STO-015,
// REQ-STO-017). Uploads are Route Handlers (`src/app/api/stories/**`), never these. Server Actions dispatch one at a
// time per client, so the viewer's views are BATCHED by its caller, never fired in parallel.

export async function recordStoryViewsAction(locale: string, frameIds: string[]): Promise<void> {
  try {
    await recordStoryViews(locale, frameIds);
  } catch (e) {
    unstable_rethrow(e);
    // A view that fails to write is a ring that reads unseen once more — never an error in front of the member.
  }
}

export async function setStoryReactionAction(locale: string, frameId: string, kind: StoryReactionKind | null): Promise<{ mine: StoryReactionKind | null } | { error: string }> {
  try {
    return { mine: await setStoryReaction(locale, frameId, kind) };
  } catch (e) {
    unstable_rethrow(e);
    return { error: e instanceof Error ? e.message : "unknown_error" };
  }
}

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
