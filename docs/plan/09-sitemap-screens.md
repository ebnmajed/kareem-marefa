# 09 — Sitemap and Screens

**Status:** `draft` · **Owns:** the `SCR-*` ID space
**Serves:** every user-facing requirement · **Cites:** `04-architecture.md` (owns the route table)

> **`04-architecture.md` owns the canonical route table.** This document cites it and adds what
> `04` does not carry: purpose, roles, states, the primary action, and mobile / desktop / RTL
> notes. If a route here disagrees with `04`, `04` is right.

Every screen block carries the same fields. **RTL notes are mandatory on every screen** —
`REQ-INT-001` makes RTL the default rendering, so a screen without RTL notes is a screen nobody
thought about in the language it ships in. Every example string is **Arabic**.

---

## 1. Sitemap

```
/{locale}
├── /                                     SCR-000  marketing landing        [FROZEN]
├── /register                             SCR-001  interest form            [FROZEN]
├── /sign-in                              SCR-002  ◐ unauthenticated
├── /choose-org                           SCR-003  ◐ only when ambiguous
├── /no-access                            SCR-004  ◐
├── /legal/privacy · /legal/terms         SCR-005  ◐
├── /verify/[code]                        SCR-006  ◐ public verification
├── /s/[id]                               SCR-007  ◐ public session card (DEC-066)
│
└── /app                                          ● session required
    ├── /                                 SCR-010  home
    ├── /sessions                         SCR-011  browse + search
    ├── /sessions/[id]                    SCR-012  ★ the event page
    │   ├── /materials/[materialId]       SCR-013  the viewer
    │   ├── /check-in                     SCR-014  ★ check-in
    │   ├── /rate                         SCR-015  rating
    │   └── /host                         SCR-016  ★ presenter host view
    ├── /propose                          SCR-017  propose a topic
    ├── /propose/[id]                     SCR-018  my proposal
    ├── /members                          SCR-019  directory
    ├── /members/[id]                     SCR-020  ★ profile — two tiers
    ├── /me                               SCR-021  my profile
    │   ├── /points                       SCR-022  ★ my ledger
    │   ├── /certificates                 SCR-023
    │   ├── /bookmarks                    SCR-024
    │   ├── /calendar                     SCR-025
    │   └── /notifications                SCR-026  inbox + preferences
    ├── /leaderboards                     SCR-027
    ├── /leaderboards/companies           SCR-028  سباق الشركات
    │
    ├── /admin                                    ● admin / moderator
    │   ├── /                             SCR-040  dashboard
    │   ├── /proposals                    SCR-041  review queue
    │   ├── /sessions                     SCR-042  management
    │   ├── /sessions/[id]/schedule       SCR-043  ★ schedule + publish
    │   ├── /sessions/[id]/survey         SCR-064  survey results (DEC-074)
    │   ├── /surveys · /surveys/[templateId]   SCR-065  survey templates (DEC-160)
    │   ├── /sessions/[id]/attendance     SCR-044  attendance report
    │   ├── /sessions/[id]/certificates   SCR-045  review + release
    │   ├── /venues · /categories · /companies    SCR-046 · 047 · 048
    │   ├── /members                      SCR-049  members and roles
    │   ├── /moderation/{comments,photos,reports} SCR-050 · 051 · 052
    │   ├── /scoring                      SCR-053  scoring configuration
    │   ├── /recognition                  SCR-054  badges, levels, streaks, perks
    │   ├── /templates/{posters,certificates}     SCR-055 · 056
    │   ├── /designer/[documentId]        SCR-057  ★ the designer
    │   ├── /emails                       SCR-058
    │   ├── /branding                     SCR-059  brand kit
    │   ├── /reminders                    SCR-060
    │   ├── /exports                      SCR-061  CSV
    │   ├── /audit                        SCR-062
    │   └── /settings                     SCR-063
    │
    └── /platform                                 ● super admin
        ├── /orgs                         SCR-080
        ├── /orgs/new                     SCR-081
        ├── /orgs/[id]/domains            SCR-082
        ├── /templates                    SCR-083  platform library
        ├── /metrics                      SCR-084
        └── /impersonate                  SCR-085  ★ break-glass
```

◐ unauthenticated · ● session required · ★ described in full below

---

## 2. Conventions

**Every screen has these four states**, and they are designed, not defaulted:

| State | Rule |
|---|---|
| **Loading** | Skeletons matching the final layout's shape. No spinners for page loads. |
| **Empty** | Says what would be here and offers the action that creates it. Never a blank area. |
| **Error** | Arabic, specific, recoverable. Never a code and never a stack trace. |
| **Full** | The normal case. |

**Mobile default:** single column, bottom navigation, primary action in the thumb zone, touch
targets ≥ 44 px (`REQ-NFR-009`).
**Desktop:** content max 1200 px, side navigation for admin, two-column where genuinely parallel.
**RTL default:** logical properties, mirrored directional icons, navigation flowing right to left.
Notes below cover only what is **specific** to the screen.

---

## 3. Unauthenticated

### SCR-002 · `/sign-in`
**Purpose:** the only way into the platform. **Roles:** anyone. **Serves:** `REQ-AUT-001`,
`REQ-AUT-005`
**Primary action:** «الدخول عبر Google»
**States:** default · redirecting · error («تعذّر الدخول — حاول مرة أخرى»)
**Mobile:** centred single column; the button in the thumb zone.
**Desktop:** centred card on the brand's dark canvas.
**RTL:** the Google mark is a logo and **does not mirror**; the label sits to its start side.
**Note:** carries `?next=` through the whole flow — a poster QR scanned while signed out must land
on **that session** (`REQ-AUT-005`). The value is validated as an internal path before use.

### SCR-003 · `/choose-org`
**Purpose:** resolve an email domain listed by more than one org. **Serves:** `REQ-AUT-004`, A2
**Primary action:** choose a مؤسسة
**Copy:** «بريدك مسجَّل لدى أكثر من مؤسسة. اختر مؤسستك — هذا الاختيار نهائي ولا يمكن تغييره لاحقًا.»
**Note:** appears **only** when the domain genuinely matches more than one org, and **never again**
after the choice — the permanence is enforced by `org_id`'s immutability, not by hiding this page.

### SCR-004 · `/no-access`
**Purpose:** a Google account on no org's list. **Serves:** `REQ-AUT-006`
**Copy:** «كريم معرفة منصة خاصة بمؤسسات محددة. إن كنت تعتقد أن هذا خطأ، تواصل مع مسؤول مؤسستك.»
**Note:** **names no org and lists no domains.** A dead end with an explanation, not a blank screen
and not a redirect loop. No account, member row or audit subject is created.

### SCR-007 · `/s/[id]` — the public session card
**Purpose:** a shareable preview of one session. **Roles:** anyone, unauthenticated.
**Serves:** `REQ-DSC-006`, `REQ-SES-013`, `REQ-UIX-003`, DEC-066
**Primary action:** «افتح الجلسة» — which leads to sign-in, carrying `?next=` to that session.
**States:** default · unlisted or draft session (a neutral «هذه الجلسة غير متاحة») · cancelled
**Mobile:** this is the mobile screen — it is reached from a link pasted into WhatsApp.
**RTL:** the poster's own direction is the document's; the card's chrome is the locale's.
**Note:** shows title, time, venue, the poster and the **status badge** — and nothing that is not
already on the OG image. It is how members actually arrive, so it is the first impression of the
redesign for everyone outside the org. Never any member's name beyond the presenters.
**`16` supersedes its visual notes:** §6.4 (the card) and §5.2 (the badge).

### SCR-006 · `/verify/[code]` ★
**Purpose:** public certificate verification. **Roles:** anyone, unauthenticated.
**Serves:** `REQ-CRT-007`, `REQ-CRT-009`, `REQ-CRT-011`, A13
**Primary action:** none — it is a statement, not a form.

**Shows exactly** (A13): اسم المستفيد · نوع الشهادة · عنوان الجلسة وتاريخها (or اسم الإنجاز) ·
اسم المؤسسة · تاريخ الإصدار · **صالحة / ملغاة**. **Nothing else about the org.**

**States:**
- **صالحة** — a large green-toned confirmation, the fields above.
- **ملغاة** — «هذه الشهادة ملغاة.» **The reason is never shown** (OQ-015) — it is internal, and
  this page is public.
- **not found** — «لم نعثر على شهادة بهذا الرمز.» **Identical** for an unknown code and a
  nonexistent one; the page never distinguishes *never existed* from *revoked*.
- **rate limited** — «محاولات كثيرة. حاول بعد قليل.»

**Mobile:** the realistic case is **a phone held over a printed sheet**, so this screen is designed
mobile-first and large: the status is readable at arm's length, the name is the biggest element.
**Desktop:** the same, centred, unchanged.
**RTL:** fully RTL. The certificate serial and verification code are **`dir="ltr"` inside a
`<bdi>`** — they are Latin-and-digit strings, and unisolated they scramble against Arabic
neighbours.
**Note:** resolves by **certificate identity, not artifact identity**, so a regenerated PDF still
verifies and old printed copies never break. Accepts **only the verification code** — a serial
returns not-found (`REQ-CRT-009`).

---

## 4. Member app

### SCR-010 · `/app`
**Purpose:** what is next for me. **Serves:** `REQ-SES-013`, `REQ-PTS-003`
**Primary action:** the nearest upcoming session's RSVP state.
**Sections:** جلساتي القادمة · جلسات جديدة · نقاطي ومستواي · مهام تحضيرية معلّقة · شهادات جديدة
**States:** empty → «لا جلسات قادمة بعد» + «تصفّح الجلسات»
**Mobile:** vertical cards, the next session first and largest.
**Desktop:** two columns — sessions, then recognition.
**Realtime:** points and RSVP counts.

### SCR-011 · `/app/sessions`
**Purpose:** browse and find. **Serves:** `REQ-DSC-003`, `REQ-DSC-005`
**Primary action:** open a session.
**Filters:** التصنيف · التاريخ · المكان · المستوى · المُقدِّم · الشركة · **لغة الجلسة** (OQ-017)
**States:** loading skeletons · empty («لا جلسات تطابق بحثك» + clear filters) · results
**Mobile:** filters in a bottom sheet, not a sidebar. Active filters as removable chips above the
results.
**Desktop:** filter rail on the **inline-start** side, results grid.
**RTL:** the filter rail is on the **right** in Arabic — this follows from `inset-inline-start`, not
from a separate rule. Date range pickers run right-to-left.

### SCR-012 · `/app/sessions/[id]` ★ — the event page
**Purpose:** everything about one جلسة. **Roles:** any member. **Serves:** `REQ-SES-013`,
`REQ-EVT-001` … `REQ-EVT-015`, `REQ-MAT-006`, `REQ-TSK-004`
**Primary action:** exactly one — «احجز مقعدك» / «انضم لقائمة الانتظار» / «ألغِ حجزي» / «سجّل حضورك»

**Order on the page** (§6 of the brief, `REQ-SES-013`):
1. **الملصق**
2. **التاريخ · الوقت · المكان (مع الخريطة) · المُقدِّم** — before anything else
3. **لغة الجلسة** — before the action, because a member decides whether to attend a session they can follow (`REQ-SES-011`; DEC-045 corrected this list, which had the language at 5)
4. **The primary action**, with live **السعة** and, if waitlisted, **موقعك في قائمة الانتظار**
5. **آخر موعد للحجز** and **آخر موعد للإلغاء**, stated plainly
6. نبذة الجلسة · التصنيف والوسوم
7. **المهام التحضيرية** with the member's own progress
8. **المواد** — respecting the phase gate (`REQ-MAT-006`)
9. **التعليقات** — threaded, one level
10. **الصور**
11. **التقييم** — after completion, for checked-in attendees only

**States:**
| State | Behaviour |
|---|---|
| `published`, seats free | «احجز مقعدك» |
| `published`, full | «انضم لقائمة الانتظار» + waitlist length |
| waitlisted | «موقعك في قائمة الانتظار: ٣» + «غادر القائمة» |
| after the RSVP deadline | the action is disabled **with the reason stated**, not hidden |
| `in_progress` | the action becomes **«سجّل حضورك»** → SCR-014 |
| `completed` | rating prompt for checked-in attendees; `after` materials appear |
| `cancelled` | **«جلسة ملغاة»** banner with the reason; comments frozen, materials retained (OQ-022) |
| presenter viewing | an extra **«شاشة التقديم»** entry → SCR-016 |

**Mobile:** the primary action is **in flow at position 4, inside the first screenful** — not sticky: at 390 px the panel is ~380 px tall and pinning it covered the language row `REQ-SES-011` requires above it (DEC-045). It was drafted as sticky in the thumb zone through the
whole scroll. Poster at the top, 4:5 crop. Comments lazy-load.
**Desktop:** two columns — details and action in a sticky rail, content in the main column.
**RTL:** comment threads indent from the **inline-start** side; reply chevrons mirror; the map link
opens with an RTL-aware label. Mixed-script titles are wrapped in `<bdi>` (`REQ-INT-007`).
**Realtime (A18):** comments · reactions · RSVP count · waitlist position · check-in count.

### SCR-013 · `/app/sessions/[id]/materials/[materialId]` — the viewer
**Purpose:** read slides in-browser. **Serves:** `REQ-MAT-003`, `REQ-MAT-004`, `REQ-MAT-005`
**Primary action:** page navigation.
**States:** loading (page 1 eager, ±2 prefetched) · rendering («جارٍ تجهيز العرض…») · ready ·
**Keynote** («هذا الملف متاح للتحميل فقط» — DEC-006) · failed (with retry, and PDF-upload guidance)
**Mobile:** full-bleed page, swipe, tap-to-reveal chrome, pinch zoom.
**Desktop:** page + thumbnail rail; keyboard arrows, Page Up/Down, Home/End.
**RTL:** ★ **the arrow keys follow the reading direction** — a deck reads right-to-left in Arabic,
so "next" advances the way the reader expects. This is a **navigation model, not a mirrored icon**,
and it is the single most-missed RTL detail in the product. The thumbnail rail runs right to left;
page numbers use the org numeral setting.
**Note:** the source file is never fetched. `allow_download` decides whether a download button
exists at all, and a denied member never receives a URL (`07` §6).

### SCR-014 · `/app/sessions/[id]/check-in` ★
**Purpose:** the only proof of attendance. **Serves:** `REQ-CHK-003`, `REQ-CHK-006`,
`REQ-CHK-010`, `REQ-CHK-011`
**Primary action:** enter **رمز الحضور**.

**This is the most operationally important input in the product.** It is used standing, one-handed,
under time pressure, by someone reading six characters off a screen across a room.

**States:**
| State | Copy |
|---|---|
| ready | «أدخل رمز الحضور الذي أعلنه المُقدِّم» |
| success | **«تم تسجيل حضورك»** + points earned |
| wrong code | «الرمز غير صحيح — تأكد من الرمز المعروض الآن» |
| session not open | «التسجيل متاح أثناء الجلسة فقط» |
| already checked in | «أنت مسجَّل بالفعل» — a no-op, not an error |
| rate limited | «محاولات كثيرة — انتظر دقيقة ثم حاول مجددًا» |
| presenter | not offered at all (`REQ-CHK-011`) |
| overlapping session | «أنت مسجَّل في جلسة أخرى في نفس الوقت» + the conflicting session |

**Mobile:** six large character boxes, ≥ 44 px each, `inputMode` matched to the alphabet,
autocorrect **off**, autocapitalize **off**, per-character feedback, paste supported.
**Desktop:** the same component.
**RTL:** ★ **the code itself is Latin and enters left-to-right inside an RTL page.** The boxes are
`dir="ltr"`; the surrounding labels and the error messages are RTL. Getting this wrong makes
characters appear to land in the wrong box, which reads as a broken app at the worst possible
moment.
**Note:** no RSVP required (`REQ-CHK-010`) — a walk-in checks in like anyone else.

### SCR-016 · `/app/sessions/[id]/host` ★ — the presenter host view
**Purpose:** run the room. **Roles:** the session's presenters, org admins, moderators — **and
nobody else** (OQ-013, `REQ-CHK-014`). **Serves:** `REQ-CHK-001`, `REQ-CHK-007`
**Primary action:** display the **رمز الحضور**.

**Layout:** the code occupies most of the screen. Beneath it: time to rotation, live check-in count
against confirmed RSVPs, and **«أبطل هذا الرمز الآن»**.

**States:** before start («تبدأ الجلسة بعد …») · live · rotating (the new code replaces the old
with a **cut, not a fade** — a mid-transition code is unreadable) · ended.
**Mobile:** the code at the largest size the viewport allows, **legible at 3 metres**. Screen-wake
kept on while live.
**Desktop:** designed to be **projected** — very large type, high contrast, no chrome. Landscape is
the expected orientation here, not an afterthought.
**RTL:** the code is **Latin, `dir="ltr"`**; every label around it is RTL. The count reads
«٢٣ من ٤٠ حاضرًا» in the org's numeral system.
**Realtime:** the check-in count, live.
**Note:** revoking issues a new code immediately, affects the next attempt only, and never
invalidates check-ins already recorded (`REQ-CHK-007`).

### SCR-015 · `/app/sessions/[id]/rate`
**Purpose:** rate the session and the presenter. **Roles:** checked-in attendees only.
**Serves:** `REQ-RAT-001` … `REQ-RAT-003`, `REQ-RAT-006`
**Primary action:** submit.
**Fields:** تقييم الجلسة ١–٥ · تقييم المُقدِّم ١–٥ · ملاحظات (اختياري)
**States:** not eligible (no check-in — the screen is not reachable) · open · submitted ·
editable-within-window · closed after 14 days
**RTL:** ★ **star ratings fill from the right** in an RTL layout. A star row that fills left-to-right
reads as "1 star" when the member meant 5 — a silent, systematic data error.
**Note:** the form states the anonymity promise honestly (OQ-009): «تقييمك مجهول للمُقدِّم. تظهر
النتائج له بعد ٣ تقييمات على الأقل.» — **including** that org admins can see per-rater ratings
(D36), because a promise that omits the exception is not a promise.

### SCR-017 · `/app/propose`
**Purpose:** propose a topic. **Serves:** `REQ-PRO-001`, `REQ-PRO-002`, `REQ-PRO-003`
**Primary action:** «أرسل المقترح»
**Fields:** العنوان · النبذة · التصنيف · المستوى · الفئة المستهدفة · المدة المتوقعة · مقدّمون
مشاركون · مواد مبدئية · ملاحظات للمشرف
**States:** draft (autosaved) · submitted · changes requested (with the admin's reason, inline) ·
approved · rejected (with reason) · **hosting gated** (if the org enabled `can_host`, with what
would qualify them — `REQ-REC-008`)
**Note:** ★ **no date, time or venue field exists** (`REQ-PRO-001`). Not hidden — absent, in the
form and in the schema. The Arabic labels for العنوان, النبذة and التصنيف **match the pre-launch
registration form** members have already seen.
**Copy above the form**, carried from the live site's own argument: «لست بحاجة لأن تكون خبيرًا.»

### SCR-020 · `/app/members/[id]` ★ — profile, two tiers
**Purpose:** who someone is. **Serves:** `REQ-PRF-004`, D69, DEC-011, A33
**Primary action:** none.

**A33 is normative.** The screen renders three ways:

| Section | self | member | admin |
|---|---|---|---|
| الاسم, الصورة, الشركة, المسمى, النبذة, الاهتمامات | ✅ | ✅ | ✅ |
| المستوى, الشارات, السلسلة الحالية | ✅ | ✅ | ✅ |
| النقاط والترتيب | ✅ | ✅ | ✅ |
| **الجلسات التي قدّمها** | ✅ | ✅ | ✅ |
| الصور التي رفعها | ✅ | ✅ | ✅ |
| **الجلسات التي حضرها** | ✅ | ❌ | ✅ |
| **سجل النقاط الكامل** | ✅ | ❌ | ✅ |
| **التقييمات التي قدّمها** | ✅ | ❌ | ✅ |
| **التغيّب والإلغاء المتأخر** | ✅ | ❌ | ✅ |
| البريد الإلكتروني | ✅ | ❌ | ✅ |
| تفضيلات الإشعارات | ✅ | ❌ | ❌ |
| **رموز التقويم** | ❌ | ❌ | ❌ |

**Mobile:** header card, then sections stacked.
**Desktop:** header, then a two-column body.
**RTL:** the avatar sits at the **inline-start**; badge rows run right to left.
**Note:** tiering is enforced in **RLS and the DAL** (`03` §5.1b), never in this component. A
component-level check would leak through search results, realtime payloads and the API. **No photo
tagging** — «الصور» means photos this member **uploaded**.

### SCR-022 · `/app/me/points` ★
**Purpose:** explain every point. **Serves:** `REQ-PTS-003`
**Primary action:** none — it is a record.
**Shows:** running balance · current level and distance to the next · every ledger row with date,
signed amount, **Arabic reason**, and a link to its cause.
**States:** empty («لم تكسب نقاطًا بعد» + what earns points, read live from `scoring_rules`) ·
filtered by session or month
**Mobile:** a list, newest first, with month separators.
**Desktop:** a table with filters.
**RTL:** amounts are numerals in the org's system; the sign sits at the numeral's **inline-start**.
Negative amounts are marked by colour **and** by the minus sign — colour alone fails `REQ-NFR-007`.
**Note:** ★ the screen's test is `REQ-PTS-003`'s wording — **a member must be able to explain every
point they hold without asking anyone**. So it shows reversals next to what they reverse, manual
adjustments with the admin's reason, and the cap explanation in place when an action earned nothing
(«بلغت الحد الأقصى للتعليقات في هذه الجلسة»).

### SCR-023 · `/app/me/certificates`
**Serves:** `REQ-CRT-013` · Shows every certificate with **الرقم التسلسلي**, issue date, status,
download. A revoked one shows **with its reason** — unlike the public page (OQ-015).
**RTL:** the serial is `dir="ltr"` inside `<bdi>`.

### SCR-025 · `/app/me/calendar`
**Serves:** `REQ-CAL-003`, `REQ-CAL-007` · Connect/disconnect, and a list of synced sessions.
**Note:** shows **connection status only**. No token is ever rendered — there is no UI in the
product that can display one (A33).

### SCR-026 · `/app/me/notifications`
**Serves:** `REQ-NTF-003`, `REQ-NTF-006` · Inbox plus the preference matrix (category × channel).
**Note:** the eleven non-optional categories render as **fixed rows with a one-line explanation**,
not as toggles that silently do nothing (`08` §1.7).

### SCR-027 / SCR-028 · Leaderboards
**Serves:** `REQ-LDR-001` … `REQ-LDR-008`
**Tabs:** الكل · هذا الشهر · حسب التصنيف · **سباق الشركات**
**Note:** the member's **own rank is always visible**, even outside the displayed range
(`REQ-LDR-001`). The company board shows **both** metrics at once with the ranking one marked
(`REQ-LDR-004`). An opted-out member sees their own row and nobody else does.
**RTL:** rank numerals in the org's system; bars grow from the **inline-start**.

---

## 5. Org admin console

### SCR-040 · `/app/admin` — dashboard
**Serves:** `REQ-ADM-004` · Proposal pipeline · RSVPs vs check-ins · attendance rate · active
members · top presenters, topics, companies · points issued.
**Note:** **every figure clicks through** to the list behind it. A dashboard number nobody can open
is a number nobody trusts.

### SCR-041 · `/app/admin/proposals`
**Serves:** `REQ-PRO-005`, `REQ-PRO-006` · Queue with age, category and presenter.
**Primary action:** approve · request changes · reject — the latter two requiring a **written
reason** the proposer receives.

### SCR-043 · `/app/admin/sessions/[id]/schedule` ★
**Purpose:** turn an approved مقترح into a published جلسة. **Serves:** `REQ-SES-001`,
`REQ-SES-002`, `REQ-CRT-002`, `REQ-DSG-002`
**Primary action:** «انشر الجلسة»
**Fields:** التاريخ والوقت · المدة (pre-filled from the proposal, **not authoritative** — OQ-001) ·
المكان (list or one-off) · السعة · آخر موعد للحجز · آخر موعد للإلغاء · **وضع الشهادات** (معطّل /
تلقائي / مراجعة) · المهام التحضيرية · **الملصق**
**Poster, three paths** (DEC-012): **تلقائي** (default, generates every variant with no work) ·
**تخصيص** (opens SCR-057) · **رفع ملصق جاهز**
**States:** incomplete (publish disabled, **naming what is missing**) · ready · published · edited
(warns that attendees will be notified and calendars updated — `REQ-SES-009`)
**Mobile:** ~~a stepper, one section per step~~ — **one scroll in four headed groups, the actions sticky above the tab bar** (`DEC-148`: four steps are four more presses on the form an admin fills most).
**Desktop:** a form with a live poster preview beside it.
**RTL:** the date-time picker runs right-to-left — **not in M2**: a native `datetime-local` renders in the browser's locale; a custom picker is an M7-console backlog item (DEC-045); the duration field pairs its numeral with a unit
label in the correct order.
**Note:** publishing is **blocked by a database constraint**, not only by the form (`02` §4.3) —
date, time, venue, capacity and poster are all required.

**Amended under DEC-050 (wave 3):** the date-time fields are the RTL picker DEC-045 deferred (a trigger whose accessible name carries its value, a day grid labelled by full date, hour and minute selects); the poster section («الملصق») hosts `designer`'s `PosterPicker` with DEC-012's three paths.

### SCR-064 · `/app/admin/sessions/[id]/survey` — survey results
**Purpose:** what the organisation learned from a session. **Roles:** **مشرف المؤسسة** and
**مُنظِّم only** — a **مُقدِّم cannot reach it, by policy** (`REQ-SUR-005`).
**Serves:** `REQ-SUR-005` … `REQ-SUR-008`, DEC-074, DEC-094
**Primary action:** «تصدير CSV» — through the audited export path.
**States:** no survey on this session · **withheld** (below the minimum response count) · results
**Mobile:** distributions stack; each bar carries its own value, never a legend-only reading.
**RTL:** bars grow from the **start** edge; the axis runs right to left.
**Note:** the withhold of `REQ-SUR-006` covers **scale means and choice distributions as well as
free text** — a five-point distribution over four responses in a twelve-person session identifies
people by inference against an attendance list the same admin can already see. Response rate is
against **eligible attendees**. The CSV is **UTF-8 with BOM and Western digits** (`REQ-INT-010`).
**`16` supersedes its visual notes:** §9.2 and §9.2a.
**Amended under `DEC-160`:** the first state gains its action — «no survey on this session» offers
«أضف استبانة من قالب», which attaches one of SCR-065's templates; the schedule form is not touched.
Every number on the screen and in the CSV is in Western digits (`DEC-124`).

### SCR-065 · `/app/admin/surveys` · `/app/admin/surveys/[templateId]` — survey templates
**Purpose:** the questions an org asks again and again, written once. **Roles:** **مشرف المؤسسة** and
**مُنظِّم**.
**Serves:** `REQ-SUR-001`, `REQ-SUR-002`, `DEC-160`
**Primary action:** «قالب جديد»; on the editor, «أضف سؤالًا».
**States:** no templates yet · a list of templates with their question counts and how many sessions
use each · the editor (title, ordered questions, each typed and required or optional).
**Mobile:** one column; a question is a card with its ▲▼ at the start edge of its header.
**RTL:** ▲▼ are vertical and do not mirror; a choice question's options are their own ordered list.
**Note:** questions and options reorder **without dragging** through `ui/reorderable-list`
(`REQ-DSG-028`'s rule). A template is **copied into a session's survey when attached**, so editing a
template never rewrites a survey members have already answered.

### SCR-044 · `/app/admin/sessions/[id]/attendance`
**Serves:** `REQ-CHK-008`, `REQ-CHK-012` · Reserved / confirmed / checked in / walked in /
no-showed, with arrival times.
**Primary action:** manual attendance marking — **reason mandatory**, audited, and **flagged in
exports** (A8).

### SCR-045 · `/app/admin/sessions/[id]/certificates`
**Serves:** `REQ-CRT-004`, `REQ-CRT-011` · Review and release held certificates, individually or in
bulk; revoke with a mandatory reason.

### SCR-050–052 · Moderation queues
**Serves:** `REQ-ADM-010`, `REQ-EVT-008`, `REQ-EVT-012`, `REQ-EVT-014`
**Note:** the **photo takedown queue** is distinct from the report queue — a takedown has
**already hidden** the photo and is awaiting review (DEC-005), while a report has not (OQ-008). The
UI must not merge them; they call for opposite senses of urgency.

### SCR-053 · `/app/admin/scoring`
**Serves:** `REQ-PTS-004` … `REQ-PTS-008`, `REQ-ADM-011` · Every action with its value, cap,
cooldown and enablement.
**Note:** the catalogue is **fixed** — an admin edits values, never adds an action. `الحجز` and
`التفاعل` **do not appear**, because they are not configurable at zero; they are absent
(`REQ-PTS-010`). Negative actions appear grouped, at 0, with «مغلق افتراضيًا».

**Amended under DEC-050 (wave 3), SCR-054:** `/app/admin/recognition` hosts «شهادات الإنجاز بانتظار الإصدار» — the release of HELD achievement certificates (`HeldAchievements`). `REQ-CRT-012` gives an admin the release; SCR-045 is per session and an achievement certificate has no session, so it lives here. SCR-053's manual adjustment has a member picker instead of a typed UUID.

### SCR-057 · `/app/admin/designer/[documentId]` ★
**Purpose:** the shared designer. **Serves:** `REQ-DSG-005`, `REQ-DSG-010`, `REQ-DSG-022`
**Primary action:** «صدّر» / «احفظ»
**Panels:** layer list · canvas · properties · variant previews · export queue
**States:** loading · editing (autosaved) · **export queued / rendering / ready / failed per
variant** · locked-region attempt («هذه المنطقة مقفلة في القالب»)
**Mobile:** ★ **view and approve only, not edit.** A layer editor at 375 px is a bad tool
pretending to be a feature. Mobile shows the preview, the variant list and the approve action.
**Desktop:** the full editor, ≥ 1280 px.
**RTL:** ★ the canvas is **RTL-first** — origin, layer list, properties panel and alignment guides
are all composed for RTL, with LTR as the mirror. An editor that is LTR-first with an RTL toggle
produces templates that are LTR-first with an RTL toggle (`06` §10).
**Note:** autosave is a **Route Handler**, not an action — layer trees exceed the 1 MB action cap
(`04` §4.2).

### SCR-059 · `/app/admin/branding` · SCR-061 · `/app/admin/exports` · SCR-062 · `/app/admin/audit`
**Branding** (`REQ-DSG-021`): the brand kit — **one edit, four consumers**. States the **minimum
logo resolution** up front, because DEC-009 made logos raster and the PPI guard will otherwise
block A3 at export time.
**Exports** (`REQ-ADM-017`): UTF-8 **with BOM** so Excel opens Arabic without a manual import step;
Arabic column headers; **Western numerals and sortable dates** (`DEC-124`, `DEC-148`); **every export audited** — it is a bulk read of personal
data.
**Audit** (`REQ-ADM-018`): searchable by actor, subject, action, date range. A moderator sees
**their own** actions only (`03` §5.10a).

---

## 6. Super admin console

### SCR-080–084
Orgs (create, suspend, set first admin) · allowed domains · **platform template library** ·
aggregate metrics.
**Note:** metrics are **aggregate only** (`REQ-ADM-003`) — no member, session title or content is
visible to a super admin anywhere in this console.

### SCR-085 · `/app/platform/impersonate` ★
**Purpose:** break-glass. **Serves:** `REQ-ADM-002`, `REQ-ADM-019`, DEC-014
**Primary action:** start a time-bounded impersonation session.
**Requires:** a **written reason**, a target org, a maximum duration (**≤ 4 hours**, a table
constraint).
**States:** none active · active (a **persistent banner across every screen**: «أنت تتصفح كـ …»
with a stop control) · expired
**Amended under DEC-055 (wave 4):** an impersonation session carries no `member_id` (`02` §4.1), so the
platform sends it to `/no-access` on every member screen this wave; the banner is persistent on the
platform screens and on `/no-access`, which is everywhere such a session can be. Browsing the org's
screens needs a fourth session state in `session.ts` — the next wave's (DEC-055 decision 3, option A).
**Note:** ★ the record lands in **that org's own audit log**, where its admins can see it
(`REQ-ADM-019`). The honest consequence, which this screen states to the super admin before they
start: **you cannot look at an org's data without the org knowing.** That is the intended property
of DEC-014, not a limitation to route around.

---

## 7. Coverage

### 7.1 Screen inventory by role

| Area | Screens |
|---|---|
| Unauthenticated | SCR-002 … SCR-006 |
| Member app | SCR-010 … SCR-028 |
| Presenter | SCR-016 (host view), plus presenter states on SCR-012 and SCR-017 |
| Org admin | SCR-040 … SCR-064 |
| Moderator | SCR-044, SCR-050–052, SCR-062 (own actions) — **and nothing else** (`REQ-ADM-020`) |
| Super admin | SCR-080 … SCR-085 |
| Certificate verification | SCR-006 |
| Public session card | SCR-007 |

**Every screen above carries mobile, desktop and RTL notes**, per the brief's §8 quality bar. Where
a screen's notes are the conventions in §2 and nothing more, the conventions **are** the notes —
they are not omitted, they are shared.

### 7.2 Requirement → screen

The screens above are described in prose; this is the machine-checkable index behind them
(`13` §10). Every requirement with a user-facing surface appears here.

| Screen | Requirements it realises |
|---|---|
| SCR-002 sign-in | `REQ-AUT-001`, `REQ-AUT-002`, `REQ-AUT-005`, `REQ-UIX-011` |
| SCR-003 choose-org | `REQ-AUT-004` |
| SCR-004 no-access | `REQ-AUT-006`, `REQ-TEN-006` |
| SCR-000 marketing landing · SCR-001 register | `REQ-NFR-019` — **frozen public contract** |
| SCR-005 legal | `REQ-NFR-015` |
| SCR-007 public session card | `REQ-DSC-006`, `REQ-UIX-003` |
| SCR-006 verify | `REQ-CRT-007`, `REQ-CRT-009`, `REQ-CRT-010`, `REQ-CRT-011`, `REQ-INT-010` |
| SCR-010 home ★ **the sessions timeline** (DEC-112) | `REQ-TSK-004`, `REQ-REC-009`, `REQ-UIX-002`, `REQ-UIX-012`, `REQ-UIX-021`, `REQ-UIX-022`, `REQ-UIX-023` |
| SCR-011 sessions | `REQ-DSC-001`, `REQ-DSC-002`, `REQ-DSC-003`, `REQ-DSC-005`, `REQ-DSC-007`, `REQ-SES-011`, `REQ-UIX-003`, `REQ-UIX-005`, `REQ-UIX-012`, `REQ-UIX-021`, `REQ-UIX-022` |
| SCR-012 event page | `REQ-UIX-024`, `REQ-SES-013`, `REQ-SES-008`, `REQ-SES-010`, `REQ-EVT-001` … `REQ-EVT-015`, `REQ-MAT-001`, `REQ-MAT-006`, `REQ-MAT-007`, `REQ-RSV-001` … `REQ-RSV-011`, `REQ-CAL-001`, `REQ-CAL-002`, `REQ-TSK-001` … `REQ-TSK-005`, `REQ-SES-014`, `REQ-UIX-003`, `REQ-UIX-004`, `REQ-UIX-015`, `REQ-UIX-018`, `REQ-UIX-019`, `REQ-ADM-021`, `REQ-DSG-027` |
| SCR-013 viewer | `REQ-MAT-002`, `REQ-MAT-003`, `REQ-MAT-004`, `REQ-MAT-005`, `REQ-MAT-007`, `REQ-MAT-010`, `REQ-MAT-011`, `REQ-MAT-012`, `REQ-UIX-005` |
| SCR-014 check-in | `REQ-CHK-003` … `REQ-CHK-006`, `REQ-CHK-009` … `REQ-CHK-013`, `REQ-UIX-015`, `REQ-UIX-019`, `REQ-CHK-015`, `REQ-CHK-016` |
| SCR-015 rate | `REQ-RAT-001` … `REQ-RAT-004`, `REQ-RAT-006`, `REQ-SUR-001` … `REQ-SUR-004`, `REQ-SUR-009` |
| SCR-016 host view | `REQ-CHK-001`, `REQ-CHK-002`, `REQ-CHK-007`, `REQ-CHK-014`, `REQ-PRF-009`, `REQ-CHK-015`, `REQ-CHK-016`, `REQ-CHK-017` |
| SCR-017 propose | `REQ-PRO-001` … `REQ-PRO-004`, `REQ-REC-008`, `REQ-PRO-010`, `REQ-UIX-008`, `REQ-UIX-009`, `REQ-UIX-010`, `REQ-UIX-011` |
| SCR-018 my proposal | `REQ-PRO-006`, `REQ-PRO-008` |
| SCR-019 directory | `REQ-PRF-005` |
| SCR-020 profile | `REQ-PRF-001`, `REQ-PRF-003`, `REQ-PRF-004`, `REQ-PRF-009` |
| SCR-021 my profile | `REQ-PRF-001`, `REQ-PRF-002`, `REQ-PRF-006`, `REQ-PRF-007`, `REQ-NFR-013`, `REQ-PRF-008`, `REQ-PRF-010`, `REQ-PRF-011` |
| SCR-022 my points | `REQ-PTS-001`, `REQ-PTS-002`, `REQ-PTS-003`, `REQ-PTS-006`, `REQ-PTS-009`, `REQ-PTS-013` |
| SCR-023 certificates | `REQ-CRT-005`, `REQ-CRT-006`, `REQ-CRT-013`, `REQ-CRT-014`, `REQ-INT-010` |
| SCR-024 bookmarks | `REQ-DSC-006` |
| SCR-025 calendar | `REQ-CAL-001` … `REQ-CAL-008` |
| SCR-026 notifications | `REQ-NTF-001`, `REQ-NTF-003`, `REQ-NTF-005`, `REQ-NTF-006` |
| SCR-027 leaderboards | `REQ-LDR-001`, `REQ-LDR-002`, `REQ-LDR-003`, `REQ-LDR-007`, `REQ-LDR-008` |
| SCR-028 companies | `REQ-LDR-004`, `REQ-LDR-005`, `REQ-LDR-006` |
| SCR-040 dashboard | `REQ-ADM-004` |
| SCR-041 proposals | `REQ-PRO-005`, `REQ-PRO-007`, `REQ-PRO-009` |
| SCR-042 sessions | `REQ-ADM-005`, `REQ-SES-003`, `REQ-SES-005`, `REQ-SES-012` |
| SCR-043 schedule | `REQ-CHK-010`, `REQ-SES-001`, `REQ-SES-002`, `REQ-SES-006`, `REQ-SES-007`, `REQ-SES-009`, `REQ-CRT-002`, `REQ-DSG-001`, `REQ-DSG-002`, `REQ-DSG-003`, `REQ-DSG-020`, `REQ-PRO-009`, `REQ-SES-014`, `REQ-DSG-027` |
| SCR-044 attendance | `REQ-CHK-008`, `REQ-CHK-012`, `REQ-RAT-005`, `REQ-CHK-017` |
| SCR-045 certificates | `REQ-CRT-001`, `REQ-CRT-003`, `REQ-CRT-004`, `REQ-CRT-011`, `REQ-CRT-012`, `REQ-DSG-031` |
| SCR-046 venues | `REQ-ADM-006`, `REQ-SES-006` |
| SCR-047 categories | `REQ-ADM-007`, `REQ-DSC-001`, `REQ-DSC-002`, `REQ-DSC-004`, `REQ-DSC-008` |
| SCR-048 companies | `REQ-ADM-008`, `REQ-PRF-002` |
| SCR-049 members | `REQ-ADM-009`, `REQ-TEN-005`, `REQ-AUT-007`, `REQ-AUT-008` |
| SCR-050–052 moderation | `REQ-ADM-010`, `REQ-EVT-008`, `REQ-EVT-012`, `REQ-EVT-014` |
| SCR-053 scoring | `REQ-ADM-011`, `REQ-PTS-004`, `REQ-PTS-005`, `REQ-PTS-007`, `REQ-PTS-008`, `REQ-PTS-010`, `REQ-PTS-014` |
| SCR-054 recognition | `REQ-ADM-012`, `REQ-REC-001` … `REQ-REC-008` |
| SCR-055–056 templates | `REQ-ADM-013`, `REQ-DSG-004`, `REQ-DSG-007`, `REQ-DSG-008`, `REQ-DSG-024`, `REQ-DSG-026` |
| SCR-057 designer | `REQ-DSG-005`, `REQ-DSG-006`, `REQ-DSG-009` … `REQ-DSG-012`, `REQ-DSG-014`, `REQ-DSG-015`, `REQ-DSG-016` … `REQ-DSG-019`, `REQ-DSG-022`, `REQ-DSG-023`, `REQ-DSG-025`, `REQ-DSG-028`, `REQ-DSG-029`, `REQ-DSG-030`, `REQ-UIX-013` |
| SCR-058 emails | `REQ-ADM-014`, `REQ-NTF-007`, `REQ-NTF-009` … `REQ-NTF-014` |
| SCR-059 branding | `REQ-ADM-015`, `REQ-DSG-021` |
| SCR-060 reminders | `REQ-ADM-016`, `REQ-NTF-004` |
| SCR-061 exports | `REQ-ADM-017`, `REQ-INT-010` |
| SCR-062 audit | `REQ-ADM-018`, `REQ-NFR-006` |
| SCR-063 settings | `REQ-TEN-008`, `REQ-INT-006`, `REQ-MAT-008`, `REQ-MAT-009` |
| SCR-064 survey results | `REQ-SUR-005`, `REQ-SUR-006`, `REQ-SUR-007`, `REQ-SUR-008` |
| SCR-065 survey templates | `REQ-SUR-001`, `REQ-SUR-002` |
| SCR-080 orgs | `REQ-ADM-001`, `REQ-TEN-001`, `REQ-TEN-002`, `REQ-TEN-006`, `REQ-NFR-014` |
| SCR-081 create org | `REQ-TEN-002`, `REQ-TEN-004` |
| SCR-082 domains | `REQ-TEN-007`, `REQ-AUT-003` |
| SCR-083 platform templates | `REQ-DSG-008` |
| SCR-084 metrics | `REQ-ADM-003` |
| SCR-085 impersonate | `REQ-ADM-002`, `REQ-ADM-019`, `REQ-TEN-003` |

### 7.3 Requirements that are properties of every screen

These have no single screen because they hold on **all** of them. Listing them against one screen
would be a worse lie than listing them here.

| Requirement | Where it shows up |
|---|---|
| `REQ-INT-001` RTL by default | every screen's rendering |
| `REQ-INT-002` externalised strings | every string on every screen |
| `REQ-INT-003` locale-aware dates and numbers | every date and number |
| `REQ-INT-004` logical properties | every layout |
| `REQ-INT-005` typography tokens | every text node |
| `REQ-INT-006` numeral system | every numeral, plus exports and email |
| `REQ-INT-007` bidi isolation | every interpolated value |
| `REQ-INT-008` English later | every route |
| `REQ-INT-009` self-hosted subsetted fonts | every screen's first paint |
| `REQ-NFR-007` WCAG 2.2 AA | every interactive element |
| `REQ-NFR-008` performance budgets | the eight budgeted screens: `SCR-000`, `SCR-011`, `SCR-012`, `SCR-013`, `SCR-014`, `SCR-027`, `SCR-040`, `SCR-057` |
| `REQ-NFR-009` mobile-first | every screen at 375 px |
| `REQ-UIX-001` the component system is the only source of primitives | every control on every screen |
| `REQ-UIX-006` navigation progress | every navigation in the app |
| `REQ-UIX-007` control pending state | every action control |
| `REQ-UIX-014` reduced motion, by token | every animated surface |
| `REQ-UIX-016` an error boundary at every loading boundary | every route segment, plus the root |
| `REQ-UIX-017` skip link, and nothing fixed obscures focus | the shell, and every screen under it |
| `REQ-UIX-020` transform/opacity/filter only, 60 fps | every animation in the product |

---

## 8. Route coverage — every one of the 59 routes has a milestone · `DEC-097`

`16-ui-redesign.md` **specifies what these screens become**; this document keeps the inventory
(`DEC-086`), so the table lives here rather than in `16` §15 (`DEC-102`). Each screen block above
carries a one-line **«`16` supersedes its visual notes»** pointer where `16` reaches it; this table
is the machine-checkable version of the same fact, and the rule behind it is:

> **A screen absent from a plan is not a screen deferred — it is a screen nobody decided about.**

Mapping all **59** `page.tsx` files under `src/app/[locale]/` against `16` §15's milestone tables
found **eleven routes in no milestone at all**, marked ★ below. Four are public or pre-auth and so
carry the *first* impression of the redesign; three are the operational core of the
attend-and-be-recognised loop; one is the hardest RTL surface in the product.

Three counts that are **not** interchangeable and are reconciled here once: **59 routes** (files on
disk, this table), **53 screens** (`SCR-*`, §7.1 — some screens cover more than one route and two
inventory screens have no route yet), and **49 pages under `app/[locale]/app/**`** (the scope of the
`loading-coverage` and `error-coverage` gates).

| Route | Screen | M | Note |
|---|---|---|---|
| `(marketing)/page.tsx` · `/register` · `[...rest]` | SCR-000 · SCR-001 | **M13** | The frozen contract, re-cut by `DEC-078`. Untouched before M13 |
| ★ `(auth)/sign-in` | SCR-002 | **M9 ✗ NOT DONE — carried, `DEC-129`** | The first screen every member sees, and the only place `SC 3.3.8` applies |
| ★ `(auth)/choose-org` | SCR-003 | **M9 ✗ NOT DONE — carried, `DEC-129`** | The fork that decides which `org_id` the session carries, permanently |
| ★ `(auth)/no-access` | SCR-004 | **M9 ✗ NOT DONE — carried, `DEC-129`** | The product's only answer to «فتحت الرابط ولا شيء يعمل» |
| `legal/privacy` · `legal/terms` | SCR-005 | **M13** | Public, and the home of the accessibility statement |
| `verify/[code]` | SCR-006 | **M12** | Reached from a **printed** certificate; where `DEC-095`'s numeral bug fails silently |
| ★ `s/[id]` | SCR-007 | **M10** | How members actually arrive — the WhatsApp entry path |
| `app/page.tsx` | SCR-010 | **M10** | One «التالية لك» card, not five rails (`DEC-098`) |
| `app/sessions` | SCR-011 | **M10** | A date-grouped schedule, not a nine-facet catalogue (`DEC-098`) |
| `app/sessions/[id]` | SCR-012 | **M10** | The most important screen in the product — hero, action card, sub-nav |
| ★ `app/sessions/[id]/materials/[materialId]` | SCR-013 | **M10** | The RTL document viewer; `10` §2.4's next/previous direction is the one that gets missed |
| ★ `app/sessions/[id]/check-in` | SCR-014 | **M10** | «The most operationally important input in the product»; `DEC-090` row 5 rewrote it |
| ★ `app/sessions/[id]/rate` | SCR-015 | **M10** | Never designed while `16` §9.2 rebuilt what sits on it; the survey lands on it in M11 |
| ★ `app/sessions/[id]/host` | SCR-016 | **M10** | Projected in front of a room — the only screen with an audience rather than a user |
| `app/propose` · `app/propose/[id]` | SCR-017 · SCR-018 | **M10** | The form model's first real consumer; objectives and tags land here |
| `app/members/[id]` | SCR-020 | **M10** | Profiles, and the avatar's home surface |
| `app/me` | SCR-021 | **M10** | The tabbed hub; the tab shell is the lead's |
| `app/me/points` · `bookmarks` · `calendar` · `certificates` · `notifications` | SCR-022 … SCR-026 | **M10** | Re-skinned onto the system, under the hub's tab strip |
| ★ `app/me/privacy` | — | **M13** | The screen a member uses when they are unhappy |
| `app/leaderboards` | SCR-027 · SCR-028 | **M10** | Company board included; **no avatars here** (`DEC-099`) |
| `app/admin` | SCR-040 | **M11** | Becomes a real dashboard: counts that are links, queues with ages |
| `app/admin/proposals` | SCR-041 | **M11** | Gains the content-edit diff (`REQ-PRO-009`) |
| `app/admin/sessions` | SCR-042 | **M11** | On `DataTable`, with the phone stack |
| `app/admin/sessions/[id]/schedule` | SCR-043 | **M11** | Two tabs — المحتوى and الإعدادات — on top of `0084` |
| `app/admin/sessions/[id]/attendance` | SCR-044 | **M11** | Avatars earn their highest-value placement on the host view, not here |
| `app/admin/sessions/[id]/certificates` | SCR-045 | **M12** | The three-step flow (`REQ-DSG-031`) |
| `app/admin/sessions/[id]/survey` | SCR-064 | **M11** | New — `DEC-074`, `DEC-083` |
| `app/admin/surveys` · `app/admin/surveys/[templateId]` | SCR-065 | **M11** | New — `DEC-160`; built in wave 10 |
| `app/admin/venues` · `categories` · `companies` · `members` | SCR-046 … SCR-049 | **M11** | `categories` is renamed «التصنيفات والوسوم» and gains `REQ-DSC-008` |
| `app/admin/moderation/{comments,photos,reports}` | SCR-050–052 | **M11** | Avatars join the queue's scope (`REQ-PRF-010`) |
| `app/admin/scoring` · `recognition` | SCR-053 · SCR-054 | **M11** | `member-picker.tsx` here is promoted to `ui/combobox` in M9 |
| `app/admin/templates/{posters,certificates}` | SCR-055–056 | **M12** | The card grid, with the platform library clearly separate |
| `app/admin/designer/[documentId]` | SCR-057 | **M12** | Direct manipulation (`REQ-DSG-028` … `REQ-DSG-030`) |
| `app/admin/emails` | SCR-058 | **M12** | The block editor; ownership returns to `notify` (`DEC-085`) |
| `app/admin/branding` | SCR-059 | **M13** | Plus the status-colour contrast enforcement `DEC-073` leaves dangling |
| `app/admin/reminders` | SCR-060 | **M11** | On the system with the rest of the console |
| `app/admin/exports` · `audit` · `settings` | SCR-061 … SCR-063 | **M11** | `exports` carries `REQ-INT-010`'s Western-digit rule |
| `app/platform/**` (7 routes) | SCR-080 … SCR-085 | **M13** | Deferred from M11 — cosmetic work on screens only the owner sees |
| `(dev)/ui` | — | **M9** | Not a product screen: the component gallery, 404 unless `KAREEM_GALLERY=1` (`DEC-083`) |

**Leave, with a reason:** none. Every route is placed. Two screens in §7.1's inventory — SCR-019
(`/app/members`, the directory) and the companies leaderboard — have **no route on disk yet**; they
are built with their milestone's work and are not a coverage gap in this table.
