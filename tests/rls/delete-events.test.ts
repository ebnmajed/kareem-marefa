// 0215 — an admin deletes events (REQ-SES-023, DEC-271). A deleted event disappears for everyone and what it awarded
// is taken back; nothing is physically erased.
//
//   RPC-delete_session.admin_only · RPC-delete_session.takes_back · RPC-delete_session.once · RPC-delete_session.cancels ·
//   POL-sessions.read_hides_deleted · POL-photos.read_hides_deleted · RPC-session_public_card.deleted ·
//   RPC-delete_sessions.per_id · RPC-session_deletion_impact

import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const memberSum = (tx: Tx, session: string) =>
  tx.q<{ s: number }>(`select coalesce(sum(amount), 0)::int as s from public.points_ledger where session_id = $1`, [session]);
const companySum = (tx: Tx, session: string) =>
  tx.q<{ s: number }>(`select coalesce(sum(amount), 0)::int as s from public.company_points_ledger where session_id = $1`, [session]);

describe("RPC-delete_session", () => {
  it("★ a completed event: every points row reversed (members' and companies'), every certificate revoked, audited", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const s = f.m2.a.completed;
      await tx.asOwner();
      expect((await memberSum(tx, s))[0].s).toBeGreaterThan(0);
      expect((await companySum(tx, s))[0].s).toBeGreaterThan(0);
      await tx.as(f.a.admin.claims);
      const [{ out }] = await tx.q<{ out: Record<string, unknown> }>(`select public.delete_session($1, 'أُنشئت بالخطأ') as out`, [s]);
      expect(out).toMatchObject({ status: "deleted", cancelled: false });
      await tx.asOwner();
      expect(await memberSum(tx, s)).toEqual([{ s: 0 }]);
      expect(await companySum(tx, s)).toEqual([{ s: 0 }]);
      expect(await tx.q(`select state from public.certificates where session_id = $1 and state <> 'revoked'`, [s])).toEqual([]);
      const [audit] = await tx.q<{ after: Record<string, unknown>; reason: string }>(
        `select after, reason from public.audit_log where action = 'session.deleted' and subject_id = $1`,
        [s],
      );
      expect(audit.reason).toBe("أُنشئت بالخطأ");
      expect(audit.after).toMatchObject({ certificates_revoked: 1 });
      // Nothing physically erased: the row and its ledger evidence remain.
      expect(await tx.q(`select count(*)::int as n from public.sessions where id = $1 and deleted_at is not null`, [s])).toEqual([{ n: 1 }]);
    });
  });

  it("★ once: a second delete takes nothing again", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const s = f.m2.a.completed;
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.delete_session($1)`, [s]);
      await tx.asOwner();
      const [{ n }] = await tx.q<{ n: number }>(`select count(*)::int as n from public.points_ledger where session_id = $1`, [s]);
      // A second call cannot see the hidden row through RLS, but runs as definer: it answers «already».
      await tx.as(f.a.admin.claims);
      expect(await tx.q(`select public.delete_session($1) as out`, [s])).toEqual([{ out: { status: "already" } }]);
      await tx.asOwner();
      expect(await tx.q(`select count(*)::int as n from public.points_ledger where session_id = $1`, [s])).toEqual([{ n }]);
    });
  });

  it("★ an upcoming event is cancelled first, so its reservations are told", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const s = f.m2.a.published;
      await tx.as(f.a.admin.claims);
      const [{ out }] = await tx.q<{ out: Record<string, unknown> }>(`select public.delete_session($1) as out`, [s]);
      expect(out).toMatchObject({ status: "deleted", cancelled: true });
      await tx.asOwner();
      expect(await tx.q(`select state from public.sessions where id = $1`, [s])).toEqual([{ state: "cancelled" }]);
    });
  });

  it("★ a moderator, the presenter and a member are refused; another org's admin finds nothing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const s = f.m2.a.published;
      for (const who of [f.a.mod, f.a.members[0], f.a.members[1]]) {
        await tx.as(who.claims);
        expect(await errorCode(() => tx.q(`select public.delete_session($1)`, [s]))).toBe(PERMISSION_DENIED);
      }
      await tx.as(f.b.admin.claims);
      expect(await errorCode(() => tx.q(`select public.delete_session($1)`, [s]))).toBe("P0002");
    });
  });
});

describe("POL-sessions.read_hides_deleted / POL-photos.read_hides_deleted / RPC-session_public_card.deleted", () => {
  it("★ a deleted event is invisible to a member AND an admin; its photographs and public card go with it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const s = f.m2.a.published;
      const photo = f.m5.a.photoId;
      await tx.asOwner();
      const [{ session_id: photoSession }] = await tx.q<{ session_id: string }>(`select session_id from public.photos where id = $1`, [photo]);
      expect(photoSession).toBe(s);
      await tx.as(f.a.members[1].claims);
      expect((await tx.q(`select id from public.photos where id = $1`, [photo])).length).toBe(1);
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.delete_session($1)`, [s]);
      for (const who of [f.a.members[1], f.a.admin]) {
        await tx.as(who.claims);
        expect(await tx.q(`select id from public.sessions where id = $1`, [s])).toEqual([]);
        expect(await tx.q(`select id from public.photos where id = $1`, [photo])).toEqual([]);
      }
      await tx.asAnon();
      expect(await tx.q(`select * from public.session_public_card($1)`, [s])).toEqual([]);
    });
  });
});

describe("RPC-delete_sessions.per_id / RPC-session_deletion_impact", () => {
  it("★ the impact is said first; a bulk delete answers per event, a foreign one failing alone", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [{ impact }] = await tx.q<{ impact: Record<string, number> }>(`select public.session_deletion_impact($1::uuid[]) as impact`, [
        [f.m2.a.published, f.m2.a.completed],
      ]);
      expect(impact).toMatchObject({ sessions: 2, to_cancel: 1, certificates: 1 });
      expect(impact.members_with_points).toBeGreaterThan(0);
      const [{ out }] = await tx.q<{ out: Array<Record<string, unknown>> }>(`select public.delete_sessions($1::uuid[], 'تنظيف') as out`, [
        [f.m2.a.published, f.m2.a.completed, f.m2.b.published],
      ]);
      expect(out.map((r) => r.status)).toEqual(["deleted", "deleted", "failed"]);
    });
  });
});
