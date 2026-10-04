# Wave 24 — the lead's brief · M26, the artefacts (`DEC-242`)

**Read `STATUS.md`, then `DEC-242`, then this. The map is `CLAUDE.md`'s wave-24 block.**

---

## 0 · What the owner asked for, in their words

> **«I want the templates to match the designed ones and delete the current ones.»**

Three things turned on that sentence and the owner answered all three (`DEC-242`):

1. **Which templates** — **both**: the poster and certificate design templates *and* the eight designed mail families.
2. **How far «delete» goes** — a **hard delete**.
3. **Where the colour comes from** — the **platform default palette moves** to «ساحة اللعب».

★ **The goal is one sentence: an exported poster, an issued certificate and a sent email look like the product they came
from.** Today they do not. Every screen has worn the playground since wave 17; the artefacts still wear M6's Reem Kufi on
navy, because «the playground stops at the certificate's edge» was a deferral in waves 15 and 17. This wave discharges it.
**«Good» is not «the gates are green».** The acceptance is the owner's, on a **printed** poster and a **printed**
certificate.

---

## 1 · ★★ The correction every plan must absorb: there is no artboard

`docs/design/screens/m12/` draws the **library screen**, not a poster and not a certificate. The design is the **card
thumbnails** — seven of them, consistent, and therefore a specification. `DEC-242` §1 holds the table. Read it before
writing a plan, and note the two things it says you must *not* do:

- ★ **The names on the cards are FIXTURES.** «ساحة اللعب — لون الفريق», «ليلي», «ورقي», «لقاء», «إعلان», «كلاسيكي» are
  demo data. **`0096`'s contract 3 is the roster and it stands**: five poster families (`talk`, `workshop`, `panel`,
  `meetup`, `announcement`), three certificate families × landscape and portrait, one default per `(purpose, family)`,
  the orientation read from `document->'master'` and never a column. `REQ-DSG-026` counts it in CI.
- ★ **The eleven rows keep their families and their names. The document inside each is what changes.** A plan that
  renames a family or changes the count has read the artboard as a roster.

---

## 2 · ★★ The palette — the lead's, first, and the ten values

`DEC-242` §2 holds the table. Two things about it are easy to get wrong:

- **It lives in two places.** `packages/designer-runtime/src/brand.ts`'s `LIGHT`/`DARK` **and**
  `public.brand_kit()`'s literal `coalesce` fallbacks (`0068`, `canvasRaise` from `0093`).
  `tests/rls/brand-kits.test.ts` compares them so they cannot drift — **so they move in one commit, or the test is the
  thing that tells you.**
- **`BRAND_COLOUR_TOKENS` does not change.** Ten tokens before, ten after. `node` becomes lime and `edgeStrong` becomes
  muted (§2's reasoning); **that is the only way lime reaches a template**, because `0055`'s guard refuses a hex literal
  and `0094`'s walks every colour.

★ **Measured before the decision was written**, as `0144`'s own header asks: all six status pairs clear 4.5:1 on the new
values (`DEC-242` §2's table). `POL-save_brand_kit.status_contrast_accepted` — the platform default always saves — holds.
**Re-measure it in PR A anyway**, from the committed constants, not from this note.

**PR A is the lead's alone and it lands first.** The lead posts **«the palette is in at `<sha>`»** with the ten values.
Nobody authors a document before that.

---

## 3 · ★★ «Delete the current ones» — and the one place the instruction cannot be followed literally

This is the most important paragraph in the brief, because it is where an eager plan does damage.

| Constraint | Where |
|---|---|
| `design_template_versions.template_id` → **`on delete cascade`** | `0055:111` |
| `certificates.template_version_id` → **`on delete restrict`**, `not null` | `0055:288` |
| `design_documents.template_version_id` → **`on delete restrict`** | `0055:135` |
| ★ **A certificate points at the PLATFORM row directly** — «the org's default for this kind, **else the platform's**» | `0065:138-146`, `t.org_id is null` in the predicate |

★★ **So in any environment where an org never authored its own certificate template, every certificate it ever issued
references a platform baseline version, and `delete from design_templates` will be REFUSED BY THE DATABASE.** That
refusal is `REQ-CRT-014` made structural — «a certificate issued against v3 still renders as v3 after v4», one of wave
23's own goals. **It is correct and nobody works around it.**

★ **The ruling (`DEC-242` §3): delete row by row; retire the row when the delete is refused.** `retired_at` is what the
library, `045`'s picker and issuance read, so the user-visible meaning of «delete the current ones» is satisfied for all
eleven either way. What survives is invisible and unreachable — a version row kept only so a certificate somebody is
holding still renders. **The migration reports which of the eleven went which way**, and that table goes in `STATUS.md`.

★ **Forbidden, however the instruction reads:** `cascade`; detaching a certificate from its version; nulling
`template_version_id`; touching `recipient_name_snapshot` or a pinned `font_hashes`; deleting a `design_document` to
clear the way.

★ **And it is not a data fix as a migration** (`CLAUDE.md` rule 3): this is the schema's own library content, shipped by
`0061` and `0098` as migrations and replaced by one, forward-only, idempotent on `(scope, purpose, family)` exactly as
`0061` is.

---

## 4 · ★★ What moves, once, and only by the lead's hand

| What | Who | The rule |
|---|---|---|
| `scripts/parity/goldens/**` | ★ **the lead** | `designer` runs `--update` and hands the diff over. **It never commits the goldens.** A golden moves **only** because the palette moved or a baseline document was rebuilt, and the lead's commit says which |
| `tests/unit/mail-pinned/**` — all 120 | ★ **the lead** | **The palette alone moves them**: the mail renderer reads `brand_kit()`, so they move in **PR A**, before `notify` touches a design, and once more in C. `notify` **never runs a re-pin** |
| `qa:contract` · `qa:appearance` · `visual`'s public pairs · the register-form fingerprint | the lead proves it | **unmoved, not re-baselined.** The five public routes render no template and read no brand kit |

★★ **This is the first wave since M6 in which a golden moving is correct — and the rule it suspends is narrow.** A golden
that moves for any other reason is still a bug. `DEC-176`'s sentence holds verbatim: **an org's own untouched document
renders identically**, with the new values, because that is what moving a default means; and an org that has overridden
its kit sees **nothing** change.

---

## 5 · The three PRs

| PR | Branch · tree | Who | What |
|---|---|---|---|
| **A** | `wave-24a/the-palette` · the main checkout | **lead**, alone | `brand.ts`, `0192`, the goldens, the 120 pinned files, the two RLS tests |
| **B** | `wave-24b/the-baseline` · `../kareem-marefa-wave24b` | `designer` | the five poster families, the six certificate rows, `0193` from its proposed file |
| **C** | `wave-24c/the-mail-designs` · `../kareem-marefa-wave24c` | `notify` | `designs.ts`'s eight families |

★ **B and C are both cut from A's head**, not from each other: both bind the tokens A moves, and neither touches the
other's files. **Merge order A, B, C.** Each is against `main` from its first push.

---

## 6 · Sync 1 — what a plan must contain to be approved

Two plans, and **neither track writes a document before the lead posts «the palette is in»**.

**Both:**
- ★ **A colour table**: every colour the artefact paints, and the `brand.*` token or the team colour it arrives as.
  **A hex literal anywhere in the table is a plan that fails sync 1.**
- Which existing suites are evidence, and every assertion you expect to move, with whether it is a selector or an
  expectation (the ledger, `STATUS.md`, same commit).

**`designer` additionally:**
- ★★ **The delete-or-retire table**: the eleven rows, and per row what a delete would be refused by — read from
  `certificates` and `design_documents`, not from memory. The function goes under `supabase/proposed/designer/`;
  **the lead promotes it as `0193`.**
- Which goldens you expect to move, and why each.
- How `REQ-DSG-026`'s roster count stays at five and three.
- ★ How you will demonstrate **a certificate issued before the wave still rendering as its own version** — that is the
  wave's hardest demonstrable and the one that proves nothing was forced.

**`notify` additionally:**
- All 25 keys → the eight families, unchanged, each with its own copy.
- Every block keeps its `id`, its compiled HTML form and **its generated text alternative**; no block emits SVG
  (invariant 11).
- A null `blocks` row is still the admin's own text, framed and never replaced by a design.
- ★ That you will **not** run a re-pin, and what you hand the lead instead.

---

## 7 · The demonstrables

1. ★★ A **poster** and a **certificate** exported from the rebuilt baseline, **held beside the artboard's thumbnails and
   opened at their own size** — they are printed artefacts, not screens.
2. ★★ A certificate **issued before the wave** still rendering as the version it was issued against, byte-reproducibly.
3. ★★ The migration's own report, naming per row whether it deleted or retired.
4. ★ All six status pairs clearing 4.5:1 on the committed defaults.
5. ★ The 120 pinned mail files moving **once** and **stable on a re-run**.
6. ★ `qa:contract`, `qa:appearance`, `visual`'s public pairs and the fingerprint **unmoved**.

**The acceptance is the owner's, on a printed poster and a printed certificate.**
