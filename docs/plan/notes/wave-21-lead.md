# Wave 21 — M11a, the first console batch

**You are the implementing lead.** This brief is measured, not estimated: every number was read from
the tree at `51db9898`, and where it disagrees with the planning prompt or with `M11a.md`, the
disagreement is named. Read it, then `docs/design/screens/M11a.md`, then the six artboards at 1280
(and `AdminSessionsPhone` at 390) beside their PNGs, then `notes/wave-20-lead.md`, `DEC-216`,
`DEC-223`, `DEC-224`, `DEC-199` §2 as amended by `DEC-208`, `REQ-UIX-053` with
`tests/unit/console-register.test.ts`, `16-ui-redesign.md` §6.7, `09-sitemap-screens.md`
SCR-040…044, `DEC-178`, `DEC-137`, `DEC-099`, `DEC-172`, `REQ-PRO-009`, `REQ-CHK-008`,
`REQ-SES-020`, `REQ-ORG-017`, and `messages/ar/{admin,proposals,schedule,checkin}.json`.

---

## ★★ The two rules this wave is judged on

1. **A screen is REBUILT to its design, never restyled** (`DEC-199` §2).
2. **Its page file is DELETED first, then written from its artboard** — two commits — **and the story
   lists what it kept and which `REQ-*` made it keep it** (`DEC-208`).

The console's screens are the oldest surviving markup in the product: `/app/admin` and its queues were
built in wave 6, regrouped in wave 7, and touched since only by the token sweep. **Rule 2 will find
more here than in any member batch.** Treat every find as a defect of the rebuild.

★ **And the console is not the party** (`REQ-UIX-053`). It takes the palette, the radii and the type —
`h1` in the display face is the only display use — and **none** of the motion, objects or stickers.
`tests/unit/console-register.test.ts` walks the console's import graph and must stay green **untouched**.

## ★ The order — the owner has ruled, and it reverses the entry just written

`DEC-224`, written at wave 20's close on 2026-10-02, ends «**session stories come next**». **The owner
now rules the console first** (`DEC-225` §1, the same shape as `DEC-205` §1 and `DEC-216` §1). Stories
are not demoted and not started: **wave 18's story ring stays inert and nobody wires it.** This is the
third deliberate re-ordering, so the log shows intent rather than drift.

## What is measured — and three corrections to the planning prompt

| | |
|---|---|
| ★ `main` | **`51db9898`**, not `2ac08172`. The prompt's sha is its parent — `2ac08172` is the STATUS commit, `51db9898` is `DEC-224` on top of it. Clean, in sync |
| Migrations | end at **`0178`**; production and local both at `0178`; the next is **`0179`** — as the prompt says |
| ★★ The next decision | **`DEC-225`, NOT `DEC-224`.** `DEC-224` **already exists** — it is wave 20's close. The prompt's instruction to log the order ruling «as `DEC-224` §1» would collide with it, and `DEC-158` forbids editing an entry. **The order ruling is `DEC-225` §1 and it amends `DEC-224`'s own closing sentence** |
| ★ `src/components/ui/` | **60 `.tsx` files, not 66.** The floor at `tests/unit/ui-playground.test.ts:120` reads **60** and matches the tree exactly. Three new make **63** — the prompt's delta is right, its count is not. `M11a.md` §6 says «66 → 69» and is wrong at both ends |
| The artboards | **six** `.dc.html` and **six** PNGs, as the prompt says. `m11a/png/` holds a seventh entry, `README.md` |
| ★ They are untracked | `M11a.md`, `M11a-PLANNING-PROMPT.md` and `m11a/` are all `??`. **Step 0 commits the spec and the artboards.** Wave 20 committed the planning prompt **unedited, as a record** (`2b7a5970`) and wave 18 did the same; follow that unless you have a reason, and say which you chose |
| New ids | requirements from **`REQ-UIX-084`**; stories from **`STORY-UIX-074`** |
| ★ `09` | **`SCR-042` has no `###` section** — 040 (`:487`), 041 (`:493`), 043 (`:498`), 044 (`:551`) and even 045 (`:557`) do. It is in the sitemap at `:54` only. Give it one this wave |

## The wave — five screens, six artboards, three primitives, two PRs

- **A — `wave-21a/the-console-frame`**: the frame, **`040`**, **`042`** (the table pattern and the bulk
  bar), `admin-rail`, `split-view`'s and `kv-card`'s signatures.
- **B — `wave-21b/the-queues`**: **`041`**, **`043`**, **`044`**.

★ **Retarget B to `main` BEFORE A merges with `--delete-branch`** — PR #36 died exactly there, and
waves 19 and 20 both avoided it only because every PR was opened against `main` from its first push.
Do that again: open B against `main` on its first push and no retarget is ever needed.

**The three primitives** — `admin-rail`, `split-view`, `kv-card` — each with a story, a gallery
section, a test inside the scope and a registry entry; **the floor moves 60 → 63 in the commit that
adds the third**. Read item 1 below before you write `admin-rail`.

## ★ Six things in this batch that are easy to get subtly wrong

1. ★★ **`admin-rail` ALREADY EXISTS, and this is `page-viewer`'s case again.**
   `src/components/admin/admin-rail.tsx` is `console`'s file today, exporting `AdminRailItem`,
   `AdminRailChild` and `AdminRailIconKey`, imported by `src/app/[locale]/app/admin/layout.tsx:3`.
   `M11a.md` §6 lists `admin-rail` as **new**. Building it in `ui/` without touching the old one leaves
   **two things called admin-rail** — the exact defect `DEC-213` §4 settled for `page-viewer`. Apply
   the same ruling: **the primitive is written in `ui/` and
   `src/components/admin/admin-rail.tsx` is deleted**, with its kept-behaviour table under `DEC-208`.
   Its comments already record behaviour you must not lose — a plain member gets an **empty** rail, and
   **`built: false` items are left out on purpose** because «a dead link that 404s is worse than a nav
   item that appears».
2. ★★ **The rail's grouping — ANSWERED: six ruled groups, approved by the owner 2026-10-02 (`DEC-226`), on the
   phone as well as at 1280.** Build on six from the start; `DEC-225` §4.2's «build on the fourteen meanwhile» is
   lifted. ★ **And read what the collapse IS before you touch the file, because «fourteen to six» reads worse than
   it is:** `AdminDashboard.dc.html`'s rail draws **twenty** items, which is **exactly the twenty**
   `admin.shell.nav.*` keys in `messages/ar/admin.json`. **Nothing is orphaned.** What changes is the rail's SHAPE —
   `DEC-137`'s fourteen were top-level items **with children**; the design puts all twenty on **one level divided by
   six rules**, and the group headings are rules that render no text. So: **`AdminRailChild` may have no remaining
   use** — if nothing nests, the type goes, but it goes **named in the kept-behaviour table** with what replaced it,
   never quietly. ★ **Prove it with a count, not a glance**: the rail renders all **twenty** keys for an admin who
   may reach them, **none** for a plain member, and **no `built: false` item** — the three behaviours the old file's
   comments record. ★ The sheet under `lg` keeps the six groups and their rules; a sheet that flattens them back
   into one list is not what was approved. ★ One label to check, not build: the artboard says
   «التصنيفات والوسوم» — categories **and tags** — while the key is `categories` alone and tags are on
   `DEC-076`'s deferred list. **The plan wins: it reads «التصنيفات» until tags exist.**
3. ★★ **`data-table`'s phone stack and its selection are ALREADY BUILT — do not rebuild either.**
   `src/components/ui/data-table.tsx:10-11` says it outright: «the phone treatment is the
   **REQUIREMENT**, not a nicety (`16` §6.7): below `md` this is a stacked card list, never a
   horizontally scrolling table». Selection with an indeterminate select-all over the visible keys is in
   the same file (`:70-83`). ★ **What is NOT built is the BULK BAR** — the toolbar replacement reading
   «N محدّدة · ألغِ · صدّر CSV · أغلق» — and `M11a.md` §3 says it is «annotated, not drawn». So it is a
   story on `042` that **composes the existing selection API** and changes the primitive only add-only,
   if at all. A plan that proposes a phone stack for `data-table` has not read the file.
4. ★ **`details` is not a primitive and must not become one.** `M11a.md` §6 lists `details` among «as
   built»; there is no `src/components/ui/details.tsx`. It means the **HTML `<details>` element**, which
   §2 uses for the content-edit diff. The gate's count is unaffected; three new files, not four.
5. ★ **`043`'s redirect is named, not re-implemented** (`DEC-178`). The hub keeps **one URL**; the tab
   it lands on is by role — الجدولة for an admin, الحضور for a moderator — and that is settled. The
   story cites it. `REQ-SES-020` is the hub's five tabs; only الجدولة and الحضور are drawn, and the
   المحتوى tab's read/edit model is described but **not drawn**, so it is not built from an artboard
   this wave.
6. ★ **The attendance revoke's reversal EXISTS — name it, do not re-implement it.** `points_ledger` is
   append-only with `service_role` revoked (invariant 9), and `DEC-172` with `0149`'s shape already
   defines the compensating row: a reversal keyed `reversal:<ledger_id>:v1` with its own reason. `044`'s
   ⋯ revoke calls into that path. ★ **And faces are allowed on `044`** — `DEC-099`'s host placement —
   which is the one console screen where an avatar's photograph is in scope. A plan that proposes a new
   reversal mechanism has re-litigated `DEC-172`.

## Deviations — `M11a.md` §7's four, and five the spec did not list

`M11a.md` §7: **`DEC-NEXT-26`** the console shell is a 220 px inline-start rail with a 52 px bar, not
`16` §6.7's header-plus-rail, content ≈1000 px · **`DEC-NEXT-27`** proposals are a split view, the
detail route surviving under `lg` · **`DEC-NEXT-28`** session settings are read by default with one
«عدّل» (`DEC-NEXT-23`) · the dashboard's charts are **one segmented bar**, and `REQ-ORG-017`'s
counts-as-links are kept.

Five more, measured here and recorded in `DEC-225` §4: the **six-versus-fourteen groups** (item 2) ·
**`admin-rail` already exists** (item 1) · **`details` is not a primitive** (item 4) · **`M11a.md` §6's
«66 → 69»** against a tree of 60 · **`SCR-042` has no `09` section**. ★ A new disagreement is written
in your note with the file and the line; **nobody picks a side.**

## Explicitly out

`SCR-045` certificates (M12) · `046`–`065`, the rest of the console (M11b) · the studio and every
`/app/platform` route · the five frozen public routes and everything `public-graph` protects · stories,
their viewer and `story_views` — **the ring is not wired** · the member app's screens · `DEC-194`'s two
gates · `DEC-186` §4's overshoot ceiling · the hard-load duplicate's **fix** (`DEC-204`; none of this
wave's routes is in its table, so **nothing is re-measured here**) · the carried four from `DEC-215`
(the hosting gate's enforcement, withdraw, a proposal history, the reviewer's name, autosave) · the
`railway.json` that would pin the worker's builder — the owner's, and still owed.

## Do not re-litigate

`DEC-124` Western numerals · `DEC-186` §4's `1.08` · `DEC-099` on avatars — **except** `044`, where the
host placement already allows faces · `DEC-172`'s reversal · `DEC-178`'s redirect · `DEC-137`'s rail IA
until the owner rules on item 2 · `REQ-UIX-053`, which is not negotiable and whose test is not edited.

## Definition of done, per screen

Deleted then written, in two commits, with the kept-behaviour table in your note **before** the create
commit and read back against the new file after it · matches its artboard **at 1280**, and `042` **at
390 as well**, in a capture at `.qa-shots/rtl/wave21-<track>-<screen>-<state>-<1280|390>.png` from a
production build the row names by commit · `ui-lint --strict` green with no allowlist · the scope tests
green · ★ `tests/unit/console-register.test.ts` green **and untouched** · `qa:contract` untouched and
`visual`'s public pairs not re-baselined · `<bdi>` on every code, name, number and interpolated title ·
six ICU plural forms wherever a count appears · a ★ string written in `messages/ar/` **first** · no
`.dc.html` class, id or markup pattern in `src/`.

## How it ends

Both PRs green with CI read **from the run's own conclusion on the PR head** (`DEC-192`) · **no
migration is expected**; one written after all starts at **`0179`**, additive, with its `REQ-*` and its
five parts, and the owner rehearses it on a production schema dump taken at `0178` before pushing ·
merge A then B · the owner reconnects Railway with **`railway service source connect --repo
ebnmajed/kareem-marefa --branch main`** and **checks the builder before the deployment lands** — the
bare command no longer runs and the reconnect resets the builder to RAILPACK · ★ **the owner holds each
rebuilt screen beside its artboard, and the console's acceptance is at 1280 on a real screen, not only
at 390** · your closing entry records the deviation list, the owner's ruling on the rail's groups, and
what comes after this batch.
