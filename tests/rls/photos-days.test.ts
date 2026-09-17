// content, wave 9 (DEC-119, DEC-120, DEC-121, DEC-150) — T1: record_photo_upload()'s day
// resolution and rescope_photo(). New behaviour, new file (rule 4) — photos-schema.test.ts is
// untouched (it calls record_photo_upload with its existing nine positional arguments, which
// still resolve through the new function's tenth, defaulted parameter). Applied with
// applyProposed() inside each test's rolled-back transaction (DEC-040).
//
// Days are placed the way `tests/rls/session-days.test.ts`'s own `addDay()` does — integer hour
// offsets from `now()`.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FOREIGN_KEY_VIOLATION = "23503";

async function apply(tx: Tx) {
  await applyProposed(tx, "content/0001_day_scope_writes.sql");
}

/** A day written the way a day-aware RPC writes one: as the owner, offsets in hours from now. */
async function addDay(tx: Tx, orgId: string, sessionId: string, venueId: string, fromH: number, toH: number) {
  const [row] = await tx.q<{ id: string; starts_at: string; ends_at: string }>(
    `insert into public.session_days (org_id, session_id, starts_at, ends_at, venue_id)
     values ($1, $2, now() + ($3 || ' hours')::interval, now() + ($4 || ' hours')::interval, $5) returning id, starts_at, ends_at`,
    [orgId, sessionId, String(fromH), String(toH), venueId],
  );
  return row;
}

// Day 1 (the session's own window, auto-created by trigger A, 0100) is `-72 .. -70`. Day 2 is
// `-68 .. -66` — a real two-hour GAP between the two windows (day1 ends at -70, day2 starts at
// -68), so a photo taken IN that gap has a genuine "nearer edge" question.
async function seedThreeDaySession(tx: Tx, orgId: string, categoryId: string, venueId: string, presenterId: string) {
  const [session] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, 'ورشة ثلاثية الأيام', 'ملخص', $2, 'introductory',
             now() - interval '72 hours', 120, now() - interval '70 hours',
             $3, 30, now() - interval '96 hours', now() - interval '96 hours', 'published', now() - interval '120 hours')
     returning id`,
    [orgId, categoryId, venueId],
  );
  const sessionId = session.id as string;
  await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenterId]);
  const [day1] = await tx.q<{ id: string; starts_at: string; ends_at: string }>(`select id, starts_at, ends_at from public.session_days where session_id = $1`, [sessionId]);
  const day2 = await addDay(tx, orgId, sessionId, venueId, -68, -66);
  return { sessionId, day1, day2 };
}

interface UploadEnvelope {
  status: string;
  photo: { id: string; session_day_id: string | null };
}

async function recordUpload(tx: Tx, orgId: string, sessionId: string, memberId: string, uploadedAt: string): Promise<UploadEnvelope> {
  const photoId = randomUUID();
  const [{ envelope }] = await tx.q<{ envelope: UploadEnvelope }>(
    `select public.record_photo_upload($1, $2, $3, $4, $5, 1000, $6, null, null, $7) as envelope`,
    [photoId, orgId, sessionId, memberId, `${orgId}/sessions/${sessionId}/photos/${photoId}.jpg`, "a".repeat(64), uploadedAt],
  );
  return envelope;
}

describe("RPC-record_photo_upload.day_from_upload_moment", () => {
  it("with one day, session_day_id stays null however the timestamp falls (DEC-121)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      await tx.asServiceRole();
      const envelope = await recordUpload(tx, f.a.id, f.m2.a.published, f.a.members[1].memberId, new Date().toISOString());
      expect(envelope.status).toBe("ok");
      expect(envelope.photo.session_day_id).toBeNull();
    });
  });

  it("with more than one day, a moment inside a day's own window resolves to that day", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const { sessionId, day1, day2 } = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);
      await apply(tx);
      await tx.asServiceRole();

      const midDay1 = new Date((new Date(day1.starts_at).getTime() + new Date(day1.ends_at).getTime()) / 2).toISOString();
      const inDay1 = await recordUpload(tx, f.a.id, sessionId, f.a.members[1].memberId, midDay1);
      expect(inDay1.photo.session_day_id).toBe(day1.id);

      const midDay2 = new Date((new Date(day2.starts_at).getTime() + new Date(day2.ends_at).getTime()) / 2).toISOString();
      const inDay2 = await recordUpload(tx, f.a.id, sessionId, f.a.members[1].memberId, midDay2);
      expect(inDay2.photo.session_day_id).toBe(day2.id);
    });
  });

  it("★ a moment OUTSIDE every day's window falls back to the day whose nearer edge is closest", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const { sessionId, day1, day2 } = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);
      await apply(tx);
      await tx.asServiceRole();

      // The gap is day1.ends_at .. day2.starts_at (2 hours, by construction above). A third of
      // the way through the gap is closer to day1's end than to day2's start.
      const gapStart = new Date(day1.ends_at).getTime();
      const gapEnd = new Date(day2.starts_at).getTime();
      const closerToDay1 = new Date(gapStart + (gapEnd - gapStart) * 0.25).toISOString();
      const closerToDay2 = new Date(gapStart + (gapEnd - gapStart) * 0.75).toISOString();

      const nearDay1 = await recordUpload(tx, f.a.id, sessionId, f.a.members[1].memberId, closerToDay1);
      expect(nearDay1.photo.session_day_id).toBe(day1.id);

      const nearDay2 = await recordUpload(tx, f.a.id, sessionId, f.a.members[1].memberId, closerToDay2);
      expect(nearDay2.photo.session_day_id).toBe(day2.id);
    });
  });

  it("a call with the old nine positional arguments (no uploaded_at) still succeeds, defaulting to now() and staying null at one day", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      await tx.asServiceRole();
      const photoId = randomUUID();
      const [{ envelope }] = await tx.q<{ envelope: { status: string; photo: { session_day_id: string | null } } }>(
        `select public.record_photo_upload($1, $2, $3, $4, $5, 1000, $6, null, null) as envelope`,
        [photoId, f.a.id, f.m2.a.published, f.a.members[1].memberId, `${f.a.id}/sessions/${f.m2.a.published}/photos/${photoId}.jpg`, "b".repeat(64)],
      );
      expect(envelope.status).toBe("ok");
      expect(envelope.photo.session_day_id).toBeNull();
    });
  });
});

describe("RPC-rescope_photo", () => {
  it("staff alone may move a photo; a checked-in attendee (not staff) is refused", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const { sessionId, day1 } = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);
      await apply(tx);
      await tx.asServiceRole();
      const envelope = await recordUpload(tx, f.a.id, sessionId, f.a.members[1].memberId, new Date().toISOString());
      const photoId = envelope.photo.id;

      await tx.as(f.a.members[1].claims); // the photo's own uploader — not staff
      expect(await errorCode(() => tx.q(`select public.rescope_photo($1, $2)`, [photoId, day1.id]))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.mod.claims);
      const [row] = await tx.q<{ session_day_id: string | null }>(`select r.session_day_id from public.rescope_photo($1, $2) r`, [photoId, day1.id]);
      expect(row.session_day_id).toBe(day1.id);
    });
  });

  it("★ RPC-rescope_photo.day_of_own_session — a day of a DIFFERENT session is refused before the bare FK violation", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const a = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);
      const b = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);
      await apply(tx);
      await tx.asServiceRole();
      const envelope = await recordUpload(tx, f.a.id, a.sessionId, f.a.members[1].memberId, new Date().toISOString());
      const photoId = envelope.photo.id;

      await tx.as(f.a.mod.claims);
      expect(await errorCode(() => tx.q(`select public.rescope_photo($1, $2)`, [photoId, b.day1.id]))).toBe(FOREIGN_KEY_VIOLATION);
    });
  });
});
