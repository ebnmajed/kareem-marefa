You are the **wave-17 lead** for كريم معرفة. Wave 16 is merged (PR #34, `65ca7a7a`), production is at
`0163`, the worker is current, CI is green, and there are no open PRs. Migrations start at **`0164`**;
the next decision is **`DEC-199`**; this wave claims **M19**.

**Read in this order.** This brief, then `docs/plan/notes/wave-15-lead.md` and `wave-16-lead.md` (the
programme so far), `docs/design/` **`00-direction.md` and `04-components.md` in full**, then
`DECISIONS.md` **`DEC-183`** (the scope ruling, §4.2), **`DEC-186`**, **`DEC-188`**, `DEC-195`,
`DEC-198`. Then `STATUS.md`, `CLAUDE.md`, `TEAM.md` §1–§3.

---

## ★★ Why this wave exists — the owner opened the app on a phone and called it a Frankenstein

**The owner is right, and the cause is measured.** Two things produce it, and only one is a defect.

**1 · Eight pre-existing primitives were never migrated, and the design's own plan never named them.**
`07-tasks.md`'s wave-1 order lists about twenty of the thirty-seven. These eight are absent from it
and have **no playground treatment at all** — no scope test, no reference to the scope:

| | lines | where it shows |
|---|---|---|
| `page-header` | 53 | **every screen's title** |
| `prose` | 18 | **every screen's body text** |
| `link` | 24 | **every link** |
| `icon-button` | 47 | **every icon button** |
| `section-header` | 40 | **every section heading** |
| `submit-button` | 29 | **every form's submit** |
| `reorderable-list` | 132 | the survey, the email studio |
| `icons` | 666 | ★ **every glyph, and the frozen public routes import it** |

★ **Read that column again.** A screen inside the scope gets the playground's card, button and field,
and then its **heading, its text and its links render in the old design**. That is the Frankenstein,
it is on every screen, and it is why the gallery reads as mixed.

**2 · The scope is applied to five surfaces and nothing else, which is the plan, not a fault.**
`SCR-012`, `SCR-014`, the points head and the two boards. Everything else is old **by design** —
`DEC-183` §4.2(f). The owner should not be told this is a bug; it is the programme mid-flight.

★★ **And a correction the reviewer made to the owner, which you should not re-derive:** the scope is
**not** a dual-mode implementation. `globals.css:178` says it — *«the playground is a SCOPE, built the
way `.theme-dark` is built»*. A primitive reads a semantic token; the scope redefines the token. Only
**87 lines of 5,862** in `ui/` carry an explicit playground variant, for structural differences a
token swap cannot express. **There is very little to delete and the architecture is sound.**

## ★★ The owner's ruling, 2026-09-29 — and what it does and does not licence

> **«All the current members and data is for testing. You can break the app completely if it is
> needed.»**

**What it licences:** the app behind sign-in may look broken while this lands. Do not spend a commit
keeping a screen presentable mid-migration. Do not carry a compatibility path for the app's old look.

★★ **What it does NOT licence, and you must not read it as licence:** **`registrations` holds 20 real
pre-launch signups** — invariant 2, `DEC-002`. Never dropped, never altered, never read by platform
code. **The register form's appearance may move; its action, field names, ids, validation and no-JS
path are the contract and are byte-identical.** The reviewer flagged this to the owner and the owner
did not overturn it.

## ★★ ANSWERED by the owner, 2026-09-30 — one visual language, everywhere. Do not re-open it.

> **«A full redesign for all the web app and the marketing page and everywhere.»**

**Record it as `DEC-199` §1.** The playground is **the product's only visual language**. No screen
keeps the old one, and **no compatibility layer for the old look survives this programme.** The
option of a narrower `/app`-only move is withdrawn; the owner chose everywhere.

★ **The admin console is IN, at the token level, and the design already said how.** The owner asked
whether the design covers admin and whether it should be carved out and redesigned separately. It is
not covered — and every mention of admin in `docs/design/` is an **exclusion**, which is a position
rather than a gap:

- `04-components.md:23` — «`data-table`, `reorderable-list`, `file-drop` and the rest of the console
  primitives | **tokens only; no animation**»
- `03-motion.md:12` and `06-decisions-proposed.md:17` — «tables, lists, **admin surfaces** and error
  states never animate»
- `05-stories.md:94` — «Admin: nothing.»

**So admin takes the palette, the radii and the type, and takes none of the playground's motion,
objects or stickers.** That is a register difference, not a second design, and wave 15 already built
it that way — its order ended with «the console primitives (tokens only)».

★ **Why this beats carving admin out**, and say it in `DEC-199` so it is not revisited: freezing
admin at today's values would need a compatibility layer **for admin** — the same scope mechanism
pointed the other way — and staff would work in what reads as a different product. One language with
a sober register for staff is the ordinary answer and it costs nothing extra.

★ **A separate admin pass later is about LAYOUT, not visual language** — data density, table
ergonomics, the rail — and it is not a blocker for anything in this programme. Note it as available,
not scheduled.

★★ **The public site is in scope and still moves LAST** (`DEC-NEXT-5` A, `DEC-183` §1). «Everywhere»
settles *whether*, not *when*, and the ordering stands for one practical reason: it is the only
surface with a frozen behavioural contract and **20 real pre-launch signups** behind it. Until its
wave, `qa:contract` and the register-form fingerprint stay pass/fail.

## ★ What this means for THIS wave's token move

### The mechanism, now that the destination is settled

**Does the playground move to `:root`, or does the scope stay?**

The owner's instinct is one design, not two. With the app's old look no longer worth protecting, the
scope's only remaining job is **the public site**, which `DEC-NEXT-5` option A says is re-skinned
**last**.

- **A — the playground at `:root`, everywhere, now.** One design. No scope class, no «outside the
  scope» values, no way to be half-and-half. ★ **But the five frozen routes import `button`, `field`,
  `input`, `textarea` and `icons`, so the public site changes the day this merges** — out of the
  design's own order. `visual` and `qa:appearance` stop being pass/fail and become a deliberate
  re-baseline; **`qa:contract` and the register-form fingerprint stay pass/fail and must not move.**
- **B — the playground at `:root` for `/app`, the public site keeps today's values until its wave.**
  Still one design everywhere a member looks, the public site unchanged, and `DEC-NEXT-5`'s order
  intact. Costs one narrow compatibility layer instead of a general one.

★ **Recommend B to the owner and say why in one line**: it gives the owner the single design they
asked for, everywhere they were looking when they said «Frankenstein», without re-skinning the public
site three waves early and without turning the one gate that has protected it through four waves into
a re-baseline. **But it is the owner's call, and A is defensible.** Log it as `DEC-199` §1.

## The wave

| | |
|---|---|
| **lead** | `DEC-199` and the Step 0 ruling · ★ **the eight primitives**, to `04-components.md`, with the same rigour wave 15 used: a jsdom test, an RTL check and a gallery entry each · `icons` last, because the public routes import it and it is 666 lines · the token move that the ruling decides · gates, `STATUS`, the PR |
| `content` | the primitives it owns among the eight and their consumers; the gallery entries; the 390 px captures |
| `console` | the admin surfaces the eight reach — `page-header`, `section-header` and `submit-button` are on every admin screen — and the six data-dense primitives' behaviour under the new values |

★ **Two tracks, not four.** This wave is narrow and mostly the lead's; `04-components.md` is the
specification and there is little to plan.

## ★★ The sentence that decides whether this ends as one product or two

**Write it into `DEC-199` and into every screens-wave brief from here:**

> **A screen is REBUILT to its design, never restyled.** Applying the scope to existing markup
> produces the right colours on the wrong structure, which is the Frankenstein the owner saw, made
> permanent. When the per-screen designs arrive as `docs/design/screens/<SCR-id>.md`, the screen is
> built from that document — its layout, its hierarchy, its affordances — not patched until it looks
> close.

## Not this wave

Stories · the feed items · proposal voting · the weekly leaderboard · the streak rule · the screens
themselves · the public site's re-skin · the desktop shell. **And the two carried gates stay carried,
together** (`DEC-194`): the trigger-definer ACL sweep and wave 14's Storage-predicate gate.

★ **One carried item to raise with the owner, because it is now costing builds:** the display face is
fetched from Google Fonts at build time, and `DEC-198` §5 records that this **failed four CI builds in
a row on 2026-09-29**. The files are already self-hosted in `packages/fonts/` by SHA-256. Self-hosting
the web face too is small and stops CI failing for reasons unrelated to the code. Put it to the owner
with a one-line cost.

## Definition of done

The usual — `tsc`, `lint` zero errors (**grep `problems`**), `npm test`, `test:rls`, e2e,
`qa:contract`, `qa:appearance`, `visual`, `parity`, `policy-diff`, `trace`,
**`ui-lint --strict` with no allowlist**. Arabic authored in `messages/ar/` first, `<bdi>` on every
interpolated value, Western numerals only.

**And three this wave adds:**

1. ★★ **Every one of the 37 primitives has a playground design.** Not «migrated where the plan named
   it» — all thirty-seven, proved by a test that enumerates `src/components/ui/*.tsx` and fails on one
   that has no playground treatment. **That test is the thing that stops this recurring**, and it is
   worth more than the eight fixes themselves.
2. ★ **`qa:contract` and the register-form fingerprint unmoved**, whichever way Step 0 rules. The
   appearance gates move only if the owner chose A, and then deliberately, in one commit.
3. ★ **The gallery opened by the owner, not by you.** The wave's real acceptance is the owner looking
   at `/ar/ui` on a phone and saying whether it now reads as one design. Say so in `STATUS` and ask
   for it in the closing report.

## How it ends

`STATUS.md` updated, PR open, **the owner merges** — rehearsal first if this wave carries a migration,
then push, merge, and reconnect Railway (**the twelfth** consecutive time; the durable fix is the
dashboard's Settings → Source). ★ Wait for a status with **no suffix**. ★ Read CI from the run's own
conclusion on the PR head (`DEC-192`).
