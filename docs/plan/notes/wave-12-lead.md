You are the **wave-12 lead** for كريم معرفة. The design milestone **M9–M13 is complete and live** —
eleven waves, every route on the design system, the public site re-cut, `ui-lint` strict with no
allowlist, the accessibility sweep at 62 routes / 0 findings. `main` is at `b3f8d76`, production is
at migration `0144`, and there are **no open PRs and no wave map in force**.

★★ **This is new scope, not a planned milestone.** `DEC-085` therefore applies twice over: write the
ownership map into `CLAUDE.md` and all ten `.claude/agents/*.md` **and log the scope as a
`DECISIONS.md` entry first**, before anyone is spawned. Nothing in `14-roadmap.md` covers this wave.

**Read in this order.** `docs/plan/STATUS.md` — the block at the top, then the wave-11 record and
`DEC-171`'s table of what was deliberately left. Then `DECISIONS.md` `DEC-160` … `DEC-172`,
`CLAUDE.md` (★ **invariant 1 is re-cut** — `DEC-167`), `TEAM.md` §1–§3.

## The wave — two owner-reported defects, both small, both with real decisions inside

### 1 · A session's presenters cannot be changed after it is created

**Measured, not assumed.** `create_session()` (`0020`) inserts the proposer as presenter with
`accepted = true` and any co-presenters with `accepted` false. **After that there is no writer.**
The eight `*presenter*` functions in the chain — `is_presenter_of`, `presenter_is_same_org`,
`presenters_within_limit`, `proposal_presenters_addable`, `session_presenter_declined`, the two
notifiers, the poster hook — are **all guards, notifiers and predicates. None adds or removes.**

`RemovePresenter` (`src/components/sessions/remove-presenter.tsx`) exists but is wired only to
`/app/propose/[id]` — the **proposal**. Once the proposal becomes a session the control is gone, and
`admin/sessions/[id]/schedule` contains **zero** presenter references.

★ **The owner's worry about points does not apply, and that is the useful finding.** Presenter
points fire from `proposals_award_points` — a trigger on **completion** (`0031:84`), not on any
action at creation. So changing presenters before a session completes costs nothing: nothing has
been paid. **Do not move the award.**

**What to build:**
- Two RPCs — add and remove — reusing `presenter_is_same_org()`, `presenters_within_limit()` and the
  existing accept/decline flow. Do not rebuild any of them.
- The control on the admin session screen, using the **member picker** and **`RemovePresenter`**,
  both of which already exist. This is composition, not new UI.
- ★ **The after-completion rule.** A presenter added after the award has run must still be paid; a
  presenter removed after it must be reversed. **`0087`'s compensating entry is the precedent** —
  `points_ledger` is append-only with `service_role` revoked (invariant 9), so a removal is a
  reversing row with its own idempotency key, never a delete. Wave 9 proved this shape for
  attendance; follow it rather than inventing a second one.
- Who may do it: staff. A presenter removing themselves is `session_presenter_declined()`'s existing
  path and is **not** this.

### 2 · The poster is cropped everywhere it is shown

**The cause is one line.** `CardMedia` renders the image with **`object-cover`**
(`src/components/ui/card.tsx:173`), which fills the box by cutting whatever does not fit. On a
narrow media column a 4:5 poster loses its edges — the owner's screenshot shows the title sliced
mid-word on the timeline at 390 px, and it is cropped at desktop too.

★ The file's own comment says *"a 16:9 crop would cut a designed poster's typography"*. **The
reasoning was right and the implementation defeats it**: `object-cover` crops regardless of the
aspect chosen, once the column is narrower than the image.

**The decision inside it, which is why this is not a one-line patch.** `object-contain` shows the
whole poster but letterboxes it; making the column genuinely 4:5 changes how much of the card the
poster earns. **That is a design call — make it once, deliberately, and write it down.** A poster is
a designed artefact whose typography is the point; a crop that cuts its title is worse than empty
space beside it.

**Scope it across every surface**, not the one screenshotted — `CardMedia` is used by:
`browse/session-card.tsx` · `sessions/event-hero.tsx` · `posters/picker.tsx` ·
`posters/session-poster.tsx` · `designer/template-library.tsx` · `s/[id]/page.tsx` ·
`sessions/[id]/page.tsx` · the three moderation cards · the `(dev)` gallery.
Aspects in use today: **three `16/9`, two `4/5`**. Decide what each surface should show and why.

★ **`npm run visual` covers `s/[id]`'s public card**, and the `(dev)` gallery is the design system's
own baseline. Both will move. Re-baseline deliberately, in the same commit as the change.

## Not this wave — the owner's remaining list, unstarted

Per-session settings consolidated (scheduling, materials, poster, presenters, tasks, certificate are
scattered) · deleting a session with its awarded points · the photo gallery with a lightbox · the
wordmark navigating to marketing rather than `/app` (`app/layout.tsx:160` imports the **marketing**
`Wordmark`) · Google avatars fetched but discarded (**`avatarUrl={null}`, `app/layout.tsx:199`**) ·
the gamification layer · the prose pass (**421 strings ≥ 60 chars, ~52,600 characters**; `STATUS`'s
*Screens whose meaning depends on a paragraph* is the inventory) · `DEC-100`'s motion system, which
was specified in M9 and never built.

**Name each in every agent file's never-touch list.** They are the owner's next decisions, not this
wave's scope.

## Definition of done

The usual — `tsc`, `lint` zero errors (**grep for `problems`**), `npm test`, `test:rls`, e2e,
`qa:contract` **and** `qa:appearance` both green, `visual` re-baselined deliberately where the poster
moved, `parity`, `policy-diff`, `trace`, **`ui-lint --strict` with no allowlist** — it is empty now
and must stay empty. Arabic authored in `messages/ar/` first, `<bdi>` on every interpolated value.

**And two this wave adds:**

1. ★ **A 390 px RTL capture of the timeline card showing a whole poster**, opened by you, beside the
   owner's screenshot of the cropped one. The defect was reported from a screenshot; it closes with
   one.
2. ★ **A presenter added and removed after completion, with the ledger proving it** — the award
   paid for the addition and a compensating row for the removal, balances recomputable either way.

## How it ends

`STATUS.md` updated, PR open, **the owner merges**. If this wave carries migrations, the owner
rehearses against a production schema dump, pushes, then merges, in that order — and **checks
Railway by hand afterwards**, which has needed a manual reconnect after **six** consecutive merges
and whose durable fix is the dashboard setting, not the CLI.
