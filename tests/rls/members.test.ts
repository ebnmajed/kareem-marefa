// POL-members.* — the row policy, the column grant that IS the member tier
// (A33, REQ-PRF-004), the self-update grant, the immutable org_id.

import { afterAll, describe, expect, it } from "vitest";
import { errorCode, errorMessage, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("POL-members", () => {
  it("select.member — the org's members are visible; org B's are not", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      const rows = await tx.q<{ org_id: string }>(`select org_id from public.members`);
      expect(rows.length).toBe(4);
      expect(rows.every((r) => r.org_id === f.a.id)).toBe(true);
    });
  });

  it("select.member — selecting `email` on another member ERRORS on the column grant, not returns null", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => tx.q(`select email from public.members where id = $1`, [f.a.members[1].memberId]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`select * from public.members`))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`select claims_version from public.members`))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`select deactivated_reason from public.members`))).toBe(PERMISSION_DENIED);
      // Even an admin holds only the column grant; the rest is an RPC.
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select email from public.members`))).toBe(PERMISSION_DENIED);
    });
  });

  it("the member tier view exposes exactly A33's fields for active members", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      const rows = await tx.q<Record<string, unknown>>(`select * from public.members_member_view`);
      expect(rows.length).toBe(4);
      expect(Object.keys(rows[0]).sort()).toEqual(["avatar_url", "bio", "company_id", "created_at", "display_name", "id", "job_title", "org_id", "org_role"]);
      expect(rows.every((r) => r.org_id === f.a.id)).toBe(true);
    });
  });

  it("me() returns the member's own row including email; nothing for a stranger", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      const [{ me }] = await tx.q<{ me: { email: string; id: string } }>(`select public.me() as me`);
      expect(me.email).toBe(f.a.members[0].email);
      expect(me.id).toBe(f.a.members[0].memberId);
      await tx.as({ sub: f.stranger.authUserId });
      const [{ me: none }] = await tx.q<{ me: unknown }>(`select public.me() as me`);
      expect(none).toBeNull();
    });
  });

  it("update.self — a member updates their own bio; another member's bio is untouched; org_role is not granted", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const me = f.a.members[0];
      await tx.as(me.claims);
      const mine = await tx.q<{ bio: string }>(`update public.members set bio = 'مهندس برمجيات' where id = $1 returning bio`, [me.memberId]);
      expect(mine[0].bio).toBe("مهندس برمجيات");
      const theirs = await tx.q(`update public.members set bio = 'x' where id = $1 returning id`, [f.a.members[1].memberId]);
      expect(theirs).toEqual([]);
      expect(await errorCode(() => tx.q(`update public.members set org_role = 'admin' where id = $1`, [me.memberId]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`update public.members set status = 'deactivated' where id = $1`, [me.memberId]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`update public.members set claims_version = 99 where id = $1`, [me.memberId]))).toBe(PERMISSION_DENIED);
    });
  });

  it("update.self — a company from another org is rejected by the trigger", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      const msg = await errorMessage(() => tx.q(`update public.members set company_id = $2 where id = $1`, [f.a.members[0].memberId, f.b.companyId]));
      expect(msg).toMatch(/another org/);
    });
  });

  it("org_immutable — an update changing org_id raises for a bypassrls role, and service_role has no table access at all", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // The owner bypasses RLS (like a hosted service_role would): the trigger is the wall.
      await tx.asOwner();
      const msg = await errorMessage(() => tx.q(`update public.members set org_id = $2 where id = $1`, [f.a.members[0].memberId, f.b.id]));
      expect(msg).toMatch(/org_id is immutable/);
      // service_role is revoked from every platform table (DEC-035): it cannot even try.
      await tx.asServiceRole();
      expect(await errorCode(() => tx.q(`update public.members set org_id = $2 where id = $1`, [f.a.members[0].memberId, f.b.id]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`select id from public.members`))).toBe(PERMISSION_DENIED);
    });
  });

  it("insert — no client role can insert a member directly; provisioning is an RPC", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.members (org_id, auth_user_id, email) values ($1, $2, 'x@kareem.example')`, [f.a.id, f.stranger.authUserId]),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });
});
