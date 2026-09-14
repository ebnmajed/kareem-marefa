// The export pipeline's four doors — 02 §4.13, 03 §5.9, REQ-DSG-011 …
// REQ-DSG-014, 11 §2.5. Applied with applyProposed() inside each test's
// rolled-back transaction (DEC-040).
//
// The three properties worth a test here, none of which any other layer
// checks:
//
//   · re-requesting an UNCHANGED document renders nothing and enqueues
//     nothing — the cache is the unique constraint, and REQ-DSG-013's
//     «re-opening a session does not re-render anything» is either true here
//     or nowhere;
//   · a failed artifact is picked up again, because an admin asking a second
//     time after a failure is asking for a retry;
//   · `export_artifacts` is job-written: an admin cannot record one, and the
//     worker's two doors are service_role only.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["designer/0002_template_drafts.sql", "designer/0003_render_pipeline.sql"];
const FINGERPRINT = "f".repeat(64);

async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  await tx.asOwner();
  // fixture-m6 seeds every M6 table on both orgs so the isolation sweep is
  // not vacuous (DEC-049); these cases COUNT artifacts and queue rows, so
  // they start from an empty M6 world inside the rolled-back transaction.
  // Order matters: `certificates.template_version_id` is ON DELETE RESTRICT
  // (a version that produced a certificate must outlive it — REQ-CRT-014),
  // so the certificates go first or nothing else can.
  for (const t of ["certificates", "export_artifacts", "session_posters", "design_documents", "design_template_versions", "design_templates"]) {
    await tx.q(`delete from public.${t}`);
  }
  await tx.q(`delete from graphile_worker._private_jobs`);
  return f;
}

const DOC = {
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction: "rtl",
  layers: [{ id: "l_title", kind: "text", frame: { x: 80, y: 300, w: 920, h: 320 }, text: { literal: "عنوان" }, font: { family: "X", size: 96 } }],
};

async function document(tx: Tx, orgId: string, sessionId: string) {
  const [t] = await tx.q<{ id: string }>(
    `insert into public.design_templates (org_id, scope, purpose, family, name) values ($1, 'org', 'poster', 'talk', 'قالب') returning id`,
    [orgId],
  );
  const [v] = await tx.q<{ id: string }>(
    `insert into public.design_template_versions (template_id, version, document) values ($1, 1, $2::jsonb) returning id`,
    [t.id, JSON.stringify(DOC)],
  );
  const [d] = await tx.q<{ id: string }>(
    `insert into public.design_documents (org_id, template_version_id, purpose, document, bound_session_id)
     values ($1, $2, 'poster', $3::jsonb, $4) returning id`,
    [orgId, v.id, JSON.stringify(DOC), sessionId],
  );
  return d.id;
}

const TARGETS = JSON.stringify([
  { preset: "master", format: "png" },
  { preset: "a3", format: "pdf" },
]);
const CONTEXT = JSON.stringify({ bindings: { "session.title": "جلسة" }, faces: [{ family: "X", weight: 400, style: "normal", sha256: "a".repeat(64) }] });

const request = (tx: Tx, documentId: string, fingerprint = FINGERPRINT, targets = TARGETS) =>
  tx.q<{ id: string; preset: string; status: string }>(`select * from public.request_render($1, $2, $3::jsonb, $4::jsonb)`, [
    documentId,
    fingerprint,
    CONTEXT,
    targets,
  ]);

// `graphile_worker.jobs` is a VIEW over `_private_jobs` in 0.18 — readable,
// but only the private table can be emptied between cases.
const jobs = (tx: Tx) => tx.q<{ key: string; task_identifier: string }>(`select key, task_identifier from graphile_worker.jobs order by key`);

describe("POL-export_artifacts.request.admin", () => {
  it("an admin queues one row per target; a moderator and a member are refused", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const docId = await document(tx, f.a.id, f.m2.a.published);

      for (const claims of [f.a.mod.claims, f.a.members[0].claims]) {
        await tx.as(claims);
        expect(await errorCode(() => request(tx, docId))).toBe(PERMISSION_DENIED);
      }

      await tx.as(f.a.admin.claims);
      const rows = await request(tx, docId);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.status === "queued")).toBe(true);
    });
  });

  it("another org's document is refused, not silently rendered", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const theirs = await document(tx, f.b.id, f.m2.b.published);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => request(tx, theirs))).toBe(PERMISSION_DENIED);
    });
  });

  it("enqueues render_variant on the `render` queue with 11 §2.5's key, verbatim", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const docId = await document(tx, f.a.id, f.m2.a.published);
      await tx.as(f.a.admin.claims);
      await request(tx, docId);

      await tx.asOwner();
      const queued = await jobs(tx);
      expect(queued.map((j) => j.task_identifier)).toEqual(["render_variant", "render_variant"]);
      // `doc:{document_id}:{preset}:{format}` — the key is what makes
      // re-saving a poster leave ONE pending render.
      expect(queued.map((j) => j.key).sort()).toEqual([`doc:${docId}:a3:pdf`, `doc:${docId}:master:png`].sort());
      const [{ queue_name }] = await tx.q<{ queue_name: string }>(`select queue_name from graphile_worker.jobs limit 1`);
      // 11 §1.4: its own queue, so one 30-second A3 never starves a reminder.
      expect(queue_name).toBe("render");
    });
  });

  it("writes an audit row for the admin's export request", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const docId = await document(tx, f.a.id, f.m2.a.published);
      await tx.as(f.a.admin.claims);
      await request(tx, docId);

      await tx.asOwner();
      const [row] = await tx.q<{ action: string; actor_id: string }>(
        `select action, actor_id from public.audit_log where action = 'design.export_requested' and subject_id = $1`,
        [docId],
      );
      expect(row.action).toBe("design.export_requested");
      expect(row.actor_id).toBe(f.a.admin.memberId);
    });
  });
});

describe("POL-export_artifacts.cache", () => {
  it("★ re-requesting an unchanged source renders nothing and enqueues nothing new", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const docId = await document(tx, f.a.id, f.m2.a.published);
      await tx.as(f.a.admin.claims);
      await request(tx, docId);

      // Both artifacts finish.
      await tx.asOwner();
      await tx.q(`update public.export_artifacts set status = 'ready', storage_path = 'x/y.png', rendered_at = now()`);
      await tx.q(`delete from graphile_worker._private_jobs`);

      await tx.as(f.a.admin.claims);
      const again = await request(tx, docId);
      expect(again).toHaveLength(2);
      expect(again.every((r) => r.status === "ready")).toBe(true);

      await tx.asOwner();
      // REQ-DSG-013: «re-opening a session does not re-render anything».
      expect(await jobs(tx)).toEqual([]);
      expect(await tx.q(`select id from public.export_artifacts`)).toHaveLength(2);
    });
  });

  it("a CHANGED source is a different key, so it renders — and leaves the old artifact alone", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const docId = await document(tx, f.a.id, f.m2.a.published);
      await tx.as(f.a.admin.claims);
      await request(tx, docId);
      await request(tx, docId, "e".repeat(64));

      await tx.asOwner();
      // Invalidation is impossible to forget: a changed source produces a
      // different KEY rather than requiring someone to clear a cache.
      expect(await tx.q(`select id from public.export_artifacts`)).toHaveLength(4);
    });
  });

  it("a FAILED artifact is picked up again by a repeat request — asking twice after a failure is asking for a retry", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const docId = await document(tx, f.a.id, f.m2.a.published);
      await tx.as(f.a.admin.claims);
      await request(tx, docId);

      await tx.asOwner();
      await tx.q(`update public.export_artifacts set status = 'failed', error = 'tier_a: the face never resolved'`);
      await tx.q(`delete from graphile_worker._private_jobs`);

      await tx.as(f.a.admin.claims);
      const again = await request(tx, docId);
      expect(again.every((r) => r.status === "queued")).toBe(true);

      await tx.asOwner();
      expect(await jobs(tx)).toHaveLength(2);
      // The stale reason is cleared with the status: a failure message beside
      // a queued artifact reads as a queued artifact nobody should trust.
      expect(await tx.q(`select id from public.export_artifacts where error is not null`)).toEqual([]);
    });
  });

  it("refuses a fingerprint too short to be one", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const docId = await document(tx, f.a.id, f.m2.a.published);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => request(tx, docId, "short"))).toBe("22023");
    });
  });
});

describe("POL-export_artifacts.record.worker", () => {
  it("the worker's two doors are service_role only", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const docId = await document(tx, f.a.id, f.m2.a.published);
      await tx.as(f.a.admin.claims);
      const [artifact] = await request(tx, docId);

      for (const claims of [f.a.admin.claims, f.a.members[0].claims]) {
        await tx.as(claims);
        expect(await errorCode(() => tx.q(`select public.record_export_artifact($1, 'ready')`, [artifact.id]))).toBe(PERMISSION_DENIED);
        expect(await errorCode(() => tx.q(`select * from public.export_render_context($1)`, [artifact.id]))).toBe(PERMISSION_DENIED);
      }

      await tx.asServiceRole();
      expect(await errorCode(() => tx.q(`select public.record_export_artifact($1, 'ready', 'p/x.png', 100, 1080, 1350, '{}'::jsonb, null)`, [artifact.id]))).toBeNull();
    });
  });

  it("a ready artifact carries no stale error, and a failed one carries the worker's own words", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const docId = await document(tx, f.a.id, f.m2.a.published);
      await tx.as(f.a.admin.claims);
      const [artifact] = await request(tx, docId);

      await tx.asServiceRole();
      // Read back through the function's own RETURNING, not a select: 0055
      // revokes everything on `export_artifacts` from service_role too
      // (03 §5.9, job-written), so these two definer functions ARE the
      // worker's whole interface to the table — asserted below.
      const [failed] = await tx.q<{ status: string; error: string; rendered_at: string | null }>(
        `select status, error, rendered_at from public.record_export_artifact($1, 'failed', null, null, null, null, null, 'tier_a: l_title: font_never_loaded')`,
        [artifact.id],
      );
      expect(failed.status).toBe("failed");
      expect(failed.error).toContain("font_never_loaded");
      expect(failed.rendered_at).toBeNull();

      const [ready] = await tx.q<{ status: string; error: string | null; rendered_at: string | null }>(
        `select status, error, rendered_at from public.record_export_artifact($1, 'ready', 'p/x.png', 100, 1080, 1350, '{"l_title":{}}'::jsonb, null)`,
        [artifact.id],
      );
      expect(ready.status).toBe("ready");
      expect(ready.error).toBeNull();
      expect(ready.rendered_at).not.toBeNull();

      // ★ And the worker cannot reach the table any other way. A direct
      // select would mean the definer functions are a convenience rather
      // than the boundary.
      expect(await errorCode(() => tx.q(`select id from public.export_artifacts`))).toBe(PERMISSION_DENIED);
    });
  });

  it("export_render_context hands the worker the document and the previous signature of this fingerprint", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const docId = await document(tx, f.a.id, f.m2.a.published);
      await tx.as(f.a.admin.claims);
      const rows = await request(tx, docId);
      const master = rows.find((r) => r.preset === "master");

      await tx.asServiceRole();
      // A ready render of the SAME fingerprint, preset and format is what a
      // later render is compared against (06 §9.1).
      await tx.q(`select public.record_export_artifact($1, 'ready', 'p/x.png', 10, 1080, 1350, '{"l_title":{"lineCount":2}}'::jsonb, null)`, [master!.id]);

      const [ctx] = await tx.q<{ document: unknown; render_context: { bindings: Record<string, string> }; previous_signature: unknown }>(
        `select document, render_context, previous_signature from public.export_render_context($1)`,
        [master!.id],
      );
      expect((ctx.document as { layers: unknown[] }).layers).toHaveLength(1);
      expect(ctx.render_context.bindings["session.title"]).toBe("جلسة");
      expect(ctx.previous_signature).toEqual({ l_title: { lineCount: 2 } });
    });
  });
});

describe("POL-export_artifacts.retry.admin", () => {
  it("an admin retries a failed artifact; a ready one is left alone", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const docId = await document(tx, f.a.id, f.m2.a.published);
      await tx.as(f.a.admin.claims);
      const [failed, ready] = await request(tx, docId);

      await tx.asOwner();
      await tx.q(`update public.export_artifacts set status = 'failed', error = 'boom' where id = $1`, [failed.id]);
      await tx.q(`update public.export_artifacts set status = 'ready', storage_path = 'p/x.pdf', rendered_at = now() where id = $1`, [ready.id]);
      await tx.q(`delete from graphile_worker._private_jobs`);

      await tx.as(f.a.admin.claims);
      await tx.q(`select public.retry_export_artifact($1)`, [failed.id]);
      // Re-rendering a ready artifact would burn a render to produce bytes
      // that already exist (REQ-DSG-013).
      await tx.q(`select public.retry_export_artifact($1)`, [ready.id]);

      await tx.asOwner();
      const rows = await tx.q<{ id: string; status: string }>(`select id, status from public.export_artifacts`);
      expect(rows.find((r) => r.id === failed.id)?.status).toBe("queued");
      expect(rows.find((r) => r.id === ready.id)?.status).toBe("ready");
      expect(await jobs(tx)).toHaveLength(1);
    });
  });

  it("a moderator cannot retry, and neither can another org's admin", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const docId = await document(tx, f.a.id, f.m2.a.published);
      await tx.as(f.a.admin.claims);
      const [artifact] = await request(tx, docId);

      for (const claims of [f.a.mod.claims, f.b.admin.claims]) {
        await tx.as(claims);
        expect(await errorCode(() => tx.q(`select public.retry_export_artifact($1)`, [artifact.id]))).toBe(PERMISSION_DENIED);
      }
    });
  });

  it("a retry is audited", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const docId = await document(tx, f.a.id, f.m2.a.published);
      await tx.as(f.a.admin.claims);
      const [artifact] = await request(tx, docId);
      await tx.asOwner();
      await tx.q(`update public.export_artifacts set status = 'failed', error = 'boom' where id = $1`, [artifact.id]);

      await tx.as(f.a.admin.claims);
      await tx.q(`select public.retry_export_artifact($1)`, [artifact.id]);

      await tx.asOwner();
      const [row] = await tx.q<{ actor_id: string }>(`select actor_id from public.audit_log where action = 'design.export_retried' and subject_id = $1`, [
        artifact.id,
      ]);
      expect(row.actor_id).toBe(f.a.admin.memberId);
    });
  });
});
