// The lifecycle action's round trip. Here and not in `actions.ts`, which is "use server" and may export async
// functions alone.
export type LifecycleState = {
  error: "failed" | "reasonRequired" | null;
  done: "published" | "cancelled" | null;
  /** The reason as typed, handed back so a refused cancellation keeps the admin's words (React resets the form). */
  reason: string;
};

export const emptyLifecycleState: LifecycleState = { error: null, done: null, reason: "" };
