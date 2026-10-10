import type { Task } from "graphile-worker";
import { avatarMemberPrefix, avatarPath, avatarStagingPath } from "@kareem/storage-paths";
import { downloadObject, StorageError, uploadObject } from "../content/storage.js";
import { AvatarRefused, inspectSource, renderDerivatives, AVATAR_DERIVATIVE_SIZES, type ToolRunner } from "../platform/avatar.js";
import { deleteObjects, listObjects } from "../platform/storage.js";

// JOB-process_avatar_upload (11 §2, wave 29; REQ-PRF-010, REQ-PRF-017; DEC-280 §2, DEC-281). Key
// `avatar-upload:{member_id}` · queue `avatar:{member_id}` · 5 attempts — enqueued only by `begin_avatar_upload()`.
//
// ★ ONE RECONCILE, like `import_avatar`. The payload names the member, never the file: the job reads the member's
// `avatar_uploads` row as it stands NOW, so a second upload that replaced the job before it ran loses nothing, and an
// upload a pick or a removal cancelled is simply not processed.
//
//   · anonymised or gone        → empty the member's `avatars` and `avatar-staging` prefixes;
//   · no pending upload         → empty the staging prefix (cancelled, done, or orphaned by a failed RPC);
//   · pending                   → download the staged bytes, SNIFF THEM ON CONTENT (an SVG renamed `.png` answers
//                                 its true kind here, after the bytes landed — REQ-PRF-017), strip EXIF and prove it
//                                 gone, derive 96 and 192 px WebP with `cwebp` (no npm image package, DEC-181), upload
//                                 them under a NEW version, record it — and only then delete every other version: the
//                                 previous upload OR Google copy (AVA-08). Then the staged file.
//
// ★ A REFUSAL NEVER MOVES A VERSION. `refused` (not PNG or JPEG — «PNG أو JPG فقط») and `failed` («تعذّر الرفع») are
// written to the row for the sheet's poll; the ring keeps whatever the member had. On the LAST attempt a transient
// error is recorded as `failed` too, so the sheet never polls a pending row for ever.

interface Target {
  org_id: string;
  version: number | string | null;
  anonymised: boolean;
  upload: { id: string; state: "pending" | "done" | "refused" | "failed" | "cancelled" } | null;
}

export interface ProcessAvatarUploadDeps {
  run?: ToolRunner;
  now?: () => number;
  download?: typeof downloadObject;
  upload?: typeof uploadObject;
  list?: typeof listObjects;
  remove?: typeof deleteObjects;
}

const AVATARS = "avatars";
const STAGING = "avatar-staging";

/** `kind_*` and `malformed` are «not a PNG or a JPEG» to the member; every other refusal is «تعذّر الرفع». */
export function refusalState(reason: string): "refused" | "failed" {
  return reason.startsWith("kind_") || reason === "malformed" ? "refused" : "failed";
}

/** Storage answers a missing object with 404, or with 400 and «not found» in the body. */
function isMissing(error: unknown): boolean {
  return error instanceof StorageError && (error.status === 404 || /not.?found/i.test(error.body));
}

export function makeProcessAvatarUpload(deps: ProcessAvatarUploadDeps = {}): Task {
  const download = deps.download ?? downloadObject;
  const upload = deps.upload ?? uploadObject;
  const list = deps.list ?? listObjects;
  const remove = deps.remove ?? deleteObjects;
  const now = deps.now ?? Date.now;

  return async (payload, helpers) => {
    const { member_id } = payload as { member_id?: string };
    if (!member_id) {
      helpers.logger.error("process_avatar_upload: payload is missing member_id");
      return;
    }

    const { rows } = await helpers.query<{ target: Target | null }>(`select public.avatar_job_target($1) as target`, [member_id]);
    const target = rows[0]?.target ?? null;
    if (!target) {
      helpers.logger.warn(`process_avatar_upload: member ${member_id} no longer exists — nothing to process`);
      return;
    }

    // The same three segments name a member's objects in both buckets (packages/storage-paths/src/avatar.ts).
    const prefix = avatarMemberPrefix(target.org_id, member_id);
    const current = target.version === null ? null : String(target.version);
    const purgeStaging = async () => remove(STAGING, await list(STAGING, prefix));
    const purgeAvatars = async (keep: string | null) => {
      const paths = await list(AVATARS, prefix);
      return remove(AVATARS, keep ? paths.filter((p) => !p.startsWith(`${prefix}/${keep}/`)) : paths);
    };

    if (target.anonymised) {
      const removed = await purgeAvatars(null);
      const staged = await purgeStaging();
      helpers.logger.info(`process_avatar_upload: ${member_id} anonymised — removed ${removed} object(s) and ${staged} staged`);
      return;
    }
    const pending = target.upload?.state === "pending" ? target.upload.id : null;
    if (!pending) {
      const staged = await purgeStaging();
      helpers.logger.info(`process_avatar_upload: ${member_id} has no pending upload (${target.upload?.state ?? "none"}) — removed ${staged} staged`);
      return;
    }

    const fail = async (state: "refused" | "failed", why: string) => {
      await helpers.query(`select public.fail_avatar_upload($1, $2, $3::public.avatar_upload_state) as result`, [member_id, pending, state]);
      const staged = await purgeStaging();
      helpers.logger.warn(`process_avatar_upload: ${member_id} upload ${pending} ${state} (${why}); ${current ? "the previous photo stays" : "the library avatar stays"}; removed ${staged} staged`);
    };

    try {
      const staged = avatarStagingPath(target.org_id, member_id, pending);
      let bytes: Uint8Array;
      try {
        bytes = await download(staged.bucket, staged.path);
      } catch (error) {
        if (isMissing(error)) return await fail("failed", "staged_missing");
        throw error;
      }

      let derivatives;
      try {
        const inspected = inspectSource(bytes);
        helpers.logger.info(`process_avatar_upload: ${member_id} upload ${inspected.kind} ${inspected.width}x${inspected.height}, ${inspected.bytes.byteLength} bytes`);
        derivatives = await renderDerivatives(inspected, deps.run);
      } catch (error) {
        // Permanent: a retry would refuse the same bytes the same way.
        if (error instanceof AvatarRefused) return await fail(refusalState(error.reason), error.reason);
        throw error;
      }

      // Epoch milliseconds, and always past the current photo's, so a version never repeats.
      const version = String(Math.max(now(), current ? Number(current) + 1 : 0));
      for (const size of AVATAR_DERIVATIVE_SIZES) {
        const location = avatarPath(target.org_id, member_id, version, size);
        await upload(location.bucket, location.path, derivatives[size], "image/webp");
      }

      const { rows: recorded } = await helpers.query<{ result: { status: "recorded" | "stale"; version: number | string | null } }>(
        `select public.record_avatar_upload($1, $2, $3::bigint) as result`,
        [member_id, pending, version],
      );
      const result = recorded[0]?.result;
      const keep = result?.status === "recorded" ? version : result?.version === null || result?.version === undefined ? null : String(result.version);
      const removed = await purgeAvatars(keep);
      const cleared = await purgeStaging();
      helpers.logger.info(
        result?.status === "recorded"
          ? `process_avatar_upload: ${member_id} recorded version ${version}; removed ${removed} older object(s) and ${cleared} staged`
          : `process_avatar_upload: ${member_id} changed while processing — discarded version ${version}; removed ${removed} object(s) and ${cleared} staged`,
      );
    } catch (error) {
      // Transient (Storage, a binary, the database): retried — but the last attempt tells the sheet.
      if (helpers.job && helpers.job.attempts >= helpers.job.max_attempts) {
        await fail("failed", `last attempt: ${(error as Error).message}`).catch(() => undefined);
      }
      throw error;
    }
  };
}

export const process_avatar_upload: Task = makeProcessAvatarUpload();
