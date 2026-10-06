// The delete's round trip — REQ-SES-023, 0215. One shape for SCR-042's row, its selection and the hub's header.
// `deleted` and `failed` are ids; the screen names a failed id by the title it already holds. `attempt` changes on
// every answer, so the dialog closes on any of them.
export type DeleteError = "refused" | "notFound" | "tooMany" | "invalid" | "failed";

export type DeleteState = {
  error: DeleteError | null;
  deleted: string[];
  failed: string[];
  pointsReversed: number;
  certificatesRevoked: number;
  attempt: number;
};

export const emptyDeleteState: DeleteState = { error: null, deleted: [], failed: [], pointsReversed: 0, certificatesRevoked: 0, attempt: 0 };
