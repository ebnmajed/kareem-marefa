import type { Task } from "graphile-worker";
import { createHash } from "node:crypto";
import {
  fingerprintSource,
  platformBrand,
  presetsFor,
  resolveCertificateBindings,
  validateDocument,
  type DesignDocument,
  type NumeralSystem,
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

interface Payload {
  session_id: string;
  member_id: string;
  kind: "attendance" | "presenter" | "achievement";
}

function isPayload(p: unknown): p is Payload {
  const v = p as Partial<Payload> | null;
  return !!v && typeof v.session_id === "string" && typeof v.member_id === "string" && typeof v.kind === "string";
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
  kind: Payload["kind"];
  session_title: string | null;
  achievement_name: string | null;
  org_name: string;
  numerals: NumeralSystem;
  org_time_zone: string;
  template_version_id: string;
  template_document: unknown;
  document_id: string | null;
}

/** A certificate is paper first. Both orientations get a PDF; the landscape
 *  also gets a PNG, which is what the member's own list shows as a preview
 *  and what a share sheet can carry (A29, REQ-CRT-006). */
function certificateTargets(): Array<{ preset: string; format: string }> {
  const targets: Array<{ preset: string; format: string }> = [];
  for (const preset of presetsFor("certificate")) targets.push({ preset, format: "pdf" });
  targets.push({ preset: "cert_landscape", format: "png" });
  return targets;
}

export const issue_certificates: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error(`issue_certificates: malformed payload ${JSON.stringify(payload)}`);

  const { rows: faceRows } = await helpers.query<{ sha256: string; family: string; weight: number; style: string; script: string | null }>(
    `select sha256, family, weight, style,
            case when 'arabic' = any(subsets) then 'arabic' else 'latin' end as script
       from public.fonts where parity_status = 'passed'
      order by sha256`,
  );
  const faces = faceRows;

  // ★ The serial is allocated HERE, inside this statement's transaction,
  // and `allocate_serial()` holds the counter row's lock until it commits.
  // A failure anywhere after this point rolls the whole thing back and
  // RETURNS the number, which is what «gapless» means (DEC-010,
  // REQ-CRT-008). It is also why the render is requested rather than
  // performed: a 30-second Chromium export inside the lock would serialise
  // every issuance in the org behind it.
  let certificateId: string;
  try {
    const { rows } = await helpers.query<{ id: string }>(`select id from public.issue_certificate($1, $2, $3::public.certificate_kind, null, $4)`, [
      payload.session_id,
      payload.member_id,
      payload.kind,
      faces.map((f) => f.sha256),
    ]);
    certificateId = rows[0].id;
  } catch (error) {
    const code = (error as { code?: string }).code;
    // `no_check_in` and `certificates_off` are both 42501 and both mean the
    // world changed between the fan-out and this job — a check-in undone, a
    // session switched to `off`. Neither is a fault worth retrying twelve
    // times; the absence of a certificate is the correct outcome.
    if (code === "42501") {
      helpers.logger.info(`issue_certificates: ${payload.member_id} is no longer eligible for ${payload.session_id} (${payload.kind}) — nothing issued`);
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
    // Wave 4's brand kit replaces this with the org's palette; the token
    // contract is identical either way (06 §8.3, DEC-048).
    ...platformBrand("light"),
    ...resolveCertificateBindings(
      {
        serial: ctx.serial,
        verificationCode: ctx.verification_code,
        recipientNameSnapshot: ctx.recipient_name,
        issuedAt: ctx.issued_at,
        sessionTitle: ctx.session_title,
        achievementName: ctx.achievement_name,
      },
      { numerals: ctx.numerals, timeZone: ctx.org_time_zone, origin, orgName: ctx.org_name, locale: "ar" },
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
    JSON.stringify(certificateTargets()),
  ]);

  // D50: `automatic` issued it outright, so announce it now. `review` left
  // it `held` and an admin releases it on SCR-045 — which is where the
  // notification comes from in that mode. Held certificates are invisible
  // and unemailed until then (REQ-CRT-004).
  if (ctx.state === "issued") {
    await helpers.query(`select public.announce_certificate($1)`, [certificateId]);
  }

  helpers.logger.info(`issue_certificates: ${ctx.serial} (${payload.kind}, ${ctx.state}) → ${certificateTargets().length} export(s) requested`);
};
