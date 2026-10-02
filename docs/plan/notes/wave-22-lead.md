# Wave 22 — M11b, the rest of the console

**You are the implementing lead.** This brief is measured, not estimated: every number was read from
the tree at `584abdd0`, and where it disagrees with the planning prompt or with `M11b.md`, the
disagreement is named. Read it, then `docs/design/screens/M11b.md`, then `M11a.md` §0 for the frame
you are building inside, then the fourteen artboards at 1280 beside their PNGs, then
`notes/wave-21-lead.md`, `DEC-225`…`DEC-229`, `DEC-199` §2 as amended by `DEC-208`, `REQ-UIX-053`
with `tests/unit/console-register.test.ts`, `09-sitemap-screens.md` SCR-046…065,
`05-scoring-engine.md`, `08-notifications-calendar.md`, `REQ-ADM-010`, `REQ-ADM-017`, `REQ-PTS-010`,
`REQ-CRT-012`, and `messages/ar/{admin,scoring,recognition,survey,settings}.json`.

---

## ★★ The two rules this wave is judged on

1. **A screen is REBUILT to its design, never restyled** (`DEC-199` §2).
2. **Its page file is DELETED first, then written from its artboard** — two commits — **and the story
   lists what it kept and which `REQ-*` made it keep it** (`DEC-208`).

Fifteen screens is the largest batch of the programme. **Rule 2 is the only thing that will keep it
honest**, and wave 21 proved it on the console's older half: it found a rail child type with no
remaining use, an i18n defect printing `{value}`, and a pager duplicated across widths. Expect more.

★ **The console is not the party** (`REQ-UIX-053` as amended by `DEC-227` §2). Palette, radii and
type; `h1` the only display use; no motion, objects or stickers.
`tests/unit/console-register.test.ts` stays green **and untouched**.

## ★ The order — M11b now, stories after (the owner)

`DEC-229` §5 deliberately left the next scope open — M11b or stories. **The owner rules M11b**
(`DEC-230` §1, the shape of `DEC-225` §1). Stories are not demoted and not started: `05-stories.md`
has now been overtaken **four** times, and **wave 18's ring stays inert; nobody wires it.**

## What is measured — and two corrections to the planning prompt

| | |
|---|---|
| `main` | **`584abdd0`**, clean, in sync. Production and local both at **`0179`**; the next migration is **`0180`** — all as the prompt says |
| The next decision | **`DEC-230`** — the log ends at `DEC-229`. As the prompt says |
| ★ `src/components/ui/` | **63 `.tsx` files, not 69.** The prompt says 69 with a floor of 63; the tree holds **63** and the floor **is** 63 — they match, as they have after every wave. ★ **This is the third wave running whose prompt overstated this number** (wave 20 said 63 for 57, wave 21 said 66 for 60); the count comes from the design pack's header, which counts something else. **Read the tree** |
| ★ The floor's line | **`tests/unit/ui-playground.test.ts:121`**, not 120 — it moved by one in wave 21 |
| ★★ The floor **does not move this wave** | `M11b.md` §Primitives: «**No new primitive in this batch.**» The three `data-table` cells are stories. **This is the first wave since 15 that adds no primitive**, so 63 stays 63 and the gate is untouched |
| The artboards | **fourteen** `.dc.html` and **fourteen** PNGs (`m11b/png/` holds a fifteenth entry, `README.md`) — **fifteen screens**, because `050/052` share one board |
| ★ They are untracked | `M11b.md` and `m11b/` are `??`. **Step 0 commits the spec and the artboards**; wave 21 also committed its planning prompt unedited as a record, and you say which you chose |
| New ids | requirements from **`REQ-UIX-091`**; stories from **`STORY-UIX-081`** — measured at `584abdd0`, where `01-prd.md` ends at `REQ-UIX-090` and `15-backlog.md` at `STORY-UIX-080`. **Re-read both at Step 0**: they moved twice inside wave 21 |

## The wave — fifteen screens from fourteen artboards, no new primitive, three PRs

- **A — `wave-22a/the-tables`**: `046` الأماكن · `047` التصنيفات · `048` الشركات · `049` الأعضاء ·
  `060` التذكيرات · `061` التصدير · `062` سجل التدقيق, plus the three `data-table` cells and `0180`.
- **B — `wave-22b/the-read-pages`**: `053` النقاط · `054` الشارات والمستويات · `063` الإعدادات —
  the read/edit pages, the manual adjustment, the held certificates.
- **C — `wave-22c/moderation-and-the-survey`**: `050/052` البلاغات · `051` الصور · `064` الاستبانة ·
  `065` الاستبانات.

★ **Open each against `main` on its FIRST push.** Waves 19, 20 and 21 all avoided the retarget trap
that way, and PR #36 died because one base was deleted under it. Three PRs means two chances to
repeat it, so do not create the chance at all.

## ★ Six things in this batch that are easy to get subtly wrong

1. ★★ **THE HOSTING MODEL — the owner has ruled, and it answers an objection `0081` recorded.**
   `0081`'s header considered `venues.company_id` **by name and rejected it**: «a venue is often
   reused by many different hosting companies over time… set per session rather than permanently on
   the venue, so a venue's ownership never has to be guessed from its history». ★ **That objection
   read «hosting» as *whose session is this*, which does vary. The owner means *whose building is
   this*, which does not.** The model, in the owner's words: a presenter from company A presenting in
   a meeting room owned by company B earns **A the presenting points and B the hosting points**; and
   **if the location is owned by no company, no company is rewarded.** Ownership is a property of the
   place, so `venues.company_id` is its right home and `0081`'s objection does not survive.
   - **`0180`**: `venues.company_id uuid references public.companies(id)`, **nullable**, with its
     `REQ-*` in `01-prd.md`, its RLS case, and a same-org trigger in the shape of
     `sessions_host_company_same_org()` (`0081`).
   - **The hosting rule reads the venue's company.** `company_hosting` is one of `0081`'s three
     company rules and is configurable, so ★ **a null venue company awards nothing, which is the
     owner's rule rather than a gap** — «no company is rewarded» is the correct behaviour, not a
     missing one. Say that in the story so nobody later "fixes" it.
   - ★ **`sessions.host_company_id` is SUPERSEDED, and you do not drop it.** It is live on
     production and `company_hosting` reads it today. Leave the column in place, stop reading it,
     and **remove the stopgap form on `/app/admin/scoring` that `0081` itself flagged as temporary**
     («a session ID typed in… until console builds a proper picker»). Name the supersession in your
     entry and leave the column's removal to a wave that can drop it safely. **Two sources of truth
     for hosting is the one outcome to avoid.**
   - ★ **Awarded rows do not move.** `points_ledger` is append-only (invariant 9): every
     `company_hosting` row already written stays as written. The change is forward-only, and the
     owner sets each existing venue's company **on `046`, before the rule's first evaluation after
     the merge.** Your plan says what the worker does in the gap; «no hosting award until a venue
     names its company» is the expected answer.
2. ★★ **MODERATION BECOMES TWO SCREENS, and one rail item is orphaned — handle it, do not leave it.**
   `09:62` gives three — `/moderation/{comments,photos,reports}` as `SCR-050 · 051 · 052`. The owner
   approves the design's **two**: الصور (takedowns) and البلاغات, which absorbs comments.
   ★ `src/components/shell/admin-nav.ts:44` carries `moderationComments` as its own item with
   **`built: true`** and a live route. So:
   - **Flip it to `built: false`**, which the rail already honours by excluding it — the mechanism
     wave 21 preserved on purpose («a dead link that 404s is worse than a nav item that appears»).
     The rail goes **twenty items to nineteen**, and your count test moves with it.
   - **`/app/admin/moderation/comments` redirects to the reports screen**, so no bookmark 404s.
   - ★ **`REQ-ADM-010` still names four queues** — proposals, comments, photos, reports — and it is
     **the presentation that merges, not the queue**. A comment report must still show «the content
     in context» and resolving must still record «the outcome and the actor». If the merged screen
     loses either, it has broken the requirement rather than simplified the IA.
3. ★ **The three `data-table` cells are STORIES and they are add-only.** A switch cell, a two-button
   action cell, a swatch cell. `data-table` is `console`'s own primitive, it already carries the
   phone stack and selection (wave 21's lesson), and **every existing suite must pass untouched** —
   that is what proves the addition is additive. No new file, so **the floor stays 63**.
4. ★ **Every mutation on these screens writes its audit row, through the one writer.**
   `public.write_audit()` (`0005:16`) takes `action`, `subject_type`, `subject_id`, `before`, `after`
   and `reason` — **there is no second writer, and `audit_log` is append-only with `service_role`
   revoked** (invariant 9). ★ **Your plan enumerates them**, one line per mutation per screen, with
   its `action` string: these screens create, rename, deactivate and re-point venues, categories and
   companies; change a member's role and status; resolve a report; hide and restore a photo; edit a
   scoring rule; grant and revoke a badge; write a manual adjustment (`REQ-PTS-010`); change an org
   setting; and run every export. ★ **`REQ-ADM-017` is explicit that an export is audited «because an
   export is a bulk read of personal data»**, and it also fixes the file: UTF-8 **with a BOM**,
   Arabic headers and enum values, **Western numerals** (`DEC-124`).
5. ★ **`DEC-227`: categories without tags.** `047` is التصنيفات alone. Nothing here reintroduces
   tags, and no label says «والوسوم».
6. ★ **Four screens are read-mode pages** (`DEC-NEXT-29`): `053`, `054`, `060`, `063` render values
   with one «عدّل», per `DEC-NEXT-23`, with the unsaved count, the changed-field marks, Save and
   Cancel, and the saved mark in read mode. ★ **The saved mark is plain text with a glyph, not a
   primitive** — `status-mark` was withdrawn by the owner in `DEC-216` §2.1 and stays withdrawn.
   `054` also carries the **held certificates** (`REQ-CRT-012`), whose component
   (`certificates/held-achievements.tsx`) exists and is presentation-only to `console`.

## Explicitly out

`SCR-045` certificates (M12) · `SCR-055`–`059` — the poster and certificate template screens, the
studio, the email studio, the brand kit (M12 and later) · every `/app/platform` route · the five
frozen public routes and everything `public-graph` protects · stories, their viewer and `story_views`
— **the ring is not wired** · the member app's screens · `DEC-194`'s two gates · `DEC-186` §4's
overshoot ceiling · the hard-load duplicate's **fix** (`DEC-204`; none of this wave's routes is in
its table, so **nothing is re-measured here**) · `DEC-215`'s four carried items · the
`railway.json` — the owner's, and still owed.

## Do not re-litigate

`DEC-124` numerals · `DEC-186` §4's `1.08` · `DEC-099` on avatars · `DEC-216` §2.1's withdrawal of
`status-mark` · `DEC-226`'s six ruled groups · `DEC-227`'s categories without tags · `REQ-UIX-053`,
whose test is never edited · ★ **and `0081`'s objection to the venue link, which §1 answers rather
than ignores** — a later session must find the answer in the log, not re-open the question.

## Definition of done, per screen

Deleted then written, in two commits, with the kept-behaviour table in your note **before** the
create commit and read back against the new file after it · matches its artboard **at 1280**, and at
390 wherever the frame's card stack applies, in a capture at
`.qa-shots/rtl/wave22-<track>-<screen>-<state>-<1280|390>.png` from a production build the row names
by commit · `ui-lint --strict` green with no allowlist · the scope tests green · ★
`tests/unit/console-register.test.ts` green **and untouched** · ★ **`tests/unit/ui-playground.test.ts`
untouched, because the floor does not move** · `qa:contract` untouched and `visual`'s public pairs not
re-baselined · `<bdi>` on every code, name, number and interpolated title · six ICU plural forms
wherever a count appears · a ★ string written in `messages/ar/` **first** · no `.dc.html` class, id or
markup pattern in `src/`.

## How it ends

All three PRs green with CI read **from the run's own conclusion on each PR head** (`DEC-192`) · the
owner rehearses **`0180`** on a production schema dump taken at `0179`, pushes, then merges A, B, C ·
★ **the owner sets each existing venue's company on `046` before the hosting rule's first evaluation**
(§1) · Railway reconnected with **`railway service source connect --repo ebnmajed/kareem-marefa
--branch main`** and **the builder checked before the deployment lands** · the owner holds each
rebuilt screen beside its artboard, **at 1280 on a real screen as well as 390** · your closing entry
records the deviation list, the hosting supersession, the rail's drop from twenty items to nineteen,
and what comes after — **which is stories unless the owner says otherwise, and that sentence has been
overtaken four times, so write it as the owner's to confirm rather than as a plan.**
