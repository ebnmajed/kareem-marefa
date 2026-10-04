import type { Task } from "graphile-worker";
import { storyFramePrefix } from "@kareem/storage-paths";
import { deleteObject, listObjects } from "../content/storage.js";

// JOB-purge_story_video (REQ-STO-016, REQ-STO-017, DEC-251 §4.10). Enqueued by `story_frames_purge()`
// (supabase/proposed/content/0004, attached by 0198) when a video frame is deleted — its session's or its org's
// cascade — or removed by staff. Key `story_purge:{frame_id}`.
//
// Deletes every object under the frame's prefix: the source if a transcode never finished, the rendition and the
// poster. The prefix comes from the one builder, so a payload can never name another frame's — or another org's —
// objects. Idempotent: a second run lists nothing and deletes nothing. A video earned nothing, so there is no ledger
// row to reverse here; a photo frame never reaches this task (its objects follow the album's rule, DEC-251 §4.9).

interface Payload {
  frame_id: string;
  org_id: string;
  session_id: string;
}

function isPayload(p: unknown): p is Payload {
  const v = p as Partial<Payload> | null;
  return !!v && typeof v.frame_id === "string" && typeof v.org_id === "string" && typeof v.session_id === "string";
}

export const purge_story_video: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error(`purge_story_video: malformed payload ${JSON.stringify(payload)}`);
  const prefix = storyFramePrefix(payload.org_id, payload.session_id, payload.frame_id);
  const paths = await listObjects("story-media", prefix, 1);
  for (const path of paths) await deleteObject("story-media", path);
  helpers.logger.info(`purge_story_video: ${payload.frame_id} — ${paths.length} object(s) deleted`);
};
