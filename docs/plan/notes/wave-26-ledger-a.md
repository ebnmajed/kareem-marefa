# Wave 26 · PR A — the untouched-suite ledger

One file per PR, so the wave's branches never edit the same lines of `STATUS.md`. Each line: the file, whether a
**selector** moved or an **expectation** did, and why.

| # | File | Moved | Why |
|---|---|---|---|
| A1 | `tests/e2e/wave10-designer-reissue-and-days.spec.ts:380` — the revoked certificate's status on `/verify` | **expectation (copy)** | «هذه الشهادة ملغاة.» → «شهادة ملغاة», the artboard's words (`Verify.dc.html`, `M13.md` §006). The selector `p[role="status"]` is unchanged, and so is everything the case exists for: the revoked certificate still resolves, the name is shown, and ★ the reason is still nowhere on the page (`REQ-CRT-011`, `OQ-015`) |
| A2 | `tests/e2e/wave10-designer-reissue-and-days.spec.ts:347` — the eligible list's for-cause row on `SCR-045` | **expectation (copy), stale since wave 23** | «مُلغاة نهائيًا — لن يصدر بديل.» → «لا بديل». `SCR-045` was rebuilt in wave 23 and says it as a word in the row (`certificates.json` `final`); this case had been failing since, and being serial it kept the `/verify` cases below it from running at all. What it proves is unchanged: a for-cause revocation is told apart from a removal's, and Sara's row carries no warning |
