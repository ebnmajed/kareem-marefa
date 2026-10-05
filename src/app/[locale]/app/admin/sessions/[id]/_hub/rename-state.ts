// The rename's round trip — REQ-SES-021, DEC-255. Here and not in `actions.ts`, which is "use server" and may export
// async functions alone.
export type RenameState = {
  /** `tooShort` / `tooLong` at the field; `locked` is the database's guard (published since the dialog opened). */
  error: "tooShort" | "tooLong" | "locked" | "failed" | null;
  /** The title the database saved — the server's answer, never the input. */
  saved: string | null;
  /** The name as typed, handed back so a refusal keeps the admin's words (React resets the form). */
  title: string;
};

export const emptyRenameState: RenameState = { error: null, saved: null, title: "" };
