// The public session card — the owner's decision of 2026-09-15, and the ONE
// public read of `sessions` in the product.
//
// ★ WHAT THIS FILE EXISTS TO HOLD: a stranger holding a link learns six
// things — the title, when, where by NAME, whose org, and the poster — and
// learns nothing else, including whether an unpublished session exists at
// all. Every case below is one half of that sentence.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = "sessions/0001_public_session_card.sql";
const present = existsSync(join(process.cwd(), "supabase", "proposed", PROPOSED));

async function setup(tx: Tx) {
  const f = await seed(tx);
  // Promoted as a migration the file stops existing; the suite then proves
  // what `supabase db reset` applied, with no branch to keep correct.
  if (present) await applyProposed(tx, PROPOSED);
  await tx.asOwner();
  return f;
}

/** A ready `og` PNG render of a session's poster, plus the object itself.
 *  The fixture seeds only the `master` preset (fixture-m6), so the card's own
 *  image has to be arranged here. */
async function ogRender(tx: Tx, orgId: string, documentId: string): Promise<string> {
  const path = `${orgId}/exports/${documentId}/og.png`;
  await tx.q(
    `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px,
                                          storage_path, byte_size, status, source_fingerprint, rendered_at)
     values ($1, $2, 'og', 'png', 1200, 630, $3, 4096, 'ready', $4, now())`,
    [orgId, documentId, path, `fp-og-${documentId}`],
  );
  await tx.q(`insert into storage.objects (bucket_id, name) values ('exports', $1) on conflict do nothing`, [path]);
  return path;
}

/** A poster and a ready `og` render bound to an arbitrary session. */
async function posterFor(tx: Tx, orgId: string, sessionId: string, adminId: string): Promise<string> {
  const [doc] = await tx.q<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, bound_session_id, updated_by)
     values ($1, 'poster', (select document from public.design_documents where bound_session_id is not null limit 1), $2, $3)
     returning id`,
    [orgId, sessionId, adminId],
  );
  await tx.q(`insert into public.session_posters (org_id, session_id, document_id) values ($1, $2, $3)`, [orgId, sessionId, doc.id]);
  return ogRender(tx, orgId, doc.id);
}

/** A session in `state`, copied from a row that already satisfies every check. */
async function sessionIn(tx: Tx, from: string, state: string, title: string): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes,
                                  ends_at, time_zone, venue_id, capacity, state, cancellation_reason, cancelled_at)
     select org_id, $2, abstract, category_id, level, language, starts_at, duration_minutes,
            ends_at, time_zone, venue_id, capacity, $3::public.session_state,
            case when $3 = 'cancelled' then 'أُلغيت القاعة' end,
            case when $3 = 'cancelled' then now() end
       from public.sessions where id = $1
     returning id`,
    [from, title, state],
  );
  return row.id;
}

const card = (tx: Tx, id: string) => tx.q<Record<string, unknown>>(`select * from public.session_public_card($1)`, [id]);

describe("POL-sessions.public_card.anon", () => {
  it("a published session answers `anon` with exactly the six public fields", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.q(`update public.sessions set venue_id = (select id from public.venues where org_id = $1 limit 1) where id = $2`, [
        f.a.id,
        f.m2.a.published,
      ]);
      const path = await ogRender(tx, f.a.id, f.m6.a.documentId);

      await tx.asAnon();
      const rows = await card(tx, f.m2.a.published);
      expect(rows).toHaveLength(1);
      const row = rows[0];

      // ★ The allowlist IS the return type. Not «these keys are present» —
      // «these keys are ALL there is», so a column added to `sessions` next
      // year cannot arrive here by being selected accidentally.
      expect(Object.keys(row).sort()).toEqual(
        ["ends_at", "numerals", "og_height", "og_path", "og_width", "org_name", "starts_at", "time_zone", "title", "venue_name"].sort(),
      );
      expect(row.title).toContain("جلسة منشورة");
      expect(row.starts_at).toBeTruthy();
      expect(row.time_zone).toBe("Asia/Riyadh");
      expect(row.venue_name).toBeTruthy();
      expect(row.org_name).toBeTruthy();
      expect(row.numerals).toBe("western");
      expect(row.og_path).toBe(path);
      expect(row.og_width).toBe(1200);
      expect(row.og_height).toBe(630);
    });
  });

  it("an in_progress and a completed session answer; a draft, approved, archived or cancelled one is the empty answer", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const live = await sessionIn(tx, f.m2.a.published, "in_progress", "جارية الآن");
      const approved = await sessionIn(tx, f.m2.a.published, "approved", "معتمدة");
      const archived = await sessionIn(tx, f.m2.a.published, "archived", "مؤرشفة");
      const cancelled = await sessionIn(tx, f.m2.a.published, "cancelled", "ملغاة");

      await tx.asAnon();
      expect(await card(tx, live)).toHaveLength(1);
      expect(await card(tx, f.m2.a.completed)).toHaveLength(1);
      for (const [name, id] of [
        ["draft", f.m2.a.draft],
        ["approved", approved],
        ["archived", archived],
        ["cancelled", cancelled],
        ["unknown", randomUUID()],
      ] as const) {
        // ★ Not an error and not a different error — the SAME empty answer as
        // a uuid that names nothing, so the card cannot confirm that an
        // unpublished session exists.
        expect(await card(tx, id), name).toEqual([]);
      }
    });
  });

  it("a suspended org's cards go dark with the org", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.q(`update public.orgs set status = 'suspended', suspended_at = now(), suspended_reason = 'اختبار' where id = $1`, [f.a.id]);
      await tx.asAnon();
      expect(await card(tx, f.m2.a.published)).toEqual([]);
      // The other org is untouched: suspension is per-org, not a kill switch.
      expect(await card(tx, f.m2.b.published)).toHaveLength(1);
    });
  });

  it("`anon` still has no policy on the tables behind the card", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await ogRender(tx, f.a.id, f.m6.a.documentId);
      await tx.asAnon();
      // Refused at the GRANT for most of them and empty for the rest —
      // either way `anon` reads no row. The function is the only door.
      const readsNothing = async (sql: string) => {
        const code = await errorCode(() => tx.q(sql));
        if (code) return code;
        return await tx.q(sql);
      };
      for (const table of ["sessions", "venues", "session_posters", "export_artifacts", "orgs", "org_settings"]) {
        const outcome = await readsNothing(`select * from public.${table} limit 1`);
        expect(outcome === PERMISSION_DENIED || (Array.isArray(outcome) && outcome.length === 0), table).toBe(true);
      }
      // And the card's own venue address is not reachable by any route the
      // function opens — it is not in the return type and not in a policy.
      const address = await readsNothing(`select address from public.venues limit 1`);
      expect(address === PERMISSION_DENIED || (Array.isArray(address) && address.length === 0)).toBe(true);
    });
  });

  it("a session with no rendered poster still answers — with a null image, not an error", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asAnon();
      const [row] = await card(tx, f.m2.a.completed);
      expect(row).toBeTruthy();
      expect(row.og_path).toBeNull();
    });
  });
});

describe("POL-storage.exports.public_card", () => {
  it("`anon` reads the og.png of a card-eligible session and nothing else in `exports`", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const ogPath = await ogRender(tx, f.a.id, f.m6.a.documentId);

      // Everything else this poster and this org own, in the same bucket.
      const others = [
        `${f.a.id}/exports/${f.m6.a.documentId}/master.png`,
        `${f.a.id}/exports/${f.m6.a.documentId}/a4.pdf`,
        `${f.a.id}/exports/${f.m6.a.documentId}/og.webp`,
        `${f.a.id}/exports/${randomUUID()}/cert_landscape.pdf`,
      ];
      for (const name of others) {
        await tx.q(`insert into storage.objects (bucket_id, name) values ('exports', $1) on conflict do nothing`, [name]);
      }
      // A draft session's poster, rendered: the object exists, the card does not.
      const draftDoc = await posterFor(tx, f.a.id, f.m2.a.draft, f.a.admin.memberId);
      // The other org's eligible card, to prove the door is not org-scoped by
      // accident: it opens for B's published session too, because the card is
      // public for every org — and for nothing of B's that is not a card.
      const bOg = await ogRender(tx, f.b.id, f.m6.b.documentId);

      await tx.asAnon();
      const visible = async () =>
        (await tx.q<{ name: string }>(`select name from storage.objects where bucket_id = 'exports' order by name`)).map((r) => r.name);
      const seen = await visible();
      expect(seen).toContain(ogPath);
      expect(seen).toContain(bOg);
      for (const name of [...others, draftDoc]) expect(seen, name).not.toContain(name);
    });
  });

  it("a cancellation closes the image door that the card closed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const ogPath = await ogRender(tx, f.a.id, f.m6.a.documentId);
      await tx.asAnon();
      expect(await tx.q(`select name from storage.objects where bucket_id = 'exports' and name = $1`, [ogPath])).toHaveLength(1);

      await tx.asOwner();
      await tx.q(`update public.sessions set state = 'cancelled', cancelled_at = now(), cancellation_reason = 'اختبار' where id = $1`, [
        f.m2.a.published,
      ]);
      await tx.asAnon();
      // The bytes stop being readable the moment the session stops being a
      // card. A signed URL minted earlier would not have (that is half of why
      // there is no signed URL here).
      expect(await tx.q(`select name from storage.objects where bucket_id = 'exports' and name = $1`, [ogPath])).toEqual([]);
    });
  });

  it("`anon` cannot write to `exports`, card-shaped path or not", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const ogPath = await ogRender(tx, f.a.id, f.m6.a.documentId);
      await tx.asAnon();
      for (const name of [ogPath, `${f.a.id}/exports/${f.m6.a.documentId}/og-2.png`]) {
        await expect(tx.q(`insert into storage.objects (bucket_id, name) values ('exports', $1)`, [name])).rejects.toThrow();
      }
      // A delete never reaches RLS at all: storage's own `protect_delete()`
      // trigger refuses a direct delete from every role, the worker included.
      expect(await errorMessage(() => tx.q(`delete from storage.objects where bucket_id = 'exports' and name = $1`, [ogPath]))).toContain(
        "Direct deletion from storage tables is not allowed",
      );
    });
  });
});
