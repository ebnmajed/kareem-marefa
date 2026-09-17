// A SECURITY DEFINER function runs as its owner with RLS bypassed, and a new
// function is `execute`-to-PUBLIC unless someone revokes it. Put those two
// defaults together and a private helper becomes a public API: PostgREST serves
// every function in `public` that the caller's role may execute.
//
// That is exactly what `_issue_check_in_code()` was from M2 to wave 9 (0015 →
// 0103, DEC-152): it mints the LIVE check-in code, checks no caller, and
// answered an anonymous request. Nothing was wrong with any policy, so no
// policy test could see it; invariant 6 («every policy has a matching grant»)
// has a mirror image nobody had written down — EVERY DEFINER FUNCTION HAS A
// DELIBERATE GRANT. This file is that sentence as a test, generated over the
// catalogue so a function is covered the day it is created.
//
// Trigger functions are skipped: Postgres refuses to call one directly
// («trigger functions can only be called as triggers»), whatever its ACL.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

/** Every SECURITY DEFINER, non-trigger function `anon` may execute — and why it may. */
const ANON_MAY_EXECUTE: Record<string, string> = {
  "session_public_card(p_session uuid)": "REQ-SES-013 — the public share card; returns published sessions only (0080)",
  "verify_certificate(p_code text)": "REQ-CRT-007 — public verification by random code (0065)",
  "export_is_public_card(p_name text)": "a storage-policy helper for the public og image (0080); reads a path, returns a boolean",
  "has_checked_in(p_session uuid)": "answers about the CALLER only (auth_member_id()); false for anon",
  "is_presenter_of(p_session uuid)": "answers about the CALLER only; false for anon",
  "is_proposal_owner_of(p_proposal uuid)": "answers about the CALLER only; false for anon",
};

describe("RPC-definer.anon_allowlist — every definer function has a deliberate grant", () => {
  it("the SECURITY DEFINER, non-trigger functions `anon` may execute are exactly the documented six", async () => {
    const { rows } = await pool.query<{ sig: string }>(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and p.prorettype <> 'trigger'::regtype
          and has_function_privilege('anon', p.oid, 'execute')
        order by 1`,
    );
    expect(rows.map((r) => r.sig).sort()).toEqual(Object.keys(ANON_MAY_EXECUTE).sort());
  });

  it("no definer function whose name says it is private (a leading underscore) is executable by any client role", async () => {
    const { rows } = await pool.query<{ sig: string; role: string }>(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig, r.role
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'), ('authenticated')) as r(role)
        where n.nspname = 'public' and p.prosecdef and p.proname like '\\_%'
          and p.prorettype <> 'trigger'::regtype
          and has_function_privilege(r.role, p.oid, 'execute')
        order by 1, 2`,
    );
    expect(rows).toEqual([]);
  });
});

describe("RPC-_issue_check_in_code.not_public (0103)", () => {
  it("anon, a member, a moderator, an admin and the worker's role are each refused; the guarded door still opens for the presenter", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const call = () => tx.q(`select * from public._issue_check_in_code($1)`, [f.m2.a.published]);

      await tx.asAnon();
      expect(await errorCode(call)).toBe(PERMISSION_DENIED);
      for (const who of [f.a.members[1].claims, f.a.mod.claims, f.a.admin.claims]) {
        await tx.as(who);
        expect(await errorCode(call)).toBe(PERMISSION_DENIED);
      }
      await tx.asServiceRole();
      expect(await errorCode(call)).toBe(PERMISSION_DENIED);

      // The session is a day ahead, so the guarded door answers `not_open` — a refusal that comes
      // from INSIDE ensure_check_in_code(), which proves the presenter may still execute it and that
      // it, a definer function, may still reach the private core it guards.
      await tx.as(f.a.members[0].claims); // the session's presenter
      expect(await errorCode(() => tx.q(`select * from public.ensure_check_in_code($1)`, [f.m2.a.published]))).toBe("P0001");
      await tx.asOwner();
      await tx.q(`update public.sessions set starts_at = now() - interval '5 minutes', ends_at = now() + interval '55 minutes',
                         rsvp_deadline_at = now() - interval '1 hour', cancellation_cutoff_at = now() - interval '1 hour', state = 'in_progress'
                   where id = $1`, [f.m2.a.published]);
      await tx.as(f.a.members[0].claims);
      const [code] = await tx.q<{ code: string }>(`select code from public.ensure_check_in_code($1)`, [f.m2.a.published]);
      expect(code.code).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{6}$/);
    });
  });
});
