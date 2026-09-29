You are the **wave-16 lead** for كريم معرفة. Wave 15 is merged (PR #33, `b9f2ca0b`), production is at
`0161`, the worker is rebuilt and Online, CI is green, and there are **no open PRs and no wave map in
force**. Migrations start at **`0162`**; the next decision is **`DEC-195`**; the next free ids are
**`REQ-UIX-044`** and **`STORY-UIX-027`**. This wave claims **M18**.

**Read in this order.** `docs/plan/notes/wave-15-lead.md` (the programme's shape), then
`docs/design/03-motion.md` **in full** and `prototypes/motion-story.html` — **its CSS and JS are the
behaviour reference and it plays all five moments in sequence.** Then `DECISIONS.md` **`DEC-100`**
(reversed, and you need to know what survived it), **`DEC-093`** (the dragging rule, now at seven
places), `DEC-183`, `DEC-192`, `DEC-193`, `DEC-194`. Then `STATUS.md`'s wave-15 block, `CLAUDE.md`,
`TEAM.md` §1–§3.

---

## ★★ ANSWERED by the owner, 2026-09-29 — the moments land on the real screens

**Wave 15 changed nothing visible. This wave does, and the owner has already been told and has said
yes. Do not re-open it; record it in `DEC-195`.**

`03-motion.md` puts the moments on **real screens** — `SCR-012` (reservation), `SCR-014` (check-in),
`SCR-022` and the home card (completion), the level card (level-up), `SCR-027`/`SCR-028` (rank
change). A reservation plays a ticket rising and a stamp landing; a check-in plays confetti and the
coin. **Those are visible on production the day this merges, and the owner accepts that.**

★ **The reason, which belongs in `DEC-195` so the choice is legible later: a moment cannot be verified
in a gallery.** Its definition is «plays once, when the action resolves, never on a re-render». A
canned replay in a demo proves the animation renders; it proves nothing about *when* it fires. Built
anywhere but the real screen, a moment is not tested — only drawn.

★★ **This amends `DEC-183` §4.2(f)**, which said «this wave the scope is applied in the gallery and
nowhere else. The shell adopts it in the screens waves». **Say so plainly in `DEC-195`** — the
surfaces the five moments touch adopt what they need now, ahead of the screens waves, and every other
screen still waits. **Name in the entry exactly which surfaces move and which do not**, so the next
lead does not have to infer the boundary.

★ **The five frozen public routes still do not move.** `qa:contract` green at every commit, `visual`
unchanged on the public pairs, and the register-form fingerprint byte-identical — wave 15 built all
three and they are the cheapest proof you have. ★ **And the owner will open the live site on a phone
after the merge**, as in wave 15: the two moment screens *should* look different, and the five public
pages should not.

## What exists — measured, so you do not re-derive it

| | |
|---|---|
| Duration tokens | **both ramps, side by side**: `--dur-fast/base/slow` (the old, 120/200/360 ms) and `--duration-fast/base/slow/party` (wave 15's, 120/220/420/900 ms). ★ Two ramps is a `DEC-183` §4.3 ruling, not an accident — read it before you touch either |
| Keyframes | **15** in `globals.css`. `DEC-100` counted twelve, used by three marketing files; wave 15 added three. **The marketing three stay until the public wave** |
| `lib/ui/confetti.ts`, `useCountUp` | **neither exists.** `src/lib/ui/` does not exist |
| The objects | all six ship as React components — `src/components/ui/objects/{coin,cup,flame,rocket,star,ticket}.tsx` — plus `types.ts`. **The coin, the ticket and the flame are moments 2, 1 and 3.** Do not re-author them |
| `sticker`, `level-card`, `rank-row`, `race-bar`, `progress-bar`, `session-cta` | all built in wave 15, with tests and gallery entries. **Moments 1, 4 and 5 compose these** |
| The screens | `SCR-012` `sessions/[id]/page.tsx` **385 lines** · `SCR-014` `check-in/page.tsx` **140** · home `app/page.tsx` **19** |

## ★ A carried defect this wave fixes, because it is a planning bug and it has bitten once already

★★ **The three `(auth)` screens are in no wave of this programme.** `07-tasks.md`'s screens wave
follows `09` §8's order — «M10 member screens, then M11 console, M12 designer and certificates, M13
public». `09` §8 puts `sign-in` (`SCR-002`), `choose-org` (`SCR-003`) and `no-access` (`SCR-004`) at
**M9**, which is not in that list. They are neither behind sign-in nor public marketing, so **every
grouping skips them** — which is exactly how the owner found the login page untouched after the first
redesign and had to ask for it by name (2026-09-16).

★ **And `09` §8's markers for all three are stale**: they read «M9 ✗ NOT DONE — carried, `DEC-129`»,
but wave 6 did them — `f8a977ca feat(auth): sign-in, choose-org and no-access on the design system` —
and `sign-in` imports `button`, `icons`, `page-header` and `panel` today. So a lead planning the
screens waves from `09` §8 gets a doubly wrong picture: a screen that is done marked not done, and
a screen that needs the playground listed under a milestone that closed.

**Two lines of the lead's own work, this wave:**
1. Correct `09` §8's three rows — done in M9's successor wave, with the commit named.
2. **Name `SCR-002`, `SCR-003` and `SCR-004` explicitly in the programme's screens sequence**, in
   `14-roadmap.md` and in `DEC-195`, with the milestone that will carry them. `SCR-002` is «the first
   screen every member sees, and the only place `SC 3.3.8` applies» (`09` §8's own words). It is not
   a screen to reach by accident twice.

## ★ One small row the owner added on 2026-09-29, and one ruling to record

**The row — a colour when the company is created.** `createCompany` inserts `{ org_id, name }` and
nothing else; the team colour is set afterwards as a separate action on the row. The owner's model is
that an admin sets it **while adding the company**. Put the colour control on the add form and let the
insert carry it — nullable still, and the same named-colour picker the edit path uses, never a hex
field (the column's check refuses upper case, and `TEAM_COLOUR_NAMES` keeps an admin away from that
entirely). `companies-table.tsx` and `actions.ts` are `console`'s files and `console` is not spawned,
so this is the **lead's as custodian**, with its test and a 390 px capture.

★★ **The ruling — companies have NO logo, and this is a decision, not an omission.** The owner asked
whether a logo belonged beside the colour and ruled **no** on 2026-09-29. Record it in `DEC-195` with
the reason, because someone will propose it again: `00-direction.md`'s third principle makes the
colour the company's identity — *«Companies are houses. Each company has a team colour that rings
every avatar and colours every poster and race bar. The company is never the avatar fill; it is the
ring»* — and a ring plus a logo on one avatar is two identity signals competing. A company in this
product is a name, a team colour, and active-or-deactivated. **That is the whole entity, on purpose.**

## The wave — the five moments

| | |
|---|---|
| **lead** | `DEC-195` and the Step 0 ruling above · `src/lib/ui/confetti.ts` and `useCountUp` — **the shared mechanism, before any track uses it** · the once-per-occurrence keying · the `(auth)` planning fix · gates, `STATUS`, the PR |
| `sessions` | **moment 1, الحجز** on `SCR-012` — the ticket, the stamp, the thud, the capacity chip, the CTA's booked state, the calendar whisper; and the **waitlisted** variant, same ticket, cyan «قائمة الانتظار · N» |
| `checkin` | **moment 2, تسجيل الحضور** on `SCR-014` — confetti, the coin, the three lines. ★ **The amount is computed from `scoring_rules` and the attendance, never stored, and always says the points arrive at completion** (`REQ-CHK-018`, `REQ-PTS-015`, both built in wave 12) |
| `scoring` | **moments 3, 4 and 5** — the count-up from the old balance, the flame's grow-and-flicker, the level bar, the level card's flip and shine, and the rank change |

## ★★ Five things that are not negotiable, each already a rule

1. ★ **Once per occurrence, never on a re-render.** This is the hardest part and it is not an
   animation problem, it is a state problem. A moment keyed to a render fires on every navigation
   back to the screen. Key it to the *occurrence* — the ledger row, the check-in id, the level id —
   and prove it with a test that re-renders and asserts silence.
2. ★ **Every moment has a named static state that is a COMPLETE experience under reduced motion**
   (`REQ-UIX-014`, and `DEC-183` §2 kept it). **Collapsing a duration is not a reduced-motion
   design.** `03-motion.md` names each one; build it, review it at 390 px beside the animated one,
   and capture both.
3. ★ **Transform, opacity and filter only. 60 fps. No `will-change` left on. No motion library.**
   `REQ-UIX-020` survived the reversal untouched. Confetti is `element.animate()`.
4. ★ **A failure never animates.** Nor do tables, lists, admin screens, the audit log, exports or any
   error state.
5. ★ **Nothing scales on hover.**

## Not this wave — name each in every agent file

Stories · the timeline's feed items · proposal voting · the weekly leaderboard · the streak rule ·
any screen redesign beyond the surfaces the five moments touch · `(marketing)/**` · the desktop shell
(`DEC-NEXT-15`, deferred) · leagues · the certificates' look. **And the two carried gates stay
carried, together** (`DEC-194`): the trigger-definer ACL sweep over all 58, and wave 14's
Storage-predicate gate — one wave, one generated test each, not piecemeal.

## Definition of done

The usual — `tsc`, `lint` zero errors (**grep for `problems`**), `npm test`, `test:rls`, e2e,
`qa:contract` **and** `qa:appearance`, `visual`, `parity`, `policy-diff`, `trace`,
**`ui-lint --strict` with no allowlist**. Arabic authored in `messages/ar/` first, `<bdi>` on every
interpolated value, Western numerals only.

**And four this wave adds:**

1. ★★ **A trace on a throttled CPU with no frame over 16 ms, for moments 1 and 2** — `07-tasks.md`'s
   own gate. These two play on the phone, in a room, at the moment that matters.
2. ★★ **A re-render test per moment**: mount, play, unmount, mount again — and assert it does not
   play. This is the defect this kind of work ships with.
3. ★ **Every static state captured at 390 px in Arabic beside its animated counterpart**, opened by
   you.
4. ★ **`qa:contract`, `visual`'s public pairs and the register-form fingerprint all unmoved** —
   whatever the Step 0 ruling decides about `SCR-012` and `SCR-014`, the five public routes do not
   move.

## How it ends

`STATUS.md` updated, PR open, **the owner merges**. If this wave carries a migration the owner
rehearses it on a production schema dump, pushes, then merges, then reconnects Railway — **the
eleventh consecutive time** unless the dashboard's Settings → Source has been set by then.
★ Wait for a status with **no suffix**: `● Online · Building` and `● Online · Deploying` both begin
with «Online». ★ And read CI from the run's own conclusion on the PR head, not from a local gate —
`DEC-192` exists because that was got wrong once.
