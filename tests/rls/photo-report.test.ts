// REQ-EVT-008 (wave 22, F1) — `report_photo()` and its guard (supabase/proposed/content/0002_report_photo.sql). Every
// call AS A MEMBER: a visible photo is reported once, never one's own, never a hidden or removed one; each refusal writes
// nothing; the reporter is visible to staff and the photo's uploader reads nothing. The guard trigger is the lead's
// (0190); the case re-creates it in its transaction exactly as the file names it, so the direct insert is proven either way.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FILE = "content/0002_report_photo.sql";
type Envelope = { outcome: string; report_id?: string };

async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, FILE);
  await tx.asOwner();
  return f;
}

async function report(tx: Tx, photo: string, reason: string | null = "صورة لا تخص الجلسة"): Promise<Envelope> {
  const [row] = await tx.q<{ r: Envelope }>(`select public.report_photo($1, $2) as r`, [photo, reason]);
  return row.r;
}

async function reportsOn(tx: Tx, photo: string) {
  await tx.asOwner();
  return tx.q<{ reporter_id: string; status: string; reason: string }>(`select reporter_id, status, reason from public.reports where target = 'photo' and photo_id = $1`, [photo]);
}

// The fixture's photo is uploaded by the attendee, members[1] (`fixture-m5.ts`); members[0] views and reports it.
const viewer = (f: Awaited<ReturnType<typeof seed>>) => f.a.members[0];
const uploader = (f: Awaited<ReturnType<typeof seed>>) => f.a.members[1];

describe("report_photo()", () => {
  it("a member reports a visible photo: one open report naming them, which staff read and the uploader does not", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const photo = f.m5.a.photoId;
      await tx.as(viewer(f).claims);
      const answer = await report(tx, photo);
      expect(answer.outcome).toBe("reported");
      expect(await reportsOn(tx, photo)).toEqual([{ reporter_id: viewer(f).memberId, status: "open", reason: "صورة لا تخص الجلسة" }]);

      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select reporter_id from public.reports where id = $1`, [answer.report_id])).toEqual([{ reporter_id: viewer(f).memberId }]);
      await tx.as(uploader(f).claims);
      expect(await tx.q(`select 1 from public.reports where id = $1`, [answer.report_id])).toHaveLength(0);
    });
  });

  it("a second report by the same member is refused, even after the first was dismissed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const photo = f.m5.a.photoId;
      await tx.as(viewer(f).claims);
      await report(tx, photo);
      expect((await report(tx, photo)).outcome).toBe("already_reported");
      await tx.asOwner();
      await tx.q(`update public.reports set status = 'resolved', resolution = 'dismissed', resolved_at = now() where photo_id = $1`, [photo]);
      await tx.as(viewer(f).claims);
      expect((await report(tx, photo)).outcome).toBe("already_reported");
      expect(await reportsOn(tx, photo)).toHaveLength(1);
    });
  });

  it("one's own photo is refused", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(uploader(f).claims);
      expect((await report(tx, f.m5.a.photoId)).outcome).toBe("own_photo");
      expect(await reportsOn(tx, f.m5.a.photoId)).toHaveLength(0);
    });
  });

  it("a hidden or a removed photo is refused, and so is another org's", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const photo = f.m5.a.photoId;
      await tx.q(`update public.photos set hidden_at = now(), hidden_reason = 'takedown_requested' where id = $1`, [photo]);
      await tx.as(viewer(f).claims);
      expect((await report(tx, photo)).outcome).toBe("not_visible");
      await tx.asOwner();
      await tx.q(`update public.photos set hidden_at = null, removed_at = now() where id = $1`, [photo]);
      await tx.as(viewer(f).claims);
      expect((await report(tx, photo)).outcome).toBe("not_visible");
      expect((await report(tx, f.m5.b.photoId)).outcome).toBe("not_visible");
      expect(await reportsOn(tx, photo)).toHaveLength(0);
    });
  });

  it("a reason under three characters is refused", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(viewer(f).claims);
      expect((await report(tx, f.m5.a.photoId, " ab ")).outcome).toBe("reason_required");
      expect((await report(tx, f.m5.a.photoId, null)).outcome).toBe("reason_required");
      expect(await reportsOn(tx, f.m5.a.photoId)).toHaveLength(0);
    });
  });

  it("anon cannot execute it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asAnon();
      expect(await errorCode(() => report(tx, f.m5.a.photoId))).toBe("42501");
    });
  });
});

describe("reports_photo_guard() — the same rules on a direct insert (the lead's trigger)", () => {
  it("refuses one's own photo, a hidden one and a duplicate; a plain first report still goes in", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      // Promoted with 0190, the trigger exists; before that, it is created here as the file names it. Rolled back either way.
      await tx.q(`drop trigger if exists reports_photo_guard on public.reports`);
      await tx.q(`create trigger reports_photo_guard before insert on public.reports for each row when (new.target = 'photo') execute function public.reports_photo_guard()`);
      const photo = f.m5.a.photoId;
      const insert = (who: { memberId: string }) =>
        tx.q(`insert into public.reports (org_id, target, photo_id, reporter_id, reason) values ($1, 'photo', $2, $3, 'سبب البلاغ')`, [f.a.id, photo, who.memberId]);

      await tx.as(uploader(f).claims);
      expect(await errorCode(() => insert(uploader(f)))).toBe("23514"); // own
      await tx.as(viewer(f).claims);
      await insert(viewer(f));
      expect(await errorCode(() => insert(viewer(f)))).toBe("23505"); // duplicate

      await tx.asOwner();
      await tx.q(`update public.photos set hidden_at = now(), hidden_reason = 'takedown_requested' where id = $1`, [photo]);
      await tx.as(f.a.mod.claims);
      expect(await errorCode(() => insert(f.a.mod))).toBe("23514"); // hidden
      expect(await reportsOn(tx, photo)).toHaveLength(1);
    });
  });
});
