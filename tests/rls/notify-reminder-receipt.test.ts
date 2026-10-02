// notify (wave 22, SCR-060, `DEC-232` §1.3 and §3) — no new SQL; this proves the identities the page's receipt and its
// fixed rows stand on, against the real functions and triggers, as the org's ADMIN (never the owner) where a write is
// concerned:
//   1 · a save's history rows carry `changed_at` = the settings row's new `updated_at` (the receipt's identity);
//   2 · a save that changes nothing writes no history row (the empty receipt, «لم يتغيّر شيء»);
//   3 · a moderator's save matches no row (`REQ-ADM-020`) — the DAL reports «not written», never success;
//   4 · the `expected` guard: an update conditioned on a schedule another admin already changed matches no row;
//   5 · `rows.ts`' three bands are `reminder_message_key()`'s, edge for edge (`0062:28-30`) — the copy cannot drift.
import { afterAll, describe, expect, it } from "vitest";
import { withTx } from "./db";
import { seed } from "./fixture";
import { REMINDER_ROWS } from "@/app/[locale]/app/admin/reminders/rows";

afterAll(async () => {
  const { pool } = await import("./db");
  await pool.end();
});

const MESSAGE: Record<string, string> = { week: "MSG-reminder_7d", day: "MSG-reminder_1d", hours: "MSG-reminder_2h" };

describe("SCR-060's receipt — the history rows a save wrote", () => {
  it("an admin's save writes one history row per changed column, each at the row's new updated_at, naming the admin", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [row] = await tx.q<{ id: string; updated_at: string }>(
        `update public.org_settings set reminder_offsets_minutes = '{10080,1440}', rating_prompt_delay_minutes = 60
          where org_id = $1 returning id, updated_at::text as updated_at`,
        [f.a.id],
      );
      expect(row).toBeTruthy();
      const written = await tx.q<{ field: string; actor_id: string }>(
        `select field, actor_id from public.scoring_config_history
          where org_id = $1 and scope = 'org_settings' and entity_id = $2 and changed_at = $3`,
        [f.a.id, row.id, row.updated_at],
      );
      // `::text`, not a JS Date: a Date keeps milliseconds and the identity is to the microsecond (PostgREST returns the
      // text, so the DAL's receipt keeps it too). The prompt was already 60: only the offsets changed, so only they were written.
      expect(written).toEqual([{ field: "reminder_offsets_minutes", actor_id: f.a.admin.memberId }]);
    });
  });

  it("a save that changes nothing writes no history row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [row] = await tx.q<{ id: string; updated_at: string }>(
        `update public.org_settings set reminder_offsets_minutes = reminder_offsets_minutes where org_id = $1 returning id, updated_at::text as updated_at`,
        [f.a.id],
      );
      const written = await tx.q(`select 1 from public.scoring_config_history where entity_id = $1 and changed_at = $2`, [row.id, row.updated_at]);
      expect(written).toEqual([]);
    });
  });

  it("a moderator's save matches no row — nothing written, nothing recorded", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.mod.claims);
      const rows = await tx.q(`update public.org_settings set reminder_offsets_minutes = '{60}' where org_id = $1 returning id`, [f.a.id]);
      expect(rows).toEqual([]);
      await tx.asOwner();
      const [{ offsets }] = await tx.q<{ offsets: number[] }>(`select reminder_offsets_minutes as offsets from public.org_settings where org_id = $1`, [f.a.id]);
      expect(offsets).not.toEqual([60]);
    });
  });

  it("the stale guard: a save conditioned on the schedule the page opened with matches no row once another admin changed it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`update public.org_settings set reminder_offsets_minutes = '{10080,1440,180}' where org_id = $1`, [f.a.id]);
      const rows = await tx.q(
        `update public.org_settings set reminder_offsets_minutes = '{10080,1440}'
          where org_id = $1 and reminder_offsets_minutes = '{10080,1440,120}' returning id`,
        [f.a.id],
      );
      expect(rows).toEqual([]);
    });
  });
});

describe("SCR-060's fixed rows — the bands are reminder_message_key()'s", () => {
  it("every edge maps to the row's own message, and one minute outside maps elsewhere", async () => {
    await withTx(async (tx) => {
      await tx.asOwner();
      for (const row of REMINDER_ROWS) {
        const [inside] = await tx.q<{ lo: string; hi: string; exact: string; below: string; above: string }>(
          `select public.reminder_message_key($1) as lo, public.reminder_message_key($2) as hi, public.reminder_message_key($3) as exact,
                  public.reminder_message_key($4) as below, public.reminder_message_key($5) as above`,
          [row.min, row.max, row.exact, row.min - 1, row.max + 1],
        );
        expect([inside.lo, inside.hi, inside.exact], row.key).toEqual([MESSAGE[row.key], MESSAGE[row.key], MESSAGE[row.key]]);
        expect(inside.below, row.key).not.toBe(MESSAGE[row.key]);
        expect(inside.above, row.key).not.toBe(MESSAGE[row.key]);
      }
    });
  });
});
