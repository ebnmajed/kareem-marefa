# Wave 27 — the untouched-suite ledger, PR A

One line per changed assertion or fixture in a file that existed before the wave, written in the commit that changes it.

| # | File | What changed | Selector or expectation | Why |
|---|---|---|---|---|
| A1 | `tests/rls/fixture-m2.ts` | The fixture's sessions are inserted with `certificate_mode = 'off'`, named | neither — the fixture keeps the value every earlier suite was written against | `0201` moved the column's default to `'review'` (`REQ-CRT-018`). Without the pin, seven cases of `sessions-certificate-mode.test.ts` met `'review'` where they set up `'off'`. The default has its own file, `certificate-default.test.ts` |
| A2 | `tests/rls/m2-schema.test.ts` · `POL-sessions` · `update.presenter` | The presenter's title update is proven on their **draft**; on the published session it now expects `55000` | **expectation** | `0200`, `DEC-255` §1 — the owner's rule: a title is editable until the session is published. The grant is unchanged; the guard refuses |
| A3 | `tests/rls/sessions-scheduling.test.ts` · `RPC-schedule_session.admin_only` | «the four columns 0010 grants still work» is proven with the title on the draft and `abstract` on the published session | **expectation** | as A2 |

**Not caused by this wave**, seen in the full run on the shared local database (1,678 of 1,689): `sessions-clock` (one case) and
`notify-materials-added` (one case) read rows other runs committed to that database — carried from wave 26's ledger; CI's clean
database is the arbiter.
