You are the **wave-21 planner** for كريم معرفة. You implement nothing. Your output is
**`docs/plan/notes/wave-21-lead.md`**, the `DECISIONS.md` entries it needs, and the new head of
`STATUS.md`. Update `STATUS.md` before you end, finished or not.

**State of `main`:** `2ac08172` — wave 20 merged and live (PRs #41, #42, #43 · `DEC-216`…`DEC-223`).
Production and local are at migration **`0178`**; next migration **`0179`**; next decision
**`DEC-224`**. `src/components/ui/` has **66** `.tsx` files; the gate's floor is **60**
(`tests/unit/ui-playground.test.ts:120`). Verify all five against the tree.

**The owner's ruling: the console comes before stories.** `STATUS.md` says stories land next unless
the owner says otherwise; the owner says otherwise. Log it as `DEC-224` §1, the same shape as
`DEC-205` §1 / `DEC-216` §1, and keep the story ring inert.

**What this wave claims — M11a, the first console batch.** Six artboards for `SCR-040 · 041 · 042
(desktop + phone) · 043 · 044`. Spec: `docs/design/screens/M11a.md`; artboards:
`docs/design/screens/m11a/*.dc.html` (self-contained HTML; ignore `support.js`); PNGs in
`docs/design/screens/m11a/png/`.

**Read in this order.** This brief · `M11a.md` · the six artboards · `notes/wave-20-lead.md`,
`DEC-216`, `DEC-223` · `DEC-199` §2 as amended by `DEC-208` (delete the page file, then write it from
the artboard) · `REQ-UIX-053` and its test (the console takes palette, radii and type; no motion,
objects or stickers) · `16-ui-redesign.md` §6.7 · `09-sitemap-screens.md` SCR-040…044 ·
`DEC-178`, `DEC-099`, `REQ-PRO-009`, `REQ-CHK-008`, `REQ-SES-020`, `REQ-ORG-017` ·
`messages/ar/admin.json`, `proposals.json`, `schedule.json`, `checkin.json` · `CLAUDE.md`,
`TEAM.md` §1–§3.

## Rulings carried (not to be re-derived)

1. Read by default, edit on intent (`DEC-NEXT-23`): `043` is a key/value card with one «عدّل».
2. No explainer copy; a word or a number, never a sentence (`DEC-NEXT-25`).
3. State lives in the row; nothing is shown when nothing needs doing (`DEC-NEXT-22`).
4. The console is not the party (`REQ-UIX-053`); `h1` in the display face is the only display use.

## Settle in the brief

- **PR split.** If two: **frame + `040` + `042`** (the rail, the table pattern, the bulk bar), then
  **`041` + `043` + `044`**. Retarget B before A merges with `--delete-branch`.
- **Three new primitives** (`admin-rail`, `split-view`, `kv-card`): a story each, a gallery section
  each, the floor 60 → 63 in the same commit.
- **`data-table`'s phone stack and bulk bar** — whether the built primitive has them or they are
  stories here.
- **`043`'s redirect** (`DEC-178`): the hub keeps one URL; the tab landing by role is unchanged.
- **The attendance revoke → ledger reversal** path exists (`DEC-172`); the story names it rather
  than re-implementing it.
- **Stories per screen** with `REQ-*` ids, the artboard, the undrawn states, and the definition of
  done (matches the artboard at 1280 and, for `042`, at 390; `ui-lint --strict`; the scope tests;
  `REQ-UIX-053`'s test untouched; `qa:contract` untouched).
- **Out:** `045` (M12), `046`–`065` (M11b), the studio, the public routes, stories.

## Do not

Re-litigate a `DEC`. Touch the public routes. Write «restyle». Let a `.dc.html` class into `src/`.
Put a ★ string into `en/` first. Leave a `<bdi>` off a code, a name or a number.

## Deliverables

1. `docs/plan/notes/wave-21-lead.md` in the register of `wave-20-lead.md`.
2. `DECISIONS.md` entries from `DEC-224`: the order ruling, the three design decisions in `M11a.md`
   §7, the deviation list.
3. `STATUS.md`'s head for wave 21.
