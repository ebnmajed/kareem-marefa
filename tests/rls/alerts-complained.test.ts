// supabase/migrations/0142_delivery_complained.sql — the bounce-spike rule
// counts a spam complaint as deliverability damage (REQ-NTF-008; DEC-165).
// The lead's.
//
// 03 §8.2 row proven here: RPC-evaluate_alerts.complaint_counts.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const firing = async (tx: Tx) => {
  await tx.asOwner();
  await tx.q(`set local role service_role`);
  const rows = await tx.q<{ alert: string; fired: boolean }>(`select alert, fired from public.evaluate_alerts()`);
  return rows.filter((r) => r.fired).map((r) => r.alert);
};

describe("RPC-evaluate_alerts.complaint_counts", () => {
  it("★ twenty-five sends with two COMPLAINTS fire the spike exactly as two bounces would", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`delete from public.email_deliveries`);
      const insert = (status: string, n: number) =>
        tx.q(
          `insert into public.email_deliveries (org_id, member_id, key, status)
           select $1, $2, 'MSG-drill', $3::public.delivery_status from generate_series(1, $4)`,
          [f.a.id, f.a.members[0].memberId, status, n],
        );
      await insert("delivered", 23);
      await insert("complained", 2);
      expect(await firing(tx)).toContain("email_bounce_spike");

      await tx.asOwner();
      await tx.q(`update public.email_deliveries set status = 'delivered' where status = 'complained'`);
      expect(await firing(tx)).not.toContain("email_bounce_spike");
    });
  });
});
