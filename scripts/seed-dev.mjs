#!/usr/bin/env node
// Seeds the LOCAL database with a session for every phase × viewer relation
// worth looking at, so M9 can actually be reviewed by a person.
//
//   node scripts/seed-dev.mjs            # create (idempotent — re-run freely)
//   node scripts/seed-dev.mjs --reset    # remove everything it made, then create
//   node scripts/seed-dev.mjs --clean    # remove everything it made and stop
//
// ★ LOCAL ONLY, and it refuses to be anything else: it connects to
// 127.0.0.1:54322 and exits if the URL is not local. It is a DEV SEED, not a
// migration — `CLAUDE.md`'s rule 3 is "never do a one-off data fix as a
// migration", and the converse holds too: seed data never goes in
// `supabase/migrations/`, which run in every environment forever.
//
// It owns its rows by TITLE. `sessions` has no free-text staff column to mark
// them with — `admin_notes` is on `proposals`, not here — and inventing one
// would be a migration for a dev convenience, which `02` is frozen against.
// The titles below are fixed, distinctive and Arabic, so `--clean` deletes
// exactly what it made and a review never sees a marker.
//
// WHY THESE PARTICULAR SESSIONS. M9 redesigns no screens; what it changes is
// what a screen OFFERS. So the seed is built to make the affordance rules
// visible, one session per interesting cell of `16` §5.3's matrix — including
// the two that are easy to get wrong and impossible to see without data:
//
//   · `live` DERIVED FROM THE CLOCK (published, start passed, `start_session`
//     has not run) must NOT offer check-in, because the RPC would refuse it.
//   · `live` FROM THE ROW (`in_progress`) must offer it.
//
// That pair is DEC-090's corollary 2 made visible, and it is the single most
// valuable thing to look at in M9.

import pg from 'pg'

const DB = process.env.RLS_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if (!/127\.0\.0\.1|localhost/.test(DB)) {
  console.error(`refusing: ${DB.replace(/:[^:@]*@/, ':***@')} is not local`)
  process.exit(2)
}

const ORG_SLUG = 'dev-local'
const RESET = process.argv.includes('--reset')
const CLEAN_ONLY = process.argv.includes('--clean')

const db = new pg.Client(DB)
await db.connect()

const one = async (sql, args = []) => (await db.query(sql, args)).rows[0]
// ISO strings, not SQL fragments: the insert below is ONE fixed statement with
// fixed parameters. Branching the column list on whether a session is scheduled
// meant two positional-parameter layouts in one template, which is how the
// first version of this script put `allow_walk_ins` where `capacity` belonged.
// ★ A LIVE SESSION MUST STAY LIVE LONG ENOUGH TO BE LOOKED AT. The first
// version gave these a 60-minute window starting 30 minutes ago, so they were
// live for half an hour after seeding and `ended` by the time anyone opened
// them — which made the app correctly offer no check-in link and looked exactly
// like the bug this seed exists to demonstrate the absence of. Twelve hours
// covers a working day, and `refresh` below re-centres them on every run.
const LIVE_MINS = 12 * 60

const at = (hoursFromNow) => new Date(Date.now() + hoursFromNow * 3_600_000).toISOString()
const plus = (iso, minutes) => new Date(Date.parse(iso) + minutes * 60_000).toISOString()

// ── the sessions ──────────────────────────────────────────────────────────
/**
 * Each entry is one cell of §5.3 worth seeing. `note` is what you should
 * observe, printed at the end so the review is a checklist rather than a hunt.
 */
const PLAN = [
  {
    key: 'open-none',
    title: 'ورشة التقارير التلقائية',
    state: 'published',
    startH: 120,
    mins: 90,
    capacity: 60,
    rsvp: null,
    note: 'open / none — offers «احجز مقعدًا». NO calendar, NO tasks heading, NO check-in.',
  },
  {
    key: 'open-confirmed',
    title: 'أساسيات تدقيق اللقطات',
    state: 'published',
    startH: 72,
    mins: 60,
    capacity: 40,
    rsvp: 'confirmed',
    note: 'open / confirmed — calendar AND tasks appear, cancel offered. This is «commitment before convenience».',
  },
  {
    key: 'live-clock',
    title: 'جلسة بدأت والمهمة لم تُشغَّل',
    state: 'published', // ★ the clock says live; `start_session` has not run
    startH: -1,
    mins: LIVE_MINS,
    capacity: 30,
    rsvp: 'confirmed',
    note: '★★ live DERIVED FROM THE CLOCK — no «احجز مقعدًا» (ask 4), and NO check-in link either, because the RPC would refuse it. DEC-090 corollary 2.',
  },
  {
    key: 'live-row',
    title: 'جلسة جارية الآن',
    state: 'in_progress',
    startH: -1,
    mins: LIVE_MINS,
    capacity: 30,
    rsvp: 'confirmed',
    note: '★ live FROM THE ROW, and you hold a seat — the check-in link DOES appear.',
  },
  {
    key: 'live-none',
    title: 'جلسة جارية بلا حجز',
    state: 'in_progress',
    startH: -1,
    mins: LIVE_MINS,
    capacity: 30,
    rsvp: null,
    note: '★ live / none, walk-ins OFF — NO check-in link. This is the bug: it used to be the primary navy button here.',
  },
  {
    key: 'live-walkin',
    title: 'جلسة جارية تقبل الحضور المباشر',
    state: 'in_progress',
    startH: -1,
    mins: LIVE_MINS,
    capacity: 30,
    rsvp: null,
    walkIns: true,
    note: '★ live / none, walk-ins ON (DEC-065) — the check-in link DOES appear. Same relation as above, different switch.',
  },
  {
    key: 'ended-attended',
    title: 'ندوة الأرشفة الرقمية',
    state: 'completed',
    startH: -168,
    mins: 90,
    capacity: 50,
    rsvp: 'confirmed',
    checkedIn: true,
    note: '★ ended / attended — «حضرت» as a read-only fact. NO live «إلغاء الحجز» form, which is what used to render here.',
  },
  {
    key: 'ended-absent',
    title: 'لقاء أدوات المونتاج',
    state: 'completed',
    startH: -336,
    mins: 60,
    capacity: 50,
    rsvp: 'confirmed',
    note: '★ ended / absent — «لم تُسجّل حضورك», also read-only.',
  },
  {
    key: 'ended-presenter',
    title: 'كيف نقيس جودة الصورة',
    state: 'completed',
    startH: -504,
    mins: 75,
    capacity: 50,
    presenter: true,
    note: 'ended / presenter — the host-view link must be GONE. It used to show for a talk that finished weeks ago.',
  },
  {
    key: 'cancelled',
    title: 'جلسة أُلغيت',
    state: 'cancelled',
    startH: 48,
    mins: 60,
    capacity: 20,
    rsvp: 'confirmed',
    reason: 'تعذّر حجز القاعة',
    note: 'cancelled — offers nothing at all, and says why.',
  },
  {
    key: 'draft',
    title: 'مسودة لم تُنشر بعد',
    state: 'draft',
    note: 'draft — visible to you ONLY because you are an admin. A member sees a 404.',
  },
  {
    key: 'approved',
    title: 'مقترح مقبول بانتظار الجدولة',
    state: 'approved',
    note: 'pending_schedule — approved, not yet scheduled.',
  },
]

/** The titles this seed owns — how `--clean` finds exactly its own rows. */
const TITLES = PLAN.map((p) => p.title)

// ── the org ───────────────────────────────────────────────────────────────
const org = await one(`select id, name from public.orgs where slug = $1`, [ORG_SLUG])
if (!org) {
  console.error(
    `no org with slug "${ORG_SLUG}".\n` +
      `This seed attaches to the dev org you already sign in to; it does not invent one,\n` +
      `because the org's domain list is what decides whether your Google account provisions.`,
  )
  process.exit(2)
}

// ── the member ────────────────────────────────────────────────────────────
const me = await one(
  `select m.id, m.display_name, m.org_role, u.email
     from public.members m join auth.users u on u.id = m.auth_user_id
    where m.org_id = $1 and m.status = 'active'
    order by m.created_at limit 1`,
  [org.id],
)
if (!me) {
  console.error(
    `no active member in "${org.name}".\n` +
      `Sign in once at http://localhost:3000/ar/app so the access-token hook provisions you,\n` +
      `then run this again — the seed needs your member id to give you reservations.`,
  )
  process.exit(2)
}

// ── clean ─────────────────────────────────────────────────────────────────
async function clean() {
  const { rows } = await db.query(
    `select id from public.sessions where org_id = $1 and title = any($2::text[])`,
    [org.id, TITLES],
  )
  const ids = rows.map((r) => r.id)
  if (ids.length) {
    // Children first: none of these cascade from `sessions` by design — an
    // attendance record outliving its session is exactly the kind of thing
    // `02`'s FKs are `restrict` about.
    for (const t of ['check_ins', 'rsvps', 'session_presenters']) {
      await db.query(`delete from public.${t} where session_id = any($1::uuid[])`, [ids])
    }
    await db.query(`delete from public.sessions where id = any($1::uuid[])`, [ids])
  }
  const colleague = await one(
    `select m.id, m.auth_user_id from public.members m join auth.users u on u.id = m.auth_user_id
      where m.org_id = $1 and u.email like 'seed-colleague@%'`,
    [org.id],
  )
  if (colleague) {
    await db.query(`delete from public.members where id = $1`, [colleague.id])
    await db.query(`delete from auth.users where id = $1`, [colleague.auth_user_id])
  }
  console.log(`· removed ${ids.length} seeded session(s)${colleague ? ' and the colleague member' : ''}`)
}

if (CLEAN_ONLY || RESET) await clean()
if (CLEAN_ONLY) {
  await db.end()
  process.exit(0)
}

// ── the supporting rows (reused, never duplicated) ─────────────────────────
const upsert = async (table, name, extra = '') =>
  (
    await one(
      `insert into public.${table} (org_id, name${extra ? ', ' + extra.split('=')[0] : ''})
         values ($1, $2${extra ? ', ' + extra.split('=')[1] : ''})
       on conflict do nothing returning id`,
      [org.id, name],
    )
  )?.id ?? (await one(`select id from public.${table} where org_id = $1 and name = $2`, [org.id, name])).id

const categoryId = await upsert('categories', 'فني')
const venueId = await upsert('venues', 'القاعة الكبرى')
const companyId = await upsert('companies', 'الشركة التجريبية')
await db.query(`update public.members set company_id = $1 where id = $2 and company_id is null`, [companyId, me.id])

// A second member, so capacity, waitlists and presenter rows have someone who
// is not you. Created through auth.users because `members.auth_user_id` is not
// nullable — a member without an identity cannot exist, which is the right
// constraint and the reason this seed is not pure SQL.
let colleague = await one(
  `select m.id from public.members m join auth.users u on u.id = m.auth_user_id
    where m.org_id = $1 and u.email like 'seed-colleague@%'`,
  [org.id],
)
if (!colleague) {
  const domain = (await one(`select domain from public.org_domains where org_id = $1 limit 1`, [org.id]))?.domain
  // `members.email` is NOT NULL and is its own column — the member table does
  // not read through to `auth.users`, deliberately (a member survives an
  // identity being deleted). So the address goes in twice, on purpose.
  const email = `seed-colleague@${domain ?? 'example.com'}`
  // Reuse an existing identity rather than inserting blindly: a half-finished
  // earlier run can leave an `auth.users` row with no `members` row, and the
  // lookup above joins the two, so it would not have found it. Idempotent
  // means idempotent from any intermediate state, not just from empty.
  const user =
    (await one(`select id from auth.users where email = $1`, [email])) ??
    (await one(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                               raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
               $1, crypt('seed-only-never-used', gen_salt('bf')), now(),
               '{"provider":"email","providers":["email"]}', '{"full_name":"زميل تجريبي"}', now(), now())
       returning id`,
      [email],
    ))
  colleague = await one(
    `insert into public.members (org_id, auth_user_id, email, display_name, org_role, status, company_id)
     values ($1, $2, $3, 'زميل تجريبي', 'member', 'active', $4) returning id`,
    [org.id, user.id, email, companyId],
  )
}

const p2h = (s) => s.startH ?? 0
const created = []
for (const p of PLAN) {
  const existing = await one(
    `select id from public.sessions where org_id = $1 and title = $2`,
    [org.id, p.title],
  )
  if (existing) {
    // ★ REFRESH, don't skip. A dev seed whose `live` rows age into `ended`
    // between runs is worse than no seed: it shows the right UI for the wrong
    // reason. Re-running re-centres every window on now.
    if (p.startH !== undefined) {
      const startsAt = at(p.startH)
      const endsAt = plus(startsAt, p.mins ?? 60)
      await db.query(
        `update public.sessions
            set starts_at = $2, ends_at = $3, rsvp_deadline_at = $4, cancellation_cutoff_at = $5
          where id = $1`,
        [existing.id, startsAt, endsAt, plus(startsAt, -24 * 60), plus(startsAt, -12 * 60)],
      )
    }
    created.push({ ...p, id: existing.id })
    continue
  }
  const startsAt = p.startH === undefined ? null : at(p.startH)
  const endsAt = startsAt ? plus(startsAt, p.mins ?? 60) : null
  const row = await one(
    `insert into public.sessions
       (org_id, title, abstract, category_id, level, language, time_zone, state,
        allow_walk_ins, capacity, venue_id, starts_at, ends_at,
        rsvp_deadline_at, cancellation_cutoff_at, cancellation_reason)
     values ($1, $2, $3, $4, 'introductory', 'ar', 'Asia/Riyadh', $5,
             $6, $7, $8, $9, $10, $11, $12, $13)
     returning id`,
    [
      org.id,
      p.title,
      `نبذة تجريبية عن «${p.title}».`,
      categoryId,
      p.state,
      Boolean(p.walkIns),
      startsAt ? (p.capacity ?? 30) : null,
      startsAt ? venueId : null,
      startsAt,
      endsAt,
      startsAt ? plus(startsAt, -24 * 60) : null,
      startsAt ? plus(startsAt, -12 * 60) : null,
      p.reason ?? null,
    ],
  )
  created.push({ ...p, id: row.id })
}

// ── relations ─────────────────────────────────────────────────────────────
for (const s of created) {
  if (s.rsvp) {
    await db.query(
      `insert into public.rsvps (org_id, session_id, member_id, status)
       values ($1, $2, $3, $4) on conflict do nothing`,
      [org.id, s.id, me.id, s.rsvp],
    )
  }
  if (s.checkedIn) {
    // ★ `manual` REQUIRES a reason and a marker — `check_ins_check` says so, and
    // it is the right constraint: a manually marked attendance is a staff act
    // and the record has to name who did it and why (SCR-044). A seeded
    // check-in is no exception, so it names itself.
    await db.query(
      `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, arrived_at)
       values ($1, $2, $3, 'manual', 'بيانات تجريبية', $4, $5) on conflict do nothing`,
      [org.id, s.id, me.id, me.id, plus(at(p2h(s)), 10)],
    )
  }
  if (s.presenter) {
    await db.query(
      `insert into public.session_presenters (org_id, session_id, member_id, accepted)
       values ($1, $2, $3, true) on conflict do nothing`,
      [org.id, s.id, me.id],
    )
  } else if (s.startH !== undefined) {
    // Somebody else presents everything you do not, so presenter rows are
    // never empty and the host-view gate has a real negative case.
    await db.query(
      `insert into public.session_presenters (org_id, session_id, member_id, accepted)
       values ($1, $2, $3, true) on conflict do nothing`,
      [org.id, s.id, colleague.id],
    )
  }
}

// ── report ────────────────────────────────────────────────────────────────
console.log(`\n✓ seeded "${org.name}" for ${me.display_name} <${me.email}> (${me.org_role})\n`)
console.log('Open each of these and check the note beside it:\n')
for (const s of created) {
  console.log(`  http://localhost:3000/ar/app/sessions/${s.id}`)
  console.log(`      ${s.note}\n`)
}
console.log('Re-run freely — it is idempotent. `--reset` rebuilds, `--clean` removes.\n')
await db.end()
