// The fourth, offset-agnostic reminder message (DEC-047, console.md's
// story order item 3). Applied with applyProposed() inside each test's
// rolled-back transaction (DEC-040).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["console/0004_reminder_generic_message.sql"];

async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  return f;
}

const key = (tx: Tx, offsetMinutes: number) => tx.q<{ reminder_message_key: string }>(`select public.reminder_message_key($1)`, [offsetMinutes]);

describe("POL-reminder_message_key", () => {
  it("every default offset (10080/1440/120) still maps to its own fixed message — no behaviour change for a default org", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asOwner();
      expect((await key(tx, 10080))[0].reminder_message_key).toBe("MSG-reminder_7d");
      expect((await key(tx, 1440))[0].reminder_message_key).toBe("MSG-reminder_1d");
      expect((await key(tx, 120))[0].reminder_message_key).toBe("MSG-reminder_2h");
    });
  });

  it("a genuinely custom offset gets the generic message, not a misleadingly specific one", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asOwner();
      // 3 days — nowhere near any of the three fixed offsets' ±20% bands.
      expect((await key(tx, 4320))[0].reminder_message_key).toBe("MSG-reminder_generic");
      // 30 minutes — same.
      expect((await key(tx, 30))[0].reminder_message_key).toBe("MSG-reminder_generic");
    });
  });

  it("a small deliberate adjustment within ±20% still reads as the specific message", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asOwner();
      expect((await key(tx, 100))[0].reminder_message_key).toBe("MSG-reminder_2h"); // 120 - ~17%
      expect((await key(tx, 1700))[0].reminder_message_key).toBe("MSG-reminder_1d"); // 1440 + ~18%
    });
  });

  it("the generic key is in notify()'s own matrix, so a reminder at a custom offset actually sends instead of raising unknown_message_key", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [{ id }] = await tx.q<{ id: string | null }>(
        `select public.notify($1, $2, 'reminders', $3::jsonb, public.reminder_message_key(4320)) as id`,
        [f.a.id, f.a.members[0].memberId, JSON.stringify({ session_id: f.m2.a.published, title: "جلسة قابلة للتذكير" })],
      );
      expect(id).toBeTruthy();
      const rows = await tx.q<{ key: string }>(`select key from public.notifications where id = $1`, [id]);
      expect(rows).toEqual([{ key: "MSG-reminder_generic" }]);
    });
  });
});
