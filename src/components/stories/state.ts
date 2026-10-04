import type { RemoveFrameOutcome } from "@/lib/dal/story-frames";

// The strip's form state — a plain module, because a "use server" file exports async functions alone.
export interface RemoveAttendeeFrameState {
  outcome: RemoveFrameOutcome | "error" | null;
  frameId: string | null;
}

export const REMOVE_ATTENDEE_FRAME_INITIAL: RemoveAttendeeFrameState = { outcome: null, frameId: null };
