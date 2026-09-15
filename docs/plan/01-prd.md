# 01 — Product Requirements

**Status:** `draft` → `settled` at the end of Wave 0 · **Owns:** the `REQ-*` ID space
**Cites:** `_source-brief.md`, `ASSUMPTIONS.md`, `OPEN-QUESTIONS.md`, `DECISIONS.md`

> **This is the only document that may define a requirement.** Every other document in this set
> cites `REQ-*` IDs. A document that needs a requirement that does not exist here has found a gap
> in this file — the fix is to add it here, not to define it there.

## How to read a requirement

```
#### REQ-<AREA>-<NNN> — <one-line statement>
**Serves:** <D* / A* / DEC-* / OQ-*> · **Priority:** must | should
<body: what the system does, in enough detail to implement>
**Acceptance:**
- <observable, testable criterion>
```

**Priority** is `must` unless stated. There is no MVP cut (`_source-brief.md` §1) — `should`
marks a requirement whose *absence* would not block launch, not one that ships later.
Area codes are listed in `00-overview.md` §5.

All user-facing strings in this document are written in **Arabic**, because Arabic is the source
language (D5). English glosses appear only where a term is ambiguous.

---

## 1. Tenancy and orgs — `TEN`

#### REQ-TEN-001 — The platform hosts many independent orgs
**Serves:** D1
The platform hosts many **مؤسسات**. Each has its own admins, members, content, scoring
configuration, recognition configuration, templates and branding. Nothing is shared between them
except the platform-wide template library (D67) and the platform's own code.
**Acceptance:**
- Two orgs can hold sessions with the same title, the same category names and the same company
  names without collision.
- Every domain table carries an org key; see `REQ-NFR-001`.

#### REQ-TEN-002 — Only the super admin creates an org
**Serves:** D2
There is no org self-registration, no "create your organization" flow and no invite that creates
one. **مدير المنصة** creates a مؤسسة, sets its name, allowed email domains and first org admin.
**Acceptance:**
- No route reachable by a member or an org admin creates an org.
- Creating an org writes an audit entry naming the super admin who did it.

#### REQ-TEN-003 — Cross-org reads are impossible, not merely hidden
**Serves:** D3 · DEC-014
Isolation is enforced at the database by RLS, not by application filters. A query that forgets
its `where org_id = …` returns **no rows from another org**, ever — including through join
tables, ledgers, storage objects, search results and leaderboards.
**Acceptance:**
- For every table, a test authenticated as a member of org A returns zero rows belonging to org B
  even when the query has no org predicate (`REQ-NFR-001`).
- No RLS policy contains a super-admin escape disjunct (DEC-014).
- Storage paths are built by a single server-side path builder; a nightly assertion proves no
  object sits outside its org's prefix.

#### REQ-TEN-004 — A user account belongs to exactly one org
**Serves:** D4 · A2
One account, one مؤسسة, permanently. There is no org switcher and no account that spans orgs.
**Acceptance:**
- `org_id` is non-null on the member record and is **immutable** after creation.
- The `org_id` JWT claim cannot change for the life of the account (DEC-014).

#### REQ-TEN-005 — Three org-level roles
**Serves:** D7 · D8 · A1
**مشرف المؤسسة** (org admin — full control), **مُنظِّم** (moderator — moderation queues,
event-day operations, content removal), **عضو** (member — the default). **مدير المنصة** exists at
platform level only.
**Acceptance:**
- A new auto-provisioned account is a **عضو**.
- A **مُنظِّم** cannot reach settings, scoring configuration, member management or session
  scheduling — enforced by policy, not by hidden navigation (`REQ-ADM-020`).
- Every role change is audited with actor, subject, old role and new role.

#### REQ-TEN-006 — An org can be suspended
**Serves:** D59
**مدير المنصة** can suspend a مؤسسة. Suspended orgs reject sign-in with an explanatory message;
data is retained, not deleted. Suspension is reversible.
**Acceptance:**
- A member of a suspended org signing in sees **«هذه المؤسسة موقوفة حاليًا»** and reaches no app
  route.
- Suspension and reinstatement are both audited.
- Scheduled jobs for a suspended org (reminders, calendar sync, certificate issuance) stop.

#### REQ-TEN-007 — Each org has an admin-managed allowed-domain list
**Serves:** D11
One or more email domains per مؤسسة. Adding or removing a domain is an admin action. Removing a
domain does **not** deprovision existing members.
**Acceptance:**
- Domains are stored normalised (lowercase, no leading `@`).
- Adding, removing and editing a domain are each audited.
- Removing a domain prevents *new* provisioning only; existing members keep access.

#### REQ-TEN-008 — Org settings are configurable without a deploy
**Serves:** D38 · A7 · A16 · A19 · A20 · A30
Each مؤسسة configures, at minimum: default time zone (A20), numeral system (A30 — Western or
Arabic-Indic, default Western), file size limits (A16), check-in code rotation period and grace
period (A7), reminder schedule (A19), company-leaderboard ranking metric (A11), maximum
co-presenters (OQ-021), and its sending identity and reply-to (OQ-016).
**Acceptance:**
- Changing any of these takes effect without a deployment.
- Every change is written to the configuration history with actor, timestamp, old value and new
  value (`REQ-PTS-005` generalises this for scoring).

---

## 2. Authentication and membership — `AUT`

#### REQ-AUT-001 — Google sign-in
**Serves:** D10
Google is the authentication method at launch, through Supabase Auth's Google provider. There is
no password, no magic link and no invite flow.
**Acceptance:**
- Sign-in completes without the user ever entering a password on this platform.
- The session is verified **server-side** on every request that reads data (`REQ-NFR-004`).

#### REQ-AUT-002 — The auth layer accepts new methods without a schema change
**Serves:** D10
Identity is modelled so that adding a second provider later — Microsoft, SAML, email OTP — is
configuration and UI, not a migration.
**Acceptance:**
- No table column is named for or typed to Google specifically.
- The member record keys off the auth user ID, not off an email address or a provider ID.

#### REQ-AUT-003 — Domain-gated auto-provisioning on first sign-in
**Serves:** D11
A Google account whose email domain appears on a مؤسسة's allowed list is **auto-provisioned as a
عضو of that org on first sign-in**. No invitation, no admin approval step.
**Acceptance:**
- First sign-in with an allowed domain creates the member record and lands the user in the app.
- The account's `org_id` is set once, at provisioning, and never changes (`REQ-TEN-004`).
- Provisioning is idempotent: a concurrent double sign-in creates exactly one member.

#### REQ-AUT-004 — Ambiguous domains are resolved once, permanently
**Serves:** A2 · D4
If a domain appears on more than one org's allowed list, the user chooses their مؤسسة once. The
choice is **permanent** and is enforced by the immutability of `org_id`, not by hiding the picker.
**Acceptance:**
- The picker appears only when the domain genuinely matches more than one org.
- After the choice, re-signing in never shows the picker again.

#### REQ-AUT-005 — Sign-in preserves the intended destination
**Serves:** D58 · D68
An unauthenticated request for a protected route — the realistic case being **someone scanning a
poster QR** — signs in and lands on **the thing they were trying to reach**, not on a generic
dashboard.
**Acceptance:**
- Scanning a poster QR while signed out ends on that session's event page after sign-in.
- The stored destination is validated as an internal path; an external URL is discarded.

#### REQ-AUT-006 — A non-matching domain gets an explanation, not a dead end
**Serves:** D11 · D58
A Google account whose domain is on no org's list sees a clear message — this is a private
platform for member organizations — and a way to contact whoever runs it. It never sees a blank
screen, a generic error, or a silent redirect loop.
**Acceptance:**
- The message names no org and leaks nothing about which domains exist.
- No account, member row or audit subject is created for a rejected sign-in.

#### REQ-AUT-007 — Claims carry `org_id`; mutable authority is re-read on privileged writes
**Serves:** D3 · DEC-014
`org_id` is an **immutable** JWT claim, so isolation never depends on claim freshness.
`org_role` and member `status` are mutable, so every privileged write re-reads them from the
database along with a `claims_version`, and rejects a stale token with `stale_claims`. JWT expiry
is 900 seconds.
**Acceptance:**
- Demoting an admin takes effect on their next privileged write, not on their next token refresh.
- A write attempted with a stale `claims_version` fails with `stale_claims` and writes nothing.

#### REQ-AUT-008 — Deactivation ends access immediately
**Serves:** D60 · A11
An org admin can deactivate a عضو, with a **mandatory reason**. A deactivated member cannot sign
in, holds no seat reservations, and is excluded from the active-member denominator in the company
leaderboard from the **next** snapshot forward — never retroactively (A11).
**Acceptance:**
- Deactivation cancels the member's future RSVPs and notifies the affected sessions' organisers.
- Deactivation is audited with its reason.
- Existing leaderboard snapshots are unchanged by a deactivation.

---

## 3. Profiles and companies — `PRF`

#### REQ-PRF-001 — Profile fields
**Serves:** A3 · D12
Name and avatar come from Google. The member supplies: **الشركة** (required, chosen from the org
list), **المسمى الوظيفي**, **نبذة**, **اهتماماتي** (topics of interest, from the org's
تصنيفات).
**Acceptance:**
- A member with no **شركة** set is prompted for one before they can reserve a seat or submit a
  proposal.
- Name and avatar are refreshed from Google on sign-in; locally edited fields are not overwritten.

#### REQ-PRF-002 — The org admin maintains the company list
**Serves:** D12
**شركات** are an admin-managed list per مؤسسة. Members choose from it; they cannot type a free
value.
**Acceptance:**
- Renaming a شركة updates every profile referencing it and does **not** break existing leaderboard
  snapshots, which store the company by ID.
- A شركة with members cannot be deleted, only deactivated.

#### REQ-PRF-003 — Company drives the company leaderboard
**Serves:** D46 · D44
The **سباق الشركات** aggregates member points by the شركة on each member's profile at the time
the snapshot is taken.
**Acceptance:**
- A member changing شركة affects future snapshots only.

#### REQ-PRF-004 — Profiles render at two visibility tiers
**Serves:** D69 · DEC-011 · A33
A profile renders differently for **self**, for another **عضو** of the same org, and for an
**مشرف المؤسسة**. The full field matrix is **A33**, which is normative. Four rules are
non-negotiable:
1. **التقييمات التي قدّمها العضو** are never member-visible (protects D36).
2. **تغيّب** and **إلغاء متأخر** history is admin-only; **self sees their own**.
3. **الجلسات التي حضرها** is not member-visible; **الجلسات التي قدّمها** is.
4. Google Calendar OAuth tokens are visible to **nobody**, including org admins and the member
   themselves — only the connection status is shown.
**Acceptance:**
- A member requesting another member's profile through any route — page, API, search result,
  realtime payload — receives only the `member` tier's fields.
- Tier enforcement is in RLS and the DAL, not in the rendering layer.
- No photo tagging exists; "الصور" on a profile means photos that member **uploaded**.

#### REQ-PRF-005 — Member directory
**Serves:** A3
Members can browse and search the members of their own مؤسسة, filtered by شركة and by
اهتمامات. Results respect the `member` tier (`REQ-PRF-004`).
**Acceptance:**
- The directory never returns a member of another org (`REQ-TEN-003`).
- Deactivated members are excluded by default and marked when shown to an admin.

#### REQ-PRF-006 — A member can export their own data
**Serves:** §6 privacy · OQ-023
A member can export everything the platform holds about them — profile, RSVPs, check-ins,
comments, photos, ratings they submitted, their full **سجل النقاط**, certificates — as a
machine-readable archive.
**Acceptance:**
- The export contains no other member's personal data, including in comment threads (other
  members' comments appear as their content but are attributed by display name only).
- Requesting an export is rate-limited (`REQ-NFR-005`).

#### REQ-PRF-007 — Members are deactivated, not self-deleted
**Serves:** OQ-023 · §6 privacy
A member requests deactivation; an **مشرف المؤسسة** performs it (`REQ-AUT-008`). Personal data is
anonymised on the retention schedule in OQ-019; ledger rows retain a **pseudonymous ID** so org
balances still reconcile.
**Acceptance:**
- After anonymisation, no ledger row is deleted and every org-level total is unchanged.
- Content the member authored remains, attributed to **«عضو سابق»**.

---

## 4. Proposals — `PRO`

#### REQ-PRO-001 — A member proposes a topic, never a date
**Serves:** D13
The **مقترح** form collects a topic and nothing schedule-shaped. No date field, no time field, no
venue field, anywhere in the member-facing proposal flow.
**Acceptance:**
- The proposal form and its validation schema contain no date, time or venue field.
- A proposal in any state has no date, time or venue until an admin schedules it.

#### REQ-PRO-002 — Proposal fields
**Serves:** A4
**العنوان**, **النبذة** (abstract), **التصنيف**, **المستوى** (تمهيدي / متوسط / متقدم),
**الفئة المستهدفة**, **المدة المتوقعة**, **مقدّمون مشاركون**, optional draft **مواد**, and
**ملاحظات للمشرف**.
**Acceptance:**
- Required: العنوان, النبذة, التصنيف, المستوى.
- The Arabic labels for العنوان, النبذة and التصنيف match the copy members already saw on the
  pre-launch registration form.
- **المدة المتوقعة** pre-fills the schedule form and is never authoritative (OQ-001).

#### REQ-PRO-003 — Co-presenters are named on the proposal
**Serves:** A5 · OQ-021
A proposal may name other **أعضاء** as **مقدّمون مشاركون**, up to the org's configured maximum
(default 4). Named co-presenters are notified and can decline.
**Acceptance:**
- Only members of the same مؤسسة can be named.
- A declined co-presenter is removed from the proposal and the proposer is notified.
- All accepted presenters earn presenter points and presenter certificates (`REQ-PTS-*`,
  `REQ-CRT-001`).

#### REQ-PRO-004 — Draft materials may be attached to a proposal
**Serves:** A4 · D25
Draft **مواد** attached to a proposal are visible to admins only until the session is published.
They obey every materials rule (`REQ-MAT-*`).
**Acceptance:**
- Draft materials are not visible to members before publication.
- On publication they carry over to the session, retaining their availability flag.

#### REQ-PRO-005 — Admin review: approve, reject, or request changes
**Serves:** D14
An **مشرف المؤسسة** reviews each مقترح and takes one of three actions. Rejection and
change-requests both require a **written reason** that the proposer receives.
**Acceptance:**
- All three actions notify the proposer and every accepted co-presenter.
- A change-request returns the proposal to the proposer for editing and resubmission.
- Approving does **not** publish — scheduling is a separate act (`REQ-SES-001`).

#### REQ-PRO-006 — Proposal states are explicit and audited
**Serves:** D16 · A6
`draft → submitted → in_review → changes_requested → (submitted) → approved | rejected`.
Every transition records who caused it, when, and any reason.
**Acceptance:**
- No transition occurs without an audit row.
- A proposal cannot skip states; the diagram in `02-domain-model.md` is normative.

#### REQ-PRO-007 — An admin can create a session directly
**Serves:** A4
An **مشرف المؤسسة** can create a session without a member proposal, assigning a presenter.
**Acceptance:**
- The assigned presenter is notified and can decline, which returns the session to `draft`.
- A directly created session is indistinguishable from a proposed one downstream, except in the
  audit log.

#### REQ-PRO-008 — Proposal pipeline is visible to its author
**Serves:** D13 · D60
A member sees the state of every **مقترح** they submitted, including the reason attached to a
rejection or a change-request.
**Acceptance:**
- A member sees only their own proposals and those where they are a named co-presenter.

---

## 5. Sessions, scheduling and venues — `SES`

#### REQ-SES-001 — The admin schedules and publishes
**Serves:** D14
From an approved **مقترح**, an **مشرف المؤسسة** sets: date and start time, duration, **المكان**,
**السعة**, **آخر موعد للحجز**, **آخر موعد للإلغاء**, certificate mode (D50), **المهام
التحضيرية**, and the **ملصق** — then publishes.
**Acceptance:**
- Publishing is blocked until date, time, duration, venue, capacity and poster are all set.
- Publishing notifies the org per the notification matrix and makes the session visible to members.

#### REQ-SES-002 — Session fields
**Serves:** D14 · OQ-001 · OQ-017 · OQ-018
A session stores, beyond its proposal fields: `starts_at`, `duration`, `ends_at` (derived at
scheduling, independently editable — OQ-001), venue reference **or** inline custom venue,
capacity, RSVP deadline, cancellation cutoff, certificate mode, **لغة الجلسة** (default `ar` —
OQ-017), and time zone (inherited from the venue, else the org — OQ-018).
**Acceptance:**
- `ends_at` is a stored column, not computed at read time.
- `ends_at > starts_at`, RSVP deadline `<= starts_at`, cancellation cutoff `<= starts_at`, all
  enforced as database constraints.

#### REQ-SES-003 — Session states are explicit and audited
**Serves:** D16 · A6
`draft → submitted → in_review → changes_requested → approved → published → in_progress →
completed → archived`, with `cancelled` reachable from any state **after approval, including
`completed`**. `full` is a **derived display state** (`confirmed_count >= capacity`), never
stored.
**Acceptance:**
- Every transition writes an audit row with actor, from-state, to-state, timestamp and reason.
- Storing `full` anywhere is a defect: it would be able to disagree with the RSVP table.

#### REQ-SES-004 — The clock moves sessions, not people
**Serves:** A6
A scheduled job moves `published → in_progress` at `starts_at` and `in_progress → completed` at
`ends_at`.
**Acceptance:**
- Transitions are idempotent: running the job twice moves a session once.
- A session whose state was overridden by an admin is not moved back by the job.

#### REQ-SES-005 — Admins can override any transition
**Serves:** A6
An **مشرف المؤسسة** can start, complete, cancel or reopen a session manually.
**Acceptance:**
- Manual transitions are audited and flagged as manual.
- Completing early closes the check-in window immediately (`REQ-CHK-004`).

#### REQ-SES-006 — Venue list
**Serves:** D17
Each مؤسسة maintains **أماكن**: الاسم, العنوان, رابط الخريطة, السعة, ملاحظات, and an optional
time-zone override (OQ-018).
**Acceptance:**
- A venue in use by a future session cannot be deleted, only deactivated.
- Selecting a venue pre-fills the session's capacity from the venue's, editable afterwards.

#### REQ-SES-007 — One-off custom venues
**Serves:** D17
A session may use a custom venue entered inline instead of a list entry.
**Acceptance:**
- A custom venue requires at minimum a name and an address.
- A custom venue is not silently added to the org's venue list; promoting it is an explicit action.

#### REQ-SES-008 — Every session is offline and in person
**Serves:** D15
There is no virtual attendance, no stream URL, no "join online" affordance anywhere in the
product.
**Acceptance:**
- No session field, notification or screen offers remote attendance.

#### REQ-SES-009 — Changes propagate
**Serves:** §6 event pages · D57
A change to time, date or venue notifies every confirmed attendee and every waitlisted member,
and updates every synced calendar (`REQ-CAL-005`).
**Acceptance:**
- The notification states **what changed**, old value and new value — not merely that something
  did.
- A poster that is still **live** regenerates (DEC-012, `REQ-DSG-003`).

#### REQ-SES-010 — Cancellation
**Serves:** A6 · OQ-022
Cancelling requires a reason. The event page **stays**, with **«جلسة ملغاة»** shown prominently.
Materials stay accessible to anyone who had reserved a seat. Comments freeze — readable, no new
ones. No points are awarded and no certificates issued. Synced calendar events are removed.
**Acceptance:**
- Every confirmed and waitlisted member is notified, with the reason.
- The page never 404s; a shared link keeps working.

#### REQ-SES-011 — Sessions declare their spoken language
**Serves:** OQ-017
**لغة الجلسة** (default `ar`) describes the room, not the interface. It appears on the event page
and as a search filter.
**Acceptance:**
- Language is shown before the RSVP action, not below it.

#### REQ-SES-012 — Archiving
**Serves:** A6
A completed session can be archived. Archived sessions stay readable and searchable; they accept
no new comments, ratings or materials.
**Acceptance:**
- Archiving is reversible by an admin, and audited.

#### REQ-SES-013 — Session detail is the first thing on the event page
**Serves:** §6 event pages
Date, time, **المكان** with a map link, **المُقدِّم**, and the purpose of the session appear
above everything else. Exactly **one** primary action is present — «احجز مقعدك» / «انضم لقائمة
الانتظار» / «ألغِ حجزي» — placed in the mobile thumb zone.
**Acceptance:**
- On a 375 px-wide viewport the primary action is reachable without scrolling past the fold, and
  is at least 44 px tall.
- Live **السعة** and, for a waitlisted member, their **موقعك في قائمة الانتظار** are visible
  without interaction.

---

## 6. RSVP and waitlist — `RSV`

#### REQ-RSV-001 — A member reserves a seat
**Serves:** D18
A member can reserve a seat on any **published** session in their مؤسسة, before **آخر موعد
للحجز**, while capacity remains.
**Acceptance:**
- The action is idempotent: double-submitting produces one حجز.
- The confirmation states the date, time, venue and the **آخر موعد للإلغاء** in one place.

#### REQ-RSV-002 — Capacity is enforced at the database
**Serves:** D18
**السعة** is a hard limit on confirmed reservations, enforced by a database constraint or a
serialised transaction — not by reading a count and then inserting.
**Acceptance:**
- A concurrency test firing N simultaneous reservations at a session with N−1 seats confirms
  exactly N−1 and waitlists the rest.

#### REQ-RSV-003 — Waitlist with automatic promotion
**Serves:** D19
When capacity is full, a reservation joins **قائمة الانتظار** in order. When a seat frees, the
**first** waitlisted member is promoted automatically.
**Acceptance:**
- Promotion is in strict join order.
- Promotion is atomic with the cancellation that freed the seat — no window where the seat is
  free but unassigned.

#### REQ-RSV-004 — A promoted member is told
**Serves:** D19
Promotion sends an immediate notification stating that the member now **holds a seat**, with the
session details and the cancellation cutoff.
**Acceptance:**
- The notification goes out on both channels the member has enabled (D56).
- A promoted member's calendar sync is created, not just updated (`REQ-CAL-004`).

#### REQ-RSV-005 — RSVP deadline
**Serves:** D20 · OQ-002
After **آخر موعد للحجز**, no new reservations and no new waitlist joins are accepted.
**Promotion off the existing waitlist continues until the session starts** (OQ-002).
**Acceptance:**
- The deadline is stated on the event page in plain language before it passes, and the reason the
  action is unavailable is stated after it passes.
- A promotion occurring after the deadline succeeds and notifies normally.

#### REQ-RSV-006 — Cancellation and the cutoff
**Serves:** D21
A member can cancel their حجز at any time. A cancellation after **آخر موعد للإلغاء** is recorded
as an **إلغاء متأخر**.
**Acceptance:**
- Cancelling frees the seat and triggers promotion immediately (`REQ-RSV-003`).
- The UI states, before the member confirms, whether this cancellation will be recorded as late.

#### REQ-RSV-007 — Late cancellation is recorded, and may cost points
**Serves:** D21 · D40
**إلغاء متأخر** is a discrete, dated event. Whether it costs points is an org configuration
choice, **off by default** (`REQ-PTS-008`).
**Acceptance:**
- The event is recorded whether or not the org has enabled a penalty.
- It appears in the member's own history and in admin reporting, and is admin-only on profiles
  (A33).

#### REQ-RSV-008 — Leaving the waitlist is always free
**Serves:** OQ-003
Leaving **قائمة الانتظار** is never an **إلغاء متأخر** and can never trigger a negative action.
**Acceptance:**
- No negative ledger entry can reference a waitlist departure.

#### REQ-RSV-009 — Priority RSVP is a head start, never a displacement
**Serves:** D48 · OQ-012
Members holding the priority-RSVP **ميزة** can reserve for a configurable window (default 24
hours) **before** general RSVP opens. They never displace an existing seat holder and never jump
an existing waitlist.
**Acceptance:**
- During the priority window, a member without the perk sees when general RSVP opens, stated
  plainly.
- No confirmed حجز is ever revoked to make room for a perk holder.

#### REQ-RSV-010 — Counts are live
**Serves:** A18 · §6 event pages
Remaining **السعة**, waitlist length and the member's own waitlist position update live on the
event page.
**Acceptance:**
- A seat freed in another browser is reflected without a manual refresh.
- If realtime is unavailable, counts still render correctly from the server on load (DEC-020).

#### REQ-RSV-011 — Reserving a seat earns nothing
**Serves:** D42
**الحجز** is worth zero points and can never be configured otherwise.
**Acceptance:**
- The RSVP action is absent from the configurable action catalogue.

---

## 7. Check-in and attendance — `CHK`

> This is the integrity keystone. Points, ratings, certificates and photo rights all hang off one
> event, and nothing else grants them.

#### REQ-CHK-001 — The presenter's host view shows the live code
**Serves:** D22 · A7
The host view displays the current **رمز الحضور** at a size readable from across a room, with the
time until it rotates, a live check-in count, and a **«أبطل هذا الرمز الآن»** control.
**Acceptance:**
- The code is legible at 3 metres on a phone held up, and on a projected screen.
- The check-in count updates live (A18).

#### REQ-CHK-002 — Code format and rotation
**Serves:** A7 · DEC-015
Six characters, rotating every 10 minutes (org-configurable), with the previous code valid for a
2-minute grace period. Each rotation window's code is a **stored row**, not derived from a secret.
**Acceptance:**
- Codes avoid characters that are ambiguous when read aloud or across a room.
- Exactly one code is current at any instant; at most one other is within its grace period.
- Changing the org's rotation period does not invalidate codes already issued.

#### REQ-CHK-003 — A member checks in by entering the code
**Serves:** D22
The member enters the code in the app. A correct code within the window marks them **حاضر** and
records the arrival timestamp.
**Acceptance:**
- Entry is a single field on a screen reachable in one tap from the event page.
- Success is unambiguous: the member sees **«تم تسجيل حضورك»** and the page state changes.

#### REQ-CHK-004 — The code is valid only during the session window
**Serves:** D23
A code is accepted only while the session is `in_progress`. It expires when the session ends —
including when an admin completes it early (`REQ-SES-005`).
**Acceptance:**
- A code entered before the session starts or after it ends is rejected with a message that says
  which, without revealing whether the code itself was correct.

#### REQ-CHK-005 — One check-in per member per session
**Serves:** D23
Single use is enforced by a uniqueness constraint on (session, member), not by application logic.
**Acceptance:**
- A second check-in attempt by a checked-in member is a no-op that reports the existing check-in.
- The constraint holds under concurrent submission.

#### REQ-CHK-006 — Attempts are rate-limited inside the transaction
**Serves:** D23 · DEC-015 · §6 security
Check-in attempts are rate-limited **per member and per session**, with the counter maintained
**inside the check-in transaction** — not in process memory, which resets per serverless instance.
**Acceptance:**
- A guessing script is throttled identically regardless of which instance serves each request.
- Rate-limit rejections are logged and visible to admins as a security signal.
- Limits are stated in `12-security-privacy.md`; see `REQ-NFR-005`.

#### REQ-CHK-007 — A leaked code can be burned immediately
**Serves:** DEC-015
A presenter, admin or moderator can revoke the current code instantly; a new one is issued at
once. Previously accepted check-ins are unaffected.
**Acceptance:**
- Revocation takes effect on the next attempt, with no restart and no session disruption.
- Revocation is audited with actor and timestamp.

#### REQ-CHK-008 — Manual attendance backup
**Serves:** A8
Admins and moderators can mark a member present manually, with a **mandatory reason**. A manual
mark produces the **same check-in event** as a code entry; a `method` field records the
difference.
**Acceptance:**
- Manual marks are audited and flagged in every CSV export.
- A manual mark grants exactly the same rights as a code check-in — D24 is not weakened by the
  backup.

#### REQ-CHK-009 — The verified check-in is the sole trigger
**Serves:** D24
Attendance points, the right to rate, the attendee certificate and the right to upload photos are
granted **by the check-in event and by nothing else**. Not by RSVP, not by presence in a list, not
by an admin toggle that bypasses the event.
**Acceptance:**
- Each of the four rights is derived from the check-in record in policy, and a test proves each is
  denied to a member with a confirmed RSVP and no check-in.

#### REQ-CHK-010 — A reservation is not required to check in
**Serves:** OQ-005 · D24
A walk-in who enters a valid code is checked in and receives every attendance right. **السعة** is
a planning limit on reservations, not a door policy.
**Acceptance:**
- A member with no حجز who checks in earns attendance points and receives a certificate.
- Walk-ins are distinguishable in admin reporting.

#### REQ-CHK-011 — Presenters do not check in to their own session
**Serves:** OQ-025 · D9
A presenter of a session cannot check in to it, earns no attendance points for it, and cannot
rate it. They receive a **presenter** certificate, not an attendance one.
**Acceptance:**
- The check-in field is not offered to a presenter on their own session.
- A presenter attending a *different* session is an ordinary attendee there.

#### REQ-CHK-012 — Arrival timestamps and RSVP-vs-attendance reporting
**Serves:** §6 check-in integrity · D60
Every check-in records its arrival time. Admin reporting exposes, per session: reserved,
confirmed, checked in, walked in, no-showed, and the attendance rate.
**Acceptance:**
- The report is exportable as CSV with the manual-mark flag intact (`REQ-ADM-017`).

#### REQ-CHK-013 — A member cannot be in two rooms at once
**Serves:** §6 check-in integrity
Check-ins to sessions whose time windows overlap are **structurally impossible**, enforced by an
exclusion constraint rather than by a validation check.
**Acceptance:**
- An attempt to check in to a session overlapping one already attended is rejected with a message
  naming the conflicting session.

#### REQ-CHK-014 — Host-view access
**Serves:** OQ-013 · A1
The host view — and therefore the live code — is visible to the session's presenters, org admins
and moderators only. Not to members, including members who have already checked in.
**Acceptance:**
- A checked-in member requesting the host view is denied by policy, not merely by hidden UI.

---

## 8. Materials and the viewer — `MAT`

#### REQ-MAT-001 — Every material belongs to a session
**Serves:** D25
There are no standalone uploads. A **مادة** always has a parent **جلسة**.
**Acceptance:**
- No route accepts an upload without a session context.
- Deleting a session deletes or archives its materials with it; no orphan is left in storage.

#### REQ-MAT-002 — Supported material types
**Serves:** D26 (as narrowed by DEC-058)
PDF; Google Slides and other external links; video links (YouTube and similar); images;
voice/audio recordings. **Document uploads are PDF-only** (DEC-058, the owner's Launch decision):
PowerPoint and Keynote are not accepted — a deck is exported to PDF before it is uploaded.
**Acceptance:**
- Every type is validated **server-side by content sniffing, not by file extension** (DEC-009).
- An unsupported type is rejected with a message naming what is accepted.
- A PowerPoint or Keynote file, whatever its extension, is refused at upload; no row of that kind
  can exist (`materials_kind_pdf_only`, migration `0077`).

#### REQ-MAT-003 — Slides are read in an in-browser page-by-page viewer
**Serves:** D27
A PDF is rendered to page images (by poppler, inside the worker image — DEC-058) and presented in
**العارض** — page by page, keyboard operable, progressively loaded.
**Acceptance:**
- The viewer works without downloading the source file.
- Page navigation is RTL-correct: in an Arabic interface, "next" advances in the reading
  direction the member expects (`REQ-INT-004`).
- The viewer is keyboard operable and screen-reader labelled in Arabic (`REQ-NFR-007`).

#### REQ-MAT-004 — Keynote is download-only · **withdrawn by DEC-058**
**Serves:** DEC-006 · D26 — **superseded**: uploads are PDF-only from Launch, so `.key` files are
refused at upload like PowerPoint (`REQ-MAT-002`). Kept as an ID so citations resolve.
**Acceptance:**
- A `.key` upload is refused with the message naming what is accepted; no `keynote` row exists.

#### REQ-MAT-005 — Per-item download control
**Serves:** D27
The presenter sets **السماح بالتحميل** per material. When off, the material is viewable but the
file is not downloadable.
**Acceptance:**
- With download off, no route returns the source file to a member — the control is enforced at the
  storage policy and the signed-URL layer, not in the UI.
- Admins can always download, and that access is audited.

#### REQ-MAT-006 — Before/after availability
**Serves:** D28
Each material is flagged **قبل الجلسة** (pre-reads, downloadables) or **بعد الجلسة** (slides,
recordings).
**Acceptance:**
- A **بعد الجلسة** material is not visible to members until the session reaches `completed`.
- Changing the flag takes effect immediately and is audited.

#### REQ-MAT-007 — Audio, video, images, links
**Serves:** D27
Audio gets an in-page player; video links an embedded player; images a gallery; other links open
externally with an explicit indication that they leave the platform.
**Acceptance:**
- The audio player is keyboard operable and shows elapsed and total duration.
- External links carry `rel="noopener noreferrer"`.

#### REQ-MAT-008 — Who can add and remove materials
**Serves:** D28
Presenters and admins can add. **Admins can remove any material.** Presenters can remove their
own before the session completes.
**Acceptance:**
- Every removal is audited with actor and reason.
- Removing a material referenced by a **مهمة تحضيرية** warns the remover first.

#### REQ-MAT-009 — File size limits are enforced server-side
**Serves:** A16
Documents 50 MB, audio 200 MB, images 20 MB, poster uploads 30 MB — all org-configurable.
**Acceptance:**
- The limit is enforced server-side; a client-side check is a convenience, never the control.
- An over-limit upload fails with a message naming the limit and the file's actual size.

#### REQ-MAT-010 — Replacing a material keeps its history
**Serves:** A16
Replacing a material keeps prior versions in a version list.
**Acceptance:**
- The version list shows who replaced it and when.
- Members see the current version; admins can retrieve any prior version.

#### REQ-MAT-011 — Font substitution in rendered slides is surfaced
**Serves:** §6 Arabic typography · D66
When an uploaded PDF names a font it does **not embed** and the worker's image does not have it,
the page images are drawn with a substitute face and Arabic may have been re-shaped; the presenter
is **warned**, by font name, and told to export with fonts embedded (DEC-058 — until then the
same check ran on a converted PowerPoint's font list).
**Acceptance:**
- The inspection job (`JOB-convert_document`) detects the non-embedded fonts and records which.
- The warning names the missing font and appears on the material, not only in a job log.

#### REQ-MAT-012 — Uploads are scanned before they are served
**Serves:** §6 security · DEC-009
Every upload is validated server-side for declared type, actual sniffed type, and size before it
becomes retrievable.
**Acceptance:**
- An SVG renamed `.png` is rejected on its **content** (DEC-009).
- A file that fails validation is never given a retrievable URL.

---

## 9. Pre-session tasks — `TSK`

#### REQ-TSK-001 — Four kinds of task
**Serves:** D29
A session can list **مهام تحضيرية** of four kinds: read/download a **مادة**; fill a form or
questionnaire; confirm a checklist item (e.g. **«أحضر جهازك المحمول»**); an external task
(install software, watch a video).
**Acceptance:**
- Each kind renders with an affordance matching it — a link, a form, a checkbox, an external link.

#### REQ-TSK-002 — Tasks are reminder-only
**Serves:** D30
Completion is **not required for check-in** and **earns no points**, ever.
**Acceptance:**
- No check-in path consults task completion.
- No task action appears in the configurable scoring catalogue.

#### REQ-TSK-003 — Form responses are stored and visible to the presenter
**Serves:** A9
Responses to form-type tasks are stored and visible to the session's presenters and to admins.
**Acceptance:**
- Responses are not visible to other members.
- Responses are exportable by the presenter and by admins (`REQ-ADM-017`).

#### REQ-TSK-004 — A member tracks their own progress
**Serves:** D29 · D30
A member sees which tasks they have completed. Completion is self-declared for checklist and
external tasks.
**Acceptance:**
- Progress is visible on the event page and in the member's own upcoming-sessions view.

#### REQ-TSK-005 — Reminders carry outstanding tasks
**Serves:** A19 · D29
Pre-session reminders name the tasks the member has not yet completed.
**Acceptance:**
- A member with no outstanding tasks receives a reminder without an empty task section.

---

## 10. Event page — `EVT`

#### REQ-EVT-001 — What the event page carries
**Serves:** D31 · §6 event pages
The **ملصق**, the session details (`REQ-SES-013`), the presenter, the materials, the tasks, the
comments, the reactions, the photos, and — when the session is over — the ratings prompt.
**Acceptance:**
- Photos from the session and the poster carry the page visually; the layout does not collapse
  into a wall of text when they are absent.

#### REQ-EVT-002 — Threaded comments, one level of replies
**Serves:** D31
**تعليقات** with exactly one level of replies. No deeper nesting.
**Acceptance:**
- A reply to a reply attaches to the parent thread, not to a third level.
- Threads are keyboard navigable and screen-reader labelled in Arabic.

#### REQ-EVT-003 — Any member, at any time
**Serves:** D32
Any **عضو** of the مؤسسة may comment and react — before, during and after the session.
Commenting does **not** require a check-in or a reservation.
**Acceptance:**
- A member who never reserved a seat can comment on a published session.
- Comments are frozen on a cancelled session (`REQ-SES-010`).

#### REQ-EVT-004 — Reactions earn nothing
**Serves:** D31 · D42
**تفاعلات** exist and are worth zero points. Always.
**Acceptance:**
- Reactions do not appear in the configurable scoring catalogue.

#### REQ-EVT-005 — Edit and delete windows
**Serves:** D31 · OQ-007
Edit own comment for **15 minutes**. Delete own comment at any time — as a **soft delete** that
leaves **«حُذف هذا التعليق»** when the comment has replies, preserving thread structure.
Moderators and admins can remove at any time.
**Acceptance:**
- An edited comment is marked as edited.
- A deleted comment's replies remain readable.

#### REQ-EVT-006 — Mentions
**Serves:** D31
A member can mention another **عضو** of the same مؤسسة in a comment; the mentioned member is
notified.
**Acceptance:**
- Mention search returns only members of the same org (`REQ-TEN-003`).
- A mention in an edited comment notifies only newly added mentions.

#### REQ-EVT-007 — Reply notifications
**Serves:** D31
A member is notified when someone replies to their comment, subject to their preferences.
**Acceptance:**
- A member replying to themselves is not notified.

#### REQ-EVT-008 — Report and flag
**Serves:** D31 · OQ-008
Any member can report a comment or photo. Reports enter the moderation queue. **Reported items
stay visible pending review** — with the single exception in `REQ-EVT-012`.
**Acceptance:**
- The reporter's identity is visible to moderators and admins, never to the reported member.
- A resolved report records the outcome and the moderator who resolved it.

#### REQ-EVT-009 — Photo upload is gated by check-in
**Serves:** D33 · D24
Only **checked-in attendees**, the session's **presenters**, and **admins** can upload photos to
an event page.
**Acceptance:**
- A member with a confirmed RSVP and no check-in cannot upload — enforced by policy.
- The gate keys off the check-in event, nothing else (`REQ-CHK-009`).

#### REQ-EVT-010 — Photos publish immediately
**Serves:** D34
An uploaded photo appears at once. There is no pre-moderation queue.
**Acceptance:**
- The uploader sees their photo in the gallery without a refresh.

#### REQ-EVT-011 — EXIF and GPS are stripped before storage
**Serves:** DEC-005
Every uploaded image has its EXIF metadata — including GPS coordinates, device identifiers and
timestamps — **stripped server-side before the file is stored**.
**Acceptance:**
- The stored object contains no EXIF block; verified by a test asserting on the stored bytes.
- Stripping happens before the object is retrievable, not as a later cleanup job.

#### REQ-EVT-012 — One-click "remove photos of me"
**Serves:** DEC-005
Any member can request removal of a photo they appear in. The photo **hides instantly**, pending
review, without waiting for a moderator.
**Acceptance:**
- The hide takes effect before any human sees the request.
- The uploader is notified that the photo was hidden pending review, without being told who asked.
- A moderator can restore it if the request was mistaken; restoration is audited.

#### REQ-EVT-013 — An upload notice states where the photo goes
**Serves:** DEC-005
At upload time, the member is told plainly that photos are **shared with everyone in the
مؤسسة**.
**Acceptance:**
- The notice appears at the point of upload, not buried in a policy page.

#### REQ-EVT-014 — Admins can remove any comment or photo
**Serves:** D34 · D31
**Acceptance:**
- Removal is audited with actor and reason.
- Removal triggers the point reversal in `REQ-PTS-013`.

#### REQ-EVT-015 — Comments, reactions and counts are live
**Serves:** A18
New comments, reactions, RSVP counts and check-in counts appear without a manual refresh.
**Acceptance:**
- With realtime unavailable, the page still renders correct values server-side on load (DEC-020).

---

## 11. Ratings — `RAT`

#### REQ-RAT-001 — Only checked-in attendees rate
**Serves:** D35 · D24
The right to rate is granted by the **check-in event** and nothing else.
**Acceptance:**
- A member with a confirmed RSVP and no check-in cannot rate — enforced by policy.
- A presenter cannot rate their own session (`REQ-CHK-011`).

#### REQ-RAT-002 — Rating structure
**Serves:** A17
**تقييم الجلسة** 1–5 stars, **تقييم المُقدِّم** 1–5 stars, optional free text. One rating per
attendee per session.
**Acceptance:**
- With co-presenters, the presenter rating applies to the session's presenting as a whole, not
  per person — one rating, one form.
- Uniqueness is a database constraint.

#### REQ-RAT-003 — The rating window
**Serves:** A17 · OQ-006
Rating **opens** when the session reaches `completed` and **closes 14 days later**. Editing is
allowed within the same window.
**Acceptance:**
- The window is stated in the rating prompt.
- After it closes, the form is unavailable and existing ratings are immutable.

#### REQ-RAT-004 — Ratings are anonymous to the presenter
**Serves:** D36
The presenter sees **aggregates only** — never who rated, never which text belongs to whom.
**Acceptance:**
- No route, export or realtime payload reveals rater identity to a presenter.
- Free-text comments are shown to the presenter unattributed.

#### REQ-RAT-005 — Org admins see who rated what
**Serves:** D36
**مشرف المؤسسة** can see per-rater ratings, including free text.
**Acceptance:**
- This access is audited.
- A moderator does **not** have it (`REQ-ADM-020`).

#### REQ-RAT-006 — Aggregates are withheld below three ratings
**Serves:** OQ-009 · D36
The presenter sees no aggregate until **3 ratings** exist; below that, **«التقييمات تظهر بعد ٣
تقييمات»**. The rating form tells the rater this, so the anonymity promise made is the one kept.
**Acceptance:**
- With 1 or 2 ratings the presenter sees the count only, never a value.
- Org admin visibility is unaffected (D36).

#### REQ-RAT-007 — The rating prompt
**Serves:** A19
A prompt goes to every checked-in attendee **1 hour after completion** (org-configurable).
**Acceptance:**
- Members who have already rated are not prompted.
- The prompt links directly to the rating form for that session.

---

## 12. Scoring and the ledger — `PTS`

#### REQ-PTS-001 — Points live on an append-only ledger
**Serves:** D37
Every point movement is a row. Rows are **never updated and never deleted**. A correction is a new,
compensating row.
**Acceptance:**
- `UPDATE` and `DELETE` are revoked on the ledger table for every role including admins
  (`REQ-NFR-001`).
- Any member's balance equals the sum of their ledger rows, provably (`REQ-PTS-011`).

#### REQ-PTS-002 — What a ledger row records
**Serves:** D37
Member, amount, reason, **source event** (e.g. the check-in ID), actor, timestamp, the rule and
rule version that produced it, and an idempotency key.
**Acceptance:**
- Every row traces to a concrete source event or to a manual adjustment with a reason.
- No row exists without an idempotency key.

#### REQ-PTS-003 — A member sees their full history
**Serves:** D37 · §6 scoring
A member can read every one of their own ledger rows, with the reason in Arabic and a link to the
session or content that caused it.
**Acceptance:**
- Every point a member holds is explainable from this screen without asking anyone.
- A member cannot see another member's ledger (A33).

#### REQ-PTS-004 — The org admin configures every point value
**Serves:** D38 · D39
Point values, caps and cooldowns are configurable per action, per مؤسسة, **without a deploy**.
**Acceptance:**
- Changing a value takes effect for **future** awards only; historical rows are untouched.
- The active configuration is versioned, and every ledger row names the version that produced it.

#### REQ-PTS-005 — Configuration changes are audited
**Serves:** D38
Every change records who, when, old value and new value.
**Acceptance:**
- The history is readable in the admin console and is immutable.

#### REQ-PTS-006 — Caps
**Serves:** D42 · A10
Per-session caps on **تعليقات** (default 5) and **صور** (default 5); a per-attendee presenter
bonus capped (default 60).
**Acceptance:**
- The cap is applied at award time; the sixth comment earns 0 and says so.
- Caps are org-configurable.

#### REQ-PTS-007 — Cooldowns
**Serves:** D38
An action can carry a cooldown — a minimum interval between awards for the same member and action.
**Acceptance:**
- An award inside the cooldown is not written to the ledger and does not fail the user's action.

#### REQ-PTS-008 — Negative actions exist and are off by default
**Serves:** D40
The catalogue contains **تغيّب**, **إلغاء متأخر**, **حُذف تعليق** and **حُذفت صورة** at **0**
points. An org admin decides which cost points and how much.
**Acceptance:**
- With default configuration, no member ever loses points.
- Enabling a penalty applies to future events only.

#### REQ-PTS-009 — Manual adjustment requires a reason
**Serves:** D41
An **مشرف المؤسسة** can add or remove points manually. A **reason is mandatory**. The adjustment
appears in the ledger and in the audit log.
**Acceptance:**
- An adjustment with an empty reason is rejected.
- The member sees the adjustment and its reason in their own history.

#### REQ-PTS-010 — Anti-gaming rules are structural
**Serves:** D42
**الحجز** earns nothing. **التفاعلات** earn nothing. Viewing earns nothing. Attendee points
require a verified check-in. Comments and photos are capped per session. The per-attendee
presenter bonus is capped.
**Acceptance:**
- Each of these is enforced in the engine, not merely absent from the default configuration —
  an org admin cannot configure RSVP or reactions to be worth points.

#### REQ-PTS-011 — Any balance is recomputable from the ledger
**Serves:** D37 · §8 quality bar
Balances are a **rollup** maintained from the ledger. A full recompute from ledger rows alone must
reproduce every balance exactly.
**Acceptance:**
- A nightly job compares every rollup against a `sum()` oracle and alerts on any divergence.
- A deliberate recompute is distinguishable from an accidental double-award by the idempotency
  key's epoch suffix (DEC-016).

#### REQ-PTS-012 — Awards are idempotent
**Serves:** DEC-016
An award is keyed deterministically by rule plus source event. Re-running the awarding path
produces no second row.
**Acceptance:**
- Replaying a job produces zero additional ledger rows.
- `on conflict do nothing` is the only conflict action used on the ledger.

#### REQ-PTS-013 — Removing content reverses its award
**Serves:** OQ-014 · D40
When a comment or photo is removed, the original award is reversed by a **compensating ledger
row** with reason **«حُذف المحتوى»**. Any *penalty* is a separate catalogue action, off by
default.
**Acceptance:**
- The reversal is a new row; no row is edited or deleted.
- An org with no penalties enabled still sees the reversal, and only the reversal.

#### REQ-PTS-014 — Scoring is reconfigurable without a deploy
**Serves:** §8 quality bar · D38
**Acceptance:**
- An org admin can change any value, cap, cooldown or enablement through the console alone.

---

## 13. Leaderboards — `LDR`

#### REQ-LDR-001 — All-time leaderboard
**Serves:** D43
Ranked by total points within the مؤسسة.
**Acceptance:**
- A member's own rank is always visible to them, even when outside the displayed range.

#### REQ-LDR-002 — Monthly and seasonal leaderboards
**Serves:** D43 · §6 scoring
A monthly board, and a seasonal board over an admin-defined period, so newcomers can win
somewhere.
**Acceptance:**
- Period boundaries use the org's time zone (A20).
- A closed period's standings never change afterwards (`REQ-LDR-006`).

#### REQ-LDR-003 — Per-topic leaderboards
**Serves:** D43
A board per **تصنيف**.
**Acceptance:**
- Points are attributed to a topic by the category of the session that generated them.
- Points with no session context (manual adjustments, some badges) are excluded from topic boards
  rather than assigned arbitrarily.

#### REQ-LDR-004 — The company leaderboard shows both metrics
**Serves:** D44 · A11
**سباق الشركات** shows, per **شركة**, both **إجمالي النقاط** and **النقاط لكل عضو نشِط**.
**Acceptance:**
- Both numbers are visible at once; the ranking metric is marked.

#### REQ-LDR-005 — The admin chooses the ranking metric
**Serves:** A11
Default: **النقاط لكل عضو نشِط**, so a large شركة cannot win on headcount.
**Acceptance:**
- Changing the metric re-ranks the current period only; closed snapshots keep their metric.

#### REQ-LDR-006 — Snapshots freeze standings
**Serves:** A11 · DEC-016
Monthly, seasonal and company standings are **snapshotted** and frozen, including the
**active-member denominator**.
**Acceptance:**
- Deactivating a member does not change any published standing.
- Certificates for leaderboard winners are issued from the frozen snapshot (`REQ-CRT-012`).

#### REQ-LDR-007 — Leaderboards are org-scoped
**Serves:** D45 · D3
**Acceptance:**
- No board ever shows a member, شركة or session from another مؤسسة.

#### REQ-LDR-008 — Opting out
**Serves:** §6 scoring · D69
A member can hide themselves from public leaderboards. Their points still accrue and still count
toward their شركة's total.
**Acceptance:**
- An opted-out member still sees their own rank privately.
- Company aggregates are unchanged by an opt-out, so the perverse incentive to opt out to protect
  a company average does not exist.

---

## 14. Recognition — `REC`

#### REQ-REC-001 — Badges are configurable
**Serves:** D47
An org admin can create, edit, retire and award **شارات**, each with an Arabic name, a
description, an award rule, and a flag for whether it carries a certificate (OQ-020).
**Acceptance:**
- Retiring a badge does not revoke it from members who hold it.
- Manually awarding a badge requires a reason and is audited.

#### REQ-REC-002 — A default badge set ships
**Serves:** OQ-011 · D47
Eight badges ship enabled and org-editable: **أول حضور**, **أول جلسة**, **صوت مسموع**,
**حاضر دائم**, **سلسلة الشهر**, **رأي يُعتد به**, **مُقدِّم مُقيَّم**, **كريم المعرفة السنوي**.
**Acceptance:**
- A new مؤسسة has a working recognition system on day one without any configuration.

#### REQ-REC-003 — Levels are configurable
**Serves:** D47
**مستويات** with Arabic titles and point thresholds, org-editable.
**Acceptance:**
- Changing a threshold recomputes levels and never *removes* a level a member already reached
  without an explicit admin action.

#### REQ-REC-004 — Default levels ship, tied to real privileges
**Serves:** OQ-010 · D48 · §6 scoring
Five levels: **مشارِك** (0) · **مشارِك نشِط** (100) · **صاحب أثر** (300) · **كريم معرفة** (700) ·
**سفير المعرفة** (1500). Early levels are easy, later ones progressively harder. **صاحب أثر**
turns on priority RSVP; **كريم معرفة** turns on hosting.
**Acceptance:**
- Every level above the first grants something real, not only a title.

#### REQ-REC-005 — Streaks
**Serves:** D47
**سلسلة** rules are org-configurable; the default is three check-ins in a calendar month for a
15-point bonus (A10).
**Acceptance:**
- Streak evaluation is idempotent — the bonus is awarded once per qualifying period.
- Month boundaries use the org's time zone.

#### REQ-REC-006 — Perks attach to levels or badges
**Serves:** D48
A **ميزة** is granted by reaching a **مستوى** or holding a **شارة**. Configurable.
**Acceptance:**
- Losing the qualifying badge or level removes the perk from the next evaluation forward.

#### REQ-REC-007 — Priority RSVP perk
**Serves:** D48 · OQ-012
See `REQ-RSV-009` for its mechanics.

#### REQ-REC-008 — Hosting perk
**Serves:** D48 · D9
An org can gate the ability to propose or host a session behind a **مستوى** or **شارة**.
**Acceptance:**
- **Off by default** — every member can propose unless an org turns the gate on.
- A member who cannot host sees why, and what would qualify them.

#### REQ-REC-009 — Recognition is announced
**Serves:** D47 · D56
Earning a **شارة**, reaching a **مستوى** or completing a **سلسلة** notifies the member.
**Acceptance:**
- Announcements are subject to member notification preferences (`REQ-NTF-003`).

---

## 15. Certificates — `CRT`

#### REQ-CRT-001 — Who receives a certificate
**Serves:** D49
Checked-in **حاضرون**, **مقدِّمون** (including co-presenters), and achievement holders — badge
earners and leaderboard winners.
**Acceptance:**
- Attendee certificates key off the check-in event and nothing else (`REQ-CHK-009`).
- Every accepted co-presenter receives a presenter certificate (A5).

#### REQ-CRT-002 — Issuance mode is a per-session setting
**Serves:** D50
Chosen when the admin designs the session: **معطّل** (off) · **تلقائي عند اكتمال الجلسة** ·
**مراجعة وإصدار يدوي**.
**Acceptance:**
- The mode is set at scheduling time and is changeable until the session completes.
- The mode is visible on the event page so attendees know what to expect.

#### REQ-CRT-003 — Automatic issuance
**Serves:** D50
In automatic mode, certificates are generated and delivered when the session reaches `completed`.
**Acceptance:**
- Issuance is idempotent — re-running produces no duplicates.
- A member checked in manually (A8) receives a certificate identically.

#### REQ-CRT-004 — Review and release
**Serves:** D50
In review mode, certificates are generated and held. An admin reviews and releases them,
individually or in bulk.
**Acceptance:**
- Held certificates are not visible to recipients and are not emailed.
- Release is audited.

#### REQ-CRT-005 — PDF output
**Serves:** D51 · A29
A certificate is delivered as a PDF — A4 landscape or portrait, 300 dpi, fonts embedded — plus a
1600 px PNG preview for in-app display and email.
**Acceptance:**
- Fonts are embedded, not referenced; the PDF renders correctly on a machine with no fonts
  installed.
- Arabic in the PDF matches the editor exactly (`REQ-DSG-014`).

#### REQ-CRT-006 — Email delivery
**Serves:** D51
Certificates are emailed to their recipients.
**Acceptance:**
- The email carries the PNG preview inline and a link; the PDF is attached or linked per the org's
  configuration.
- A failed send is retried and surfaced in the admin console.

#### REQ-CRT-007 — Public verification page
**Serves:** D51 · A13
A public, unauthenticated, rate-limited page shows: **اسم المستفيد**, certificate type, session
title and date (or achievement name), **اسم المؤسسة**, issue date, and a prominent **صالحة /
ملغاة** status. **Nothing else.**
**Acceptance:**
- The page is one of only three unauthenticated routes (`REQ-NFR-004`).
- An unknown or malformed code returns a neutral "not found" that does not distinguish *never
  existed* from *revoked*.
- The page resolves by **certificate identity, not artifact identity**, so a regenerated PDF still
  verifies and old printed copies never break.
- It is mobile-first and RTL — the realistic scan is a phone held over a printed sheet.

#### REQ-CRT-008 — Every certificate carries a gapless per-org serial
**Serves:** DEC-010
**الرقم التسلسلي** in the form `KM-2026-000123` — org prefix, year, zero-padded sequence, unique
per مؤسسة. Allocated from a **counter row locked inside the issuing transaction**, not from a
Postgres `SEQUENCE`.
**Acceptance:**
- The sequence has **no gaps**: a rolled-back issuance consumes no number.
- Serials are unique per org; two orgs may both hold `…-000123`.
- The serial is printed on the certificate and appears in the member's list and in CSV exports.

#### REQ-CRT-009 — The verification code is separate, random and unguessable
**Serves:** DEC-010 · A13
**رمز التحقق** is 22+ random characters. It is the **QR target** and the **only** accepted lookup
key at `/verify`.
**Acceptance:**
- `/verify` rejects a serial. Only the verification code resolves.
- Codes are generated from a cryptographically secure source and are unique platform-wide.
- Enumerating `/verify` cannot return a valid certificate within the rate limit.

#### REQ-CRT-010 — The QR is a designer layer
**Serves:** D68 · D51
The verification QR and the certificate ID are **layers in the designer document**, not a
post-processing stamp.
**Acceptance:**
- The QR encodes an **absolute URL** — phone cameras need a URL, not raw text.
- QR minimum 25 mm with a 4-module quiet zone; the **serial** and the **verification code** are
  both printed as text beside it (A29).
- The QR is emitted as **inline SVG by our own runtime**, so it stays vector at any print size.

#### REQ-CRT-011 — Revocation
**Serves:** A13 · OQ-015
An **مشرف المؤسسة** revokes a certificate with a **mandatory reason**, audited. The verification
page then shows **«شهادة ملغاة»** and **not** the reason. The PDF is not deleted.
**Acceptance:**
- Revocation takes effect on the verification page immediately.
- The reason is never exposed on the unauthenticated page.

#### REQ-CRT-012 — Achievement certificates
**Serves:** D49 · OQ-020
Badge certificates are **opt-in per badge** (off by default). Leaderboard certificates go to the
**top 3 monthly** and **top 3 annual**, issued **from the frozen snapshot** and **released by an
admin**.
**Acceptance:**
- A later leaderboard change cannot reissue a different winner for a closed period
  (`REQ-LDR-006`).

#### REQ-CRT-013 — A member's certificate list
**Serves:** D51
A member sees every certificate they hold, with its **الرقم التسلسلي**, issue date, status, and a
download.
**Acceptance:**
- A revoked certificate is shown as revoked in the member's own list, with its reason (unlike the
  public page).

#### REQ-CRT-014 — Reissuing is byte-reproducible
**Serves:** DEC-007 · A39 · D67
Regenerating a certificate years later produces the same document: the template version and the
**font hashes** are pinned at issue time.
**Acceptance:**
- A certificate issued against template v3 still renders as v3 after v4 is published (D67).
- A font that has since been removed from the picker still resolves for reissue.

---

## 16. Designer, posters and templates — `DSG`

#### REQ-DSG-001 — Every published session has a poster
**Serves:** D53
No session reaches `published` without a **ملصق**.
**Acceptance:**
- Publishing is blocked if no poster exists in any of the three paths.

#### REQ-DSG-002 — Three paths to a poster
**Serves:** D53 · DEC-012
**تلقائي** (auto-generated — the default) · **تخصيص** (opened in the designer and adjusted) ·
**رفع ملصق جاهز** (a finished poster uploaded).
**Acceptance:**
- The automatic path produces every A12 variant with **no design work at all**.
- All three paths converge on the same stored artifact set, so downstream consumers do not branch.

#### REQ-DSG-003 — Auto-generated posters stay live; customised ones detach
**Serves:** DEC-012
An auto-generated **ملصق** is a pure function of template plus session data, so a change to
title, date, venue or presenter **regenerates it**. The moment an admin customises it, it becomes
**detached**, and a later data change raises **«تغيّرت تفاصيل الجلسة — راجع الملصق»** instead of
overwriting their edits.
**Acceptance:**
- Editing a live poster flips it to detached, visibly and with an explanation.
- A detached poster is never regenerated automatically, ever.

#### REQ-DSG-004 — One engine, two template libraries
**Serves:** D54
The **ملصق** designer and the **شهادة** builder are **one engine** over one document model, with
separate template libraries.
**Acceptance:**
- A change to the layer model applies to both without a branch in the code.
- Posters and certificates render through the same export pipeline.

#### REQ-DSG-005 — Documents are JSON layer trees
**Serves:** A28
Layers: **نص**, **صورة**, **شكل**, **QR**, and **حقل ديناميكي** — each with position, size,
rotation, opacity, z-order and locking.
**Acceptance:**
- A document is fully described by its JSON; nothing about its appearance lives outside it.
- The schema is versioned, and an older document version still renders.

#### REQ-DSG-006 — Dynamic fields bind to real data
**Serves:** D54 · A31
Session title, presenter name, date and time, venue, org logo, recipient name, certificate ID and
QR bind from the session or the recipient.
**Acceptance:**
- The editor previews with **real** session or recipient data, not lorem ipsum.
- An unbound field renders as a clearly marked placeholder, never as an empty box.

#### REQ-DSG-007 — Templates are versioned; published artifacts never change
**Serves:** D67
Publishing a new template version **never alters** posters or certificates already generated.
**Acceptance:**
- An artifact records the template version that produced it.
- Reissuing uses the recorded version, not the latest (`REQ-CRT-014`).

#### REQ-DSG-008 — Two library levels
**Serves:** D67 · D59
A **platform-wide** library managed by **مدير المنصة**, and **per-org** libraries that org admins
build by duplicating a platform template or starting blank.
**Acceptance:**
- Duplicating a platform template into an org copies it; later platform changes do not reach
  the copy.
- An org cannot edit a platform template in place.

#### REQ-DSG-009 — Size presets and derived variants
**Serves:** A12 · D55
Poster master **1080×1350**. Derived: square **1080×1080**, story **1080×1920**, landscape
**1920×1080**, open-graph **1200×630**, print A4 **2480×3508** and A3 **3508×4961**.
Certificates: A4 landscape **3508×2480** and A4 portrait, 300 dpi.
**Acceptance:**
- **Every** listed variant is derivable from the single master with no manual step.
- Each preset has a defined safe area; text and logos are auto-constrained to it.

#### REQ-DSG-010 — Safe areas and bleed are visible while editing
**Serves:** A31 · A29
Safe-area and bleed overlays per preset, with live preview of every variant while editing.
**Acceptance:**
- Content crossing a safe area is flagged before export, not after.

#### REQ-DSG-011 — Export formats
**Serves:** A29
Screen: **PNG sRGB** at the exact preset size plus a **WebP** copy; JPEG only if an org enables
it. Print: **PDF 300 dpi, RGB**, 3 mm bleed, 5 mm safe margin, fonts embedded, images at native
resolution. Certificates: **PDF** plus a **1600 px PNG** preview.
**Acceptance:**
- The RGB-not-CMYK limitation is surfaced in the UI as a print-shop caveat, not buried.
- Every format in A29 has a specified pipeline in `06-visual-designer.md`.

#### REQ-DSG-012 — Exports run as jobs with visible status
**Serves:** A29 · A31
**Acceptance:**
- The admin sees queued / rendering / done / failed per variant.
- A failed export states what failed and offers a retry.

#### REQ-DSG-013 — Exports are cached until the source changes
**Serves:** A29
Every export is stored and reused until the source document or template version changes.
**Acceptance:**
- Re-opening a session does not re-render anything.
- A template version bump invalidates only the artifacts bound to it.

#### REQ-DSG-014 — Shaping parity is a hard requirement
**Serves:** D66
Arabic in **every** export — poster PNG, poster PDF, certificate PDF, slide page images — renders
exactly as in the editor: cursive joining, ligatures, stacked diacritics, mixed
Arabic/Latin/digits. **An export pipeline that cannot guarantee this is disqualified.**
**Acceptance (three tiers, per DEC-017):**
- **Tier A** — text identity (same glyph sequence, same line breaks, same fitted size) verified on
  **every production export**.
- **Tier B** — pixel parity in CI, both paths inside the worker image.
- **Tier C** — cross-browser comparison, nightly, advisory.
- The preview an admin approves **is the worker-rendered artifact itself**.

#### REQ-DSG-015 — A shaping parity test suite exists for every export path
**Serves:** D66 · §6
The suite covers: the lam-alef ligature; stacked tashkeel on one base; a mixed
Arabic/English/number sentence; mirrored punctuation and brackets; a long word forcing a line
break; a line mixing Western and Arabic-Indic numerals; and a template at its auto-fit limit.
**Acceptance:**
- The suite runs against **each** export path, not once globally.
- Goldens are **never auto-refreshed** — a changed golden is a reviewed change.

#### REQ-DSG-016 — One font set, everywhere
**Serves:** D66 · A28
The **same font files at the same versions** are installed in the editor (web fonts), the worker's
Chromium, and the worker's LibreOffice. A font manifest is the single source of truth.
**Acceptance:**
- A font present in one and absent in another fails CI, not production.
- The manifest is the only way a font enters any of the three.

#### REQ-DSG-017 — Certificate fonts are chosen from Google Fonts and materialised
**Serves:** DEC-007 · A39
The picker is backed by the **Google Fonts developer API**, filtered to `subset=arabic`. Choosing
a font **downloads the binary once**, stores it with a **SHA-256**, registers it in the manifest,
and gates it behind the parity goldens before it becomes selectable. Templates pin the **font
hash**.
**Acceptance:**
- A font with no Arabic subset cannot be selected.
- The editor loads the **stored** binary, never Google's CDN.
- A font failing the goldens is not selectable, and the admin is told why.

#### REQ-DSG-018 — Image layers accept PNG, JPG and WebP; SVG is rejected
**Serves:** DEC-009
In both builders. Validation is by **content sniffing, not extension**.
**Acceptance:**
- An SVG renamed `.png` is rejected on its content.
- No uploaded file is ever rendered as markup inside the export renderer.

#### REQ-DSG-019 — Print resolution is guarded
**Serves:** DEC-009 · A29
An image layer **warns below 300 PPI** at its print frame and **blocks below 200 PPI**.
**Acceptance:**
- The org logo must be supplied at a resolution that clears A3; the brand kit states the minimum.
- The warning names the offending layer and the preset it fails.

#### REQ-DSG-020 — Uploaded posters
**Serves:** A32
Minimum **1080 px on the short side**, validated server-side. Missing variants are generated by
**smart-cropping** around the master with safe margins; the admin can adjust the crop per variant
before publishing.
**Acceptance:**
- Every A12 variant exists after an upload, without further work.
- The admin can override any automatic crop.

#### REQ-DSG-021 — The brand kit is the single source of brand truth
**Serves:** DEC-008 · A40 · A25
**هوية المؤسسة** — logo, colours, fonts — feeds the CSS theme layers, the designer's templates,
and the email templates. Changing a colour or a face is **one edit in one place**.
**Acceptance:**
- Replacing the org logo updates every template at once.
- No brand colour is hard-coded in a template, an email or a component.

#### REQ-DSG-022 — Designer feature set
**Serves:** A31
Layers with alignment guides and snapping; brand kit injection; safe-area and bleed overlays;
undo/redo; autosave; admin-locked regions; live preview of every variant; dynamic-field preview
with real data; image upload with **focal-point cropping**; QR layer; export queue with status.
**Acceptance:**
- Autosave never loses more than the last few seconds of work.
- Focal point drives automatic variant cropping, so crops centre on the subject, not the geometry.

#### REQ-DSG-023 — Poster QR
**Serves:** D68
Every **ملصق** carries a QR linking to the session's event page, as a designer layer.
**Acceptance:**
- Scanning while signed out lands on that session after sign-in (`REQ-AUT-005`).
- Scanning from a non-member domain gets the explanation in `REQ-AUT-006`, not a dead end.

#### REQ-DSG-024 — Locked regions
**Serves:** A27 · A31
Templates can lock regions — org logo, signature block, certificate ID, QR — so an editor cannot
move or delete what verification depends on.
**Acceptance:**
- A locked region cannot be moved, resized, hidden or deleted in the org-level editor.
- Unlocking is a platform-template-level act, not an in-editor one.

#### REQ-DSG-025 — Text boxes auto-fit
**Serves:** A30
Template text boxes auto-fit, because Arabic runs roughly **1.2× the length of English**.
**Acceptance:**
- A title at the auto-fit limit is in the parity suite (`REQ-DSG-015`).
- Auto-fit never reduces text below the template's stated minimum size; it wraps or truncates with
  an explicit warning instead.

#### REQ-DSG-026 — The template baseline ships with the platform
**Serves:** A27
Poster families — **جلسة** (talk), **ورشة** (workshop, with a tasks strip), **حوار** (panel,
multi-presenter), **لقاء** (meetup), **إعلان** (announcement) — each light and dark, RTL-first
with a mirrored LTR variant reserved for English. Certificate families — **حضور**, **تقديم**,
**إنجاز** — landscape and portrait, formal Naskh, with locked regions.
**Acceptance:**
- Every template declares its dynamic fields and its safe area per preset.
- Templates honour the brand's forbidden imagery: **no books, caps, lightbulbs, education
  iconography, cartoon illustration, icon libraries, emoji or photography**. The visual language
  is the **Knowledge Network** — dots, thin lines, light.

---

## 17. Notifications — `NTF`

#### REQ-NTF-001 — Two channels, and only two
**Serves:** D56
**داخل التطبيق** and **البريد الإلكتروني**. No SMS, no WhatsApp, no push.
**Acceptance:**
- No code path, dependency or configuration field exists for a third channel.

#### REQ-NTF-002 — The notification matrix is complete and owned
**Serves:** D56
Every trigger maps to a channel, a recipient set and a template. The matrix lives in
`08-notifications-calendar.md` and is normative.
**Acceptance:**
- No notification is sent that is not in the matrix.
- Every matrix row has an Arabic template.

#### REQ-NTF-003 — Members control their own notifications
**Serves:** A19
Each member sets their preferences per category and per channel.
**Acceptance:**
- A disabled category is not delivered on that channel, including to the in-app inbox if the
  member disabled it there.
- Certain notifications are **not** optional and are marked as such: certificate issued, seat
  promoted, session cancelled, session time or venue changed.

#### REQ-NTF-004 — Reminder schedule
**Serves:** A19
Defaults: **7 days**, **1 day** and **2 hours** before; rating prompt **1 hour** after completion.
Org-configurable.
**Acceptance:**
- Changing the schedule reschedules pending reminders rather than duplicating them.
- Reminders go to confirmed attendees **and** to non-responders, distinctly (§6).

#### REQ-NTF-005 — Session changes notify
**Serves:** §6 · D57
See `REQ-SES-009`.

#### REQ-NTF-006 — In-app inbox
**Serves:** D56
A member reads their notifications in the app, with read/unread state.
**Acceptance:**
- Unread count is accurate across devices.

#### REQ-NTF-007 — Email templates are admin-editable
**Serves:** D60
An org admin can edit the org's email templates, within the brand kit (`REQ-DSG-021`).
**Acceptance:**
- A template missing a required dynamic field fails validation before it can be saved.
- Templates are Arabic-first and RTL, and follow A30's typography rules.

#### REQ-NTF-008 — Delivery is logged
**Serves:** D56 · §6 security
Every send records its outcome.
**Acceptance:**
- A bounce or failure is visible to the org admin, with the reason.
- Logs are retained per OQ-019 (180 days).

---

## 18. Calendar — `CAL`

#### REQ-CAL-001 — ICS download
**Serves:** D57
Every session offers a downloadable **ICS**.
**Acceptance:**
- The ICS carries title, description, start, end, venue address, the org time zone (A20), and a
  link back to the event page.
- Arabic text in the ICS is correctly encoded and displays in Apple Calendar, Outlook and Google.

#### REQ-CAL-002 — Add-to-calendar links
**Serves:** D57
Google, Outlook and Apple links alongside the ICS.
**Acceptance:**
- Each link opens the correct provider pre-filled.

#### REQ-CAL-003 — Google Calendar connection
**Serves:** D57
A member can connect their Google Calendar for **real sync**, and disconnect at any time.
**Acceptance:**
- The OAuth scope requested is the narrowest that permits event write.
- Tokens are never displayed to anyone — including the member and org admins (A33).

#### REQ-CAL-004 — Events are created on confirmation
**Serves:** D57
A confirmed حجز creates the event in a connected calendar. A **promotion** from the waitlist
creates it too (`REQ-RSV-004`).
**Acceptance:**
- Creation is idempotent — one calendar event per member per session.

#### REQ-CAL-005 — Changes propagate to synced calendars
**Serves:** D57
A change to time or venue updates every synced event.
**Acceptance:**
- The update reaches the calendar without the member re-adding anything.
- A failed sync is retried and surfaced to the member, not silently dropped.

#### REQ-CAL-006 — Cancellations remove the event
**Serves:** D57
Cancelling a session, or a member cancelling their حجز, removes the synced event.
**Acceptance:**
- Removal is idempotent and tolerates an event the member already deleted by hand.

#### REQ-CAL-007 — Disconnecting deletes the tokens
**Serves:** D57 · §6 privacy
**Acceptance:**
- Tokens are deleted immediately on disconnect, not on a retention schedule (OQ-019).
- Existing calendar events are left alone; the member is told they will no longer update.

#### REQ-CAL-008 — Calendar failures never block the app
**Serves:** D57
Sync runs as a background job. A calendar outage never prevents reserving a seat, checking in, or
anything else.
**Acceptance:**
- A sync failure is retried with backoff and reported; the RSVP stands regardless.

---

## 19. Discovery and search — `DSC`

#### REQ-DSC-001 — Categories
**Serves:** A15 · D60
Admin-defined **تصنيفات** per مؤسسة. The pre-launch set — **فني**, **إداري**, **إبداعي**,
**درس من تجربة** — ships as the default for the first org.
**Acceptance:**
- Renaming a تصنيف does not break existing sessions or per-topic leaderboards.

#### REQ-DSC-002 — Tags
**Serves:** A15
Free-form **وسوم** on sessions.
**Acceptance:**
- Tags are normalised (trimmed, case-folded, Arabic-normalised per `REQ-DSC-004`) so
  near-duplicates merge.

#### REQ-DSC-003 — Org-wide search
**Serves:** A15
Search across sessions and materials by title, abstract, tags, presenter and company.
**Acceptance:**
- Results never include another مؤسسة (`REQ-TEN-003`).
- Search respects material availability (`REQ-MAT-006`) and profile tiers (`REQ-PRF-004`).

#### REQ-DSC-004 — Arabic-aware normalization
**Serves:** A15
Search strips tashkeel and folds alef forms (أ إ آ → ا), yaa/alef-maqsura (ى → ي) and
taa-marbuta (ة → ه).
**Acceptance:**
- **«مُعرِّفات»** and **«معرفات»** match each other.
- **«إدارة»** and **«ادارة»** match each other.
- Postgres has **no Arabic FTS dictionary**, so this is our own normalization feeding `simple`,
  with `unaccent` and `pg_trgm` (A15 caveat). It is a stated implementation constraint, not a
  library choice.

#### REQ-DSC-005 — Filters
**Serves:** A15 · OQ-017
Category, date, venue, level, presenter, company, and **لغة الجلسة**.
**Acceptance:**
- Filters combine, and the active set is visible and clearable.

#### REQ-DSC-006 — Bookmarks
**Serves:** A15
Personal **المحفوظات**. They earn **no points**.
**Acceptance:**
- Bookmarks are private to the member.
- Bookmarking is absent from the scoring catalogue.

#### REQ-DSC-007 — Material search is metadata-only
**Serves:** A15 caveat
Search covers material **metadata**, not text extracted from inside documents.
**Acceptance:**
- No indexing job extracts text from PDFs. Arabic PDF extraction commonly returns visual rather
  than logical order, which would produce reversed, unsearchable words.

---

## 20. Admin consoles — `ADM`

#### REQ-ADM-001 — Super admin console
**Serves:** D59
**مدير المنصة** creates and suspends orgs, sets the first org admin, manages allowed domains,
views platform metrics, and manages the platform-wide template libraries.
**Acceptance:**
- Every action is audited.
- The console is reachable only by a super admin, enforced by policy.

#### REQ-ADM-002 — Super admins have no data-plane access
**Serves:** D3 · DEC-014
A super admin cannot read an org's sessions, members, materials, ledger or leaderboards. Reaching
into an org requires **time-bounded impersonation**, logged in **that org's own audit log** where
its admins can see it.
**Acceptance:**
- No RLS policy contains a super-admin disjunct.
- An impersonation session expires on its own and cannot be silently extended.
- The org's admins can see that it happened, who did it and when.

#### REQ-ADM-003 — Platform metrics
**Serves:** D59
Org count, member counts, session counts, job health, error rates — **aggregate only**.
**Acceptance:**
- No metric exposes an individual member, session title or piece of content.

#### REQ-ADM-004 — Org admin dashboard
**Serves:** D60
Proposal pipeline; RSVPs vs check-ins; attendance rate; active members; top presenters, topics and
companies; points issued.
**Acceptance:**
- Every figure is clickable through to the underlying list.
- The dashboard loads within the budget in `REQ-NFR-008`.

#### REQ-ADM-005 — Org admin manages sessions
**Serves:** D60 · D14
Review proposals, schedule, publish, edit, cancel, complete, archive.

#### REQ-ADM-006 — Venues · REQ-ADM-007 — Categories and tags · REQ-ADM-008 — Company list
**Serves:** D60 · D17 · D12 · A15
Each is a managed list with create, edit, deactivate. **Deactivate, not delete**, wherever the
entity is referenced by history.
**Acceptance:**
- Deleting an entity that history references is impossible; deactivation is offered instead.

#### REQ-ADM-009 — Members and roles
**Serves:** D60 · D8
Assign **مشرف المؤسسة** / **مُنظِّم** / **عضو**; deactivate; view a member's full record.
**Acceptance:**
- An org admin cannot remove the last remaining org admin.
- Every role change is audited (`REQ-TEN-005`).

#### REQ-ADM-010 — Moderation queues
**Serves:** D60 · D31
Queues for proposals, comments, photos and reports.
**Acceptance:**
- Each queue shows age, reporter (where applicable) and the content in context.
- Resolving records the outcome and the actor.

#### REQ-ADM-011 — Scoring configuration
**Serves:** D38 · D60
See `REQ-PTS-004` through `REQ-PTS-008`.

#### REQ-ADM-012 — Recognition configuration
**Serves:** D47 · D48 · D60
Badges, levels, streaks and perks.

#### REQ-ADM-013 — Template management
**Serves:** D60 · D67
Poster and certificate templates for the org, built by duplicating platform templates or from
blank.

#### REQ-ADM-014 — Email templates · REQ-ADM-015 — Branding · REQ-ADM-016 — Reminder schedule
**Serves:** D60 · A19 · A25 · DEC-008
Email templates per `REQ-NTF-007`; branding per `REQ-DSG-021`; reminder schedule per
`REQ-NTF-004`.

#### REQ-ADM-017 — CSV exports
**Serves:** D60
Sessions, RSVPs, attendance (with the manual-mark flag), ratings, points, certificates (with
serials), members.
**Acceptance:**
- Exports are UTF-8 with a BOM so Excel opens Arabic correctly without a manual import step.
- Every export is audited — an export is a bulk read of personal data.
- Column headers are Arabic; the numeral system follows the org setting (A30).

#### REQ-ADM-018 — Audit log
**Serves:** D60 · §6 security
An **immutable** log of admin and moderator actions, scoring configuration changes, manual
attendance marks, point adjustments, role changes, impersonation, and content removals.
**Acceptance:**
- The log is append-only; no role can update or delete a row (`REQ-NFR-006`).
- Entries are searchable by actor, subject, action and date range.
- Retained 7 years (OQ-019).

#### REQ-ADM-019 — Break-glass impersonation is visible to the org
**Serves:** DEC-014 · D3
See `REQ-ADM-002`.

#### REQ-ADM-020 — The moderator scope is enforced, not merely hidden
**Serves:** A1
A **مُنظِّم** reaches moderation queues, event-day operations and content removal — and nothing
else.
**Acceptance:**
- A moderator calling a settings, scoring, member-management or scheduling endpoint directly is
  rejected by policy.
- A moderator cannot see per-rater ratings (`REQ-RAT-005`).

---

## 21. Internationalization, RTL and typography — `INT`

#### REQ-INT-001 — Arabic is the launch language, with full RTL
**Serves:** D5
The interface is Arabic and right-to-left. **Nothing in the layout assumes LTR.**
**Acceptance:**
- No component breaks when the document direction is RTL, because RTL is the **default**, not a
  variant.
- Directional icons mirror; carousels, steppers and progress indicators run in the reading
  direction.

#### REQ-INT-002 — Every user-facing string is externalised
**Serves:** D5
No string is hard-coded in a component, an email or an export.
**Acceptance:**
- A lint rule or test fails on a literal user-facing string in a component.
- Message keys are stable; changing copy does not change a key.

#### REQ-INT-003 — Dates and numbers are locale-aware
**Serves:** D5 · A20
Gregorian dates with **Arabic locale formatting** — the Levantine/Gulf month set (يناير, فبراير),
**not** the Maghrebi (جانفي, فيفري) — pinned explicitly because `Intl` output varies by region
subtag. Org default time zone `Asia/Riyadh`; **all timestamps stored in UTC**.
**Acceptance:**
- A date renders identically on a phone set to `ar-EG`, `ar-SA` and `ar-MA`.
- No timestamp is stored without a time zone.

#### REQ-INT-004 — Logical properties only
**Serves:** D5 · §6
CSS uses logical properties throughout. No `left`, `right`, `margin-left`, `padding-right`,
`text-align: left` in layout code.
**Acceptance:**
- A lint rule fails on physical directional properties.
- Tailwind's `rtl:` / `ltr:` variants add **zero specificity** (`:where()`), so they are never
  paired with a physical utility for the same property.

#### REQ-INT-005 — The typography system is a token set
**Serves:** A30
Arabic UI face **IBM Plex Sans Arabic** (already shipped), a Kufi display face for headings and
posters, a Naskh face for certificates. Rules, enforced as tokens rather than as guidance:
letter-spacing **0** on Arabic; body line-height **1.7**, headings **1.4**; base **17 px** on
mobile; **never** `overflow: hidden` on a text line (it clips stacked diacritics); **no justified
text anywhere**; kashida off by default; a **1.2× length allowance** for Arabic.
**Acceptance:**
- A component setting letter-spacing on Arabic text fails review.
- A text line clipping a diacritic is a defect, not a rendering quirk.

#### REQ-INT-006 — The numeral system is an org setting
**Serves:** A30
Western or Arabic-Indic, **default Western**, applied consistently across the UI, notifications,
templates and exports.
**Acceptance:**
- Changing the setting changes **every** surface, including PDFs and CSV exports.
- A single screen never mixes the two systems.

#### REQ-INT-007 — Mixed strings are bidi-isolated
**Serves:** A30
Mixed Arabic/Latin/digit strings are bidi-isolated so neighbouring punctuation does not jump.
**Acceptance:**
- A session titled **«جلسة عن Next.js 16»** renders with the version number in the right place,
  in the UI, in email, and in every export.
- Mirrored punctuation and brackets are in the parity suite (`REQ-DSG-015`).

#### REQ-INT-008 — English is added without a rewrite
**Serves:** D5 · OQ-024
Every string externalised from day one; locale routing already in place. The platform ships
**Arabic only** — `/en/app/*` redirects to `/ar/app/*` until the English catalogue is complete —
while the **marketing shell keeps `/en`**, which is a frozen public contract (A38).
**Acceptance:**
- Turning English on is a translation task plus removing one redirect.
- Templates already carry their mirrored LTR variants (A27).

#### REQ-INT-009 — Fonts are self-hosted and subsetted
**Serves:** A30 · D66
**Acceptance:**
- No production font loads from a third-party CDN — including fonts chosen through the Google
  Fonts picker, which are materialised first (`REQ-DSG-017`).
- Subsetting never drops `rlig`, `mark` or `mkmk`; a subsetter that does breaks lam-alef and
  stacked tashkeel while passing every Latin smoke test.

---

## 22. Non-functional requirements — `NFR`

#### REQ-NFR-001 — RLS on every table, with a policy set and a test
**Serves:** D62 · D3 · §8
**Every** table has an org key and a complete policy set — select, insert, update, delete —
including join tables, ledgers and storage buckets. **Every policy has a test case.**
**Acceptance:**
- A table without RLS enabled fails CI.
- A policy without a named test case fails review.
- A policy without its matching `grant` is a defect — a policy alone yields `42501`. This
  repository has already paid for that lesson: migration `0002` exists solely because `0001`
  forgot the grant.

#### REQ-NFR-002 — Schema validation at every entry point
**Serves:** §6 security
Every Server Action and Route Handler validates its input with **Zod** before doing anything.
**Acceptance:**
- An action without a validated input schema fails review.
- Validation checks **shape**; ownership and authority are re-derived server-side from the session
  — a well-formed object can still reference a row the caller does not own.

#### REQ-NFR-003 — Content Security Policy
**Serves:** §6 security
A strict CSP with a per-request nonce.
**Acceptance:**
- No `unsafe-inline` in production script or style directives.
- The policy is set in `proxy.ts`, and the nonce is per-request.

#### REQ-NFR-004 — Server-side data access; the browser client is for auth and realtime only
**Serves:** §6 security · DEC-020
All data operations use a **server-side** Supabase client. The browser client exists only for
auth UI and Realtime subscriptions. The session is validated server-side with `getClaims()`.
**Acceptance:**
- No data read or write originates in the browser.
- `getClaims()` narrowing is on **`data`, not `error`** — it returns a three-way union where
  `{data: null, error: null}` is a reachable no-session state, so narrowing on `error` lets
  unauthenticated requests through.
- The only unauthenticated routes are **sign-in**, **legal pages**, and the **certificate
  verification page** (D58, A13).

#### REQ-NFR-005 — Rate limits
**Serves:** §6 security · D23 · A13
At minimum: check-in attempts (per member, per session, **inside the transaction**), certificate
verification (per IP), uploads (per member), data export (per member), sign-in attempts.
**Acceptance:**
- Limits are enforced in a shared store, never in process memory — a serverless instance's memory
  resets and defeats the limit.
- Exact values are in `12-security-privacy.md`.

#### REQ-NFR-006 — Immutable audit log
**Serves:** §6 security
See `REQ-ADM-018`. Append-only at the database level.
**Acceptance:**
- `UPDATE` and `DELETE` are revoked for every role.

#### REQ-NFR-007 — WCAG 2.2 AA
**Serves:** §6 accessibility
Keyboard operability, visible focus, contrast, **screen-reader labels in Arabic**, image
alternatives, accessible viewer navigation.
**Acceptance:**
- Every interactive element is reachable and operable by keyboard.
- Focus is visible at 3:1 contrast against its background.
- Automated checks run in CI; they are a floor, not the standard.

#### REQ-NFR-008 — Performance budgets per key screen
**Serves:** §6 performance
Budgets are defined per screen — event page, session list, viewer, designer, leaderboard,
dashboard — and enforced in CI.
**Acceptance:**
- Core Web Vitals targets are stated per screen in `13-testing-quality.md`.
- Images are responsive (WebP/AVIF, `srcset`), lazy-loaded, and the viewer loads progressively.

#### REQ-NFR-009 — Mobile-first
**Serves:** §6 responsive
Fluid grids, flexible media, content-driven breakpoints, container queries, `clamp()` typography,
bottom navigation on mobile, primary actions in the thumb zone, **touch targets ≥ 44 px**,
landscape supported.
**Acceptance:**
- Every screen is usable at 375 px wide.
- Real-device testing precedes every release (`13-testing-quality.md`).

#### REQ-NFR-010 — Scale target
**Serves:** A24
Tens of orgs; hundreds to low thousands of members per org; tens of sessions per org per month.
Design to reach **10×** without re-architecture.
**Acceptance:**
- No query plan degrades from index scan to sequential scan at 10× the target row counts.

#### REQ-NFR-011 — PWA-ready, not PWA-shipped
**Serves:** D64
Responsive web first. **No choice may block** adding a service worker, a manifest or push later.
**Acceptance:**
- No architectural decision assumes the absence of a service worker.
- A PWA is **not** built now — push notifications are explicitly out of scope (D56, §4.22).

#### REQ-NFR-012 — Data minimization and retention
**Serves:** §6 privacy · OQ-019
Collect only what a requirement needs; retain per the OQ-019 schedule.
**Acceptance:**
- Every retained data class has a stated period and a job that enforces it.

#### REQ-NFR-013 — Members can export their own data
**Serves:** §6 privacy
See `REQ-PRF-006`.

#### REQ-NFR-014 — Org deletion cascades cleanly
**Serves:** §6 privacy
Deleting a مؤسسة removes its data — database rows **and** storage objects — with nothing orphaned.
**Acceptance:**
- A post-deletion assertion finds no row and no storage object bearing the deleted org's ID.
- Deletion is a super-admin action, confirmed, audited and irreversible — and is distinct from
  suspension (`REQ-TEN-006`).

#### REQ-NFR-015 — PDPL obligations are documented
**Serves:** §6 privacy
Saudi **PDPL** obligations are stated in the privacy documentation **without assuming a hosting
region**.
**Acceptance:**
- The current region (`ap-southeast-1`) is recorded as a fact to revisit, not as a compliance
  conclusion (see `12-security-privacy.md`).

#### REQ-NFR-016 — Observability
**Serves:** A22 · D63
Errors to Sentry; job health, queue depth and failure rates visible; product analytics optional.
**Acceptance:**
- A failing job is visible without reading logs by hand.
- Alerting exists for: queue stalled, ledger rollup divergence, parity gate failure, calendar sync
  backlog, email bounce spike.

#### REQ-NFR-017 — Three environments
**Serves:** A23
dev / staging / prod, each with its **own Supabase project**.
**Acceptance:**
- No developer runs migrations against production by default.
- **Today there is exactly one Supabase project and it is production** — creating the other two is
  work in M0, on the critical path (A23).

#### REQ-NFR-018 — Testing expectations
**Serves:** A23 · §8
Vitest for units, Playwright for e2e, GitHub Actions CI. The **RLS test plan is the highest-value
suite** in the product.
**Acceptance:**
- Every policy has a test (`REQ-NFR-001`).
- The critical path — proposal → publish → RSVP → check-in → points → certificate — is covered
  end to end.
- **Playwright, jsdom and `@testing-library` are not currently installed**; adding them is M0 work.

#### REQ-NFR-019 — The existing public site is a frozen contract
**Serves:** DEC-001 · A38
`/`, `/ar`, `/en`, `/ar/register` and `/og.png` keep working, unchanged, through every milestone.
**Acceptance:**
- `scripts/qa.mjs` guards them in CI and must stay green.
- `main` stays deployable at all times.

#### REQ-NFR-020 — Migrations are forward-only and safe against real rows
**Serves:** DEC-001 · DEC-002
**Acceptance:**
- No migration drops or alters `registrations` (DEC-002).
- Every migration is tested against a database seeded with production-shaped data before it runs
  against production.

---

## 23. Out of scope

Not planned, not designed, not built. From `_source-brief.md` §4.22:

- Payments or ticketing
- Public / SEO discovery pages — **except** the certificate verification page (A13), which is
  unauthenticated by requirement, and the existing marketing shell (A38)
- Cross-org anything
- Native mobile apps
- Live streaming or virtual attendance
- SMS, WhatsApp or push notifications
- Q&A or polling modules separate from comments
- Recurring session series (A14)
- Multi-org accounts

Two items worth stating explicitly because they sit close to something in scope:

- **A PWA is not built** (D64). The architecture must not *block* one; that is `REQ-NFR-011`, and
  it is not a plan to ship one.
- **Full-text search inside documents is not built** (A15 caveat, `REQ-DSC-007`). Material search
  is metadata-only.
