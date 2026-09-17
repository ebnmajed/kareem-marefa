import type { Task } from "graphile-worker";
import { createHash } from "node:crypto";
import { renderFaces } from "../render/fonts.js";
import { brandBindings } from "../render/brand.js";
import {
  fingerprintSource,
  PRESETS,
  presetsFor,
  resolveSessionBindings,
  validateDocument,
  type DesignDocument,
} from "@kareem/designer-runtime";

// JOB-regenerate_poster — 11 §2.5, REQ-DSG-001, REQ-DSG-002, REQ-DSG-003,
// DEC-012. Key `poster:{session_id}`, so a burst of edits leaves ONE pending
// regeneration rather than one per keystroke.
//
// ★ THE BRANCH IS THE DECISION, and it is the whole job:
//
//   live     → the poster is a pure function of template plus data, so
//              rebuild it and render every A12 variant. Costs nothing.
//   detached → somebody's judgement is in it. Set `stale_since`, render
//              NOTHING, and let the screen raise «تغيّرت تفاصيل الجلسة —
//              راجع الملصق». Overwriting is the worse failure.
//
// The bindings are resolved by @kareem/designer-runtime — the same function
// the editor previews with. Two implementations would mean the preview an
// admin approves is not the artifact, which is DEC-017 failing quietly, and
// the fingerprint would never settle because the two would word a date
// differently.

interface Payload {
  session_id: string;
}

function isPayload(p: unknown): p is Payload {
  const v = p as Partial<Payload> | null;
  return !!v && typeof v.session_id === "string";
}

interface Context {
  session_id: string;
  org_id: string;
  title: string;
  abstract: string | null;
  starts_at: string | null;
  session_time_zone: string | null;
  venue_name: string | null;
  venue_address: string | null;
  presenters: string[];
  org_name: string;
  org_time_zone: string;
  poster_id: string | null;
  document_id: string | null;
  mode: "auto" | "customised" | "uploaded" | null;
  binding: "live" | "detached" | null;
  template_version_id: string | null;
  template_document: unknown;
  /** ★ wave 10 (DEC-160): the session's days in `position` order, from
   *  designer/0002. OPTIONAL in this type on purpose — a worker running
   *  against a database that does not carry the column yet reads `undefined`
   *  and falls back to `starts_at`, which is the first day's and is what this
   *  task renders today. The database is the one that decides the order; this
   *  file never sorts, never takes a minimum and never takes a maximum
   *  (DEC-150). */
  days?: Array<{ startsAt: string; endsAt: string | null }> | null;
}

/** Screen presets get a PNG and a WebP copy; print gets a PDF (A29). */
function targetsFor(purpose: "poster"): Array<{ preset: string; format: string }> {
  const targets: Array<{ preset: string; format: string }> = [];
  for (const preset of presetsFor(purpose)) {
    if (PRESETS[preset].bleed > 0) targets.push({ preset, format: "pdf" });
    else targets.push({ preset, format: "png" }, { preset, format: "webp" });
  }
  return targets;
}

export const regenerate_poster: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error(`regenerate_poster: malformed payload ${JSON.stringify(payload)}`);

  const { rows } = await helpers.query<Context>(`select * from public.poster_render_context($1)`, [payload.session_id]);
  const ctx = rows[0];
  if (!ctx) {
    helpers.logger.warn(`regenerate_poster: session ${payload.session_id} no longer exists — skipping`);
    return;
  }

  // ★ REQ-DSG-003. A detached poster is never regenerated, ever. The only
  // thing a data change may do is mark it for review.
  if (ctx.binding === "detached") {
    await helpers.query(`select public.record_session_poster($1, null, true)`, [payload.session_id]);
    helpers.logger.info(`regenerate_poster: ${payload.session_id} is detached — marked stale, rendered nothing`);
    return;
  }

  if (!ctx.template_document) {
    // REQ-DSG-001 says no session reaches published without a poster, and
    // this is the one way that can fail: an org with no poster template and
    // no platform default to fall back on. Loud, because a session that
    // published without one is a gap somebody has to close.
    throw new Error(`regenerate_poster: no poster template available for org ${ctx.org_id}`);
  }

  const parsed = validateDocument(ctx.template_document);
  if (!parsed.ok) {
    throw new Error(`regenerate_poster: the template document is invalid — ${parsed.issues.map((i) => `${i.path}:${i.code}`).join(", ")}`);
  }
  const document: DesignDocument = parsed.document;

  const origin = process.env.PUBLIC_ORIGIN ?? "http://localhost:3000";
  const bindings = {
    // The org's brand override over the platform palette, composed HERE so
    // the fingerprint below sees it: a changed colour is a new artifact
    // (06 §8.3, DEC-052, REQ-DSG-013). No row is the identity override.
    // ★ A generated poster is DARK (DEC-125, DEC-148 contract 2) — every
    // poster in the canvas is, and the editor previews it the same way
    // (`previewScheme()` in src/lib/dal/designer.ts), so the preview an admin
    // approves is the artifact. The blank-capture guard is measured against
    // the page's own background since d6e9ecf, which is what made this safe.
    ...(await brandBindings(helpers, ctx.org_id, "dark")),
    ...resolveSessionBindings(
      {
        id: ctx.session_id,
        title: ctx.title,
        abstract: ctx.abstract,
        startsAt: ctx.starts_at,
        // ★ The day set decides `{{session.startsAt}}`'s value; the session's
        // own instant is its stored shadow and the fallback (DEC-150,
        // DEC-160). At one day the two produce the same string by the same
        // call, so a one-day poster's fingerprint does not move and its
        // artifacts are not re-rendered (REQ-DSG-013).
        days: ctx.days ?? null,
        timeZone: ctx.session_time_zone,
        venueName: ctx.venue_name,
        venueAddress: ctx.venue_address,
        presenters: ctx.presenters,
      },
      { timeZone: ctx.org_time_zone, origin, orgName: ctx.org_name, locale: "ar" },
    ),
  };

  const { rows: faceRows } = await helpers.query<{ family: string; weight: number; style: string; sha256: string; script: string | null }>(
    `select family, weight, style, sha256,
            case when 'arabic' = any(subsets) then 'arabic' else 'latin' end as script
       from public.fonts where parity_status = 'passed'`,
  );
  // ★ The table holds only MATERIALISED fonts (REQ-DSG-017); the platform
  // set lives in the image's manifest and has no row there. `renderFaces()`
  // is the one place that rule lives, shared with issue_certificates and
  // mirroring the editor's `listEditorFaces()` — the two disagreeing is
  // what made every automatic poster fail with «the render context pins no
  // faces» while a hand-saved document rendered fine.
  const faces = await renderFaces(faceRows);

  // The document a LIVE poster is: the template's, bound to this session.
  // Written before the render is requested, so the fingerprint the artifact
  // carries describes a document that actually exists.
  const { rows: docRows } = await helpers.query<{ id: string }>(
    `insert into public.design_documents (org_id, template_version_id, purpose, document, bound_session_id)
     values ($1, $2, 'poster', $3::jsonb, $4)
     on conflict do nothing
     returning id`,
    [ctx.org_id, ctx.template_version_id, JSON.stringify(document), ctx.session_id],
  );
  const documentId =
    docRows[0]?.id ??
    ctx.document_id ??
    (
      await helpers.query<{ id: string }>(`select id from public.design_documents where bound_session_id = $1 order by created_at limit 1`, [
        ctx.session_id,
      ])
    ).rows[0]?.id;
  if (!documentId) throw new Error(`regenerate_poster: could not resolve a document for ${payload.session_id}`);

  await helpers.query(`select public.record_session_poster($1, $2, false)`, [payload.session_id, documentId]);

  const fingerprint = createHash("sha256")
    .update(
      fingerprintSource({
        document,
        templateVersionId: ctx.template_version_id,
        bindings,
        fontHashes: faces.map((f) => f.sha256),
      }),
    )
    .digest("hex");

  // REQ-DSG-002: «the automatic path produces every A12 variant with NO
  // design work at all». Every target, in one call; the cache means an
  // unchanged session re-renders none of them (REQ-DSG-013).
  await helpers.query(`select public.system_request_render($1, $2, $3::jsonb, $4::jsonb)`, [
    documentId,
    fingerprint,
    JSON.stringify({ bindings, faces }),
    JSON.stringify(targetsFor("poster")),
  ]);

  helpers.logger.info(`regenerate_poster: ${payload.session_id} → ${targetsFor("poster").length} variant(s) requested`);
};
