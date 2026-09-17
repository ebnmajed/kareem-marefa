// platform — a requested deletion cannot be undone by reinstating (sync 3's
// ruling on platform's P2 finding, DEC-148). The SQL is
// `supabase/proposed/platform/0010_reinstate_refuses_pending_deletion.sql`,
// applied in the transaction and rolled back; the guard survives promotion.
//
// The window it closes: `delete_org()` suspends and enqueues; until the job ran,
// `reinstate_org()` accepted the org, and the queued job then deleted an ACTIVE
// org. The marker is the one `delete_org()` already writes —
// `org.deletion_requested` in `platform_audit_log` — so no column is added.
//
// REQ-NFR-014 · REQ-TEN-006 · REQ-ADM-001 · REQ-ADM-003

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyProposed, errorMessage, withTx, type Claims, type Tx } from "./db";
import { seedBase } from "./fixture";

const FILE = "platform/0010_reinstate_refuses_pending_deletion.sql";

async function apply(tx: Tx) {
  if (existsSync(join(process.cwd(), "supabase", "proposed", FILE))) await applyProposed(tx, FILE);
}

function platformClaims(authUserId: string, email: string): Claims {
  return { sub: authUserId, email, platform_admin: true };
}

describe("platform — reinstate refuses a pending deletion (0010)", () => {
  it("★ RPC-reinstate_org.pending_deletion — after delete_org(), reinstating is refused and the org stays suspended", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));

      await tx.q(`select public.delete_org($1, $2)`, [f.a.id, f.a.slug]);
      expect(await errorMessage(() => tx.q(`select public.reinstate_org($1)`, [f.a.id]))).toMatch(/org_deletion_pending/);

      await tx.asOwner();
      const [org] = await tx.q<{ status: string }>(`select status from public.orgs where id = $1`, [f.a.id]);
      expect(org.status).toBe("suspended");
      const reinstated = await tx.q(`select 1 from public.audit_log where org_id = $1 and action = 'org.reinstated'`, [f.a.id]);
      expect(reinstated).toHaveLength(0);
    });
  });

  it("★ the same holds when the org was ALREADY suspended before its deletion was requested", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));

      await tx.q(`select public.suspend_org($1, 'مراجعة قبل الحذف')`, [f.a.id]);
      // `delete_org()` keeps an existing suspension and its reason — so the
      // reason cannot be the marker, and is not.
      await tx.q(`select public.delete_org($1, $2)`, [f.a.id, f.a.slug]);
      expect(await errorMessage(() => tx.q(`select public.reinstate_org($1)`, [f.a.id]))).toMatch(/org_deletion_pending/);
    });
  });

  it("RPC-reinstate_org — a suspended org with no deletion requested still reinstates", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));

      await tx.q(`select public.suspend_org($1, 'إيقاف مؤقت')`, [f.b.id]);
      await tx.q(`select public.reinstate_org($1)`, [f.b.id]);
      await tx.asOwner();
      const [org] = await tx.q<{ status: string }>(`select status from public.orgs where id = $1`, [f.b.id]);
      expect(org.status).toBe("active");
    });
  });

  it("RPC-reinstate_org.pending_deletion — the console's reads say which org is on its way out, and platform_org keeps it out of `counts`", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      await tx.q(`select public.delete_org($1, $2)`, [f.a.id, f.a.slug]);

      const rows = await tx.q<{ org_id: string; deletion_pending: boolean }>(`select org_id, deletion_pending from public.platform_metrics_by_org()`);
      expect(rows.find((r) => r.org_id === f.a.id)!.deletion_pending).toBe(true);
      expect(rows.find((r) => r.org_id === f.b.id)!.deletion_pending).toBe(false);

      const [{ platform_org: org }] = await tx.q<{ platform_org: { deletionPending: boolean; counts: Record<string, unknown> } }>(
        `select public.platform_org($1) as platform_org`,
        [f.a.id],
      );
      expect(org.deletionPending).toBe(true);
      expect(Object.keys(org.counts)).not.toContain("deletion_pending");
      for (const v of Object.values(org.counts)) expect(typeof v, "counts are numbers").toBe("number");
    });
  });
});
