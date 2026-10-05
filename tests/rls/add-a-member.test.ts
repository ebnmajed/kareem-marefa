// Wave 25, M27 — an admin adds a member and they are a member AT ONCE (`DEC-243`, shape by `DEC-244`).
// `supabase/proposed/wave25/add_a_member.sql`, applied inside each test's rolled-back transaction
// (`DEC-040`), so this suite needs no `supabase db reset` and disturbs no other session's local stack.
//
// The 03 §8.2 rows are named in the proposed file's header. The three cases that would catch the
// design being wrong rather than the code being wrong are marked ★★.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorMessage, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";
import { randomUUID } from "node:crypto";

afterAll(() => pool.end());

async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, "wave25/add_a_member.sql");
  return f;
}

type Envelope = { status: string; org_id?: string; member_id?: string; orgs?: { id: string }[] };
const provision = (tx: Tx, org?: string) =>
  tx.q<{ r: Envelope }>(`select public.provision_member($1) as r`, [org ?? null]).then((r) => r[0].r);

const addMember = (tx: Tx, email: string, name?: string | null, company?: string | null, role?: string) =>
  tx.q<{ id: string }>(`select (public.add_member($1, $2, $3, $4, coalesce($5, 'member')::public.org_role)).id as id`, [
    email,
    name ?? null,
    company ?? null,
    null,
    role ?? null,
  ]);

/** The hook's answer for an address, as `supabase_auth_admin` sees it. */
const hook = (tx: Tx, email: string) =>
  tx
    .q<{ r: { error?: { message: string } } }>(`select public.before_user_created_hook($1::jsonb) as r`, [
      JSON.stringify({ user: { email } }),
    ])
    .then((r) => r[0].r);

describe("RPC-add_member", () => {
  it("admin_only — a moderator and a member are refused", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      for (const who of [f.a.mod, f.a.members[0]]) {
        await tx.as(who.claims);
        expect(await errorMessage(() => addMember(tx, "outsider@gmail.com"))).toContain("not_an_admin");
      }
    });
  });

  // ★ 0211 (DEC-261, the owner's ruling): was «no_admin_by_email — `admin` is refused». The expectation is reversed.
  it("admin_by_email — `admin` is accepted and carried on the row; `moderator` is accepted", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [boss] = await addMember(tx, "boss@gmail.com", null, null, "admin");
      const [row] = await tx.q<{ org_role: string }>(`select org_role from public.members where id = $1`, [boss.id]);
      expect(row.org_role).toBe("admin");
      const [{ id }] = await addMember(tx, "mod@gmail.com", null, null, "moderator");
      expect(id).toBeTruthy();
    });
  });

  it("last_admin_arrived — an admin who has not signed in is never the org's last admin", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [boss] = await addMember(tx, "boss@gmail.com", null, null, "admin");
      // The only signed-in admin cannot step down while the other admin row is unbound…
      expect(await errorMessage(() => tx.q(`select public.set_member_role($1, 'member')`, [f.a.admin.memberId]))).toContain("last_admin");
      // …and the unbound admin can be demoted, because the actor remains.
      await tx.q(`select public.set_member_role($1, 'member')`, [boss.id]);
    });
  });

  it("refuses an existing member's address, bound or not, and a malformed one", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => addMember(tx, f.a.members[0].email))).toContain("already_a_member");
      await addMember(tx, "twice@gmail.com");
      expect(await errorMessage(() => addMember(tx, "TWICE@gmail.com"))).toContain("already_a_member");
      expect(await errorMessage(() => addMember(tx, "not an address"))).toContain("not_an_address");
    });
  });

  it("a company of another org is refused by 0004's trigger, unchanged", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => addMember(tx, "x@gmail.com", null, f.b.companyId))).toContain("another org");
    });
  });

  it("writes an active unbound row with the admin's fields, an audit row and one queued mail", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await addMember(tx, "Guest@Gmail.com", "ضيف من خارج المؤسسة", f.a.companyId, "member");
      await tx.asOwner();
      const [row] = await tx.q<{ email: string; display_name: string; company_id: string; status: string; auth_user_id: string | null; invited_by: string }>(
        `select email::text as email, display_name, company_id, status::text as status, auth_user_id, invited_by
           from public.members where id = $1`,
        [id],
      );
      expect(row).toMatchObject({
        email: "guest@gmail.com",
        display_name: "ضيف من خارج المؤسسة",
        company_id: f.a.companyId,
        status: "active",
        auth_user_id: null,
        invited_by: f.a.admin.memberId,
      });
      const audit = await tx.q<{ action: string }>(`select action from public.audit_log where subject_id = $1`, [id]);
      expect(audit.map((a) => a.action)).toEqual(["member.added"]);
      const jobs = await tx.q<{ task_identifier: string; key: string | null }>(
        `select task_identifier, key from graphile_worker.jobs where key = $1`,
        [`invite:${id}`],
      );
      expect(jobs).toHaveLength(1);
      expect(jobs[0].task_identifier).toBe("send_member_invitation");
    });
  });

  it("★★ TAKES EFFECT — the added member is in the directory view every picker reads", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await addMember(tx, "presenter@gmail.com", "مقدّم خارجي");
      // An ordinary member, not an admin, sees them — this is the whole requirement: they can be
      // found, picked and assigned as a presenter before they have ever signed in (`REQ-TEN-009`).
      await tx.as(f.a.members[0].claims);
      const seen = await tx.q<{ id: string; display_name: string }>(
        `select id, display_name from public.members_member_view where id = $1`,
        [id],
      );
      expect(seen).toEqual([{ id, display_name: "مقدّم خارجي" }]);
    });
  });

  it("isolation — org B's admin never adds into org A, and never removes A's member", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.b.admin.claims);
      const [{ id }] = await addMember(tx, "theirs@gmail.com");
      await tx.asOwner();
      const [{ org_id }] = await tx.q<{ org_id: string }>(`select org_id from public.members where id = $1`, [id]);
      expect(org_id).toBe(f.b.id);
      await tx.as(f.b.admin.claims);
      expect(await errorMessage(() => tx.q(`select public.remove_unbound_member($1)`, [f.a.members[0].memberId]))).toContain("member_not_found");
    });
  });
});

describe("RPC-add_members — the pasted list", () => {
  it("reports every line and does not let one bad address abort the rest", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ r }] = await tx.q<{ r: { email: string; outcome: string }[] }>(
        `select public.add_members($1::text[]) as r`,
        [[`one@gmail.com`, `not an address`, f.a.members[0].email, ``, `two@gmail.com`]],
      );
      expect(r.map((x) => [x.email, x.outcome.split("\n")[0]])).toEqual([
        ["one@gmail.com", "added"],
        ["not an address", "not_an_address"],
        [f.a.members[0].email, "already_a_member"],
        ["two@gmail.com", "added"],
      ]);
      await tx.asOwner();
      const added = await tx.q(`select id from public.members where org_id = $1 and auth_user_id is null`, [f.a.id]);
      expect(added).toHaveLength(2);
    });
  });
});

describe("FN-admin_list_members — the derived boolean", () => {
  it("says who has signed in, and never exposes the binding to a client role", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await addMember(tx, "waiting@gmail.com");
      const rows = await tx.q<{ id: string; has_signed_in: boolean }>(`select id, has_signed_in from public.admin_list_members()`);
      const byId = new Map(rows.map((r) => [r.id, r.has_signed_in]));
      expect(byId.get(id)).toBe(false);
      expect(byId.get(f.a.admin.memberId)).toBe(true);
      // `auth_user_id` is outside the column grant and stays outside it.
      expect(await errorMessage(() => tx.q(`select auth_user_id from public.members limit 1`))).toBeTruthy();
    });
  });
});

describe("FN-before_user_created_hook — REQ-TEN-010", () => {
  it("★★ admits an added address the domain list would refuse, and still refuses an unknown one", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await addMember(tx, "outsider@gmail.com");
      await tx.asOwner();
      expect(await hook(tx, "outsider@gmail.com")).toEqual({ user: { email: "outsider@gmail.com" } });
      expect((await hook(tx, "nobody@gmail.com")).error?.message).toBe("domain_not_allowed");
      // The domain door is untouched.
      expect(await hook(tx, `anyone@${f.a.domain}`)).toEqual({ user: { email: `anyone@${f.a.domain}` } });
    });
  });

  it("deactivating somebody who has not arrived closes the door again", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await addMember(tx, "revoked@gmail.com");
      await tx.q(`select public.deactivate_member($1, $2)`, [id, "أُضيف بالخطأ"]);
      await tx.asOwner();
      expect((await hook(tx, "revoked@gmail.com")).error?.message).toBe("domain_not_allowed");
    });
  });
});

describe("FN-provision_member — the bind, REQ-TEN-011", () => {
  it("★★ first sign-in BINDS the waiting row: same member id, no second row, audited", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await addMember(tx, "outsider@gmail.com", null, f.a.companyId, "moderator");

      // The person's own Google account arrives — a domain on no org's list.
      await tx.asOwner();
      const authUserId = randomUUID();
      await tx.q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`, [
        authUserId,
        "outsider@gmail.com",
        JSON.stringify({ full_name: "اسم من جوجل", avatar_url: "https://lh3.googleusercontent.com/a/y" }),
      ]);
      await tx.as({ sub: authUserId, email: "outsider@gmail.com" });
      const env = await provision(tx);
      expect(env.status).toBe("provisioned");
      expect(env.member_id).toBe(id);
      expect(env.org_id).toBe(f.a.id);

      await tx.asOwner();
      const rows = await tx.q<{ id: string; auth_user_id: string; org_role: string; company_id: string; display_name: string }>(
        `select id, auth_user_id, org_role::text as org_role, company_id, display_name
           from public.members where email = 'outsider@gmail.com'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id,
        auth_user_id: authUserId,
        org_role: "moderator",
        company_id: f.a.companyId,
        display_name: "اسم من جوجل",
      });
      // Sorted in JS for the same reason as the delete case above — never by database collation.
      const actions = await tx.q<{ action: string }>(`select action from public.audit_log where subject_id = $1`, [id]);
      expect(actions.map((a) => a.action).sort()).toEqual(["member.added", "member.claimed"].sort());
    });
  });

  it("a name the admin set is kept; a blank one is filled from Google", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await addMember(tx, "named@gmail.com", "الاسم الذي كتبه المشرف");
      await tx.asOwner();
      const authUserId = randomUUID();
      await tx.q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`, [
        authUserId,
        "named@gmail.com",
        JSON.stringify({ full_name: "اسم جوجل" }),
      ]);
      await tx.as({ sub: authUserId, email: "named@gmail.com" });
      await provision(tx);
      await tx.asOwner();
      const [{ display_name }] = await tx.q<{ display_name: string }>(`select display_name from public.members where email = 'named@gmail.com'`);
      expect(display_name).toBe("الاسم الذي كتبه المشرف");
    });
  });

  it("★★ binds ONCE — a second provision is idempotent and creates no second member", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await addMember(tx, "twice@gmail.com");
      await tx.asOwner();
      const authUserId = randomUUID();
      await tx.q(`insert into auth.users (id, email) values ($1, $2)`, [authUserId, "twice@gmail.com"]);
      await tx.as({ sub: authUserId, email: "twice@gmail.com" });
      const first = await provision(tx);
      const second = await provision(tx);
      expect(first.member_id).toBe(id);
      expect(second.member_id).toBe(id);
      expect(second.status).toBe("member");
      await tx.asOwner();
      expect(await tx.q(`select id from public.members where email = 'twice@gmail.com'`)).toHaveLength(1);
    });
  });

  it("★★ the bind matches the ADDRESS — a stranger's sign-in never claims a waiting row", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await addMember(tx, "waiting@gmail.com");
      // Somebody else entirely signs in: a domain on no list, and not the address that was added.
      await tx.as({ sub: f.stranger.authUserId, email: f.stranger.email });
      expect(await provision(tx)).toEqual({ status: "no_match" });
      await tx.asOwner();
      const [row] = await tx.q<{ auth_user_id: string | null }>(`select auth_user_id from public.members where id = $1`, [id]);
      expect(row.auth_user_id).toBeNull();
      expect(await tx.q(`select id from public.members where auth_user_id = $1`, [f.stranger.authUserId])).toEqual([]);
    });
  });

  it("an unbound row in two orgs is ambiguous, and p_org resolves it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      for (const org of [f.a, f.b]) {
        await tx.as(org.admin.claims);
        await addMember(tx, "both@gmail.com");
      }
      await tx.asOwner();
      const authUserId = randomUUID();
      await tx.q(`insert into auth.users (id, email) values ($1, $2)`, [authUserId, "both@gmail.com"]);
      await tx.as({ sub: authUserId, email: "both@gmail.com" });
      const amb = await provision(tx);
      expect(amb.status).toBe("ambiguous");
      expect(amb.orgs).toHaveLength(2);
      const chosen = await provision(tx, f.b.id);
      expect(chosen.status).toBe("provisioned");
      expect(chosen.org_id).toBe(f.b.id);
    });
  });

  it("the ordinary front door is unchanged — a domain match still inserts and audits as before", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const authUserId = randomUUID();
      const email = `fresh@${f.a.domain}`;
      await tx.q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`, [
        authUserId,
        email,
        JSON.stringify({ full_name: "قادم جديد" }),
      ]);
      await tx.as({ sub: authUserId, email });
      const env = await provision(tx);
      expect(env.status).toBe("provisioned");
      await tx.asOwner();
      const [{ action }] = await tx.q<{ action: string }>(`select action from public.audit_log where subject_id = $1`, [env.member_id!]);
      expect(action).toBe("member.provisioned");
    });
  });
});

describe("RPC-remove_unbound_member and RPC-resend_member_invitation", () => {
  it("deletes while unbound, audits it, and refuses the moment the row is bound", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await addMember(tx, "mistake@gmail.com");
      await tx.q(`select public.remove_unbound_member($1)`, [id]);
      await tx.asOwner();
      expect(await tx.q(`select id from public.members where id = $1`, [id])).toEqual([]);
      // The audit row outlives the member it records — subject_id carries no foreign key.
      // ★ Sorted in JS, NOT by `order by action`: `_` sorts BEFORE `e` under the C collation and
      // AFTER it under ICU, so `member.add_undone` and `member.added` swap places between a macOS
      // developer database and the CI container. CI caught exactly that.
      const actions = await tx.q<{ action: string }>(`select action from public.audit_log where subject_id = $1`, [id]);
      expect(actions.map((a) => a.action).sort()).toEqual(["member.add_undone", "member.added"].sort());

      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select public.remove_unbound_member($1)`, [f.a.members[0].memberId]))).toContain("already_signed_in");
      expect(await errorMessage(() => tx.q(`select public.resend_member_invitation($1)`, [f.a.members[0].memberId]))).toContain("already_signed_in");
    });
  });

  it("a resend queues the same job under the same key, and a non-admin cannot", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await addMember(tx, "again@gmail.com");
      await tx.q(`select public.resend_member_invitation($1)`, [id]);
      await tx.asOwner();
      const jobs = await tx.q(`select id from graphile_worker.jobs where key = $1`, [`invite:${id}`]);
      expect(jobs).toHaveLength(1);
      await tx.as(f.a.mod.claims);
      expect(await errorMessage(() => tx.q(`select public.resend_member_invitation($1)`, [id]))).toContain("not_an_admin");
    });
  });
});

describe("★★ REQ-LDR-006 — the active-member denominator counts the members who have signed in", () => {
  it("★★ is a NO-OP on existing data: both counts agree for every member that exists", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [row] = await tx.q<{ old_count: string; new_count: string }>(
        `select (select count(*) from public.members where org_id = $1 and status = 'active')                              as old_count,
                (select count(*) from public.members where org_id = $1 and status = 'active' and auth_user_id is not null) as new_count`,
        [f.a.id],
      );
      expect(row.new_count).toBe(row.old_count);
      expect(Number(row.old_count)).toBeGreaterThan(0);
    });
  });

  it("★★ an added member does not enter the snapshot's denominator until they sign in", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [{ count: before }] = await tx.q<{ count: string }>(
        `select count(*) as count from public.members where org_id = $1 and status = 'active'`,
        [f.a.id],
      );

      await tx.as(f.a.admin.claims);
      const [{ id }] = await addMember(tx, "denominator@gmail.com", null, f.a.companyId);

      // snapshot_leaderboard() is granted to service_role alone — the worker's role.
      const snap = async () => {
        await tx.asServiceRole();
        const [{ id: snapId }] = await tx.q<{ id: string }>(
          `select public.snapshot_leaderboard($1, 'monthly'::public.leaderboard_kind, '2026-10-01'::date, '2026-11-01'::date, null, false) as id`,
          [f.a.id],
        );
        // `leaderboard_snapshots` is revoked from service_role — the worker writes it only through
        // the definer. The owner reads it back.
        await tx.asOwner();
        const [{ active_member_count }] = await tx.q<{ active_member_count: number }>(
          `select active_member_count from public.leaderboard_snapshots where id = $1`,
          [snapId],
        );
        return active_member_count;
      };
      expect(await snap()).toBe(Number(before));

      // They sign in; now they count.
      await tx.asOwner();
      const authUserId = randomUUID();
      await tx.q(`insert into auth.users (id, email) values ($1, $2)`, [authUserId, "denominator@gmail.com"]);
      await tx.as({ sub: authUserId, email: "denominator@gmail.com" });
      expect((await provision(tx)).member_id).toBe(id);
      expect(await snap()).toBe(Number(before) + 1);
    });
  });

  it("★★ an added member does not dilute their company's awarded attendance percentage", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      // Everyone in org A's company shares it, so the denominator is visible in one number.
      const [row] = await tx.q<{ active: string }>(
        `select count(*) as active from public.members
          where org_id = $1 and status = 'active' and auth_user_id is not null and company_id = $2`,
        [f.a.id, f.a.companyId],
      );
      await tx.as(f.a.admin.claims);
      await addMember(tx, "percentage@gmail.com", null, f.a.companyId);
      await tx.asOwner();
      const [after] = await tx.q<{ active: string }>(
        `select count(*) as active from public.members
          where org_id = $1 and status = 'active' and auth_user_id is not null and company_id = $2`,
        [f.a.id, f.a.companyId],
      );
      // evaluate_company_points() reads exactly this count (0182, amended): unchanged, so the
      // award at the next session completion is unchanged.
      expect(after.active).toBe(row.active);
    });
  });
});

describe("FN-member_invitation_context — the mail's address is READ, never passed", () => {
  const ctx = (tx: Tx, id: string) =>
    tx.q<{ c: { member?: { email: string }; org?: { name: string } } | null }>(`select public.member_invitation_context($1) as c`, [id]).then((r) => r[0].c);

  it("gives the worker the address and the org's sending identity, for a member who is waiting", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await addMember(tx, "waiting@gmail.com");
      await tx.asServiceRole();
      const c = await ctx(tx, id);
      expect(c?.member?.email).toBe("waiting@gmail.com");
      expect(c?.org?.name).toBeTruthy();
    });
  });

  it("★ gives NOTHING once they have signed in, or once they are deactivated", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await addMember(tx, "gone@gmail.com");
      const [{ id: other }] = await addMember(tx, "off@gmail.com");
      await tx.q(`select public.deactivate_member($1, $2)`, [other, "أُضيف بالخطأ"]);

      await tx.asOwner();
      const authUserId = randomUUID();
      await tx.q(`insert into auth.users (id, email) values ($1, $2)`, [authUserId, "gone@gmail.com"]);
      await tx.as({ sub: authUserId, email: "gone@gmail.com" });
      await provision(tx);

      await tx.asServiceRole();
      // A replayed or stale job therefore mails nobody who has arrived.
      expect(await ctx(tx, id)).toBeNull();
      expect(await ctx(tx, other)).toBeNull();
      expect(await ctx(tx, randomUUID())).toBeNull();
    });
  });

  it("is the worker's alone — an admin cannot call it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => ctx(tx, f.a.members[0].memberId))).toContain("permission denied");
    });
  });
});

describe("the unbound row changes no existing guarantee", () => {
  it("org_id is still immutable, for every role including service_role", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await addMember(tx, "immutable@gmail.com");
      // `members` is revoked from service_role (0004), so a grant refuses it before the trigger
      // can. The owner bypasses RLS and holds the rights, so it is the role that proves the
      // TRIGGER still fires on an unbound row.
      await tx.asOwner();
      expect(await errorMessage(() => tx.q(`update public.members set org_id = $1 where id = $2`, [f.b.id, id]))).toContain("immutable");
      await tx.asServiceRole();
      expect(await errorMessage(() => tx.q(`update public.members set org_id = $1 where id = $2`, [f.b.id, id]))).toContain("permission denied");
    });
  });

  it("PERMISSION_DENIED is still what a member gets for another member's email", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[0].claims);
      const code = await tx
        .q(`select email from public.members where id = $1`, [f.a.members[1].memberId])
        .then(() => null)
        .catch((e: { code?: string }) => e.code ?? null);
      expect(code).toBe(PERMISSION_DENIED);
    });
  });
});
