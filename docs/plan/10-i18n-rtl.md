# 10 — Internationalization, RTL and Typography

**Status:** `draft` · **Serves:** `REQ-INT-001` … `REQ-INT-009`, `REQ-NFR-009`
**Cites:** `02-domain-model.md` (frozen), `04-architecture.md`, `06-visual-designer.md`

> **Arabic is the source composition; English is the mirror.** Not "Arabic is supported" — Arabic
> is what the layouts are designed in, and English is the variant. Getting that backwards on day
> one is irreversible in practice, because every layout decision bakes in an assumption.

---

## 1. Library and routing

**next-intl 4.13.2**, already installed and shipping.

**Justification:** it is already here and working, it is the App Router's most complete i18n
option, and its `[locale]` routing is what the existing site is built on. **Named alternative:**
`next-i18next` — Pages-Router-shaped and a worse fit for RSC.

### 1.1 The routing fact that shapes the whole tree

**next-intl makes `src/app/[locale]/layout.tsx` the real root layout.** There is no
`src/app/layout.tsx`, and adding one breaks locale resolution. Everything platform-side lives under
`[locale]/app/`.

```ts
// src/i18n/routing.ts — shipping today, unchanged
export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  localePrefix: 'always',      // /ar/... and /en/... — never a bare path
  localeDetection: false,      // Arabic is the default by decision, not by Accept-Language
})
```

**`localeDetection: false` is deliberate.** Browser-language detection would send a member with an
English-configured laptop — common in this organization — to the English half of an Arabic-first
product. The locale is a choice, not a guess.

### 1.2 Message structure

`src/messages/{ar,en}.json`, namespaced by feature and mirroring the route tree:

```
app.sessions.list · app.sessions.detail · app.sessions.checkIn · app.sessions.host
app.propose · app.members · app.me.points · app.leaderboards
admin.proposals · admin.scoring · admin.designer
notifications.<MSG-key>     ← the same keys 08 owns
errors · common
```

Rules (`REQ-INT-002`):
- **No user-facing string is hard-coded.** A lint rule fails on a literal in a component.
- **Keys are stable.** Changing copy does not change a key.
- **`ar.json` is the source.** It is written first, and it is complete. `en.json` may lag — see §7.
- Pluralization uses ICU. **Arabic has six plural forms** (`zero`, `one`, `two`, `few`, `many`,
  `other`) against English's two, which is the single most common place an English-first developer
  produces broken Arabic:

```json
{
  "attendeeCount": "{count, plural, zero {لا حضور} one {حاضر واحد} two {حاضران} few {# حاضرين} many {# حاضرًا} other {# حاضر}}"
}
```

---

## 2. RTL implementation

### 2.1 RTL is the default, not a variant

`REQ-INT-001`. `<html dir="rtl">` for `ar`, set in `[locale]/layout.tsx` from the (async) `params`.
Radix gets `<DirectionProvider dir="rtl">` so its popovers, selects, sliders and tabs mirror
correctly (`04` §11).

### 2.2 Logical properties only — `REQ-INT-004`

| Never | Always |
|---|---|
| `left`, `right` | `inset-inline-start`, `inset-inline-end` |
| `margin-left` | `margin-inline-start` |
| `padding-right` | `padding-inline-end` |
| `text-align: left` | `text-align: start` |
| `border-left` | `border-inline-start` |
| Tailwind `ml-4`, `pr-2`, `text-left` | `ms-4`, `pe-2`, `text-start` |

A lint rule fails on physical directional properties in layout code.

### 2.3 The Tailwind v4 specificity trap

**`rtl:` and `ltr:` variants compile to `:where()` and therefore add zero specificity.**

```css
/* WRONG — ml-4 wins regardless of source order, because rtl: adds nothing */
class="ml-4 rtl:mr-4"

/* RIGHT — one logical utility, no variant needed */
class="ms-4"
```

**Never pair an `rtl:` variant with a physical utility for the same property.** The physical one
wins and the bug is invisible in LTR — which is where it will be reviewed. Use the logical utility;
reserve `rtl:` for genuine per-direction differences (an asymmetric shadow, a mirrored transform).

### 2.4 What mirrors and what does not

| Mirrors | Does not |
|---|---|
| Arrows, chevrons, back/forward | Clock icons |
| Progress bars and steppers | Media play/pause/skip (universally LTR) |
| Carousels and their controls | Logos and the wordmark |
| **The slide viewer's next/previous** (`07` §5) | Numbers themselves |
| Drawer and sheet entry edges | Checkmarks |
| Alignment guides in the designer | |

**The viewer is the one that gets missed.** A deck reads right-to-left in Arabic, so the
right-arrow key must advance *the way the reader expects*, not the way an LTR carousel does. It is
a navigation model, not an icon — and a named test case.

### 2.5 Bidi — `REQ-INT-007`

Mixed Arabic/Latin/digit strings need isolation, or neighbouring punctuation jumps:

```tsx
// جلسة عن Next.js 16 — without isolation, "16" and the period migrate
<bdi>{title}</bdi>
// or: <span style={{ unicodeBidi: 'isolate' }}>
```

Rules:
- **Every interpolated value is isolated** — session titles, member names, company names, venue
  names, anything user-supplied.
- Trailing punctuation goes **outside** the isolate, or it lands at the wrong end.
- URLs, emails and code spans are always isolated and always `dir="ltr"`.
- **Mirrored punctuation and brackets are a parity-suite case** (`06` §9.2, case 4).

---

## 3. Typography as tokens

A30, `REQ-INT-005`. **Rules encoded as tokens, not written as guidance** — guidance is advice a
component can ignore.

### 3.1 The faces

| Role | Face | Where |
|---|---|---|
| **UI (Arabic)** | **IBM Plex Sans Arabic** 400/500/600 | already shipping |
| UI (Latin) | IBM Plex Sans 400/500/600 | the bilingual wordmark today; the body face on `/en` later |
| **Display / posters** | **Reem Kufi** | headings, poster templates |
| **Certificates** | **Amiri** (Naskh) | certificate templates |
| Certificate picker | any Google font with `subset=arabic`, **materialised** | `06` §7.2 |

Weights are **400/500/600 only** — client-mandated, and it overrides generic font-variety advice.

### 3.2 The tokens

```css
@theme {
  /* faces — the fallback stack is declared everywhere (A30) */
  --font-arabic:  var(--font-plex-arabic), "IBM Plex Sans Arabic",
                  ui-sans-serif, system-ui, sans-serif;
  --font-sans:    var(--font-plex), ui-sans-serif, system-ui, sans-serif;
  --font-display: "Reem Kufi", var(--font-arabic);
  --font-naskh:   "Amiri", "Noto Naskh Arabic", serif;

  /* leading — Arabic needs 10–15% more than Latin */
  --leading-body:    1.7;
  --leading-heading: 1.4;

  /* size — 17px base on mobile: Arabic reads smaller at equal size */
  --text-base-mobile: 17px;
  --text-base-desktop: 16px;

  /* tracking — ALWAYS zero on Arabic. Letter-spacing breaks cursive joining. */
  --tracking-arabic: 0;
}
```

### 3.3 The five rules, and what each one prevents

| Rule | What it prevents |
|---|---|
| **`letter-spacing: 0` on Arabic, always** | Letter-spacing **breaks the cursive join** — letters visually disconnect. This is not "looks loose"; it is a broken word. |
| **Body 1.7, headings 1.4** | Arabic ascenders and descenders are taller; at Latin leading, lines collide. |
| **17 px base on mobile** | Arabic letterforms read smaller at equal point size. |
| **Never `overflow: hidden` on a text line** | It **clips stacked tashkeel**. A diacritic is drawn above the em box, so a clipped line silently changes meaning. |
| **No justified text anywhere** | Browser kashida justification is unreliable; browsers stretch **inter-word spaces** instead, producing rivers. Manual kashida is off by default in templates. |

Plus the **1.2× length allowance** (A30): Arabic runs about 1.2× the length of the same English.
Every fixed-width container and every template text box accounts for it — `06` §5.2's auto-fit is
the designer-side implementation.

### 3.4 Centralised, per DEC-008

```
tokens module ─┬─→ CSS @theme / @theme inline    (platform default theme — DEC-003)
               ├─→ ENT brand kit per org         (org overrides — A25's surviving half)
               ├─→ designer templates            ({{brand.*}} bindings, never hex)
               └─→ email templates
```

**`@theme inline` is load-bearing and must not be flattened.** A plain `@theme` resolves
`var(--fg-heading)` at `:root` **once**, freezing the light values and breaking `.theme-dark`. The
existing `globals.css` carries this comment already; it is repeated here because it is the kind of
thing a well-meaning cleanup removes.

---

## 4. Font loading

### 4.1 App fonts

`next/font/google` with `display: 'swap'` and `variable`, as shipping today. Self-hosted at build
time — **no third-party font CDN in production** (`REQ-INT-009`).

The existing `preload: false` on the Latin face is a deliberate, documented measurement: on
Arabic-primary routes the Latin face is only the small bilingual wordmark, so it should not compete
with the heavy Arabic face on first paint. **Measure `/en` LCP before changing it** — the note in
`src/lib/fonts.ts` says so, and it is still the right call.

### 4.2 Subsetting — and the way it silently breaks Arabic

Subsetting is necessary: a full Arabic face is 100–200 KB.

**A subsetter must never drop `rlig`, `mark` or `mkmk`.** A subsetter configured for Latin drops
them by default. The result:

- **Latin renders perfectly.** Every Latin smoke test passes.
- **`لا` renders as two disconnected letters** instead of the lam-alef ligature.
- **Tashkeel floats** or lands in the wrong position.

This is **the likeliest silent Arabic killer in the entire product**, and nothing in a normal test
suite catches it. Verified per font, on every build, by the shaping goldens (`06` §9). The goldens
are never auto-refreshed.

### 4.3 Designer and worker fonts

Different mechanism, same set. `ENT-fonts` is the manifest, content-addressed by SHA-256, and CI
asserts the editor's, the worker Chromium's and the worker LibreOffice's sets are **identical by
hash** (`REQ-DSG-016`). **Font drift between them breaks parity silently** — different font files
produce different line breaks, which produce different text, which fails Tier A on every export.

---

## 5. Dates, numbers, time zones

### 5.1 Dates — `REQ-INT-003`

**Gregorian, with Arabic locale formatting** (A20). And a specific pin:

```ts
// The Levantine/Gulf month names (يناير، فبراير), NOT the Maghrebi (جانفي، فيفري).
// Intl output varies by region subtag, so the locale is pinned explicitly rather
// than left to the runtime's idea of "ar".
new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  dateStyle: 'long', timeZone: session.timeZone,
})
```

`-u-ca-gregory` forces the Gregorian calendar — **`ar-SA` defaults to the Islamic calendar**, which
would render every session date in Hijri and contradict A20 in one line of forgotten configuration.

A date must render identically on a phone set to `ar-EG`, `ar-SA` or `ar-MA` (`REQ-INT-003`), which
is why the format is constructed rather than inherited.

### 5.2 Numerals — `REQ-INT-006`

Western (`1 2 3`) or Arabic-Indic (`١ ٢ ٣`), an **org setting**, default Western, applied
**consistently across the UI, notifications, templates, exports and CSV**.

```ts
const nu = org.numerals === 'arabic_indic' ? 'nu-arab' : 'nu-latn'
```

**A single screen never mixes the two.** Mixed numerals within one view look like a rendering bug,
and members read them as one — which is worse than either choice consistently applied. Changing the
setting changes **every** surface, including already-generated PDFs on their next regeneration.

Both systems appear together in exactly one place: **parity-suite case 6** (`06` §9.2), which
exists to prove the renderer handles a mixed line correctly, not to endorse shipping one.

### 5.3 Time zones

All timestamps **stored in UTC** (A20). Org default `Asia/Riyadh`; a **venue may override**, and
the session inherits the venue's (OQ-018).

Display is in the **viewer's local zone**, with the session's zone shown alongside **when they
differ**:

```
الأحد ١٤ سبتمبر ٢٠٢٦ · ٧:٠٠ م (بتوقيت الرياض)
```

Always showing the zone is noise for the 95% case where everyone is in one city; never showing it
strands the remote colleague. Showing it **on difference** is the rule.

---

## 6. Mobile and responsive

`REQ-NFR-009`, §6 of the brief.

| Rule | Note |
|---|---|
| Mobile-first, fluid grids, content-driven breakpoints | Not device-list breakpoints |
| Container queries for components | A card decides its own layout from **its** width, not the viewport's |
| `clamp()` typography | With the 17 px Arabic mobile base |
| Bottom navigation on mobile | Reachable in the thumb zone |
| **Touch targets ≥ 44 px** | Including the check-in code field, used standing up in a room |
| Landscape supported | The host view is often projected |
| Responsive images, WebP/AVIF, `srcset`, lazy | `REQ-NFR-008` |

**The check-in field deserves its own note.** It is used standing, one-handed, under time pressure,
by someone reading a code off a screen across a room. It gets: a large target, `inputMode` suited
to the alphabet, no autocorrect, no autocapitalize, and per-character feedback. It is the single
most operationally important input in the product.

---

## 7. Adding English later

`REQ-INT-008`, OQ-024. Groundwork is done from day one; **English does not ship at launch**.

### 7.1 What ships now

- Both locales routed (`ar` default, `en` present).
- **Every string externalised** — `ar.json` complete.
- Logical properties everywhere, so no layout needs redrawing.
- Templates carry their **mirrored LTR variants** (A27) — a `direction` flip, not a second layout,
  because the layer model uses `start`/`end` rather than `left`/`right` (`06` §2.2).
- **`/en/app/*` redirects to `/ar/app/*`** until the English catalogue is complete.
- The **marketing shell keeps `/en`** — it is a frozen public contract (A38, `REQ-NFR-019`).

### 7.2 Turning it on

1. Complete `en.json`.
2. Remove the redirect. **One line.**
3. Verify the LTR template variants against the parity suite.
4. Check the numeral setting still applies (English orgs will want Western — already the default).

### 7.3 What it is not

**Not a rewrite, and not automatic.** Three things need human attention when English arrives:

- **Latin is ~0.8× the length of Arabic**, so containers sized for Arabic look empty. That is a
  design pass, not a bug.
- **Plural forms drop from six to two** — trivially handled by ICU, but the English strings must
  actually be written, not machine-translated from Arabic.
- **The LTR template variants need review with real English text**, for the same reason the editor
  previews with real data rather than lorem ipsum (`06` §2.4).

---

## 8. Proposed entities

**None.** The numeral setting and default time zone live on `ENT-org_settings`; the font manifest
is `ENT-fonts`; message templates are `ENT-notification_templates`. All frozen.
