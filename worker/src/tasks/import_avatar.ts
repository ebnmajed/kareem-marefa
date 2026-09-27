import type { Task } from "graphile-worker";
import { avatarMemberPrefix, avatarPath } from "@kareem/storage-paths";
import { uploadObject } from "../content/storage.js";
import { AvatarRefused, fetchSource, inspectSource, renderDerivatives, AVATAR_DERIVATIVE_SIZES, type Fetcher, type ToolRunner } from "../platform/avatar.js";
import { deleteObjects, listObjects } from "../platform/storage.js";

// JOB-import_avatar (11 §2.4, the thirty-sixth job; REQ-PRF-008's import half,
// REQ-PRF-010, REQ-PRF-011; DEC-099, DEC-180 §3, DEC-182). Key
// `avatar:{member_id}` · queue `convert` · 3 × 60 s.
//
// ★ ONE RECONCILE JOB. Whatever enqueued it — a «نعم», a «لا», a sign-in that
// changed Google's source, an anonymisation, a retry — it makes storage match
// the row as the row stands NOW, which is why the key's `replace` mode is
// exactly right: a job replaced before it ran loses nothing.
//
//   · anonymised, gone or not `accepted` → delete every object under the
//     member's prefix (REQ-PRF-011: «no storage object remains»);
//   · `accepted` with a source → fetch, sniff, strip, derive, upload under a
//     NEW version, record it — and only then delete every other version.
//
// ★ A FAILURE NEVER SETS A VERSION, so it leaves the initials or the copy the
// member already had — never a broken frame. `record_avatar_copy()` sets the
// version only if the member still said yes to THIS source; if they changed
// their mind or signed in with a new photo while this ran, it answers `stale`
// and what was just uploaded is deleted (a newer job is already queued).
//
// `members.avatar_url` is Google's source. It is read here — through
// `avatar_job_target()`, the one definer door (CLAUDE.md § Data access 6) —
// and nowhere a browser can see.

interface Target {
  org_id: string;
  answer: "accepted" | "declined" | null;
  source_url: string | null;
  version: number | string | null;
  anonymised: boolean;
}

export interface ImportAvatarDeps {
  fetcher?: Fetcher;
  run?: ToolRunner;
  now?: () => number;
  upload?: typeof uploadObject;
  list?: typeof listObjects;
  remove?: typeof deleteObjects;
}

const BUCKET = "avatars";

export function makeImportAvatar(deps: ImportAvatarDeps = {}): Task {
  const upload = deps.upload ?? uploadObject;
  const list = deps.list ?? listObjects;
  const remove = deps.remove ?? deleteObjects;
  const now = deps.now ?? Date.now;

  /** Deletes every object under the member's prefix except the `keep` version's. */
  async function purge(prefix: string, keep: string | null): Promise<number> {
    const paths = await list(BUCKET, prefix);
    const doomed = keep ? paths.filter((p) => !p.startsWith(`${prefix}/${keep}/`)) : paths;
    return remove(BUCKET, doomed);
  }

  return async (payload, helpers) => {
    const { member_id } = payload as { member_id?: string };
    if (!member_id) {
      helpers.logger.error("import_avatar: payload is missing member_id");
      return;
    }

    const { rows } = await helpers.query<{ target: Target | null }>(`select public.avatar_job_target($1) as target`, [member_id]);
    const target = rows[0]?.target ?? null;
    if (!target) {
      // A deleted member's objects went with their org's prefix (`delete_org`).
      helpers.logger.warn(`import_avatar: member ${member_id} no longer exists — nothing to reconcile`);
      return;
    }

    const prefix = avatarMemberPrefix(target.org_id, member_id);
    const current = target.version === null ? null : String(target.version);

    if (target.anonymised || target.answer !== "accepted") {
      const removed = await purge(prefix, null);
      helpers.logger.info(`import_avatar: ${member_id} ${target.anonymised ? "anonymised" : `answer ${target.answer ?? "none"}`} — removed ${removed} object(s)`);
      return;
    }
    if (!target.source_url) {
      helpers.logger.info(`import_avatar: ${member_id} said yes but Google gave no source — the initials stay`);
      return;
    }

    let derivatives;
    try {
      const inspected = inspectSource(await fetchSource(target.source_url, deps.fetcher));
      // The running measurement of Google's `picture` (DEC-182: no production read needed).
      helpers.logger.info(`import_avatar: ${member_id} source ${inspected.kind} ${inspected.width}x${inspected.height}, ${inspected.bytes.byteLength} bytes`);
      derivatives = await renderDerivatives(inspected, deps.run);
    } catch (error) {
      if (error instanceof AvatarRefused) {
        // Permanent: a retry would refuse the same bytes the same way.
        helpers.logger.warn(`import_avatar: ${member_id} — ${error.reason}; ${current ? "the previous copy stays" : "the initials stay"}`);
        return;
      }
      throw error;
    }

    // Epoch milliseconds, and always past the current copy's, so a version never repeats.
    const version = String(Math.max(now(), current ? Number(current) + 1 : 0));
    for (const size of AVATAR_DERIVATIVE_SIZES) {
      const location = avatarPath(target.org_id, member_id, version, size);
      await upload(location.bucket, location.path, derivatives[size], "image/webp");
    }

    const { rows: recorded } = await helpers.query<{ result: { status: "recorded" | "stale"; version: number | string | null } }>(
      `select public.record_avatar_copy($1, $2::bigint, $3) as result`,
      [member_id, version, target.source_url],
    );
    const result = recorded[0]?.result;
    if (result?.status === "recorded") {
      const removed = await purge(prefix, version);
      helpers.logger.info(`import_avatar: ${member_id} copied as version ${version}; removed ${removed} older object(s)`);
      return;
    }
    // Stale: the member changed their answer or their source while this ran.
    // Keep only what the row now says is current (nothing, after a decline).
    const keep = result?.version === null || result?.version === undefined ? null : String(result.version);
    const removed = await purge(prefix, keep);
    helpers.logger.info(`import_avatar: ${member_id} changed while copying — discarded version ${version}; removed ${removed} object(s)`);
  };
}

export const import_avatar: Task = makeImportAvatar();
