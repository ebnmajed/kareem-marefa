// CHK-org_domains.domain_lowercase_everywhere — migration 0092 (DEC-147, L3).
//
// Production's `org_domains_domain_check` was text's case-sensitive `~`; the
// local chain's was citext's case-insensitive one. 0092 re-states it with an
// explicit cast so both environments carry the same constraint. The
// normalise trigger is what keeps a mixed-case domain acceptable, and this
// proves both halves: through the table it is stored lowercase and accepted;
// past the trigger it is refused — in this environment exactly as on
// production.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("CHK-org_domains.domain_lowercase_everywhere", () => {
  it("the check is text's case-sensitive match, stated with an explicit cast", async () => {
    await withTx(async (tx) => {
      await tx.asOwner();
      const [row] = await tx.q<{ def: string }>(
        `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'org_domains_domain_check'`,
      );
      expect(row.def).toContain("(domain)::text ~");
      expect(row.def).not.toContain("::citext");
    });
  });

  it("a mixed-case domain written through the table is stored lowercase and accepted", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [row] = await tx.q<{ domain: string }>(
        `insert into public.org_domains (org_id, domain) values ($1, '@Mixed-Case.Example.COM') returning domain::text as domain`,
        [f.a.id],
      );
      expect(row.domain).toBe("mixed-case.example.com");
    });
  });

  it("a mixed-case domain that bypasses the normalise trigger is refused (23514)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`alter table public.org_domains disable trigger org_domains_normalise`);
      await expect(
        tx.q(`insert into public.org_domains (org_id, domain) values ($1, 'Mixed-Case.Example.COM')`, [f.a.id]),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });
});
