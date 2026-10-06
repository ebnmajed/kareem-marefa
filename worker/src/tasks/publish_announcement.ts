import type { Task } from "graphile-worker";

// JOB-publish_announcement — REQ-ADM-025, DEC-267. Key: `announce:{announcement_id}`, queued by
// `feed_announcements_schedule()` (0213) at the announcement's time.
//
// The decision is the definer function's: it sends once, only while the announcement is live, and answers what it did.
// A job that runs early — the time was moved later — finds `early` and ends; the trigger has already queued one for the
// new time under the same key.

interface Payload {
  announcement_id: string;
}

function isPayload(value: unknown): value is Payload {
  return typeof value === "object" && value !== null && typeof (value as Payload).announcement_id === "string";
}

export const publish_announcement: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error("publish_announcement: payload needs announcement_id");
  const { rows } = await helpers.query<{ outcome: string }>(`select public.publish_announcement($1) as outcome`, [payload.announcement_id]);
  helpers.logger.info(`publish_announcement: ${payload.announcement_id} → ${rows[0]?.outcome ?? "no answer"}`);
};
