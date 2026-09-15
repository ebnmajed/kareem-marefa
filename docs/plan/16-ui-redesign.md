# 16 — إعادة بناء الواجهة · The UI/UX rebuild

**Status:** **`settled`** — approved by the owner 2026-09-15 · **Owns:** the design system, the shell, the information architecture, the
loading and feedback model, the form model, the session-lifecycle vocabulary, the studio (designer
and certificates) workflow · **Cites:** `01-prd.md` for every requirement · **Supersedes no
document** — `09-sitemap-screens.md` keeps the screen inventory and this document specifies what
those screens become.

> This is the design milestone deferred at Launch by **DEC-068**, opened by the owner on
> 2026-09-15 with fifteen asks. It is a **rebuild, not a refinement**: the current app UI is
> replaced, not adjusted (the owner's instruction, 2026-09-15 — «do not build on the current
> UI/UX. Rebuild from scratch»).

---

## 0. The three framing decisions

Taken with the owner before this document was written, and logged as `DEC-069`:

| | Decision |
|---|---|
| **Scope** | **The app *and* the marketing site, one system.** The frozen public contract (invariant 1 — `/`, `/ar`, `/en`, `/ar/register`, `/og.png`) is **deliberately unfrozen** and re-baselined. See §14 — this is the one part of the plan that touches a live page serving real visitors, and it is sequenced last for that reason. |
| **Deliverable** | This document plus a visual canvas of the key screens at phone and desktop, in Arabic RTL, approved before code. **The canvas:** <https://claude.ai/artifact/3X5NcyyjigheNJG4M1wKKR> — 14 artboards over three pages (الشاشات · النظام والنماذج · الاستوديو). |
| **Rollout** | **In place, group by group.** The system and the shell land first; screens are then replaced in groups, each group a mergeable PR that ships. `main` stays deployable (invariant 4) at every step. No `v2` tree, no long-lived branch, no flag. |

**What does not change.** The logo and the wordmark; the navy/silver palette; Arabic-first
authoring (invariant 10); the DAL, RLS, migrations, worker and renderer engine; every hard
invariant except the first, and that one only in the controlled way §14 describes.

---

## 1. What is actually wrong — the audit

Read the code before the critique. Every claim below is a file, and most are a line.

### 1.1 There is no design system

`src/components/ui/` contains **three files**: `button.tsx`, `dialog.tsx`, `icons.tsx`. There is no
input, no select, no card, no badge, no field, no table, no tabs, no menu, no toast, no empty
state, no avatar, no skeleton.

The consequence is measurable, and worse than the first draft of this plan claimed. The string
`rounded-field border border-edge-strong` — the house text input, copied — appears in **65 files**.
`const FIELD = "mt-2 block w-full …"` is re-declared **14 times**, in `propose/proposal-form.tsx:27`,
`admin/venues/venue-form.tsx:9`, `admin/settings/settings-form.tsx:10`,
`admin/categories/category-form.tsx:9`, `admin/companies/company-form.tsx:9`,
`admin/sessions/direct-session-form.tsx:16`, `admin/sessions/[id]/schedule/schedule-form.tsx:26`,
`me/privacy/forms.tsx:11`, `platform/orgs/new/org-form.tsx:17`, `platform/orgs/org-controls.tsx:23`,
`platform/orgs/[id]/domains/forms.tsx:13`, `platform/impersonate/impersonate-form.tsx:26`,
`platform/templates/promote-form.tsx:15` and one more. **A change to the focus ring is a
sixty-five-file edit today**, which means in practice it is never made.

### 1.2 The shell is a row of text links

`src/app/[locale]/app/layout.tsx` is one 56 px bar: wordmark, **three always-visible text links**
(home, sessions, profile — `:93-108`), the bell (`:113`), then up to **five** `hidden md:block`
secondary links (`:114-120`) — so three items on a phone, eight on a desktop — and, below `md`, a
`<details>` disclosure holding everything else, including both consoles and sign-out.
There is **no search anywhere in the navigation** of a product whose core object is a searchable
session. There is no account menu, no breadcrumb, no page header pattern, no visual difference
between a member link and an admin link beyond font colour.

### 1.3 Pages are documents, not interfaces

The event page (`app/sessions/[id]/page.tsx`, 335 lines) renders its facts as a `<dl>` (`:106-184`)
— **five** label/value pairs stacked vertically, of which only **three render unconditionally**
(when, where, language; presenters and category are conditional), each a `text-label` over a
`text-body`. It is correct, accessible, and reads like a form letter. The browse card shows title, abstract, date, level,
language as flat text. Nothing is scannable; everything is prose.

### 1.4 There is one loading state in the entire product

`find src -name "loading.tsx"` returns **one** file. `grep -rn "Suspense" src/` returns **nothing**.

This is worse than cosmetic. Every `/app/**` route is dynamic — the DAL touches `cookies()` (DEC-013)
— and Next 16 **skips prefetching for a dynamic route that has no `loading.tsx`**
(`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:88`). So the
absence of loading files is not just a missing spinner: it is the reason navigation blocks on the
server round trip with no feedback at all. Adding them buys partial prefetching, immediate
navigation, *and* the loading UI, in one change.

### 1.5 The thirteen asks, verified against the code

| # | The owner's ask | What the code actually does |
|---|---|---|
| 1 | Coursera-grade UI/UX, keep logo and colours, keep responsive, add Preply-style loading | §1.1–§1.4 above |
| 2 | Co-presenters should be a **search box** | `propose/proposal-form.tsx:185` renders **every org member as a checkbox list**. At 40 members it is a scroll trap; at 400 it is unusable |
| 3 | The **proposer** enters the information; the admin only changes settings | `create_session()` (`0020_session_creation.sql:64-68`, insert at `:75`) copies **title, abstract, category, level** — and, at `:86-93`, the accepted presenters. It copies nothing else. `target_audience` and `expected_duration_minutes` exist on `proposals` (`0010_m2_schema.sql:38-39`) and are **dropped on the floor**; the admin re-types duration at `schedule-form.tsx:89-107`, whose `defaultValue` is `initial.durationMinutes || "60"` — no prefill from the proposal |
| 4 | Finished/overdue sessions still offer registration | **Two defects, not equally severe.** (a) `rsvp-panel.tsx:18` returns null only when `state !== "published" && !myRsvp` (`:15` also returns null for a presenter), so a member holding a **confirmed** RSVP on a `completed`, `archived`, `in_progress` or `cancelled` session gets a **live** «إلغاء الحجز» form at `:64-75`. (b) Worse: a `published` session **past its start** with the clock job lagging still shows «احجز مقعدًا` **and the database allows the reservation** — `deadlinePassed` is computed only from `rsvp_deadline_at` (`lib/dal/rsvp.ts:52`), never from `starts_at`, and `reserve_seat()` checks only `state = 'published'` plus the deadline (`0014_rsvp_rpcs.sql:39-43`). **(b) is the real bug and §5.1's derived phase is the fix.** A third case — reserving on a `completed` session — needs a cancelled RSVP *and* a null deadline, and `reserve_seat()` then refuses `not_open`: a dead button, not a live registration |
| 5 | No UI for which fields were missed | The proposal form *does* have an error summary — and it is the only one. `role="alert"` appears in **39** files but the summary-plus-field-error pattern exists in exactly one form, the errors render in `text-fg-heading` (no colour, no icon, no marker), the summary items are **not links to the fields**, and required fields carry no visual marker |
| 6 | No visual signal that a session has ended | `browse/session-card.tsx:64-65` renders `cancelled` and `in_progress` as a bare `<p class="text-body-sm text-fg-heading">` — no chrome, no colour, no icon. **`completed` never reaches a member-facing surface at all**: the event page prints the state label only when `!published` (`page.tsx:96-97`) and `completed` is inside the published list at `:68`. It *is* labelled for staff — `admin/sessions/page.tsx:134,189` and the schedule page render «انتهت» — which makes the gap precisely a member-facing one |
| 7 | Staff should be able to **download** the poster and the uploaded images | Smaller than it looks, and the first draft of this plan got it wrong. **A signed-URL download already exists** — `designer/export-panel.tsx:71-75` renders `<a href download>` over `signExportUrl()` (`:38-40`), and `me/certificates/page.tsx:103` and `materials/[materialId]/download-button.tsx` do the same. What is missing is (a) **reaching it from the event page and SCR-043** rather than only from inside the designer, and (b) **photos, which have no download path at all** — nothing in `src/components/photos/` downloads anything |
| 8 | Bookmark and share a session | Bookmark exists **only on the browse card**; share exists **only on the event page**. Neither appears where the other does |
| 9 | Optional **objectives** field | `grep -rni objective src/ supabase/ docs/plan/01-prd.md` → **nothing**. Does not exist |
| 10 | A **survey** whose results only admin/moderator see | Does not exist. Ratings (`REQ-RAT-001…007`) are a different thing: two stars plus free text, anonymous, and **visible to the presenter** above a minimum count. A staff-only instrument is genuinely new |
| 11 | **Tags** | `tags` and `session_tags` exist with full RLS (`0037_m5_schema.sql:195`), `searchSessions()` matches against them (`search.ts:147`) — and **no screen creates, attaches or displays one**. `REQ-DSC-002` is unshipped UI on shipped data |
| 12 | The poster/certificate **studio** is confusing | The engine is sound — one renderer, iframe canvas, real bindings (DEC-017). The *editor* is a properties form: `editor.tsx:243` records that **dragging is deliberately absent**, so an admin positions a layer by typing numbers. `posters/picker.tsx` describes three paths in prose and gives a button for only one of them: «تلقائي» and «رفع» have **no control at all**. Of `REQ-DSG-022`'s feature set, **snapping is already built and unused by any pointer** — `editor.tsx:6` imports `snap`/`snapTargets`/`snapTargetsBlock` and `:250-253` applies them to every frame patch, so the maths is there and only number entry drives it. **Alignment guides and focal-point cropping are not built** |
| 13 | **Email templates** need a real visual designer and pre-made ones | `worker/src/mail/templates.ts` holds the 25 messages as **plain subject/body strings** — no heading, button, image or layout in any of them. `admin/emails` is a chip list of anchors, one input, **one** textarea, and **no preview of any kind**. `render.ts`'s HTML shell is correct and hard-coded; there is nothing an admin can design |

**Three of the thirteen are new product** — objectives, the survey, and the email block system. **Four are unshipped UI over shipped
data or requirements** (tags, focal-point crop, the DSG-022 feature set, the proposal fields).
**Six are design and workflow.** That ratio is why this is a design milestone with a small
migration tail, not a rewrite of the platform.

---

## 2. Reading the reference

Coursera is the stated reference. Taking a reference well means naming what transfers and what
does not.

### 2.1 What we take

| Coursera pattern | Why it transfers | Becomes |
|---|---|---|
| Persistent **search in the top bar** with a catalogue entry beside it | Our core object is a session that is already full-text searchable with Arabic normalisation (`REQ-DSC-003/004`) and has no way in | §4.1 the shell |
| **Rich result cards** — image, title, provider, rating, level, duration, one action | Every field is already in `searchSessions()` or one join away | §6.2 the session card |
| The **course page**: hero, stat strip, sticky enrol card, section sub-nav, "What you'll learn", "Skills you'll gain", instructor card | This is the event page's exact shape. "What you'll learn" **is** objectives (ask 9); "Skills you'll gain" **is** tags (ask 11) | §6.3 |
| **Faceted left rail** with counts, active filters as removable chips | `SearchFilters` already emits chips; the facets have no counts and no rail | §6.2 |
| **My Learning** as a first-class destination | `/app/me` exists and is a link list | §6.5 |
| One **primary action per view**, always the same colour and shape | We have `REQ-SES-013`'s "one primary action" already; it is not visually distinguished | §3 |
| **Progress and state made visual** — enrolled, in progress, completed | Directly answers asks 4 and 6 | §5 |

### 2.2 What we do not take

- **Coursera's blue.** The palette stays navy `#0B1220` and silver. The energy Coursera gets from a
  saturated accent, we get from contrast, density and photography — the poster art is already the
  most colourful thing on the page.
- **Its density on mobile.** Coursera is desktop-first with a compressed phone view. We are
  **phone-first in Arabic** (`REQ-NFR-009`, D5): a 390 px RTL screenshot is the review artefact for
  every screen, and the desktop layout is the enhancement.
- **Its commerce spine.** No price, no cart, no upsell, no "enroll for free" ambiguity. The
  equivalent slot holds capacity, deadline and the seat.
- **Ratings as social proof.** `REQ-RAT-004` makes ratings anonymous and withholds them below a
  minimum count. Stars belong to the presenter's own view and the staff console, **never** to a
  browse card.
- **Its empty-state tone.** Arabic is authored first (invariant 10). No Coursera string is
  translated into this product.

### 2.2a ★★ Where §2.1 took the shape without the scale

The list in §2.1 is right about *what* Coursera does well and wrong about *how much of it applies*.
Coursera's patterns are tuned to **seven thousand atemporal items with a long tail**. This is
**roughly thirty temporal ones with a near-term horizon**, where «متى؟» outranks every other
question a member has. Three of the borrows do not survive that difference, and each is corrected
where it is specified — §6.2, §6.6 and §6.3.

The general rule, because it will come up again: **a pattern that organises abundance becomes noise
under scarcity.** A facet that does not partition, a rail that holds three cards, a sticky
conversion panel on a screen with no conversion — each is Coursera's answer to a problem this
product does not have yet. **Revisit the faceted rail past ~200 sessions**, and not before.

### 2.3 What we take from Preply

Preply's loading is the second reference, for one specific quality: **the interface never looks
broken while it is thinking.** Three mechanisms, all specified in §7 — a navigation progress bar
that starts on the click, skeletons that have the shape of the content that will replace them, and
per-control pending states that keep the control readable rather than blanking it.

---

## 3. Principles

1. **Arabic first, RTL first, phone first.** Every string is authored in `messages/ar/**`. Every
   screen is reviewed at 390 px in RTL before it is reviewed anywhere else. Logical properties
   only. (Invariant 10, `10-i18n-rtl.md`.)
2. **One primary action per view.** It is `bg-navy-950`, 44 px minimum, and there is exactly one.
   Everything else is secondary, tertiary or a link.
3. **State is visible before it is read.** A session's lifecycle is a coloured badge with an icon
   and a word, in the same place on every surface. (§5.)
4. **The system is a package, not a convention.** A primitive lives in `src/components/ui/` and is
   imported. A screen that declares its own input class fails review.
5. **Never a dead end.** Every empty state names what to do next and links to it. Every error says
   what happened, which field, and what to do.
6. **Never a blank frame.** Every route has a `loading.tsx` whose skeleton has the shape of the
   real page. Every action has a pending state. (§7.)
7. **Show what exists; hide what cannot be done.** A control the viewer may not use is not
   rendered disabled with an explanation — it is not rendered, and the surface says why in one
   line if the absence would confuse.
8. **Contrast and target sizes are not negotiable.** 4.5:1 body, 3:1 UI (`SC 1.4.11`), 44 px
   targets, visible focus everywhere. `REQ-NFR-007`.
9. **★ Nothing sticky may ever cover the focused element, and no screen carries two fixed bars.**
   This plan adds fixed or sticky layers — the header, the event page's sub-nav, the action card,
   the phone tab bar **or** its contextual replacement (§6.1 note 2 — never both), and a sticky
   table header in the console. `grep -rn "scroll-padding\|scroll-margin" src/` returns **nothing**
   today. See §3.1.

### 3.1 ★ Focus, skip links and the sticky layers — WCAG 2.2, and this plan creates the hazard

Two Level-AA criteria this document was failing, one of them new in WCAG 2.2, and both of them
**created or worsened by the interface it proposes**:

**`SC 2.4.1` Bypass Blocks — there is no skip link.** `grep -rn "skip" src/app/[locale]/app/layout.tsx`
returns nothing. Today that costs a keyboard user three tabs. After §6.1 (wordmark, catalogue,
search, bell, account) and §6.7 (a fifteen-item admin rail) it is a **long tab trap in front of
every console page**. A skip link becomes the **first focusable element in the shell**, visually
hidden until focused, targeting the existing `<main id="main">`; console pages get a second
skip-to-content past the rail.

**`SC 2.4.11` Focus Not Obscured (Minimum) — four sticky layers and zero scroll padding.** Tab down
the event page and focus lands *under* the sticky sub-nav; tab through a long form on a phone and
the submit button sits *behind* the tab bar. It also silently breaks this plan's own §8.2 item 4:
`<FormSummary>`'s links "jump to and focus the field", and an anchor jump under a sticky header
lands the focused control behind it — the accessibility feature defeating itself.

```css
:root { --header-h: 68px; --subnav-h: 52px; --tabbar-h: 64px; }
html {
  scroll-padding-block-start: calc(var(--header-h) + var(--subnav-h));
  scroll-padding-block-end: calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px));
}
[id] { scroll-margin-block-start: calc(var(--header-h) + var(--subnav-h)); }
```

**And the gate that proves it**, because this is not assertable by eye: a Playwright spec that tabs
every focusable element on the event page and the proposal form at 390 px and desktop, reads
`getBoundingClientRect()` for the focused element, and **fails if any fixed or sticky element
intersects it**. `REQ-UIX-017`, `DEC-091`.

★ **The tab bar's collision is not hypothetical and it hits every existing screen at once.**
`src/app/[locale]/app/layout.tsx:156` is `<main className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">`
— **no bottom padding**. A fixed, safe-area-padded bottom bar covers the last ~64 px of **all 49
screens ever written**, including every one this milestone has not reached yet. The
`padding-block-end` lands in **the same commit as the bar**, and the proof capture is a **390 px
screenshot of an old, untouched screen** — not a new one.

---

## 4. The design system — `src/components/ui/`

### 4.1 Tokens

`src/app/globals.css` is extended, not replaced. The `@theme` / `@theme inline` split and the
`.theme-dark` reassignment stay exactly as they are — the Tailwind v4 note in `CLAUDE.md` explains
why `@theme inline` is load-bearing, and the brand-kit layer (`app/layout.tsx`, DEC-052) writes over
these same names.

**Added, all within the existing hues:**

```
--color-navy-50  #f6f8fb   --color-navy-100 #eaeff6   --color-navy-200 #d5dfec
--color-navy-700 #24344f   --color-navy-600 #2e405e
```

**Added, functional status colours** — extending the existing desaturated `error` / `success` pair
in the same register, because §5 needs five distinguishable states:

```
--color-live       #8a5a1f   --color-live-bg       #fbf5ea   --color-live-on-dark  #d2a86b
--color-ended      #5b6780   --color-ended-bg      #f1f3f7
```

**Added, spacing and elevation:** a four-step spacing scale is already implicit in the utilities;
this formalises `--space-section: 2.5rem/4rem` and adds a second shadow token
`--shadow-raise` for hover on cards. Three radii remain three.

★ **The status colours are deliberately NOT part of the brand kit, and a teammate must not
try to add them.** `BRAND_COLOUR_TOKENS` (`packages/designer-runtime/src/brand.ts:21`) is a
nine-entry `as const` — `canvas surface fgHeading fgBody fgMuted edge edgeStrong spine node` —
shared by three consumers at once: the app's `.brand-org` theme layer, the designer's templates
(where `0055`'s `design_template_versions_guard` refuses a hex literal outright) and the email
renderer. `brandColourSet` is `z.object(...).strict()`. Adding `live` and `ended` to that list
would move the parity goldens, widen a strict schema and let an org recolour what «أُلغيت» means.

**A status colour must mean the same thing in every organisation**, which is exactly why it is a
platform constant and not a brand token. The org theme can restyle the card the badge sits on; it
cannot restyle the badge. Same reasoning for `--color-error` and `--color-success`, which are
already outside the kit today.

**Motion tokens:** `--ease-out: cubic-bezier(.2,.8,.2,1)`, `--dur-fast: 120ms`,
`--dur-base: 200ms`, `--dur-slow: 360ms`. Every one of them collapses to `0ms` under
`prefers-reduced-motion: reduce`, declared once, globally.

### 4.2 The primitives

**Thirty-one** components — Surface 4, Type 3, Form 11, Action 4, Status 6, Loading 3. Each ships with a jsdom test, an RTL check and an entry in the gallery
route (§4.3). Each is `src/components/ui/<kebab>.tsx`.

| Group | Components |
|---|---|
| **Surface** | `card` (with `CardMedia`, `CardBody`, `CardActions`), `panel`, `sheet` (the phone bottom sheet), `section-header` |
| **Type** | `page-header` (title + eyebrow + breadcrumb + actions slot), `prose`, `stat` |
| **Form** | `field` (label + hint + error + required marker, the single wrapper), `input`, `textarea`, `select`, `checkbox`, `radio-group`, `switch`, `combobox` ★, `date-time` (adopts the existing `rtl-datetime-picker`), `file-drop`, `form-summary` ★ |
| **Action** | `button` (extend the existing: `primary` `secondary` `ghost` `danger` × `sm` `md` `lg`, with `pending` built in), `icon-button`, `menu` (Radix dropdown), `tabs` (Radix, RTL-aware) |
| **Status** | `badge` (the lifecycle vocabulary of §5), `tag-chip`, `avatar`, `progress`, `empty-state`, `toast` |
| **Loading** | `skeleton` (`text` `title` `card` `media` `row` variants), `route-progress` ★, `splash` ★ |

★ = the four that do real new work — though one is less new than it looks.
**`src/components/admin/member-picker.tsx` already is a searchable combobox** — filtered list,
listbox role, `useId` wiring, keyboard handling — built for SCR-053. `ui/combobox` is therefore
**promote and generalise**, not build: what is actually new is Arabic normalisation
(`REQ-DSC-004`), multi-select, and adoption on the proposal form. The other three — the error
summary that links to fields (ask 5), the navigation progress bar and the branded splash (ask 1) —
are new.

### 4.2.1 ★ The icon set — the brief's rule is split by surface

`.impeccable.md` records the client brief's rule: *icon libraries, emoji and photography are
banned; permitted glyphs are dots, lines, chevron, check and spinner.* `icons.tsx` ships exactly
those eight, and the marketing site is built on them.

**That rule was written for the marketing site and is wrong for the app** — the owner's decision,
2026-09-15, logged as `DEC-079`. A landing page carries its meaning in one metaphor and any stock
icon cheapens it. A console of 31 admin and platform screens is the opposite problem: a bottom tab bar with no
icons is not a tab bar, a dense admin table with no row affordances is a wall of text, and every
control forced to carry a word makes the interface *heavier*, not purer. Icons reduce content,
speed scanning and make the product friendlier.

So the rule splits:

| Surface | Vocabulary |
|---|---|
| Marketing (`/`, `/ar`, `/en`, `/ar/register`) | **The eight glyphs, unchanged.** The constellation is the language there; nothing is added |
| The app, the consoles, the studio | **A house icon set**, drawn for this product |

**Three conditions carry the brief's real intent forward**, and they are what keeps the set from
looking bought:

1. **Hand-authored inline SVG. No icon dependency, ever.** Not Lucide, not Heroicons, not Phosphor
   — the tell is not that an interface has icons, it is that it has *someone else's* icons.
2. **One drawing spec**, so the set reads as one hand: a 24 px grid, 1.7 px stroke, round caps and
   joins, 2 px minimum interior gap, geometry built from the same circles and straight lines the
   eight glyphs use. The dot and the line stay the family's ancestors — a notification count is a
   dot, a live session is a dot, an active tab is a dot.
3. **The forbidden *imagery* stands** (`.impeccable.md`, client brief): no open books, graduation
   caps, lightbulbs, mortarboards, cartoon illustrations or any other education cliché. This is a
   professional platform for people who grade footage for a living. A calendar is a calendar; a
   lightbulb is never an idea.

**The set — thirty-two**, each with a one-word Arabic name in the gallery: search ·
filter · sort · bookmark (outline + filled) · share · download · upload · calendar · clock · pin ·
users · user · star · check-circle · alert-circle · alert-triangle · info · chevron (start/end
aware) · arrow (start/end aware) · plus · close · menu · more · image · lock · eye · trash · link ·
dot · line · spinner. Direction-aware glyphs flip by *logical* axis, and the gallery (§4.3) shows
every one at 16, 20 and 24 px in both themes so drift is visible.

**Icons never travel alone in a primary action.** A tab bar label plus icon, a table row action with
an accessible name, a bookmark button with `aria-label` — an icon-only control ships only where the
meaning is unambiguous and the name is on the element. That is `REQ-NFR-007`, not a style rule.

### 4.2.2 The event page opens on a dark band

The brand's rhythm is **per-section, not per-user**: dark navy cover, light content, dark close
(`globals.css`'s `.theme-dark`, and `.impeccable.md`). The marketing site already reads that way and
the app does not — every app screen is white, which is why the product feels like a form and the
landing page feels like a film.

So the event page's hero — poster, title, presenters, status — sits on a `theme-dark` band, and the
content below it is light. One dark band per screen, at the top, where the session's identity
lives. The same band carries the certificate and poster previews in the studio, for the same
reason: it is the surface the artwork actually sits on.

### 4.3 The gallery

A route rendering every primitive in every variant, in both themes and both locales. It is not
decoration: it is where the 390 px RTL review happens, where the visual regression baseline is
captured, and where a teammate checks whether a primitive already exists before writing a
twenty-first input.

★ **It is NOT `/app/admin/ui`, for two concrete reasons found while stress-testing this plan.**

1. `src/app/[locale]/app/admin/**` belongs to `console` (DEC-048). A lead-owned gallery under it
   is an ownership collision on day one of M9.
2. **`scripts/visual-diff.mjs:33` hardcodes `ROUTES = ['/ar', '/en', '/ar/register']` and has no
   authentication path at all.** It drives a browser at public URLs. An admin-gated gallery is
   simply not capturable by the harness we have, so "the gallery visual baseline" would have been
   a gate that could never run.

So the gallery is **`/[locale]/ui`, in a new lead-owned `(dev)` route group**. It is
unauthenticated by construction — it reads no data, only props.

★★ **But "dev-only" and "visually baselined" are in direct tension, and `NODE_ENV` does not
resolve it.** `visual-diff.mjs:26` boots through `startStubbedServer`, and
`scripts/lib/stubbed-server.mjs:41-44` **refuses to start without `.next`** — it serves the
*production build* through `next start`. So a route excluded from the production bundle makes
`npm run visual` 404, and a route included in it is publicly reachable on the live domain. There is
no third option through `NODE_ENV`.

**It is gated at the edge instead.** `src/proxy.ts` returns 404 for `/[locale]/ui` unless
`process.env.KAREEM_GALLERY === "1"`, and `visual-diff.mjs` sets that variable when it spawns
`next start` — it already overrides the environment, which is the entire reason
`stubbed-server.mjs` exists (DEC-023). Roughly six lines, deterministic, runnable in CI, never
public. **`src/proxy.ts` is therefore on the critical path of M9 and is in the lead's edit list and
§16.7.**

The new route amends `04-architecture.md` §4 (`DEC-083`).

---

## 5. Session lifecycle, made visible — asks 4 and 6

This is the smallest change with the largest effect, and it is the root of two of the thirteen asks.

### 5.0 ★ One enum was the wrong answer

The first draft of this plan defined a single `sessionStatus()` returning nine values —
`draft awaiting_schedule open waitlist closing closed live ended cancelled`. Stress-testing it
found three defects, and they are worth recording because the obvious design is the broken one:

1. **It conflated three independent axes.** `waitlist` is a *capacity* fact, `closing` is a *clock*
   fact, and neither is a lifecycle state. Worse, the affordance table it was meant to drive
   depends on a fourth thing the enum does not carry at all — **who is looking**. A member with a
   confirmed seat, a member on the waitlist, the presenter, and an admin see four different pages
   on the same session in the same state.
2. **It was not total.** A `published` session with a null `starts_at` matched no branch —
   not `live` (needs `start ≤ now`), not `ended` (needs `end < now`), not `open` on its own terms.
   Sessions with no schedule exist; `pending_schedule` is a state in the machine.
3. **It renamed a database state for no reason** — `pending_schedule` became `awaiting_schedule`,
   which guarantees that one day someone compares the two and they do not match.

### 5.1 Three functions, not one

`src/lib/session-status.ts`, all pure, all unit-tested, **using the database's own spellings**:

```ts
// 1 — LIFECYCLE × CLOCK. Total: every session maps to exactly one.
sessionPhase(session, now) →
  | "draft" | "pending_schedule"
  | "open"      // published; no start yet, or start > now
  | "live"      // in_progress, OR published and start ≤ now < end
  | "ended"     // completed, archived, OR published and end ≤ now
  | "cancelled"

// 2 — CAPACITY × now. Presentation only; never gates a write.
seatState(session, counts) → "unlimited" | "available" | "full" | "closed"
//   "closed" = the RSVP deadline has passed.

// 3 — WHO IS LOOKING. Read from the viewer's own rows, never inferred.
viewerRelation(session, viewer) →
  | "none" | "confirmed" | "waitlisted"
  | "attended" | "absent"        // only meaningful once phase is "ended"
  | "presenter" | "staff"
```

★ **The `OR published and …` clauses in `sessionPhase` are the fix for ask 4. The clock job is
authoritative for the database; the clock is authoritative for the screen.** A session whose end
time has passed reads as `ended` the moment it passes, whether or not `complete_session` has run —
so a worker outage or five minutes of job lag can never again present a register button for a talk
that finished last week.

**Totality is a stated property, with the awkward cases named:**

| Case | Phase | Why |
|---|---|---|
| `published`, `starts_at` null | `open` | It can be reserved; there is nothing to compare to the clock |
| `published`, start set, `ends_at` null | start + `duration_minutes`, else `open` forever | Falls back to the job, which is correct — the clock has nothing to go on |
| `in_progress`, end passed | `ended` | The clock wins over a stale row. This is ask 4 |
| `archived` | `ended` | Archived is an ended session that has been filed |
| `capacity` null | `seatState` is `unlimited` | Never `full`, so never a waitlist |

### 5.2 One badge, everywhere

`<SessionStatusBadge phase seat />` composes the two presentational axes into one label — which is
why «قائمة انتظار» and «يُغلق التسجيل قريبًا» are *derivations*, not states:

| Phase | Seat | Colour | Arabic |
|---|---|---|---|
| `open` | `available` / `unlimited` | `success` | «التسجيل مفتوح» |
| `open` | `available`, deadline ≤ 48 h | `live` | «يُغلق التسجيل قريبًا» |
| `open` | `full` | `live` | «قائمة انتظار» |
| `open` | `closed` | `ended` | «أُغلق التسجيل» |
| `live` | — | `live`, pulsing dot (static under reduced motion) | «جارية الآن» |
| `ended` | — | `ended` | «انتهت» |
| `cancelled` | — | `error` | «أُلغيت» |
| `draft` | — | neutral outline | «مسودة» |
| `pending_schedule` | — | neutral outline | «بانتظار الجدولة» |

It appears in **eight places**: the browse card, the event page hero, `/app/me` upcoming and past,
the calendar, the admin session list, the host view, the notification rows, and the public card
`/s/[id]`.

### 5.3 What each phase offers WHICH viewer

This is the table the first draft got wrong by omitting the viewer entirely, and by leaving `draft`
and `pending_schedule` out — which staff see every day.

**7 phases × 7 relations = 49 cells**, and §17's gate is one assertion per cell. The full matrix
lives beside the code in `src/lib/session-status.ts`; the rows that carry the asks:

| Phase | Relation | RSVP | Cancel | Calendar | Tasks | Check in | Rate | Share | Materials |
|---|---|---|---|---|---|---|---|---|---|
| `open` | `none` | ✅ / join waitlist when `full` | — | **— ★★** | **— ★★** | — | — | ✅ | pre |
| `open` | `confirmed` | — | ✅ ★ | ✅ | ✅ | — | — | ✅ | pre |
| `open` | `waitlisted` | — | leave the waitlist | **— ★★** | ✅ | — | — | ✅ | pre |
| `live` | `none` | — | — | — | — | only if walk-ins are on (DEC-065) | — | ✅ | during |
| `live` | `confirmed` | — | — | ✅ | ✅ | ✅ | — | ✅ | during |
| `live` | `presenter` | — | — | ✅ | ✅ | — (`REQ-CHK-011`) | — | ✅ | during |
| `ended` | `attended` | — | **— ★** | — | — | — | ✅ in window | ✅ | after |
| `ended` | `absent` | — | **— ★** | — | — | — | — | ✅ | after |
| `cancelled` | any | — | — | — | — | — | — | — | — |
| `draft` / `pending_schedule` | `staff` / `presenter` | — | — | — | — | — | — | — | own |
| `draft` / `pending_schedule` | anything else | **the session is not visible at all** — `sessions_read`, not a UI condition |

★ **These two cells are ask 4.** An `ended` session shows the outcome — «حضرت» / «لم تُسجّل حضورك» —
as a **read-only fact**, and no button. Today `rsvp-panel.tsx` renders a live «إلغاء الحجز» there.

★ **«Cancel» does not stop at the cutoff, and this matrix must not say it does.**
`rsvp-panel.tsx:66-70` shows `lateCancelWarning` after the cutoff **and still renders the cancel
form**, labelled «إلغاء متأخر». That is shipped, deliberate `REQ-RSV-*` behaviour. An earlier draft
of this row read "✅ until the cutoff", which a teammate implementing the matrix as a specification
would have read as permission to remove it. **A matrix cell that contradicts shipped behaviour is a
requirement change and needs a line in §12.3 and a `DECISIONS.md` entry — not a table edit.**

★★ **These four cells are §5.4.**

An `ended` session's page also gets a **ribbon** across the top of the hero, and its card a
desaturated poster under the «انتهت» badge. Legible at a glance, from across the room, scrolling
fast — which is what ask 6 is actually asking for.

**The three functions are presentation, never authority.** RLS and the RPCs remain the boundary
(`REQ-NFR-001`); a hidden button is a courtesy, and the database refuses the write regardless.

### 5.4 ★ The affordance fallacies — offering an action before the state that gives it meaning

Raised by the owner, 2026-09-15: *«how can a user add a session to their calendar without
registering for it? It should be an option after the registration flow.»* He is right, and it is a
**class**, not an instance. The sweep below found **eight**, and — the uncomfortable part — **five are live in the
shipped application**, not in this document's draft.

**The rule.** *An affordance appears only when the state that gives it meaning exists.* Two
corollaries, and the second is a correction to §5.1:

1. **Commitment before convenience.** Diarising a session, preparing for it and checking into it
   are all downstream of *deciding to attend it*. They belong to the **confirmed** state, revealed
   by the act of reserving, not standing beside the primary action competing with it. This is also
   `REQ-SES-013`'s "one primary action" enforced honestly rather than in the markup only.
2. **★ The derived phase may only ever REMOVE an affordance, never add one.** §5.1 says the clock
   beats the clock job for the screen. That is safe in one direction and unsafe in the other:
   hiding a register button the database would still honour costs a member nothing, while showing a
   *rate* button because the clock says `ended` when `complete_session` has not run means the
   member clicks and the RPC refuses. **RLS and the RPCs are authoritative; `sessionPhase()` may
   only ever be more conservative than the stored state, never less.** One unit test asserts the
   direction for every phase pair.

### 5.4.1 What the sweep found

| # | Fallacy | Evidence | Fix |
|---|---|---|---|
| 1 | **«أضف إلى التقويم» to a viewer with no seat** — the owner's | `components/calendar/add-to-calendar.tsx:22-23` gates on `!session \|\| session.cancelled` **and nothing else**. Any viewer, any scheduled session | The slot takes `relation` and renders only for `confirmed`, `presenter`, `staff`. **On reserving, the confirmation state reveals it** — §5.4.2 |
| 2 | **Calendar offered to a waitlisted member** | Same code path | A waitlist place is not a seat. It appears when the promotion does — and `MSG-rsvp_promoted` already carries the ICS (`REQ-CAL-001`) |
| 3 | **Pre-session tasks shown to a viewer with no seat** | `components/tasks/panel.tsx:16` calls `getTasksPageData()` with no RSVP condition. «المهام التحضيرية» is preparation for attending, offered to someone who is not attending | Gate on `confirmed \|\| presenter \|\| staff`. `REQ-TSK-002` is untouched — tasks remain reminder-only and are never read by check-in |
| 4 | **«سجّل حضورك» offered to a viewer who never reserved** — ★ **shipped, and worse than a card** | Not a mock-up defect. `app/sessions/[id]/page.tsx:225` gates the check-in link on `state === "in_progress" && !viewerIsPresenter` **and nothing else**, and renders it as the **primary navy button**. Any member sees it on any live session. `check-in/page.tsx:10` lists `reservation_required` among its known errors — **so the RPC refuses.** The full loop: a primary button → a screen where you type six characters standing up, under time pressure → «لم تحجز مقعدًا» | Gate on `confirmed`, or on `none` when that session's walk-in switch is on (DEC-065). **M9 story, not M10** |
| 4b | **The check-in screen itself does not know which session it is** | `check-in/page.tsx` calls `requireSession()` and then renders the code form **for any session id** — no title, no phase read, no RSVP read, no state check. It renders happily for a `draft`, a `cancelled`, or a session that ended last March, and the member finds out *after* entering the code. On «the most operationally important input in the product» (`09`) | Read the session: show its title and `sessionPhase()`, and when the phase is not `live` or the relation is not eligible, **render the reason in place of the form**. The RPC stays authoritative; the screen stops lying |
| 4c | **The host view and the admin links have no phase gate** | `page.tsx:235` renders «عرض المُقدِّم» for `viewerIsPresenter \|\| viewerIsStaff` with **no phase condition** — a presenter is offered a live-attendance console for a talk that ended in March. `page.tsx:244-253` does the same for the staff links | Add the phase. The host view is `live` (and `open`, for the pre-flight); attendance management is `live` and `ended` |
| 5 | **A rate CTA the database will refuse** | Introduced by §5.1's own clock-over-job rule. Not in the shipped code — it would have been in the shipped plan | Corollary 2 above |
| 6 | **«نزّل شهادتك» before a certificate exists** | §6.3's ended-state mock-up shows it unconditionally for `attended`. Issuance is a deliberate staff act (§10.3) that may not have happened | Render on the certificate **row**, not on the attendance fact. Absent until issued, and the ended page says «الشهادات لم تُصدر بعد» once, quietly |

**What the sweep found already correct, and is the pattern to copy:** `getPhotosPageData()`
(`lib/dal/photos.ts:146`) computes `canUpload: !!checkedIn || !!presents || isStaff` and
`gallery.tsx:44` renders the uploader only on it. The capability is derived in the DAL, returned in
the DTO, and the component renders on it rather than re-deriving.

### 5.4.1a ★ Two corrections to the fixes above — both found by stress-testing the fix, not the bug

**(a) "None of them is a new query" was wrong, and the fix is a contract amendment.**
`getSessionForEvent`'s DTO (`lib/dal/sessions.ts:385-386`) carries `viewerIsPresenter` and
`viewerIsStaff` and **no RSVP at all** — the viewer's seat is read *inside* `RsvpPanel`, through
`getRsvpPanelData`. So gating four slots on the viewer's relation either adds a viewer-RSVP read to
the page DTO, or makes four slots each re-read it: **four extra round trips on the product's most
important page.** And "the slot takes `relation`" contradicts the slot contract as written —
`add-to-calendar.tsx:9-12` says "ids as props and never rows", which is DEC-045.

So: **`getSessionForEvent` returns `viewerRelation` once**, and `SlotProps` gains it. That is an
amendment to DEC-045's contract and is logged as such in `DEC-092` — the contract exists for a
reason and is not widened silently. `viewerRelation` is a derived enum, not a row, so the spirit of
"ids, never rows" survives.

**(b) Gating a slot leaves its heading behind.** The `<h2>المهام التحضيرية</h2>` is rendered by the
**page** (`page.tsx:287-292`), not by `tasks/panel.tsx`. Gate the panel and every non-attendee gets
an empty «المهام التحضيرية» on every session. This is not a new discovery — `page.tsx:320` records
`event` hitting it for Ratings at 390 px in wave 1 and moving the *section* behind the condition —
**but the lesson was never generalised**, and Tasks, Materials, Photos and Comments all still have
page-owned headings over conditionally-empty slots.

> **The rule, stated once so the remaining four inherit it:** *a slot that can render nothing must
> have its `<section>` and heading gated with it.* The page owns the landmark, so the page owns the
> condition. `REQ-UIX-015` covers it; one component test per slot asserts that an empty slot
> renders no heading.

### 5.4.2 What "after the registration flow" actually means

Not a second screen. The action card has **two states**, and reserving swaps one for the other:

```
BEFORE                                  AFTER (the same card, re-rendered)
┌────────────────────────────┐          ┌────────────────────────────┐
│ ٤٢ من ٦٠ مقعدًا  ▓▓▓▓▓░░░   │          │ ✓ مقعدك محجوز              │
│                            │          │                            │
│ [    احجز مقعدًا    ]  ←one │    →     │ [ أضف إلى التقويم ]  ←now  │
│ [احفظ] [شارك]              │          │ [ المهام التحضيرية (٢) ]   │
│                            │          │ [إلغاء الحجز] [احفظ][شارك] │
│ الموعد · المكان · آخر موعد  │          │ الموعد · المكان · آخر إلغاء │
└────────────────────────────┘          └────────────────────────────┘
```

Three properties that make this a fix rather than a rearrangement:

- **One primary action at a time.** Before, it is «احجز مقعدًا»; after, it is «أضف إلى التقويم».
  Never two.
- **The reveal is the receipt.** A confirmation that only says «تم» teaches nothing; a confirmation
  that *hands you the next thing* is how the member learns the calendar exists at all.
- **It survives a reload and JavaScript being off.** The two states are a server render of
  `viewerRelation`, not a client transition — so the member who arrives from the confirmation email
  sees the after state, and so does the member with no JS.

The confirmation **email** already carries the ICS (`REQ-CAL-001`), so the member who never returns
to the page still gets the calendar. That is the same principle in the other channel, and it was
already right.

**`DEC-090`** records the rule and the eight fixes. `REQ-UIX-015` states it as a requirement:
*an affordance is rendered only when the viewer's relation to the object permits the action it
offers, and the derived display state may only ever be more conservative than the stored state.*

---

## 6. The information architecture

### 6.1 The shell

Replaces `src/app/[locale]/app/layout.tsx` entirely. **Two rows on desktop, one row plus a tab bar
on phone.**

```
┌ desktop ─────────────────────────────────────────────────────────────────┐
│ [كريم معرفة]  [تصفّح ▾]  [ 🔎 ابحث عن جلسة، مُقدِّم، وسم… ]   [🔔] [avatar ▾] │
└──────────────────────────────────────────────────────────────────────────┘
   تصفّح ▾ opens a two-column panel: التصنيفات (with counts) · روابط سريعة
   avatar ▾ opens: ملفي · حجوزاتي · نقاطي · شهاداتي · المحفوظات · التقويم ·
             الإعدادات — then, if staff, a ruled section: لوحة الإدارة ·
             لوحة المنصّة — then تسجيل الخروج
```

```
┌ phone ───────────────────────────────────────────────────────────────────┐
│ [☰]            كريم معرفة                              [🔎]  [🔔]         │
└──────────────────────────────────────────────────────────────────────────┘
│  content                                                                 │
┌ bottom tab bar (fixed, safe-area padded) ────────────────────────────────┐
│   الرئيسية      الجلسات      اقترح      حسابي                             │
└──────────────────────────────────────────────────────────────────────────┘
```

Five notes that are not cosmetic:

1. **Search is in the bar, not on a page.** Tapping 🔎 on a phone opens a full-screen search sheet
   with recent queries and instant results — Coursera's pattern, and the first time
   `REQ-DSC-003`'s search is reachable without typing a URL.
2. **The bottom tab bar replaces the `<details>` disclosure — and it is CONTEXTUAL, not universal.**
   The current shell's comment explains that a second header row pushed the RSVP action past the
   fold and broke `REQ-SES-013`. A bottom bar costs zero vertical space at the top, so that
   constraint is satisfied more comfortably. It adds `env(safe-area-inset-bottom)` to its own
   padding, per the standing rule from the mobile pass, and `main` gains a matching
   `padding-block-end` **in the same commit** (§3.1).

   ★★ **But it hides on detail and immersive screens** — the event page, check-in, the host view,
   the materials viewer and the studio — where it is **replaced by a bottom action bar** carrying
   that screen's one primary action plus bookmark, share and, after commitment, calendar. Three
   reasons, and the third is the one that matters:

   - A universal tab bar plus a sticky action card is **two fixed bottom bars on one screen**.
   - Navigation is not what a member came to a detail screen to do.
   - **It is a better answer to `REQ-SES-013` than anything in the first draft.** That draft put the
     action card in flow on phone — reachable in the first screenful, but **a member who scrolls
     past it has no route back to «احجز مقعدًا» on the one screen where the requirement demands
     reachability.** A bottom action bar is reachable at every scroll position, costs nothing at the
     top, and gives §5.4.2's two-state card its natural home on a phone: before, one primary
     «احجز مقعدًا»; after, «أضف إلى التقويم».
3. **Staff links stop being a font colour.** They move into a ruled section of the account menu on
   desktop and into the drawer on phone, labelled, so a moderator can find their queue.
4. **The bell keeps its server-component contract** and the `getSessionState()` classification that
   DEC-057 fixed. A platform admin with no member row still gets no bell and no org theme.
5. **`PageHeader` is a primitive**, not a per-page `<h1>`: breadcrumb, eyebrow, title, description,
   actions. Every screen uses it, which is what makes 49 app pages feel like one product.

### 6.2 `/app/sessions` — browse (SCR-011)

Coursera's catalogue, our data.

★★ **Not a nine-facet rail. Browse is a schedule, not a store.**

Nine facets over ~30 sessions: اللغة will be `{العربية 29, الإنجليزية 1}`; المُقدِّم will be
twenty-five values of count 1; المكان and الشركة two to four each. **A facet whose count equals the
result count carries zero bits**, and the draft's own rule — "a facet with a zero count is rendered
disabled rather than hidden, so the shape of the catalogue is legible" — fills the rail with dead
rows that *obscure* the shape instead. It also costs nine `GROUP BY` aggregates per load on a
dynamic, uncached route.

**The pattern that fits is Luma / Meetup / Eventbrite, not Coursera:**

- **A date-grouped list is the default view** — هذا الأسبوع · الأسبوع القادم · هذا الشهر · سابقة.
  Time is the axis members actually navigate by, and it makes the `loading.tsx` skeleton trivially
  shaped.
- **One chip row** — الحالة + التصنيف — above the results.
- **A top-eight tag cloud**, which is the discovery affordance `REQ-DSC-002` was always for.
- **Search does the rest**, and it is now in the shell.
- **The full facet sheet lives behind «المزيد من عوامل التصفية»** for the member who wants it.

`REQ-DSC-005`'s "the active set is visible and clearable" is satisfied by the chip row, which is
what `SearchFilters` already emits. **Revisit the rail past ~200 sessions.**
- **Active filters as removable chips** above the results, plus «امسح الكل». `SearchFilters` already
  emits chips; they move above the grid and gain the count.
- **Sort:** الأقرب موعدًا (default) · الأحدث · الأعلى تقييمًا (staff only — `REQ-RAT-005` is org-admin visibility, `REQ-RAT-006` the withhold) · الأكثر حضورًا.
- **Result card** — §6.4.
- **Empty state** names the filter that emptied it and offers to drop just that one.
- **`loading.tsx`** keeps the rail and draws six card skeletons — it exists today and is the model
  for the other fifty-eight.

### 6.3 `/app/sessions/[id]` — the event page (SCR-012)

The single most important screen in the product, and the one that changes most.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ breadcrumb:  الجلسات ›  فني                                               │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  ┌────────────────────────────────┐   │
│ ┃  [badge: جارية الآن]          ┃  │  ⓘ sticky action card          │   │
│ ┃  ‹H1› عنوان الجلسة            ┃  │                                │   │
│ ┃  presenters row (avatars)     ┃  │  ٤٢ من ٦٠ مقعدًا  ▓▓▓▓▓░░░      │   │
│ ┃  ★ ٤٫٦  ·  مبتدئ  ·  العربية  ┃  │                                │   │
│ ┃  poster, 4:5, reserved box    ┃  │  [ احجز مقعدًا ]  ← one primary │   │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │  [أضف للتقويم] [🔖] [↗]        │   │
│                                     │  يُغلق التسجيل: الأحد ٢٠ سبتمبر │   │
│ ── sticky sub-nav ────────────────  │  آخر موعد للإلغاء: …           │   │
│  نبذة | الأهداف | المُقدِّمون | المواد │  📍 القاعة الكبرى · خريطة      │   │
│  | المهام | الصور | النقاش | التقييم │  🕕 الأربعاء ١٦ سبتمبر ٦:٠٠ م   │   │
│                                     └────────────────────────────────┘   │
│  ماذا ستتعلّم؟   ← objectives, two-column check-marked list (ask 9)       │
│  الوسوم:  [تقارير] [أتمتة] [إكسل]   ← tag chips, each a filtered search   │
│  نبذة · المُقدِّمون (cards) · المهام · المواد · الصور · النقاش · التقييم     │
└──────────────────────────────────────────────────────────────────────────┘
```

- ★★ **The action card, corrected.** The first draft made it sticky on desktop and in-flow on
  phone, reasoning from the shipped file's comment that pinning it on mobile covers the language row
  `REQ-SES-011` wants above the action. That reasoning is still right about *the card* — and wrong
  about the *action*. On phone the card stays **in flow at position 3**, inside the first screenful,
  poster above it, `REQ-SES-011` satisfied — **and the one primary action is mirrored into the
  bottom action bar** (§6.1 note 2), so it is reachable at every scroll position without covering
  anything. On desktop it is a **full-width action row under the hero that becomes sticky only once
  it scrolls out of view** — rather than a 30%-wide column pinned beside a left column shorter than
  the viewport, which leaves an empty gutter beneath it.
- **Bookmark and share sit in the action card** (ask 8), beside the calendar button, on every
  surface that shows a session — card, event page, public card, `/app/me` row.
- The five `<dl>` pairs become: presenters as **cards with avatar, job title, company and a link to
  the profile**; time and place as icon rows inside the action card; level, language and category
  as chips under the title.
- **«ماذا ستتعلّم؟»** renders `sessions.objectives` (ask 9 — a `text[]`, see §9.3) and is simply absent when the array is empty.
- **Tag chips** link to `/app/sessions?tag=…` (ask 11).
- The sub-nav is a scroll-spy on desktop and a horizontally scrollable chip row on phone; a section
  with nothing in it is not listed.
- For an `ended` session: the ribbon, the attendance outcome, the rating CTA if in window, the
  materials in their after-phase, and **no register control anywhere** (ask 4).

### 6.4 The session card

One component, four densities: `grid` (browse), `row` (lists, `/app/me`, admin), `compact`
(rails, related sessions), `wide` (the home hero rail).

Shows: poster (or a generated navy/silver placeholder built from the title — never an empty grey
box), **status badge over the media**, title, presenter avatars + first name, date and time with
the org's numerals, venue, level chip, **up to three tag chips**, and the bookmark button. Staff
additionally see the seat count. Hovering raises the card by `--shadow-raise`; the whole card is
one link with the bookmark as a nested button (`REQ-NFR-007` — a nested interactive needs its own
label and a stopped propagation, and there is a test for it).

### 6.5 `/app/me` — my hub (SCR-021+)

Coursera's "My Learning". Tabs: **القادمة · الحاضرة (past) · المقترحات · المحفوظات · الشهادات ·
النقاط**. The upcoming tab shows the next session as a wide card with a countdown and the check-in
button when it is `live`. Past sessions carry the attendance outcome and the rate-or-certificate
action. ★ **This is chips→tabs, not unreachable→reachable.** `me/page.tsx:29-37` already renders a
six-item chip nav over `bookmarks`, `calendar`, `certificates`, `notifications`, `points` and
`privacy`, added at Launch under DEC-064. What changes is that the hub renders *content* — the next
session, the attendance outcome, the rate-or-certificate action — instead of six links to six
pages, and that the tab strip persists across them.

### 6.6 `/app` — home (SCR-010)

Replaces the current 36-line page.

★★ **Not five rails.** A member with four upcoming sessions gets «التالية لك» rendering one card,
«تبدأ قريبًا» rendering the same card, and «الأكثر حضورًا» rendering it a third time. **A
horizontal scroller holding three items over a long empty track reads as broken, not generous.**
Netflix rails work on catalogue depth plus repeat consumption; an internal platform has neither.

★ **One correction to that critique, from the schema.** «من تصنيفك المفضّل» was challenged as having
no data source. It has one: **`member_interests`** (`0004_tenancy.sql:326`, `REQ-PRF-001`) — but it
is a **self-declared** interest, not behavioural history, so for most members in most orgs **it is
empty**, and the first draft never described that zero state. It is a legitimate rail only once the
profile asks for interests and enough members answer; until then it is a section that renders
nothing.

**What the page is instead** — and the genuinely useful Coursera borrow here is **"continue"**, not
rails:

1. **One hero «التالية لك» card** — the most imminent thing this member has *committed to*, carrying
   the check-in action when the phase is `live` and the due pre-session task when there is one.
2. **One «هذا الأسبوع» list**, plain, not a scroller.
3. **«اقترح موضوعًا»** as a call-to-action band.
4. **For staff, the «يحتاج انتباهك» strip** — proposals pending, sessions unscheduled, queue depth.
5. **«من تصنيفك المفضّل» only when `member_interests` has rows for this member**, and never as an
   empty track.

★ **The zero state is the design, not an afterthought.** For a new org it is what every member sees
for months: **when nothing is upcoming, home *becomes* browse** — the date-grouped list of §6.2
inline — rather than five empty rails with a greeting on top.

### 6.7 The admin console

`/app/admin` gains a **left rail** (collapsible, icons + labels) rather than living in the account
menu: لوحة · المقترحات · الجلسات · الأعضاء · الشركات · التصنيفات والوسوم ★ · الأماكن · الإشراف ·
النقاط والتقدير · التصاميم ★ · الهوية · الإشعارات · التصدير · السجل · الإعدادات.

The dashboard becomes a real dashboard: counts that are links, a queue list with ages, and the
«يحتاج انتباهك» items from §6.6 at full size.

Tables get one treatment: a `DataTable` primitive with sticky header, per-column sort, a search
box, row selection with a bulk action bar, pagination, an explicit empty state, and — below `md` —
**a stacked card list rather than a horizontally scrolling table**, because a scrolling table in
RTL on a phone is the single worst pattern in the current console.

### 6.8 ★★ Avatars — the data already exists and is drawn nowhere

Raised by the owner, 2026-09-15: *there are no profile pictures.* True on screen — and the reason is
more interesting than an omission.

**What is already there, verified:**

| | |
|---|---|
| `members.avatar_url` exists | `0004_tenancy.sql:243` — `text check (… ~ '^https://')` |
| It is in the **member tier** | granted and selected in `members_member_view` (`:305`, `:319`) — every member may already see every other member's |
| It is **populated from Google on first sign-in** | `0005_tenancy_rpcs.sql:124` — `coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture')` |
| The **DAL already returns it** in five modules | `comments.ts:118`, `ratings.ts:260`, `members.ts:13`, `notifications.ts:448`, `event/comment-list.tsx:41` |
| The **CSP was provisioned for it** | `proxy.ts:109` — `img-src … https://lh3.googleusercontent.com` |
| **No component renders it** | `grep avatarUrl src/` returns DAL types and zero `<img>`. The value travels the whole stack and is thrown away at the last step |

So this is not "build avatars". It is **draw what is already flowing, and fix what is wrong with how
it got there.**

### 6.8.1 Four things wrong with the current design

1. **Hotlinking Google leaks every viewer to Google.** An `<img src="https://lh3.googleusercontent.com/…">`
   makes the *viewer's browser* fetch from Google on every page render, disclosing their IP and the
   `Referer` — on an internal platform, for a third party with no role in it. That is a PDPL-relevant
   disclosure with no consent and no purpose (`12-security-privacy.md`).
2. **Those URLs rotate.** Google's photo URLs are not stable identifiers; a member's avatar breaks
   silently and nobody can tell why.
3. **No member ever consented, and none can change it.** It is whatever Google held at provisioning,
   imported silently. There is no upload, no removal, no control — the opposite of `REQ-NFR-012`
   data minimisation and of `PRF-006/007`'s self-service posture.
4. **It is outside every content control the product has.** An avatar is user-supplied imagery that
   can be abusive, and the moderation queues (SCR-050–052) cover comments and photos, not avatars.
   The anonymisation path must clear it and the data export must include it — **both need checking;
   `grep` finds no `avatar_url` handling in either.**

### 6.8.2 The design

**Avatars become first-class, and the Google hotlink is retired** — which deletes a CSP entry, so
this is a net security improvement, not a new attack surface.

- **Upload into our own storage**, through the existing pipeline: sniffed on content not extension,
  **EXIF stripped** exactly as session photos are (`REQ-EVT-012`), PNG/JPEG only — **no SVG**
  (invariant 11, DEC-009), because an avatar renders inside the same privileged headless Chromium
  the posters do.
- **One path builder entry**, `packages/storage-paths/src/content.ts`, org-prefixed like everything
  else, so the nightly prefix assertion (`NFR-014`) covers it the day it exists.
- **Derivatives by the existing worker job** at 96 px and 192 px WebP — the content pipeline already
  renders 1600 px WebP, so this is a size list, not a new job.
- **Google's photo is offered once, as an explicit import**, on first sign-in: *«نستخدم صورتك من
  Google؟»* — and on yes it is **copied into our storage**, never linked. On no, initials. The
  column's `https://` check is replaced by a storage path.
- **Initials are the default and always the fallback**, never a grey silhouette: the first letter of
  the display name over one of six navy/silver tints chosen by a **stable hash of the member id** —
  not of the name, which would change when someone corrects their spelling. For «ريم العتيبي» that
  is «ر». The glyph is wrapped in `<bdi>` like every other interpolated value, and the tint never
  encodes role, company or status.
- **Member-controlled**: upload, replace, remove, on `/app/me`. Removal is immediate and real.
- **Moderatable**: an avatar takedown joins the moderation queue, and a taken-down avatar reverts to
  initials rather than disappearing into a broken frame.
- **`anonymise_members` clears it and deletes the object**; the member data export
  (`REQ-NFR-013`) includes it.

### 6.8.3 Where an avatar earns its place

Not everywhere — an avatar beside every row is noise. Six placements, and the third is the one that
justifies the feature:

| Surface | Size | Why |
|---|---|---|
| Presenter cards on the event page | 56 px | A face is how you decide whether you know who is teaching |
| The member directory and profiles | 96 / 160 px | The screen is *about* the person |
| ★ **The host view's attendance list** | 40 px | **The highest-value placement in the product.** A host verifies people in a room, in person, against a list. This is the one screen where a photograph does work a name cannot |
| Comments and ratings | 32 px | Already fetched by `comments.ts:118` and drawn nowhere |
| The account menu | 34 px | Whose session am I in — which matters more here than usual, because a member may belong to one of several companies |
| Browse cards | 24 px | Stacked, presenter faces only, capped at two plus a count |

**Not** in leaderboards (ranking by face invites comparison the product does not want), **not** in
email (Outlook blocks images by default, so an avatar there is a broken frame or a tracking pixel —
initials render as text and always arrive), and **not** on posters or certificates: binding a face
into `@kareem/designer-runtime` would move the parity goldens and put a member's photograph on a
printed artefact nobody reviewed.

**Rejected:** Gravatar — it discloses a hash of the member's email to a third party on every render,
which is the same defect as the Google hotlink with an extra step.

`REQ-PRF-008` … `REQ-PRF-011`, **`DEC-099`**, migration **`0089`**. Owner: **`scoring`** in wave 6
(it owns `app/members/**` and the profile surfaces) with **`content`** providing the upload route and
the path-builder entry — the two tracks already split exactly this way for photos.

---

## 7. The loading and feedback model — ask 1's second half

### 7.1 Four layers

| Layer | Mechanism | Where |
|---|---|---|
| **1 · Navigation progress** | See §7.1.1 — the naive version of this is wrong and the correction matters | The house `Link`, plus one bar in the shell |
| **2 · Route skeletons** | A `loading.tsx` at **every meaningful boundary**, built from `ui/skeleton`, shaped like the page it replaces — the rail and six cards for browse, the hero and action card for an event, the table shape for a console list. ★ A `loading.tsx` covers its segment **and its children**, so this is ~12 well-placed files, not one per page | ~12 boundaries covering the **49** pages under `app/[locale]/app/**` |
| **3 · Streaming boundaries** | `<Suspense>` around every slow slot inside a page — poster, RSVP panel, comments, photos, materials, ratings, leaderboard — each with its own skeleton, so the page's frame paints immediately and the slots fill in | Slot call sites |
| **4 · Control pending state** | `useFormStatus` inside `ui/button`: the label stays, a spinner appears beside it, the control is `aria-busy` and non-submittable. **Optimistic only where the outcome is not contended** — bookmark and reaction, never RSVP: a seat is a scarce resource and optimistically confirming one, then reverting on a capacity race, is a worse experience than a 300 ms pending state and a truthful answer | Every action |

**A skeleton must not call `getTranslations`** — it renders before `setRequestLocale` — which the
existing `sessions/loading.tsx` already documents. Every new skeleton follows it: no text,
`aria-hidden`, direction-agnostic.

### 7.1.1 ★ Layer 1, corrected

The obvious design — *"one `<RouteProgress>` in the shell, driven by `useLinkStatus()`"* — **cannot
work**, and the docs say so plainly:

> «`useLinkStatus` must be used within a descendant component of a `Link` component» … «The hook is
> most useful when `prefetch={false}` is set» — `use-link-status.md`

A hook that only reports the status of *its own enclosing `<Link>`* cannot drive a bar that lives
outside every `<Link>`. And the same page opens by telling you to **prefer route-level `loading.js`
and prefetching for instant transitions** — so once layer 2 exists, most navigations have nothing
left to show progress *for*.

What is actually built:

- **`ui/link` is a house primitive** wrapping `next/link`. Inside it, a tiny client child calls
  `useLinkStatus()` and does two things: renders an **inline** pending affordance on that link
  (the shimmer the docs describe), and writes `pending` into a 20-line shared store.
- **`<RouteProgress>` in the shell subscribes to that store.** It shows the bar only when a
  navigation has been pending for **more than 150 ms** — below that threshold a bar is a flash of
  noise, and with `loading.tsx` present most navigations are below it.
- **Layer 2 is the primary mechanism, not the fallback.** The bar exists for the slow-network case
  the docs describe, where prefetch has not finished.

The cost of getting this wrong is not cosmetic: a team told to "add a progress bar in the shell"
will reach for a router-events shim that does not exist in the App Router, or poll `usePathname()`,
and ship a bar that lies.

### 7.2 The branded splash

The Preply touch, used **once**: the first paint of the app shell on a cold load. Centred wordmark
on canvas, a 2 px indeterminate bar beneath it, fading out over `--dur-slow` when the shell
hydrates. It never appears on an in-app navigation (that is layer 1's job) and never on the
marketing site. Under `prefers-reduced-motion` the bar is static and the fade is instant.

★ **A splash that covers content delays Largest Contentful Paint by exactly as long as it is
shown.** So it is CSS-only, painted in the same document as the shell, and it **fades on the
shell's first paint, not on hydration** — it is a cross-fade over content that is already there,
never a gate in front of content that is not. `REQ-NFR-008`'s budget for `/app` is measured with
the splash enabled, and if it costs LCP the splash is dropped, not the budget.

### 7.3 Toasts

`ui/toast` over Radix, bottom-centre on phone, bottom-start on desktop, `role="status"` for success
and `role="alert"` for failure, auto-dismiss at 5 s except for errors, which stay. Every Server
Action returns a toastable result. This replaces the current pattern of a `role="status"` paragraph
appearing somewhere in the page that the member may have already scrolled past.
### 7.4 ★ The failure model — the half this plan was missing entirely

`find src -name "error.tsx"` returns **zero**. `global-error.tsx`: zero. There is one
`not-found.tsx`, in marketing. The first draft of this document specified four layers of *loading*
and **not one error boundary** — a loading model with no failure model.

That is not symmetry for its own sake. **Every `/app/**` route is dynamic and touches the DAL.** A
Supabase timeout, an RLS `42501`, a `getClaims()` three-way union landing on the no-session branch,
a worker-signed URL that expired — any of them today renders **Next's default error page: English,
left-to-right, no shell, no wordmark**, to a member of an Arabic-first product. It is the single
least Arabic surface in the application and nobody has ever seen it.

So the failure model mirrors §7.1 exactly:

| Layer | Mechanism |
|---|---|
| **Route errors** | An `error.tsx` at **every boundary that has a `loading.tsx`** — same ~12 — rendering a shared `<RouteError>`: what happened in one sentence, a **retry** wired to `reset()`, and a way back to `/app`. Never a stack trace, never an error code as the headline |
| **Missing objects** | A `not-found.tsx` per **dynamic** segment — a deleted session, a revoked verification code, a material taken down while the tab was open. `notFound()` is already called in six places with no boundary to catch it |
| **The root** | **`global-error.tsx` is the one file in the product that may hard-code Arabic and `dir="rtl"`.** It replaces the root layout, so there is no `NextIntlClientProvider` and no `<html lang>` above it — `getTranslations` is unavailable by construction. Two sentences, one link, hand-written, reviewed once |
| **Action failures** | Already covered: §7.3's error toast, which stays until dismissed |

`error-coverage` joins `loading-coverage` as a gate, over the same segment list — a boundary with a
skeleton and no error boundary fails CI. **`DEC-091`**, and `REQ-UIX-016`.

★ Note the ordering consequence: `error.tsx` is a **client** component by Next's contract, so it is
the one place in the app shell that cannot read the DAL. Everything it needs — the locale, the
`/app` link — comes from props or the route.

### 7.5 ★★ الحركة — the motion system, and why the app has none

Raised by the owner, 2026-09-15: *«I want more animations and fun — the like button shows an
animation when clicked, once registered it shows some animation that the knowledge is preserved.»*

**The interesting part is that this is not a new design problem. It is an unused asset.**

| | |
|---|---|
| `globals.css` already defines **twelve** keyframe animations | `rise-in`, `network-fade`, **`dot-pulse`**, **`ripple-ring`**, `sting-ignite`, `sting-ring`, **`sting-draw`**, `sting-pop`, `sting-wordmark`, `sting-sweep`, `sting-curtain`, `focus-pull` |
| They are used by **three** files, all marketing | `network-bg.tsx`, `registration-form.tsx`, `globals.css` itself |
| `/app` contains **no motion of any kind** | `grep` across every app route and component finds nothing but `hover:` colour transitions |
| The vocabulary is **owner-approved already** | `.impeccable.md`, "Motion Personality (updated: grand direction approved by owner)" |

So the app is not missing an animation library. It is missing **the motion language its own landing
page already speaks** — and `dot-pulse` and `ripple-ring` are, almost exactly, the like-button
animation being asked for.

### 7.5.1 The grammar, which is already settled

From `.impeccable.md`, and not re-litigated here:

- **Cinema, not decoration.** Motion imitates camera and edit grammar — racked focus, light sweeps,
  dolly moves, cuts — with exponential ease-outs. **Never UI-library defaults: no bounce, no
  elastic, no hover scale-ups, no confetti.** These people cut film for a living; cheap animation
  reads as amateurism and cinematic craft reads as respect.
- **One metaphor, everywhere.** *Knowledge starts as a single dot of light; shared, it becomes a
  network.* Every celebratory moment in this product is **dots, lines and light** — which is why
  «knowledge is preserved» has an obvious visual form and does not need inventing.
- **Grand but graceful.** Every moment degrades to *a still that could hang in the deck*:
  `prefers-reduced-motion` is a complete experience, not a disabled one.
- **60 fps on a mid-range phone**, or it does not ship.

### 7.5.2 The nine moments

Three tiers. A product where everything celebrates has celebrated nothing.

**Tier 1 — the two moments that carry meaning.** Orchestrated, ~900 ms, once per occurrence, never
repeated on a re-render.

| Moment | What happens |
|---|---|
| ★ **الحجز — «تم حفظ مقعدك»** | The owner's «knowledge is preserved». The action card cross-fades to its confirmed state (§5.4.2) and, behind it, **a dot ignites at the card and a line draws to two neighbouring dots** — `sting-ignite` + `sting-draw`, already written. The member's commitment *joining the network*, which is the initiative's entire metaphor doing product work instead of decorating a landing page. **Reduced motion:** the constellation is already drawn, still, with the confirmed card over it |
| ★ **تسجيل الحضور — check-in accepted** | Operationally the most important success in the product, and today it is a text string. The six characters resolve, the field settles with a `focus-pull`, and **the room's constellation gains one lit dot**. This is the moment a member is *in the room*, and it should feel like it |

**Tier 2 — five acknowledgements.** 200–360 ms, `--ease-out`, transform and opacity only.

| Moment | Motion |
|---|---|
| **التفاعل — the like/reaction** | **`dot-pulse` + `ripple-ring`, both already written.** The glyph pulses once and a single silver ring expands and fades. No heart, no burst, no particles. `REQ-EVT-004` says reactions earn nothing — so the motion is a *whisper*, and it is the most-repeated animation in the product |
| **النقاط — points awarded** | The number counts up over 400 ms and a hairline sweeps the row (`sting-sweep`). Under reduced motion it is simply the new number |
| **الشارة / المستوى** | The badge draws its outline (`sting-draw`) then fills. The one place a longer beat is earned, because it happens rarely |
| **الحفظ — bookmark** | 120 ms. The outline fills. That is all — it is a private act, not an achievement |
| **الاقتراح — proposal submitted** | An idea becomes a dot: one dot ignites, alone, un-connected. It joins the network when the session is *published*, not when it is proposed — which is also true |

**Tier 3 — the connective tissue.** Already specified in §7.1: the route progress bar, skeletons,
pending states, toasts. These are motion too, and they are the ones a member sees a hundred times a
day, so they stay quiet.

### 7.5.3 Where nothing animates

Attendance lists, the moderation queue, exports, the audit log, the survey results, admin tables,
and **every error state**. A failure that animates is a failure that is pleased with itself. And
**no avatar, badge or card scales on hover** — that is the UI-library default the brief bans by name.

### 7.5.4 How it is built, and what it may not cost

- **CSS keyframes first**, reusing the twelve that exist. The two Tier-1 moments are orchestrated
  with the **Web Animations API** — no motion library. This is the same reasoning as the icon set
  (§4.2.1): the tell is not that a product has motion, it is that it has *someone else's* motion,
  and `framer-motion` is ~34 KB gzipped for what `element.animate()` does natively.
- **Transform and opacity only.** No animated `width`, `height`, `top` or `margin`; a height change
  animates `grid-template-rows`. No `will-change` left on after the animation ends.
- **Every Tier-1 and Tier-2 moment is a component in `ui/`,** owned by the lead, so the vocabulary
  cannot drift track by track.
- **`--dur-*` and `--ease-out` collapse to `0ms` under `prefers-reduced-motion`**, declared once —
  §4.1 already does this. **But collapsing a duration is not a reduced-motion design.** Each Tier-1
  moment names its own static state, and the 390 px review looks at both.

### 7.5.5 The gates

| Gate | What it asserts |
|---|---|
| **Reduced motion** | a Playwright pass with `prefers-reduced-motion: reduce` over the two Tier-1 moments and all five Tier-2, asserting the end state is reached and **nothing is mid-transition** — the marketing suite already does exactly this for the sting (`qa.mjs:342-351`) |
| **Frame budget** | the two Tier-1 moments traced on a throttled CPU profile; **any frame over 16 ms fails**. `REQ-NFR-008` |
| **No layout animation** | a `ui-lint` rule: a `@keyframes` block touching anything but `transform`, `opacity` or `filter` fails, with a documented escape hatch |

`REQ-UIX-018` … `REQ-UIX-020`, **`DEC-100`**.

★ **This is M10, not M9** (§16.2). Only the `--dur-*` and `--ease-out` tokens land in M9, where §4.1
already puts them. The reason is not load-shedding: **you cannot build the reservation animation
before the reservation card exists**, and that card is M10 — as is the check-in screen, per the
eleven-screens table. The vocabulary and the two Tier-1 moments are the **lead's** in M10; each
track wires its own Tier-2 moment in its own components.

---

## 8. The form model — ask 5

### 8.1 What is wrong, precisely

The proposal form is the *good* case and still fails: errors are `text-fg-heading` — the same
colour as a heading — with no icon and no marker; the summary lists messages that are **not links**
to the fields; required fields are marked only by the absence of the word «اختياري»; `noValidate`
turns off the browser's own messages; and no other form in the product has a summary at all.

### 8.2 The model

Every form in the product, without exception:

1. **`<Field>` is the only wrapper.** Label, optional hint, the control, the error. It wires
   `htmlFor`, `aria-describedby`, `aria-invalid` and `aria-required` itself so no screen can get
   them wrong.
2. **Required is marked positively.** «مطلوب» as a small marker on the label. `REQ-NFR-007` — the
   asterisk convention fails in Arabic where it collides with the RTL run.
3. **Errors are red, with an icon, adjacent to the field.** `--color-error`, `alert-circle`, and a
   1 px error border on the control. Colour is never the only channel.
4. **`<FormSummary>` appears above the form on failure**, focused programmatically, `role="alert"`,
   listing every failed field as **a link to that field's control** — «الفئة: اختر تصنيفًا» jumps to
   and focuses the select. This is the literal answer to «no UI to know what fields have been
   missed».
5. **Inline validation on blur**, after the first submit attempt only — the register form already
   does this (`qa.mjs:178`) and it is the right behaviour; it becomes the rule.
6. **Values survive a failed round trip.** React 19 resets a form when its action resolves; the
   proposal form's `was()` pattern (reading values back out of the returned state) becomes part of
   `useFormState` helper `formStateFrom()` so no form has to remember.
7. **A long form shows progress.** The proposal and schedule forms get a step indicator and a
   «المتبقّي: ٣ حقول» counter.
8. **Destructive actions confirm** in a `ui/dialog` that names the object and requires the action
   word, never a browser `confirm()`.

`scripts/` gains a lint rule — a simple AST check in the existing `qa` family — that fails CI if a
`<form>` contains an `<input>` not wrapped in `<Field>`.

---

## 9. The thirteen asks — where each one lands

| # | Ask | New requirement(s) | Migration | Milestone | Owner |
|---|---|---|---|---|---|
| 1 | The rebuild, responsive, loading | `REQ-UIX-001…014` | — | M9 → M13 | lead + all |
| 2 | Co-presenter **search box** | `REQ-UIX-008`, amends `REQ-PRO-003` | — | M10 | `console` builds `ui/combobox`, `sessions` adopts |
| 3 | Proposer enters all content; admin only settings | `REQ-PRO-009`, amends `REQ-SES-001` | `0082` | M11 | `sessions` + `console` |
| 4 | No registering for finished sessions | `REQ-UIX-004`, amends `REQ-RSV-001` | — | M9 (logic) / M10 (UI) | `checkin` |
| 5 | Which fields were missed | `REQ-UIX-009…011` | — | M9 | lead |
| 6 | A session has visibly ended | `REQ-UIX-003` | — | M9 | lead |
| 7 | Staff download poster and photos | `REQ-ADM-021`, `REQ-DSG-027` | `0086` (audit only) | M11 | `content` (photos + zip) + `designer` (the poster menu — it owns `signExportUrl()`) |
| 8 | Bookmark and share everywhere | amends `REQ-DSC-006` | — | M10 | `content` |
| 9 | **Objectives** (optional) | `REQ-SES-014`, `REQ-PRO-010` | `0083` | M10 | `sessions` |
| 10 | **Survey**, staff-only results | `REQ-SUR-001…008` | `0084` | M11 | `event` |
| 11 | **Tags** UI | closes `REQ-DSC-002`; adds `REQ-DSC-008` | `0085` | M10 | `content` + `console` |
| 12 | The **studio** rebuild | `REQ-DSG-027…031`; closes `REQ-DSG-022` | `0087` | M12 | `designer` |
| 13 | The **email studio** and its library | `REQ-NTF-009…014` | `0088` | M12 | `notify` |

### 9.1 Ask 3 in detail — the proposal is the source of truth

**The principle:** *the proposer writes the session; the admin schedules it.* An admin never
re-types content, and every field the proposer filled in survives approval.

- **`0082` (M10)** adds objectives to `proposals` and `sessions` — see §9.3 for why it is a
  `text[]` and not a table. **`0084` (M11)** adds `target_audience` and
  `expected_duration_minutes` to `sessions` and makes `create_session()` **copy all of them** from
  the proposal, alongside the accepted presenters it already copies at `0020:86-93`.
- SCR-043 (schedule) is re-cut into two tabs: **«المحتوى»** — the proposal's fields, shown read-only
  with an explicit «تعديل المحتوى» that reveals them, records who changed what, and notifies the
  proposer — and **«الإعدادات»** — date, venue, capacity, deadlines, certificate mode, language,
  poster. The second tab is where an admin normally lives. `expected_duration_minutes` **pre-fills**
  the schedule's duration instead of being asked again.
- The admin's direct-create path stays (an admin creating a session out of nothing is a real case,
  `0020`) but is demoted to a secondary action behind «إنشاء بدون مقترح».
- The proposal review card gains a diff view when an admin has edited content, so the proposer can
  see what changed. `REQ-PRO-009`.

### 9.2 Ask 10 in detail — the survey

Distinct from ratings, and the document is explicit about why: `REQ-RAT-004` makes ratings
anonymous **and visible to the presenter** above `REQ-RAT-006`'s minimum of three. A survey is an instrument the
organisation reads.

- **Entity `surveys`** — one per session, optional, created by staff from a reusable
  `survey_templates` row. **`survey_questions`** — ordered, typed (`scale_1_5`, `single_choice`,
  `multi_choice`, `free_text`), each `required` or not. **`survey_responses`** — one per member per
  survey, with `submitted_at`; **`survey_answers`** — the values.
- **Who may answer:** exactly who may rate — a checked-in attendee, in the same 14-day window
  (`REQ-RAT-003`), so a member answers one thing once, on one screen: `/app/sessions/[id]/rate`
  becomes «قيّم الجلسة» with the rating first and the survey below it. ★★ **One screen — but NOT
  one submit and NOT one transaction.** That convenience is the regression §9.2a describes, and it
  is the most dangerous thing in this document.
- **Who may read results:** `admin` and `moderator` of the owning org. **Not the presenter** — this
  is the whole point of the ask, and it is a policy, not a UI condition. A presenter reading an
  aggregate would be indistinguishable from the rating aggregate they already get.
- **Results screen** `/app/admin/sessions/[id]/survey`: response rate, a bar per scale question with
  the mean in the org's numerals, choice distributions, and free text as an anonymised list with a
  minimum-count withhold matching `REQ-RAT-006`'s three — ★ **and the same withhold on the scale
  and choice distributions, not only on prose** (§9.2a). CSV export through the existing audited
  export path (`REQ-ADM-012`), UTF-8 BOM, **Western digits** (§9.2b).
- `org_id` on every one of the four tables, full policy set, generated isolation sweep coverage —
  invariant 5, no exception requested.

### 9.2a ★★ The regression §9.2 introduces — correlated writes defeat rating anonymity

**This does not exist in the shipped app, because the survey does not exist yet. It exists in this
plan — and no policy test would catch it, because no policy changes.**

**What is true today**, read from the migrations rather than assumed:

| | |
|---|---|
| `ratings` carries `member_id` **and** `submitted_at` | `0010_m2_schema.sql:375, 380` |
| Anonymity is enforced **by a view, not by storage** | `session_rating_aggregates`, `security_invoker = off`, presenter scope as the predicate |
| **An org `admin` may already read attributed ratings** | `ratings_read_admin` (`0010:576-577`), and `is_org_admin()` is `role = 'admin'` **only** (`0003:40-43`) |
| **A `moderator` may not** | `is_staff()` is the admin-or-moderator test (`0003:45-48`); `ratings` does not use it |

So attribution is **deliberately an admin-only capability**: `REQ-RAT-004`'s anonymity is anonymity
*from the presenter*, and `REQ-RAT-005` is the org-admin exception.

**§9.2 grants survey results to `admin` AND `moderator`** and writes a `survey_responses` row
carrying `member_id` and `submitted_at` in the same transaction as the rating. That does not hand a
moderator a join through RLS — they cannot read `ratings` at all — but it does three things:

1. **It converts an enforced role boundary into a property of two timestamps.** Every artefact
   carrying both becomes an attribution oracle: a backup, `REQ-SUR-007`'s audited CSV, a worker log
   line, a Sentry breadcrumb, a `--data-only` dump. The boundary is enforced in one place and
   leaked everywhere else.
2. **It is irreversible for whoever it affects first.** Once written correlated, always correlated.
   A fix next quarter does not protect the people who answered this quarter.
3. **Every test stays green.** No policy changed, so the RLS suite passes; `REQ-SUR-005`'s
   "a presenter is refused" passes. A guarantee destroyed by a submit button.

**The fix, and it is cheap:**

- **Two writes, decorrelated.** The rating is written by the action; the survey response is enqueued
  through `public.enqueue_job()` with a jittered delay. **No shared request id, correlation id or
  client-generated key.**
- **Coarsen `ratings.submitted_at` to the day.** Nothing reads it at minute precision — the
  presenter sees an aggregate withheld below three.
- ★ **`REQ-SUR-006`'s withhold covers distributions, not just free text.** A five-point distribution
  over four responses in a twelve-person session, read against the attendance list the same admin
  can see, identifies people by inference. Small-n disclosure control applies to every question type.
- **The one test that would have caught it:** for any member, the set of ratings whose
  `submitted_at` falls within ±N minutes of their survey response is **not of size 1**. It belongs
  in the RLS suite beside `REQ-SUR-005`'s case.

`REQ-SUR-009`, **`DEC-094`**.

### 9.2b ★ Numerals: display follows the org, machine-readable surfaces never do

`REQ-SUR-007` as drafted exports survey results «in the org's numerals». **Arabic-Indic digits break
numeric parsing in Excel and Google Sheets** — every column lands as text and every downstream sum
is wrong, on an export that is audited and therefore trusted.

The same class, and worse: a **certificate serial** and a **verification code** are identifiers, not
quantities. Rendered Arabic-Indic on the PDF and Western on `/verify/[code]`, the one public proof
artefact this platform has **fails to verify**.

> **The rule, for `10-i18n-rtl.md` §5.2:** numerals follow the org setting **for display**.
> **Inputs, CSV, serials, verification codes, URLs, filenames and every machine-readable surface
> stay `nu-latn`, always.**

`REQ-INT-010`, **`DEC-095`**.

### 9.3 ★ Ask 9 in detail — objectives are a `text[]`, not a table

This looked like a detail and is not. An earlier draft of this document referred to
`session_objectives` in one place and to a column in another, and the difference is expensive:

> **Invariant 5.** Every table has an `org_id`, RLS enabled, a full policy set, and a test.

A fourth entity for an ordered list of at most eight short strings buys a join, a policy set, four
more rows in `03` §8.2, and a new line in the generated isolation sweep — to model something with
no identity, no lifecycle and no independent access rule. **So it is a column on both
`proposals` and `sessions`:**

```sql
objectives text[] not null default '{}'
  check (cardinality(objectives) <= 8)
  check (not exists (select 1 from unnest(objectives) o where length(o) > 140 or btrim(o) = ''))
```

`REQ-SES-014`'s acceptance — ordered, ≤ 140 characters each, at most 8 — is satisfied by the array
order and the two checks, with no invariant-5 debt and nothing added to §18's RLS gate. `0082`
carries it, and `0084`'s `create_session()` copies it like any other proposal column.

**`DEC-089`.** If objectives ever grow an identity of their own — per-objective completion, say —
that is a new entity with a migration and a decision, not a refactor smuggled in later.

### 9.4 Ask 11 in detail — tags

The data has been there since `0037`. What is missing is every screen.

- **Proposer** adds tags on the proposal form via `ui/combobox` — type-ahead over existing org tags,
  Arabic-normalised match (`REQ-DSC-004`), free creation on Enter, max 8, each a removable chip.
- **Admin** manages the vocabulary at `/app/admin/categories` (renamed «التصنيفات والوسوم»): merge
  two near-duplicates, rename, delete, see usage counts. `REQ-DSC-008`.
- **Display**: chips on the event page and up to three on the card, each linking to a filtered
  browse. A facet in the browse rail with counts.
- `0085` adds only what is missing: a `usage_count` maintained by trigger for the facet counts, and
  the merge function.

### 9.5 Ask 7 in detail — downloads

★ **Do not invent the download mechanism — it exists.** `signExportUrl()` already mints a
five-minute signed URL through `exports_storage_read` (`03` §6), and three screens already consume
it with a plain `<a href … download>`: `designer/export-panel.tsx:71-75`, `me/certificates/page.tsx:103`
and `materials/[materialId]/download-button.tsx`. This ask is **reach**, not plumbing.

- **Poster:** a «تنزيل» menu on the event page and on SCR-043 — visible to `admin`, `moderator` and
  the session's own presenters — listing each ready artifact (master 4:5, square, story, OG, and the
  print PDF where one exists). It calls **`signExportUrl()`**, the same function the export panel
  calls, and renders the same `<a download>`. A server-signed URL rather than a client-side blob,
  because the CSP makes blob downloads fragile — which is why the existing three work that way.
- **Photos: this is the real work.** Nothing in `src/components/photos/` downloads anything, and
  photos live under a different storage prefix with a different read policy, so they need their own
  signer. Per photo for any viewer who may see it, and
  **«تنزيل الكل»** for staff — a `zip_session_photos` worker job (the 35th job) that writes a
  zip to storage and notifies when it is ready, because zipping in a request would block a Vercel
  function on an album of 300 photos.
- **Both are audited.** A staff download of member-uploaded photographs is exactly the kind of act
  `12-security-privacy.md` expects in `audit_log`. `0086` is the audit action rows and nothing else.
- EXIF is already stripped at upload (`REQ-EVT-012`); the download serves the stripped file, which
  is the only file that exists.

---

## 10. The studio — ask 12

### 10.1 What is right, and stays

The engine is the part of this product that was hardest to get correct, and none of it changes:
one renderer shared by editor, worker and parity suite (DEC-017); the canvas as an iframe carrying
`renderDocumentToHtml()`'s real output rather than a React look-alike; bindings resolved from real
rows; Tier-A parity on every render; the font set by SHA-256 (DEC-031); autosave over a Route
Handler because layer trees exceed the 1 MB action cap; fifty-step document-level undo.

**What changes is everything above the engine.** The current editor asks an admin to position a
layer by typing numbers into a properties panel — `editor.tsx:243` records that dragging is
"deliberately absent" — and `REQ-DSG-022` has required "layers with alignment guides and snapping"
and "focal-point cropping" since the PRD was written. This closes that requirement.

### 10.2 The editor, to the industry pattern

The layout every comparable tool converges on (Canva, Figma, Adobe Express, Illustrator) — and the
reasons each region exists:

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ‹ رجوع   اسم المستند ✎     [مسودة/منشور]   ↶ ↷   [معاينة] [⤓ تصدير ▾]    │
├──────────┬──────────────────────────────────────────┬─────────────────────┤
│ left     │                                          │ right: inspector    │
│ rail     │        ▓▓▓▓ the artboard ▓▓▓▓            │  ┌ الموضع والحجم    │
│ (tabs,   │                                          │  ├ النص والخط       │
│  icons)  │     · safe area / bleed overlays         │  ├ اللون والتعبئة   │
│          │     · alignment guides while dragging    │  ├ الربط بالبيانات  │
│ عناصر    │     · selection handles + rotate         │  └ القفل والرؤية   │
│ نصوص     │     · snap to edges, centres, siblings   │                     │
│ صور      │                                          │  ⚠ الفحوصات (3)     │
│ أشكال    ├──────────────────────────────────────────┤                     │
│ قوالب    │ variant strip: [4:5] [1:1] [9:16] [OG]   │                     │
│ طبقات    │ [A4 print]        ← live thumbnails       │                     │
└──────────┴──────────────────────────────────────────┴─────────────────────┘
```

| Region | What it does | Why it is that way |
|---|---|---|
| **Top bar** | back, inline-renamable title, state chip, undo/redo, preview, export menu | Save state belongs beside the title, not in a corner panel — an admin's first question is "is my work safe" |
| **Left rail** | tabbed: add elements, text styles, images, shapes, templates, **layers** | Layers move from a permanent panel into a tab because they are consulted, not watched |
| **Canvas** | **drag, resize with eight handles, rotate, snap, nudge with arrows (1 px, 10 px with shift), multi-select with a marquee, group align/distribute** | The core of the ask. Positioning by typing numbers is the single biggest usability failure in the product |
| **Inspector** | a collapsible accordion, only the sections the selected layer has | A text layer and an image layer do not share a property set; showing both is the current confusion |
| **Variant strip** | live thumbnails of every preset, one click to inspect, a warning dot where a check fails | `REQ-DSG-022`'s "live preview of every variant". Today variants are discovered at export |
| **Checks** | the existing `checks-panel`, promoted to a persistent badge with a count and a click-to-select-the-offending-layer | A check that does not point at the layer is a riddle |

**Interaction contract.** The iframe stays pointer-inert; all interaction is in the overlay in
document coordinates, which is already the architecture — the overlay gains handles and a drag
model rather than the canvas gaining a second event system. Snapping reuses the existing
`snap`/`snapTargets` exports from the runtime, which are **already written and currently driven only
by number entry** (`editor.tsx:6`, `:250-253`).

**Keyboard parity is mandatory:** tab to a layer, arrows to move, `⌘/Ctrl+↑↓` to reorder, `Delete`
to remove, `⌘/Ctrl+Z/⇧Z` undo.

### 10.2.1 ★★ Keyboard is not enough — `SC 2.5.7` needs a *pointer* path, and it reverses a judgement above

An earlier draft of this section said keyboard parity is what saves a drag-based editor from being
inaccessible. **That is the wrong success criterion.** Keyboard satisfies `SC 2.1.1`. **`SC 2.5.7`
Dragging Movements (AA, new in WCAG 2.2) is separate**: any function operated by a *dragging*
movement must also be operable **by a single pointer without dragging** — a tap, a click, a
press-and-release, path-independent.

It exists for the touch user with a tremor or limited dexterity, **on a phone, with no keyboard
attached** — which is most of this product's population and the whole reason every screen gets a
390 px review. A studio that is fully keyboard-operable and drag-only by pointer **fails 2.5.7
while passing every test this plan otherwise proposes.**

Dragging appears in **five** places in this plan, not one. Each needs its own pointer path:

| Dragged operation | The single-pointer path that makes it conform |
|---|---|
| **Layer position, size, rotation** (§10.2) | ★ **The numeric X/Y/W/H/rotation fields ARE the conformance path, and they must stay.** §10.2 calls positioning by typing numbers "the single biggest usability failure in the product" — which reads as a mandate to delete them. **Do not.** *Demote* them into a collapsed «الموضع والحجم» accordion. Then add pointer operations that do the same job better and are also path-free: **align and distribute** (prominent, not tucked away — they are conformance, not a convenience), «لائم المنطقة الآمنة», «وسّط أفقيًا/رأسيًا», and tap-to-select-then-tap-to-place |
| **Layer order** | ▲▼ buttons on every layer row, plus "bring to front / send to back" in the row's overflow. Drag-in-list is the *enhancement* |
| **Focal point** (`REQ-DSG-030`) | A **nine-point preset grid** — corners, edges, centre — beside the draggable dot. The dot refines; the grid is the path. It is also what a phone user actually wants |
| **Objectives, email blocks, survey questions** (§9.3, §11.3, §9.2) | ▲▼ on every row. **Three lists, one primitive:** build `ui/reorderable-list` once, buttons first, drag layered on, and all three inherit it |
| **Marquee multi-select** | Shift-click on the canvas, and "select all of this layer type" in the left rail. A marquee has **no** non-drag equivalent, so it must never be the only way to select more than one object |

**The exception we claim, claimed out loud.** The eight resize handles may take 2.5.7's *essential*
exception for the handle affordance itself — **but only because the numeric fields and the align
buttons provide the function.** That sentence is in this document so that an auditor gets an answer
and, more importantly, so that a teammate who later "cleans up" the number fields discovers they are
load-bearing before deleting them.

**`REQ-DSG-028` is amended.** It currently ends "…with full keyboard parity", which encodes the
wrong criterion. It becomes: *"…with a **single-pointer, non-dragging alternative for every dragged
operation**, and full keyboard parity."*

**One gate proves it, and axe never will:** a Playwright case that performs **every** studio
operation using `page.click()` only — no `mouse.down/move/up` — and asserts the document changed.

### 10.2.2 ★★ RTL in the studio — the first draft of this rule was a correctness bug

The artboard has its own direction, which is the **document's**, not the console's: an Arabic poster
may be opened in an English console. An earlier draft of this section said *"the handles, the rulers
and the align buttons follow the console's direction."* **The arrow-key half is right; the rest
would have made a document's rendered output a function of the editor's locale.**

`model.ts:19` defines `LogicalAlign = 'start' | 'center' | 'end'`, used by `TextLayer.align` (`:95`)
and `DynamicFieldLayer.align` (`:130`). **Alignment is stored logically** — that is exactly what
makes an LTR template variant a direction flip rather than a second layout (`10` §7.1). So "align
start" computed from the *console's* direction writes a **left** intent into a logical-start field
when an Arabic poster is edited in an English console, and a **right** one when the same document is
opened in Arabic.

Why that is worse than it sounds here: §18's risk table promises "parity unchanged, still 0.000%",
DEC-048 makes a golden diff a lead-reviewed event, and `REQ-DSG-016` pins the font set precisely so
renders cannot drift. This introduces a drift source that is **not a font, not a renderer and not a
binding — it is the editor chrome**, and it surfaces as a golden diff whose cause is invisible in
the diff. And because English is not shipped (`REQ-INT-008`, OQ-024), it lies **dormant** until
someone completes `en.json` — at which point templates authored months earlier start moving.

**The rule, corrected:**

| | |
|---|---|
| **Align and distribute** | operate on the **document's** logical axis, and their icons are drawn in the **document's** direction. The admin is manipulating artwork, not the console — the console is the room it sits in |
| **Rulers** | share an origin with the inspector's position fields: the **document's** start edge. A ruler running console-LTR over an RTL artboard shows a number that does not match the X the admin just typed — which turns §10.2.1's numeric fields, now the 2.5.7 conformance path, into a **second source of truth** |
| **Resize handles** | keep **visual** identity for the pointer (the NW handle is up-and-left on screen) and **write back to logical** coordinates |
| **Arrow keys** | follow the **visual** axis, never the logical one — a member pressing → expects the layer to move right. This half was always correct, and it matches Figma, Canva and Illustrator |

★ **The overlay needs a documented exemption from the logical-properties rule.** It positions
handles in *document* coordinates inside a *console* DOM, so `inset-inline-start` there resolves
against the console's direction and lands on the wrong side. **It must use physical `left`/`top`
computed from document geometry** — written down here so that a teammate tidying the codebase
towards logical properties does not silently flip every handle.

**One test locks the whole class:** render an Arabic poster document, apply "align start" to a text
layer from an `en` console and from an `ar` console, and assert the two stored documents are
**byte-identical**. One file, one unit test. **`DEC-096`**.

**Mobile stays view-and-approve.** The current decision (09, SCR-057) is correct and is kept, but
made honest: the phone gets a real **review** screen — every variant, the checks, approve or send
back — instead of a hidden layer chrome with no replacement.

**Focal-point cropping** (`REQ-DSG-022`, unbuilt): an image layer gets a draggable focal point over
its thumbnail; `derive()` uses it when producing every other variant, so a crop centres on the
subject. This is the difference between four usable variants and one usable variant and three
accidents.

### 10.3 The workflows, which are the real complaint

**Poster.** `posters/picker.tsx` today lists three options in prose and gives a button for one. It
becomes a three-card chooser with a live preview and a working control on each:

| | «تلقائي» | «تخصيص» | «رفع» |
|---|---|---|---|
| What | the org template, bound live to the session | a detached copy you edit | your own artwork |
| Control | a template thumbnail picker | «افتح الاستوديو» | a drop zone with the minimum size stated |
| Says up front | updates automatically when the session changes | **★ detaching is one way** — confirmed in a dialog, not a hint | no variants are derived; you supply what you need |

The one-way detach becomes a **confirmation dialog naming the consequence**, not a sentence above a
link. The current file's own comment says the difference between a decision and a surprise is
saying it before the click — the dialog is how that is actually enforced.

**Certificates.** The confusing part is that three unrelated things share a word: the *template*
(a design), the *mode* (who gets one — `REQ-CRT-001`), and the *issue* (the act, with its gapless
serial). The rebuild separates them into a three-step flow on
`/app/admin/sessions/[id]/certificates`:

1. **التصميم** — pick a certificate template; preview with a real attendee's data.
2. **من يستحق** — the mode, with the resulting list of names shown live and a count. Hold-backs
   and exceptions are made here, visibly.
3. **الإصدار** — a preflight (fonts resolved, bindings bound, Tier A green, serial range reserved),
   then one button, then a progress list with per-certificate status and a re-issue for failures.

Issuance is irreversible and serials are gapless, so step 3 is a deliberate, reviewed act with its
own confirmation — not a button next to a dropdown, which is what it is today.

**Template management** (`/app/admin/templates`) gets the same card grid as the studio's template
tab, with «منشور» / «مسودة» state, a duplicate action, a usage count, and the platform library
(DSG-008) as a clearly separate, read-only-until-copied section.

---

## 11. البريد — the email studio (ask 13)

### 11.1 What exists

- **One hard-coded HTML shell** in `worker/src/mail/render.ts` (227 lines), built from layout
  tables and inline CSS, with a documented list of five non-negotiable email constraints. That
  shell is **correct and stays** — see §11.2.
- **Twenty-five templates** as `subject` + `body` *plain strings* in `worker/src/mail/templates.ts`.
  ★ **Twenty-five, not the twenty-two `08` §3.2 lists.** `DEFAULT_TEMPLATES` has 25 `MSG-*` keys and
  the file's own comment at `:29-30` explains the drift — «`08` §3.2 lists 22 templates; `08` §1
  gives 24 messages an email channel» — then adds two more. **A golden suite built to 22 silently
  misses three keys, and an eight-template library would leave 17 unmapped, not 14.** Reconciling
  `08` §3.2 against `templates.ts` is the first task of the email track.
  A template is a paragraph of Arabic with `{{handlebars}}`. There is no heading, no button, no
  image, no section, no layout of any kind: every one of the twenty-two messages produces the same
  wall of text.
- **The admin screen** `/app/admin/emails` (SCR-058) is a wrap-around **chip list of
  `<a href="?key=…">` links** (`:68-82`), a `subject` `<input>` (`:93`), **one** `<textarea>`
  (`:101`) and a `requiredFields` `<input>` (`:105-110`). **There is no preview of any kind** — an admin edits an email and finds out what it
  looks like when a member receives it.
- **No pre-made designs.** `DEFAULT_TEMPLATES` is the twenty-two strings, and an org that wants a
  different-looking reminder has no way to make one.

So: the transport is production-grade (Resend, delivery log with reasons, bounce handling,
`REQ-NTF-008`), the **content system is a text box**.

### 11.2 The constraint that shapes the whole design

**Email is not the web and the designer runtime cannot be reused here.** `@kareem/designer-runtime`
renders a DOM/SVG document that headless Chromium screenshots — the right engine for a poster, the
wrong one for an inbox. `render.ts`'s header records the five constraints that make it so — verbatim, in this order.
(The file does not itself mention the designer runtime; the constraints are its, the inference is
this document's.)

- layout **tables** and **inline CSS** — clients in 2026 still do not support modern CSS reliably;
- `dir="rtl"` on `<html>` **and on every cell** — Outlook ignores inherited direction more often
  than it honours it;
- a **fallback font stack, never a web font** — the mail is designed to look right in Tahoma,
  not to depend on IBM Plex arriving;
- numerals per the org setting;
- a **plain-text alternative for every message** — some corporate clients strip HTML entirely.

A free-form visual editor cannot honour those and stay correct. So the email studio is **block-based**
— the pattern every serious sender converges on (Mailchimp, Braze, Customer.io, MJML) precisely
because a constrained block compiles to table HTML deterministically, and a free canvas does not.

### 11.3 The block model

A template is an ordered list of blocks. Nine block types, each compiling to one table row:

| Block | Fields | Notes |
|---|---|---|
| `heading` | text, level (1–2) | Arabic-first; no letter-spacing, `line-height: 1.4` |
| `paragraph` | rich text with `{{bindings}}` | `line-height: 1.7`, never `overflow: hidden` |
| `button` | label, binding for the URL, style (primary/secondary) | A bulletproof VML-fallback button, so it renders in Outlook |
| `session_card` | session binding | Poster thumbnail, title, date, venue, status — the **one** composite block, because most messages are about a session |
| `detail_list` | label/value pairs | The table equivalent of the event page's meta rows |
| `divider` | — | A 1 px silver rule |
| `spacer` | height (sm/md/lg) | |
| `image` | an asset from the brand kit or the org library, alt text | **No SVG** (invariant 11); PNG/JPEG only, width-capped, always with `alt` |
| `footer` | preference link, unsubscribe where switchable, org signature | Composed, not typed — `REQ-NTF-005`'s preference link can never be forgotten |

**Bindings are declared per message key**, exactly as the designer's are: `MSG-reminder_1d` offers
`{{title}}`, `{{starts_at}}`, `{{venue}}`, `{{session_url}}` and nothing else, and the editor lists
them rather than letting an admin type a binding that will render empty. The
`notification_templates_validate` trigger already refuses a template missing a required field; it
gains the binding check, so an unknown binding is refused by the **database**, for every writer.

**The plain-text alternative is generated from the blocks, not authored twice** — a heading becomes
a line, a button becomes `label: url`, a session card becomes four lines. One edit, both parts.

### 11.4 The editor — `/app/admin/emails`

Three panes, the shape the studio uses (§10.2) so an admin learns one tool:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ‹ الرسائل   «تذكير: غدًا»   [مسودة]        [أرسل اختبارًا] [حفظ]           │
├───────────┬──────────────────────────────────┬───────────────────────────┤
│ الكتل     │        معاينة حيّة                │  خصائص الكتلة              │
│           │   ┌────────────────────────┐     │  النص · الرابط · النمط     │
│ عنوان     │   │  [ سطح المحمول ٣٧٥px ] │     │                           │
│ فقرة      │   │  ▸ شعار المؤسسة        │     │  الحقول المتاحة:          │
│ زر        │   │  ▸ عنوان               │     │   {{title}}               │
│ بطاقة جلسة│   │  ▸ بطاقة الجلسة        │     │   {{starts_at}}           │
│ قائمة     │   │  ▸ زر: «أضف للتقويم»   │     │   {{venue}}               │
│ فاصل      │   │  ▸ تذييل التفضيلات     │     │   {{session_url}}         │
│ صورة      │   └────────────────────────┘     │                           │
│           │   [محمول] [سطح مكتب] [نص فقط]    │  ⚠ الفحوصات (١)           │
└───────────┴──────────────────────────────────┴───────────────────────────┘
```

- **The preview is the real renderer.** It calls the same `render.ts` the worker calls, over sample
  data for that message key, and shows the result in a sandboxed iframe — the same discipline
  DEC-017 buys for posters. A preview drawn any other way is a second renderer and the one an
  admin approves is the one that would be wrong.
- **Three preview modes** — phone at 375 px, desktop, and **plain text**. The third is not a
  curiosity: `REQ-NTF-013`'s generated text alternative is what a stripped corporate client actually shows.
- **«أرسل اختبارًا»** sends the rendered message to the admin's own address through the live
  transport, so Outlook-on-Windows is tested by opening Outlook on Windows. This is the single
  most valuable control on the screen and it does not exist today.
- **Checks panel**: a missing preference footer, an image with no `alt`, a binding not offered by
  this message key, a subject over 78 characters, a button with no URL binding, text below 14 px.
  Each names and selects its block.
- **Dark-mode inversion** is checked too — the six major clients invert differently, so the
  preview has a forced-dark toggle and the palette is authored to survive it.

### 11.5 The pre-made library

Two tiers, mirroring the designer's (`DSG-008`, DEC-052):

- **The platform library** — eight designed templates, seeded platform-owned and present for every
  org from creation, exactly as the A27 brand baseline is: **إعلان جلسة · تذكير · تأكيد حجز ·
  تغيّر موعد · إلغاء · طلب تقييم · شهادة · تكريم**. Each is a real design — org logo band, session
  card, one primary button, preference footer — in light and dark, Arabic and English.
- **The org library** — an org duplicates a platform template, edits it, and it becomes theirs. The
  original is never mutated; promotion adds, it never supplies the baseline.
- **Every one of the 25 message keys maps to a template**, and a key with no org override falls
  back to the platform one rather than to a paragraph of unstyled text. That fallback is the whole
  difference: today the default *is* the wall of text.
- **The brand kit drives all of it** (`REQ-DSG-021`) — logo, the three colours `render.ts` already
  reads from `public.brand_kit()`, the signature. Changing the org logo restyles twenty-two emails,
  which is what "one edit in one place" was always supposed to mean.

### 11.6 What this costs

`0088` adds `notification_template_blocks` (ordered, typed, `org_id`, full policy set, in the
generated isolation sweep) and a `blocks jsonb` column on the platform library rows; `render.ts`
gains a block compiler beside its existing string path, so **an org that has not touched its
templates keeps byte-identical output** and the existing golden tests do not move. The string path
is removed only after every key has a block template, in `M13`.

Owner: **`notify`** — it owns `worker/src/mail/**`, the template catalogue and SCR-058 already.
`designer` reviews the block-to-table compiler, because it has done this argument once.


## 12. New requirements to add to `01-prd.md`

`01-prd.md` is the only document that may define a requirement, so this section is a **request**
against it, not a definition. Two new areas are proposed, which also amends `00-overview.md`'s
area table — both are covered by `DEC-070`.

### 12.1 New area `UIX` — interface system

| ID | Requirement |
|---|---|
| `REQ-UIX-001` | A shared component system is the only source of UI primitives; no screen declares its own control styles |
| `REQ-UIX-002` | One shell: persistent search, catalogue entry, notifications, account menu; a bottom tab bar below `md` |
| `REQ-UIX-003` | A session's lifecycle status is displayed identically on every surface that shows a session |
| `REQ-UIX-004` | Derived status, not stored state, governs which actions a session offers; a session past its end time offers none of them |
| `REQ-UIX-005` | Every route has a loading state whose skeleton has the shape of its content |
| `REQ-UIX-006` | Navigation shows progress from the click; no interaction leaves the interface apparently idle |
| `REQ-UIX-007` | Every action control has a pending state that preserves its label |
| `REQ-UIX-008` | Selecting a member is a searchable, keyboard-navigable combobox wherever it occurs |
| `REQ-UIX-009` | A failed submission is summarised above the form, focused, with one link per failed field |
| `REQ-UIX-010` | Field errors are adjacent, coloured, icon-marked and never colour-alone |
| `REQ-UIX-011` | Required fields are positively marked; a failed submission never loses typed values |
| `REQ-UIX-012` | Every list has an empty state that names the next action |
| `REQ-UIX-013` | Every destructive action confirms in a dialog naming the object |
| `REQ-UIX-014` | Motion respects `prefers-reduced-motion` globally, by token |
| `REQ-UIX-016` | Every route boundary with a loading state has an error boundary; the root error page is Arabic and RTL by construction |
| `REQ-UIX-018` | Celebratory motion uses the platform's existing dot-and-line vocabulary; no motion library is added |
| `REQ-UIX-019` | Two moments are orchestrated — reservation and check-in — and each has a named static state under reduced motion |
| `REQ-UIX-020` | Animation touches only transform, opacity and filter, and holds 60 fps on a mid-range phone |
| `REQ-UIX-017` | A skip link precedes the shell, and no sticky or fixed element may obscure the focused element |
| `REQ-UIX-015` | An affordance is rendered only when the viewer's relation to the object permits the action; a derived display state may only be more conservative than the stored state, never less |

### 12.2 New area `SUR` — survey

| ID | Requirement |
|---|---|
| `REQ-SUR-001` | An optional per-session survey, built from a reusable org template |
| `REQ-SUR-002` | Question types: 1–5 scale, single choice, multiple choice, free text; each required or optional |
| `REQ-SUR-003` | Eligibility to answer is check-in, in the rating window — one member, one response |
| `REQ-SUR-004` | The rating and the survey are one screen and one submit |
| `REQ-SUR-005` | **Results are visible to `admin` and `moderator` only. A presenter cannot read them** — by policy |
| `REQ-SUR-006` | Free-text answers are withheld below the minimum-count threshold, as ratings are |
| `REQ-SUR-007` | Results export as audited UTF-8-BOM CSV |
| `REQ-SUR-008` | Response rate is shown against eligible attendees, in the org's numerals |
| `REQ-SUR-009` | A survey response and a rating by the same member are never written correlated in time, and the minimum-count withhold covers every question type, not only free text |

### 12.3 Additions to existing areas

| ID | Requirement |
|---|---|
| `REQ-SES-014` | A session carries optional **أهداف التعلّم** — an ordered list, each ≤ 140 characters, max 8 |
| `REQ-PRO-009` | Approval carries **every** proposal field into the session; an admin edit to content is recorded and notified to the proposer |
| `REQ-PRO-010` | The proposer supplies objectives and tags on the proposal |
| `REQ-PRF-008` | A member may upload, replace or remove their own profile picture; it is stored by the platform, never linked from a third party |
| `REQ-PRF-009` | Initials over a deterministic tint are the default and the permanent fallback; no silhouette placeholder exists |
| `REQ-PRF-010` | A profile picture is sniffed, EXIF-stripped and raster-only, and is subject to moderation takedown |
| `REQ-PRF-011` | Anonymisation clears the picture and deletes the object; the member data export includes it |
| `REQ-INT-010` | Numerals follow the org setting for **display only**; inputs, CSV, serials, verification codes, URLs and filenames are always Western |
| `REQ-DSC-008` | Tags are managed by an admin: rename, merge near-duplicates, delete, with usage counts |
| `REQ-ADM-021` | Staff may download session photographs individually and as an album; every download is audited |
| `REQ-DSG-027` | Staff and presenters may download every rendered poster variant and the print PDF |
| `REQ-DSG-028` | Layers are positioned by direct manipulation — drag, resize, rotate — with snapping and alignment guides, **a single-pointer non-dragging alternative for every dragged operation** (`SC 2.5.7`), and full keyboard parity |
| `REQ-DSG-029` | The editor previews every variant live; a failing check names and selects its layer |
| `REQ-DSG-030` | Image layers carry a focal point that drives every derived crop |
| `REQ-DSG-031` | Certificate issuance is a three-step flow — design, eligibility, issue — with a preflight and per-certificate status |
| `REQ-NTF-009` | A notification template is an ordered list of typed blocks, not a free-form string |
| `REQ-NTF-010` | The template editor previews with the production renderer, in phone, desktop and plain-text modes |
| `REQ-NTF-011` | An admin can send a test of any template to their own address through the live transport |
| `REQ-NTF-012` | Bindings are declared per message key; an unknown binding is refused by the database |
| `REQ-NTF-013` | The plain-text alternative is generated from the blocks, never authored twice |
| `REQ-NTF-014` | Eight designed platform templates are present for every org from creation; every message key resolves to a designed template, never to unstyled text |

---

## 13. Decisions to log in `DECISIONS.md`

| ID | Decision |
|---|---|
| `DEC-069` | The design milestone opens with the three framing decisions of §0: app **and** marketing, plan plus visual canvas, rollout in place group by group |
| `DEC-070` | Two new requirement areas, `UIX` and `SUR`, are added to `00-overview.md`'s area table |
| `DEC-071` | A derived `sessionStatus()` governs what a session offers; the clock is authoritative for the screen, the clock **job** for the database |
| `DEC-072` | The shell gains a bottom tab bar below `md`; the `<details>` disclosure is retired. `REQ-SES-013`'s fold constraint is satisfied more comfortably, not weakened |
| `DEC-073` | Status colours `live` and `ended` join `error` and `success` as functional, non-brand tokens |
| `DEC-074` | The survey is a separate instrument from the rating, sharing eligibility and window but **not** audience: presenters never read survey results |
| `DEC-075` | The proposal is the source of session content; `create_session()` copies every field. An admin content edit is audited and notified |
| `DEC-076` | Staff photo downloads are audited acts; album downloads are a worker job, not a request |
| `DEC-077` | The studio gains direct manipulation, closing `REQ-DSG-022`. The engine — renderer, iframe canvas, parity, fonts — is unchanged |
| `DEC-078` | Invariant 1 is retired **and replaced**: see §14 |
| `DEC-079` | The client brief's icon ban is **split by surface** — the marketing site keeps the eight glyphs; the app gets a house-drawn icon set under §4.2.1's three conditions. The forbidden *imagery* (education clichés) stands on both |
| `DEC-080` | The app adopts the brand's per-section dark/light rhythm: one `theme-dark` band at the top of the event page, the studio previews and the certificate preview |
| `DEC-081` | Email templates are **block-based, not canvas-based** — `@kareem/designer-runtime` is not reused for mail, because table HTML with inline CSS and no web fonts cannot be produced from a free canvas and stay correct |
| `DEC-082` | Eight designed email templates ship platform-owned and seeded for every org, on the A27 pattern: promotion adds, it never supplies the baseline |
| `DEC-083` | **`04-architecture.md` §4's canonical route tree is amended** with the routes this plan adds — `/[locale]/ui` (the `(dev)` component gallery, §4.3) and `/app/admin/sessions/[id]/survey`. `04` is `settled`, so no route is built before this entry exists |
| `DEC-084` | **`04-architecture.md` §11 is amended by `DEC-079`** — its "permitted glyph set … roughly eight inline SVGs" now reads per-surface. The ban on `lucide-react` **as a dependency** is unaffected and stands |
| `DEC-085` | **`CLAUDE.md`'s lead-only path list is amended and all ten `.claude/agents/*.md` are regenerated from it** — `src/components/ui/**` (minus each teammate's assigned files), `src/app/globals.css`, `src/app/[locale]/app/{layout,page}.tsx`, `src/app/[locale]/app/me/layout.tsx`, `src/lib/session-status.ts`, `src/messages/*/ui.json`. **None of these is lead-only today**, and `components/ui/**` is in nobody's never-touch list either. Also records **every** transfer: `app/sessions/page.tsx`, `src/components/browse/**` and `src/messages/*/browse.json` console→content (all three are `console`'s under DEC-048, `TEAM.md:69`); `app/admin/emails/**` console→notify; and `src/app/[locale]/app/members/**`, which is in **no** edit list anywhere today, to `scoring` |
| `DEC-086` | **`09-sitemap-screens.md` is not edited; it is annotated.** Each screen it describes gains a one-line pointer to the `16` section that supersedes its visual notes. `09` keeps the inventory, `16` owns the appearance |
| `DEC-088` | **The `TaskCompleted` hook is made path-aware** before wave 5 — it runs the full `npm run qa` on every teammate's every task today, holding the gate lock, which makes §16.1's lock rule unenforceable |
| `DEC-091` | **A failure model to match the loading model** (§7.4) and **focus management against four sticky layers** (§3.1) — both absent from the first draft, both absent from the codebase. Adds the `error-coverage` and focus-obscured gates |
| `DEC-093` | **`SC 2.5.7` is satisfied by a pointer path, not by the keyboard** (§10.2.1). The inspector's numeric fields are conformance and may not be removed; `ui/reorderable-list` is built once for the three ordered lists |
| `DEC-094` | **The rating and the survey are written DECORRELATED in time** (§9.2a). `ratings.submitted_at` coarsens to the day; the small-n withhold covers every question type, not only free text. A guarantee that no policy test protects |
| `DEC-095` | **Machine-readable surfaces are always Western digits** (§9.2b) — CSV, certificate serials, verification codes, URLs, filenames. Display follows the org setting; nothing a machine parses does |
| `DEC-096` | **Align, distribute and rulers follow the DOCUMENT's direction, not the console's** (§10.2.2). The draft rule would have made a poster's render a function of the editor's locale and moved a parity golden. The overlay carries a documented exemption from the logical-properties rule |
| `DEC-101` | **Wave 5 runs FOUR teammates, not three** — `sessions` takes the form model (8 primitives + `form-state.ts`), `error.tsx` distributes to route owners, and the motion system moves to M10. The lead held ~40 files against 6/9/one, on a lane the ownership audit had already called the tightest in the milestone |
| `DEC-100` | **The app adopts the marketing site's motion vocabulary** (§7.5) — twelve keyframes already exist in `globals.css`, three files use them, all marketing, and `/app` has none. `dot-pulse` and `ripple-ring` *are* the reaction animation. Nine moments in three tiers; no motion library |
| `DEC-099` | **Avatars are stored by the platform and the Google hotlink is retired** (§6.8) — `members.avatar_url` already exists and is already populated from Google's `picture` claim, the DAL already returns it in five modules, `proxy.ts:109` already allows `lh3.googleusercontent.com`, and **no component has ever rendered it**. Hotlinking discloses every viewer to Google; the CSP entry is removed |
| `DEC-098` | **Three Coursera borrows are corrected for scale** (§2.2a): browse is a date-grouped schedule not a nine-facet catalogue, home is one «next up» card not five rails, and **the phone tab bar is contextual — hidden on detail screens and replaced by a bottom action bar**, which answers `REQ-SES-013` better than the in-flow card and removes the double-bar collision |
| `DEC-097` | **§15 carries a coverage table of all 59 routes.** Eleven were in no milestone at all, including sign-in, check-in, the host view and the public card |
| `DEC-092` | **`SlotProps` gains `viewerRelation`** and `getSessionForEvent` returns it — an amendment to DEC-045's "ids, never rows" contract, made explicitly rather than by drift. A derived enum is not a row, and the alternative is four extra round trips on the event page |
| `DEC-090` | **The affordance rule** (§5.4): commitment before convenience, and the derived phase may only remove an affordance, never add one. Eight instances, **five live in the shipped app** — the calendar and tasks slots, the check-in link, the check-in screen, and the host/admin links, none of which carries an RSVP or phase condition |
| `DEC-089` | **Session objectives are a `text[]` on `proposals` and `sessions`**, not a fourth entity — see §9.3 |
| `DEC-087` | **CI grows from four blocking gates to fourteen** — `ui-lint`, `loading-coverage`, `error-coverage`, the gallery baseline, axe, the email goldens, the status matrix, the focus-obscured spec and the skip-link check join `qa`, `policy-diff`, `parity` and `trace`. `13-testing-quality.md` §7's CI budget is amended with their runtime |

---

## 14. The frozen contract — how invariant 1 is retired safely

This is the only part of the plan that touches a page serving real visitors, and it is sequenced
**last**, after the system is proven across the 49 app screens.

`scripts/qa.mjs` is 44 checks. Read them: roughly two-thirds are **behavioural** — the registration
form's role round-trip preserving typed values, the empty-submit summary with three links, focus
moving to the first invalid control, the on-blur email error, the no-JS POST path preserving typed
values, the duplicate-registration panel, no horizontal scroll at 390 px, inputs ≥ 16 px to stop
iOS zooming, reduced-motion behaviour. **Those are the real contract and every one of them
survives.** They are, in fact, the standard §8 now applies to the whole product.

Roughly a third are **appearance-coupled**: the hero headline text, the wordmark being white on
navy, the intro sting playing and hiding, the WebGL constellation being live, the sticky mobile CTA
appearing after the hero.

So invariant 1 is not deleted, it is **re-cut**:

> **Invariant 1 (new).** `/`, `/ar`, `/en`, `/ar/register` and `/og.png` are a live public contract.
> Their **URLs, their registration behaviour and their accessibility floor** may never regress, and
> `scripts/qa.mjs` guards them in CI. Their **appearance** may change only through a
> `DECISIONS.md` entry and a re-baselined visual diff.

The sequence, in M13:

1. Split `qa.mjs` into `qa:contract` (the behavioural checks, unchanged, still blocking) and
   `qa:appearance` (the design-coupled ones, rewritten against the new design in the same commit).
2. Capture `npm run visual capture pre-redesign` from `main` **before** the branch.
3. Rebuild the marketing pages on the new system, keeping the constellation art, the intro sting
   and the cinematic dark hero — they are the product's identity, not its problem.
4. `registrations` is **not touched** (invariant 2, DEC-002). The register form's action, field
   names, validation and no-JS path are preserved byte-for-byte; only its presentation changes.
5. `qa:contract` green before merge; `qa:appearance` rewritten and green; a new visual
   baseline captured and recorded in `STATUS.md`.

   ★ **The split, counted rather than estimated.** `qa.mjs` has **44** `check()` call sites, and
   — correcting an earlier draft of this document — **all 44 carry a literal string label; none is
   computed at runtime.** The eight that looked computed are simply multi-line calls whose label
   sits on a later line (`:94`, `:110`, `:182`, `:220`, `:261`, `:305`, `:351`, `:404`).

   | Bucket | Count | What is in it |
   |---|---|---|
   | **Behavioural — the contract** | **28** | the role round-trip and its two value-retention checks, the error summary, focus to first invalid, on-blur email and its clear-on-fix, the success panel and its focus move, the invite button and its two link assertions, the provider description block, the duplicate panel, **five** no-JS cases, both no-horizontal-scroll checks, the 16 px input floor, both `dir` assertions, the `/`→`/ar` redirect |
   | **Appearance-coupled — rewritten in M13** | **13** | `:101` hero headline text · `:119` network SVG mirrored in LTR · `:127` wordmark white on navy · `:320 :324 :330` sticky CTA · `:367 :373 :386 :404 :416` the sting · `:374` hero sharp after sting · `:379` WebGL live |
   | **Behavioural intent asserted on an appearance element** | **3** | `:342` reduced-motion hero visibility · `:346` reduced-motion sting never plays · `:351` reduced-motion WebGL stays off. These **cannot survive verbatim** if the sting and the WebGL constellation go — each needs re-expressing against whatever replaces them, and the reduced-motion guarantee must not weaken in the process |

   So **`qa:contract` is 28, or 31 if the third bucket is re-expressed rather than moved**, and
   `qa:appearance` is 13. Note that `:119` — the mirrored network SVG — is design-coupled and is
   the check most likely to be missed, because it reads like an RTL contract test.

---

## 15. Milestones

Five milestones, each a mergeable, deployable increment. Sizes are the backlog's `S/M/L` scale.

### M9 — النظام · the system and the shell

The foundation. Nothing else can start cleanly until it exists.

| Work | Size | Owner (§16.2) |
|---|---|---|
| **`ui/index.ts`: the 31 signatures + day-one stubs** — hour one, blocks everything | `S` | lead |
| Tokens, motion tokens, the platform-fixed status colours | `M` | lead |
| The form primitives and the form model — `Field`, `FormSummary`, `formStateFrom()` | `L` | **`sessions`** ★ |
| The loading model — `Link` + `RouteProgress`, `Splash`, `Skeleton`, ~12 `loading.tsx` | `M` | lead |
| **The failure model** — `RouteError` and the hand-written Arabic `global-error.tsx` | `S` | lead |
| ~12 `error.tsx` + a `not-found.tsx` per dynamic segment, **each under its own track's routes** | `S` each | every track |
| **Focus management** — the skip link, the `scroll-padding` tokens, and the focus-obscured Playwright gate | `S` | lead |
| **`main`'s `padding-block-end`**, shipped in the same commit as the tab bar, proven on an untouched old screen | `S` | lead |
| The shell: desktop two-row, phone tab bar, search entry, account menu; the `/app/me` tab shell | `L` | lead |
| `sessionPhase()` · `seatState()` · `viewerRelation()` + `SessionStatusBadge` | `M` | lead |
| `ui-lint`, `loading-coverage`, the `(dev)` gallery route, the `visual-diff` entry | `M` | lead |
| The data-dense primitives — `data-table`, `combobox`, `menu`, `tabs`, `sheet`, `date-time`, `file-drop`; the admin rail | `L` | `console` |
| The display primitives — `card`, `badge`, `tag-chip`, `avatar`, `progress`, `empty-state`, `stat`, `page-header`, `section-header`, `panel`, `prose` | `L` | `content` |
| §5.3's 49-cell matrix wired through RSVP, calendar and check-in | `M` | `checkin` |
| Toasts | `S` | lead |

**Ships:** every existing screen keeps working, on the new shell, with loading and status. Asks
**4, 5, 6** are already answered at the end of M9.

### M10 — عضو · the member surfaces

| | |
|---|---|
| Home with rails | `M` |
| Browse: rail, facet counts, sort, chips, the card in four densities | `L` |
| The event page rebuild: hero, action card, sub-nav, presenter cards | `L` |
| `/app/me` as a tabbed hub | `M` |
| Objectives — `0083`, proposal field, event page section | `M` |
| Tags — `0085`, combobox on propose, chips, facet | `M` |
| Bookmark and share on every surface | `S` |
| The member picker combobox, adopted by the proposal form | `S` |
| **The motion system** (§7.5) — the vocabulary, the two Tier-1 moments, the five Tier-2, the reduced-motion and frame-budget gates | `M` |
| Profiles, leaderboards, notifications, calendar on the system | `M` |
| **Avatars end to end** — `0089`, the upload route, EXIF strip, the 96/192 derivatives, initials, the Google import prompt, the six placements, and retiring the `lh3.googleusercontent.com` CSP entry | `M` |

**Ships:** asks **2, 8, 9, 11**.

### M11 — إدارة · the console

| Work | Size | Owner (§16.4) |
|---|---|---|
| The admin left rail and the real dashboard | `M` | `console` |
| `DataTable` + the stacked-card phone treatment, across every list | `L` | `console` |
| `create_session()` carries every proposal field — **`0082`, promoted at sync 1** | `M` | `sessions` |
| The two-tab schedule and the content-edit diff, on top of `0082` | `L` | `console` |
| Survey: `0084`, the four entities, the combined rate screen, the results screen, CSV | `L` | `event` |
| Downloads: the poster menu reuses `signExportUrl()` (`S`); photos need their own signer + `zip_session_photos` + `0086` | `M` | `designer` (poster) · `content` (photos) |
| Moderation queues, exports, audit, settings on the system | `M` | `console` |

**Ships:** asks **3, 7, 10**.

★ The platform console moves to **M13** — it is cosmetic work on screens only the owner sees, and
moving it keeps this wave at four teammates with one hard ordering (`0082` before the schedule tab)
instead of five with two.

### M12 — الاستوديو · the studio

| | |
|---|---|
| The editor shell: top bar, left rail tabs, inspector accordion, variant strip | `L` |
| Direct manipulation: drag, resize, rotate, marquee, align/distribute, snapping | `L` |
| Keyboard parity and the a11y pass on the canvas | `M` |
| Focal-point cropping through `derive()` — `0087` | `M` |
| The poster three-card chooser with working controls and the detach dialog | `M` |
| The certificate three-step flow with preflight and per-item status | `L` |
| Template management and the platform library separation | `M` |
| Phone review screen | `S` |

**And the email studio (ask 13), same milestone, different owner:**

| | |
|---|---|
| The block model, the compiler and the generated text alternative — `0088` | `L` |
| The three-pane editor with the real-renderer preview and three modes | `L` |
| «أرسل اختبارًا» through the live transport, and the checks panel | `M` |
| The eight designed platform templates, light and dark, AR and EN | `L` |
| Binding declaration per message key + the trigger check | `S` |

**Ships:** ask **12**. Parity goldens must not move; any diff is a reviewed change (invariant on
goldens, DEC-048).

### ★★ The eleven screens that were in no milestone at all

Mapping all 59 `page.tsx` files against the five milestone tables above found **eleven routes in
none of them.** Four are public or pre-auth, so they carry the *first* impression of the redesign;
three are the operational core of the attend-and-be-recognised loop; one is the hardest RTL surface
in the product.

| Route | Why it cannot be left out | Moves to |
|---|---|---|
| `(auth)/sign-in` | **The first screen every member ever sees**, and the only place `SC 3.3.8` Accessible Authentication applies — allow paste, `autocomplete="one-time-code"`, never block a password manager | **M9**, with the shell |
| `(auth)/choose-org` | A multi-company group: the fork that decides which `org_id` the whole session carries, permanently (`REQ-AUT-004`) | **M9** |
| `(auth)/no-access` | The dead end an invited-but-unprovisioned member lands on — the product's only answer to «فتحت الرابط ولا شيء يعمل». Principle 5 applies here more than anywhere | **M9** |
| `app/sessions/[id]/check-in` | «The most operationally important input in the product» (`10` §6) — standing, one-handed, under time pressure. And §5.4.1 row 4b just rewrote it | **M10** |
| `app/sessions/[id]/host` | Projected in front of a room, often landscape, from a shared machine with a possibly-wrong clock. **The only screen with an audience rather than a user** | **M10** |
| `app/sessions/[id]/rate` | Appears above only as the *host* of the M11 survey. The rating screen itself was never designed while §9.2 rebuilt what sits on it | **M10** |
| `app/sessions/[id]/materials/[materialId]` | The RTL document viewer — the most complex read surface here, and `10` §2.4 flags its next/previous direction as «the one that gets missed», with a named test case | **M10** |
| `verify/[code]` | Public, unauthenticated, reached from a **printed** certificate. The platform's only outward-facing proof artefact — and where §9.2b's numeral bug fails silently | **M12**, with the certificates |
| `s/[id]` | The public session card — **how members actually arrive** (`.impeccable.md`'s WhatsApp entry path). The first impression of the redesign for everyone outside the org | **M10** |
| `legal/privacy` · `legal/terms` | Public, and the natural home for the accessibility statement this plan does not yet have | **M13** |
| `app/me/privacy` | The PDPL self-service surface (`PRF-006/007`) — **the screen a member uses when they are unhappy**, which is the worst possible time to meet an unrebuilt page | **M13** |

**And the rule that stops this recurring: §15 carries a coverage table of all 59 routes**, each with
a milestone or an explicit, reasoned «leave». A screen absent from a plan is not a screen deferred —
it is a screen nobody decided about. **`DEC-097`.**

### M13 — الواجهة العامة · marketing and the closing pass

| | |
|---|---|
| `qa.mjs` split into contract and appearance | `M` |
| The marketing rebuild on the system — §14 | `L` |
| The register form re-presented, behaviour byte-identical | `M` |
| `REQ-NFR-007` accessibility pass over every screen — WCAG 2.2 AA | `M` |
| `REQ-NFR-008` performance pass — the per-screen budgets | `M` |
| The platform console on the system (deferred from M11) | `M` |
| Retire `templates.ts`'s string path once every key has a block template | `S` |
| Visual re-baseline, new `og.png`, `STATUS.md` | `S` |

---

## 16. Who does what

> This section is the one the owner asked to be hardest. A **visual** rebuild crosses every
> ownership boundary in `TEAM.md`, because every teammate's components need re-skinning. If the
> division is written as "teammate X redesigns screen Y", it deadlocks on day one.

### 16.0 The mechanism — the same one wave 1 used

`TEAM.md` §2 solved one shared surface (the event page) with a **contract**: `SlotProps` is
`{sessionId, memberId, locale}` — ids, never rows — so `sessions` owns the page, `checkin` and
`event` own their slots, and none of the three ever reads another's code.

**The design system is that contract, at product scale.** The rule that follows from it:

> **Nobody redesigns anybody else's screen.** The lead publishes the primitives and the shell;
> every teammate re-skins *their own* components against them. A teammate who needs a primitive
> changed asks the lead; they do not edit it.

Three consequences, all of which are the difference between this working and not:

1. **Ownership inside `src/components/ui/` is per FILE, not per directory.** A glob (`ui/**`) with
   four writers is the exact failure `TEAM.md` exists to prevent; thirty-one separate files with
   one owner each is not. Every edit list below names files.
2. **The interface is frozen before the implementations exist.** On day one of M9 the lead commits
   `src/components/ui/index.ts` carrying the **full type signature of all thirty-one primitives**,
   with stub implementations that render plain semantic HTML. Consumers import and typecheck
   immediately; implementations land underneath them. This is precisely what
   `src/components/sessions/slots/` did in wave 1, and it is why wave 1 parallelised at all.
3. **The event page grows slots rather than being rebuilt by one hand.** `SLOT_NAMES` gains three:
   `SessionTags` and `SessionActions` (bookmark + share) to `content`, `AttendanceOutcome` to
   `checkin`. `sessions` owns the page's frame, hero and objectives; it never touches another
   track's slot.

### 16.1 Standing rules for every wave of this milestone

★★ **The gate-lock rule above is not enforceable as written, and fixing it is a prerequisite.**
`.claude/settings.json` registers `.claude/hooks/task-gate.sh` on **`TaskCompleted`** with a
2400-second timeout, and that script runs the **full `npm run qa`** — stub, `next start`,
Puppeteer, the whole suite — holding `/tmp/task-gate.lock`, **every time any teammate finishes any
task**. A teammate cannot opt out by policy. Four teammates × roughly six stories is about
twenty-four forced `qa` runs per wave that the rule above believes are not happening. And
`scripts/lib/gate-lock.mjs:22-23` lets a waiter **give up after 20 minutes and proceed anyway** —
two `next start` processes on port 3000.

**So the hook is made path-aware before wave 5 opens.** `npm run qa` guards the frozen marketing
routes; a task that touched only `app/admin/**` or `components/scoring/**` cannot have broken them.
The hook runs `npx tsc --noEmit && npm run lint && npx vitest run` — no server, no lock — and falls
through to the full `qa` only when the changed paths intersect
`src/app/[locale]/(marketing)/**`, `public/**`, `src/app/[locale]/layout.tsx`,
`src/app/globals.css`, `src/proxy.ts` or the marketing components. Roughly twenty lines in a
lead-only file. During M9 the lead touches `globals.css` and still pays the full cost; the
teammates stop paying it two dozen times a wave. **`DEC-088`.**

★ **Before wave 5 is spawned, the ten `.claude/agents/*.md` definitions must be regenerated.**
This is not housekeeping; it is the difference between the rules below being enforced and being
folklore. Verified against the tree:

- **`src/components/ui/**` appears in no teammate's edit list and, more dangerously, in no
  teammate's *never-touch* list.** `console.md:26` enumerates
  `src/components/{search,sessions,checkin,event,materials,photos,viewer,tasks,scoring,notifications,calendar,posters,certificates,designer}/**`
  and omits `ui`. Today that is harmless — three files. The moment it holds thirty-one primitives
  it is the most-contended directory in the repository and nothing forbids anyone from editing it.
- **`src/app/globals.css` is lead-only by folklore.** It is absent from `CLAUDE.md`'s lead-only
  list and is forbidden only in `branding.md:26`. The wave-1 agents — `sessions`, `checkin`,
  `event`, written before the shell mattered — forbid neither it nor the app shell.
- **`src/app/[locale]/app/layout.tsx` is likewise absent from the lead-only list**, though seven of
  the ten agent files happen to forbid it.

So `DEC-085` adds to `CLAUDE.md`'s lead-only list: **`src/components/ui/index.ts`**,
`src/app/globals.css`, `src/app/[locale]/app/{layout,page}.tsx`,
`src/app/[locale]/app/me/layout.tsx`, `src/lib/session-status.ts`, `src/lib/form-state.ts`,
**`src/proxy.ts`**, `src/app/[locale]/(dev)/**` and `src/messages/*/ui.json` — and **every one of
the ten agent definitions is regenerated from it in the same commit, with the per-file `ui/`
ownership spelled out as three literal file lists, not globs.** Ownership is enforced by those
never-touch paragraphs or it is not enforced at all. No wave-5 teammate is spawned before it lands.

| Rule | Why |
|---|---|
| **`ui/index.ts` is lead-only and append-only, and exports TYPES ONLY** — implementations are imported by path | It is the one file every track imports, so a conflict in it stops everyone. And a runtime barrel would drag `toast`, `combobox` and `route-progress` — all `"use client"` — into the client graph of every server page that imports `Card` |
| **The `TaskCompleted` hook is made path-aware before wave 5 opens** | §16.1's "`qa` is lead-only" is a *convention*; `.claude/settings.json`'s `TaskCompleted` hook is the *harness*, and the harness wins — see ★★ below |
| **A teammate never edits a primitive they do not own.** They open a `docs/plan/notes/<name>.md` request; the lead does it at the next sync | Thirty-one files, thirty-one owners, no races |
| **Messages: `src/messages/index.ts` gains namespaces by APPEND ONLY, never reorder** | The deep-merge order is load-bearing (DEC-047) |
| **`npm run qa` and `npm run visual` are LEAD-ONLY for this milestone** | They take the gate lock and serve on port 3000; four teammates finishing stories would thrash it. Teammates run `tsc`, `lint`, `npm test`, `npm run test:rls` — none of which take the lock — and **one** e2e spec each, through the lock, only when their story is done |
| **`ui-lint` and `loading-coverage` ship with a committed allowlist that may only shrink** | 65 files carry the copied class string *today* (§1.1). A gate that hard-fails from M9 blocks every PR for four milestones. It flips to hard-fail in M13 |
| **SQL: one `supabase/proposed/<name>/` per teammate per wave**, and the ordering below is explicit | Teammates never write `supabase/migrations/` |
| **`0055`'s hex-literal guard and the parity goldens do not move** | Any golden diff is a lead-reviewed change (DEC-048) |

### 16.2 Wave 5 — M9, the system

The previous draft gave the whole of M9 to the lead and left `console` and `checkin` waiting. That
is a one-agent critical path with three idle agents attached, and it is corrected here: the
primitives are **split by their future consumer**, so the track that will live with a component is
the track that builds it.

| Teammate | Builds | Edits only |
|---|---|---|
| **lead** (12 primitives + the spine) | tokens; `ui/index.ts` + the day-one stubs; the shell and both page shells; the three status functions; the loading model; **the cross-cutting type and layout primitives**; the shared `RouteError` and `global-error.tsx`; `proxy.ts`; the gate scripts; the `(dev)` gallery | `src/app/globals.css`, `src/components/ui/{index,button,icon-button,link,skeleton,route-progress,splash,toast,page-header,section-header,prose,route-error}.tsx`, `src/app/[locale]/app/{layout,page}.tsx`, `src/app/[locale]/app/me/layout.tsx`, `src/app/[locale]/global-error.tsx`, `src/lib/session-status.ts`, `src/proxy.ts`, the ~12 `loading.tsx` **named individually**, `src/app/[locale]/(dev)/**`, `src/messages/*/ui.json`, `scripts/**`, `.claude/hooks/task-gate.sh` |
| **`sessions`** ★ (9) | **the whole form model** — it owns the propose form, the largest in the product, and is the track that will live with every rough edge | `src/components/ui/{field,input,textarea,select,checkbox,radio-group,switch,form-summary}.tsx`, `src/lib/form-state.ts`, `src/app/[locale]/app/{sessions,propose}/**` `error.tsx`, its tests |
| `console` (6) | the two primitives where **no upstream library does the hard part**, plus the Radix shells | `src/components/ui/{data-table,combobox,menu,tabs,sheet,date-time}.tsx`, `src/app/[locale]/app/admin/layout.tsx` + its `error.tsx`, `src/messages/*/admin.json`, its tests |
| `content` (9) | the card-shaped primitives, and the upload control it owns every consumer of | `src/components/ui/{card,badge,tag-chip,avatar,progress,empty-state,stat,panel,file-drop}.tsx`, `src/messages/*/browse.json`, its tests |
| `checkin` | §5.3's affordance matrix, wired, **including the four §5.4 gates** | `src/components/checkin/**` (incl. `attendance-outcome.tsx`), `src/lib/dal/{rsvp,checkin}.ts`, its tests |

**Why the split falls where it does**, since "by future consumer" is a rule with two exceptions:

- **`combobox` and `data-table` go to `console` even though they are the hardest**, because they are
  the only two in the set where **no upstream library does the work**: combobox is the full ARIA 1.2
  pattern with `aria-activedescendant` over Arabic-normalised typeahead, and `data-table` carries
  `aria-sort`, selection labelling and a whole second rendering mode for the phone stack. `menu`,
  `tabs` and `sheet` are Radix wrappers where Radix owns the accessibility, and `dialog.tsx` is
  already in the repo as the house precedent to copy. `console` will live with all six.
  ★ `console` also already owns a **working combobox** — `src/components/admin/member-picker.tsx`,
  built for SCR-053 — so `ui/combobox` is *promote and generalise*, not build from nothing.
- **`page-header`, `section-header` and `prose` go to the LEAD, not to `content`**, because they
  have no single future consumer. `page-header`'s consumer is every screen — §6.1 note 5 calls it
  "what makes the product feel like one product" — and handing the three most cross-cutting
  type/layout primitives to a track that will never see most of their call sites is the one place
  the by-consumer rule breaks down.
- **`file-drop` goes to `content`, not `console`.** `content` owns every upload path in the product
  (`app/api/{upload,materials,photos}/**`, `lib/storage/**`); `console` has no upload surface at all.

★★ **This table was rebalanced after the ownership audit, and then again after the owner asked
whether teammates had been accounted for.** They had been in the *estimate* — waves 1–4 each ran
two or three teammates and each took one lead session, so "one wave per session" is already a
with-teammates number — **but not in this table.** The lead held nineteen primitives plus the shell
plus both page shells plus the form model plus the loading model plus `proxy.ts` plus every gate
script, which the audit had already called "the tightest single lane in the milestone" — and then
§7.4's failure model and §7.5's motion system were added to it afterwards without re-balancing.
Three corrections:

1. **The form model goes to `sessions`** — eight primitives plus `form-state.ts`. It owns the
   propose form, which is the largest and most-complained-about form in the product, and it is an
   opus track. Wave 5 therefore runs **four** teammates, which `CLAUDE.md` allows ("three to five").
2. **`error.tsx` distributes to route owners**, not to the lead. The lead owns the shared
   `RouteError` and `global-error.tsx` — the one file that cannot read the DAL or a translation
   provider — and each track writes the boundaries under its own routes. Consistent with the
   per-file principle in §16.0.
3. ★ **The motion system moves out of M9 into M10** — and not only to shed load. **You cannot build
   the reservation animation before the reservation card exists**, and the card is M10; check-in is
   an M10 screen too, per the eleven-screens table. Only the `--dur-*` and `--ease-out` tokens stay
   in M9, where §4.1 already puts them. The nine moments land with the screens they celebrate.

**Ordering inside the wave.** The lead's `ui/index.ts` stub commit is **hour one** and blocks
everything; after it, the four tracks are independent. `checkin` additionally waits on
`src/lib/session-status.ts`, which is the lead's second commit, same day.

**Both `console` and `content` are Sonnet tracks working in unfamiliar file shapes.** DEC-047's
lesson applies: a Sonnet teammate idles at a checkpoint rather than asking. The lead re-drives each
with the next concrete unit at every sync rather than waiting for a ready signal.

**Ships at the end of M9:** every existing screen still works, on the new shell, with loading and
status — and **asks 4, 5 and 6 are already answered** before a single screen is redesigned.

### 16.3 Wave 6 — M10, the member surfaces

| Teammate | Screens | Edits only | SQL |
|---|---|---|---|
| `sessions` | the event page frame, hero and objectives; the propose flow; **the reservation Tier-1 moment** | `src/app/[locale]/app/sessions/[id]/page.tsx`, `src/app/[locale]/app/propose/**`, `src/lib/dal/{sessions,proposals}.ts`, `src/components/sessions/**`, `src/messages/*/{sessions,proposals}.json` | `proposed/sessions/` → **`0082`** objectives |
| `content` | browse, the cards, tags, bookmark + share slots, **the avatar upload route and its path-builder entry** | `src/app/api/upload/avatar/**`, `packages/storage-paths/src/content.ts`, `src/app/[locale]/app/sessions/page.tsx` ★, `src/components/{browse,search,materials,photos}/**`, `src/lib/dal/{search,bookmarks,tags}.ts`, `src/app/[locale]/app/me/bookmarks/**`, `src/messages/*/{browse,search}.json` | `proposed/content/` → **`0083`** tags |
| `scoring` | profiles, leaderboards, the points tab, **avatars on every surface** | `src/app/[locale]/app/{leaderboards,me/points,members}/**`, `src/components/scoring/**`, `src/lib/dal/profiles.ts`, `src/messages/*/{scoring,leaderboards,recognition,profile}.json` | `proposed/scoring/` → **`0089`** ★ |
| `notify` | the notifications and calendar tabs | `src/app/[locale]/app/me/{notifications,calendar}/**`, `src/components/{notifications,calendar}/**`, `src/messages/*/{notifications,calendar}.json` | — |

★ **`app/sessions/page.tsx` is `console`'s under DEC-048.** It is **transferred to `content`** for
M10 and stays there — `content` already owns `searchSessions()`, the filters, bookmarks and tags,
which is everything the page renders. Logged as part of `DEC-085`. `console` is not in this wave.

**The home page (`/app/page.tsx`) and the `/app/me` tab shell are the lead's**, because both are
composed entirely of other tracks' cards and rails — the same reason the shell is.

### 16.4 Wave 7 — M11, the consoles

| Teammate | Screens | Edits only | SQL |
|---|---|---|---|
| `console` | the admin rail and dashboard; every list on `DataTable`; the two-tab schedule; moderation; exports; audit | `src/app/[locale]/app/admin/**` except `designer`, `templates`, `emails`, `branding`, `sessions/[id]/certificates` **and `sessions/[id]/survey`** ★; `src/app/api/admin/**`; `src/lib/dal/admin*.ts`; `src/components/admin/**`; `src/messages/*/admin.json` | `proposed/console/` |
| `sessions` | `create_session()` carries every proposal field; the content-edit audit and notice | `src/lib/dal/{sessions,proposals}.ts`, `src/components/sessions/**` | `proposed/sessions/` → **`0084`** ★ |
| `event` | the survey, end to end | `src/app/[locale]/app/sessions/[id]/rate/**`, `src/app/[locale]/app/admin/sessions/[id]/survey/**`, `src/lib/dal/{ratings,surveys}.ts`, `src/components/{event,survey}/**`, `src/messages/*/{ratings,survey}.json` | `proposed/event/` → **`0085`** survey |
| `content` | downloads — poster menu, photo menu, the zip job | `src/app/api/{upload,materials,photos,downloads}/**`, `src/lib/storage/**`, `src/lib/dal/{materials,photos}.ts`, `worker/src/content/**` | `proposed/content/` → **`0086`** audit rows |

★ **Two hard orderings in this wave, both resolved at sync 1.** `0084` must be promoted before
`console` builds the two-tab schedule (the second tab reads the fields it adds), and `0085` plus
`survey_results()` before `console` — or `event` — builds the results screen. `console` does the
rail, the dashboard and the tables first, which needs neither.

★★ **The numbers are promotion order and must stay contiguous.** An earlier draft gave `sessions`
`0083` in M10 and `0082` in M11 — so a fresh `supabase db reset` would apply `0082` first, a file
that does not exist until a wave later, and wave 6 would skip `0084` entirely, producing an
intermediate history nobody ever tested. Invariant 3 is forward-only; the ordering below is the
promotion order and the lead numbers to it:

| # | What | Wave | Proposer |
|---|---|---|---|
| `0082` | objectives on `proposals` and `sessions` | 6 · M10 | `sessions` |
| `0083` | tags: `usage_count` trigger + the merge function | 6 · M10 | `content` |
| `0089` ★★ | avatars: `avatar_url` becomes a storage path, the `^https://` check is dropped, anonymisation clears it | 6 · M10 | `scoring` |
| `0084` | `create_session()` copies every proposal field; the content-edit audit | 7 · M11 | `sessions` |
| `0085` | the four survey entities + `survey_results()` | 7 · M11 | `event` |
| `0086` | download audit action rows | 7 · M11 | `content` |
| `0087` | image-layer focal point | 8 · M12 | `designer` |
| `0088` | `notification_template_blocks` + the platform library's `blocks jsonb` | 8 · M12 | `notify` |

★★ **`0089` is numbered last but promoted in wave 6**, and that is deliberate: it was added after
the table was drafted, and renumbering the five files between would invalidate every
`supabase/proposed/` header already written against them. Nothing in `0084`–`0088` touches
`members`, so a fresh `supabase db reset` is unaffected — but **the lead states it at sync 1 so no
teammate assumes the numbers are contiguous with the waves.**

`platform` is **not** in this wave. The platform console is cosmetic-only work on screens nobody
outside the owner sees; it moves to M13's closing pass, which frees a seat.

### 16.5 Wave 8 — M12, the two studios

| Teammate | Screens | Edits only | SQL |
|---|---|---|---|
| `designer` | the poster studio, the certificate three-step, template management | `packages/designer-runtime/**`, `src/app/[locale]/app/admin/{designer,templates}/**`, `src/app/[locale]/app/admin/sessions/[id]/certificates/**`, `src/app/api/designer/**`, `src/lib/dal/{designer,templates,posters,certificates}.ts`, `src/components/{designer,posters,certificates}/**`, `worker/src/render/**`, `scripts/parity/**` minus `goldens/` | `proposed/designer/` → **`0087`** focal point |
| `notify` | the email studio and the eight platform templates | `worker/src/mail/**`, `src/app/[locale]/app/admin/emails/**` ★, `src/lib/dal/notifications.ts`, `src/components/email/**`, `src/messages/*/notifications.json` | `proposed/notify/` → **`0088`** blocks |

★ `admin/emails` was handed to `console` at wave 3 on DEC-042's pattern. It **returns to `notify`**
for M12 and stays there: the editor is inseparable from the renderer, and `notify` owns
`worker/src/mail/**`. Logged as part of `DEC-085`. `console` is not in this wave.

**Two tracks, zero shared files.** The one thing they must agree on is the *brand*: both read
`getBrandKit()`, neither writes it.

### 16.6 Wave 9 — M13, marketing and the closing pass

| Teammate | Work | Edits only |
|---|---|---|
| **lead** | the `qa` split; the marketing rebuild; the register form re-presented; the visual re-baseline; `og.png` | `src/app/[locale]/(marketing)/**`, `src/app/[locale]/layout.tsx`, `public/**`, `scripts/**`, `src/messages/*/marketing.json` |
| `branding` | **status-colour contrast enforcement** (below); the brand-kit screen on the system | `src/app/[locale]/app/admin/branding/**`, `src/lib/brand/**`, `src/components/branding/**`, `src/messages/*/branding.json`, `proposed/branding/` |
| `platform` | the platform console on the system (deferred from M11) | `src/app/[locale]/app/platform/**`, `src/app/[locale]/legal/**`, `src/app/[locale]/app/me/privacy/**`, `src/components/{platform,legal,privacy}/**` |
| **all** | `REQ-NFR-007` accessibility and `REQ-NFR-008` performance, **each track in its own folders** | their own edit lists |

★ **`branding` has no "marketing consumers" to build** — an earlier draft assigned it some. There
are none: `orgTheme()` (`app/[locale]/app/layout.tsx:37-42`) returns `null` unless
`state.kind === "member"`, marketing lives outside that layout in `(marketing)/**`, and nothing
under `(marketing)` references `getBrandKit` or `brand_kit`. A marketing visitor has no org by
construction. Its real work this wave is the consequence §4.1 left dangling:

> **An org can override `light_canvas` and `light_surface` to any string matching
> `^#[0-9a-f]{6}$`** (`0068_brand_kits.sql:69-70` — a regex, and no other constraint), while
> `--color-live-bg #fbf5ea` and `--color-ended-bg #f1f3f7` are near-white and frozen. An org with a
> dark canvas gets near-white badge chips on dark cards, and `--color-ended #5b6780` as text on an
> overridden surface can fall below 4.5:1. `checkContrast()` exists (`src/lib/brand/contrast.ts:38`)
> but is **advisory only** — its two call sites are `components/branding/contrast-badge.tsx:27` and
> a unit test. `save_brand_kit()` enforces nothing.

So `branding` adds the status pairs to the contrast set and makes `save_brand_kit()` **refuse** a
palette on which a status badge fails AA. That is `REQ-NFR-007` at the one place it can actually be
enforced, and it is why the platform-fixed decision in §4.1 is safe rather than merely stated.

The closing pass is the one piece of work that touches every folder, which is why it is expressed
as "each track in its own folders" and not as one agent sweeping the tree.

### 16.7 What the lead must not delegate

The shell, `ui/index.ts`, `globals.css`, `session-status.ts`, `form-state.ts`, **`proxy.ts`**, the
~12 `loading.tsx` files **named explicitly rather than as a glob**, the three page/layout shells
(`app/layout.tsx`, `app/page.tsx`, `me/layout.tsx`), `src/app/[locale]/(dev)/**`, `scripts/**`,
**`.claude/hooks/task-gate.sh` and the ten agent definitions**, the migration promotion and
numbering, the goldens, the `04` and `CLAUDE.md` amendments, and both PRs per wave. Everything on that list is either a file
every track imports or a decision no track can take alone.

## 17. Testing and the definition of done

Everything in `CLAUDE.md`'s definition of done still applies. This milestone adds:

★ **This milestone adds six gates to the four `CLAUDE.md` names, which is a decision, not a
detail.** Four blocking gates exist today (`qa`, `policy-diff`, `parity`, `trace`). Adding
`ui-lint`, `loading-coverage`, the gallery baseline, axe, the email goldens and the status matrix
takes CI to fourteen once `error-coverage`, the focus-obscured spec and the skip-link check join them. Two of them are non-trivial to build and must not be hand-waved:

- **`ui-lint`** — "a simple AST check" is not a specification. It is a `ts-morph` pass over
  `src/app/**` and `src/components/**`, **excluding `src/components/ui/` for both rules**, that
  fails on (a) a JSX `<input|select|textarea>` whose nearest ancestor is not `<Field>`, and (b) a
  string literal matching `/rounded-field border border-edge(-strong)?/`. ★ The exclusion is not
  optional and applies to **both** rules — `ui/input.tsx` and `ui/select.tsx` must contain a raw
  `<input>` that is not wrapped in `<Field>`, so a pass scoped to `src/components/**` without it
  fails the primitives it exists to protect. Both rules have a documented escape-hatch comment, and
  both ship behind the shrinking allowlist of §16.1. The lead writes it in M9 — `scripts/**` is
  lead-only.
- **`loading-coverage`** — walks `src/app/[locale]/app/**`, and fails when a segment that declares
  a `page.tsx` has **no `loading.tsx` at or above it**. Not "one per route": a `loading.tsx` covers
  its segment *and its children*, so the **49** pages under `app/[locale]/app/**` need roughly **a dozen** files placed at meaningful
  boundaries, not one per page. `find src/app/[locale] -name page.tsx` returns 59, but that
  includes marketing, `(auth)`, `legal`, `verify` and `/s/[id]`; **under `app/[locale]/app/**` there
  are 49**, which is exactly this gate's scope. (`09-sitemap-screens.md` documents 53 *screens* —
  a third number, and the three are not interchangeable.)

`DEC-087` logs the gate additions and their runtime cost against the CI budget in `13` §7.

| Gate | What it asserts |
|---|---|
| **The gallery baseline** | `npm run visual` over `/[locale]/ui` — the unauthenticated dev-only gallery of §4.3, added as one entry to `visual-diff.mjs`'s `ROUTES`. The system's own regression net, and the reason the gallery is **not** behind admin auth |
| **`ui-lint`** | fails CI when a `<form>` holds an `<input>` outside `<Field>`, or a file declares a control class string the system already owns |
| **`loading-coverage`** | fails CI when a segment under `app/[locale]/app/**` that declares a `page.tsx` has no `loading.tsx` **at or above it** — the "at or above" is load-bearing, and a gate written without it produces 49 files instead of ~12 |
| **`error-coverage`** | the same walk, the same "at or above" rule, for `error.tsx`. A boundary with a skeleton and no error boundary fails. Plus: every **dynamic** segment needs a `not-found.tsx`, and `global-error.tsx` must exist and must contain `dir="rtl"` — it is the one file that cannot get its direction from a provider (§7.4) |
| **Focus not obscured, and never two bars** | a Playwright spec that tabs every focusable element on the event page and the proposal form, at 390 px and desktop, **asserts at most one fixed bottom bar per screen**, reads the focused element's `getBoundingClientRect()` and **fails when a fixed or sticky element intersects it**. `SC 2.4.11` is not assertable by eye, and this plan adds four sticky layers (§3.1) |
| **No-drag operability** | a Playwright case that performs every studio operation with `page.click()` alone — no `mouse.down/move/up` — and asserts the document changed. `SC 2.5.7` is invisible to axe and to keyboard tests, and this plan introduces dragging in five places (§10.2.1) |
| **Skip link** | the first focusable element in the shell targets `#main` and is visible when focused. `SC 2.4.1`, and a 15-item admin rail makes it load-bearing |
| **The status matrix** | one assertion per cell of §5.3 — **7 phases × 7 viewer relations = 49**, plus a totality test that feeds `sessionPhase()` every state × null-schedule combination and asserts it never returns undefined. Ask 4 cannot regress |
| **Survey RLS** | the generated isolation sweep covers the four new tables the day they exist (invariant 5); one explicit case proves **a presenter reading their own session's survey results is refused** |
| **Email goldens** | the 25 messages rendered to HTML and text, byte-compared; an org with no override must render **byte-identical** to today until its key is migrated |
| **Axe — split in two** | ★ `tests/e2e/a11y.spec.ts:26` is `test.skip(!SERVICE_KEY \|\| !PUBLISHABLE_KEY)` and `playwright.config.ts:24-26` serves the **stub** in CI, so "axe on every screen in CI" would report green **by skipping every assertion**. So: **primitives** get `axe-core` inside the Vitest `components` project (jsdom, already configured, no server, no lock, genuinely blocking in CI — and it catches what matters for a component system: `Field`'s `aria-describedby` wiring, missing accessible names, token-pair contrast). **Screens** stay under `test:e2e:local`, sharded per track, **lead-run at sync points** — `a11y.spec.ts:31` is `describe.configure({mode:"serial"})`, so 49 screens is a long serial run holding the lock |
| **390 px RTL** | one screenshot per screen, looked at by a human, as today |
| **Parity** | unchanged and still 0.000% — M12 may not move a golden without a reviewed diff |
| **`qa:contract`** | the behavioural two-thirds of the current suite, never allowed to regress, from M13 onward |

---

## 18. Risks

| Risk | Mitigation |
|---|---|
| **A shared `ui/**` becomes a bottleneck across four teammates** | It lands complete in M9, before any track needs it, and the lead owns it. Additions after M9 are pull requests to the lead, not edits |
| **The marketing rebuild breaks a live signup** | The register form's action, names, validation and no-JS path are preserved byte-for-byte; `qa:contract` is blocking; `registrations` is untouched; a preview URL is opened on a real phone before promotion |
| **Drag in an RTL iframe overlay gets the axis wrong** | Arrow keys follow the visual axis, the artboard carries the document's direction, and the parity suite renders an Arabic poster after every editor change |
| **Focal-point cropping moves a golden** | Focal point defaults to the geometric centre, which is exactly today's behaviour, so an untouched document derives identically |
| **The survey is mistaken for the rating** | Different area (`SUR`), different screen section, different audience, and a policy test that proves a presenter is refused |
| **Forty-nine app screens is a lot of surface** | Group-by-group rollout: each group is a shippable PR, and the app is usable in a mixed state because both old and new screens sit on the same shell from the end of M9 |
| **A block editor produces HTML that breaks in Outlook** | The preview is the production renderer, «أرسل اختبارًا» goes through the live transport, the button block carries its VML fallback, and the owner's standing hands-on check already includes Outlook on Windows |
| **A Coursera-shaped card grid in Arabic looks like a translation** | Arabic is authored first, the poster art carries the colour, and the 390 px RTL review is the gate — not a desktop English screenshot |

---

## 19. What this document does not decide

- The exact copy of any screen. Arabic is authored in `messages/ar/**` by the owning teammate,
  first, at implementation time (invariant 10).
- Whether the marketing hero keeps the WebGL constellation. §14 assumes it does; that is a design
  call for M13 and a `DECISIONS.md` entry if it changes.
- Photography. The cards reserve a media box and generate a typographic placeholder; whether the
  org supplies real session photography is an operational question for the owner.
- Anything already settled in `DECISIONS.md`. This document re-litigates nothing.
