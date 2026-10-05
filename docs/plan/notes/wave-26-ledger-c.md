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
| C6 | `tests/components/platform/org-actions.test.tsx` | **selector**; one **stricter expectation**; one case added | The acts sit in the row as «{act} — {org}» instead of behind a menu (`PlatformOrgs.dc.html`). The pending-deletion case now asserts no button and no link. Added: delete is offered on an active org, and «النطاقات» links to `082` (`DEC-251` §2.8) |
| C7 | `tests/components/platform/orgs-table.test.tsx` | **selector** | «إجراءات {org}» → «أوقف — {org}» |
| C8 | `tests/components/platform/new-org-form.test.tsx` | **selector (copy)**; one assertion added | `081`'s labels and «أنشئ». Added: «يصله بريد» is absent — `create_org()` sends nothing (`DEC-251` §2.7) |
| C9 | `tests/components/platform/domains.test.tsx` | **selector (copy)** | «احذف» → «أزل» (`PlatformDomains.dc.html`) |
| C10 | `tests/components/platform/library-table.test.tsx` | **selector**; one assertion added | `LibraryTable` → `LibraryGrid`; a list, not a table. Added: no `img`, `canvas` or `iframe` — no document is rendered (`DEC-251` §2.5) |
| C11 | `tests/components/platform/impersonate-form.test.tsx` | **selector** | «ابدأ الجلسة» → «ادخل»; the ceiling line asserted on the form, since chips carry no hint |
| C12 | `tests/e2e/platform-console.spec.ts` — `orgAct`, `081`'s labels, domain removal, the two `h1`s, the start button (4 places), `startFromForm` pressing the chip's label, the deletion case's row buttons, the 390 review | **selector** | Row acts instead of a menu; the artboards' copy; the chips' radio is visually hidden inside its label. Every outcome asserted is unchanged |
| C13 | `tests/e2e/platform-console.spec.ts` — the `SCR-083` case | **expectation, stricter** | «main img, main canvas» → adds `main iframe`: no document or preview of any kind |
| C14 | `tests/e2e/platform-console.spec.ts` — a new case, «every screen at its board's width, and the delete refused without the slug» | **new** | The wave's captures at 1280 and 390, nine states |
| C15 | `src/messages/*/platform.json` | **copy** | The artboards' words; keys no screen reads any more are removed; no test read them |
| C16 | `tests/components/platform/org-actions.test.tsx` (`bb28772b`) | **expectation added** | The delete act's class carries `pg-dark:text-error-on-dark`. jsdom computes no Tailwind, so what is pinned is the class that wins inside the dark scope — a production capture showed «احذف» in the heading colour, because the ghost variant's `text-fg-heading` sorts after `text-error` in the built stylesheet |
| C17 | `tests/e2e/platform-console.spec.ts` — the wave-26 capture case | **new steps** | The self-review's states: `orgs-suspend-confirm`, `orgs-suspended-row` (b suspended, then reactivated through the row — its status asserted back to `active`), `domains-remove-confirm` (cancelled — nothing removed), `impersonate-filled`. No existing assertion changed |
| C18 | `tests/e2e/platform-console.spec.ts` — `startFromForm` | **setup hardened; expectation unchanged** | On `60e9e889`'s build «ادخل» was still pending at the 5 s default (desktop :583, phone :817): the press spans the action, the token refresh and `router.refresh()`. The helper now closes any session this run's admin left open (as the expiry job would — this admin only), waits up to 30 s for the active panel **or** a form error, and fails naming the refusal if there is one. «جلسة مفتوحة» is still the assertion |
