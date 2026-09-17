// REQ-SUR-009, restated as structure (DEC-160 §3, contract 1).
//
// The requirement used to be «for any member, the ratings within ±N minutes of
// their survey response are not of size 1». That set cannot be formed any more,
// because a stored response has no member and no instant — so the acceptance
// test is the STRUCTURE, generated over the catalogue rather than written out,
// so a column added next year fails it the day it is added.
//
// 03 §8.2 row: `RPC-survey.structure`.
//
// What is proven elsewhere, so it is not duplicated here:
//   · the queued payload names nobody and the key is null — survey-submit.test.ts
//   · the submit writes no audit row — survey-submit.test.ts
//   · the presenter is refused the results — survey-results.test.ts (file 05)
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, PERMISSION_DENIED, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const BOX = ["survey_responses", "survey_answers"];
const REGISTER = "survey_participations";

/** A column whose NAME could carry a person, however it is spelled. */
const NAMES_A_PERSON = /member|check_?in|rating|rater|user|auth|actor|person|email/i;

describe("REQ-SUR-009 — a stored response has no member and no instant", () => {
  it("neither the box nor the register carries a naming column, and neither carries a timestamp of any kind", async () => {
    const { rows } = await pool.query<{ table_name: string; column_name: string; data_type: string }>(
      `select table_name, column_name, data_type
         from information_schema.columns
        where table_schema = 'public' and table_name = any($1)`,
      [[...BOX, REGISTER]],
    );
    expect(rows.length).toBeGreaterThan(0);

    const naming = rows.filter((r) => NAMES_A_PERSON.test(r.column_name) && !(r.table_name === REGISTER && r.column_name === "member_id"));
    expect(naming).toEqual([]);   // the register names the member; the box may not

    // ★ No instant at all — not `created_at`, not `submitted_at`, not a bare
    // date. A response that cannot be ordered cannot be bracketed against a
    // rating, a ledger row, an audit row or a job.
    const timestamps = rows.filter((r) => /^(timestamp|date|time)/.test(r.data_type));
    expect(timestamps).toEqual([]);
  });

  it("every foreign key out of the box leads to a survey or to the org — never to `members`", async () => {
    const { rows } = await pool.query<{ child: string; parent: string }>(
      `select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent
         from pg_constraint c
        where c.contype = 'f' and c.conrelid::regclass::text = any($1)`,
      [BOX],
    );
    expect(rows.length).toBeGreaterThan(0);
    const parents = Array.from(new Set(rows.map((r) => r.parent))).sort();
    expect(parents).toEqual(["orgs", "survey_question_options", "survey_questions", "survey_responses", "surveys"]);
    expect(parents).not.toContain("members");
  });

  it("★ nothing joins the register to the box: no key leads from one to the other, and the only columns they share are the org and the survey", async () => {
    // The register says who answered; the box says what was answered. The whole
    // guarantee is that no row of either names a row of the other. A foreign
    // key in EITHER direction would be that pairing, so both directions are
    // asked for, and `survey_participations` is referenced by nothing at all.
    const { rows: keys } = await pool.query<{ child: string; parent: string }>(
      `select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent
         from pg_constraint c
        where c.contype = 'f'
          and (c.conrelid::regclass::text = any($1) and c.confrelid::regclass::text = $2
            or c.confrelid::regclass::text = any($1) and c.conrelid::regclass::text = $2)`,
      [BOX, REGISTER],
    );
    expect(keys).toEqual([]);

    const { rows: referenced } = await pool.query<{ child: string }>(
      `select c.conrelid::regclass::text as child from pg_constraint c
        where c.contype = 'f' and c.confrelid::regclass::text = $1`,
      [REGISTER],
    );
    expect(referenced).toEqual([]);

    // ★ The residue, measured rather than asserted away (DEC-160 §3.6): the two
    // tables CAN be joined on the survey, which is what identifies the answer
    // in a survey exactly one person answered — and is why the withhold covers
    // the response count too. What must never appear here is a third shared
    // column that would narrow that join to a person.
    const columns = async (table: string) =>
      (await pool.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
        [table],
      )).rows.map((r) => r.column_name);
    const response = new Set(await columns("survey_responses"));
    const shared = (await columns(REGISTER)).filter((c) => response.has(c)).sort();
    expect(shared).toEqual(["org_id", "survey_id"]);
  });

  it("no client role selects a response, an answer, or a participation — not even its own", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const read = (table: string) => () => tx.q(`select * from public.${table}`);

      for (const table of [...BOX, REGISTER]) {
        await tx.asAnon();
        expect(await errorCode(read(table)), `anon on ${table}`).toBe(PERMISSION_DENIED);
        for (const who of [f.a.members[0].claims, f.a.members[1].claims, f.a.mod.claims, f.a.admin.claims, f.b.admin.claims]) {
          await tx.as(who);
          expect(await errorCode(read(table)), `a client role on ${table}`).toBe(PERMISSION_DENIED);
        }
        // The worker's role is revoked too: the job reaches the box through one
        // definer function, never through the table.
        await tx.asServiceRole();
        expect(await errorCode(read(table)), `service_role on ${table}`).toBe(PERMISSION_DENIED);
      }
    });
  });

  it("a rating's two instants are midnight — the last clause of the acceptance", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Before promotion the trigger comes from the proposed file (and its
      // backfill coarsens the fixture's own rating); after it, from the
      // migration, and this is a no-op. The assertion is the same either way.
      await applyProposed(tx, "event/01_ratings_day_precision.sql");
      await tx.asOwner();
      const [row] = await tx.q<{ coarse: boolean }>(
        `select submitted_at = date_trunc('day', submitted_at at time zone 'UTC') at time zone 'UTC' as coarse
           from public.ratings where id = $1`,
        [f.m2.a.ratingId],
      );
      expect(row.coarse).toBe(true);
    });
  });
});
