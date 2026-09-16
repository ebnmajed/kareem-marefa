import type { Task } from "graphile-worker";
import { createHash } from "node:crypto";
import { renderFaces } from "../render/fonts.js";
import { brandBindings } from "../render/brand.js";
import {
  fingerprintSource,
  presetsForDocument,
  resolveCertificateBindings,
  validateDocument,
  type DesignDocument,
} from "@kareem/designer-runtime";

// JOB-issue_certificates — 11 §2.5, REQ-CRT-001 … REQ-CRT-005, D50.
// Key `cert:{session_id}:{member_id}:{kind}`: ONE job per recipient per
// kind, so a session completed, reopened and completed again leaves one
// pending issuance rather than a duplicate certificate.
//
// The job does not decide who gets one. `fan_out_certificates()` does, in
// the completion transaction, from `check_ins` and accepted
// `session_presenters` — so the fan-out sees exactly the attendance the
// database recorded and this task only has to render what it was handed.
//
// ★ IT NEVER SENDS MAIL. `release_certificates()` calls `public.notify()`
// with MSG-certificate_issued; in `automatic` mode the issuance itself
// releases, in `review` mode an admin does on SCR-045. Either way the
// transport is notify's, never this task's (08 §1).

// Two shapes, because an achievement certificate has no session. The
// session fan-out sends `session_id`; the badge and leaderboard hooks send
// `badge_id` or `snapshot_id` and `kind: 'achievement'`. The job KEY puts
// whichever source it is in the slot 11 §2.5 gives the session, so a
// re-award or a re-run still collapses to one job.
interface SessionPayload {
  session_id: string;
  member_id: string;
  kind: "attendance" | "presenter";
}
interface AchievementPayload {
  member_id: string;
  kind: "achievement";
  badge_id?: string;
  snapshot_id?: string;
}
type Payload = SessionPayload | AchievementPayload;

function isPayload(p: unknown): p is Payload {
  // Read as a loose record, not as `Partial<Session & Achievement>`: the two
  // `kind` literals have no overlap, so that intersection collapses to
  // `never` and every property access on it is an error.
  const v = p as Record<string, unknown> | null;
  if (!v || typeof v.member_id !== "string") return false;
  if (v.kind === "achievement") return typeof v.badge_id === "string" || typeof v.snapshot_id === "string";
  return (v.kind === "attendance" || v.kind === "presenter") && typeof v.session_id === "string";
}

interface Context {
  certificate_id: string;
  org_id: string;
  member_id: string;
  state: "held" | "issued" | "revoked";
  serial: string;
  verification_code: string;
  issued_at: string | null;
  recipient_name: string;
  kind: "attendance" | "presenter" | "achievement";
  session_title: string | null;
  achievement_name: string | null;
  org_name: string;
  org_time_zone: string;
  template_version_id: string;
  template_document: unknown;
  document_id: string | null;
}

/** A certificate is paper first: its ONE composed page as a PDF, plus a PNG
 *  of the same page, which is what the member's own list shows as a preview
 *  and what a share sheet can carry (A29, REQ-CRT-006).
 *
 *  ★ One page, not both orientations (DEC-148). The portrait PDF used to be
 *  `derive()`d from the landscape master and put every line into the top
 *  29% of the page; a portrait certificate is now its own template, chosen
 *  at issue time. A certificate issued before this re-renders its landscape
 *  files only — its old portrait objects stay in storage, untouched. */
function certificateTargets(document: DesignDocument): Array<{ preset: string; format: string }> {
  return presetsForDocument(document).flatMap((preset) => [
    { preset, format: "pdf" },
    { preset, format: "png" },
  ]);
}

export const issue_certificates: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error(`issue_certificates: malformed payload ${JSON.stringify(payload)}`);

  const { rows: faceRows } = await helpers.query<{ sha256: string; family: string; weight: number; style: string; script: string | null }>(
    `select sha256, family, weight, style,
            case when 'arabic' = any(subsets) then 'arabic' else 'latin' end as script
       from public.fonts where parity_status = 'passed'
      order by sha256`,
  );
  // The platform set when nothing has been materialised — see
  // `renderFaces()`. Pinning an empty list makes `render_variant` refuse
  // every export, which is the right refusal for the wrong input.
  const faces = await renderFaces(faceRows);

  // ★ The serial is allocated HERE, inside this statement's transaction,
  // and `allocate_serial()` holds the counter row's lock until it commits.
  // A failure anywhere after this point rolls the whole thing back and
  // RETURNS the number, which is what «gapless» means (DEC-010,
  // REQ-CRT-008). It is also why the render is requested rather than
  // performed: a 30-second Chromium export inside the lock would serialise
  // every issuance in the org behind it.
  let certificateId: string;
  try {
    const { rows } =
      payload.kind === "achievement"
        ? await helpers.query<{ id: string }>(`select id from public.issue_achievement_certificate($1, $2, $3, $4)`, [
            payload.member_id,
            payload.badge_id ?? null,
            payload.snapshot_id ?? null,
            faces.map((f) => f.sha256),
          ])
        : await helpers.query<{ id: string }>(`select id from public.issue_certificate($1, $2, $3::public.certificate_kind, null, $4)`, [
            payload.session_id,
            payload.member_id,
            payload.kind,
            faces.map((f) => f.sha256),
          ]);
    certificateId = rows[0].id;
  } catch (error) {
    const code = (error as { code?: string }).code;
    // Every eligibility refusal is 42501 — `no_check_in`,
    // `certificates_off`, a badge whose `issues_certificate` was turned back
    // off, a snapshot no longer final — and all of them mean the world
    // changed between the fan-out and this job. None is a fault worth twelve
    // retries: the absence of a certificate IS the correct outcome.
    if (code === "42501") {
      helpers.logger.info(`issue_certificates: ${payload.member_id} is no longer eligible (${payload.kind}) — nothing issued`);
      return;
    }
    throw error;
  }

  const { rows: ctxRows } = await helpers.query<Context>(`select * from public.certificate_render_context($1)`, [certificateId]);
  const ctx = ctxRows[0];
  if (!ctx) throw new Error(`issue_certificates: no render context for ${certificateId}`);

  const parsed = validateDocument(ctx.template_document);
  if (!parsed.ok) {
    throw new Error(`issue_certificates: template version ${ctx.template_version_id} is invalid — ${parsed.issues.map((i) => `${i.path}:${i.code}`).join(", ")}`);
  }
  const document: DesignDocument = parsed.document;

  const origin = process.env.PUBLIC_ORIGIN ?? "http://localhost:3000";
  const bindings = {
    // The org's brand override over the platform palette, composed HERE so
    // the fingerprint below sees it: a changed colour is a new artifact
    // (06 §8.3, DEC-052, REQ-DSG-013). No row is the identity override.
    ...(await brandBindings(helpers, ctx.org_id, "light")),
    ...resolveCertificateBindings(
      {
        serial: ctx.serial,
        verificationCode: ctx.verification_code,
        recipientNameSnapshot: ctx.recipient_name,
        issuedAt: ctx.issued_at,
        sessionTitle: ctx.session_title,
        achievementName: ctx.achievement_name,
      },
      { timeZone: ctx.org_time_zone, origin, orgName: ctx.org_name, locale: "ar" },
    ),
  };

  const documentId = (await helpers.query<{ id: string }>(`select public.record_certificate_document($1, $2::jsonb) as id`, [certificateId, JSON.stringify(document)]))
    .rows[0].id;

  const fingerprint = createHash("sha256")
    .update(fingerprintSource({ document, templateVersionId: ctx.template_version_id, bindings, fontHashes: faces.map((f) => f.sha256) }))
    .digest("hex");

  await helpers.query(`select public.system_request_render($1, $2, $3::jsonb, $4::jsonb)`, [
    documentId,
    fingerprint,
    JSON.stringify({ bindings, faces }),
    JSON.stringify(certificateTargets(document)),
  ]);

  // D50: `automatic` issued it outright, so announce it now. `review` left
  // it `held` and an admin releases it on SCR-045 — which is where the
  // notification comes from in that mode. Held certificates are invisible
  // and unemailed until then (REQ-CRT-004).
  if (ctx.state === "issued") {
    await helpers.query(`select public.announce_certificate($1)`, [certificateId]);
  }

  helpers.logger.info(`issue_certificates: ${ctx.serial} (${payload.kind}, ${ctx.state}) → ${certificateTargets(document).length} export(s) requested`);
};
