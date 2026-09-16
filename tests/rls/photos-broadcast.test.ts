// TRG-photos_broadcast — supabase/proposed/content/01_photos_broadcast.sql.
// Applied with applyProposed() inside this test's rolled-back transaction
// (DEC-040): nothing here touches the shared local database.
//
// REQ-EVT-010, DEC-139: an INSERT on `photos` broadcasts on the session's
// own `session:{id}` topic — the same one `comments_broadcast()`/
// `reactions_broadcast()` (0016) already use, so this proves only the NEW
// trigger's own payload; `tests/rls/realtime.test.ts` already covers that
// topic's RLS.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["content/01_photos_broadcast.sql"];

async function setup(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  return f;
}

describe("TRG-photos_broadcast.session_topic", () => {
  it("an INSERT on photos broadcasts {id, sessionId, uploaderId} on session:{session_id}, event INSERT", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = f.m2.a.published;
      const uploaderId = f.a.members[0].memberId;

      // As the owner — this trigger fires on ANY insert regardless of role
      // (it is what `record_photo_upload()`, SECURITY DEFINER and
      // service_role-only, does in the real pipeline); the write path
      // itself is `0050`'s to prove, not this trigger's.
      const [photo] = await tx.q<{ id: string }>(
        `insert into public.photos (org_id, session_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped)
         values ($1, $2, $3, $4, 1200, 800, 2048, $5, true) returning id`,
        [f.a.id, sessionId, uploaderId, `${f.a.id}/sessions/${sessionId}/photos/broadcast-test.jpg`, "b".repeat(64)],
      );

      const rows = await tx.q<{ event: string; payload: { id?: string; sessionId?: string; uploaderId?: string } }>(
        `select event, payload from realtime.messages where topic = $1 order by inserted_at`,
        [`session:${sessionId}`],
      );
      const msg = rows.find((r) => r.event === "INSERT" && r.payload.id === photo.id);
      expect(msg, "the new photo's own broadcast row").toBeTruthy();
      expect(msg!.payload.sessionId).toBe(sessionId);
      expect(msg!.payload.uploaderId).toBe(uploaderId);
    });
  });

  it("broadcasts on the photo's OWN session topic only — org B's own topic, which already carries its own fixture's comment traffic, gets nothing FROM THIS insert", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = f.m2.a.published;
      const otherSessionId = f.m2.b.published;

      const [photo] = await tx.q<{ id: string }>(
        `insert into public.photos (org_id, session_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped)
         values ($1, $2, $3, $4, 1200, 800, 2048, $5, true) returning id`,
        [f.a.id, sessionId, f.a.members[0].memberId, `${f.a.id}/sessions/${sessionId}/photos/broadcast-test-2.jpg`, "c".repeat(64)],
      );

      // Org B's own topic is not empty — its own fixture seeds comments on
      // it, each broadcasting — so the assertion is that THIS photo's id
      // never appears there, not that the topic is silent.
      const otherTopicRows = await tx.q<{ payload: { id?: string } }>(`select payload from realtime.messages where topic = $1`, [
        `session:${otherSessionId}`,
      ]);
      expect(otherTopicRows.some((r) => r.payload.id === photo.id)).toBe(false);
    });
  });
});
