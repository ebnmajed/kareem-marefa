# Wave 20 — M10c, the last batch of the member app

**You are the implementing lead.** This brief is measured, not estimated: every number below was
read from the tree at `c5a4cf9a`, and where it disagrees with the planning prompt or with
`M10c.md`, the disagreement is named. Read it, then `docs/design/screens/M10c.md` in full, then the
eleven artboards at their board width beside their PNGs, then `notes/wave-19-lead.md`, `DEC-213`
§4–§5, `DEC-214`, `DEC-215`, `DEC-199` §2 as amended by `DEC-208`, `DEC-195`, `DEC-204` with
`STATUS.md`'s H1 row, `05-scoring-engine.md`, `08-notifications-calendar.md` §1.7 and §2,
`09-sitemap-screens.md` SCR-021…028, `docs/design/04-components.md`, and
`messages/ar/{profile,scoring,certificates,calendar,notifications,leaderboards}.json`.

---

## ★★ The two rules this wave is judged on

1. **A screen is REBUILT to its design, never restyled** (`DEC-199` §2).
2. **Its page file is DELETED first, then written from its artboard** — two commits — **and the story
   lists what it kept and which `REQ-*` made it keep it** (`DEC-208`).

Rule 2 found three silently dropped behaviours in wave 18 and more in wave 19. **Expect it to find
several here**: the hub's six pages were «re-skinned onto the system» in M10 rather than rebuilt, so
they are the oldest markup in the member app. Treat every find as a defect of the rebuild, not a
discovery to shrug at.

## ★ The order — this is the last batch, and what follows is already decided

`DEC-215` §1's standing order is **WE BUILD WHAT HAS A DESIGN**. M10c is the last designed batch of
the member app. **When it merges the standing order has no screens left, so stories land next**
(`05-stories.md`, designed 2026-09-28 and twice overtaken) **unless the owner says otherwise.** Do
not start them here and do not wire wave 18's story ring — it still opens nothing.

## What is measured, so you do not re-derive it — and four corrections

| | |
|---|---|
| `main` | **`c5a4cf9a`**, clean, in sync. Production at **`0168`**; the next migration is **`0169`** |
| The next decision | **`DEC-216`** (the log ends at `DEC-215`) |
| ★ `src/components/ui/` | **57 `.tsx` files, NOT 63.** The planning prompt and `M10c.md` §9 both say 63; the gate's floor at `tests/unit/ui-playground.test.ts:119` reads **57** and matches the tree exactly. **Three** new primitives make it **60** |
| ★ The artboards | **eleven `.dc.html`, not twelve and not ten.** `M10c.md`'s own header says «10 artboards»; the prompt says twelve. Both `m10c/` and `m10c/png/` carry a `README.md`, which is where twelve came from. Eleven boards, eleven PNGs, matched |
| ★ They are **untracked** | `docs/design/screens/M10c.md`, `M10c-PLANNING-PROMPT.md` and `m10c/` are all `??`. **Step 0 commits the spec and the artboards** — wave 19's Step 0 had the same thing and it is how `tests/unit/design-files.test.ts` earns its keep. Decide in writing whether the planning prompt is committed; it is not a specification |
| ★ Screen numbers | **`SCR-021` and `SCR-024` are in `09`** — the sitemap at lines 41 and 44, the requirement table at 622 and 625 — **but have no `###` section**, so a reader looking for one finds nothing. `SCR-021` carries `REQ-PRF-001`, `002`, `006`, `007`, `008`, `010`, `011` and `REQ-NFR-013`; `SCR-024` carries `REQ-DSC-006`. **`SCR-029` does not exist anywhere in `docs/plan/`** |
| New ids | requirements from **`REQ-UIX-070`**; stories from **`STORY-UIX-059`** |
| Sizing | `TEAM.md` has **no** PR-size rule — only «three to five teammates, one branch». The precedent is the measure: wave 18's nine screens went in **two** PRs, wave 19's six in **one** |

## The wave — nine screens, three primitives, two PRs

Nine screens from eleven boards: `021` (read, edit, and the desktop hub) · `022` · `023` · `024` ·
`025` · `026` · `027` · `028` · `029` (new route). Phone at 390 throughout; **1280 for the hub**,
whose desktop board draws `022` as its content.

**Two PRs**, because this is wave 18's size, not wave 19's:

- **A — `wave-20a/the-hub`**: the hub frame, `021`, `022`, `023`, `024`, `025`, the three primitives,
  `0169`, and `STORY-UIX-copy-trim`.
- **B — `wave-20b/the-boards`**: `026`, `029`, `027`, `028`.

★ **Carry wave 17b's lesson: retarget B to `main` BEFORE A merges with `--delete-branch`.** A PR whose
base branch is deleted on merge is auto-closed, cannot be reopened or retargeted, and its green CI
counts for nothing — that is how #36 died.

**The three primitives** — `podium`, `settings-group`, `ledger-row` — each gets a story, a gallery
section, a test inside the scope and a registry entry; **the floor moves 57 → 60 in the commit that
adds the third**. `settings-group` replaces the planned `preference-matrix`, which is the next item.

## ★ Seven things in this batch that are easy to get subtly wrong

1. ★★ **`status-mark` is WITHDRAWN — the owner's ruling of 2026-10-02 (`DEC-216` §2.1).** `M10c.md`
   contradicts itself: §1.3 and `DEC-NEXT-23` require it, **§5 withdraws it**, and §9's new-primitive
   list has only three. The planning prompt asked for four and for it to replace the status pills on
   `023`/`024`/`025`, which §4 and §5 reverse. **§5 wins.** So: no glyph vocabulary; `023` uses a
   struck, dimmed row and the word «ملغاة»; `024` keeps **the badge the row already has on `011`**;
   `025` is one row. §1.3's ✓✓ «محفوظ» is **plain inline text with a glyph, not a primitive**. Three
   primitives, floor 60.
2. ★★ **The cap row the artboard draws cannot come from the ledger, and must not.** `points.ts:52-55`
   says it in a comment that is already law: *«This is NOT a ledger row and never will be. The ledger
   records points, not explanations, and no row is written for an award that did not happen… `05` §8
   set the precedent: a capped sixth comment writes no row either.»* So §2's dashed `0` cap row is an
   **explanation**, built the way `MissedAttendance` already is — a second non-ledger shape the DAL
   returns and the screen interleaves. **No view, no table, no migration.** And §2's own closing
   sentence — «nothing here ever shows a figure the ledger does not hold» — is about *figures*: the
   cap row holds no figure, which is why it is drawn as `0`.
3. ★ **The reversal pair needs one add-only field, not a schema change.** There is no
   `reverses_row_id`: the link is **`source_id` with `source = 'reversal'`** (`0149`'s key is
   `reversal:<id>:v1`), and `points.ts:647` already uses it for the presenter net. But the ledger DTO
   at `points.ts:146-156` **neither selects nor returns `source_id`** — it stops at `isReversal`. Add
   it, resolve the reversed row's amount, reason and date, and render the pair in one card
   (`DEC-NEXT-21`). Add-only in `src/lib/dal/points.ts`.
4. ★★ **The weekly board is new data, and `0169` is two columns.** `leaderboard_kind` is
   `('all_time','monthly','seasonal','topic','company')` — **there is no weekly** — and
   `05-scoring-engine.md` never mentions a week. The owner's ruling of 2026-10-02 (`DEC-216` §2.2):
   **the board computes this week LIVE from `points_ledger`** (as `all_time` already does from
   `points_balances`), and **the movement glyph is «منذ زيارتك الأخيرة», not «since the window
   opened»** — the copy changes, and it reuses `member_seen_marks` (`0162`), which is what moment 4
   already animates against. ★ **That table is one row per member with a column per surface**
   (`monthly_period`/`monthly_rank`, `company_period`/`company_rank`), so the reuse needs
   **`0169`: `weekly_period date` and `weekly_rank int check (weekly_rank > 0)`, nullable, mirroring
   the monthly pair.** Its grant is **table-level** (`grant select, insert, update … to
   authenticated`, `0162:66`), so **no new grant is needed** — say that in the migration story rather
   than leaving invariant 6 to be assumed, and add the cases to `tests/rls/scoring-seen.test.ts`.
   ★ A finding to record while you are there: `leaderboards.ts:512` already reads
   `monthly_period, monthly_rank` under the error label `member_seen_marks (week)`. **The surface
   called «week» reads a month today.** This wave is where that stops being true.
5. ★★ **`preference-matrix.tsx` is deleted, and it has a test and a caller.** It lives at
   `src/components/notifications/preference-matrix.tsx`, is imported by
   `src/app/[locale]/app/me/notifications/page.tsx`, and is pinned by
   `tests/components/notifications/preference-matrix.test.tsx`. `DEC-208` binds: its behaviour goes in
   `029`'s kept-behaviour table with the `REQ-*` that keeps each row, its test is **evidence** and each
   changed assertion is a ledger line in `STATUS.md` in the same commit. A toggle that silently stops
   writing a preference is the failure this rule exists to catch.
6. ★ **`029`'s categories come from `08`, not from the artboard.** `08` §1.7 names **seventeen**
   non-optional keys — corrected from «eleven» under `DEC-047`, and the list is authoritative — and
   they are **one sentence, never rows**. The optional ones are `08` §2's table: `new_sessions`,
   `my_sessions`, `reminders`, `ratings`, `social`, `recognition`, `proposals`, and `admin_queue`
   (admins and moderators only). `certificates`, `moderation` and `account` are marked **«on (not
   switchable)»** there, so they are not rows either. The artboard draws three switches; the list is
   `08`'s.
7. ★ **`SCR-029` has no requirement, so write one.** `/app/me/settings` needs its `REQ-UIX-0xx` in
   `01-prd.md` — the only file that may define one — a section in `09` beside the hub's, a
   `shell-routes.ts` entry, the gear link from `/app/me` and from the inbox's «ما يصلني», and the
   leaderboard opt-out moved **out of `021`'s form**. `Settings.dc.html` carries
   `aria-label="حسابي"`, the navigation rail and the raised «اقترح», so **it wears the tab bar** and
   draws its own `h1` «الإعدادات». While you are in `01`, give `SCR-021` and `SCR-024` the `###`
   sections `09` never gave them.

## ★ The owed measurement — it does not vanish into a rewrite

`DEC-204` and `STATUS.md`'s H1 leave **`/app/me/points` and `/app/leaderboards`** owed by this batch.
Re-measure both **after** the rebuild with `wave18-lead-hard-load.spec.ts`'s method — phone,
2 × 24 hard loads each, production builds — record the DOM duplicate rate **and what the
accessibility tree holds**, and write it against `DEC-204`'s table. The controls to stand it beside:
`main`'s `/app` measured **4 of 48 on an empty feed and 32 of 48 on a seeded one**, with the
accessibility tree **0 of 48 in both sittings across 192 loads**. **Recorded, not fixed** — the
defect itself stays carried.

## Explicitly out

`/app/me/privacy` (M13's, drawn in neither batch) · every console and studio route · the five frozen
public routes and everything `public-graph` protects · stories, their viewer and `story_views` — **the
ring stays inert** · leagues (the owner ruled them out with the weekly window) · a sixth moment; the
podium is **static** · photo tagging · the hard-load defect's **fix** · `DEC-194`'s two gates ·
`DEC-186` §4's overshoot ceiling · the hosting gate's enforcement, withdraw, a proposal history, the
reviewer's name and autosave (`DEC-215`'s carry) · a company logo.

## Do not re-litigate

`DEC-124` Western numerals — the artboards contradict it and the rule wins · `DEC-186` §4's `1.08`,
still the owner's · `DEC-206` §4.56 «a member never sees who else attends» — **the boards show ranked
members by design, which is not attendance** · `DEC-099` on avatars: `avatar`'s initials fallback,
photos only where that decision allows · `DEC-213` §5.117, which keeps the level-up off the profile
while moments 3 and 5 render on the hub's standing card.

## ★ The copy trim is a story in THIS wave

`DEC-NEXT-25` and `M10c.md` §0b: **a line exists only if it changes what the person does next.** The
M10a and M10b boards were trimmed the same day, so §0b's list is `STORY-UIX-copy-trim` **here**, in
PR A with the hub frame — not deferred. Every ★ string this brief or the spec proposes is tested
against that sentence before it is written, and it is written in `messages/ar/` **first**.

## Definition of done, per screen

Deleted then written, in two commits, with the kept-behaviour table in your note **before** the create
commit and read back against the new file after it · matches its artboard at 390, and at 1280 for the
hub, in a capture at `.qa-shots/rtl/wave20-<track>-<screen>-<state>-<390|1280>.png` from a production
build the row names by commit · `ui-lint --strict` green, no allowlist · the scope tests green ·
`qa:contract` untouched and `visual`'s public pairs not re-baselined · `REQ-UIX-053`'s console-register
test untouched · `<bdi>` on every serial, name, amount and interpolated title · six ICU plural forms
wherever a count appears · no `.dc.html` class, id or markup pattern in `src/`.

## How it ends

Both PRs green with CI read **from the run's own conclusion on the PR head** (`DEC-192`) · the owner
rehearses `0169` on a production schema dump, pushes, merges A then B, and reconnects Railway with
**`railway service source connect --repo ebnmajed/kareem-marefa --branch main`**, then checks the
builder before the deployment lands (`STATUS.md`'s wave-19 step 3 — the bare command no longer runs and
the reconnect resets the builder) · the owner holds each rebuilt screen beside its artboard on a phone;
**that is the acceptance, and it is the owner's** · your closing entry records the deviation list, the
owed measurement's result, and the sentence that stories come next.
