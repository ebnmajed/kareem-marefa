import type { Task } from "graphile-worker";
import { BUCKETS, listObjects } from "../platform/storage.js";

// JOB-assert_storage_prefixes (11 §2.7, REQ-TEN-003, 03 §6). Nightly, key
// `storageck:{date}`.
//
// ★ THIS IS THE THIRD CONTAINMENT, and the only one that would catch a path
// builder that had been wrong for a week. Storage paths are the one place in
// this design where isolation depends on application correctness rather than
// on a constraint: everywhere else a forgotten predicate returns zero rows
// because a policy says so, but here a path built wrong puts an object in
// another org's prefix and the policy dutifully allows it (03 §6, CLAUDE.md's
// fourth likely failure).
//
// ★ `fonts` IS REPORTED, NOT SKIPPED. It is the one deliberately un-prefixed
// bucket — fonts are content-addressed by SHA-256 and shared platform-wide so
// the editor, the worker's Chromium and the worker's LibreOffice load THE SAME
// BYTES (REQ-DSG-016, 06 §6.4, DEC-049). A skipped bucket and a forgotten
// bucket look identical in a log, so this one says its name and says why.
//
// A violation is `11` §3.2's page-immediately alert: it is logged as an error
// (Sentry's worker integration is the on-call path) AND written to
// `platform_audit_log`, so the finding survives log retention and a human can
// read it later beside the deletions and impersonations.
//
// It writes nothing to Storage and deletes nothing. A job that "fixed" a
// misplaced object by moving it would destroy the evidence of how it got there
// — and the object is already readable by the wrong org, so the answer is a
// person, not a retry.
export const assert_storage_prefixes: Task = async (_payload, helpers) => {
  const { rows: orgRows } = await helpers.query<{ platform_org_ids: string }>(`select public.platform_org_ids()`);
  const orgIds = new Set(orgRows.map((r) => r.platform_org_ids));

  const violations: { bucket: string; path: string; reason: string }[] = [];
  const counted: Record<string, number> = {};

  for (const bucket of BUCKETS) {
    let paths: string[];
    try {
      paths = await listObjects(bucket.name);
    } catch (error) {
      // A bucket that does not exist yet in a given environment is a fact, not
      // a violation; anything else is rethrown so the job fails loudly.
      const message = (error as Error).message;
      if (message.includes("404") || message.includes("Bucket not found")) {
        helpers.logger.info(`assert_storage_prefixes: ${bucket.name} does not exist in this environment`);
        continue;
      }
      throw error;
    }
    counted[bucket.name] = paths.length;

    if (!bucket.orgPrefixed) {
      // Named out loud, every run (DEC-049).
      helpers.logger.info(
        `assert_storage_prefixes: ${bucket.name} is deliberately NOT org-prefixed (content-addressed, REQ-DSG-016) — ${paths.length} object(s), none checked against an org`,
      );
      continue;
    }

    for (const path of paths) {
      const first = path.split("/")[0];
      if (!first) violations.push({ bucket: bucket.name, path, reason: "empty first segment" });
      else if (!orgIds.has(first)) violations.push({ bucket: bucket.name, path, reason: "first segment is not a known org id" });
    }

    if (bucket.name === "avatars" || bucket.name === "avatar-staging") violations.push(...(await avatarOwnerViolations(helpers, paths, bucket.name)));
  }

  if (violations.length === 0) {
    helpers.logger.info(`assert_storage_prefixes: clean — ${JSON.stringify(counted)}`);
    return;
  }

  for (const v of violations) {
    helpers.logger.error(`assert_storage_prefixes: VIOLATION ${v.bucket}/${v.path} — ${v.reason}`);
  }
  await helpers.query(`select public.write_platform_audit('storage.prefix_violation', null, 'bucket', null, null, $1::jsonb, $2)`, [
    JSON.stringify({ count: violations.length, sample: violations.slice(0, 20) }),
    "REQ-TEN-003 — the path builder is wrong",
  ]);
  // Thrown so the job is a failure, not a quiet log line: `11` §3.2 says page
  // immediately, and a task that returns successfully pages nobody.
  throw new Error(`assert_storage_prefixes: ${violations.length} object(s) outside an org prefix — see the platform audit log`);
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ★ The second question, for `avatars` only (DEC-182): a face filed under the
 * right-looking org prefix is still a leak if the member it belongs to is in
 * ANOTHER org — `avatars_storage_read` would serve it to the wrong org's
 * members. `avatars/{org}/members/{member}/…` (packages/storage-paths/src/
 * avatar.ts): the member segment must name a member, and that member's org
 * must be the prefix's. Asked through `avatar_member_orgs()`, the one definer
 * door, in one query for the whole bucket.
 *
 * ★ Wave 29 (DEC-281): `avatar-staging/{org}/members/{member}/{upload_id}` — a
 * member's upload before the worker derives it — is asked the same question.
 */
export async function avatarOwnerViolations(
  helpers: Parameters<Task>[1],
  paths: string[],
  bucket: "avatars" | "avatar-staging" = "avatars",
): Promise<{ bucket: string; path: string; reason: string }[]> {
  const out: { bucket: string; path: string; reason: string }[] = [];
  const named = new Set<string>();
  for (const path of paths) {
    const [, literal, member] = path.split("/");
    if (literal !== "members" || !member || !UUID_RE.test(member)) out.push({ bucket, path, reason: "not a member avatar path" });
    else named.add(member.toLowerCase());
  }
  if (named.size === 0) return out;

  const { rows } = await helpers.query<{ member_id: string; org_id: string }>(
    `select member_id, org_id from public.avatar_member_orgs($1::uuid[])`,
    [Array.from(named)],
  );
  const orgOf = new Map(rows.map((r) => [r.member_id.toLowerCase(), r.org_id]));
  for (const path of paths) {
    const [org, literal, member] = path.split("/");
    if (literal !== "members" || !member || !UUID_RE.test(member)) continue;
    const owner = orgOf.get(member.toLowerCase());
    if (!owner) out.push({ bucket, path, reason: "member segment is not a known member" });
    else if (owner !== org) out.push({ bucket, path, reason: "member belongs to another org" });
  }
  return out;
}
