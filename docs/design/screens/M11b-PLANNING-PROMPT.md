You are the **wave-22 planner** for كريم معرفة. You implement nothing. Output:
`docs/plan/notes/wave-22-lead.md`, the `DECISIONS.md` entries it needs, the new head of `STATUS.md`
(update it before you end).

**State of `main`:** `584abdd0` — wave 21 merged (PRs #44, #45, #46 · `DEC-225`…`DEC-229`).
Production and local at migration **`0179`**; next **`0180`**; next decision **`DEC-230`**.
`src/components/ui/`: **69** files, floor **63**. Verify all five.

**The owner's ruling: M11b now, stories after.** `DEC-229` §5 left it open; log the choice as
`DEC-230` §1 in the shape of `DEC-225` §1. The story ring stays inert.

**This wave claims M11b** — fourteen artboards for `SCR-046 · 047 · 048 · 049 · 050/052 · 051 ·
053 · 054 · 060 · 061 · 062 · 063 · 064 · 065`. Spec `docs/design/screens/M11b.md`; artboards
`docs/design/screens/m11b/*.dc.html`; PNGs `docs/design/screens/m11b/png/`.

**Read in this order.** This brief · `M11b.md` · `M11a.md` §0 · the artboards ·
`notes/wave-21-lead.md`, `DEC-225`…`DEC-229` · `DEC-199` §2 as amended by `DEC-208` ·
`REQ-UIX-053` and its test · `09-sitemap-screens.md` SCR-046…065 · `05-scoring-engine.md`,
`08-notifications-calendar.md`, `REQ-ADM-010`, `REQ-ADM-017`, `REQ-PTS-010`, `REQ-CRT-012` ·
`messages/ar/admin.json`, `scoring.json`, `recognition.json`, `survey.json`, `settings.json` ·
`CLAUDE.md`, `TEAM.md` §1–§3.

## Rulings carried
Read by default, one «عدّل» (`DEC-NEXT-23`) · no explainer copy (`DEC-NEXT-25`) · state in the row
(`DEC-NEXT-22`) · the console is not the party (`REQ-UIX-053`, as amended by `DEC-227` §2).

## Settle
- **PR split.** Three is likely: **A** the four tables (`046`–`049`) + `060` + `061` + `062`;
  **B** `053` + `054` + `063` (read/edit pages, the manual adjustment, held certificates);
  **C** `050/052` + `051` + `064` + `065`. Retarget before merging with `--delete-branch`.
- **`data-table` additions**: a switch cell, a two-button action cell, a swatch cell — stories.
- **Audit coverage**: every mutation on these screens writes the audit row; the brief lists them.
- **`DEC-227`**: categories without tags; nothing here reintroduces them.
- **Venue → company** (`DEC-NEXT-32`): `venues.company_id` at `0180` with its `REQ-*` in
  `01-prd.md`; hosting points read the venue's company; existing venues get their company set by
  the owner in `046` before the rule turns on.
- **Stories per screen**, `REQ-*` ids, undrawn states, definition of done as before.
- **Out:** `045`, `055`–`059`, the public routes, stories.

## Do not
Re-litigate a `DEC`. Touch the public routes. Write «restyle». Let a `.dc.html` class into `src/`.
Put a ★ string into `en/` first. Leave a `<bdi>` off a code, a name or a number.

## Deliverables
1. `docs/plan/notes/wave-22-lead.md`. 2. `DECISIONS.md` from `DEC-230`. 3. `STATUS.md`'s head.
