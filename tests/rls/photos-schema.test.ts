// photos / photo_takedowns, plus the reports.photo_id FK — 02 §4.7, 03 §5.6c
// (verbatim), DEC-005, REQ-EVT-009…014 (schema half). Applied with
// applyProposed() inside each test's rolled-back transaction (DEC-040).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const CHECK_VIOLATION = "23514";

async function insertPhoto(tx: Tx, orgId: string, sessionId: string, uploaderId: string, sha: string) {
  await tx.asOwner(); // a pure fixture helper — never inherits whatever role the caller happens to be in
  const [p] = await tx.q<{ id: string }>(
    `insert into public.photos (org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped)
     values ($1, $2, $3, 'x.webp', 1000, $4, true) returning id`,
    [orgId, sessionId, uploaderId, sha],
  );
  return p.id as string;
}

describe("POL-photos.insert.checked_in", () => {
  it("a member with a confirmed RSVP and no check-in is rejected; the same member, after checking in, succeeds", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.asOwner();
      const [session] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
         values ($1, 'جلسة للصور', 'ملخص الجلسة', $2, 'introductory', now() - interval '1 hour', 60, now(), $3, 30, 'published', now() - interval '1 day')
         returning id`,
        [f.a.id, f.a.categoryId, f.a.venueId],
      );
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [
        f.a.id,
        session.id,
        f.a.members[0].memberId,
      ]);
      await tx.q(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [
        f.a.id,
        session.id,
        f.a.members[1].memberId,
      ]);

      await tx.as(f.a.members[1].claims);
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.photos (org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped)
             values ($1, $2, $3, 'x.webp', 1000, $4, true)`,
            [f.a.id, session.id, f.a.members[1].memberId, "b".repeat(64)],
          ),
        ),
      ).toBe(PERMISSION_DENIED);

      await tx.asOwner();
      const [code] = await tx.q<{ id: string }>(
        `insert into public.check_in_codes (org_id, session_id, code, valid_from, valid_until)
         values ($1, $2, 'ACDEFG', now() - interval '1 minute', now() + interval '10 minutes') returning id`,
        [f.a.id, session.id],
      );
      await tx.q(
        `insert into public.check_ins (org_id, session_id, member_id, method, code_id, session_window) values ($1, $2, $3, 'code', $4, 'empty'::tstzrange)`,
        [f.a.id, session.id, f.a.members[1].memberId, code.id],
      );

      await tx.as(f.a.members[1].claims);
      const [ok] = await tx.q<{ id: string }>(
        `insert into public.photos (org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped)
         values ($1, $2, $3, 'y.webp', 1000, $4, true) returning id`,
        [f.a.id, session.id, f.a.members[1].memberId, "c".repeat(64)],
      );
      expect(ok.id).toBeTruthy();
    });
  });

  it("the presenter and an admin can upload without a check-in", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.

      await tx.as(f.a.members[0].claims); // presenter of `published`, not checked in
      const [ok] = await tx.q<{ id: string }>(
        `insert into public.photos (org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped)
         values ($1, $2, $3, 'p.webp', 1000, $4, true) returning id`,
        [f.a.id, f.m2.a.published, f.a.members[0].memberId, "d".repeat(64)],
      );
      expect(ok.id).toBeTruthy();

      await tx.as(f.a.admin.claims);
      const [ok2] = await tx.q<{ id: string }>(
        `insert into public.photos (org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped)
         values ($1, $2, $3, 'a.webp', 1000, $4, true) returning id`,
        [f.a.id, f.m2.a.published, f.a.admin.memberId, "e".repeat(64)],
      );
      expect(ok2.id).toBeTruthy();
    });
  });
});

describe("POL-photos.insert.exif", () => {
  it("inserting with exif_stripped = false is rejected — by the policy for an authenticated writer, and by the table constraint even for service_role", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.as(f.a.members[1].claims); // already checked in to `published` (fixture-m2)
      // The policy's own `with check` also requires exif_stripped, so an authenticated
      // writer is refused on the grant/policy (42501) before the table constraint is
      // even reached — the constraint is defense-in-depth for a writer RLS can't gate.
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.photos (org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped)
             values ($1, $2, $3, 'x.webp', 1000, $4, false)`,
            [f.a.id, f.m2.a.published, f.a.members[1].memberId, "f".repeat(64)],
          ),
        ),
      ).toBe(PERMISSION_DENIED);

      await tx.asOwner(); // bypasses RLS and grants entirely — only the table CHECK stands
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.photos (org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped)
             values ($1, $2, $3, 'x.webp', 1000, $4, false)`,
            [f.a.id, f.m2.a.published, f.a.members[1].memberId, "g".repeat(64)],
          ),
        ),
      ).toBe(CHECK_VIOLATION);
    });
  });
});

describe("POL-photos.select.hidden", () => {
  it("a hidden photo is invisible to a member, visible to staff", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const photoId = await insertPhoto(tx, f.a.id, f.m2.a.published, f.a.members[1].memberId, "1".repeat(64));
      await tx.asOwner();
      await tx.q(`update public.photos set hidden_at = now(), hidden_reason = 'x' where id = $1`, [photoId]);

      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.photos where id = $1`, [photoId])).toEqual([]);

      await tx.as(f.a.mod.claims);
      expect((await tx.q(`select id from public.photos where id = $1`, [photoId])).length).toBe(1);
    });
  });
});

describe("POL-photo_takedowns.insert", () => {
  it("inserting hides the photo in the same transaction, before any other read", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const photoId = await insertPhoto(tx, f.a.id, f.m2.a.published, f.a.members[1].memberId, "2".repeat(64));

      await tx.as(f.a.members[0].claims);
      await tx.q(`insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3)`, [f.a.id, photoId, f.a.members[0].memberId]);

      expect(await tx.q(`select id from public.photos where id = $1`, [photoId])).toEqual([]); // hidden already, even to the requester

      await tx.as(f.a.mod.claims);
      const rows = await tx.q<{ id: string; hidden_at: string | null }>(`select id, hidden_at from public.photos where id = $1`, [photoId]);
      expect(rows.length).toBe(1);
      expect(rows[0].hidden_at).not.toBeNull();
    });
  });

  it("a member cannot file a takedown against another org's photo, nor as anyone but themselves", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const photoIdB = await insertPhoto(tx, f.b.id, f.m2.b.published, f.b.members[0].memberId, "3".repeat(64));

      await tx.as(f.a.members[0].claims);
      expect(
        await errorCode(() => tx.q(`insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3)`, [f.a.id, photoIdB, f.a.members[0].memberId])),
      ).toBe(PERMISSION_DENIED);

      const photoIdA = await insertPhoto(tx, f.a.id, f.m2.a.published, f.a.members[1].memberId, "4".repeat(64));
      await tx.as(f.a.members[0].claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3)`, [f.a.id, photoIdA, f.a.members[1].memberId])),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-photo_takedowns.restore", () => {
  it("a moderator resolving with restored unhides the photo; resolved_by is stamped, never trusted from the client", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const photoId = await insertPhoto(tx, f.a.id, f.m2.a.published, f.a.members[1].memberId, "5".repeat(64));

      await tx.as(f.a.members[0].claims);
      const [takedown] = await tx.q<{ id: string }>(
        `insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3) returning id`,
        [f.a.id, photoId, f.a.members[0].memberId],
      );

      await tx.as(f.a.mod.claims);
      await tx.q(`update public.photo_takedowns set resolved_at = now(), resolution = 'restored', resolved_by = $1 where id = $2`, [
        f.a.admin.memberId, // impersonation attempt — should be overridden by the trigger
        takedown.id,
      ]);

      const [row] = await tx.q<{ resolved_by: string }>(`select resolved_by from public.photo_takedowns where id = $1`, [takedown.id]);
      expect(row.resolved_by).toBe(f.a.mod.memberId);

      await tx.asOwner();
      const [photo] = await tx.q<{ hidden_at: string | null }>(`select hidden_at from public.photos where id = $1`, [photoId]);
      expect(photo.hidden_at).toBeNull();
    });
  });

  it("a member cannot resolve a takedown", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const photoId = await insertPhoto(tx, f.a.id, f.m2.a.published, f.a.members[1].memberId, "6".repeat(64));
      await tx.as(f.a.members[0].claims);
      const [takedown] = await tx.q<{ id: string }>(
        `insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3) returning id`,
        [f.a.id, photoId, f.a.members[0].memberId],
      );
      // Not staff — the p6_staff_update policy's `using` excludes this row, so the
      // UPDATE matches and changes nothing (no error; that's how a non-matching
      // UPDATE behaves in Postgres — see docs/plan/notes/content.md §1.4a).
      await tx.q(`update public.photo_takedowns set resolved_at = now(), resolution = 'restored' where id = $1`, [takedown.id]);
      await tx.asOwner();
      const [row] = await tx.q<{ resolved_at: string | null }>(`select resolved_at from public.photo_takedowns where id = $1`, [takedown.id]);
      expect(row.resolved_at).toBeNull();
    });
  });
});

describe("reports.photo_id", () => {
  it("a member can report a photo; the reporter is hidden from other members but visible to staff", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const photoId = await insertPhoto(tx, f.a.id, f.m2.a.published, f.a.members[1].memberId, "7".repeat(64));
      await tx.as(f.a.members[0].claims);
      const [report] = await tx.q<{ id: string }>(
        `insert into public.reports (org_id, target, photo_id, reporter_id, reason) values ($1, 'photo', $2, $3, 'محتوى غير لائق') returning id`,
        [f.a.id, photoId, f.a.members[0].memberId],
      );
      expect(report.id).toBeTruthy();

      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.reports where id = $1`, [report.id])).toEqual([]);

      await tx.as(f.a.mod.claims);
      expect((await tx.q(`select id from public.reports where id = $1`, [report.id])).length).toBe(1);
    });
  });
});

describe("RPC-photo_takedowns_hide.notifies", () => {
  it("inserting a takedown writes an in-app MSG-photo_hidden notification to the uploader, never naming the requester", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const photoId = await insertPhoto(tx, f.a.id, f.m2.a.published, f.a.members[1].memberId, "8".repeat(64));
      // Promoted at wave-2 sync 6 (0041–0043): applied by `supabase db reset`.

      await tx.as(f.a.members[0].claims);
      await tx.q(`insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3)`, [f.a.id, photoId, f.a.members[0].memberId]);

      await tx.as(f.a.members[1].claims); // the uploader — p7_self_read
      // Scoped to THIS photo — the fixture (fixture-m5.ts) already seeds its own
      // takedown-and-restore for a different photo, also uploaded by members[1].
      const rows = await tx.q<{ key: string; payload: { photo_id: string; session_id: string; requester_id?: string } }>(
        `select key, payload from public.notifications where member_id = $1 and key = 'MSG-photo_hidden' and payload ->> 'photo_id' = $2`,
        [f.a.members[1].memberId, photoId],
      );
      expect(rows.length).toBe(1);
      expect(rows[0].payload.photo_id).toBe(photoId);
      expect(rows[0].payload.session_id).toBe(f.m2.a.published);
      expect(rows[0].payload.requester_id).toBeUndefined();

      // The requester (members[0]) gets no notification of their own request.
      await tx.as(f.a.members[0].claims);
      expect(
        await tx.q(`select id from public.notifications where member_id = $1 and key = 'MSG-photo_hidden' and payload ->> 'photo_id' = $2`, [
          f.a.members[0].memberId,
          photoId,
        ]),
      ).toEqual([]);
    });
  });
});

// supabase/proposed/content/0007_photo_pipeline.sql — STORY-EVT-005/006,
// REQ-EVT-009…011. Two doors: initiate_photo_processing() (authenticated,
// re-derives the same has_checked_in()/is_presenter_of()/is_staff() gate as
// photos_storage_write, then enqueues process_photo) and record_photo_
// upload() (service_role-only — the worker's own door, DEC-047, DEC-043's
// envelope shape).
const pendingJob = (tx: Tx, key: string) => tx.q<{ task_identifier: string }>(`select task_identifier from graphile_worker.jobs where key = $1`, [key]);

describe("RPC-initiate_photo_processing.authority", () => {
  it("a member with no check-in/presenter/staff standing for the session is refused 42501; a checked-in member and the presenter succeed", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, "content/0007_photo_pipeline.sql");

      await tx.as(f.a.members[1].claims); // not checked in to the draft session (storage-content.test.ts's own precedent)
      expect(await errorCode(() => tx.q(`select public.initiate_photo_processing($1, $2, 'x.jpg', 'jpeg', 1000)`, [randomUUID(), f.m2.a.draft]))).toBe(
        PERMISSION_DENIED,
      );

      await tx.as(f.a.members[1].claims); // checked in to `published` (fixture-m2)
      await tx.q(`select public.initiate_photo_processing($1, $2, 'y.jpg', 'jpeg', 1000)`, [randomUUID(), f.m2.a.published]);

      await tx.as(f.a.members[0].claims); // presenter of `published`, not checked in
      await tx.q(`select public.initiate_photo_processing($1, $2, 'z.jpg', 'jpeg', 1000)`, [randomUUID(), f.m2.a.published]);
    });
  });
});

describe("RPC-initiate_photo_processing.size", () => {
  it("a declared byte size over the org's limit_image_mb is refused 23514, naming the limit", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, "content/0007_photo_pipeline.sql");
      await tx.as(f.a.members[1].claims); // checked in to `published`
      expect(
        await errorCode(() =>
          tx.q(`select public.initiate_photo_processing($1, $2, 'x.jpg', 'jpeg', $3)`, [randomUUID(), f.m2.a.published, 21 * 1024 * 1024]),
        ),
      ).toBe(CHECK_VIOLATION);
    });
  });
});

describe("RPC-initiate_photo_processing.enqueues", () => {
  it("a successful call enqueues process_photo keyed photo:{photo_id}", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, "content/0007_photo_pipeline.sql");
      const photoId = randomUUID();
      await tx.as(f.a.members[1].claims);
      await tx.q(`select public.initiate_photo_processing($1, $2, $3, 'jpeg', 1000)`, [photoId, f.m2.a.published, `a/photos/${photoId}.jpg`]);

      await tx.asOwner();
      expect((await pendingJob(tx, `photo:${photoId}`))[0]?.task_identifier).toBe("process_photo");
    });
  });
});

describe("RPC-record_photo_upload", () => {
  it("service_role_only: authenticated and anon are refused on the grant; service_role succeeds, and the inserted row has exif_stripped = true", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, "content/0007_photo_pipeline.sql");
      const photoId = randomUUID();

      await tx.as(f.a.members[1].claims);
      expect(
        await errorCode(() =>
          tx.q(`select public.record_photo_upload($1, $2, $3, $4, 'a.jpg', 1000, $5, null, null)`, [
            photoId,
            f.a.id,
            f.m2.a.published,
            f.a.members[1].memberId,
            "1".repeat(64),
          ]),
        ),
      ).toBe(PERMISSION_DENIED);

      await tx.asAnon();
      expect(
        await errorCode(() =>
          tx.q(`select public.record_photo_upload($1, $2, $3, $4, 'a.jpg', 1000, $5, null, null)`, [
            photoId,
            f.a.id,
            f.m2.a.published,
            f.a.members[1].memberId,
            "2".repeat(64),
          ]),
        ),
      ).toBe(PERMISSION_DENIED);

      await tx.asServiceRole();
      const [row] = await tx.q<{ envelope: { status: string; photo: { id: string; exif_stripped: boolean } } }>(
        `select public.record_photo_upload($1, $2, $3, $4, 'a.jpg', 1000, $5, 10, 20) as envelope`,
        [photoId, f.a.id, f.m2.a.published, f.a.members[1].memberId, "3".repeat(64)],
      );
      expect(row.envelope.status).toBe("ok");
      expect(row.envelope.photo.id).toBe(photoId);
      expect(row.envelope.photo.exif_stripped).toBe(true);
    });
  });

  it("★ DEC-043: a real byte size over the org's limit_image_mb returns {status: 'file_too_large', limit_mb} and inserts no row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, "content/0007_photo_pipeline.sql");
      const photoId = randomUUID();
      await tx.asServiceRole();
      const [row] = await tx.q<{ envelope: { status: string; limit_mb: number } }>(
        `select public.record_photo_upload($1, $2, $3, $4, 'a.jpg', $5, $6, null, null) as envelope`,
        [photoId, f.a.id, f.m2.a.published, f.a.members[1].memberId, 21 * 1024 * 1024, "4".repeat(64)],
      );
      expect(row.envelope.status).toBe("file_too_large");
      expect(row.envelope.limit_mb).toBe(20);

      await tx.asOwner();
      expect(await tx.q(`select id from public.photos where id = $1`, [photoId])).toEqual([]);
    });
  });

  it("idempotent: a second call with the same photo_id (a retried job) returns the already-inserted row rather than erroring", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, "content/0007_photo_pipeline.sql");
      const photoId = randomUUID();
      await tx.asServiceRole();

      const [first] = await tx.q<{ envelope: { status: string; photo: { id: string } } }>(
        `select public.record_photo_upload($1, $2, $3, $4, 'a.jpg', 1000, $5, null, null) as envelope`,
        [photoId, f.a.id, f.m2.a.published, f.a.members[1].memberId, "5".repeat(64)],
      );
      expect(first.envelope.status).toBe("ok");

      const [second] = await tx.q<{ envelope: { status: string; photo: { id: string } } }>(
        `select public.record_photo_upload($1, $2, $3, $4, 'a.jpg', 1000, $5, null, null) as envelope`,
        [photoId, f.a.id, f.m2.a.published, f.a.members[1].memberId, "5".repeat(64)],
      );
      expect(second.envelope.status).toBe("ok");
      expect(second.envelope.photo.id).toBe(photoId);

      await tx.asOwner();
      expect((await tx.q(`select id from public.photos where id = $1`, [photoId])).length).toBe(1);
    });
  });
});

// supabase/proposed/content/0008_photos_audit_staff_actions.sql —
// REQ-EVT-012 (restoration is audited), REQ-EVT-014 (removal is audited).
describe("POL-photos.restore.audited", () => {
  it("★ REQ-EVT-012: a moderator clearing hidden_at writes one audit row naming the photo", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, "content/0008_photos_audit_staff_actions.sql");
      const photoId = await insertPhoto(tx, f.a.id, f.m2.a.published, f.a.members[1].memberId, "9".repeat(64));
      await tx.asOwner();
      await tx.q(`update public.photos set hidden_at = now(), hidden_reason = 'x' where id = $1`, [photoId]);

      await tx.as(f.a.mod.claims);
      await tx.q(`update public.photos set hidden_at = null, hidden_reason = null where id = $1`, [photoId]);

      await tx.asOwner();
      const rows = await tx.q(`select id from public.audit_log where action = 'photo.restored' and subject_id = $1`, [photoId]);
      expect(rows.length).toBe(1);
    });
  });
});

describe("POL-photos.removal.audited", () => {
  it("★ REQ-EVT-014: a moderator's removal writes one audit row naming removed_by", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, "content/0008_photos_audit_staff_actions.sql");
      const photoId = await insertPhoto(tx, f.a.id, f.m2.a.published, f.a.members[1].memberId, "0a".repeat(32));

      await tx.as(f.a.mod.claims);
      await tx.q(`update public.photos set removed_at = now(), removed_by = $1 where id = $2`, [f.a.mod.memberId, photoId]);

      await tx.asOwner();
      const rows = await tx.q<{ after: { removed_by: string } }>(`select after from public.audit_log where action = 'photo.removed' and subject_id = $1`, [
        photoId,
      ]);
      expect(rows.length).toBe(1);
      expect(rows[0].after.removed_by).toBe(f.a.mod.memberId);
    });
  });
});
