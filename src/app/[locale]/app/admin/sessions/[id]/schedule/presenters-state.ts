import type { PresenterChangeError } from "@/lib/dal/sessions";

// The add form's round trip (REQ-SES-019). Here and not in `actions.ts`, which
// is "use server" and may export async functions alone.

export type AddPresenterState =
  | { status: "idle" }
  | { status: "added"; memberId: string }
  /** `pick` — nobody was chosen; `failed` — a fault the RPC did not name. */
  | { status: "refused"; error: PresenterChangeError | "pick" | "failed"; memberId: string | null };

export const initialAddPresenterState: AddPresenterState = { status: "idle" };
