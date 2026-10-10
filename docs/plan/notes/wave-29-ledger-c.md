# Wave 29 — PR C's ledger (the moves, `DEC-280` §5 – §6)

One line per changed assertion in an existing suite, in the commit that changes it.

| # | File | Why it changed |
|---|---|---|
| C-1 | `tests/unit/tokens-scope.test.ts` | the pinned hash of `globals.css` outside the playground's block moves on purpose (the test's own rule): the two tokens, the navigation-motion section, the reduced-motion cut of the transition's pseudo-elements, and a `ui-lint-keyframes:` reason above five keyframes. No existing value changed |
| C-2 | `tests/unit/console-register.test.ts` | «reaches no moment» names the four `lib/ui/` modules the shell's navigation boundary reaches (`nav-motion`, `poster-flight`, `reduced-motion`, `duration`) — each cuts in the staff tree; and a new block, «the console moves nowhere», refuses a `nav` kind, `data-nav-kind`, a shared name or a zoom in the staff tree and its primitives |
| C-3 | `tests/e2e/wave15-console-gallery.spec.ts` | «the sheet's content is the scope's SURFACE» waits for the sheet's and the scrim's animations to finish before it measures — the sheet rises into place since PR C (`REQ-UIX-126`), so a read at once caught it mid-flight (its bottom not yet at the screen's). The expectations are unchanged |
| C-4 | `tests/e2e/wave26-content-story-walks.spec.ts` | (DEC-286) reads the viewer's box and aims its taps only once wave 29's zoom has landed (`zoomLanded`) — the story opens out of its ring and shuts back into it (`REQ-UIX-123`), so the width read at once was 330 or 350 by timing, and a tap aimed at a viewer zooming shut waited for a target that was leaving. Failing on `main` too; the expectations are unchanged |
| C-5 | `tests/unit/sessions-removed-check-in.test.ts` | (DEC-286) its mock of `@/lib/dal/posters` gains `getSessionPosters` — the timeline reads its posters in one batch now. The expectations are unchanged |
| C-6 | `tests/e2e/wave15-content-gallery.spec.ts` | the card's focus-ring case waits for the gallery to have loaded and presses its one Tab again if a late-settling demo took the focus — it failed on CI only (twice in a row on `main` at `02bc3a97` and `4f3e9c6d`), 30/30 locally. The assertion — one Tab reaches the link, and the ring is seen on four sides — is unchanged |
