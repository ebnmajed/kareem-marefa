# Wave 26 · PR B — the untouched-suite ledger

One file per PR, so four branches never edit the same lines of `STATUS.md` (`STATUS.md`'s wave-26 block points here).
Each line: the file, whether a **selector** moved or an **expectation** did, and why.

| # | File | Moved | Why |
|---|---|---|---|
| B1 | `tests/unit/shell-routes.test.ts` «but not privacy, which no batch draws» | **expectation** | M13 draws `/app/me/privacy` (`m13/Privacy.dc.html`), so it owns its phone top row like every other hub page — `ownsTopRow` is now `true` for it (`DEC-251` §3.5, `REQ-UIX-117`) |
