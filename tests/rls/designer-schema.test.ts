// The M6 schema — 02 §4.12 (certificates, the serial counters) and §4.13 (the
// designer), 03 §5.8/§5.8a and §5.9/§5.9a/§5.9b, REQ-DSG-004 … REQ-DSG-026,
// REQ-CRT-001 … REQ-CRT-014, DEC-009, DEC-010, DEC-012.
//
// Applied with applyProposed() inside each test's rolled-back transaction
// (DEC-040) — nothing here touches the shared local database.
//
// The four cases this file exists for, and which would be silently absent
// otherwise:
//
//   · an org admin READS a platform template and CANNOT update it (REQ-DSG-008);
//   · an attendee certificate without a `check_in_id` is refused by the TABLE,
//     so REQ-CHK-009 cannot be bypassed by a bug in the issuance job;
//   · a rolled-back issuance leaves `next_value` unchanged (DEC-010) — the
//     whole reason the serial is a locked counter row and not a SEQUENCE;
//   · /verify resolves by verification code and by NOTHING else: a serial, an
//     unknown code and a held certificate are all the same empty answer.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const CHECK_VIOLATION = "23514";
const INVALID_TEXT_REPRESENTATION = "22023";

const PROPOSED = ["designer/0001_m6_schema.sql", "designer/0002_template_drafts.sql"];

/** A file the lead has promoted is applied by `supabase db reset` and no
 *  longer exists under `supabase/proposed/`. In a shared tree that promotion
 *  lands mid-session, so the filesystem decides whether it still needs
 *  applying here (notify's pattern, wave 2). */
async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  await tx.asOwner();
  // The lead's fixture-m6 seeds every M6 table on both orgs so the isolation
  // sweep is never vacuous (DEC-049). These cases count rows and allocate
  // serials, so they start from an empty M6 world inside the rolled-back
  // transaction — the notify-contract pattern (TEAM.md §3).
  for (const t of ["certificates", "export_artifacts", "session_posters", "design_documents", "design_assets", "design_template_versions", "design_templates", "fonts", "certificate_serial_counters"]) {
    await tx.q(`delete from public.${t}`);
  }
  return f;
}

/* ── scaffolding, built as the owner: a fixture arranges history ─────────── */

const LAYER = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "text",
  frame: { x: 0, y: 0, w: 100, h: 50 },
  text: { literal: "عنوان" },
  font: { family: "Reem Kufi", size: 48 },
  color: "{{brand.fgHeading}}",
  ...extra,
});

const DOC = (layers: unknown[] = [LAYER("l_title")]) => ({
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction: "rtl",
  background: { type: "solid", color: "{{brand.canvas}}" },
  layers,
});

async function template(
  tx: Tx,
  opts: { orgId: string | null; scope: "platform" | "org"; purpose?: "poster" | "certificate"; family?: string; layers?: unknown[] },
) {
  const purpose = opts.purpose ?? "poster";
  const [t] = await tx.q<{ id: string }>(
    `insert into public.design_templates (org_id, scope, purpose, family, name)
     values ($1, $2, $3, $4, $5) returning id`,
    [opts.orgId, opts.scope, purpose, opts.family ?? (purpose === "poster" ? "talk" : "attendance"), "قالب"],
  );
  const [v] = await tx.q<{ id: string; org_id: string | null }>(
    `insert into public.design_template_versions (template_id, version, document, published_at)
     values ($1, 1, $2::jsonb, now()) returning id, org_id`,
    [t.id, JSON.stringify(DOC(opts.layers))],
  );
  return { templateId: t.id, versionId: v.id, versionOrgId: v.org_id };
}

async function document(tx: Tx, orgId: string, versionId: string, bound: { session?: string; certificate?: string } = {}, layers?: unknown[]) {
  const [d] = await tx.q<{ id: string }>(
    `insert into public.design_documents (org_id, template_version_id, purpose, document, bound_session_id, bound_certificate_id)
     values ($1, $2, 'poster', $3::jsonb, $4, $5) returning id`,
    [orgId, versionId, JSON.stringify(DOC(layers)), bound.session ?? null, bound.certificate ?? null],
  );
  return d.id;
}

async function certificate(
  tx: Tx,
  o: { orgId: string; memberId: string; sessionId: string; checkInId: string; versionId: string },
  over: { state?: string; kind?: string; serial?: string; issued?: boolean; revokedReason?: string } = {},
) {
  const state = over.state ?? "issued";
  const [c] = await tx.q<{ id: string; verification_code: string; serial: string }>(
    `insert into public.certificates
       (org_id, member_id, kind, session_id, check_in_id, serial, verification_code, state,
        template_version_id, recipient_name_snapshot, issued_at, revoked_at, revocation_reason)
     values ($1, $2, $3, $4, $5, $6, public.new_verification_code(), $7::public.certificate_state, $8, 'سارة العتيبي',
             case when $7::text = 'held' then null else now() end,
             case when $7::text = 'revoked' then now() else null end,
             $9)
     returning id, verification_code, serial`,
    [
      o.orgId,
      o.memberId,
      over.kind ?? "attendance",
      o.sessionId,
      o.checkInId,
      over.serial ?? "KM-2026-000001",
      state,
      o.versionId,
      over.revokedReason ?? (state === "revoked" ? "أُصدرت لشخص خاطئ" : null),
    ],
  );
  return c;
}

/* ═══ design_templates — 03 §5.9a, the one deliberate cross-org read ══════ */

describe("POL-design_templates", () => {
  it("select.platform — an org admin READS a platform template, and org B's is invisible", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const platform = await template(tx, { orgId: null, scope: "platform" });
      const mine = await template(tx, { orgId: f.a.id, scope: "org" });
      const theirs = await template(tx, { orgId: f.b.id, scope: "org" });

      await tx.as(f.a.admin.claims);
      const rows = await tx.q<{ id: string }>(`select id from public.design_templates`);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(platform.templateId);
      expect(ids).toContain(mine.templateId);
      expect(ids).not.toContain(theirs.templateId);
    });
  });

  it("update.platform — an org admin CANNOT update a platform template (REQ-DSG-008)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const platform = await template(tx, { orgId: null, scope: "platform" });

      await tx.as(f.a.admin.claims);
      // RLS filters the row out of the UPDATE's scan — no error, no rows, and
      // the template is untouched. That is the failure shape to assert: an
      // admin who "saved" a platform template and saw no error would believe
      // the edit landed.
      const updated = await tx.q(`update public.design_templates set name = 'مسروق' where id = $1 returning id`, [platform.templateId]);
      expect(updated).toEqual([]);
      const deleted = await tx.q(`delete from public.design_templates where id = $1 returning id`, [platform.templateId]);
      expect(deleted).toEqual([]);

      await tx.asOwner();
      const [row] = await tx.q<{ name: string }>(`select name from public.design_templates where id = $1`, [platform.templateId]);
      expect(row.name).toBe("قالب");
    });
  });

  it("insert.org — an admin cannot create a PLATFORM-scope template, and a plain member cannot create any", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);

      await tx.as(f.a.admin.claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.design_templates (org_id, scope, purpose, family, name) values (null, 'platform', 'poster', 'talk', 'ترقية')`),
        ),
      ).toBe(PERMISSION_DENIED);

      const [ok] = await tx.q<{ id: string }>(
        `insert into public.design_templates (org_id, scope, purpose, family, name) values ($1, 'org', 'poster', 'panel', 'حوار') returning id`,
        [f.a.id],
      );
      expect(ok.id).toBeTruthy();

      await tx.as(f.a.members[0].claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.design_templates (org_id, scope, purpose, family, name) values ($1, 'org', 'poster', 'meetup', 'لقاء')`, [f.a.id]),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });

  it("the scope/org_id and family/purpose constraints hold", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      // A platform template carrying an org, and an org template carrying none.
      expect(
        await errorCode(() =>
          tx.q(`insert into public.design_templates (org_id, scope, purpose, family, name) values ($1, 'platform', 'poster', 'talk', 'x')`, [f.a.id]),
        ),
      ).toBe(CHECK_VIOLATION);
      expect(
        await errorCode(() => tx.q(`insert into public.design_templates (org_id, scope, purpose, family, name) values (null, 'org', 'poster', 'talk', 'x')`)),
      ).toBe(CHECK_VIOLATION);
      // 06 §3.3: a certificate template cannot be a `talk`.
      expect(
        await errorCode(() =>
          tx.q(`insert into public.design_templates (org_id, scope, purpose, family, name) values ($1, 'org', 'certificate', 'talk', 'x')`, [f.a.id]),
        ),
      ).toBe(CHECK_VIOLATION);
    });
  });
});

/* ═══ design_template_versions — immutable, and the template guard ════════ */

describe("POL-design_template_versions", () => {
  it("read follows the parent; a version of a platform template is readable and not writable", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const platform = await template(tx, { orgId: null, scope: "platform" });
      const theirs = await template(tx, { orgId: f.b.id, scope: "org" });

      await tx.as(f.a.admin.claims);
      const ids = (await tx.q<{ id: string }>(`select id from public.design_template_versions`)).map((r) => r.id);
      expect(ids).toContain(platform.versionId);
      expect(ids).not.toContain(theirs.versionId);

      expect(
        await errorCode(() =>
          tx.q(`insert into public.design_template_versions (template_id, version, document) values ($1, 2, $2::jsonb)`, [
            platform.templateId,
            JSON.stringify(DOC()),
          ]),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });

  it("a published version is immutable — no update and no delete grant (REQ-DSG-007)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const mine = await template(tx, { orgId: f.a.id, scope: "org" });

      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`update public.design_template_versions set version = 9 where id = $1`, [mine.versionId]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`delete from public.design_template_versions where id = $1`, [mine.versionId]))).toBe(PERMISSION_DENIED);
    });
  });

  it("org_id mirrors the parent — null for a platform template, the org's for an org one", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const platform = await template(tx, { orgId: null, scope: "platform" });
      const mine = await template(tx, { orgId: f.a.id, scope: "org" });
      expect(platform.versionOrgId).toBeNull();
      expect(mine.versionOrgId).toBe(f.a.id);
    });
  });

  it("the guard refuses a hard-coded colour, an unknown layer kind and a duplicate layer id", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [t] = await tx.q<{ id: string }>(
        `insert into public.design_templates (org_id, scope, purpose, family, name) values ($1, 'org', 'poster', 'talk', 'قالب') returning id`,
        [f.a.id],
      );
      const insert = (doc: unknown) =>
        tx.q(`insert into public.design_template_versions (template_id, version, document) values ($1, 1, $2::jsonb)`, [t.id, JSON.stringify(doc)]);

      // REQ-DSG-021: «a literal #0B1220 in a template is a defect» — and it is
      // invisible until an org changes its brand and one template does not follow.
      expect(await errorCode(() => insert(DOC([LAYER("l1", { color: "#0B1220" })])))).toBe(INVALID_TEXT_REPRESENTATION);
      expect(
        await errorCode(() =>
          insert({ ...DOC(), background: { type: "solid", color: "#ffffff" } }),
        ),
      ).toBe(INVALID_TEXT_REPRESENTATION);
      expect(await errorCode(() => insert(DOC([LAYER("l1", { kind: "video" })])))).toBe(INVALID_TEXT_REPRESENTATION);
      expect(await errorCode(() => insert(DOC([LAYER("l1"), LAYER("l1")])))).toBe(INVALID_TEXT_REPRESENTATION);

      // A token colour is fine, which is the whole point of the rule.
      expect(await errorCode(() => insert(DOC([LAYER("l1", { color: "{{brand.fgHeading}}" })])))).toBeNull();
    });
  });
});

/* ═══ design_documents — 03 §5.9b, and REQ-DSG-024's locked regions ═══════ */

describe("POL-design_documents", () => {
  it("read — the presenter of the bound session sees it, another member does not, the admin does", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org" });
      const docId = await document(tx, f.a.id, t.versionId, { session: f.m2.a.published });

      // members[0] is the fixture's presenter of every session.
      await tx.as(f.a.members[0].claims);
      expect((await tx.q<{ id: string }>(`select id from public.design_documents`)).map((r) => r.id)).toContain(docId);

      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.design_documents`)).toEqual([]);

      await tx.as(f.a.admin.claims);
      expect((await tx.q<{ id: string }>(`select id from public.design_documents`)).map((r) => r.id)).toContain(docId);
    });
  });

  it("read — a member sees the document behind their OWN certificate and no one else's", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org", purpose: "certificate" });
      const cert = await certificate(tx, {
        orgId: f.a.id,
        memberId: f.a.members[1].memberId,
        sessionId: f.m2.a.completed,
        checkInId: f.m2.a.checkInCompleted,
        versionId: t.versionId,
      });
      const docId = await document(tx, f.a.id, t.versionId, { certificate: cert.id });

      await tx.as(f.a.members[1].claims);
      expect((await tx.q<{ id: string }>(`select id from public.design_documents`)).map((r) => r.id)).toContain(docId);

      // members[0] is the presenter of the session but not the recipient, and
      // the document is bound to the certificate, not to the session.
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.design_documents`)).toEqual([]);
    });
  });

  it("write — design is an admin act (REQ-DSG-002); a presenter cannot edit their own poster document", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org" });
      const docId = await document(tx, f.a.id, t.versionId, { session: f.m2.a.published });

      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`update public.design_documents set document = document where id = $1 returning id`, [docId])).toEqual([]);

      await tx.as(f.a.admin.claims);
      expect(await tx.q(`update public.design_documents set document = document where id = $1 returning id`, [docId])).toHaveLength(1);
    });
  });

  it("locked regions cannot be moved, resized, hidden, unlocked or deleted (REQ-DSG-024)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const qr = {
        id: "l_qr",
        kind: "qr",
        locked: true,
        frame: { x: 80, y: 1150, w: 140, h: 140 },
        qr: { binding: "certificate.verifyUrl", ecLevel: "M", quietZoneModules: 4 },
      };
      const t = await template(tx, { orgId: f.a.id, scope: "org", layers: [LAYER("l_title"), qr] });

      const write = (layers: unknown[]) =>
        tx.q(`insert into public.design_documents (org_id, template_version_id, purpose, document) values ($1, $2, 'poster', $3::jsonb)`, [
          f.a.id,
          t.versionId,
          JSON.stringify(DOC(layers)),
        ]);

      await tx.asOwner();
      // Moved, resized — a certificate whose QR was dragged off the page cannot
      // be verified, and that only shows up after it is printed.
      expect(await errorCode(() => write([LAYER("l_title"), { ...qr, frame: { x: 900, y: 1150, w: 140, h: 140 } }]))).toBe(CHECK_VIOLATION);
      expect(await errorCode(() => write([LAYER("l_title"), { ...qr, frame: { x: 80, y: 1150, w: 20, h: 20 } }]))).toBe(CHECK_VIOLATION);
      // Hidden, and its quieter twin.
      expect(await errorCode(() => write([LAYER("l_title"), { ...qr, hidden: true }]))).toBe(CHECK_VIOLATION);
      expect(await errorCode(() => write([LAYER("l_title"), { ...qr, opacity: 0 }]))).toBe(CHECK_VIOLATION);
      // Unlocked — unlocking is a platform-template-level act, not an in-editor one.
      expect(await errorCode(() => write([LAYER("l_title"), { ...qr, locked: false }]))).toBe(CHECK_VIOLATION);
      // Deleted.
      expect(await errorCode(() => write([LAYER("l_title")]))).toBe(CHECK_VIOLATION);

      // And the unlocked layer moves freely — the guard constrains the template's
      // locked regions and nothing else.
      expect(await errorCode(() => write([{ ...LAYER("l_title"), frame: { x: 400, y: 20, w: 300, h: 90 } }, qr]))).toBeNull();
    });
  });
});

/* ═══ design_assets — DEC-009, the sniffed type is the authority ══════════ */

describe("POL-design_assets", () => {
  it("insert.mime — an SVG named .png is rejected on `sniffed_mime`, not on the filename", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.design_assets (org_id, storage_path, sniffed_mime) values ($1, $2, 'image/svg+xml')`, [
            f.a.id,
            `${f.a.id}/design/assets/logo.png`,
          ]),
        ),
      ).toBe(CHECK_VIOLATION);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.design_assets (org_id, storage_path, sniffed_mime) values ($1, $2, 'image/png')`, [
            f.a.id,
            `${f.a.id}/design/assets/logo.png`,
          ]),
        ),
      ).toBeNull();
    });
  });

  it("a plain member cannot add or remove an asset; an asset is never updated in place", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [a] = await tx.q<{ id: string }>(
        `insert into public.design_assets (org_id, storage_path, sniffed_mime) values ($1, $2, 'image/png') returning id`,
        [f.a.id, `${f.a.id}/design/assets/a.png`],
      );

      await tx.as(f.a.members[0].claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.design_assets (org_id, storage_path, sniffed_mime) values ($1, $2, 'image/png')`, [f.a.id, `${f.a.id}/design/assets/b.png`]),
        ),
      ).toBe(PERMISSION_DENIED);

      await tx.as(f.a.admin.claims);
      // No update policy and no update grant: the sniff happens once, and a row
      // describing different bytes is a different row.
      expect(await errorCode(() => tx.q(`update public.design_assets set sniffed_mime = 'image/webp' where id = $1`, [a.id]))).toBe(PERMISSION_DENIED);
      expect(await tx.q(`delete from public.design_assets where id = $1 returning id`, [a.id])).toHaveLength(1);
    });
  });
});

/* ═══ fonts and export_artifacts — job-written ════════════════════════════ */

describe("POL-fonts", () => {
  it("select — every member reads the manifest; only the job writes it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(
        `insert into public.fonts (family, style, weight, source, storage_path, sha256, subsets, parity_status)
         values ('Lateef', 'normal', 400, 'google', $1, $2, '{arabic}', 'pending')`,
        ["a".repeat(64) + ".woff2", "a".repeat(64)],
      );

      await tx.as(f.a.members[0].claims);
      const rows = await tx.q<{ family: string; parity_status: string }>(`select family, parity_status from public.fonts`);
      expect(rows.map((r) => r.family)).toContain("Lateef");
      // A pending font is visible and NOT selectable — the picker filters on
      // parity_status, and the admin is told which goldens failed (06 §7.2).
      expect(rows.find((r) => r.family === "Lateef")?.parity_status).toBe("pending");

      await tx.as(f.a.admin.claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.fonts (family, source, storage_path, sha256) values ('Cairo', 'google', 'x', $1)`, ["b".repeat(64)]),
        ),
      ).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`update public.fonts set parity_status = 'passed'`))).toBe(PERMISSION_DENIED);
    });
  });

  it("a font cannot reach `passed` without Arabic coverage (A39)", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asOwner();
      expect(
        await errorCode(() =>
          tx.q(`insert into public.fonts (family, source, storage_path, sha256, subsets, parity_status)
                values ('Inter', 'google', 'x', $1, '{latin}', 'passed')`, ["c".repeat(64)]),
        ),
      ).toBe(CHECK_VIOLATION);
    });
  });
});

describe("POL-export_artifacts", () => {
  it("select follows the document; no client role writes one", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org" });
      const docId = await document(tx, f.a.id, t.versionId, { session: f.m2.a.published });
      await tx.q(
        `insert into public.export_artifacts (org_id, document_id, preset, format, status, source_fingerprint, storage_path, rendered_at)
         values ($1, $2, 'a3', 'pdf', 'ready', 'fp1', $3, now())`,
        [f.a.id, docId, `${f.a.id}/exports/${docId}/a3.pdf`],
      );

      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.export_artifacts`)).toHaveLength(1);

      await tx.as(f.a.admin.claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.export_artifacts (org_id, document_id, preset, format, source_fingerprint) values ($1, $2, 'og', 'png', 'fp2')`, [
            f.a.id,
            docId,
          ]),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });

  it("source_fingerprint is the cache key — the same source cannot be stored twice (REQ-DSG-013)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org" });
      const docId = await document(tx, f.a.id, t.versionId, { session: f.m2.a.published });
      const add = (fp: string) =>
        tx.q(`insert into public.export_artifacts (org_id, document_id, preset, format, source_fingerprint) values ($1, $2, 'og', 'png', $3)`, [
          f.a.id,
          docId,
          fp,
        ]);
      expect(await errorCode(() => add("fp1"))).toBeNull();
      expect(await errorCode(() => add("fp1"))).toBe("23505");
      // A changed source is a different key, so invalidation cannot be forgotten.
      expect(await errorCode(() => add("fp2"))).toBeNull();
    });
  });
});

/* ═══ session_posters — DEC-012, the live/detached rule as constraints ════ */

describe("POL-session_posters", () => {
  it("the live/detached rule is structural: an `auto` poster is always live", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      expect(
        await errorCode(() =>
          tx.q(`insert into public.session_posters (org_id, session_id, mode, binding, detached_at) values ($1, $2, 'auto', 'detached', now())`, [
            f.a.id,
            f.m2.a.published,
          ]),
        ),
      ).toBe(CHECK_VIOLATION);
      // An uploaded poster must name the asset it was uploaded as, and only it.
      expect(
        await errorCode(() =>
          tx.q(`insert into public.session_posters (org_id, session_id, mode, binding, detached_at) values ($1, $2, 'uploaded', 'detached', now())`, [
            f.a.id,
            f.m2.a.published,
          ]),
        ),
      ).toBe(CHECK_VIOLATION);
      expect(
        await errorCode(() => tx.q(`insert into public.session_posters (org_id, session_id, mode) values ($1, $2, 'auto')`, [f.a.id, f.m2.a.published])),
      ).toBeNull();
    });
  });

  it("every member reads the poster; only an admin writes it, and nobody deletes it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`insert into public.session_posters (org_id, session_id, mode) values ($1, $2, 'auto')`, [f.a.id, f.m2.a.published]);

      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.session_posters`)).toHaveLength(1);
      expect(
        await errorCode(() => tx.q(`insert into public.session_posters (org_id, session_id, mode) values ($1, $2, 'auto')`, [f.a.id, f.m2.a.completed])),
      ).toBe(PERMISSION_DENIED);

      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`delete from public.session_posters`))).toBe(PERMISSION_DENIED);
    });
  });
});

/* ═══ certificates — 02 §4.12, 03 §5.8a ══════════════════════════════════ */

describe("certificates", () => {
  it("REQ-CRT-001 — an attendee certificate without a `check_in_id` is refused by the TABLE", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org", purpose: "certificate" });
      const base = (checkIn: string | null, kind = "attendance", serial = "KM-2026-000001") =>
        tx.q(
          `insert into public.certificates (org_id, member_id, kind, session_id, check_in_id, serial, verification_code,
                                            state, template_version_id, recipient_name_snapshot, issued_at)
           values ($1, $2, $3, $4, $5, $6, public.new_verification_code(), 'issued', $7, 'سارة', now())`,
          [f.a.id, f.a.members[1].memberId, kind, f.m2.a.completed, checkIn, serial, t.versionId],
        );

      // REQ-CHK-009 made structural: no bug in the issuance job can bypass it.
      expect(await errorCode(() => base(null))).toBe(CHECK_VIOLATION);
      expect(await errorCode(() => base(f.m2.a.checkInCompleted))).toBeNull();
      // A presenter certificate needs no check-in — A5's co-presenters never
      // check in as attendees.
      expect(await errorCode(() => base(null, "presenter", "KM-2026-000002"))).toBeNull();
    });
  });

  it("REQ-CRT-003 — issuance is idempotent: the same session, member and kind cannot be certified twice", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org", purpose: "certificate" });
      const o = { orgId: f.a.id, memberId: f.a.members[1].memberId, sessionId: f.m2.a.completed, checkInId: f.m2.a.checkInCompleted, versionId: t.versionId };
      await certificate(tx, o);
      expect(await errorCode(() => certificate(tx, o, { serial: "KM-2026-000002" }))).toBe("23505");
    });
  });

  it("REQ-CRT-011 — a revoked certificate must carry a reason", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org", purpose: "certificate" });
      const o = { orgId: f.a.id, memberId: f.a.members[1].memberId, sessionId: f.m2.a.completed, checkInId: f.m2.a.checkInCompleted, versionId: t.versionId };
      expect(await errorCode(() => certificate(tx, o, { state: "revoked", revokedReason: "  " }))).toBe(CHECK_VIOLATION);
      expect(await errorCode(() => certificate(tx, o, { state: "revoked" }))).toBeNull();
    });
  });

  it("REQ-CRT-004 — a HELD certificate is invisible to its recipient and visible to the admin", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org", purpose: "certificate" });
      const held = await certificate(
        tx,
        { orgId: f.a.id, memberId: f.a.members[1].memberId, sessionId: f.m2.a.completed, checkInId: f.m2.a.checkInCompleted, versionId: t.versionId },
        { state: "held" },
      );

      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.certificates`)).toEqual([]);

      await tx.as(f.a.admin.claims);
      expect((await tx.q<{ id: string }>(`select id from public.certificates`)).map((r) => r.id)).toContain(held.id);

      // And once released, its recipient sees it — and no one else's.
      await tx.asOwner();
      await tx.q(`update public.certificates set state = 'issued', issued_at = now() where id = $1`, [held.id]);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.certificates`)).toHaveLength(1);
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.certificates`)).toEqual([]);
    });
  });

  it("writes are RPC-only — no role may insert, update or delete directly", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org", purpose: "certificate" });
      const c = await certificate(tx, {
        orgId: f.a.id,
        memberId: f.a.members[1].memberId,
        sessionId: f.m2.a.completed,
        checkInId: f.m2.a.checkInCompleted,
        versionId: t.versionId,
      });

      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`update public.certificates set state = 'revoked' where id = $1`, [c.id]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`delete from public.certificates where id = $1`, [c.id]))).toBe(PERMISSION_DENIED);
    });
  });
});

/* ═══ the serial — REQ-CRT-008, DEC-010 ══════════════════════════════════ */

describe("POL-certificates.serial", () => {
  it("gapless — a rolled-back issuance leaves `next_value` unchanged", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();

      const year = new Date().getUTCFullYear();
      const [first] = await tx.q<{ allocate_serial: string }>(`select public.allocate_serial($1)`, [f.a.id]);
      expect(first.allocate_serial).toBe(`KM-${year}-000001`);
      const after = async () =>
        (await tx.q<{ next_value: number }>(`select next_value from public.certificate_serial_counters where org_id = $1`, [f.a.id]))[0].next_value;
      expect(await after()).toBe(2);

      // A SEQUENCE would consume a number here and leave a hole; in a
      // certificate register a gap reads as a lost or hidden certificate.
      await tx.q(`create function pg_temp.allocate_then_fail(p_org uuid) returns void
                  language plpgsql as $$
                  declare v text;
                  begin
                    v := public.allocate_serial(p_org);
                    raise exception 'deliberate_rollback: %', v;
                  end $$`);
      expect(await errorCode(() => tx.q(`select pg_temp.allocate_then_fail($1)`, [f.a.id]))).toBe("P0001");
      expect(await after()).toBe(2);

      const [next] = await tx.q<{ allocate_serial: string }>(`select public.allocate_serial($1)`, [f.a.id]);
      expect(next.allocate_serial).toBe(`KM-${year}-000002`);
    });
  });

  it("per-org — two orgs both issue …-000001 without collision", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const a = (await tx.q<{ allocate_serial: string }>(`select public.allocate_serial($1)`, [f.a.id]))[0].allocate_serial;
      const b = (await tx.q<{ allocate_serial: string }>(`select public.allocate_serial($1)`, [f.b.id]))[0].allocate_serial;
      // Both counters start at 1 and neither sees the other — the sequence is
      // per-org, which is DEC-010's own wording: "two orgs may both hold …-000123".
      expect(a.endsWith("-000001")).toBe(true);
      expect(b.endsWith("-000001")).toBe(true);
      // `orgs.certificate_prefix` (0004) is what keeps them distinguishable.
      expect(a.startsWith("KM-")).toBe(true);
      expect(b.startsWith("OT-")).toBe(true);
    });
  });

  it("the counter table has no policy and no grant — every client role is refused", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`select public.allocate_serial($1)`, [f.a.id]);

      for (const claims of [f.a.admin.claims, f.a.members[0].claims]) {
        await tx.as(claims);
        expect(await errorCode(() => tx.q(`select * from public.certificate_serial_counters`))).toBe(PERMISSION_DENIED);
      }
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select * from public.certificate_serial_counters`))).toBe(PERMISSION_DENIED);

      // And allocate_serial() itself is not a door a client may open.
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.allocate_serial($1)`, [f.a.id]))).toBe(PERMISSION_DENIED);
    });
  });
});

/* ═══ /verify — 03 §5.8a, REQ-CRT-007/009 ════════════════════════════════ */

describe("POL-certificates.verify.anon", () => {
  it("resolves by verification code, and returns the A13 fields and nothing else", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org", purpose: "certificate" });
      const c = await certificate(tx, {
        orgId: f.a.id,
        memberId: f.a.members[1].memberId,
        sessionId: f.m2.a.completed,
        checkInId: f.m2.a.checkInCompleted,
        versionId: t.versionId,
      });

      await tx.asAnon();
      const rows = await tx.q<Record<string, unknown>>(`select * from public.verify_certificate($1)`, [c.verification_code]);
      expect(rows).toHaveLength(1);
      expect(rows[0].recipient_name).toBe("سارة العتيبي");
      expect(rows[0].state).toBe("issued");
      // The return type IS the allowlist: a later column addition cannot leak,
      // and the revocation reason is not in it (REQ-CRT-011).
      expect(Object.keys(rows[0]).sort()).toEqual(
        ["achievement_name", "issued_at", "kind", "org_name", "recipient_name", "session_date", "session_title", "state"].sort(),
      );
    });
  });

  it("a SERIAL returns not-found, and unknown and held are the same empty answer", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org", purpose: "certificate" });
      const c = await certificate(tx, {
        orgId: f.a.id,
        memberId: f.a.members[1].memberId,
        sessionId: f.m2.a.completed,
        checkInId: f.m2.a.checkInCompleted,
        versionId: t.versionId,
      });
      const held = await certificate(
        tx,
        { orgId: f.a.id, memberId: f.a.members[0].memberId, sessionId: f.m2.a.published, checkInId: f.m2.a.checkInPublished, versionId: t.versionId },
        { state: "held", serial: "KM-2026-000002" },
      );

      await tx.asAnon();
      const verify = (code: string) => tx.q(`select * from public.verify_certificate($1)`, [code]);
      // ★ REQ-CRT-009: /verify/KM-2026-000001 cannot be walked.
      expect(await verify(c.serial)).toEqual([]);
      expect(await verify("لا-يوجد")).toEqual([]);
      expect(await verify("")).toEqual([]);
      // A held certificate is indistinguishable from one that never existed.
      expect(await verify(held.verification_code)).toEqual([]);
    });
  });

  it("a revoked certificate verifies as revoked, and the reason never leaves the database", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org", purpose: "certificate" });
      const c = await certificate(
        tx,
        { orgId: f.a.id, memberId: f.a.members[1].memberId, sessionId: f.m2.a.completed, checkInId: f.m2.a.checkInCompleted, versionId: t.versionId },
        { state: "revoked", revokedReason: "أُصدرت لشخص خاطئ" },
      );

      await tx.asAnon();
      const [row] = await tx.q<Record<string, unknown>>(`select * from public.verify_certificate($1)`, [c.verification_code]);
      expect(row.state).toBe("revoked");
      expect(JSON.stringify(row)).not.toContain("خاطئ");
      // And anon still has no way to the table itself.
      expect(await errorCode(() => tx.q(`select * from public.certificates`))).toBe(PERMISSION_DENIED);
    });
  });

  it("the verification code is 22+ characters and unique platform-wide (REQ-CRT-009)", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asOwner();
      const codes = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const [row] = await tx.q<{ code: string }>(`select public.new_verification_code() as code`);
        expect(row.code.length).toBeGreaterThanOrEqual(22);
        expect(row.code).toMatch(/^[A-Za-z0-9_-]+$/);
        codes.add(row.code);
      }
      expect(codes.size).toBe(40);
    });
  });
});

/* ═══ 0002 — a template's working draft, and one default per family ══════ */

describe("design_documents.draft_for_template_id", () => {
  it("a template has exactly ONE working draft", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org" });
      const draft = (over: Record<string, unknown> = {}) =>
        tx.q(
          `insert into public.design_documents (org_id, template_version_id, purpose, document, draft_for_template_id, bound_session_id)
           values ($1, $2, 'poster', $3::jsonb, $4, $5)`,
          [f.a.id, t.versionId, JSON.stringify(DOC()), over.draft ?? t.templateId, over.session ?? null],
        );

      expect(await errorCode(() => draft())).toBeNull();
      // Two admins opening the library must not each get their own draft:
      // one of them would then publish over the other's version.
      expect(await errorCode(() => draft())).toBe("23505");
    });
  });

  it("a document is a poster, a certificate or a template draft — never two", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org" });
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.design_documents (org_id, template_version_id, purpose, document, draft_for_template_id, bound_session_id)
             values ($1, $2, 'poster', $3::jsonb, $4, $5)`,
            [f.a.id, t.versionId, JSON.stringify(DOC()), t.templateId, f.m2.a.published],
          ),
        ),
      ).toBe(CHECK_VIOLATION);
    });
  });

  it("a draft is an admin's to read and write — it is bound to nothing, so 03 §5.9b gives a member nothing", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const t = await template(tx, { orgId: f.a.id, scope: "org" });
      await tx.q(
        `insert into public.design_documents (org_id, template_version_id, purpose, document, draft_for_template_id)
         values ($1, $2, 'poster', $3::jsonb, $4)`,
        [f.a.id, t.versionId, JSON.stringify(DOC()), t.templateId],
      );

      // members[0] is the presenter of every fixture session, and still sees
      // nothing: a template draft is bound to no session at all.
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.design_documents where draft_for_template_id is not null`)).toEqual([]);

      await tx.as(f.a.admin.claims);
      expect(await tx.q(`select id from public.design_documents where draft_for_template_id is not null`)).toHaveLength(1);
    });
  });
});

describe("design_templates_single_default", () => {
  it("promoting a default demotes the previous one in the same statement", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const make = async (name: string) =>
        (
          await tx.q<{ id: string }>(
            `insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
             values ($1, 'org', 'poster', 'talk', $2, false) returning id`,
            [f.a.id, name],
          )
        )[0].id;
      const first = await make("الأول");
      const second = await make("الثاني");

      await tx.q(`update public.design_templates set is_default = true where id = $1`, [first]);
      await tx.q(`update public.design_templates set is_default = true where id = $1`, [second]);

      const rows = await tx.q<{ id: string; is_default: boolean }>(
        `select id, is_default from public.design_templates where id = any($1::uuid[])`,
        [[first, second]],
      );
      // Not a clear-then-set an application could half-perform: a family with
      // no default is a publish with no template to bind (DEC-012).
      expect(rows.find((r) => r.id === first)?.is_default).toBe(false);
      expect(rows.find((r) => r.id === second)?.is_default).toBe(true);
    });
  });

  it("another org's default and another family's are untouched", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const make = async (orgId: string, family: string) =>
        (
          await tx.q<{ id: string }>(
            `insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
             values ($1, 'org', 'poster', $2, 'قالب', true) returning id`,
            [orgId, family],
          )
        )[0].id;
      const aTalk = await make(f.a.id, "talk");
      const bTalk = await make(f.b.id, "talk");
      const aPanel = await make(f.a.id, "panel");

      const rows = await tx.q<{ id: string; is_default: boolean }>(
        `select id, is_default from public.design_templates where id = any($1::uuid[])`,
        [[aTalk, bTalk, aPanel]],
      );
      expect(rows.every((r) => r.is_default)).toBe(true);
    });
  });
});
