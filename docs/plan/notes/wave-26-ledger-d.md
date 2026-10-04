# Wave 26 · PR D — the untouched-suite ledger

One file per PR, so four branches never edit the same lines of `STATUS.md`. Each line: the file, whether a
**selector** moved or an **expectation** did, and why.

| # | File | Moved | Why |
|---|---|---|---|
| D1 | `tests/unit/feed-ring-state.test.ts` — deleted, with `src/components/feed/ring-state.ts` and `relative.ts`'s `ringCaption` | **expectation, removed** | The ring row's state is no longer derived in the feed: it is `sessions'` story feed (`DEC-251` §4.5, `REQ-STO-006`). Nothing else used either |
| D2 | `tests/components/feed/feed.test.tsx` — the fixture loses `rings`; «the ring row's rings open nothing: no button in it» is replaced by «the ring row is the story feed's» | **expectation** | A ring now opens the viewer (`REQ-STO-007`). Wave 18 built it inert on purpose (`DEC-206` §1.5) and this is the wave that wires it |
| D3 | `tests/e2e/wave18-content-home.spec.ts:152-153` — «no button in the row; the ring is an `img`» | **expectation** (`content` edits it) | The same: the ring is a button named as before, and opens the story |
| D4 | `tests/unit/ui-playground.test.ts` — the floor | **expectation** | 69 → 71: `story-viewer`, `story-capture`, each with its registry entry, its test inside the scope and its gallery demo (`DEC-245`) |
| D5 | `tests/rls/fixture.ts` — each org gains two frames, a view, a reaction and a removal request | neither — **fixture rows added** | So the generated isolation sweep meets a real row of org B in all four new tables (`0198`); no existing case's expectation moved, 108 of 108 pass |
