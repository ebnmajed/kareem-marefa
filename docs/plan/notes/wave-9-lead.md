You are the **wave-9 lead** for كريم معرفة. Wave 8 is merged (PR #25), `0092`–`0099` are live on
production, and **every route in the app is on the M9 design system** — `app/admin` 24/24,
`app/platform` 7/7, `app/me` 7/7, `app/sessions` 6/6, `(auth)` 3/3, `/app` 1/1.

★★ **This wave is not like waves 6, 7 or 8.** Those moved screens onto a system and were measured by
counting routes. **Wave 9 builds a feature on a new entity**, and the measure is different: does a
three-day workshop work end to end, and does a one-day session behave exactly as it does today.

**Read in this order.** `docs/plan/STATUS.md` — the **START HERE** block, then the wave-8 record.
Then `DECISIONS.md` **`DEC-119`, `DEC-120`, `DEC-121`** in full and slowly — they are this wave's
specification — and `DEC-110` … `DEC-149` for everything else. Then `CLAUDE.md`, `TEAM.md` §1–§3,
`02-domain-model.md` (**frozen**; `ENT-session_days` is defined under `DEC-119`), and
`01-prd.md`'s `REQ-SES-016`, `REQ-SES-017`.

## STEP 0 — a gate, not a step

The wave-9 ownership map into `CLAUDE.md` and **all ten `.claude/agents/*.md`** (wave-8 shaped), and
**the contract list into `STATUS.md`** — not a route checklist this time, because routes are not the
unit. Name the seams between tracks instead. Cut `wave-9/multi-day` from `main`; draft PR at the
first push. Migrations start at **`0100`**.

## ★★ The one thing that makes this wave dangerous

**`sessions.starts_at` and `ends_at` become derived from the first and last day, and stay stored**
(`DEC-119`). Every existing index, sort, query and the `session_window` trigger keep working *only*
because they stay stored. Get that wrong and you break the timeline, browse, the clock jobs, the
reminder schedule and the public card at once.

It is also the **largest schema change since M1**, on a live database with real members. Plan the
migration so that **the code half is correct on either side of it**, the way `DEC-132` did for the
numerals column — then the push-before-merge order the last two waves used still works.

★ **A one-day session is a session with one day.** No second code path, no `if (isMultiDay)` in a
reader. The common case is the general case at `n = 1`, and **every existing session must migrate to
exactly one day with no behaviour change.** That backfill is the migration's hardest half and it
runs against production rows.

## The wave — five tracks, and the seams matter more than the files

| | |
|---|---|
| **lead** | the migrations (`0100`+), the backfill of every existing session to one day, the derived-and-stored `starts_at`/`ends_at`, promotion, gates, the PR. **Write the contracts first and publish them before spawning** — this wave's tracks meet in the data, not in a slot |
| **`checkin`** | **per-day check-in**: `check_in_codes`, `check_ins`, `check_in_attempts` and the `ends_at + 2 h` ceiling **per day**, not per session. The switch (`DEC-116`) is per day too. Attendance across days is what `REQ-SES-017` reads |
| **`sessions`** | **`REQ-SES-016` — the form.** Multi-day behind an explicit affordance so one day costs nothing; the end follows the duration live and **stops once explicitly edited**; each added day defaults to the previous day's time and place; validation at the field on blur, never only on submit. Plus the event page showing days |
| **`content`** | **`DEC-121` — content scoping.** One nullable `session_day_id` on `materials`, `session_tasks` and `photos`; **null means the whole session**. No scope enum, no second table. The member reads one grouped list — **and a one-day session has no groups and no headings, rendering exactly as it does today** |
| **`scoring`** | **`REQ-SES-017`** — points and certificates require **all days** by default. For a multi-day session the award **moves from the check-in trigger to session completion**, because the full day set is not known until then. The idempotency key becomes per member **per session**, so a re-run cannot double-pay an append-only ledger (invariant 9) |

★ **`scoring` has not run since wave 2.** Its agent file is seven waves stale.

## Four rulings already made — do not re-litigate

1. **«Notes» meant the day's CONTENT** (`DEC-120`) — materials and pre-session tasks, not a text
   field. The entity is **when, where and which meeting** and nothing else. No free text, no second
   policy set, no readership question.
2. **Capacity stays on the session**, and **`rsvps` stay on the session** — one registration covers
   every day (`DEC-119`).
3. **Scope is implied by WHERE you are** (`DEC-121`): the add control sits in each group's header, so
   pressing it *is* the choice. No picker, no modal, no required field. The item then carries a chip
   that re-scopes in one tap. **Photos never ask** — a photo takes the day whose window contains its
   upload time; staff may re-scope it. **Adding a second day re-scopes nothing.**
4. ★ **`materials.phase` is relative to the SCOPE, and this is a fix.** `REQ-MAT-006` today hides a
   «بعد الجلسة» material until the *session* completes — so on a three-day workshop day 1's slides
   would be withheld until Friday. A day-scoped «بعد» material releases when **that day** ends.

★ **This is NOT `A14`'s recurring series**, and the distinction has to survive the wave: that is N
independent sessions each with its own registration and certificate; this is one session with N
meetings, one registration, one certificate.

★ **`REQ-TSK-002` is untouched and matters more now**: tasks stay reminder-only and are **never read
by any check-in path**. Attaching them to a day puts them beside that day's attendance in the schema
for the first time, which is exactly the invariant a later reader assumes away.

## Not this wave

**The survey** (`REQ-SUR-001` … `009`) and **the email studio** (`REQ-NTF-009` … `014`, `16` §11) —
both are wave 10. **Anything under `src/app/[locale]/(marketing)/`** and the components it renders,
frozen until M13 — `DEC-126`'s «تسجيل الدخول» and the eleven Arabic-Indic glyphs in `chapter.tsx`
land there, with the accessibility and performance closing passes.

## Carried

- ★ **Railway's push trigger has never been armed** — three merges in a row needed a manual
  `railway service source connect`. **Record it in `STATUS` as a standing post-merge step for the
  owner** until the dashboard setting is fixed, rather than leaving it in anyone's head.
- `REQ-EVT-010` says a photo appears at once; the shipped pipeline processes, then shows.
  **Reconcile the requirement or the pipeline** — it has been carried three waves.
- Two canvas contrast questions still unanswered by the owner (`DEC-123`): browse tag-chip counts at
  1.96:1, a 13 px caption at 3.30:1. Ask once; do not reproduce them meanwhile.

## Definition of done

The usual — `tsc`, `lint` zero errors (**grep for `problems`**), `npm test`, `npm run test:rls`,
e2e, `qa` 44/44, `visual` 0.000 %, `parity`, Arabic authored in `messages/ar/` first, `<bdi>` on
every interpolated value, a 390 px RTL capture at its cited path that **you opened yourself**.

**And two this wave adds:**

1. ★ **A three-day workshop, end to end, as one demonstrable** — scheduled with three days, each
   day's code checked into separately, day-scoped and session-scoped materials both visible in the
   right groups, points and the certificate awarded only after all three, and the whole thing
   rendered at 390 px in Arabic.
2. ★ **A one-day session is byte-identical in behaviour to today.** Prove it, do not assume it: the
   existing e2e suite is the proof, and it must pass untouched.

## How it ends

`STATUS.md` updated, PR open, **the owner merges** — and because this wave carries migrations, the
owner rehearses them against a production schema dump, pushes, then merges, in that order. ★ **Say
in `STATUS` that Railway must be checked manually after the merge.** Do not start wave 10.
