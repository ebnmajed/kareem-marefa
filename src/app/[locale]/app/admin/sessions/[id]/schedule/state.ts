import type { ScheduleState } from "./actions";

// A "use server" module may export async functions and nothing else.
export const emptyScheduleState: ScheduleState = { error: null, saved: false, published: false };
