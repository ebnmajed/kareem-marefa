import type { Task } from "graphile-worker";

// JOB-award_points (11 §2.3, 05 §2.2, REQ-PTS-012, STORY-PTS-001). Enqueued
// by check_in() (supabase/proposed/scoring/0002_award_points.sql, the
// TODO(scoring, M4) call site in migration 0015) and, once STORY-PTS-002
// lands, by triggers on `ratings`/`comments`/`photos`.
//
// public.award_points() (SECURITY DEFINER, service_role-only EXECUTE grant)
// does the actual work: applies the rule's cap and cooldown, then inserts
// with `on conflict do nothing`. A replay of this job — a retried job, a
// duplicated enqueue with the same key — writes zero rows, because the
// idempotency key is deterministic from (rule, source, source_id, member).
// The member's own action already committed before this job was even
// enqueued; nothing here can be on that critical path.
interface AwardPointsPayload {
  rule: string;
  member_id: string;
  source: string;
  source_id: string;
  session_id?: string | null;
}

function isAwardPointsPayload(p: unknown): p is AwardPointsPayload {
  const v = p as Partial<AwardPointsPayload> | null;
  return !!v && typeof v.rule === "string" && typeof v.member_id === "string" && typeof v.source === "string" && typeof v.source_id === "string";
}

export const award_points: Task = async (payload, helpers) => {
  if (!isAwardPointsPayload(payload)) {
    throw new Error(`award_points: malformed payload ${JSON.stringify(payload)}`);
  }
  const { rule, member_id, source, source_id, session_id } = payload;
  await helpers.query(`select public.award_points($1, $2, $3, $4, $5)`, [rule, member_id, source, source_id, session_id ?? null]);
  helpers.logger.info(`award_points: ${rule} for member ${member_id} (source ${source}:${source_id})`);
};
