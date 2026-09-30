You are the **wave-18 lead** for كريم معرفة, and this is **M10a — the first batch of real screens
rebuilt to a design.** Every wave before this one built the language; this one speaks it.

**State.** `main` is `badab40e` — wave 17 merged (PR #35, `DEC-199`…`DEC-202`), wave 17b merged
(PR #37, `DEC-203`, `DEC-204`). Production is at **`0163`**; migrations start at **`0164`**; the next
decision is **`DEC-205`**; the next free ids are **`REQ-UIX-054`** and **`STORY-UIX-039`**. M0–M19 are
done. This wave claims **M20**.

**Read in this order.** This brief · **`docs/design/screens/M10a.md` in full** · **the thirteen
artboards** in `docs/design/screens/m10a/*.dc.html` — open each in a browser, ignore the `support.js`
line; the PNGs in `png/` are for reference, the HTML is the source of truth for layout, sizes and copy ·
`docs/plan/notes/wave-17-lead.md` · `docs/design/README.md`, `00-direction.md`, `04-components.md`,
`05-stories.md`, `06-decisions-proposed.md` · `DECISIONS.md` **`DEC-183` §4, `DEC-195`, `DEC-199`
§2 §5 §7, `DEC-203`** · `16-ui-redesign.md` §3.1, §5, §6, §7 · `09-sitemap-screens.md` §3, §4, §8 ·
then `STATUS.md`, `CLAUDE.md`, `TEAM.md` §1–§3.

---

## ★★ The rule that governs every story in this wave — `DEC-199` §2

> **A screen is REBUILT to its design, never restyled.**

Each screen is built from its artboard: **its regions in the artboard's order**, its copy from
`messages/ar/` (★ strings in `M10a.md` authored in Arabic first, `en/` after), its primitives by the
names in `M10a.md` §10. **Nothing in the current page file survives by default.** What survives is
the data layer, the server actions, the tests of behaviour, and every `REQ-*` the screen already
satisfies.

★ **If a story you write reads «restyle X to match», the story is written wrong.** Delete it and
write the rebuild.

## ★★ Four owner rulings, 2026-09-30 — recorded, not to be re-derived

1. **Wave 18 is M10a, not stories.** `DEC-199` §7 put M20 (stories) first; the owner reverses it for
   this one step, because **the shell and the event page are what every later screen inherits.**
   Stories become wave 19. ★ **In this wave the `story-ring` row on `010` and «شاهد القصة» on the live
   `012` render `05-stories.md`'s ring STATES only** — live · unseen · seen · none, computed from
   session activity — **and the ring opens nothing.** The viewer lands with M20. Log as **`DEC-205`**,
   with the amended order: **M10a · stories · the rest of M21 · console · studio · public site last.**
2. **Five phone tabs and a desktop nav rail + game rail** — `M10a.md` §0 and §11's `DEC-NEXT-16`.
   Supersedes `16` §6.1 / `REQ-UIX-021`'s «two rows on desktop». Search stays in the bar; staff links
   stay in the ruled section.
3. **Home is the feed** (`DEC-NEXT-6`, accepted). `/app` becomes its own page; `/app/sessions` stays
   the canonical browse URL (`DEC-112`, `DEC-130` unchanged).
4. **The event hero is the whole poster at 4:5**, phone and desktop. `16` §4.2.2's cropped band is
   retired. The «+50 عند الحضور» sticker belongs to the **poster template**, not to a component
   (`REQ-UIX-024` unchanged).

★ **Anywhere else the artboards and `docs/plan/` disagree, list it in `DEC-205` the way `DEC-183` §4
and `DEC-199` §5 do — one line per deviation, which document wins, why. Never pick a side silently.**

## What is measured, so you do not re-derive it

| | |
|---|---|
| `src/components/ui/` | **50 files.** `tests/unit/ui-playground.test.ts:117` asserts `>= 49`. **Four new primitives take it to 54 — raise that number in the same commit** (`DEC-199` §5.27) |
| The four new primitives | `week-hud`, `feed-item`, `action-bar`, `attendee-stack` — **none exists** |
| ★ `/app` today | **19 lines**, and it *renders* `SessionsTimeline` rather than redirecting. Ruling 3 makes it its own page; the timeline component stays `/app/sessions`' |
| The screens, as they stand | `sign-in` 70 · `choose-org` 68 · `no-access` 76 · `s/[id]` 221 · `/app` 19 · `/app/sessions` 21 · `sessions/[id]` **389** · `check-in` 153 · `host` 206 |
| The shell | `src/components/shell/` — `shell-frame`, `tab-bar`, `shell-routes` (`IMMERSIVE` at `:19`), `account-menu`, `search-entry`. The bar already hides on immersive routes; **do not re-invent that** |
| ★ Feed data | `member_badges`, `points_balances`, `streak_awards` (`0027`), `company_points_ledger` (`0081`), `session_posters` (`0055`) **all exist**. ★ **`feed_announcements` does NOT.** It is this wave's one table, at `0164`, and it needs a `REQ-*` and a story |

## The wave — and settle the split at Step 0

Thirteen artboards, nine screens, four new primitives and a migration is **above `TEAM.md`'s wave
size**. ★ **Plan two PRs, and say so in `DEC-205`:**

- **PR A — the frame.** The shell (five tabs, the desktop rails), `SCR-002`/`003`/`004`, `SCR-007`,
  `SCR-010` (feed, phone + desktop), `SCR-011`, the four new primitives, `0164`.
- **PR B — the event.** `SCR-012` in its three phases plus desktop, `SCR-014`, `SCR-016`. **B needs
  A's shell**, so B is cut from A's branch **and retargeted to `main` before A merges** — ★ see the
  trap below; wave 17b lost a PR to exactly this.

If you judge one PR is safer, say why in `DEC-205` and size it against `TEAM.md` rather than against
optimism.

## ★★ The trap that cost wave 17b a PR — read this before you cut a branch

**A stacked PR whose base branch is deleted on merge is auto-closed by GitHub and cannot be reopened
or retargeted.** `reopenPullRequest` fails outright and its green CI counts for nothing. PR #36 died
this way and had to be recreated as #37.

**So: either base PR B on `main` from the start and let it carry A's commits, or retarget B to `main`
BEFORE merging A with `--delete-branch`.** `STATUS.md` records this under «After the merge»; it is the
owner's step to get right and yours to state in the order.

## Stories — one per screen, each with

its `REQ-*` ids · **the artboard it is built from, by filename** · the states in `M10a.md` that are
**not drawn** and must still be built · its primitives by name · its definition of done: **the screen
matches its artboard at 390 and at 1280 in a capture you opened**, `ui-lint --strict` passes, the
scope tests pass, `qa:contract` is untouched.

★ **The four new primitives are stories too** — each with a gallery section and a scope test, as
wave 15 and 17 did. ★ **The three prop additions** — `avatar`'s team ring, `card`'s `post` and `row`
variants, `session-cta`'s phases as drawn — are add-only on existing primitives and must not change
any existing call site's rendering.

## The five moments — confirm, do not add

`M10a.md` names which fire where. Check each against `DEC-195`'s **once-per-occurrence** keying and
its **named static state**. ★ **There is no sixth moment.** The wrong-code shake on `014` is **input
feedback, not a system-failure animation** — say so in the story so `REQ-UIX-053`'s reviewer does not
bounce it, and give it the reduced-motion form `M10a.md` names (border coral + message).

## Explicitly out of this wave

`/app/members` (`SCR-019`, batch B) · the viewer (`013`) · rate (`015`) · propose (`017`/`018`) ·
profile (`020`) · the hub (`021`–`028`) · **every console and studio route** · **the five public
routes** and anything `tests/unit/public-graph.test.ts` protects · the stories **viewer** (M20).

## Carried, and not yours to close

`DEC-201` §3 / `DEC-204` — **the duplicate on hard loads**, 24 % against `main`'s 6 %, cause unknown,
with the **assistive-technology question open**. ★ This wave rebuilds three of the routes it was
measured on, so **re-measure it on the rebuilt screens and record the rate** — do not fix it, and do
not let it silently disappear into a rewrite. · `DEC-194`'s two gates (the trigger-definer ACL sweep,
the Storage-predicate gate) stay carried together. · `DEC-186` §4's `1.08` overshoot ceiling is
**open with the owner** and not yours to close.

## Definition of done

The usual — `tsc`, `lint` zero errors (**grep `problems`**), `npm test`, `test:rls`, e2e,
**`qa:contract` untouched**, `qa:appearance`, `visual`, `parity`, `policy-diff`, `trace`,
**`ui-lint --strict` with no allowlist**. Arabic authored in `messages/ar/` first, `<bdi>` on every
interpolated title, name and code, Western numerals only (`DEC-124`), logical properties only.

**And four this wave adds:**

1. ★★ **Every screen captured at 390 and, where the artboard has one, at 1280 — beside its artboard,
   opened by you.** Not «looks close»: the regions in the artboard's order, the primitives by name.
   This is the wave's acceptance and it is the first time the product is compared to a drawing.
2. ★ **`qa:contract` and the register-form fingerprint unmoved.** The five public routes do not move;
   `SCR-007` is `/s/[id]`, which is **not** one of them — confirm that before you touch it.
3. ★ **The duplicate-on-hard-load rate re-measured** on the rebuilt `/app`, `/app/me/points` and the
   boards, and recorded against `DEC-204`'s table.
4. ★ **No `.dc.html` in the bundle and no prototype class name in `src/`.** Add the gate if one does
   not exist; `docs/design/screens/` must not reach the build.

## How it ends

`STATUS.md` updated, the PR(s) open, **the owner merges**. This wave carries `0164`, so the owner
rehearses against a production schema dump, pushes, merges, then reconnects Railway — **the
thirteenth** consecutive time; the durable fix is the dashboard's Settings → Source. ★ Wait for a
status with **no suffix**. ★ Read CI from the run's own conclusion on the PR head (`DEC-192`).
★ And the owner's acceptance is the phone: **the rebuilt screens beside their artboards, on a device.**
