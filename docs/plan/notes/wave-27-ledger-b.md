# Wave 27 — the untouched-suite ledger, PR B

One line per changed assertion or fixture in a file that existed before the wave, written in the commit that changes it.

| # | File | What changed | Selector or expectation | Why |
|---|---|---|---|---|
| B1 | `tests/rls/fixture.ts` | Each org's company gains one `company_domains` row, on a domain that is **not** the org's own | neither — a new row, so the isolation sweep meets org B's behind the wall | `0203`, `REQ-PRF-012`. The domain is deliberately one no fixture member signs in from, so no existing case is placed by it |
| B2 | `tests/rls/isolation.test.ts` | `company_domains` joins the list of tables a plain member sees none of their own org's rows of | neither — the admin-only list, as `org_domains` | the table is admin-read (`POL-company_domains.read_admin`) |
| B3 | `tests/unit/admin-audit-labels.test.ts` | `kareem.company_source` joins `NOT_ACTIONS` | neither — a named exemption with its reason | `0203`'s transaction-local setting is a dotted literal and not an audit action |
