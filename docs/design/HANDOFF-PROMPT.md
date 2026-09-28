# Handoff prompt for the lead Claude Code session

Paste the block below as the first message of the lead session (or as the wave brief in the shape you
already use). Keep the decision gate; the agents follow `DECISIONS.md`, not `docs/design/`.

---

You are the lead for the visual direction work on كريم معرفة. The direction is documented in
`docs/design/` and is a proposal until its decisions are accepted. Work in this order and stop at each
gate.

**1. Read, in this order, before anything else:** `docs/design/README.md`, `00-direction.md`,
`01-tokens.md` with `tokens.css`, `02-typography.md`, `03-motion.md`, `04-components.md`,
`05-stories.md`, `06-decisions-proposed.md`, `07-tasks.md`. Then open
`docs/design/prototypes/motion-story.html` and `docs/design/prototypes/stories.html` and read their CSS
and JS as behaviour references: sequence, durations, transform-only rules, RTL tap zones, the
`dir="ltr"` code boxes, the reduced-motion fallbacks. They are not code to port; the product is React 19,
Tailwind v4 with `@theme` tokens, Radix primitives, and the house primitives in `src/components/ui/`.

**2. Decision gate.** List every entry in `06-decisions-proposed.md` with a one-line summary and any
conflict with `docs/plan/DECISIONS.md` or `01-product-requirements.md` that `06` did not name. Ask me to
accept, amend or refuse each. Do not write code, migrations or tokens until I answer. Where an entry
is marked OWNER TO CHOOSE, give me your recommendation and wait.

**3. Plan.** After the gate, write the plan as `STORY-*` items in the existing backlog shape, one per
primitive or feature, each citing the `REQ-*` it serves, the file it owns, its gallery entry, and its
tests, grouped into the waves of `07-tasks.md`. Post it for my review. Then assign teammates per
file, as we do.

**4. Constraints that are not negotiable while building:**
- Only primitives from `src/components/ui/`; every control comes from there (`REQ-UIX-001`).
- Tokens only; no hex in components; durations only from `--duration-*`; transform/opacity/filter only
  (`REQ-UIX-020`); no animation library; loops switched off under reduced motion; every moment has a
  reviewed static state (`REQ-UIX-014`, `REQ-UIX-019` as amended).
- RTL-first with logical properties; Western numerals everywhere (`DEC-124`); `<bdi>` on mixed runs.
- No icon library: new glyphs are hand-authored in `src/components/ui/icons.tsx`.
- No shadcn; Radix directly (`DEC-019`). `@theme inline` stays load-bearing for dark mode.
- Status badge colours are platform constants (`REQ-UIX-003`); stickers never carry lifecycle status.
- The frozen public routes (`REQ-NFR-019`) do not change before M13; `npm run qa` stays green.
- Data access is server-only through `src/lib/dal/`; RLS does the filtering; no permission logic in
  components.
- You never edit `DECISIONS.md`; you propose, I write.

**5. How to check your work against the design:** run the gallery (`KAREEM_GALLERY=1`) and use
`scripts/visual-diff.mjs`'s Playwright to screenshot each migrated primitive at 390px in Arabic; open
the prototype at 390px and compare hierarchy, weight, spacing and motion by eye — same feel, not pixel
identity. For each of the five moments, record a short trace on a throttled CPU and confirm no frame
over 16ms.

**6. Reporting:** one PR per wave, `STATUS.md` updated, a screenshot per migrated primitive in the PR,
and a list of anything in `docs/design/` you could not honour with the reason. I merge.

Start with step 1 and report back at the gate.
