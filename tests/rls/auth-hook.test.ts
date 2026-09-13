// The Custom Access Token Hook (0006). 14-roadmap.md M1 risk ★, 03 §8.2 rows
// POL-auth_hook.*. Called with the event Supabase Auth would send. The
// function is SECURITY DEFINER, so its body runs identically whoever calls
// it; local Supabase does not let `postgres` become supabase_auth_admin, so
// the calls run as the owner and the grants are proven with
// has_function_privilege instead.

import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const event = (userId: string, claims: Record<string, unknown> = {}) => ({
  user_id: userId,
  claims: { sub: userId, role: "authenticated", aud: "authenticated", app_metadata: { provider: "google" }, ...claims },
  authentication_method: "oauth",
});

async function hook(tx: Tx, ev: unknown) {
  const [{ out }] = await tx.q<{ out: { claims: { app_metadata: Record<string, unknown> } } }>(`select public.custom_access_token_hook($1::jsonb) as out`, [JSON.stringify(ev)]);
  return out;
}

describe("POL-auth_hook", () => {
  it("no_member — returns the event UNCHANGED for a user with no member row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const ev = event(f.stranger.authUserId);
      expect(await hook(tx, ev)).toEqual(ev);
    });
  });

  it("claims — for a member, app_metadata carries org_id, member_id, org_role, status, claims_version, org_status, and keeps what was there", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const out = await hook(tx, event(f.a.admin.authUserId));
      expect(out.claims.app_metadata).toEqual({
        provider: "google",
        org_id: f.a.id,
        member_id: f.a.admin.memberId,
        org_role: "admin",
        status: "active",
        claims_version: 1,
        org_status: "active",
      });
    });
  });

  it("claims — a suspended org and a deactivated member are visible in the token", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`update public.orgs set status = 'suspended', suspended_at = now(), suspended_reason = 'x' where id = $1`, [f.b.id]);
      await tx.q(`update public.members set status = 'deactivated', deactivated_at = now(), deactivated_reason = 'x', claims_version = 2 where id = $1`, [f.b.members[0].memberId]);
      await tx.asOwner();
      const out = await hook(tx, event(f.b.members[0].authUserId));
      expect(out.claims.app_metadata).toMatchObject({ org_status: "suspended", status: "deactivated", claims_version: 2 });
    });
  });

  it("platform_admin — a platform admin with no member row gets only platform_admin: true", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const out = await hook(tx, event(f.platformAdmin.authUserId));
      expect(out.claims.app_metadata).toEqual({ provider: "google", platform_admin: true });
    });
  });

  it("never_raises — a malformed event and a broken read both come back unchanged", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const bad = { user_id: "not-a-uuid", claims: {} };
      expect(await hook(tx, bad)).toEqual(bad);
      const none = { claims: {} };
      expect(await hook(tx, none)).toEqual(none);
      // Break the read path underneath the function: drop the join target's
      // column privilege for the definer would need superuser; instead rename
      // the table the hook reads, which makes its body fail at runtime.
      await tx.asOwner();
      await tx.q(`alter table public.orgs rename to orgs_broken`);
      await tx.asOwner();
      const ev = event(f.a.admin.authUserId);
      expect(await hook(tx, ev)).toEqual(ev);
    });
  });

  it("grants — supabase_auth_admin holds usage, execute and select; authenticated and anon cannot execute it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const fn = "public.custom_access_token_hook(jsonb)";
      const [g] = await tx.q<Record<string, boolean>>(
        `select has_schema_privilege('supabase_auth_admin', 'public', 'usage') as usage,
                has_function_privilege('supabase_auth_admin', $1, 'execute') as exec_admin,
                has_function_privilege('authenticated', $1, 'execute') as exec_authenticated,
                has_function_privilege('anon', $1, 'execute') as exec_anon,
                has_table_privilege('supabase_auth_admin', 'public.members', 'select') as sel_members,
                has_table_privilege('supabase_auth_admin', 'public.orgs', 'select') as sel_orgs,
                has_table_privilege('supabase_auth_admin', 'public.platform_admins', 'select') as sel_pa`,
        [fn],
      );
      expect(g).toEqual({ usage: true, exec_admin: true, exec_authenticated: false, exec_anon: false, sel_members: true, sel_orgs: true, sel_pa: true });
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => hook(tx, event(f.a.admin.authUserId)))).toBe(PERMISSION_DENIED);
      await tx.asAnon();
      expect(await errorCode(() => hook(tx, event(f.a.admin.authUserId)))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-before_user_created_hook", () => {
  const ev = (email: string) => ({ metadata: { uuid: "x", time: "now" }, user: { id: "00000000-0000-0000-0000-000000000001", email, app_metadata: {}, user_metadata: {} } });
  const call = async (tx: Tx, e: unknown) => (await tx.q<{ out: Record<string, unknown> }>(`select public.before_user_created_hook($1::jsonb) as out`, [JSON.stringify(e)]))[0].out;

  it("lets a listed domain through unchanged, case-insensitively", async () => {
    await withTx(async (tx) => {
      await seed(tx);
      await tx.asOwner();
      const e = ev("New.Person@Kareem.Example");
      expect(await call(tx, e)).toEqual(e);
    });
  });

  it("refuses a domain on no active org's list, naming no org", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const out = await call(tx, ev("someone@nowhere.example"));
      expect(out).toEqual({ error: { http_code: 403, message: "domain_not_allowed" } });
      expect(JSON.stringify(out)).not.toContain(f.a.name);
      // A suspended org's domain no longer admits new users.
      await tx.q(`update public.orgs set status = 'suspended', suspended_at = now(), suspended_reason = 'x' where id = $1`, [f.b.id]);
      expect(await call(tx, ev("late@other.example"))).toMatchObject({ error: { http_code: 403 } });
    });
  });

  it("fails open: a malformed event and a broken read both come back unchanged", async () => {
    await withTx(async (tx) => {
      await seed(tx);
      await tx.asOwner();
      const none = { user: {} };
      expect(await call(tx, none)).toEqual(none);
      await tx.q(`alter table public.org_domains rename to org_domains_broken`);
      const e = ev("someone@nowhere.example");
      expect(await call(tx, e)).toEqual(e);
    });
  });

  it("grants — supabase_auth_admin may execute it; authenticated and anon may not", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const [g] = await tx.q<Record<string, boolean>>(
        `select has_function_privilege('supabase_auth_admin', 'public.before_user_created_hook(jsonb)', 'execute') as a,
                has_function_privilege('authenticated', 'public.before_user_created_hook(jsonb)', 'execute') as b,
                has_function_privilege('anon', 'public.before_user_created_hook(jsonb)', 'execute') as c`,
      );
      expect(g).toEqual({ a: true, b: false, c: false });
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => call(tx, ev("x@kareem.example")))).toBe(PERMISSION_DENIED);
    });
  });
});
