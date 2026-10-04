# Wave 26 — M13, stories, and the mark: the last wave

**You are the implementing lead.** Every number below was read from the tree, not from the planning
prompt. Read this, then `docs/design/screens/M13.md`, then
`docs/design/screens/STORIES-USER-STORIES.md` (STO-01…18), then `M11a.md` §0 for the console frame,
then the **seventeen** artboards at their board widths beside their PNGs, then
`notes/wave-23-lead.md`, `DEC-240` §5, `DEC-241`, `DEC-199` §2 as amended by `DEC-208`,
**`REQ-NFR-019` and `DEC-167`**, `tests/unit/public-graph.test.ts` and `scripts/visual-diff.mjs`,
`REQ-NFR-014`, `REQ-TEN-*`, `REQ-AUT-003`, `REQ-ADM-015`, `REQ-DSG-021`, `REQ-PRV-*`,
`03-permissions-rls.md` for the platform role, `docs/design/05-stories.md` with
`prototypes/stories.html`, and `messages/ar/{marketing,branding,platform,privacy,stories}.json`.

---

## ★★ This is the last wave

Every screen in the product has a design and, when this merges, every one is built. **Write that
sentence into `STATUS.md`'s head.** After it there is no further designed work — anything more is new
scope the owner decides.

## ★★ The two rules, and the one screen they do not reach

1. **A screen is REBUILT to its design, never restyled** (`DEC-199` §2).
2. **Its page file is DELETED first, then written from its artboard** (`DEC-208`), with the
   kept-behaviour table naming each behaviour and the `REQ-*` that kept it.

★ **`080`–`085` are a REDESIGN of built screens** — wave 8 built all seven platform routes
(`DEC-147`) — so `DEC-208` applies in full: delete, then rebuild, not new pages. ★ **`SCR-044` is the
exception**: it was rebuilt in wave 21 and is only **extended** here with the «قصص الحضور» strip, so
it is an **add-only** change with no delete and its wave-21 suites passing untouched.

## What is measured

| | |
|---|---|
| `main` | **`00377c6f`** (`origin/main`, PR #68 `wave-25/add-a-member`). ★ **Your local `main` is 9 commits behind it and carries 44 uncommitted files** — see the warning below |
| The next decision | **`DEC-245`** — the log ends at `DEC-244` |
| The next migration | **`0198`**. `0197_add_a_member.sql` is the last on `origin/main` |
| ★ `0194` | **missing from the sequence** — `0193` then `0195`, on disk and on `origin/main`. **You rule on it; I only flag it.** Either a number was abandoned mid-wave or a migration never landed, and `DEC-180`'s lesson is that a number cited and not written vanishes without an error. Say which, in one line |
| `src/components/ui/` | **69 `.tsx`**, floor **69** at `tests/unit/ui-playground.test.ts:123`. ★ **Two new** — `story-viewer`, `story-capture` — so the floor moves **69 → 71**. `story-ring` already exists (wave 15) and its states are built |
| The artboards | **seventeen** `.dc.html` in `m13/` |
| ★ The PNGs | **sixteen for seventeen boards.** `AdminAttendance.dc.html` **has no PNG** — every other board has one. Ask for it or record that `044`'s strip is reviewed against the board's own render |
| ★ `visual-diff.mjs` | `ROUTES = ['/ar', '/en', '/ar/register', '/ar/ui']` (`:56`) — **`/og.png` is not there**, so today only `qa:contract` shape-checks it. PR E adds it with a baseline |
| New ids | read the next free `REQ-*` and `STORY-*` at Step 0; **`REQ-STO-001` … `REQ-STO-018`** come from STO-01…18 one-to-one |

★★ **Before anything: your local `main` is 9 commits behind `origin/main` and holds 44 uncommitted
files — the brand pack, with the wordmark SVG and PNG assets staged as DELETIONS.** Nothing is
deleted before the wave that replaces it is on a branch (the owner's rule of 2026-09-28). **Fast-forward
`main`, then cut your branches, then let PR E do the deletions.** Do not carry a loose delete into a
branch cut.

## The wave — five PRs

- **A — `wave-26a/the-public-site`**: `000` the landing · `001` register · `006` verify. ★ **One
  commit carries the `DEC`, the appearance change and the re-baselined visual diff together**
  (`REQ-NFR-019`, `DEC-167`); `public-graph.test.ts` **untouched**; the accessibility floor re-run.
- **B — `wave-26b/branding-and-privacy`**: `059` هوية المؤسسة · `/app/me/privacy`.
- **C — `wave-26c/the-platform-console`**: `080`–`085` on `admin-rail`, deleted and rebuilt.
- **D — `wave-26d/stories`**: `REQ-STO-*`, `0198` `story_views` and `story_frames`, the generator,
  `story-viewer`, `story-capture`, the ring wired, `044`'s strip.
- **E — the mark**: ★ **buildable, with ONE decision outstanding** — the scope gating (§E). The motion is specified
  in `assets/brand/logo/README.md` §16 even though the prototype it names is missing.

★ **Open each against `main` on its FIRST push.** Six waves have avoided the retarget trap that way.

★★ **The spec is ON `main` — do not re-commit it.** `M13.md`, `M13-PLANNING-PROMPT.md`,
`STORIES-USER-STORIES.md`, the **seventeen** artboards, **sixteen** PNGs and the whole logo pack (11 files under
`assets/brand/logo/`) were untracked and landed as **PR #71 → `3a3d0c54`**. So your Step 0 **commits nothing under
`docs/design/`** — check what is already in git before adding anything there, or you will create a second copy of
seventeen artboards. ★ The one still absent is **`AdminAttendance`'s PNG**.

## ★★ §A — the public contract is the tightest constraint in this wave

`REQ-NFR-019`: `/`, `/ar`, `/en`, `/ar/register` and `/og.png` keep their **URLs, their registration
behaviour and their accessibility floor** forever; their **appearance** changes only through a
`DECISIONS.md` entry **and a re-baselined visual diff in the same commit**. That is the permitted
path and `DEC-NEXT-37` takes it.

★ **`tests/unit/public-graph.test.ts` is the guard, it stays untouched, and it asserts three things
you must design around:**

1. the graph is **found and larger than the pages** — more than ten files, and it **must still reach
   `components/registration-form.tsx`**;
2. it reaches **exactly five primitives** — `button`, `field`, `icons`, `input`, `textarea`
   (`DEC-186` §1). **A sixth makes it fail**, so nothing new from `ui/` may enter the public graph;
3. ★★ **it names the playground's scope NOWHERE**: for every file the public routes reach,
   `source.includes("theme-play")` must be `false`.

**The frozen behaviour of `001`, to be listed in your plan and shown kept to the letter.** Measured
in `src/components/registration-form.tsx`: a server-action `action={formAction}`; a hidden
`form_token` (`:146`) and a hidden `locale` (`:150`); a honeypot field (`:157`); `role="alert"`
regions at `:167` and `:348`; and the posted field names `name`, `email`, `topicTitle`,
`topicCategory`, `topicDescription`, `role`. **Those names, the action, the validation and the no-JS
path are the contract, byte for byte** — and `registrations` is never read, altered or dropped
(invariant 2, **20 real signups**).

## §B — branding and privacy

`059` is read-mode with one «عدّل» (`DEC-NEXT-23`); the brand kit **feeds output, not the app**
(`DEC-201`) — `REQ-ADM-015`, `REQ-DSG-021`. `/app/me/privacy` becomes **a hub page behind `029`, not
a strip tab** (`DEC-NEXT-39`), and its undrawn states are yours to build: the export's requested,
building, ready and expired. `REQ-PRV-*`.

## §C — the platform console, redesigned

`DEC-NEXT-38`: it moves onto the console frame — **`ui/admin-rail` with a second nav set** — and
**`src/components/platform/platform-nav.tsx` is deleted**, with its kept-behaviour table. Note the
rail's own rules still hold: a plain member gets an empty rail, and `built: false` items are excluded.

★ **Platform isolation is the thing to get right** (`REQ-NFR-014`, invariant 8, `DEC-014`): **the
super admin has no data plane.** The metrics and orgs tables carry **counts only** — your plan names
each DAL function in `src/lib/dal/platform*.ts`, what it returns, and its test. **No policy gains an
`is_super_admin()` disjunct**, ever; org rows are read only inside an impersonation session carrying
an ordinary member's claims.

★ **Impersonation's existing behaviour is kept, and the decision is `DEC-054`** — not a 1xx, as the
prompt guessed. `DEC-054` Decision 1 lands `impersonation_sessions` «`02` §4.1 verbatim, **≤ 4 h by
constraint**, append-only»; `DEC-055` Decision 3 says break-glass browses nothing beyond that;
`DEC-057` Decision 7 makes the `ImpersonationBanner` real on the platform shell and on `/no-access`.
The reason and duration are stored, the **org's** audit receives the entry, and the session ends at
the duration. The new screen shows all of it and changes none of it.

## §D — stories, the last feature

★ **The requirements come first.** `01-prd.md` is the only file that may define one: write
**`REQ-STO-001` … `REQ-STO-018` from STO-01…18, one to one**, then write PR D's stories from the
`REQ`s — not from the artboards. From `05-stories.md`: the frame types, the triggers, the sources,
**24 h expiry**, **visibility = the org**, **reactions as `REQ-SCR-021` zeros**, and **no authoring**
for generated frames.

**Then `0198`**, one migration carrying both: **`story_views`**, and **`story_frames` with `kind`,
`author_id`, `caption`, `asset`** for the attendee frames. Each table names `org_id`, RLS, the full
policy set, **a matching grant for every policy** — `0002` exists solely because `0001` forgot one —
and its test, with a fixture row so the generated isolation sweep covers it from day one
(invariants 5 and 6).

**The generator**: one frame per trigger, **idempotent** — a trigger firing twice produces one frame.
**`story-viewer`**: the tap/hold/swipe model **and a keyboard alternative**, which is `DEC-093`'s
rule — `SC 2.5.7` is separate from `SC 2.1.1`, so the gate is a Playwright case driven by
`page.click()` alone. The ring on `010` and «شاهد القصة» on a live `012` are **wired at last** —
wave 18 built the ring inert and five waves have kept it so. Desktop centring as drawn.

★ **Definition of done for the generated half:** a live session produces its frames **within a
minute of each trigger**, a member views them, **the ring turns seen**, and **the frames vanish at
24 h.**

### ★ Attendee stories (`DEC-NEXT-41`) — the part with the most unanswered engineering

`story-capture`: photo on tap, video on hold, **15 s cap**, a caption. The gate: **checked in**, and
open from the session's start **until +24 h**.

- **The photo path reuses the album upload** — so it earns the photo rule's points under its cap,
  and **EXIF is stripped by the worker**, which `0174` made the only path that may register a photo.
  A photo frame is also an album photo.
- ★ **The video path is the open question and your plan must answer it, not sketch it**: ≤ 15 s,
  ≤ 60 MB, **one MP4 rendition**. **Name the transcoder and its cost.** `DEC-181` is the constraint
  that decides it: **no npm package for image or archive work — the worker uses system binaries from
  `worker/Dockerfile`**, which is the lead's file. `ffmpeg` is the obvious candidate and it is not in
  the image today; a plan that proposes an npm library says why a binary will not do, and
  `npm run lockfile` runs through Docker only. **Say the image size cost.**
- **Moderation**: a reported video is **hidden on first report, like a photo**, and reports and
  takedowns go through **the existing photo queues** — wave 22 merged comments into reports, so check
  which queue takes them.
- **`044`'s strip** (add-only): the admin sees the frames and **removal cascades** — the frame, the
  album photo and the asset. Invariant 9 holds: a points reversal is a **compensating row**, never a
  delete.

## ★★ §E — the mark is HELD, and this is the prompt's own stop condition

The planning prompt says: *«if either is missing, the logo pack was not unpacked — stop and say so»*.
**Measured:**

| | |
|---|---|
| `docs/design/LOGO-PROMPT.md` | present |
| `docs/design/assets/brand/logo/README.md` | present |
| `docs/design/assets/brand/logo/logo.svg` | present |
| ★ **`docs/design/prototypes/logo-motion.html`** | **MISSING** — the directory holds only `motion-story.html` and `stories.html`, both 28 September. ★★ **But the motion is SPECIFIED, so PR E is buildable:** `assets/brand/logo/README.md` §16 gives all three moves — **Reveal** (sign-in and cold start only, the four faces drawing in order coral → lime → violet → …), **Loading** (the four faces breathing in sequence, **1.6 s loop, 200 ms apart, shadows at 50 %**), **Tap** (one settle bounce as the home control), and «`prefers-reduced-motion`: static, nothing moves. No sixth moment — the mark never animates as one». And `logo-animated.svg` carries **ten `pathLength="1"` paths**, so the motion needs no measuring. **What is missing is the reference CSS, not the specification** — ask for the prototype, because matching a described easing is guesswork and all five moments got one, but do not wait on it |

★ **The stop condition names the prototype, and the prototype is absent — but it is not the only reference.**
`README.md` §16 specifies the three moves with their timings (above), so **PR E is not blocked on this: build the
CSS from §16 against the `pathLength="1"` paths, and ask the owner for the prototype in parallel.** What you must
not do is invent a move §16 does not describe, or add a fourth.

★★ **And there is a second blocker the prompt does not see — a contradiction between three of its own
requirements.** PR E says the motion CSS lives **under `.theme-play`**; PR A says
**`public-graph.test.ts` is untouched**; and that test asserts **no file the public routes reach may
contain the string `theme-play`**. The landing renders the mark. So:

- a single `<Logo>` that names the scope **fails `public-graph`**;
- the prompt also says «the public landing may use the reveal once, since it is not under the test» —
  but the reveal is gated by `.theme-play`, which the landing may not carry, so **the landing cannot
  have the reveal by that mechanism at all**.

★ **The way through, for the owner to confirm:** `<Logo>` is a **plain component, not in `ui/`** —
`ui/` would also break the «exactly five primitives» assertion — carrying the inlined SVG,
`pathLength="1"` and attribute strokes, and **naming no scope**. The motion attaches from
`globals.css` by selectors **under `.theme-play`**, which the public pages simply never carry, so the
component stays scope-agnostic and the CSS does the gating. **The landing then gets the static mark**
unless the owner wants un-scoped reveal CSS written specially for it — which is a decision, not an
implementation detail.

**Everything else in PR E is measured and correct**: both wordmark components exist
(`src/components/wordmark.tsx` and `src/components/brand/wordmark.tsx`), `platform/layout.tsx` has no
mark, `/og.png` is absent from `visual-diff.mjs`'s ROUTES, and `src/app/icon.svg` is the favicon to
replace. **PR E is ready the moment the prototype lands and the owner rules on the landing's reveal.**

## Explicitly out

New scope of any kind — **after this wave there is no further plan** · `DEC-194`'s two gates ·
`DEC-186` §4's overshoot ceiling · the hard-load duplicate's fix (`DEC-204`) · `DEC-215`'s four
carried items · the `railway.json` → `.railway/railway.ts` migration, **due 2026-12-01**, the
owner's.

## Do not re-litigate

`DEC-124` numerals · `DEC-099` on avatars · `DEC-093`, which is why `story-viewer` needs a keyboard
path · `DEC-014` and invariant 8 — **no `is_super_admin()` disjunct** · `DEC-054`'s impersonation
shape · `DEC-167`'s re-cut public contract · `DEC-181`'s no-npm-for-media rule · `DEC-201`'s brand
kit scope · invariant 2, `registrations` · invariant 11, **no SVG uploads** — note the mark is a
repo asset inlined by a component, not an upload.

## Definition of done

Deleted then written where `DEC-208` applies, two commits, with the kept-behaviour table before the
create and read back after · matches its artboard at its board width, captured at
`.qa-shots/rtl/wave26-<track>-<screen>-<state>-<width>.png` from a production build the row names ·
`ui-lint --strict` green · the scope tests green · `tests/unit/console-register.test.ts` green and
**untouched** · ★ **`public-graph.test.ts` green and untouched** · ★ **`qa:contract` green at every
commit, and the register-form fingerprint byte-identical** · the visual diff re-baselined **only in
PR A's one commit**, with its `DEC` · `<bdi>` on every code, slug, serial and number · six ICU plural
forms wherever a count appears · a ★ string in `messages/ar/` **first** · no `.dc.html` class in
`src/`.

## How it ends

Five PRs, four of them buildable today · CI read **from each PR head's own conclusion** (`DEC-192`) ·
the owner rehearses **`0198`** on a dump taken at `0197`, pushes, then merges A, B, C, D · Railway
reconnected with **`railway service source connect --repo ebnmajed/kareem-marefa --branch main`**,
**the builder checked before the deployment lands** — ★ it held last time because `railway.json` is
in the repo · the owner's acceptance, each screen beside its artboard · and your closing entry
records the deviation list, `0194`'s fate, and **the sentence that every screen now has a design and
is built.**
