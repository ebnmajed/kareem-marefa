import type { Task } from "graphile-worker";
import { BUCKETS, deleteObjects, listObjects } from "../platform/storage.js";

// JOB-delete_org (11 §2.7 under DEC-052, REQ-NFR-014, 12 §5.5). On request,
// key `orgdel:{org_id}`, enqueued by `delete_org()` after the super admin typed
// the org's slug back.
//
// ★ IRREVERSIBLE, AND DISTINCT FROM SUSPENSION. Suspension retains everything
// and is reversible (REQ-TEN-006); this removes the org's rows AND its storage
// objects, and the post-deletion assertion must find neither.
//
// Order matters exactly once: the OBJECTS GO FIRST. Every org-scoped table
// cascades from `orgs`, so deleting the row is what makes the org's id
// unrecoverable — and an object whose org row is already gone is an orphan
// nobody can attribute. Deleting bytes first and rows second means a crash in
// between leaves a suspended org with some files missing, which a replay
// finishes; the other order leaves files nothing points at, forever.
//
// `fonts` is untouched: it is content-addressed and shared platform-wide
// (REQ-DSG-016, DEC-049), so a font an org happened to be the first to need is
// not the org's to take away.
//
// Idempotent: deleting an already-deleted org is a no-op that still runs the
// assertion, and re-deleting objects that are gone removes nothing.
export const delete_org: Task = async (payload, helpers) => {
  const { org_id } = payload as { org_id?: string };
  if (!org_id) {
    helpers.logger.error("delete_org: payload is missing org_id");
    return;
  }

  let objectsRemoved = 0;
  for (const bucket of BUCKETS) {
    if (!bucket.orgPrefixed) continue;
    let paths: string[];
    try {
      paths = await listObjects(bucket.name, org_id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("404") || message.includes("Bucket not found")) continue;
      throw error;
    }
    objectsRemoved += await deleteObjects(bucket.name, paths);
  }
  helpers.logger.info(`delete_org: removed ${objectsRemoved} storage object(s) under ${org_id}`);

  const { rows } = await helpers.query<{ out: { deleted: boolean; residue: Record<string, number> } }>(
    `select public.perform_org_deletion($1) as out`,
    [org_id],
  );
  const { deleted, residue } = rows[0].out;

  // ★ The assertion REQ-NFR-014 names, run here rather than trusted: it walks
  // every table with an `org_id` column dynamically, so a table a later wave
  // adds is covered the day it is created.
  const leftoverRows = Object.keys(residue ?? {});
  const leftoverObjects: string[] = [];
  for (const bucket of BUCKETS) {
    if (!bucket.orgPrefixed) continue;
    try {
      const remaining = await listObjects(bucket.name, org_id);
      if (remaining.length > 0) leftoverObjects.push(`${bucket.name}: ${remaining.length}`);
    } catch {
      // A missing bucket is not leftover state.
    }
  }

  if (leftoverRows.length > 0 || leftoverObjects.length > 0) {
    helpers.logger.error(
      `delete_org: POST-DELETION ASSERTION FAILED for ${org_id} — rows ${JSON.stringify(residue)}, objects ${leftoverObjects.join(", ")}`,
    );
    throw new Error(`delete_org: ${org_id} still has rows or objects after deletion (REQ-NFR-014)`);
  }

  helpers.logger.info(
    `delete_org: ${org_id} is gone — ${deleted ? "rows deleted" : "rows were already gone"}, no row and no object bears the id`,
  );
};
