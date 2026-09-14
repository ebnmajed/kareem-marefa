// The tenancy RPCs (0005): provisioning, the staleness pattern, role and
// status changes, org creation and suspension. 03 §8.2 rows named
// POL-provision_member.*, POL-assert_fresh_admin.stale, POL-set_member_role.audit,
// POL-deactivate_member.reason, and REQ-TEN-002 / REQ-TEN-006 for the platform RPCs.

import { afterAll, describe, expect, it } from "vitest";
import { errorMessage, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

type Envelope = { status: string; org_id?: string; member_id?: string; org_status?: string; member_status?: string; orgs?: { id: string; name: string }[] };
const provision = async (tx: Parameters<Parameters<typeof withTx>[0]>[0], org?: string) =>
  (await tx.q<{ r: Envelope }>(`select public.provision_member($1) as r`, [org ?? null]))[0].r;

describe("POL-provision_member", () => {
  it("no_match — a domain on no list returns no_match and creates no member row and no audit row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as({ sub: f.stranger.authUserId, email: f.stranger.email });
      expect(await provision(tx)).toEqual({ status: "no_match" });
      await tx.asOwner();
      expect(await tx.q(`select id from public.members where auth_user_id = $1`, [f.stranger.authUserId])).toEqual([]);
      // Scoped to this transaction (`now()` is its start): the audit log is
      // append-only and shared, so an e2e run that signed a member in leaves a
      // committed `member.provisioned` row that a global emptiness check would
      // count for everyone afterwards (wave-3 sync 8).
      expect(await tx.q(`select id from public.audit_log where action = 'member.provisioned' and occurred_at >= now()`)).toEqual([]);
    });
  });

  it("provisioned — an allowed domain creates one member, as 'member', with Google's name and avatar, and audits it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const uid = (await tx.q<{ id: string }>(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'new@kareem.example', '{"full_name":"عضو جديد","picture":"https://lh3.googleusercontent.com/a/p"}') returning id`))[0].id;
      await tx.as({ sub: uid, email: "new@kareem.example" });
      const r = await provision(tx);
      expect(r.status).toBe("provisioned");
      expect(r.org_id).toBe(f.a.id);
      await tx.asOwner();
      const [m] = await tx.q<{ org_role: string; display_name: string; avatar_url: string; email: string }>(`select org_role, display_name, avatar_url, email from public.members where auth_user_id = $1`, [uid]);
      expect(m).toEqual({ org_role: "member", display_name: "عضو جديد", avatar_url: "https://lh3.googleusercontent.com/a/p", email: "new@kareem.example" });
      const audit = await tx.q<{ actor_id: string; actor_role: string }>(`select actor_id, actor_role from public.audit_log where action = 'member.provisioned' and subject_id = $1`, [r.member_id]);
      expect(audit).toEqual([{ actor_id: r.member_id, actor_role: "member" }]);
    });
  });

  it("idempotent — a second call for the same user returns 'member' and leaves one row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const uid = (await tx.q<{ id: string }>(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'twice@kareem.example', '{"full_name":"مرتين"}') returning id`))[0].id;
      await tx.as({ sub: uid, email: "twice@kareem.example" });
      const first = await provision(tx);
      const second = await provision(tx);
      expect(first.status).toBe("provisioned");
      expect(second.status).toBe("member");
      expect(second.member_id).toBe(first.member_id);
      await tx.asOwner();
      expect((await tx.q(`select id from public.members where auth_user_id = $1`, [uid])).length).toBe(1);
      expect(f.a.id).toBe(second.org_id);
    });
  });

  it("member — a returning member's locally edited name is kept; the avatar is refreshed", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const me = f.a.members[0];
      await tx.as(me.claims);
      await tx.q(`update public.members set display_name = 'اسمي المعدّل' where id = $1`, [me.memberId]);
      await tx.asOwner();
      await tx.q(`update auth.users set raw_user_meta_data = '{"full_name":"Google Name","avatar_url":"https://lh3.googleusercontent.com/a/new"}' where id = $1`, [me.authUserId]);
      await tx.as(me.claims);
      const r = await provision(tx);
      expect(r.status).toBe("member");
      await tx.asOwner();
      const [m] = await tx.q<{ display_name: string; avatar_url: string }>(`select display_name, avatar_url from public.members where id = $1`, [me.memberId]);
      expect(m).toEqual({ display_name: "اسمي المعدّل", avatar_url: "https://lh3.googleusercontent.com/a/new" });
    });
  });

  it("ambiguous — a domain on two lists returns both orgs and creates nothing; naming one org then creates exactly one member", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`insert into public.org_domains (org_id, domain) values ($1, 'shared.example'), ($2, 'shared.example')`, [f.a.id, f.b.id]);
      const uid = (await tx.q<{ id: string }>(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'both@shared.example', '{}') returning id`))[0].id;
      await tx.as({ sub: uid, email: "both@shared.example" });
      const r = await provision(tx);
      expect(r.status).toBe("ambiguous");
      expect(r.orgs!.map((o) => o.id).sort()).toEqual([f.a.id, f.b.id].sort());
      await tx.asOwner();
      expect(await tx.q(`select id from public.members where auth_user_id = $1`, [uid])).toEqual([]);
      await tx.as({ sub: uid, email: "both@shared.example" });
      const chosen = await provision(tx, f.b.id);
      expect(chosen.status).toBe("provisioned");
      expect(chosen.org_id).toBe(f.b.id);
      // The choice is permanent: asking again returns the member, never the picker.
      expect((await provision(tx)).status).toBe("member");
      // And naming an org the domain is not listed on is refused.
      await tx.asOwner();
      const uid2 = (await tx.q<{ id: string }>(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'other@shared.example', '{}') returning id`))[0].id;
      await tx.as({ sub: uid2, email: "other@shared.example" });
      await tx.asOwner();
      const [c] = await tx.q<{ id: string }>(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ('ثالثة', 'third', 'TH', gen_random_uuid()) returning id`);
      await tx.as({ sub: uid2, email: "other@shared.example" });
      expect(await errorMessage(() => provision(tx, c.id))).toMatch(/org_not_allowed/);
    });
  });

  it("first admin — the address named at creation arrives as an admin", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`update public.orgs set first_admin_email = 'Boss@Kareem.Example' where id = $1`, [f.a.id]);
      const uid = (await tx.q<{ id: string }>(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'boss@kareem.example', '{}') returning id`))[0].id;
      await tx.as({ sub: uid, email: "boss@kareem.example" });
      const r = await provision(tx);
      expect(r.status).toBe("provisioned");
      await tx.asOwner();
      expect((await tx.q<{ org_role: string }>(`select org_role from public.members where auth_user_id = $1`, [uid]))[0].org_role).toBe("admin");
    });
  });

  it("suspended — a member of a suspended org still resolves, and the envelope says so", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`update public.orgs set status = 'suspended', suspended_at = now(), suspended_reason = 'اختبار' where id = $1`, [f.a.id]);
      await tx.as(f.a.members[0].claims);
      const r = await provision(tx);
      expect(r).toMatchObject({ status: "member", org_status: "suspended" });
      // A NEW user on the suspended org's domain is not provisioned into it.
      await tx.asOwner();
      const uid = (await tx.q<{ id: string }>(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'late@kareem.example', '{}') returning id`))[0].id;
      await tx.as({ sub: uid, email: "late@kareem.example" });
      expect(await provision(tx)).toEqual({ status: "no_match" });
    });
  });
});

describe("POL-assert_fresh_admin", () => {
  it("stale — a lagging claims_version raises stale_claims; a member raises not_an_admin; a deactivated member raises not_a_member", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as({ ...f.a.admin.claims, claims_version: 0 });
      expect(await errorMessage(() => tx.q(`select public.assert_fresh_admin()`))).toMatch(/stale_claims/);
      await tx.as(f.a.members[0].claims);
      expect(await errorMessage(() => tx.q(`select public.assert_fresh_admin()`))).toMatch(/not_an_admin/);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(`select (public.assert_fresh_admin()).id`);
      expect(id).toBe(f.a.admin.memberId);
      await tx.asOwner();
      await tx.q(`update public.members set status = 'deactivated', deactivated_at = now(), deactivated_reason = 'x' where id = $1`, [f.a.admin.memberId]);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select public.assert_fresh_admin()`))).toMatch(/not_a_member/);
      // A missing claims_version claim is stale, not a pass.
      await tx.as({ ...f.b.admin.claims, claims_version: undefined });
      expect(await errorMessage(() => tx.q(`select public.assert_fresh_admin()`))).toMatch(/stale_claims/);
    });
  });
});

describe("POL-set_member_role", () => {
  it("audit — a role change bumps claims_version, writes the audit row, and the subject's old token is now stale", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const target = f.a.members[0];
      await tx.as(f.a.admin.claims);
      const [row] = await tx.q<{ org_role: string; claims_version: number }>(`select (r).org_role, (r).claims_version from public.set_member_role($1, 'moderator') r`, [target.memberId]);
      expect(row).toEqual({ org_role: "moderator", claims_version: target.claims.claims_version! + 1 });
      const audit = await tx.q<{ before: unknown; after: unknown; actor_id: string }>(`select before, after, actor_id from public.audit_log where action = 'member.role_changed' and subject_id = $1`, [target.memberId]);
      expect(audit).toEqual([{ before: { org_role: "member" }, after: { org_role: "moderator" }, actor_id: f.a.admin.memberId }]);
      // The demoted/promoted member's old token fails its next privileged write.
      await tx.as(target.claims);
      expect(await errorMessage(() => tx.q(`select public.assert_active_member()`))).toMatch(/stale_claims/);
      // A member cannot call it; an admin cannot reach org B's member.
      expect(await errorMessage(() => tx.q(`select public.set_member_role($1, 'admin')`, [target.memberId]))).toMatch(/stale_claims|not_an_admin/);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select public.set_member_role($1, 'admin')`, [f.b.members[0].memberId]))).toMatch(/member_not_found/);
    });
  });

  it("last_admin — demoting the only active admin is refused", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select public.set_member_role($1, 'member')`, [f.a.admin.memberId]))).toMatch(/last_admin/);
    });
  });
});

describe("POL-deactivate_member", () => {
  it("reason — without a reason it is rejected; with one, status flips, claims_version bumps, the audit row carries the reason", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const target = f.a.members[1];
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select public.deactivate_member($1, '')`, [target.memberId]))).toMatch(/reason_required/);
      expect(await errorMessage(() => tx.q(`select public.deactivate_member($1, 'سبب')`, [f.a.admin.memberId]))).toMatch(/cannot_deactivate_self/);
      const [row] = await tx.q<{ status: string; claims_version: number; deactivated_reason: string }>(`select (r).status, (r).claims_version, (r).deactivated_reason from public.deactivate_member($1, 'غادر الشركة') r`, [target.memberId]);
      expect(row).toEqual({ status: "deactivated", claims_version: target.claims.claims_version! + 1, deactivated_reason: "غادر الشركة" });
      const audit = await tx.q<{ reason: string }>(`select reason from public.audit_log where action = 'member.deactivated' and subject_id = $1`, [target.memberId]);
      expect(audit).toEqual([{ reason: "غادر الشركة" }]);
      // The deactivated member is out of the member-tier view and cannot act.
      await tx.as(f.a.members[0].claims);
      expect((await tx.q<{ id: string }>(`select id from public.members_member_view where id = $1`, [target.memberId]))).toEqual([]);
      await tx.as(target.claims);
      expect(await errorMessage(() => tx.q(`select public.assert_active_member()`))).toMatch(/not_a_member|stale_claims/);
      // Reactivation reverses it, with its own audit row.
      await tx.as(f.a.admin.claims);
      const [back] = await tx.q<{ status: string }>(`select (public.reactivate_member($1)).status`, [target.memberId]);
      expect(back.status).toBe("active");
    });
  });
});

describe("platform RPCs — REQ-TEN-002, REQ-TEN-006", () => {
  it("create_org — only a platform admin; seeds settings, domains, categories; audits with actor_role platform_admin", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select public.create_org('جديدة', 'new-org', 'NW', array['new.example'], 'lead@new.example')`))).toMatch(/not_platform_admin/);
      await tx.as({ sub: f.platformAdmin.authUserId, email: f.platformAdmin.email, platform_admin: true });
      const [{ id }] = await tx.q<{ id: string }>(`select public.create_org('جديدة', 'New-Org', 'nw', array['@New.Example', 'second.example'], 'Lead@New.Example') as id`);
      await tx.asOwner();
      const [o] = await tx.q<{ slug: string; certificate_prefix: string; first_admin_email: string }>(`select slug, certificate_prefix, first_admin_email from public.orgs where id = $1`, [id]);
      expect(o).toEqual({ slug: "new-org", certificate_prefix: "NW", first_admin_email: "lead@new.example" });
      expect((await tx.q(`select id from public.org_settings where org_id = $1`, [id])).length).toBe(1);
      expect((await tx.q<{ domain: string }>(`select domain from public.org_domains where org_id = $1 order by domain`, [id])).map((d) => d.domain)).toEqual(["new.example", "second.example"]);
      expect((await tx.q<{ name: string }>(`select name from public.categories where org_id = $1 order by name`, [id])).map((c) => c.name).sort()).toEqual(["إبداعي", "إداري", "درس من تجربة", "فني"].sort());
      const audit = await tx.q<{ actor_role: string; action: string }>(`select actor_role, action from public.audit_log where org_id = $1 and action = 'org.created'`, [id]);
      expect(audit).toEqual([{ actor_role: "platform_admin", action: "org.created" }]);
      // A platform admin holds NO data-plane access (DEC-014): with only the
      // platform claim, every org table is empty for them.
      await tx.as({ sub: f.platformAdmin.authUserId, platform_admin: true });
      expect(await tx.q(`select id from public.orgs`)).toEqual([]);
      expect(await tx.q(`select org_id from public.members`)).toEqual([]);
    });
  });

  it("suspend_org / reinstate_org — platform admin only, audited in the org's own log", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select public.suspend_org($1, 'x')`, [f.a.id]))).toMatch(/not_platform_admin/);
      await tx.as({ sub: f.platformAdmin.authUserId, platform_admin: true });
      expect(await errorMessage(() => tx.q(`select public.suspend_org($1, '')`, [f.a.id]))).toMatch(/reason_required/);
      await tx.q(`select public.suspend_org($1, 'مخالفة الشروط')`, [f.a.id]);
      await tx.asOwner();
      expect((await tx.q<{ status: string }>(`select status from public.orgs where id = $1`, [f.a.id]))[0].status).toBe("suspended");
      const audit = await tx.q<{ action: string; reason: string; actor_role: string }>(`select action, reason, actor_role from public.audit_log where org_id = $1 and action like 'org.%' order by occurred_at`, [f.a.id]);
      expect(audit).toEqual([{ action: "org.suspended", reason: "مخالفة الشروط", actor_role: "platform_admin" }]);
      await tx.as({ sub: f.platformAdmin.authUserId, platform_admin: true });
      await tx.q(`select public.reinstate_org($1)`, [f.a.id]);
      await tx.asOwner();
      expect((await tx.q<{ status: string }>(`select status from public.orgs where id = $1`, [f.a.id]))[0].status).toBe("active");
    });
  });
});
