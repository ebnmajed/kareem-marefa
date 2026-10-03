// notify (wave 22, SCR-063) — supabase/proposed/notify/save_org_settings.sql: one save of the settings page in one
// transaction, answering what it wrote (REQ-UIX-091, REQ-UIX-102, REQ-TEN-008, REQ-TEN-007, DEC-232 §3, §5.1).
//
// Every write as the org's ADMIN or MODERATOR through RLS — never as the owner — because the function is SECURITY
// INVOKER: the policies and the column grants are the boundary, and these cases prove they still are.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(async () => {
  const { pool } = await import("./db");
  await pool.end();
});

type Answer = { ok: boolean; error?: string; fields?: string[]; at?: string; wrote?: string[] };

async function setup(tx: Tx) {
  const f = await seed(tx);
  // `org.renamed` is the lead's trigger, in the audit migration. On a stack where A's migration is already applied the
  // proposed copy in this tree would be a second `create function`, so it is applied only where the trigger is absent.
  await tx.asOwner();
  const [{ present }] = await tx.q<{ present: boolean }>(`select to_regprocedure('public.orgs_rename_audit()') is not null as present`);
  if (!present) await applyProposed(tx, "lead/console_audit.sql");
  await applyProposed(tx, "notify/save_org_settings.sql");
  return f;
}

async function save(tx: Tx, args: { changes?: object; expected?: object; name?: string | null; expectedName?: string | null; add?: string[]; remove?: string[] }): Promise<Answer> {
  const [{ r }] = await tx.q<{ r: Answer }>(`select public.save_org_settings($1::jsonb, $2::jsonb, $3, $4, $5::text[], $6::uuid[]) as r`, [
    JSON.stringify(args.changes ?? {}),
    JSON.stringify(args.expected ?? {}),
    args.name ?? null,
    args.expectedName ?? null,
    args.add ?? [],
    args.remove ?? [],
  ]);
  return r;
}

describe("save_org_settings — one save, one transaction, its own receipt", () => {
  it("an admin's save writes only what changed, and answers exactly the records the triggers wrote", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const answer = await save(tx, {
        changes: { time_zone: "Asia/Dubai", rating_min_aggregate: 3 },
        expected: { time_zone: "Asia/Riyadh", rating_min_aggregate: 3 },
        name: "كريم معرفة الجديدة",
        expectedName: f.a.name,
        add: ["new-domain.example"],
      });
      expect(answer.ok).toBe(true);
      // rating_min_aggregate was sent at its stored value: it wrote nothing, so it is not in the receipt.
      expect(answer.wrote).toEqual(["domain.added", "org.renamed", "time_zone"]);

      await tx.asOwner();
      const history = await tx.q<{ field: string; old_value: string; new_value: string; actor_id: string }>(
        `select field, old_value #>> '{}' as old_value, new_value #>> '{}' as new_value, actor_id from public.scoring_config_history
          where org_id = $1 and scope = 'org_settings' and changed_at = $2::timestamptz and actor_id = $3`,
        [f.a.id, answer.at, f.a.admin.memberId],
      );
      expect(history).toEqual([{ field: "time_zone", old_value: "Asia/Riyadh", new_value: "Asia/Dubai", actor_id: f.a.admin.memberId }]);
      // `occurred_at` is `clock_timestamp()`: the save's rows are those since its transaction began, in the org.
      const audit = await tx.q<{ action: string; actor_id: string }>(
        `select action, actor_id from public.audit_log where org_id = $1 and occurred_at >= $2::timestamptz
            and action in ('domain.added', 'org.renamed') and actor_id = $3 order by action`,
        [f.a.id, answer.at, f.a.admin.memberId],
      );
      expect(audit).toEqual([
        { action: "domain.added", actor_id: f.a.admin.memberId },
        { action: "org.renamed", actor_id: f.a.admin.memberId },
      ]);
    });
  });

  it("a save that changes nothing answers an empty receipt and writes no record", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const answer = await save(tx, { changes: { time_zone: "Asia/Riyadh" }, expected: { time_zone: "Asia/Riyadh" } });
      expect(answer).toMatchObject({ ok: true, wrote: [] });
    });
  });

  it("a field another admin changed since the page opened is refused as stale, and NOTHING is written", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`update public.org_settings set max_co_presenters = 6 where org_id = $1`, [f.a.id]);
      const answer = await save(tx, {
        changes: { max_co_presenters: 2, time_zone: "Asia/Dubai" },
        expected: { max_co_presenters: 4, time_zone: "Asia/Riyadh" },
      });
      expect(answer).toEqual({ ok: false, error: "stale", fields: ["max_co_presenters"] });
      const [{ tz }] = await tx.q<{ tz: string }>(`select time_zone as tz from public.org_settings where org_id = $1`, [f.a.id]);
      expect(tz).toBe("Asia/Riyadh");
    });
  });

  it("a moderator is refused before any write (REQ-ADM-020)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.mod.claims);
      expect(await save(tx, { changes: { time_zone: "Asia/Dubai" }, expected: { time_zone: "Asia/Riyadh" } })).toEqual({ ok: false, error: "not_permitted" });
      await tx.asOwner();
      const rows = await tx.q(`select 1 from public.scoring_config_history where org_id = $1 and field = 'time_zone' and actor_id = $2`, [f.a.id, f.a.mod.memberId]);
      expect(rows).toEqual([]);
    });
  });

  it("the org's last domain cannot be removed; removing one of two is audited", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const domains = await tx.q<{ id: string }>(`select id from public.org_domains where org_id = $1`, [f.a.id]);
      expect(await save(tx, { remove: domains.map((d) => d.id) })).toEqual({ ok: false, error: "domain_last" });

      // A second domain, added by the owner: every save in one test transaction shares now(), so the receipt below must
      // not see it — and it does not, because the receipt counts this actor's rows only.
      await tx.asOwner();
      await tx.q(`insert into public.org_domains (org_id, domain) values ($1, 'second.example')`, [f.a.id]);
      await tx.as(f.a.admin.claims);
      const removed = await save(tx, { remove: [domains[0].id] });
      expect(removed).toMatchObject({ ok: true, wrote: ["domain.removed"] });
    });
  });

  it("a field the page does not own is refused, by name", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await save(tx, { changes: { reminder_offsets_minutes: [60] }, expected: {} })).toEqual({ ok: false, error: "unknown_field", field: "reminder_offsets_minutes" });
    });
  });
});
