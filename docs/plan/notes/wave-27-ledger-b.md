# Wave 27 — the untouched-suite ledger, PR B

One line per changed assertion or fixture in a file that existed before the wave, written in the commit that changes it.

| # | File | What changed | Selector or expectation | Why |
|---|---|---|---|---|
| B1 | `tests/rls/fixture.ts` | Each org's company gains one `company_domains` row, on a domain that is **not** the org's own | neither — a new row, so the isolation sweep meets org B's behind the wall | `0203`, `REQ-PRF-012`. The domain is deliberately one no fixture member signs in from, so no existing case is placed by it |
| B2 | `tests/rls/isolation.test.ts` | `company_domains` joins the list of tables a plain member sees none of their own org's rows of | neither — the admin-only list, as `org_domains` | the table is admin-read (`POL-company_domains.read_admin`) |
| B3 | `tests/unit/admin-audit-labels.test.ts` | `kareem.company_source` joins `NOT_ACTIONS` | neither — a named exemption with its reason | `0203`'s transaction-local setting is a dotted literal and not an audit action |
| B4 | `tests/components/feed/feed.test.tsx` | «without a company, exactly one `role=status`» → no status line at all; `hasCompany` leaves the fixture | **expectation** | `DEC-255` §4 — the «choose your company» gate is removed: a member no longer chooses one (`REQ-PRF-012`), so its absence refuses nothing |
| B5 | `tests/components/feed/session-post.test.tsx` | «with no company the control says why» → the reserve link is offered whatever the viewer's company; the `noCompany` argument is gone | **expectation** | as B4 |
| B6 | `tests/components/scoring/week-rail.test.tsx` | «no company … and the way to choose one» → no «اختر شركتك» link | **expectation** | as B4 |
| B7 | `tests/components/leaderboards/boards.test.tsx` | the breakdown with no company: a link «اختر شركتك» → the text «بلا شركة» and no link | **expectation** | as B4 |
| B8 | `tests/e2e/wave18-content-home.spec.ts` | the no-company case: one status line and no reserve link → no status line and a visible reserve link | **expectation** | as B4 |
