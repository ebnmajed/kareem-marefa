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

export interface SessionDayWindow {
  startsAt: string
  endsAt?: string | null
}

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
  /**
   * ★ wave 10: the session's days, in `position` order — the database's derived
   * rank (DEC-150), never sorted here and never reduced to a min or a max.
   *
   * OPTIONAL, and that is contract 3 working: a caller that does not pass it —
   * `main`'s app and `main`'s worker, for the whole window between the owner's
   * push and the redeploy — falls back to `startsAt` and renders exactly the
   * first-day date it renders today. Late, never wrong.
   */
  days?: readonly SessionDayWindow[] | null
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

/** The day a moment falls on in a given zone, as `YYYY-MM-DD`. `en-CA` is the
 *  one widely available locale whose short date IS that shape, and the value is
 *  compared, never shown. */
function zonedDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(at)
}

/** One day after `key` (`YYYY-MM-DD`), as the same shape. */
function nextDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1, d + 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/**
 * ★ The value of `{{session.startsAt}}` — wave 10, REQ-DSG-002, DEC-160.
 *
 * THE BINDING'S NAME DOES NOT CHANGE; ITS VALUE DOES. The name is slightly
 * untrue at three days and it is entirely internal, and that is the cheaper of
 * two untruths: a NEW binding would have been absent in every document that
 * does not name it — every pinned poster, every v1/v2 template version, and
 * ★ every org's OWN copy of a template, which no seed can reach (REQ-DSG-008).
 * Those would have bound a first-day date for ever, and the old runtime, which
 * has never heard of the new name, would have drawn the marked placeholder
 * where the date belongs — on `/api/s/{id}/og`, which is the public share
 * image, for the whole window between the owner's push and the redeploy.
 * Keeping the name means every document gets the range at its next
 * regeneration and the old runtime renders the first day: late, never wrong.
 *
 * ★ AT n <= 1 THIS RETURNS `formatBindingDateTime()` ITSELF. Not «the same
 * string» — the same call. There is no second code path to drift, which is
 * what makes «a one-day poster renders the characters it renders today» a
 * property of the code rather than of a test.
 *
 * THE RULES, each a decision:
 *   · days are read in `position` order, the database's derived rank. No
 *     minimum and no maximum is computed here (DEC-150).
 *   · CONSECUTIVE days — each starting on the calendar day after the previous
 *     one IN THE SESSION'S ZONE — print as a range through `formatRange`, so
 *     the range pattern and the month-boundary elision are CLDR's own and not
 *     ours: «19 – 21 سبتمبر 2026», «30 سبتمبر – 2 أكتوبر 2026».
 *   · otherwise the days are listed, and only the last carries the month and
 *     the year: «19 و21 و26 سبتمبر 2026».
 *   · THE TIME IS PRINTED ONLY WHEN EVERY DAY SHARES IT. Days may start at
 *     different hours; one time over differing days is a false statement on a
 *     sheet of paper that goes on a wall.
 *   · and if the result would not fit `l_when` on one line, it falls back to
 *     the FIRST DAY'S FULL DATE — today's value. Never wrong, never worse than
 *     what the poster says now, and the event page carries the detail.
 */
export function formatBindingWhen(days: readonly SessionDayWindow[], timeZone: string, locale = 'ar'): string {
  const starts = days.map((d) => new Date(d.startsAt)).filter((d) => !Number.isNaN(d.getTime()))
  if (starts.length === 0) return ''
  const first = starts[0] as Date
  // ★ The one-call proof. 1 is a value of n, and this is the branch that makes
  // it behave like one.
  if (starts.length === 1) return formatBindingDateTime(first.toISOString(), timeZone, locale)

  const last = starts[starts.length - 1] as Date
  const dateOnly = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { day: 'numeric', month: 'long', year: 'numeric', timeZone })
  const dayOnly = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { day: 'numeric', timeZone })
  const timeOnly = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { timeStyle: 'short', timeZone })

  const keys = starts.map((d) => zonedDay(d, timeZone))
  const consecutive = keys.every((k, i) => i === 0 || k === nextDay(keys[i - 1] as string))

  let dates: string
  if (consecutive) {
    dates = dateOnly.formatRange(first, last)
  } else {
    const head = starts.slice(0, -1).map((d) => dayOnly.format(d))
    const and = locale.startsWith('ar') ? ' و' : ' and '
    const comma = locale.startsWith('ar') ? ' و' : ', '
    dates = `${head.join(comma)}${and}${dateOnly.format(last)}`
  }

  const times = starts.map((d) => timeOnly.format(d))
  const shared = times.every((t) => t === times[0]) ? times[0] : null
  const value = shared ? `${dates} · ${shared}` : dates

  // ★ MEASURED, not guessed. `l_when` is 920 x 70 at 40 px / 1.7 with no
  // `autoFit`, so a second line is an overflow the export reports and nothing
  // shrinks. Driving the runtime's own `measureTextBatch` — the function the
  // worker runs on every export — over all seven poster presets and both
  // locales: every candidate at 46 characters fits on one line, every
  // candidate at 54 wraps to two, in Arabic AND in English, and the fit is
  // preset-invariant because `derive()` scales the frame and the font size by
  // the same factor. A character count is a crude proxy for a rendered width,
  // and it is defensible here only because both scripts break in the same
  // place; the budget sits below the measured floor.
  return value.length <= 48 ? value : formatBindingDateTime(first.toISOString(), timeZone, locale)
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
  // ★ wave 10: the day set is the truth and `sessions.starts_at` is its stored
  // shadow (DEC-150), so the days decide the value where a caller has them. A
  // caller that has none — `main`'s app and worker, and every certificate
  // path — passes the session's own instant and gets exactly today's string.
  // The KEY is unchanged, which is what keeps every pinned document, every
  // published template version and every org's own copy rendering a date.
  const when = row.days?.length ? formatBindingWhen(row.days, zone, locale) : row.startsAt ? formatBindingDateTime(row.startsAt, zone, locale) : ''
  if (when) out['session.startsAt'] = when
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
