import type { ModerationError } from "@/lib/dal/admin-moderation";

// The two moderation screens' action state. A "use server" module exports async functions alone (DEC-159), so the
// type and the empty value live here.

export type ModerationState = { error: ModerationError | null; done: boolean };

export const emptyModerationState: ModerationState = { error: null, done: false };
