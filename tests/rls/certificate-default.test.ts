// Wave 27 — a new session's certificates are held for review (0201, REQ-CRT-018, DEC-254 §4, STORY-CRT-010).
//
// The default is the column's and nothing else's: both functions that create a session name no mode, and
// `schedule_session()` leaves the mode alone unless it is named. So the proof is short — a session born through the
// product's own function is 'review', and a session that already had a mode keeps it.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("REQ-CRT-018 — COL-sessions.certificate_mode_default", () => {
  it("a session inserted with no mode is 'review'", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ certificate_mode }] = await tx.q<{ certificate_mode: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, language, state)
         values ($1, 'جلسة بلا وضع', 'ملخّص', $2, 'introductory', 'ar', 'draft') returning certificate_mode`,
        [f.a.id, f.a.categoryId],
      );
      expect(certificate_mode).toBe("review");
    });
  });

  it("the column's default is 'review', and a session with a mode keeps it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ column_default }] = await tx.q<{ column_default: string }>(
        `select column_default from information_schema.columns
          where table_schema = 'public' and table_name = 'sessions' and column_name = 'certificate_mode'`,
      );
      expect(column_default).toContain("'review'");
      const [{ certificate_mode }] = await tx.q<{ certificate_mode: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, language, state, certificate_mode)
         values ($1, 'جلسة بوضع', 'ملخّص', $2, 'introductory', 'ar', 'draft', 'off') returning certificate_mode`,
        [f.a.id, f.a.categoryId],
      );
      expect(certificate_mode).toBe("off");
    });
  });
});
