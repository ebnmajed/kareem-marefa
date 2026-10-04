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
| D6 | `tests/components/sessions/event-top-row.test.tsx` | a **title** moved; two cases added | The live case reads «live with no story» and its four assertions are unchanged (text, neither a link nor a button). Added: live with a story draws the entry in the breadcrumb's place; an open session draws the breadcrumb even given a story (`REQ-STO-008`, `DEC-251` §4.7) |
| D7 | `tests/e2e/wave18-sessions-event.spec.ts` | a **title and a comment** moved; no expectation | Its live session is inserted already `in_progress`, so the generator writes no frame for it and «شاهد القصة» stays text there — which is the no-story state |
| D8 | `tests/unit/admin-audit-labels.test.ts` — the exclusion list | **neither — an exclusion added** | `'poster.webp'` in `0198`'s `story_media_read` is a file name, and the test reads every `'word.word'` literal in a migration as an audit action. Named with where it comes from, as the eleven before it are. Two real actions gained labels: `story_frame.removed`, `story_frame.restored` |
| D9 | `tests/rls/story-tables.test.ts`, `tests/rls/story-generator.test.ts` — their setup | neither — **setup** | With `0199` live, seeding the fixture itself writes a `photo` and a `materials` frame per org (the fixture's visible photograph and its «قبل» material fire the hooks). Both files delete those two kinds after seeding so each case drives its own rows; no expectation moved |
