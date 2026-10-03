You are the **wave-23 planner** for كريم معرفة. You implement nothing. Output:
`docs/plan/notes/wave-23-lead.md`, the `DECISIONS.md` entries it needs, the new head of `STATUS.md`
(update it before you end).

**State of `main`:** `242657a5` — wave 22 merged (PRs #47 … #51 · `DEC-230`…`DEC-234`).
Production at migration **`0190`**; next **`0191`**; next decision **`DEC-235`**. Verify the
primitive count and the gate's floor against the tree.

**The owner's ruling: the studio (M12) now; stories after.** Log it as `DEC-235` §1 in the shape
of `DEC-230` §1. The story ring stays inert.

**This wave claims M12** — four artboards for `SCR-055 · 056/057 · 058 · 045`. Spec
`docs/design/screens/M12.md`; artboards `docs/design/screens/m12/*.dc.html`; PNGs in
`docs/design/screens/m12/png/`.

**Read in this order.** This brief · `M12.md` · `M11a.md` §0 · the artboards ·
`notes/wave-22-lead.md`, `DEC-230`…`DEC-234` · `DEC-199` §2 as amended by `DEC-208` ·
`06-visual-designer.md` in full · `DEC-178`, `DEC-203`, `REQ-DSG-*`, `REQ-CRT-004`, `REQ-CRT-011`,
`REQ-CRT-014` · `08-notifications-calendar.md` §2 (the message set) · `REQ-UIX-053` and its test ·
`src/components/designer/*` · `messages/ar/designer.json`, `templates.json`, `emails.json`,
`certificates.json` · `CLAUDE.md`, `TEAM.md` §1–§3.

## Rulings carried
Read by default (`DEC-NEXT-23`) · no explainer copy (`DEC-NEXT-25`) · state in the row
(`DEC-NEXT-22`) · the studio is not the party (`REQ-UIX-053`).

## Settle
- **PR split.** **A** `055` + `045`; **B** the designer (`056`/`057`); **C** `058`. Retarget before
  merging with `--delete-branch`.
- **The designer's rebuild.** `DEC-208` applies to the page, not to the engine: `canvas.tsx`,
  `bindings-panel.tsx`, `checks-panel.tsx`, `export-*` keep their logic; the chrome — the bar,
  the variant strip, the three panels — is rebuilt from the artboard. The brief lists which files
  are logic and which are chrome.
- **Variants on one strip** (`DEC-NEXT-33`): whether the data model already holds formats per
  template (`06 §4`) or a migration at `0191` is needed.
- **Checks as a tab** (`DEC-NEXT-34`): the PPI guard's inline message; no modal.
- **The email block set** (`DEC-NEXT-35`): the six blocks, the variables per block, the test
  send, the delivery log.
- **Stories per screen**, `REQ-*` ids, undrawn states, definition of done as before; the designer's
  definition of done includes an export of all four formats from the sample template.
- **Out:** `059` branding, the platform console, the public routes, stories.

## Do not
Re-litigate a `DEC`. Touch the public routes. Write «restyle». Let a `.dc.html` class into `src/`.
Put a ★ string into `en/` first. Leave a `<bdi>` off a serial or a number.

## Deliverables
1. `docs/plan/notes/wave-23-lead.md`. 2. `DECISIONS.md` from `DEC-235`. 3. `STATUS.md`'s head.
