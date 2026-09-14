// The Google Fonts materialisation flow — 02 §4.13, 03 §5.9, REQ-DSG-016,
// REQ-DSG-017, A39, DEC-007, DEC-049, 11 §2.5.
//
// «Choose freely, then FREEZE.» The two properties this file holds: the
// binary is materialised rather than referenced, so the row records OUR
// storage path and a hash; and a font is selectable ONLY at
// `parity_status = 'passed'`, with a failure carrying the report that says
// which checks failed — 06 §7.2 wants a refusal with an answer.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["designer/0006_font_materialisation.sql"];
const SHA = (c: string) => c.repeat(64).slice(0, 64);

async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  await tx.asOwner();
  await tx.q(`delete from public.fonts`);
  await tx.q(`delete from graphile_worker._private_jobs`);
  return f;
}

const fontJobs = (tx: Tx) => tx.q<{ key: string; queue_name: string }>(`select key, queue_name from graphile_worker.jobs where task_identifier = 'materialise_font'`);

describe("POL-fonts.select.service_role", () => {
  it("service_role reads the manifest and cannot write a row directly — record_font() stays the one door (0067)", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asOwner();
      await tx.q(
        `insert into public.fonts (family, style, weight, source, storage_path, sha256, subsets, parity_status)
         values ('Lateef', 'normal', 400, 'google', 'fonts/' || $1 || '.woff2', $1, '{arabic,latin}', 'passed')`,
        [SHA("a")],
      );

      await tx.asServiceRole();
      const rows = await tx.q<{ family: string }>(`select family from public.fonts`);
      expect(rows.map((r) => r.family)).toEqual(["Lateef"]);

      // bypassrls does not confer a privilege: no insert, update or delete grant.
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.fonts (family, style, weight, source, storage_path, sha256, subsets, parity_status)
             values ('Amiri', 'normal', 400, 'google', 'fonts/' || $1 || '.woff2', $1, '{arabic,latin}', 'passed')`,
            [SHA("b")],
          ),
        ),
      ).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`update public.fonts set parity_status = 'failed'`))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`delete from public.fonts`))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-fonts.materialise.admin", () => {
  it("an admin requests a family and one job is enqueued with 11 §2.5's key", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.request_font('Lateef', 'normal', 400)`);

      await tx.asOwner();
      const jobs = await fontJobs(tx);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.key).toBe("font:Lateef:normal:400");
      expect(jobs[0]?.queue_name).toBe("render");
    });
  });

  it("a second request for the same face MOVES the job rather than downloading twice", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.request_font('Lateef', 'normal', 400)`);
      await tx.q(`select public.request_font('Lateef', 'normal', 400)`);
      await tx.asOwner();
      expect(await fontJobs(tx)).toHaveLength(1);
    });
  });

  it("★ a face that already PASSED is not re-downloaded — the font is platform-wide", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asServiceRole();
      await tx.q(`select public.record_font('Lateef', 'normal', 400, 'google', $1, $2, '{arabic}', 'passed', null, null)`, [
        `${SHA("a")}.woff2`,
        SHA("a"),
      ]);

      // Another org asking gets the same bytes rather than a second copy:
      // DEC-049's whole point is one manifest, shared by hash.
      await tx.as(f.b.admin.claims);
      await tx.q(`select public.request_font('Lateef', 'normal', 400)`);
      await tx.asOwner();
      expect(await fontJobs(tx)).toEqual([]);
    });
  });

  it("a moderator and a member are refused, and a nonsense face is rejected", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      for (const claims of [f.a.mod.claims, f.a.members[0].claims]) {
        await tx.as(claims);
        expect(await errorCode(() => tx.q(`select public.request_font('Lateef')`))).toBe(PERMISSION_DENIED);
      }
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.request_font('Lateef', 'oblique', 400)`))).toBe("22023");
      expect(await errorCode(() => tx.q(`select public.request_font('Lateef', 'normal', 1200)`))).toBe("22023");
    });
  });

  it("the request is audited", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.request_font('Lateef', 'normal', 400)`);
      await tx.asOwner();
      const [row] = await tx.q<{ actor_id: string; after: { family: string } }>(
        `select actor_id, after from public.audit_log where action = 'design.font_requested' order by occurred_at desc limit 1`,
      );
      expect(row.actor_id).toBe(f.a.admin.memberId);
      expect(row.after.family).toBe("Lateef");
    });
  });
});

describe("POL-fonts.record.worker", () => {
  it("recording a font is service_role only", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      for (const claims of [f.a.admin.claims, f.a.members[0].claims]) {
        await tx.as(claims);
        expect(
          await errorCode(() => tx.q(`select public.record_font('X', 'normal', 400, 'google', 'p', $1, '{arabic}', 'passed', null, null)`, [SHA("b")])),
        ).toBe(PERMISSION_DENIED);
      }
    });
  });

  it("★ stores OUR path and a hash — materialised, never a CDN reference", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asServiceRole();
      const [row] = await tx.q<{ storage_path: string; sha256: string; source: string }>(
        `select storage_path, sha256, source from public.record_font('Lateef', 'normal', 400, 'google', $1, $2, '{arabic}', 'passed', null, null)`,
        [`${SHA("c")}.woff2`, SHA("c")],
      );
      // Google's dynamically subset slices are not byte-stable, so a URL
      // here would mean the editor and the worker fetching different bytes
      // on different days with nothing erroring (A39).
      expect(row.storage_path).not.toMatch(/^https?:/);
      expect(row.storage_path).toContain(row.sha256);
      expect(row.source).toBe("google");
    });
  });
});

describe("POL-fonts.gate", () => {
  it("★ a failed font stays unselectable and carries the report naming what failed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asServiceRole();
      await tx.q(
        `select public.record_font('BrokenKufi', 'normal', 400, 'google', $1, $2, '{arabic}', 'failed', $3::jsonb, null)`,
        [`${SHA("d")}.woff2`, SHA("d"), JSON.stringify({ summary: "lam_alef_ligature: «لا» is 30 and its letters apart are 30 — rlig appears to be missing" })],
      );

      await tx.as(f.a.members[0].claims);
      const [row] = await tx.q<{ parity_status: string; parity_report: { summary: string } }>(
        `select parity_status, parity_report from public.fonts where family = 'BrokenKufi'`,
      );
      // Visible, with its status — 06 §7.2 wants the admin told WHICH
      // goldens failed rather than finding the font simply absent.
      expect(row.parity_status).toBe("failed");
      expect(row.parity_report.summary).toContain("rlig");
    });
  });

  it("the database refuses `passed` without Arabic coverage, whatever the job claims", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asServiceRole();
      // A39 as a CHECK constraint: a font cannot be selectable without the
      // subset that is the whole reason it was chosen.
      expect(
        await errorCode(() =>
          tx.q(`select public.record_font('LatinOnly', 'normal', 400, 'google', $1, $2, '{latin}', 'passed', null, null)`, [`${SHA("e")}.woff2`, SHA("e")]),
        ),
      ).toBe("23514");
    });
  });

  it("a re-run may widen what is known about the subsets, never narrow it", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asServiceRole();
      await tx.q(`select public.record_font('Lateef', 'normal', 400, 'google', $1, $2, '{arabic}', 'passed', null, null)`, [`${SHA("f")}.woff2`, SHA("f")]);
      const [row] = await tx.q<{ subsets: string[] }>(
        `select subsets from public.record_font('Lateef', 'normal', 400, 'google', $1, $2, '{latin}', 'passed', null, null)`,
        [`${SHA("f")}.woff2`, SHA("f")],
      );
      expect([...row.subsets].sort()).toEqual(["arabic", "latin"]);
    });
  });
});
