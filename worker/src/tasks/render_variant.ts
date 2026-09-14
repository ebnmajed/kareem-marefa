import type { Task } from "graphile-worker";
import { createHash } from "node:crypto";
import { fingerprintSource, validateDocument, type DesignDocument, type PresetName } from "@kareem/designer-runtime";
import { storagePaths } from "@kareem/storage-paths";
import { uploadObject } from "../content/storage.js";
import { inlineFaces, type ManifestRow } from "../render/fonts.js";
import { renderVariant, type ExportFormat } from "../render/variant.js";

// JOB-render_variant — 11 §2.5, REQ-DSG-011 … REQ-DSG-014, DEC-017.
//
// Key `doc:{document_id}:{preset}:{format}`, retry 3, queue `render`. The key
// is what makes re-saving a poster leave ONE pending render; the separate
// queue is what stops a 30-second A3 starving a reminder (11 §1.4).
//
// THE ORDER MATTERS, so it is stated once here and held in variant.ts:
// derive → auto-fit against the real text → lay out → TIER A → capture →
// upload → record. Tier A runs before anything reaches storage, because an
// artifact that was uploaded and then found wrong is an artifact someone has
// already downloaded.
//
// Every failure lands in `export_artifacts.error` through
// record_export_artifact() before it is re-thrown, so the admin's retry
// screen says WHAT failed rather than "failed" (REQ-DSG-012) — and the throw
// is what lets graphile-worker count the attempt.

interface Payload {
  artifact_id: string;
}

function isPayload(p: unknown): p is Payload {
  const v = p as Partial<Payload> | null;
  return !!v && typeof v.artifact_id === "string";
}

interface Context {
  artifact_id: string;
  org_id: string;
  document_id: string;
  preset: PresetName;
  format: ExportFormat;
  source_fingerprint: string;
  render_context: { bindings?: Record<string, string>; faces?: ManifestRow[] } | null;
  document: unknown;
  template_version_id: string | null;
  previous_signature: Record<string, never> | null;
  allow_jpeg: boolean;
}

const EXTENSION: Record<ExportFormat, string> = { png: "png", webp: "webp", jpeg: "jpg", pdf: "pdf" };

export const render_variant: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error(`render_variant: malformed payload ${JSON.stringify(payload)}`);

  const { rows } = await helpers.query<Context>(`select * from public.export_render_context($1)`, [payload.artifact_id]);
  const ctx = rows[0];
  if (!ctx) {
    // The artifact was deleted with its document. Nothing to render and
    // nothing to record — a warning, not a failure to retry three times.
    helpers.logger.warn(`render_variant: artifact ${payload.artifact_id} no longer exists — skipping`);
    return;
  }

  const fail = async (message: string) => {
    await helpers.query(`select public.record_export_artifact($1, 'failed', null, null, null, null, null, $2)`, [ctx.artifact_id, message]);
    throw new Error(`render_variant: ${message}`);
  };

  try {
    await helpers.query(`select public.record_export_artifact($1, 'rendering')`, [ctx.artifact_id]);

    const parsed = validateDocument(ctx.document);
    if (!parsed.ok) {
      return await fail(`the stored document is invalid — ${parsed.issues.map((i) => `${i.path}:${i.code}`).join(", ")}`);
    }
    const document: DesignDocument = parsed.document;

    const bindings = ctx.render_context?.bindings ?? {};
    const faceRows = ctx.render_context?.faces ?? [];
    if (!faceRows.length) {
      return await fail("the render context pins no faces — a render with no font set cannot be reproduced (REQ-DSG-016)");
    }

    // ★ The document may have been edited between the request and now. The
    // fingerprint is the whole cache key, so rendering new content under an
    // old key would serve the wrong poster forever. Recomputed from what was
    // actually loaded, and refused on a mismatch — the admin re-requests and
    // gets a correct key.
    const recomputed = createHash("sha256")
      .update(
        fingerprintSource({
          document,
          templateVersionId: ctx.template_version_id,
          bindings,
          fontHashes: faceRows.map((f) => f.sha256),
        }),
      )
      .digest("hex");
    if (recomputed !== ctx.source_fingerprint) {
      return await fail("the document changed after this export was requested — request it again to get a key that matches");
    }

    if (ctx.format === "jpeg" && !ctx.allow_jpeg) {
      // A29: JPEG only if the org enabled it for size.
      return await fail("jpeg export is not enabled for this org (org_settings.allow_jpeg_export)");
    }

    const faces = await inlineFaces(faceRows);
    const result = await renderVariant({
      document,
      preset: ctx.preset,
      format: ctx.format,
      bindings,
      faces,
      previousSignature: (ctx.previous_signature as never) ?? null,
    });

    // One path builder, always (03 §6): the only place in the design where
    // isolation depends on application correctness.
    const { bucket, path } = storagePaths.export(ctx.org_id, ctx.document_id, `${ctx.preset}`, EXTENSION[ctx.format]);
    await uploadObject(bucket, path, result.bytes, result.contentType);

    await helpers.query(`select public.record_export_artifact($1, 'ready', $2, $3, $4, $5, $6, null)`, [
      ctx.artifact_id,
      path,
      result.bytes.byteLength,
      result.widthPx,
      result.heightPx,
      JSON.stringify(result.signature),
    ]);

    helpers.logger.info(`render_variant: ${ctx.preset}.${EXTENSION[ctx.format]} for ${ctx.document_id} — ${result.bytes.byteLength} bytes`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.startsWith("render_variant: ")) throw e; // already recorded by fail()
    await helpers.query(`select public.record_export_artifact($1, 'failed', null, null, null, null, null, $2)`, [ctx.artifact_id, message]);
    throw e;
  }
};
