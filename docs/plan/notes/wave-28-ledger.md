# Wave 28 — the untouched-suite ledger

One line per changed assertion or fixture in a file that existed before the wave (`DEC-258`, `DEC-259`; contract 4).
`designer`'s lines are written in the same commit as the change. The lead's, if any, are marked.

## The lines

| # | File | What changed | Selector or expectation | Why |
|---|---|---|---|---|
| D-1 | `tests/components/designer/editor-state.test.tsx:1-11` (header) | «the autosave is one PUT after 1200 ms of quiet» → «the person's save is one PUT … an edit sends nothing, however long it waits» | comment | `REQ-DSG-036` replaces `REQ-DSG-022`'s autosave |
| D-2 | same, the import | `AUTOSAVE_DELAY_MS` no longer imported — the constant is deleted | selector | the timers are gone (`DEC-258` §2.1) |
| D-3 | same, `mount()` | gains a third parameter, `editable` (default `true`), passed to the hook's options; every existing call is unchanged | selector (additive) | the offer's read-only state (`DEC-259` §2.6) |
| D-4 | same, `settle()` | advanced the timers past `AUTOSAVE_DELAY_MS` → `save()` presses the state's `saveDocument()` inside `act`, and a new `wait()` advances 60 s to prove nothing fires | selector (the trigger) | the person saves |
| D-5 | same, «the autosave — a Route Handler, after 1200 ms of quiet» → «the save — the person's, through the Route Handler» · first case | **expectation**: «nothing before 1200 ms, one PUT after» → «nothing after 60 s, one PUT on Save». The URL, method, `baseUpdatedAt`, the body's rotation, «saved», and the second save carrying the answered base are all kept | **expectation** | `DEC-258` §2.1 |
| D-6 | same, the refusal table (`it.each`, five answers) | triggered by `save()` instead of the timer; the five states and toast counts unchanged; each row also asserts the save resolved `false` and the document is still dirty | selector (the trigger), addition | as D-5 |

**No lead-owned spec changes** (`DEC-259` §1.2): `wave23-lead-certificate-walk` opens the studio and edits nothing;
`wave11-lead-a11y-sweep` scans it; `wave13-demo-download` never opens it.
