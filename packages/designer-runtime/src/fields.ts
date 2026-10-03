/**
 * The studio's field registry — REQ-UIX-110, REQ-UIX-111, REQ-DSG-006, REQ-CRT-010, DEC-235, DEC-238 §3.
 *
 * What the الحقول panel offers, and the layer a tap (or a drop) adds for each. IN THE RUNTIME because it is a
 * statement about bindings, and the runtime is the one place that resolves them: every binding here is one
 * `resolveSessionBindings()` or `resolveCertificateBindings()` already returns — `tests/unit/designer-fields.test.ts`
 * holds that — so a field the panel offers is never a field that draws a placeholder for ever. ★ No binding is added
 * for the panel's sake (DEC-238 §3): a new key in a resolver changes every artifact's fingerprint.
 *
 * The QR fields bind the URL the resolver builds — `session.eventUrl` for a poster (REQ-DSG-023) and
 * `certificate.verifyUrl`, the one `/verify` route, for a certificate (REQ-CRT-010). The editor never builds a URL.
 */

import { declaredBindingsOf } from './bindings.js'
import type { DesignDocument, Purpose } from './model.js'

export interface FieldSpec {
  /** The binding path — never shown to an admin; the editor names it from its catalogue (DEC-149 §4). */
  binding: string
  /** What a tap adds: a bound text field, or a QR. */
  layer: 'field' | 'qr'
  purposes: readonly Purpose[]
  /** The certificate families it serves; absent = every family. */
  families?: readonly string[]
}

export const FIELDS: readonly FieldSpec[] = [
  { binding: 'session.title', layer: 'field', purposes: ['poster', 'certificate'], families: ['attendance', 'presenter'] },
  { binding: 'session.presenters', layer: 'field', purposes: ['poster'] },
  { binding: 'session.startsAt', layer: 'field', purposes: ['poster'] },
  { binding: 'session.venueName', layer: 'field', purposes: ['poster'] },
  { binding: 'session.venueAddress', layer: 'field', purposes: ['poster'] },
  { binding: 'session.eventUrl', layer: 'qr', purposes: ['poster'] },
  { binding: 'recipient.name', layer: 'field', purposes: ['certificate'] },
  { binding: 'certificate.serial', layer: 'field', purposes: ['certificate'] },
  { binding: 'certificate.verificationCode', layer: 'field', purposes: ['certificate'] },
  { binding: 'certificate.issuedAt', layer: 'field', purposes: ['certificate'] },
  { binding: 'certificate.verifyUrl', layer: 'qr', purposes: ['certificate'] },
  // {المستوى} on the board: what an achievement certificate prints today (`library.ts`, l_reason).
  { binding: 'certificate.achievementName', layer: 'field', purposes: ['certificate'], families: ['achievement'] },
  { binding: 'org.name', layer: 'field', purposes: ['poster', 'certificate'] },
]

/** The fields a document of this purpose — and, for a certificate, this family — may carry. */
export function fieldsFor(purpose: Purpose, family: string | null = null): FieldSpec[] {
  return FIELDS.filter(
    (f) => f.purposes.includes(purpose) && (purpose !== 'certificate' || !f.families || (family !== null && f.families.includes(family)) || family === null),
  )
}

/** Each field, `used` when the document already names its binding. */
export function fieldUsage(doc: DesignDocument, family: string | null = null): { field: FieldSpec; used: boolean }[] {
  const declared = new Set(declaredBindingsOf(doc))
  return fieldsFor(doc.purpose, family).map((field) => ({ field, used: declared.has(field.binding) }))
}
