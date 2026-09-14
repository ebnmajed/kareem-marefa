// notify (wave 2, M3) — supabase/proposed/notify/0001_notification_contract.sql:
// the six M3 tables of 02 §4.14, the 08 §1 matrix, and public.notify().
//
// 03 §8.2 rows proven here:
//   POL-notifications.select.self · POL-notifications.insert ·
//   POL-notifications.update.read_at · POL-notification_preferences.self ·
//   POL-notification_preferences.not_switchable ·
//   POL-notification_templates.select.admin ·
//   POL-notification_templates.required_fields · POL-notification_templates.matrix ·
//   POL-email_deliveries.select.admin · POL-calendar_connections.select ·
//   POL-calendar_connections.delete · POL-calendar_events.select.self ·
//   RPC-notify.matrix_closed · RPC-notify.preference · RPC-notify.non_optional ·
//   RPC-notify.definer_only · RPC-notify.enqueues_in_transaction
//
// The proposed file is applied inside each test's transaction and rolled back
// with it (DEC-040), so nothing here touches the shared database. The
// graphile_worker schema is installed by scripts/rls.mjs locally and by CI's
// `rls` job, and every job enqueued below vanishes at rollback.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

// Promoted as migration 0026 at wave-2 sync 1: the contract is applied by
// `supabase db reset`, so nothing here applies it.
//
// The M3 fixture (tests/rls/fixture-m3.ts) seeds one row in every notify
// table on BOTH orgs, so the generated isolation sweep is never vacuous.
// These per-policy cases arrange their own world instead — a case that
// asserts "the member sees exactly their own row" cannot also be counting
// someone else's history — so they clear those rows first, as the owner,
// inside the same transaction that rolls back at the end of the test.
const M3_TABLES = [
  "email_deliveries",
  "notifications",
  "notification_preferences",
  "notification_templates",
  "calendar_events",
  "calendar_connections",
] as const;

async function setup(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  for (const table of M3_TABLES) await tx.q(`delete from public.${table}`);
  // Deleting calendar_connections above fired 0038's disconnect notice into the
  // inbox just emptied; clear the inbox once more, last.
  await tx.q(`delete from public.notifications`);
  // Since 0034 the fixture's RSVP inserts enqueue notices of their own; the
  // queue assertions below count only what THIS case enqueues.
  await tx.q(`delete from graphile_worker._private_jobs`);
  return f;
}

/** notify(), as the owner — which is how a definer RPC reaches it. */
const notify = (tx: Tx, org: string, member: string, category: string | null, payload: object, key: string) =>
  tx.q<{ id: string | null }>(`select public.notify($1, $2, $3, $4::jsonb, $5) as id`, [
    org,
    member,
    category,
    JSON.stringify(payload),
    key,
  ]);

// graphile-worker 0.18 splits the queue: `graphile_worker.jobs` is a VIEW
// with no `payload` column, which lives on `_private_jobs`. Joining on id is
// the only way to assert what was enqueued.
const jobsFor = (tx: Tx, key: string) =>
  tx.q<{ task_identifier: string; payload: Record<string, unknown> }>(
    `select j.task_identifier, p.payload
       from graphile_worker.jobs j join graphile_worker._private_jobs p on p.id = j.id
      where j.key = $1`,
    [key],
  );

/** Every pending send_notification job's payload, in one query. */
const sendJobs = (tx: Tx) =>
  tx.q<{ payload: Record<string, unknown> }>(
    `select p.payload
       from graphile_worker.jobs j join graphile_worker._private_jobs p on p.id = j.id
      where j.task_identifier = 'send_notification'`,
  );

// ═══════════════════════════════════════════════════════════════════════════
// The matrix — 08 §1 is normative, so the function is diffed against it here
// rather than trusted.
// ═══════════════════════════════════════════════════════════════════════════
describe("notification_matrix — 08 §1", () => {
  it("carries every message in the document and nothing else", async () => {
    await withTx(async (tx) => {
      const rows = await tx.q<{ key: string }>(`select key from public.notification_matrix() order by key`);
      // 38 in 08 §1 as settled, plus MSG-reminder_generic (§1.2's fourth
      // reminder, DEC-047 → migration 0062).
      expect(rows).toHaveLength(39);
      expect(rows.map((r) => r.key)).toContain("MSG-reminder_generic");
      // A message in no category cannot have a preference; a category outside
      // 08 §2 cannot be stored by notification_preferences' check constraint.
      const bad = await tx.q(
        `select key from public.notification_matrix()
          where category not in ('new_sessions','my_sessions','reminders','ratings','social',
                                 'recognition','certificates','moderation','proposals',
                                 'admin_queue','account')`,
      );
      expect(bad).toEqual([]);
      // REQ-NTF-001: two channels and only two, and no message with neither.
      expect(await tx.q(`select key from public.notification_matrix() where not in_app and not email`)).toEqual([]);
    });
  });

  it("marks 08 §1.7's set non-optional, and every message of a not-switchable category with it", async () => {
    await withTx(async (tx) => {
      const nonOptional = (
        await tx.q<{ key: string }>(`select key from public.notification_matrix() where not optional order by key`)
      ).map((r) => r.key);
      // 08 §1.7, verbatim. The heading says "eleven"; the list enumerates these.
      expect(nonOptional).toEqual([
        "MSG-account_deactivated",
        "MSG-calendar_disconnected",
        "MSG-certificate_issued",
        "MSG-certificate_revoked",
        "MSG-content_removed",
        "MSG-copresenter_invited",
        "MSG-export_ready",
        "MSG-photo_hidden",
        "MSG-points_adjusted",
        "MSG-presenter_assigned",
        "MSG-proposal_approved",
        "MSG-proposal_changes",
        "MSG-proposal_rejected",
        "MSG-role_changed",
        "MSG-rsvp_promoted",
        "MSG-session_cancelled",
        "MSG-session_changed",
      ]);
      // 08 §2 calls three categories "not switchable" — so no message in one
      // may be optional, or the screen's fixed row would be a lie.
      expect(
        await tx.q(
          `select key from public.notification_matrix()
            where optional and category in ('certificates', 'moderation', 'account')`,
        ),
      ).toEqual([]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// notifications — REQ-NTF-006
// ═══════════════════════════════════════════════════════════════════════════
describe("POL-notifications", () => {
  it("select.self — a member cannot read another's, in their org or any other", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await notify(tx, f.a.id, f.a.members[0].memberId, null, {}, "MSG-badge_earned");
      await notify(tx, f.a.id, f.a.members[1].memberId, null, {}, "MSG-badge_earned");
      await notify(tx, f.b.id, f.b.members[0].memberId, null, {}, "MSG-badge_earned");

      await tx.as(f.a.members[0].claims);
      const mine = await tx.q<{ member_id: string }>(`select member_id from public.notifications`);
      expect(mine).toHaveLength(1);
      expect(mine[0].member_id).toBe(f.a.members[0].memberId);

      // The org's admin is not an exception: P7 is self-read, full stop.
      await tx.as(f.a.admin.claims);
      expect(await tx.q(`select id from public.notifications`)).toEqual([]);
    });
  });

  it("insert — no role may insert, including the admin and service_role", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const row = `insert into public.notifications (org_id, member_id, key) values ('${f.a.id}', '${f.a.members[0].memberId}', 'MSG-badge_earned')`;
      for (const who of [f.a.members[0].claims, f.a.admin.claims]) {
        await tx.as(who);
        expect(await errorCode(() => tx.q(row))).toBe(PERMISSION_DENIED);
      }
      await tx.asAnon();
      expect(await errorCode(() => tx.q(row))).toBe(PERMISSION_DENIED);
      await tx.asServiceRole();
      expect(await errorCode(() => tx.q(row))).toBe(PERMISSION_DENIED);
    });
  });

  it("update.read_at — a member marks their own row read and can change nothing else", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [n] = await notify(tx, f.a.id, f.a.members[0].memberId, null, {}, "MSG-badge_earned");

      await tx.as(f.a.members[0].claims);
      await tx.q(`update public.notifications set read_at = now() where id = $1`, [n.id]);
      expect((await tx.q<{ read_at: string }>(`select read_at from public.notifications where id = $1`, [n.id]))[0].read_at).not.toBeNull();

      // The column grant is the boundary: the inbox stays a record of what was
      // actually sent, not something its recipient can rewrite.
      expect(await errorCode(() => tx.q(`update public.notifications set key = 'MSG-role_changed' where id = $1`, [n.id]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`update public.notifications set payload = '{}'::jsonb where id = $1`, [n.id]))).toBe(PERMISSION_DENIED);

      // Another member's row is outside the policy, so the update matches nothing.
      await tx.as(f.a.members[1].claims);
      await tx.q(`update public.notifications set read_at = null where id = $1`, [n.id]);
      expect((await tx.q<{ read_at: string }>(`select read_at from public.notifications where id = $1`, [n.id]))[0]).toBeUndefined();
      await tx.asOwner();
      expect((await tx.q<{ read_at: string | null }>(`select read_at from public.notifications where id = $1`, [n.id]))[0].read_at).not.toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// notification_preferences — REQ-NTF-003
// ═══════════════════════════════════════════════════════════════════════════
describe("POL-notification_preferences", () => {
  it("self — a member reads and writes only their own", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[0].claims);
      await tx.q(
        `insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
         values ($1, $2, 'reminders', 'email', false)`,
        [f.a.id, f.a.members[0].memberId],
      );
      expect(await tx.q(`select id from public.notification_preferences`)).toHaveLength(1);

      // Writing a row for someone else fails the WITH CHECK, not silently.
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
             values ($1, $2, 'reminders', 'email', false)`,
            [f.a.id, f.a.members[1].memberId],
          ),
        ),
      ).toBe(PERMISSION_DENIED);

      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.notification_preferences`)).toEqual([]);
    });
  });

  it("not_switchable — a row disabling certificates, moderation or account is refused (08 §2)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[0].claims);
      for (const category of ["certificates", "moderation", "account"]) {
        expect(
          await errorCode(() =>
            tx.q(
              `insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
               values ($1, $2, $3, 'in_app', false)`,
              [f.a.id, f.a.members[0].memberId, category],
            ),
          ),
        ).toBe("23514");
        // Enabling one is fine — the screen renders it fixed, not absent.
        await tx.q(
          `insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
           values ($1, $2, $3, 'in_app', true)`,
          [f.a.id, f.a.members[0].memberId, category],
        );
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// notification_templates — REQ-NTF-007, REQ-NTF-002
// ═══════════════════════════════════════════════════════════════════════════
describe("POL-notification_templates", () => {
  const insert = (tx: Tx, org: string, key: string, channel: string, subject: string | null, body: string, fields: string[]) =>
    tx.q(
      `insert into public.notification_templates (org_id, key, channel, subject, body, required_fields)
       values ($1, $2, $3::public.notify_channel, $4, $5, $6)`,
      [org, key, channel, subject, body, fields],
    );

  it("select.admin — the org admin reads templates, a plain member reads none", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await insert(tx, f.a.id, "MSG-rsvp_promoted", "email", "حصلت على مقعد في {{title}}", "مرحبًا {{name}}", ["title", "name"]);
      expect(await tx.q(`select id from public.notification_templates`)).toHaveLength(1);

      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.notification_templates`)).toEqual([]);
      expect(await errorCode(() => insert(tx, f.a.id, "MSG-badge_earned", "in_app", null, "نص", []))).toBe(PERMISSION_DENIED);

      // Another org's admin sees nothing — the template is org data.
      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select id from public.notification_templates`)).toEqual([]);
    });
  });

  it("required_fields — a body missing a declared field is refused before it is saved", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(
        await errorCode(() => insert(tx, f.a.id, "MSG-session_changed", "email", "تغيّرت تفاصيل جلسة {{title}}", "الموعد الجديد", ["title", "new.startsAt"])),
      ).toBe("23514");
      // The same template with the field present saves.
      await insert(tx, f.a.id, "MSG-session_changed", "email", "تغيّرت تفاصيل جلسة {{title}}", "الموعد الجديد {{new.startsAt}}", ["title", "new.startsAt"]);
      // And an update that deletes the field is refused too, not only an insert.
      expect(
        await errorCode(() => tx.q(`update public.notification_templates set body = 'الموعد تغيّر' where key = 'MSG-session_changed'`)),
      ).toBe("23514");
    });
  });

  it("matrix — a key or a channel 08 §1 does not list is refused (REQ-NTF-002)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => insert(tx, f.a.id, "MSG-sms_blast", "email", "س", "نص", []))).toBe("22023");
      // MSG-photo_hidden is in-app only in 08 §1.4; an email template for it
      // would be a promise the send path cannot keep.
      expect(await errorCode(() => insert(tx, f.a.id, "MSG-photo_hidden", "email", "س", "نص", []))).toBe("22023");
      await insert(tx, f.a.id, "MSG-photo_hidden", "in_app", null, "أُخفيت صورتك", []);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// email_deliveries — REQ-NTF-008
// ═══════════════════════════════════════════════════════════════════════════
describe("POL-email_deliveries.select.admin", () => {
  it("the admin sees a bounce with its reason; the recipient sees nothing", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(
        `insert into public.email_deliveries (org_id, member_id, key, status, error, provider_message_id)
         values ($1, $2, 'MSG-rsvp_promoted', 'bounced', 'mailbox full', 'msg_1')`,
        [f.a.id, f.a.members[0].memberId],
      );

      await tx.as(f.a.admin.claims);
      const seen = await tx.q<{ error: string }>(`select error from public.email_deliveries`);
      expect(seen).toHaveLength(1);
      expect(seen[0].error).toBe("mailbox full");

      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.email_deliveries`)).toEqual([]);
      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select id from public.email_deliveries`)).toEqual([]);
      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select id from public.email_deliveries`)).toEqual([]);
    });
  });

  it("no client role writes it — the worker's transport does", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.email_deliveries (org_id, member_id, key) values ($1, $2, 'MSG-badge_earned')`, [
            f.a.id,
            f.a.members[0].memberId,
          ]),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calendar_connections — REQ-CAL-003, REQ-CAL-007, 03 §5.9c, A33
// ═══════════════════════════════════════════════════════════════════════════
describe("POL-calendar_connections", () => {
  const connect = (tx: Tx, org: string, member: string) =>
    tx.q(
      `insert into public.calendar_connections (org_id, member_id, access_token_encrypted, refresh_token_encrypted, scope)
       values ($1, $2, 'enc:access', 'enc:refresh', 'https://www.googleapis.com/auth/calendar.events')`,
      [org, member],
    );

  it("select — NO role reads a token column, the owning member least of all", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await connect(tx, f.a.id, f.a.members[0].memberId);

      // The member the token belongs to: the four status columns, and 42501 on
      // anything else. `select *` is the shape a careless DAL would write.
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select member_id, provider, connected_at, disconnected_at from public.calendar_connections`)).toHaveLength(1);
      expect(await errorCode(() => tx.q(`select * from public.calendar_connections`))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`select access_token_encrypted from public.calendar_connections`))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`select refresh_token_encrypted from public.calendar_connections`))).toBe(PERMISSION_DENIED);

      // The one place admin access is NARROWER than member self-access.
      for (const who of [f.a.admin.claims, f.a.mod.claims]) {
        await tx.as(who);
        expect(await errorCode(() => tx.q(`select access_token_encrypted from public.calendar_connections`))).toBe(PERMISSION_DENIED);
        expect(await tx.q(`select member_id from public.calendar_connections`)).toEqual([]);
      }
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select member_id from public.calendar_connections`))).toBe(PERMISSION_DENIED);
    });
  });

  it("delete — disconnect removes the row immediately, and nobody updates it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await connect(tx, f.a.id, f.a.members[0].memberId);
      await connect(tx, f.a.id, f.a.members[1].memberId);

      await tx.as(f.a.members[0].claims);
      // REQ-CAL-007: deleted, not flagged — the tokens are gone, not retained.
      await tx.q(`delete from public.calendar_connections`);
      await tx.asOwner();
      const left = await tx.q<{ member_id: string }>(`select member_id from public.calendar_connections`);
      expect(left).toHaveLength(1);
      expect(left[0].member_id).toBe(f.a.members[1].memberId);

      // A member cannot forge a connection or overwrite someone's token.
      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => connect(tx, f.a.id, f.a.members[0].memberId))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`update public.calendar_connections set access_token_encrypted = 'mine'`))).toBe(PERMISSION_DENIED);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calendar_events — REQ-CAL-004, REQ-CAL-005
// ═══════════════════════════════════════════════════════════════════════════
describe("POL-calendar_events.select.self", () => {
  it("a member sees their own sync state and error, and writes nothing", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const ev = (org: string, member: string, session: string, state: string) =>
        tx.q(
          `insert into public.calendar_events (org_id, member_id, session_id, state, error)
           values ($1, $2, $3, $4::public.calendar_sync_state, 'rateLimitExceeded')`,
          [org, member, session, state],
        );
      await ev(f.a.id, f.a.members[0].memberId, f.m2.a.published, "failed");
      await ev(f.a.id, f.a.members[1].memberId, f.m2.a.published, "synced");

      await tx.as(f.a.members[0].claims);
      const own = await tx.q<{ error: string; member_id: string }>(`select member_id, error from public.calendar_events`);
      expect(own).toHaveLength(1);
      expect(own[0].member_id).toBe(f.a.members[0].memberId);
      expect(own[0].error).toBe("rateLimitExceeded"); // REQ-CAL-005 surfaces it
      expect(
        await errorCode(() =>
          tx.q(`insert into public.calendar_events (org_id, member_id, session_id) values ($1, $2, $3)`, [
            f.a.id,
            f.a.members[0].memberId,
            f.m2.a.completed,
          ]),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });

  it("one calendar event per member per session, by constraint (REQ-CAL-004)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const row = `insert into public.calendar_events (org_id, member_id, session_id) values ('${f.a.id}', '${f.a.members[0].memberId}', '${f.m2.a.published}')`;
      await tx.q(row);
      expect(await errorCode(() => tx.q(row))).toBe("23505");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// public.notify() — the contract scoring and content call
// ═══════════════════════════════════════════════════════════════════════════
describe("RPC-notify", () => {
  it("matrix_closed — a key outside 08 §1 raises instead of inventing a message", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      expect(await errorCode(() => notify(tx, f.a.id, f.a.members[0].memberId, null, {}, "MSG-nudge_by_sms"))).toBe("22023");
      // A stated category that disagrees with the matrix is a bug at the call
      // site, and sending under the wrong preference is the damage it does.
      expect(await errorCode(() => notify(tx, f.a.id, f.a.members[0].memberId, "my_sessions", {}, "MSG-badge_earned"))).toBe("22023");
      // A recipient who is not in the named org never gets the message.
      expect(await errorCode(() => notify(tx, f.a.id, f.b.members[0].memberId, null, {}, "MSG-badge_earned"))).toBe("P0002");
    });
  });

  it("definer_only — no client role may call it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      for (const who of [f.a.members[0].claims, f.a.mod.claims, f.a.admin.claims]) {
        await tx.as(who);
        expect(await errorCode(() => notify(tx, f.a.id, f.a.members[1].memberId, null, {}, "MSG-badge_earned"))).toBe(PERMISSION_DENIED);
      }
      await tx.asAnon();
      expect(await errorCode(() => notify(tx, f.a.id, f.a.members[1].memberId, null, {}, "MSG-badge_earned"))).toBe(PERMISSION_DENIED);
      await tx.asServiceRole();
      expect((await notify(tx, f.a.id, f.a.members[1].memberId, null, {}, "MSG-badge_earned"))[0].id).not.toBeNull();
    });
  });

  it("enqueues_in_transaction — the row and its notify:{message_id} job arrive together", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [{ id }] = await notify(
        tx,
        f.a.id,
        f.a.members[0].memberId,
        "my_sessions",
        { session_id: f.m2.a.published, title: "جلسة منشورة" },
        "MSG-rsvp_promoted",
      );
      expect(id).not.toBeNull();

      // 02 §4.14 gives the row a session_id so the inbox can link back.
      const [row] = await tx.q<{ key: string; session_id: string; read_at: string | null }>(
        `select key, session_id, read_at from public.notifications where id = $1`,
        [id],
      );
      expect(row.key).toBe("MSG-rsvp_promoted");
      expect(row.session_id).toBe(f.m2.a.published);
      expect(row.read_at).toBeNull();

      const jobs = await jobsFor(tx, `notify:${id}`);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].task_identifier).toBe("send_notification");
      expect(jobs[0].payload).toMatchObject({
        member_id: f.a.members[0].memberId,
        org_id: f.a.id,
        key: "MSG-rsvp_promoted",
        category: "my_sessions",
        in_app: true,
        email: true,
      });
    });
  });

  it("preference — a disabled category is a no-op, on the channel it was disabled", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const me = f.a.members[0];
      await tx.as(me.claims);
      // Inbox off for recognition, email kept.
      await tx.q(
        `insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
         values ($1, $2, 'recognition', 'in_app', false)`,
        [f.a.id, me.memberId],
      );

      await tx.asOwner();
      const [half] = await notify(tx, f.a.id, me.memberId, "recognition", {}, "MSG-badge_earned");
      // No inbox row — REQ-NTF-003 says "including to the in-app inbox".
      expect(half.id).toBeNull();
      expect(await tx.q(`select id from public.notifications`)).toEqual([]);
      // …but the mail still goes, on a job key that did not need the row id.
      const emailOnly = await sendJobs(tx);
      expect(emailOnly).toHaveLength(1);
      expect(emailOnly[0].payload).toMatchObject({ in_app: false, email: true });

      // Both channels off: nothing at all, and NOT an error — the caller's
      // award must not roll back because a member muted a category.
      await tx.as(me.claims);
      await tx.q(
        `insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
         values ($1, $2, 'recognition', 'email', false)`,
        [f.a.id, me.memberId],
      );
      await tx.asOwner();
      expect((await notify(tx, f.a.id, me.memberId, "recognition", {}, "MSG-level_reached"))[0].id).toBeNull();
      expect(await sendJobs(tx)).toHaveLength(1);
    });
  });

  it("non_optional — 08 §1.7's set ignores the preference on both channels", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const me = f.a.members[0];
      await tx.as(me.claims);
      // `proposals` IS switchable, so both rows store — and MSG-proposal_approved
      // is non-optional, so both are ignored.
      for (const channel of ["in_app", "email"]) {
        await tx.q(
          `insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
           values ($1, $2, 'proposals', $3::public.notify_channel, false)`,
          [f.a.id, me.memberId, channel],
        );
      }

      await tx.asOwner();
      const [{ id }] = await notify(tx, f.a.id, me.memberId, "proposals", { title: "مقترحي" }, "MSG-proposal_approved");
      expect(id).not.toBeNull();
      const jobs = await jobsFor(tx, `notify:${id}`);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].payload).toMatchObject({ in_app: true, email: true, optional: false });

      // The optional message in the same category is suppressed, which is what
      // makes the line above a real test of the bypass and not of nothing.
      expect((await notify(tx, f.a.id, me.memberId, "proposals", {}, "MSG-copresenter_declined"))[0].id).toBeNull();
    });
  });

  it("absence means on — a member who never opened the screen receives everything", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      expect(await tx.q(`select id from public.notification_preferences`)).toEqual([]);
      for (const key of ["MSG-session_published", "MSG-reminder_1d", "MSG-comment_reply"]) {
        expect((await notify(tx, f.a.id, f.a.members[0].memberId, null, {}, key))[0].id).not.toBeNull();
      }
      expect(await tx.q(`select id from public.notifications`)).toHaveLength(3);
    });
  });
});
