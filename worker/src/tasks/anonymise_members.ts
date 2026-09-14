import type { Task } from "graphile-worker";

// JOB-anonymise_members (11 §2.7, REQ-PRF-007, 12 §5.4). Nightly, key
// `anon:{date}`.
//
// ★ MEMBERS ARE ANONYMISED, NEVER DELETED, and no ledger row moves. The
// member's own id is already the pseudonymous key every ledger row carries, so
// org balances reconcile by construction rather than by a remapping step that
// could go wrong. Authored content stays and is attributed «عضو سابق» at the
// DAL, from `anonymised_at`.
//
// The period is a row in `public.retention_periods` (12 §5.3's twelve months),
// not a constant here. Idempotent: the sweep filters on `anonymised_at is
// null`, so a replay anonymises nobody twice.
export const anonymise_members: Task = async (_payload, helpers) => {
  const { rows } = await helpers.query<{ summary: { anonymised: number; after_days: number } }>(
    `select public.anonymise_members() as summary`,
  );
  const { anonymised, after_days } = rows[0].summary;
  helpers.logger.info(`anonymise_members: ${anonymised} member(s) anonymised after ${after_days} day(s)`);
};
