# Wave 26 · PR C — the untouched-suite ledger

One file per PR, so four branches never edit the same lines of `STATUS.md`. Each line: the file, whether a
**selector** moved or an **expectation** did, and why.

| # | File | Moved | Why |
|---|---|---|---|
| C1 | `tests/components/platform/platform-nav.test.tsx` — rewritten whole | **expectation** | The nav COMPONENT it tested is deleted for `ui/admin-rail` on the console frame (`REQ-UIX-118`, `DEC-249`); the path now holds the rail's second nav set. Kept: `platformSection()`'s case verbatim; «five sections in order, one current, read from the path»; the axe case. Added: the home is current on its own path alone; plain data only; no org-scoped link |
| C2 | same file — «the phone switcher names the current section and closes on selection» | **expectation, removed** | The switcher on `ui/menu` is gone: under `lg` the frame's sheet behind ≡ is the navigation (kept-behaviour F10) |
| C3 | same file — «never a horizontal scroller» | **expectation, removed** | It guarded the old rail's own markup; the rail is now `ui/admin-rail`, whose own suite holds its layout |
| C4 | same file — icons beside each label | **expectation, removed** | The console frame's rail draws no icon (`M11a.md` §0; the six `Platform*.dc.html`) |
| C5 | `tests/e2e/platform-console.spec.ts` — «every platform screen is captured», the home's switcher step | **selector and expectation** | «أقسام لوحة المنصة: …» opened a `menu`; ≡ «افتح قائمة لوحة المنصة» now opens the sheet holding the same `nav` (F10) |
