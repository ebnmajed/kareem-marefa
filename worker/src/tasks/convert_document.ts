import type { Task } from "graphile-worker";
import { signReadUrl, signUploadUrl } from "../content/storage.js";
import { convertedPdfPath } from "../content/paths.js";

// JOB-convert_document (11 §2.4, 07 §4, REQ-MAT-003, REQ-MAT-011, DEC-006).
// Enqueued by finalize_material_upload() (supabase/proposed/content/0003)
// for `pdf`/`powerpoint` materials only — never Keynote (DEC-006), never
// image/audio/link. Key `conv:{version_id}` (11 §2.4).
//
// Calls the credential-free converter (converter/server.mjs, DEC-032) with
// two signed URLs and nothing else — no Postgres connection string, no
// service_role key ever crosses that boundary. record_material_conversion()
// (a SECURITY DEFINER SQL function, service_role-only EXECUTE) is the only
// write this file makes: it sets `render_status`/`font_substitution_warning`
// and enqueues `render_pages` itself, through `public.enqueue_job()` — this
// file never calls `helpers.addJob()` (DEC-046: every enqueue goes through
// the one SQL door, the same reason schedule_reminders.ts calls a SQL
// function rather than chaining jobs from TypeScript).
interface Payload {
  version_id: string;
  material_id: string;
}

function isPayload(p: unknown): p is Payload {
  const v = p as Partial<Payload> | null;
  return !!v && typeof v.version_id === "string" && typeof v.material_id === "string";
}

export const convert_document: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error(`convert_document: malformed payload ${JSON.stringify(payload)}`);
  const converterUrl = process.env.CONVERTER_URL;
  if (!converterUrl) throw new Error("convert_document: CONVERTER_URL is not set");

  const { rows } = await helpers.query<{ org_id: string; session_id: string; storage_path: string; kind: string }>(
    `select mv.org_id, m.session_id, mv.storage_path, m.kind
       from public.material_versions mv join public.materials m on m.id = mv.material_id
      where mv.id = $1`,
    [payload.version_id],
  );
  const row = rows[0];
  if (!row) {
    helpers.logger.warn(`convert_document: version ${payload.version_id} no longer exists — skipping`);
    return;
  }
  if (row.kind !== "pdf" && row.kind !== "powerpoint") {
    helpers.logger.warn(`convert_document: material ${payload.material_id} is kind ${row.kind} — this job is never enqueued for it (DEC-006)`);
    return;
  }

  try {
    const inputUrl = await signReadUrl("materials", row.storage_path);
    const outputPath = row.kind === "powerpoint" ? convertedPdfPath(row.org_id, row.session_id, payload.version_id) : null;
    const outputUrl = outputPath ? await signUploadUrl("materials", outputPath) : null;

    const res = await fetch(`${converterUrl}/convert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { url: inputUrl, kind: row.kind },
        ...(outputUrl ? { output: { pdf: { url: outputUrl } } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`converter /convert failed: ${res.status} ${await res.text()}`);
    const { pages, fonts } = (await res.json()) as { pages: number; fonts: { substituted: string[] } };

    // REQ-MAT-011: the substituted family goes ON THE MATERIAL, not only in
    // this log line — record_material_conversion() writes it and enqueues
    // render_pages in the same statement.
    await helpers.query(`select public.record_material_conversion($1, $2, $3, false)`, [payload.version_id, fonts.substituted ?? [], pages]);
    helpers.logger.info(`convert_document: ${payload.version_id} → ${pages} page(s), ${fonts.substituted?.length ?? 0} substituted font(s)`);
  } catch (e) {
    await helpers.query(`select public.record_material_conversion($1, '{}', null, true)`, [payload.version_id]);
    throw e; // graphile-worker retries per 11 §2.4 (3 × 60 s)
  }
};
