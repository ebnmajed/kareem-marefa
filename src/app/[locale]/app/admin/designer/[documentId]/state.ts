// SCR-057's action state. A "use server" module may export async functions
// and nothing else, so the shape and its initial value live here.

export type ExportActionStatus = "idle" | "queued" | "retried" | "not_authorized" | "invalid";

/** `at` changes on every answer, so the same status twice is still news to
 *  the component that toasts it. */
export interface ExportActionState {
  status: ExportActionStatus;
  at: number;
}

export const initialExportActionState: ExportActionState = { status: "idle", at: 0 };
