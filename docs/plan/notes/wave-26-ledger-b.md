# Wave 26 · PR B — the untouched-suite ledger

One file per PR, so four branches never edit the same lines of `STATUS.md` (`STATUS.md`'s wave-26 block points here).
Each line: the file, whether a **selector** moved or an **expectation** did, and why.

| # | File | Moved | Why |
|---|---|---|---|
| B1 | `tests/unit/shell-routes.test.ts` «but not privacy, which no batch draws» | **expectation** | M13 draws `/app/me/privacy` (`m13/Privacy.dc.html`), so it owns its phone top row like every other hub page — `ownsTopRow` is now `true` for it (`DEC-251` §3.5, `REQ-UIX-117`) |
| B2 | `tests/components/branding/brand-kit-form.test.tsx` — deleted with its file (`84b4b844`) | **moved** | `DEC-208`: `brand-kit-form.tsx` is deleted and `SCR-059` rebuilt read-first; its 8 cases moved one-for-one into `brand-kit-edit.test.tsx` (`912a8eea`) |
| B3 | `tests/components/privacy/deactivation-form.test.tsx` — deleted with `forms.tsx` (`4cc177b3`) | **moved; one expectation** | Its 4 cases moved into `deactivate-sheet.test.tsx`. «No dialog over an empty reason» becomes «nothing sent by opening the sheet or on an empty reason» — the sheet is the confirmation (`Privacy.dc.html:32`) |
| B4 | `tests/e2e/branding.spec.ts` | **selector / flow** | «عدّل» before the form; Save matched `/^حفظ/` (it names its count, `DEC-231` §3); the saved value read as the hex written in read mode; reset reached at `?edit` (`REQ-UIX-116`) |
| B5 | `tests/e2e/wave8-branding-review.spec.ts` — the three form cases | **selector / flow** | `?edit`; Save `/^حفظ/`; the heading label not matched exact, since a changed field adds «(معدّل)» to its name |
| B6 | `tests/e2e/wave8-branding-review.spec.ts` — the defaults case | ★ **expectation** | It asserted the light canvas is `#ffffff` — stale since `0192` moved the platform palette in wave 24, so the case was already failing. It now reads the default from `brand_kit()` and finds it written in read mode |
| B7 | `tests/e2e/wave11-branding-status-contrast.spec.ts` | **selector** | `?edit`; the canvas label matched from its start; the refusal found as `role="alert"` in `#main` naming the failing pair, not a toast's `role="status"` (`DEC-251` §3.5). The value-kept and nothing-written assertions are unchanged |
| B8 | `tests/e2e/privacy.spec.ts` — states and download | **selector** | The artboard's words: «طُلب ·», «جارٍ», «جاهز ·», and «نزّل» (`REQ-UIX-117`) |
| B9 | `tests/e2e/privacy.spec.ts` — deactivation | **flow** | It opens from «إيقاف حسابي» into a sheet of that name, with the mandatory reason inside. The audit-row and still-active assertions are unchanged |
| B10 | `tests/e2e/privacy.spec.ts` — the `h1` | **selector** | «بياناتي وخصوصيتي» → «البيانات والخصوصية», the artboard's title (`DEC-251` §3.5) |
