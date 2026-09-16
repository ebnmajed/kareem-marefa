/**
 * 06 §2.3's binding table, resolved — REQ-DSG-006, REQ-CRT-014, A30.
 *
 * IN THE RUNTIME BECAUSE THREE CALLERS NEED THE SAME ANSWER. The editor
 * resolves bindings to preview with real data; `JOB-regenerate_poster`
 * resolves them to request a render; and the fingerprint hashes them, so a
 * disagreement between the first two means a cache key that never settles
 * and a preview that is not the artifact. DEC-017's whole argument is that
 * the thing an admin approves IS what gets printed, and that is only true if
 * one function decides what the words are.
 *
 * The formatting rules are `10` §4's, matching `src/components/sessions/
 * numerals.ts` exactly: digits are WESTERN, always (REQ-INT-006, DEC-124) —
 * named as `latn` rather than inherited from the locale, whose CLDR default
 * for `ar` is `arab` and would quietly print the digits the owner forbade;
 * and the TIME ZONE is the session's, not the reader's,
 * because a session happens in a room and the poster has to mean the clock
 * on that room's wall.
 */

export interface SessionBindingRow {
  id: string
  title: string
  abstract?: string | null
  startsAt?: string | null
  /** The session's own zone when it has one, else the org's (0010, OQ-018). */
  timeZone?: string | null
  venueName?: string | null
  venueAddress?: string | null
  /** Accepted co-presenters included (A5). */
  presenters?: readonly string[] | null
}

export interface CertificateBindingRow {
  serial: string
  verificationCode: string
  issuedAt?: string | null
  /** The name AS PRINTED, frozen at issue. Never the live profile: a member
   *  changing their display name must not retroactively change a document
   *  someone is holding (REQ-CRT-014). */
  recipientNameSnapshot: string
  sessionTitle?: string | null
  achievementName?: string | null
}

export interface BindingOptions {
  /** The org's zone, used when a session declares none. */
  timeZone: string
  /** Absolute — a phone camera needs a URL, not a path (REQ-DSG-023). */
  origin: string
  locale?: string
  orgName?: string | null
}

/** Matches `formatDateTime` in the UI exactly; a poster whose date reads
 *  differently from the event page is a poster that is wrong. */
export function formatBindingDateTime(iso: string, timeZone: string, locale = 'ar'): string {
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { dateStyle: 'full', timeStyle: 'short', timeZone }).format(new Date(iso))
}

export function formatBindingDate(iso: string, timeZone: string, locale = 'ar'): string {
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { dateStyle: 'long', timeZone }).format(new Date(iso))
}

/** 06 §2.3: presenters are joined with «و». */
export function joinPresenters(names: readonly string[], locale = 'ar'): string {
  const clean = names.filter((n) => n && n.trim() !== '')
  if (clean.length === 0) return ''
  if (clean.length === 1) return clean[0] as string
  const separator = locale.startsWith('ar') ? ' و' : ', '
  const last = clean[clean.length - 1] as string
  return `${clean.slice(0, -1).join(locale.startsWith('ar') ? '، ' : ', ')}${separator}${last}`
}

/**
 * A session's bindings. A key is ABSENT rather than empty when there is
 * nothing to bind — that absence is what makes the canvas draw a marked
 * placeholder instead of a blank that exports as white space (REQ-DSG-006).
 */
export function resolveSessionBindings(row: SessionBindingRow, options: BindingOptions): Record<string, string> {
  const zone = row.timeZone ?? options.timeZone
  const locale = options.locale ?? 'ar'
  const out: Record<string, string> = { 'session.title': row.title }

  if (row.abstract) out['session.abstract'] = row.abstract
  if (row.startsAt) out['session.startsAt'] = formatBindingDateTime(row.startsAt, zone, locale)
  if (row.venueName) out['session.venueName'] = row.venueName
  if (row.venueAddress) out['session.venueAddress'] = row.venueAddress
  const presenters = joinPresenters(row.presenters ?? [], locale)
  if (presenters) out['session.presenters'] = presenters
  if (options.orgName) out['org.name'] = options.orgName
  // Absolute, always. The poster QR sends a member to the event page, and a
  // relative path in a printed QR is nothing at all.
  out['session.eventUrl'] = `${options.origin}/${locale}/app/sessions/${row.id}`
  return out
}

export function resolveCertificateBindings(row: CertificateBindingRow, options: BindingOptions): Record<string, string> {
  const locale = options.locale ?? 'ar'
  const out: Record<string, string> = {
    'recipient.name': row.recipientNameSnapshot,
    'certificate.serial': row.serial,
    'certificate.verificationCode': row.verificationCode,
    'certificate.verifyUrl': `${options.origin}/${locale}/verify/${row.verificationCode}`,
  }
  if (row.issuedAt) out['certificate.issuedAt'] = formatBindingDate(row.issuedAt, options.timeZone, locale)
  if (row.sessionTitle) out['session.title'] = row.sessionTitle
  if (row.achievementName) out['certificate.achievementName'] = row.achievementName
  if (options.orgName) out['org.name'] = options.orgName
  return out
}
