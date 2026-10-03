# Wave 23 — M12, the studio

**You are the implementing lead.** This brief is measured, not estimated: every number was read from
the tree at `242657a5`, and where it disagrees with the planning prompt or with `M12.md`, the
disagreement is named. Read it, then `docs/design/screens/M12.md`, then `M11a.md` §0 for the console
frame you build inside, then the **nine** artboards at 1280 beside their PNGs — ★ **the pack gained two on 2026-10-03**, and `M12.md` gained a «The certificate flows — two, drawn separately» section at §056/057, then
`notes/wave-22-lead.md`, `DEC-230`…`DEC-234`, `DEC-199` §2 as amended by `DEC-208`,
**`06-visual-designer.md` in full**, `DEC-093`, `DEC-096`, `DEC-176`, `DEC-177`, `DEC-178`,
`DEC-203`, `REQ-CRT-004`, `REQ-CRT-011`, `REQ-CRT-014`, `08-notifications-calendar.md` §2,
`REQ-UIX-053` with `tests/unit/console-register.test.ts`, every file in `src/components/designer/`,
and `messages/ar/{designer,templates,emails,certificates}.json`.

---

## ★★ The two rules, and the one place rule 2 does not reach

1. **A screen is REBUILT to its design, never restyled** (`DEC-199` §2).
2. **Its page file is DELETED first, then written from its artboard** (`DEC-208`) — two commits, with
   the kept-behaviour table naming each behaviour and the `REQ-*` that made it survive.

★★ **`DEC-208` applies to the page and the chrome, NOT to the engine.** This is the first wave where
that distinction matters, because the designer is 3,873 lines of which most is machinery. §3 below
lists every file as **logic kept** or **chrome rebuilt**. A plan that deletes `canvas.tsx` has
misread this brief; a plan that keeps `editor.tsx`'s chrome has misread `DEC-199` §2.

★ **The studio is not the party** (`REQ-UIX-053`). `tests/unit/console-register.test.ts` stays green
**and untouched**, and `M12.md` is explicit: **no motion in the studio beyond drag feedback.**

## ★ The order — the studio now, stories after (the owner)

Stories have now been overtaken **five** times. **Wave 18's ring stays inert; nobody wires it**
(`DEC-235` §1, the shape of `DEC-230` §1).

## What is measured — and two corrections to the planning prompt

| | |
|---|---|
| `main` | **`242657a5`**, clean, in sync. Production at **`0190`**; the next migration would be **`0191`** — as the prompt says |
| The next decision | **`DEC-235`** — the log ends at `DEC-234`. As the prompt says |
| `src/components/ui/` | **63 `.tsx`**, floor **63** at `tests/unit/ui-playground.test.ts:121`. ★ The prompt asked me to verify rather than asserting a number, which is the right instruction — the three waves before it each inherited an inflated count from the design pack's header |
| ★★ The floor **moves 63 → 69** | `M12.md`'s Primitives names **six** new, not the prompt's three: `editor-rail`, `canvas-stage`, `floating-toolbar`, `layer-list`, `block-canvas`, `block-library` |
| ★ The artboards | **NINE `.dc.html`, not four.** Four screens, nine boards after the pack's amendment of 2026-10-03: `AdminTemplates` + ★ `AdminTemplatesCerts` (055) · `AdminDesigner` + `AdminDesignerElements` + ★ `AdminCertDesigner` (056/057) · `AdminEmailGallery` + `AdminEmails` + `AdminEmailAdd` (058) · `AdminCertificates` (045). `M12.md`'s own header still says «4 artboards» |
| ★ A stray file | `m12/png/` held **nine** entries when first measured — seven PNGs, a `README.md`, and **`SCR-055 · القوالب@1x (1).png` — an accidental duplicate**. Delete it at Step 0 or record why it stays; a later count will otherwise disagree with the boards. ★ **Re-count the directory at Step 0**: the pack gained two boards on 2026-10-03 and their PNGs may or may not have arrived with them |
| ★ They are untracked | `M12.md` and `m12/` are `??`. **Step 0 commits the spec and the artboards**, and you say what you chose for any planning prompt |
| New ids | read the next free `REQ-UIX-*` and `STORY-UIX-*` from `01-prd.md` and `15-backlog.md` at Step 0 — wave 22 consumed `REQ-UIX-091`…`106` and more |

## The wave — four screens, nine artboards, six primitives, three PRs

- **A — `wave-23a/templates-and-certificates`**: `055` القوالب **with its الشهادات tab** (`AdminTemplatesCerts.dc.html`) · `045` الشهادات · ★ **the release and revoke flow** (§4 below).
- **B — `wave-23b/the-designer`**: `056`/`057` المصمّم, the six primitives' home, ★ **and the certificate canvas** (`AdminCertDesigner.dc.html`, §4 below).
- **C — `wave-23c/the-email-builder`**: `058` البريد.

★ **Open each against `main` on its FIRST push.** Five waves have avoided the retarget trap that way.

## ★ Both settles have measured answers — neither needs a migration

**1. ★★ `DEC-NEXT-33`, variants on one strip: ALREADY MODELLED. No `0191`.**
`packages/designer-runtime/src/model.ts:82-86` carries
`presets?: { default?: LayerPresetOverride } & Partial<Record<string, LayerPresetOverride>>` —
*«per-preset anchor and scale behaviour (`06` §5.1); `default` applies to every preset that names no
override»* — and `:98-101` the **per-variant crop override** (`A32`, `REQ-DSG-020`), where «an admin
adjusts the crop for THAT variant and the others keep theirs». `0055:243-258` already keys an export
by `(document_id, preset, format, source_fingerprint)` with `preset` checked against the named set.
★ **And `src/components/designer/variant-strip.tsx` already exists** (85 lines). So **one template
already holds every format with per-format overrides**; the strip is chrome to rebuild, not a data
model to invent. **This wave expects NO migration at all** — if a plan finds one it starts at `0191`,
additive, with its `REQ-*` and its five parts, and the owner rehearses it on a dump taken at `0190`.

**2. ★★ `DEC-NEXT-35`'s «six blocks» means six NEW ones — and that is exactly right.**
`packages/mail-runtime/src/blocks.ts:63-72` holds **eight** built types: `heading`, `paragraph`,
`button`, `session_card`, `detail_list`, `divider`, `spacer`, `image`. `M12.md` draws **twelve**
labels, of which six are the built set (نص → heading + paragraph · صورة · زر · فاصل · مسافة ·
بطاقة الجلسة) and **six are new: الملصق · رمز QR · نقاطك · شهادة · الشعار · اجتماعي.**
- ★ **`detail_list` is built and NOT drawn. It stays.** Existing messages compile it, and removing a
  type would change rendered mail. Record it as a deviation rather than deleting it.
- ★★ **THE PROOF THAT SIX NEW TYPES ARE ADDITIVE IS THE PINNED OUTPUT: `tests/unit/mail-pinned/`
  holds 120 files, and they must all pass UNTOUCHED.** Wave 10 pinned the 25 messages' subject, text
  and HTML precisely so this could be proven, and **pinned mail output is never auto-refreshed** — a
  changed file is a reviewed change, as a shaping golden is. If adding a block type moves one of the
  120, the addition is not additive and the plan is wrong.
- Each new type extends the union, the compiler, **the generated text alternative** and the checks;
  `REQ-NTF-014` must stay true for every org.

## ★ Six things in this batch that are easy to get subtly wrong

1. ★★ **`layer-list` ALREADY EXISTS — the third time a «new» primitive is not new.**
   `src/components/designer/layer-list.tsx` is 201 lines. `M12.md` names `layer-list` as **new**, and
   `page-viewer` (`DEC-213` §4) and `admin-rail` (`DEC-225` §4.1) were the same case twice.
   **The same ruling applies: the primitive is written in `ui/` and the old file is DELETED**, with
   its kept-behaviour table. ★ **And check the other five against the tree before you write them** —
   `canvas-stage`, `floating-toolbar`, `block-canvas`, `block-library` and `editor-rail` should be
   genuinely new, but measure rather than trust the list.
2. ★★ **`DEC-093` IS THE LARGEST RISK IN THIS WAVE, and it is already at seven enumerated places.**
   The artboards draw drag in six more: the elements panel → canvas drop («سحب رمز QR»), the layer
   reorder, the asset drag, **the email block drag into a row slot («سحب إلى المسودة», the dashed
   «أفلت هنا»)**, the row handle bar's drag, and the block library. **Every one needs a
   single-pointer, non-dragging path** — `SC 2.5.7` is separate from `SC 2.1.1`, so a keyboard path
   does not discharge it. The gate is a Playwright case **using `page.click()` alone**, and axe never
   catches this. ★ Wave 13 already built the conforming paths for the designer's operations
   (`REQ-DSG-028`): **reuse them, and do not demote the inspector's numeric X/Y/W/H/rotation fields —
   `DEC-093` says they may be collapsed into an accordion, never deleted.**
3. ★★ **No parity golden moves.** `scripts/parity/goldens/**` is the lead's and changes only through
   a reviewed diff (`DEC-176`). The chrome is being rebuilt, so **an untouched document must render
   identically**: a golden that moves is a bug, not a re-baseline. ★ **The designer's definition of
   done is an export of all four formats from the sample template**, byte-compared where the harness
   compares.
4. ★ **`DEC-096` stands and nobody tidies it**: the overlay uses **physical `left`/`top`** computed
   from document geometry, with the exemption written where the code is. Align and distribute follow
   the **document's** axis; arrow keys the **visual** one. A rebuild that converts the overlay to
   logical properties has broken the editor in RTL and passed every lint.
5. ★ **`045`'s details are requirements, not decoration.** The mode is **a sentence, set once from
   الجدولة** (`DEC-178`) — this screen shows it and never writes it. The serial is
   **`<bdi dir="ltr">`**. Revoke's **reason is mandatory**, in a sheet. The PDF download goes through
   **the one audited route** (`REQ-CRT-014`, `DEC-177`) — never a bare `<a download>`, which writes no
   audit row. Achievement certificates are **not** here; they are `054`'s, built in wave 22.
6. ★ **The designer is desktop-only** (`06` §2), and the other three screens stack under `lg` like
   every console table. Do not invent a phone designer; do not forget the other three's stack.

## ★ §3 — every designer file, as logic or chrome

**Logic — kept, its behaviour unchanged, edited only where the chrome's contract forces it:**
`canvas.tsx` (744) — ★ **the engine inside it is kept; the chrome around it is rebuilt**, and the
plan says precisely where that seam falls · `bindings-panel.tsx` (70) · `checks-panel.tsx` (218) ·
`export-panel.tsx` (128) · `export-action-button.tsx` (54) · `export-reason.ts` ·
`upload-asset.ts` · `add-image.tsx` (83).

**Chrome — rebuilt from the artboards:** `editor.tsx` (887) — the bar, the frame, the panel
orchestration · `inspector.tsx` (692) + `inspector-section.tsx` (41) → **the swapping panel**, which
is where `DEC-093`'s numeric fields must survive · `layer-list.tsx` (201) → **`ui/layer-list`, the
old file deleted** (item 1) · `variant-strip.tsx` (85) → the strip on the bar · `template-library.tsx`
(210) + `template-library-page.tsx` (89) + `template-preview.tsx` (122) + `template-actions.tsx`
(249) → **`055`**.

★ **Each rebuilt file gets its kept-behaviour row**; each kept file's existing suite passes
**untouched**, which is the proof the seam is in the right place.

## ★★ §4 — the certificate flows, added by the pack's amendment of 2026-10-03

`M12.md` §056/057 gained **«The certificate flows — two, drawn separately»** and the pack gained two boards.
**A template is never per session**: one flow designs templates, the other issues from them.

★★ **THE OWNER'S RULING, 2026-10-03: THREE DEFAULTS, ONE PER KIND — and therefore NO MIGRATION.**
The pack asks for a template «tagged with the kind**s** it serves» and **two** defaults, one for
attendance/presenting and one for achievements. ★ **Measured: `design_templates.family` is
single-valued and ALREADY IS the kind** — `0098` seeds the platform families `attendance`,
`presenter` and `achievement` — and the unique indexes `design_templates_org_default` on
`(org_id, purpose, family) where is_default` and `design_templates_platform_default` on
`(purpose, family) where is_default and org_id is null` (`0055:102-105`) **already give exactly one
default per kind.** So the owner ruled the schema's shape: **a template serves ONE kind, there are
THREE defaults — حضور · تقديم · إنجاز — and `0191` is not written.** Draw three, not two. A template
tagged with several kinds is **not built**.

### The stories

| # | Story | `REQ-*` | Artboard | PR |
|---|---|---|---|---|
| C1 | **The library's الشهادات tab** — the org's certificate templates and the platform's, each showing **the kind it serves**, «انسخ لتعدّل» on a platform one (read-only until copied), and **the three defaults named on the tab** | `REQ-DSG-*`, `REQ-CRT-004` | `AdminTemplatesCerts.dc.html` | **A** |
| C2 | **Three defaults, one per kind**, set from the tab. ★ **`054`'s release uses the `achievement` default; `045` uses the `attendance` or `presenter` default for the kind it is issuing**, unless the session named another in الجدولة (C5). Enforced by `0055`'s existing indexes — **no column, no migration** | `REQ-DSG-*` | `AdminTemplatesCerts.dc.html` | **A** |
| C3 | **The certificate canvas** — the same editor on a **landscape** canvas, the variant strip **A4 أفقي · A4 عمودي · A3 أفقي**, and the **الحقول** panel listing every certificate field **marked used / unused**: {اسم العضو} {نوع الشهادة} {عنوان الجلسة} {تاريخ الجلسة} {نص الشهادة} {الرقم التسلسلي} {تاريخ الإصدار} {التوقيع} {رمز التحقق QR}, and **{المستوى} only for the `achievement` kind**. ★ **{رمز التحقق QR} binds to the verify URL** — the one `verify/**` route, never a constructed string | `REQ-DSG-*`, `REQ-CRT-014` | `AdminCertDesigner.dc.html` | **B** |
| C4 | **The checks run on the certificate**: contrast, the logo's PPI, and ★ **the longest MEMBER NAME in the org fitted at the layer's max lines** — the poster's equivalent fits the longest title. A rail item with a count, inline, never a modal (`DEC-NEXT-34`) | `REQ-DSG-*` | `AdminCertDesigner.dc.html` | **B** |
| C5 | **«معاينة بعضو»** — rendered with a **real member**, and for the session kinds with a **real completed session**. Through the one renderer (`DEC-017`), never a second path | `REQ-DSG-*` | `AdminCertDesigner.dc.html` | **B** |
| C6 | **The session's template choice** — picked in **الجدولة, before completion**, defaulting to the org default for the kind; **shown on `045` beside the mode**. ★ **`DEC-178`'s one writer of the MODE is unchanged** — الجدولة writes both, `045` shows both and writes neither | `REQ-CRT-004`, `DEC-178` | `AdminCertificates.dc.html` | **A** |
| C7 | **`045` release and revoke** — **individually and in bulk**; ★ **held certificates are not visible to recipients and are not emailed**, and **release is audited** (`REQ-CRT-004`); revoke's **reason is mandatory** and audited, the verification page then shows **«شهادة ملغاة» and NEVER the reason**, and **the PDF is not deleted** (`REQ-CRT-011`); every download through **the one audited route** (`REQ-CRT-014`, `DEC-177`) | `REQ-CRT-004`, `-011`, `-014` | `AdminCertificates.dc.html` | **A** |

### ★ Two corrections to the amendment's own wording, both measured

1. ★★ **«the issued PDF … is never re-rendered» is the OPPOSITE of `REQ-CRT-014`.** That requirement is
   **«Reissuing is byte-reproducible»**: «Regenerating a certificate years later produces the same
   document: the template version and the **font hashes** are pinned at issue time», with the
   acceptance «a certificate issued against template v3 still renders as **v3** after v4 is
   published». ★ **The schema already pins it**: `certificates.template_version_id` is **`not null`**
   and `on delete restrict` (`0055:288`). So the rule is **«a reissue renders identically», not «it is
   never re-rendered»** — a story that forbids reissue breaks `REQ-CRT-014` and `D67`. Write it the
   requirement's way.
2. ★ **«the kinds each serves» is singular in the schema and now by ruling** — see the ruling above.

### Definition of done for the flows — the owner's walkthrough, captured at each step

An admin **designs a certificate template**, **sets it as the default for its kind**, **completes a
session in review mode**, **releases two certificates**, **revokes one with a reason**, and **the
member downloads the other** — ★ **a capture at every step, each held beside its artboard**, on a
production build the row names by commit. ★ Plus the two negatives that `REQ-CRT-004` and `-011`
make explicit: **a held certificate is not visible to its recipient and no mail is sent**, and **the
verification page of a revoked one says «شهادة ملغاة» without the reason.**

## Explicitly out

`SCR-059` branding and the brand kit (M13) · the platform console (M13) · the five frozen public
routes and everything `public-graph` protects · stories, their viewer and `story_views` — **the ring
is not wired** · the member app and the console's other screens · replacing the renderer — `DEC-017`
and `DEC-048` make `@kareem/designer-runtime` the only one · `DEC-194`'s two gates · `DEC-186` §4's
overshoot ceiling · the hard-load duplicate's fix (`DEC-204`) · `DEC-215`'s four carried items · the
`railway.json` — the owner's, and still owed.

## Do not re-litigate

`DEC-124` numerals · `DEC-099` on avatars · `DEC-093`, which is the specification and not advice ·
`DEC-096`'s physical-property exemption · `DEC-017`/`DEC-048` on the engine · `DEC-176`'s golden rule
· `DEC-178`'s mode and redirect · `DEC-216` §2.1's withdrawal of `status-mark` · `DEC-226`'s six ruled
groups · `REQ-UIX-053`, whose test is never edited · invariant 11: **no SVG anywhere**, and the email
image block is **PNG and JPEG only** because clients strip SVG and Outlook draws nothing.

## Definition of done, per screen

Deleted then written, in two commits, with the kept-behaviour table in your note **before** the
create commit and read back against the new file after it · matches its artboard **at 1280**, and at
390 for the three that stack, in a capture at
`.qa-shots/rtl/wave23-<track>-<screen>-<state>-<1280|390>.png` from a production build the row names
by commit · `ui-lint --strict` green with no allowlist · the scope tests green ·
`tests/unit/console-register.test.ts` green **and untouched** · ★ **`tests/unit/mail-pinned/`'s 120
files passing untouched** · ★ **no parity golden moved** · `qa:contract` untouched and `visual`'s
public pairs not re-baselined · `<bdi>` on every serial, code, number and interpolated title · six
ICU plural forms wherever a count appears · a ★ string written in `messages/ar/` **first** · no
`.dc.html` class, id or markup pattern in `src/` · ★ **a Playwright case that performs every new drag
with `page.click()` alone** (`DEC-093`).

## How it ends

All three PRs green with CI read **from the run's own conclusion on each PR head** (`DEC-192`) · ★
**no migration is expected**; one written after all starts at `0191`, rehearsed by the owner on a dump
taken at `0190` · merge A, B, C · ★ **the designer's demonstrable: all four formats exported from the
sample template, with no golden moved** · Railway reconnected with
**`railway service source connect --repo ebnmajed/kareem-marefa --branch main`** and **the builder
checked before the deployment lands** · the owner holds each rebuilt screen beside its artboard **at
1280 on a real screen** — the designer has no phone form to check · your closing entry records the
deviation list, the logic/chrome seam as built, and what comes after, **which is stories unless the
owner says otherwise, and that sentence has now been overtaken five times.**
