You are the **wave-19 lead** for كريم معرفة, and this is **M10b — the second batch of member screens
rebuilt to their artboards.**

**State.** `main` is `8b104683` — wave 18 merged as PR #38 (`65d3dec7`) and PR #39 (`38181edd`),
`DEC-205` … `DEC-212`. Production is at **`0167`**; the worker is rebuilt and `● Online`. Migrations
start at **`0168`**; the next decision is **`DEC-213`**; the next free ids are **`REQ-UIX-064`** and
**`STORY-UIX-051`**. M0–M20 are done. This wave claims **M21**.

**Read in this order.** This brief · **`docs/design/screens/M10b.md` in full** · **the eight
artboards** in `docs/design/screens/m10b/` — open each in a browser; the PNGs in `png/` are
reference, the HTML is the source of truth for layout, sizes and copy · **`M10a.md` §0 and §10**,
which this batch extends rather than repeats · `docs/plan/notes/wave-18-lead.md` · `DECISIONS.md`
**`DEC-199` §2, `DEC-205`, `DEC-206`, `DEC-208`, `DEC-212`** · `09-sitemap-screens.md` §3, §4, §8 ·
`03-permissions-rls.md` §5.1b · then `STATUS.md`, `CLAUDE.md`, `TEAM.md` §1–§3.

---

## ★★ The two rules this wave is judged on — both from wave 18, both earned

1. **`DEC-199` §2 — a screen is REBUILT to its design, never restyled.**
2. ★★ **`DEC-208` — the page file is DELETED FIRST, then written from its artboard**, and the story
   lists **what it kept and which requirement made it keep it.**

★ Rule 2 is not ceremony. It arrived mid-wave-18 and was applied retroactively, and **it immediately
found three screens that had silently dropped multi-day spans and co-presenters** — behaviour no test
covered and no reviewer would have missed in a diff of five hundred lines. **Expect it to find things
here too**, and treat each as a defect of the rebuild rather than a nuisance.

## ★ The order — the owner has amended it again, 2026-10-01

`DEC-205` set the order as **M10a · stories · the rest of M21 · console · studio · public site last.**
**The owner now takes M10b before stories.** Record it in `DEC-213` with the reason the owner gives,
and restate the order that follows, so the log shows two deliberate re-orderings rather than drift.
★ **Stories remains unbuilt**, and wave 18's `story-ring` row on `/app` still opens nothing by
design (`DEC-205` §1) — **do not wire it in this wave.**

## What is measured, so you do not re-derive it

| | |
|---|---|
| ★ The artboards | **8 `.dc.html` + 8 PNGs present, and UNTRACKED.** `git ls-files` returns 0. M10a's were untracked too and entered the tree at Step 0 — **do the same here, in your Step 0 commit.** The wave's acceptance is a screen beside its artboard; the artboard must travel with the wave |
| The six screens today | `materials/[materialId]` **61** · `rate` **164** · `propose` **91** · `propose/[id]` **228** · `members/[id]` **197** · ★ **`/app/members` has NO `page.tsx`** |
| ★ `/app/members` | it has `error.tsx` and `loading.tsx` **and no page** — boundaries around nothing. `SCR-019` is the page that was never built (`M10b.md` §5 says so). Check whether those two boundaries still suit the page you build, rather than assuming they do |
| ★ `page-viewer` already exists | `src/components/viewer/page-viewer.tsx`, **191 lines**, importing only `ui/button` and `ui/panel`. `M10b.md` §7 asks for a **`ui/page-viewer` primitive**. **Settle the relationship in `DEC-213` before anyone writes code**: is the existing file moved into `ui/`, rewritten there and deleted, or kept as the screen's composition over a new primitive? Do not end the wave with two things called page-viewer |
| The four new primitives | `star-input`, `stepper`, `page-viewer`, `badge-medallion` — none in `src/components/ui/` |
| ★ The primitive gate | `ui/` holds **54** files; `tests/unit/ui-playground.test.ts` asserts **`>= 53`**. Four new takes it to **58** — **raise the number in the same commit** (`DEC-199` §5.27) |
| Migrations | **none expected.** Every screen here reads tables that exist. ★ If one is needed, it carries a `REQ-*` in `01-prd.md` and names **org_id, RLS, the full policy set, a matching grant for every policy, and its test** — `0002` exists solely because `0001` forgot a grant |

## The wave — six screens, four primitives, one PR unless you measure otherwise

`SCR-013` viewer (phone + desktop) · `SCR-015` rate · `SCR-017` propose · `SCR-018` my proposal ·
`SCR-019` directory · `SCR-020` profile (phone + desktop).

★ **Count it against `TEAM.md`'s wave sizes before you commit to one PR.** Wave 18 was nine screens
in two PRs and that was right. Six screens with four new primitives may fit one; if it does not, split
**`013` + `015` + `019`** from **`017` + `018` + `020`**, and ★ **base the second on `main` from the
start** — a stacked PR whose base is deleted on merge is auto-closed and cannot be retargeted
(PR #36, 2026-09-30).

## ★ Four things in this batch that are easy to get subtly wrong

1. ★★ **The viewer's direction model, not a mirrored icon** (`M10b.md` §1). «Next» advances **in the
   reading direction — leftwards in Arabic**: the next control sits at the **inline-end**, its glyph
   points left, and on desktop **← is next, → is previous**. The thumbnail rail is at the
   **inline-start**. This is the one `09` singles out as the thing that gets missed, and a mirrored
   chevron with unmirrored behaviour passes every test while being backwards to a reader.
2. ★★ **Stars fill from the right** (`M10b.md` §2) — a `dir="rtl"` row where star 1 is rightmost,
   selection fills rightmost-first, hover previews the same way, and **the arrow keys follow the
   visual axis**: → decreases, ← increases. Each star is a real `radio` in a `radiogroup` with the
   count read back, not a div with a click handler.
3. ★ **The anonymity notice tells the whole truth** (`M10b.md` §2): `ratings.form.anonymityNotice`
   with `min` interpolated **and the org-admin exception** (D36, OQ-009). A notice that says
   «anonymous» without the exception is the product lying to a member about who can see their words.
4. ★ **Tiering is the DAL's, never the component's** (`A33`, `03` §5.1b). The directory shows tier-1
   fields because **the DAL returns only those**, not because the component omits them. A component
   that filters is a component that leaks the day someone renders a different field.

## Explicitly out

Stories (`DEC-205`, still next after this) · the hub and the two leaderboards, `SCR-021`–`028`,
**batch C** · every console and studio route · **the five public routes** and anything
`tests/unit/public-graph.test.ts` protects · photo tagging, anywhere (`09` SCR-020) · the source PDF
ever being fetched by the browser (`REQ-MAT-007`).

## Carried, and not yours to close

★ **The hard-load duplicate** — `DEC-201` §3 / `DEC-204`, re-measured by wave 18 at **26 of 48 on the
rebuilt `/app`** against `main`'s 4 of 48: **worse, not better**, with the accessibility tree clean on
both. ★ **`/app/me/points` and `/app/leaderboards` are owed by M10c**, and none of this wave's six
routes is in `DEC-204`'s table — **so do not re-measure, and do not let the finding drift into a
screen you rebuilt.** · `DEC-194`'s two gates stay carried together · `DEC-186` §4's overshoot
ceiling is open with the owner.

## Definition of done

The usual — `tsc`, `lint` zero errors (**grep `problems`**), `npm test`, `test:rls`, e2e,
**`qa:contract` untouched**, `qa:appearance`, `visual`, `parity`, `policy-diff`, `trace`,
**`ui-lint --strict` with no allowlist**. Arabic authored in `messages/ar/` first, `<bdi>` on every
interpolated name, title and code, Western numerals only, logical properties only.

**And five this wave adds:**

1. ★★ **Every screen captured at 390 — and at 1280 for `013` and `020` — beside its artboard, opened
   by you.** Regions in the artboard's order, primitives by the names in §7. This is the acceptance.
2. ★★ **A kept-behaviour table per screen** (`DEC-208`): what survived the delete, and the `REQ-*`
   that made it survive. Wave 18 found three dropped behaviours this way.
3. ★ **The viewer's direction proved by a test, not by inspection** — a case asserting that «next»
   advances the page and sits at the inline-end in `ar`, and that `←` is next on desktop.
4. ★ **The download control is absent, and so is the URL, when `allow_download` is false**
   (`07` §6) — proved by a test that a denied member receives no signed URL, not merely no button.
5. ★ **`qa:contract` and the register-form fingerprint unmoved.** None of these six is a public route;
   confirm that before you touch anything, and if a shared primitive changes, prove the five did not.

## How it ends

`STATUS.md` updated, the PR(s) open, **the owner merges**. If this wave carries no migration there is
nothing to rehearse — say so plainly in the owner's order rather than leaving the step in. ★ Railway
still needs the manual `railway service source connect` after the merge, **the fourteenth**
consecutive time; wait for a status with **no suffix**. ★ Read CI from the run's own conclusion on the
PR head (`DEC-192`). ★ The owner's acceptance is the phone: **each rebuilt screen beside its
artboard.**

★ **Still owed and not yours:** wave 16's phone check of the five moments, never run.
