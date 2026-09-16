You are the **wave-6 lead** for كريم معرفة. M9 is merged; the screens start now.

**Read in this order, all of it.** `docs/plan/STATUS.md` — start at the **★★ START HERE** block and
follow the five items it lists. Then `DECISIONS.md` **`DEC-110` … `DEC-129`** in full. Then
`CLAUDE.md`, `docs/plan/TEAM.md` §1–§3, and `docs/plan/16-ui-redesign.md` — its §15 and §16 are
superseded on *sequencing* only (`DEC-110`); everything else in it stands. The design canvas is a
**reference, not a specification**: `DEC-114`, `DEC-122`, `DEC-123` and `DEC-124` catalogue five
classes of error in it. Do not reproduce them, and do not silently correct them either — raise them.

## STEP 0 — before you spawn anyone

Write the wave-6 ownership map into `CLAUDE.md` and **regenerate all ten `.claude/agents/*.md`**;
they are still wave-5 shaped and would hand a teammate the wrong scope on day one. `DEC-085`:
*ownership lives in those never-touch paragraphs or it does not exist.* Inside
`src/components/ui/` ownership stays **per file, not per directory** — a glob with four writers is
the exact failure `TEAM.md` exists to prevent.

Cut `wave-6/screens` from `main`. Open a **draft** PR at your first push.

## STEP 1 — the wave: you plus three teammates

**you (lead)**
- The **shell sweep** — `DEC-111`. The nav dropdown stays open after a link is followed (native
  `<details>` has no reason to close, and Partial Rendering means the layout never re-renders), icon
  positions, and every disclosure closing when it has been used (`REQ-UIX-023`). The owner called
  this a blocking task, not a polish pass.
- The **three `(auth)` screens** — `DEC-129`. `DEC-097` assigned them to M9 and all three import
  **zero** `ui/` primitives. `sign-in` is the first screen every member ever sees and the only place
  `SC 3.3.8` applies: allow paste, `autocomplete="one-time-code"`, never block a password manager.
- The **numerals sweep** — `DEC-124`. Western digits everywhere, always, no setting. 84 glyphs in
  `src/`, 27 in `src/messages/`, and `src/components/sessions/numerals.ts` collapses to
  always-Western. The migration dropping `orgs.numerals` and the `numeral_system` enum is yours.
  ⚠ Three glyphs sit in `(marketing)/page.tsx` inside the frozen contract — **leave them**, they are
  M13's.
- Tokens, migrations, gates, the PR.

**`sessions`** (opus) — **`/app` becomes the sessions timeline.** `DEC-112`, `REQ-UIX-021`,
`REQ-UIX-022`: a social-media-style feed of what a member can actually attend, not a dashboard.
Filters belong to the timeline and their state is always visible. A session's state is legible while
scrolling, without stopping to read. Plus browse and the event page.

**`console`** (sonnet) — **the admin console on the system.** `DEC-110` puts it in scope from the
start rather than two waves later, because the redesign has never touched it. It already owns
`app/admin/**`.

**`content`** (sonnet) — **the discussion as a composition surface.** `REQ-UIX-024`: a real editing
affordance rather than a bare textarea, visible upload controls rather than a hidden input, the
reaction animation, and pending / success / failure on every action. Plus materials and photos.

## Explicitly NOT this wave

Say so in `STATUS.md` rather than drifting into them:

- multi-day sessions — `DEC-119` … `DEC-121`
- the manual check-in switch — `DEC-113`, `DEC-116`, `DEC-117`, `DEC-118`. **Decided, not built.**
- gradient posters and the certificate library — `DEC-127`, `DEC-128`
- the survey
- **anything under `src/app/[locale]/(marketing)/`**, frozen until M13. `DEC-126`'s «تسجيل الدخول»
  lands there, not here.

## Hard constraints

`npm run qa` stays **44/44** and `npm run visual` **0.000%**. Teammates never write
`supabase/migrations/` — they propose under `supabase/proposed/<name>/` and prove it in their RLS
tests. Only you run `supabase db reset`, `npm run build`, `qa` and `visual`. Only you switch
branches. Never `git add -A` — stage your own paths explicitly. **The owner merges**; `gh pr merge`
is denied to every session on purpose. No session changes repository visibility, settings, secrets
or remotes. Run `gh auth switch --user ebnmajed` before any `gh` call — another session on this
machine switches it away. Push via the `github-second` alias; never reset `origin` to HTTPS.

## Definition of done, with one addition

The usual: `npx tsc --noEmit` clean, `npm run lint` zero errors (grep for `problems`, not `tail` —
the "N fixable" line reads as green), `npm test`, `npm run test:rls`, your e2e, one 390 px RTL
screenshot per screen **looked at**, Arabic authored in `messages/ar/` first with all six ICU plural
forms and `<bdi>` on every interpolated value.

**New, from `DEC-129`: a wave does not close while a screen it claims imports zero `ui/`
primitives.** That check is one grep. Run it before you call anything done.

## How it ends

`STATUS.md` updated, PR open, the owner merges. **Do not start wave 7.**
