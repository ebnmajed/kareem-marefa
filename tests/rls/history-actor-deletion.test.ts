// 0218 (DEC-275) — a settings-history row never blocks an org's deletion and never names another org's member.
//
//   FK-scoring_config_history.actor_set_null · TRG-scoring_config_history.actor_same_org

import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("FK-scoring_config_history.actor_set_null", () => {
  it("★ an org whose member is named by ANOTHER org's history row is still deleted — the row keeps the change, loses the name", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      // Production's shape: a history row in org A naming a member of org B (written before 0218's trigger existed).
      await tx.q(`alter table public.scoring_config_history disable trigger scoring_config_history_actor_same_org`);
      const [row] = await tx.q<{ id: string }>(
        `insert into public.scoring_config_history (org_id, scope, entity_id, field, old_value, new_value, actor_id)
         select $1, scope, entity_id, field, old_value, new_value, $2 from public.scoring_config_history where org_id = $1 limit 1
         returning id`,
        [f.a.id, f.b.admin.memberId],
      );
      await tx.q(`alter table public.scoring_config_history enable trigger scoring_config_history_actor_same_org`);
      expect(row).toBeTruthy();

      await tx.q(`select public.perform_org_deletion($1)`, [f.b.id]);
      expect(await tx.q(`select 1 from public.orgs where id = $1`, [f.b.id])).toHaveLength(0);
      expect(await tx.q(`select actor_id from public.scoring_config_history where id = $1`, [row.id])).toEqual([{ actor_id: null }]);
    });
  }, 60_000); // a whole org's cascade
});

describe("TRG-scoring_config_history.actor_same_org", () => {
  it("★ a history row keeps its own org's actor and drops another org's", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const insert = (actor: string) =>
        tx.q<{ actor_id: string | null }>(
          `insert into public.scoring_config_history (org_id, scope, entity_id, field, old_value, new_value, actor_id)
           select $1, scope, entity_id, field, old_value, new_value, $2 from public.scoring_config_history where org_id = $1 limit 1
           returning actor_id`,
          [f.a.id, actor],
        );
      expect(await insert(f.a.admin.memberId)).toEqual([{ actor_id: f.a.admin.memberId }]);
      expect(await insert(f.b.admin.memberId)).toEqual([{ actor_id: null }]);
    });
  });
});
