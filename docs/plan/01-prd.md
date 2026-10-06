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

#### REQ-TEN-009 — An admin adds a عضو, and they are a member at once
**Serves:** `DEC-243` · ★ **shape set by `DEC-244`** · D11 (amended in one half) · D4
★★ **Amended by `DEC-261` (the owner, 2026-10-05): the role may be مشرف المؤسسة too** — an admin adds another admin by email. The acceptance line below that limits the role to two is withdrawn. An admin who has not signed in yet never counts as the مؤسسة's last admin (`REQ-TEN-005`).
An **مشرف المؤسسة** adds a person by email address, with **الاسم**, **الشركة**, **المسمى الوظيفي**
and the role. ★ **The member exists from the moment it is saved**: they are listed among the members,
they appear in the member directory and in every member picker, they can be assigned as a presenter,
and their role, company and job title are already set — all before they have signed in once. What
they do not have is a session, so they cannot act until they do. Several addresses may be added at
once, one per line, in the same control.
**Acceptance:**
- The person appears in the members list, the directory and the member picker immediately.
- They can be assigned as a presenter of a session before they have ever signed in.
- The members list marks them «لم يسجّل الدخول بعد», with how long they have been waiting.
- An address that is already a member of the مؤسسة is refused, with that reason.
- The role may be **عضو** or **مشرف محتوى** only; **مشرف المؤسسة** is granted through `REQ-TEN-005`
  once they arrive, and never to an address.
- A person added by mistake can be **removed outright** while they have not yet signed in; once they
  have, the only way out is deactivation with its reason (`REQ-AUT-008`).
- Adding, re-sending, removing and deactivating are each audited, and the log distinguishes a member
  who was added from one who arrived by signing in.

#### REQ-TEN-010 — An added member may sign in from a domain the list would refuse
**Serves:** `DEC-243`, `DEC-244` §5 · D11 · D58
A person an admin has added may sign in **even though their email domain is on no مؤسسة's allowed
list**. This is why the capability exists: an outside presenter or a partner has no work address to
be gated on. The admission lasts while their record is waiting and active — binding it or
deactivating them ends it.
**Acceptance:**
- An admin adds a personal-domain address; that person signs in and lands in the app, already a
  member of that مؤسسة with the role they were given.
- Deactivating them before they sign in closes the door: the same account is refused again.
- A refused account still sees `REQ-AUT-006`'s explanation, which names no مؤسسة and lists no
  domains — an added address is admitted, a refused one learns nothing new.
- A failure anywhere in that read admits every sign-in the domain list would have allowed; it never
  causes a sign-in outage.

#### REQ-TEN-011 — First sign-in binds the waiting record; it never creates a second one
**Serves:** `DEC-243`, `DEC-244` §4 · `REQ-AUT-002` · `REQ-TEN-004`
A member who was added by hand is **waiting for their auth user, not for their row**. Their first
sign-in binds the two: the record they already have becomes theirs, Google fills the name the admin
left blank and supplies the avatar, and nothing is inserted. ★ A member is still identified by their
auth user and never by an email (`REQ-AUT-002`) — the address is what the admin addressed, used once,
at the binding, and never again.
**Acceptance:**
- Signing in binds the existing record: the member's id, role, company and job title are the ones the
  admin set, and no second member is created.
- A concurrent double sign-in binds exactly once.
- A name the admin set is kept; one they left blank is filled from Google.
- A **different** account later presenting the same address is still refused, as it is today.
- The person's `org_id` is the one they were added to and cannot change (`REQ-TEN-004`).

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
عضو of that org on first sign-in**. No admin approval step.
★ **Amended by `DEC-243`:** this door is unchanged, and a second one is added beside it — an admin
may name a person in advance (`REQ-TEN-009` … `011`), and that naming admits them. Everyone who was
not named still arrives exactly as this requirement describes.
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
★ **Amended by `DEC-243`:** an address with a pending invitation is admitted instead
(`REQ-TEN-010`); the message a refused account sees does not change.
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
★ **Amended by `DEC-254` §2 (`REQ-PRF-012`):** the member no longer supplies **الشركة** — it follows their email domain or an admin's placement — and the first acceptance line below is **withdrawn**: a member with no شركة is refused nothing.
Name and avatar come from Google. The member supplies: **الشركة** (required, chosen from the org
list), **المسمى الوظيفي**, **نبذة**, **اهتماماتي** (topics of interest, from the org's
تصنيفات).
**Acceptance:**
- A member with no **شركة** set is prompted for one before they can reserve a seat or submit a
  proposal.
- Name and avatar are refreshed from Google on sign-in; locally edited fields are not overwritten.

#### REQ-PRF-002 — The org admin maintains the company list
**Serves:** D12
★ **Amended by `DEC-254` §2:** «Members choose from it» is withdrawn; the list now carries each company's domains (`REQ-ADM-024`).
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

#### REQ-PRF-008 — A member owns their profile picture, and the platform stores it
**Serves:** owner 2026-09-15 · DEC-099
A member may **upload, replace or remove** their own **صورة الملف الشخصي** on `/app/me`. The image
is stored by the platform, in its own storage, under the org's prefix through the single path
builder — **never linked from a third party**. Google's photo is offered **once**, as an explicit
import on first sign-in («نستخدم صورتك من Google؟»); on yes it is **copied**, on no the member
keeps initials.
**Acceptance:**
- No `<img>` anywhere in the product has a `src` on a domain the platform does not control.
- Removal is immediate: the row is cleared and the stored object is deleted.
- The nightly storage-prefix assertion (`REQ-NFR-014`) covers avatar objects the day they exist.
- ★ **Read with `DEC-180`:** wave 14 delivers the **import** half — Google's photo offered once,
  copied on yes, served from our storage through one route, the Google `img-src` entry removed. The
  member's own upload, and `REQ-PRF-010`'s moderation of it, are not yet built.

#### REQ-PRF-009 — Initials over a deterministic tint are the default and the permanent fallback
**Serves:** DEC-099 · `REQ-INT-007`
The default, and the fallback whenever no picture exists or one has been taken down, is the first
letter of the display name over one of six navy/silver tints chosen by a **stable hash of the
member id**. There is **no silhouette placeholder** anywhere in the product.
**Acceptance:**
- The tint is stable when a member corrects the spelling of their name — it is keyed to the id, not
  the name.
- The glyph is wrapped in `<bdi>` like every other interpolated value.
- The tint never encodes role, company or status.

#### REQ-PRF-010 — A profile picture is sniffed, EXIF-stripped, raster-only and moderatable
**Serves:** DEC-099 · DEC-009 · `REQ-EVT-012`
The upload is sniffed **on content, not extension**, after the bytes land; **EXIF is stripped**
exactly as session photographs are; **PNG and JPEG only — no SVG** (invariant 11), because an
avatar renders inside the same privileged headless Chromium the posters do. Derivatives at 96 px
and 192 px WebP are produced by the existing content-pipeline job. An avatar takedown joins the
moderation queue.
**Acceptance:**
- An SVG renamed `.png` is refused after the bytes land, not before.
- A taken-down avatar reverts to initials; it never becomes a broken frame.
- The stored original carries no EXIF.

#### REQ-PRF-011 — Anonymisation clears the picture; the data export includes it
**Serves:** DEC-099 · `REQ-NFR-012`, `REQ-NFR-013`
`JOB-anonymise_members` clears `avatar_url` **and deletes the stored object**. The member data
export (`REQ-PRF-006`) includes the picture.
**Acceptance:**
- After anonymisation no storage object remains for that member's avatar.
- An export archive for a member with a picture contains it.


#### REQ-PRF-012 — A member's company follows their email domain
**Serves:** owner 2026-10-05 · `DEC-254` §2 · D12 · `REQ-PRF-002` · `REQ-PRF-003`
A **شركة** carries one or more email domains. A member whose address is on one of them belongs to that شركة: at
first sign-in, at the binding of a member an admin added, and **retroactively** — when an admin adds a domain, the
members of the مؤسسة who have no شركة and whose address matches are placed in it — ★ and so are members an earlier domain placed elsewhere (`DEC-255` §4); only an admin's placement is never moved. A domain belongs to at most one
شركة in a مؤسسة. A company's domains and the مؤسسة's allowed-domain list (`REQ-TEN-007`) are independent: neither
validates the other. ★ **The member never chooses**: the profile shows the شركة and offers no control for it.
**Acceptance:**
- A person signing in for the first time from a company's domain is a member of that شركة without being asked.
- A person whose domain matches no شركة arrives with none, and is refused nothing for it.
- Adding a domain to a شركة places every matching member who has none; a member placed by hand is not touched.
- The same domain cannot be saved on two شركات of one مؤسسة; the same domain on شركات of two مؤسسات is allowed.
- The member's own profile edit cannot change their شركة — refused by the database, not only absent from the form.
- A member moved into a شركة brings the open period's points with them at the next snapshot; finalised snapshots and company points already paid do not change (`DEC-255` §4).

#### REQ-PRF-013 — An admin's placement outranks the domain
**Serves:** owner 2026-10-05 · `DEC-254` §2.6 · `REQ-ADM-009`
An **مشرف المؤسسة** may place one member in a شركة by hand, or remove them from one. That placement is recorded as
the admin's, and no later change to any company's domains moves or unplaces that member. A شركة chosen while adding
a member (`REQ-TEN-009`) is such a placement.
**Acceptance:**
- An admin sets a member's شركة from the members screen; the change is audited with the old and the new.
- A later domain change that would have moved that member leaves them where the admin put them.
- A member added with a شركة keeps it at first sign-in, whatever their domain says.

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

#### REQ-PRO-009 — Approval carries every proposal field into the session
**Serves:** owner 2026-09-15 (ask 3) · DEC-075
`create_session()` copies **every** field the proposer supplied — title, abstract, category, level,
accepted presenters, **الفئة المستهدفة**, **المدة المتوقعة**, **أهداف التعلّم** and tags — not a
subset. An admin never re-types content. When an admin **does** edit content after approval, the
change is **recorded with who changed what** and the proposer is notified, and the proposal review
card shows a diff.
**Acceptance:**
- No field present on the proposal is absent from the session it created.
- `expected_duration_minutes` pre-fills the schedule form's duration; the admin is not asked again.
- An admin content edit writes an audit row naming the field, the old value and the new one, and
  sends the proposer a notification.
- Creating a session **without** a proposal remains possible and is a secondary action.

#### REQ-PRO-010 — The proposer supplies objectives and tags on the proposal
**Serves:** owner 2026-09-15 (asks 9 and 11) · DEC-089
The proposal form carries **أهداف التعلّم** (`REQ-SES-014`) and **الوسوم** (`REQ-DSC-002`), both
optional, both authored by the proposer. Tags are entered through a searchable, Arabic-normalised
combobox over the org's existing vocabulary (`REQ-UIX-008`, `REQ-DSC-004`) with free creation, at
most 8, each a removable chip.
**Acceptance:**
- A proposal may be submitted with neither objectives nor tags.
- A tag typed with different Arabic orthography matches the existing tag rather than creating a
  near-duplicate.

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

#### REQ-SES-014 — A session carries optional learning objectives
**Serves:** owner 2026-09-15 (ask 9) · DEC-089
A **جلسة** carries **أهداف التعلّم** — «ماذا ستتعلّم؟» — an **ordered** list of short statements,
each at most **140** characters, at most **8**. It is optional, it is supplied by the proposer
(`REQ-PRO-010`) and carried into the session by approval (`REQ-PRO-009`), and it is **simply absent**
from the event page when empty rather than rendered as an empty heading.
**Acceptance:**
- The order the proposer entered is the order rendered, and is reorderable without dragging
  (`REQ-DSG-028`'s single-pointer rule — the shared `ui/reorderable-list`).
- A ninth objective, an empty one, or one over 140 characters is refused by the database, not only
  by the form.
- A session with no objectives renders no «ماذا ستتعلّم؟» section and no heading.


#### REQ-SES-021 — An admin renames a session until it is published
**Serves:** owner 2026-10-05 · `DEC-254` §5 · ★ **rule set by `DEC-255` §1** · `REQ-SES-020` · `REQ-ADM-023` · `09` `SCR-043`
An **مشرف المؤسسة** changes a session's title from the session hub's header **while the session has not been
published**, whether or not it was made from a proposal. Once it is published the name is fixed. The change is audited
with the old and the new title.
**Acceptance:**
- The control is offered in every state before publication and in none after; the new title is what the hub, the
  sessions table and the schedule tab's log show.
- A title change to a published or later session is refused by the database, for an admin and a presenter alike.
- A moderator, and a member who does not present the session, are refused by the database.
- An empty title, or one over the length a proposal's title allows, is refused at the field.
- The proposal the session was made from keeps its own title.

#### REQ-SES-022 — A session has an event type, and its automatic poster is that type's
**Serves:** owner 2026-10-06 · `DEC-267` · `REQ-DSG-002` · `REQ-DSG-026` · `09` `SCR-042`, `SCR-043`
Every **جلسة** has a **نوع الفعالية** (event type — the owner's name, in the code and on every screen): محاضرة,
ورشة, ندوة or لقاء — the four poster families of the baseline library that name a kind of event. An
**مشرف المؤسسة** chooses it when creating a session and changes it on the session hub's الجدولة. A session with no
choice made is a محاضرة. The automatic poster (`REQ-DSG-002`'s «تلقائي») is drawn from the org's template of the
session's event type, and falls back to the محاضرة template when the org has none of that type. «إعلان» is an
announcement's family, never an event type.
**Acceptance:**
- A new session, created directly or from a proposal, is a محاضرة unless the admin chose otherwise.
- Changing the event type of a session whose poster is live regenerates it from the new type's template; a customised
  or uploaded poster is never touched.
- The change is audited with the old and the new type.
- A moderator, a presenter and a member are refused by the database.
- Every existing session is a محاضرة, so every poster already rendered is unchanged.

#### REQ-SES-023 — An admin deletes any event, one or many, and what it awarded is taken back
**Serves:** owner 2026-10-06 · `DEC-271` · `REQ-SES-010` · `REQ-PTS-001` · `REQ-CRT-011` · `09` `SCR-042`, `SCR-043`
An **مشرف المؤسسة** deletes any event — of any type and in any state — from the sessions table, one or a selection,
or from the event's hub. A deleted event disappears for everyone, admins included: its page, its card, its story, its
photographs on a member's profile, its place in the feed and in browse. What it awarded is taken back: every points
row it earned is reversed (members' and companies'), every certificate it issued is revoked. An event that has not yet
happened is cancelled first, so the members who reserved are told. **Nothing is physically erased** — the ledgers and
the audit log keep their evidence (invariant 9). The confirmation says, before anything moves, what will be cancelled,
whose points will be taken back and how many certificates revoked.
**Acceptance:**
- A deleted event is invisible to every role, and its public card answers not found.
- Its points are reversed once — a second delete, or a later reversal, takes nothing twice.
- Its certificates verify as revoked.
- A moderator, a presenter and a member are refused by the database.
- The deletion is audited with its title, its reason and what it took back.

#### REQ-SES-024 — A shared session link previews its poster, its title and its description
**Serves:** owner 2026-10-06 · `DEC-273` · `DEC-066` · `REQ-UIX-059` · `09` `SCR-007`
The link a member shares — the public card, `/s/{id}` — previews in WhatsApp, iMessage, Slack, LinkedIn, X and
Facebook as **the session's poster** (its `og` render, 1200 × 630; the platform's image when no render exists),
**its title**, and **its description**: the event type, the date and the venue, then the abstract cut on a word at
about 160 characters. The org is the site name. The tags are absolute, the other locale is linked (`hreflang`,
`og:locale:alternate`), the image's alt names the session, and nothing is indexed. `DEC-066`'s allowlist is widened by
the abstract and the event type and by nothing else. App-wide, a page that names itself reads «… · كريم معرفة» in the
tab, the event page names its session, and the app installs to a home screen with its name, icon and colour.
**Acceptance:**
- `og:image` is the poster's `og` render, absolute; `og:title` is the title; `og:description`, `description` and
  `twitter:description` are the same text and carry the abstract.
- `session_public_card()` returns the abstract and the event type and no other new field.
- A draft, a cancelled and a deleted session still preview nothing.

---

## 6. RSVP and waitlist — `RSV`

#### REQ-SES-015 — A session may span several days, and each day is a meeting in its own right
**Serves:** owner 2026-09-16 · DEC-119
A **جلسة** has one or more **أيام**, each with its own start, end and place, and each carrying the
content a member needs for **that meeting**: its own **check-in**, its own **materials** and its own
**pre-session tasks**. A one-day session is a session with one day: there is no second code path and
no second concept.
**Acceptance:**
- Every day has `org_id`, RLS and a full policy set, and appears in the generated isolation sweep
  (`REQ-NFR-001`) — invariant 5, no exception.
- Each day has its own rotating code, its own attendance list and its own rate-limit stream; the
  check-in window and the `ends_at + 2h` ceiling (`REQ-CHK-016`) are **per day**.
- One **حجز** covers every day, and **السعة stays on the session**: one registration, one seat
  count (`DEC-120`). A member registers for the workshop, not for Tuesday.
- Materials, pre-session tasks and photos belong either to the whole session or to one day
  (`REQ-SES-018`, `DEC-121` — which superseded «a task for the whole workshop is a task on day 1»;
  corrected here by `DEC-150`) — and `REQ-TSK-002` is untouched: tasks stay reminder-only and are
  never read by check-in, at either scope.
- One rating, one discussion, one certificate, one poster — those belong to the session.
- A member's calendar gains one entry **per day**, and reminders fire per day.
- ★ This is **not** the recurring series `A14` rules out: that is N independent sessions, each with
  its own registration and certificate. This is one session with N meetings.

#### REQ-SES-016 — The scheduling form is quick for the common case and honest about the rare one
**Serves:** owner 2026-09-16 · DEC-119 · `REQ-UIX-009`, `REQ-UIX-010`
Scheduling a session is the form an admin fills in most, and nearly every session is one day.
**Acceptance:**
- **One day is the default and costs nothing**: the multi-day controls sit behind an explicit
  «جلسة متعدّدة الأيام» affordance, and an admin who never opens it fills in the fields they fill
  in today.
- **The end follows the duration**: entering a 60-minute duration puts the end 60 minutes after the
  start and keeps it there as the start moves. An **explicitly edited end wins** and stops
  following (`OQ-001` — the duration pre-fills and is never authoritative).
- **Each added day defaults to the previous day's time and place**, both editable per day. Adding a
  third evening to a workshop that meets 6–8 p.m. in the same room is one tap.
- **Validation is immediate and at the field**: a day ending before it starts, two days overlapping,
  a deadline after the first day begins — each said on blur, next to the control, never only on
  submit.
- The form is filled without scrolling back to check what was entered above.

#### REQ-SES-017 — Points and certificates require attending every day, by default
**Serves:** owner 2026-09-16 · DEC-119
Attendance points and the certificate are awarded **once for the session**, and by default **only
when the member attended every one of its days**. It is a per-session setting an admin may relax,
sitting beside `certificate_mode` where that judgement already lives.
**Acceptance:**
- ★ **For a multi-day session the award is evaluated at session completion, not at check-in.**
  `REQ-CHK-009` makes the verified check-in the sole *trigger* for attendance; the full day set is
  not known until the session ends, so the award is computed then. A one-day session is unchanged,
  because attending every day is attending the one.
  ★ **Amended by `DEC-172`:** a one-day session also pays at completion (`REQ-PTS-015`) — one rule,
  no branch on the number of days.
- The idempotency key is per member **per session**, so re-running the job cannot double-pay
  (`REQ-PTS-011`'s ledger is append-only and must stay recomputable).
- Partial attendance earns nothing by default, and the member can see why: their points history
  says which day they missed rather than showing an absence.
- A certificate is never issued for partial attendance while the default stands — a printed
  artefact asserting attendance is a statement the org has to be able to defend.

#### REQ-SES-018 — Content belongs to the session or to one of its days, and the member is never asked which
**Serves:** owner 2026-09-16 · DEC-121
Materials, pre-session tasks and photos each belong either to the **whole session** or to **one
day**. Both may be used at once — a workshop may have a plan for the week and slides for Wednesday.
**The scope is never a question put to the person adding the content**: it is implied by where they
added it from, shown afterwards as a chip, and changeable in one tap.
**Acceptance:**
- ★ **A one-day session has no scope concept at all** — no groups, no headings, no chips. Its
  content is session-scoped and renders exactly as it does today.
- The member reads **one list per content type**, in day order, with the session's own content
  first. A group with nothing in it is not rendered.
- The add control lives in each group's header; pressing it *is* the scope choice. There is no
  picker, no modal and no required field.
- A photo is never scoped by hand, including by an attendee: it takes the day whose window contains
  its upload time, and staff may re-scope it.
- Adding a second day to an existing session **re-scopes nothing**.
- Reordering days moves day-scoped content with its day; deleting a day that holds content asks,
  and defaults to promoting that content to the session rather than deleting it.

#### REQ-SES-019 — An admin changes a session's presenters after it is created
**Serves:** owner 2026-09-22 · DEC-172
A session's presenters are set when it is created and can be changed afterwards by an **مشرف
المؤسسة**, from the session's admin screen, at any time. Once a proposal becomes a session, the
proposal's own control no longer applies.
**Acceptance:**
- Adding and removing are two audited actions. Each names the member and is refused for anyone
  outside the org, beyond the org's presenter limit (`A5`), or — for removal — for the last
  presenter.
- An added presenter is **assigned**, not invited. They are told by the existing
  `MSG-presenter_assigned` and appear everywhere a presenter appears — the poster included while the
  session has not completed. ★ `DEC-174`: after completion the poster is not re-rendered and presenter
  certificates are not issued or revoked; both are carried.
- Before the session completes, a change costs nothing, because nothing has been paid
  (`REQ-PTS-015`). After it completes, an added presenter is paid their presenter awards and a
  removed one's are reversed by compensating entries (`REQ-PTS-013`), never by deleting rows.
- A presenter taking themselves off is not this requirement.

#### REQ-SES-020 — A session's settings are reached from one place
**Serves:** owner 2026-09-22 · DEC-176
Every admin screen of one session — its schedule and days, its presenters, its poster, its
certificate mode, its certificates, its attendance and its survey — is reached from **one sub-nav**
shared by all of them, so «where do I change this session?» has one answer. The sub-nav joins the
screens that exist; it is not a new screen that copies them.
**Acceptance:**
- From any one of those screens, every other is one tap away, and the current one is marked
  (`aria-current`).
- Each setting has **one** writer. The certificate mode is changed in exactly one place and only
  shown elsewhere.
- The session's materials, tasks and photos are reachable from the same sub-nav, even though they
  are managed on the event page.
- At 390 px in Arabic the sub-nav causes no horizontal page scroll, and every target meets `SC 2.5.8`.

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
★ **Amended by `DEC-254` §6 (`REQ-CHK-019`):** the rotation may be switched off, leaving one code per day inside the same validity window.
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
- The code is **posted as a single field**, from a screen reachable in one tap from the event page.
  It is **entered** in six boxes (`REQ-UIX-035`), as the screen has done since M2 (`DEC-186` §6).
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

#### REQ-CHK-010 — Walk-ins are a publishing setting on the session (amended by DEC-065, DEC-117)
**Serves:** OQ-005 · D24 (as narrowed by the owner at Launch)
By default a code is accepted only from a member whose reservation is **confirmed**.
`sessions.allow_walk_ins` decides otherwise, and it is **a setting in the session's publishing
settings** — SCR-043's «الإعدادات» tab — set by the **مشرف المؤسسة** who schedules and publishes
the session. On an opened session a walk-in who enters a valid code is checked in and receives
every attendance right. **السعة** remains a planning limit on reservations.
**Acceptance:**
- With the switch off, a member with no confirmed حجز is refused with «reservation required», before
  the code is checked, and the attempt is recorded.
- With the switch on, a member with no حجز who checks in earns attendance points and receives a
  certificate; walk-ins are distinguishable in admin reporting.
- ★ **It is decided when the session is scheduled and published**, alongside the date, the venue,
  the capacity and the deadlines — written by the same audited RPC — and is changeable afterwards
  **only** through that same act, by an admin (`DEC-118`). There is no toggle anywhere else.
- ★ **It is a policy about who may attend, not an in-room control.** What the room controls is
  *when check-in stops accepting* (`REQ-CHK-015`), which is a different question, at a different
  time, with a different role set.

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

#### REQ-CHK-015 — Check-in is opened and closed by hand
**Serves:** owner 2026-09-15 · DEC-113
A session carries a **switch** that decides whether check-in is accepting anyone. It is **open by
default** — nobody has to open it — and the session's accepted **مُقدِّمون**, any **مُنظِّم** and
any **مشرف المؤسسة** may close it, and reopen it, at any time.
**Acceptance:**
- The switch starts **open** (`DEC-116`). The previous design put a manual act in front of the
  common case and relied on someone performing it in a room, under time pressure, on a screen
  projected in front of an audience.
- Closing and reopening are one tap from the host view (SCR-016), the screen already in the room.
- Closing stops admitting new check-ins and **never revokes one already recorded** (`DEC-115`) —
  an attendance record is evidence that someone was in the room, and the switch governs the door,
  not the people already inside. Withdrawing one moves that member's points, certificate
  eligibility and «حضرت» without them acting.
- Every open and close writes an audit row naming who and when — it decides whether attendance can
  be recorded, and attendance is what `REQ-PTS-012` pays points on.
- A member may not open it, and a presenter of a *different* session may not open this one.

#### REQ-CHK-016 — Check-in closes two hours after the session's scheduled end, absolutely
**Serves:** owner 2026-09-15 · DEC-113
From **`ends_at` + 2 hours** the switch can no longer be opened, and an open switch stops admitting.
**Acceptance:**
- The ceiling is enforced by the RPC, not by the screen — a forged request past it is refused.
- The ceiling is computed from the session's **scheduled** end, not from when it actually finished.
- A session with no scheduled end cannot accept a check-in at all, which is already true: nothing
  reaches `published` without both ends (`REQ-SES-001`).
- ★ **The floor is `REQ-CHK-004`'s and is unchanged**: a code is valid only while the session is
  running. "Open by default" therefore cannot mean checking into a talk three weeks early — there
  is no code to enter. The switch closes the window early; it never opens it wider.

#### REQ-CHK-014 — Host-view access
**Serves:** OQ-013 · A1
The host view — and therefore the live code — is visible to the session's presenters, org admins
and moderators only. Not to members, including members who have already checked in.
**Acceptance:**
- A checked-in member requesting the host view is denied by policy, not merely by hidden UI.


#### REQ-CHK-019 — The check-in code may stay fixed for the day
**Serves:** owner 2026-10-05 · `DEC-254` §6 · amends `REQ-CHK-002` · `REQ-CHK-016` · `REQ-TEN-008`
The مؤسسة's rotation setting has a value **«لا يتغيّر»**. With it, each day of a session has **one** code, valid from
the day's start until that day stops taking attendance (`REQ-CHK-016`'s ceiling) and not a moment longer.
**Acceptance:**
- With rotation off, the code shown at the start of a day is the code shown at its end, and it checks a member in.
- The same code is refused after the day's ceiling, and a day's code never works for another day.
- The host view and the check-in screen show no countdown and no rotation period when there is none.
- Switching rotation off while a code is current keeps that code for the rest of the day; switching it on ends the whole-day code after the grace period, like any previous code (`DEC-255` §3).
- A period, when one is set, is still between 60 and 3600 seconds.

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
- A **بعد الجلسة** material is not visible to members until **its own scope** has finished
  (`DEC-121`): a session-scoped one when the session reaches `completed`, a **day-scoped one when
  that day ends**.
- ★ That distinction is a fix, not a nicety. Without it, day 1's slides on a three-day workshop
  would be withheld until Friday — long after the evening they are useful.
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

#### REQ-EVT-010 — Photos publish without moderation, the moment their metadata is stripped (amended by DEC-139)
**Serves:** D34 · `REQ-EVT-011`
An uploaded photo is published with **no pre-moderation queue**: no person reviews it before the
organisation sees it. It becomes visible as soon as the worker has stripped and stored it
(`REQ-EVT-011`) — never before, because the original carries location and device data.
**Acceptance:**
- No state between upload and visibility waits on a person.
- The uploader is told at once that the photo is being processed, never that it was posted.
- A photo is never retrievable before its strip completes (`REQ-EVT-011`).
- Once processing completes, the photo takes its place in the uploader's gallery without the
  uploader reloading the page.

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

#### REQ-EVT-016 — A session's photographs open whole, and are moved through by tapping
**Serves:** owner 2026-09-27 · DEC-180 · DEC-093 · `SC 2.5.7`
A tap on a photograph in a session's gallery opens it **whole** in a lightbox, and the member moves
to the previous and next photograph from there. The lightbox shows only photographs the viewer may
see, and never a hidden or removed one.
**Acceptance:**
- **Previous and next are always-visible tap targets.** A swipe may be added, but it is never the
  only way to move — a single pointer without dragging reaches every photograph (`DEC-093`'s sixth
  place). A Playwright case drives the whole lightbox with `page.click()` alone.
- The photograph is never cropped in the lightbox. Where the grid crops a tile, the crop is
  deliberate and written down in the file that does it (`REQ-UIX-026`).
- Escape and the backdrop close it, and focus returns to the tile that opened it. The position reads
  «3 من 12», with Western numerals (`DEC-124`).
- At 390 px in Arabic the controls meet `SC 2.5.8` and cause no horizontal page scroll.

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
The presenter sees no aggregate until **3 ratings** exist; below that, **«التقييمات تظهر بعد 3
تقييمات»** (Western digits — `DEC-124`, corrected under `DEC-160`). The rating form tells the rater this, so the anonymity promise made is the one kept.
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

#### REQ-PTS-015 — Every award a session earns is paid when the session completes
**Serves:** owner 2026-09-22 · DEC-172
Attendance, company, presenter and proposal awards tied to a session are written to the ledger
**when the session completes**, and never before — whatever the number of days. The check-in is
still the sole *trigger* for attendance (`REQ-CHK-009`); the payment waits for the end.
**Acceptance:**
- One rule and one moment, with no branch on the number of days. A one-day session pays at
  completion, exactly as a multi-day session already does (`REQ-SES-017`).
- Before completion, removing an attendance record or a presenter leaves no ledger row and needs no
  reversal. After completion, the compensating entry of `REQ-CHK-017` / `REQ-PTS-013` still
  applies.
- `proposal_accepted` is paid at completion under the key it has always had, so an award already
  paid at approval is never paid again.
- Streaks and badges that count attended sessions count completed ones.
- A pending amount is **computed** from the rules and the attendance, and never stored — the ledger
  remains the only record of a balance (`REQ-PTS-001`).

---

## 13. Leaderboards — `LDR`

#### REQ-PTS-016 — Hosting points go to the company that owns the venue
**Serves:** `DEC-230` §2 (the owner) · `REQ-ADM-022` · DEC-067
When a session completes, the `company_hosting` rule credits the company that owns its venue. A presenter's company
earns the presenting rule; the venue's owner earns hosting; **a venue owned by no company rewards no company**.
**Acceptance:**
- A session at a venue with no company awards no hosting points, by rule and not by omission.
- `sessions.host_company_id` is no longer read by any rule or screen; the column stays (`DEC-230` §2.3).
- Rows already in `company_points_ledger` do not change (invariant 9).

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
★ **Amended by `DEC-244` §6:** the denominator counts the members who **have signed in**. A person an
admin added who has not yet arrived has not declined to contribute — they have not been asked — so
counting them would dilute their شركة's **النقاط لكل عضو نشِط** for an admin's typing, and could carry
a company across `REQ-UIX-082`'s minimum before anybody had done anything.
**Acceptance:**
- Deactivating a member does not change any published standing.
- ★ A member added by an admin enters the denominator on their **first sign-in**, not when they are
  added; the change is provably a no-op for every member who already exists.
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

#### REQ-CRT-015 — One default template per certificate kind, and a session's choice written in one place
**Serves:** `DEC-178`, `DEC-236` C2 and C6, `DEC-237` §4 · `REQ-CRT-004`
Each certificate kind — attendance, presenting, achievement — has one org default (`0055`'s indexes). A session may name
another template per kind **before completion, on its certificates screen**, the same and only place its mode is written
(`DEC-178`). After completion the mode is shown and not written; the template may still change **while that kind has
held certificates and none issued**, so the held ones can be re-rendered (`DEC-238` §2).
**Acceptance:**
- With no choice, a certificate is issued from the template `issue_certificate()` picks, and the screens name that same
  template — «افتراضي» only when it is the kind's default (`DEC-238` §2).
- ★ **Amended by `DEC-256`:** the mode's control also sits on the session's **schedule tab** (`SCR-043`), with the session's other settings — the same control and the same function as on its certificates screen, never the schedule form's own save. The template is still chosen on the certificates screen alone.
- ★ **Amended by `DEC-250`:** the mode is refused only once the session is **cancelled** (see `REQ-CRT-017`); the
  template once a certificate of that kind is issued.

#### REQ-CRT-016 — The baseline certificate templates are the designed ones
**Serves:** `DEC-242` §1, §3 · `REQ-CRT-014` · `REQ-DSG-008`, `REQ-DSG-026`
The three platform certificate families, in both orientations, are rebuilt to the design the library's artboard
draws: a bone ground, ink text, the org wordmark at the top-start in the display face, the member's name large in
the display face, the serial at the bottom-start in `fgMuted`, the verification QR at the bottom-end. The family
set, the orientation rule and the one-default-per-family indexes are unchanged.
**Acceptance:**
- Every colour in the document is a `brand.*` binding; `design_template_versions_guard` accepts it.
- A certificate issued before the rebuild still renders as the version it was issued against (`REQ-CRT-014`), which
  is why the old version row survives when the database refuses its deletion.
- The member's name is set in the display face and the serial is bidi-isolated.

#### REQ-CRT-017 — Certificates may be switched on after the session has completed, and are issued when they are
**Serves:** `DEC-250` · `REQ-CRT-001`, `REQ-CRT-002` · `REQ-SES-017` · `09` `SCR-045`
A session's certificate mode is `off` until somebody chooses otherwise (`ENT-sessions`), and the completion fan-out
runs once, on the edge into `completed`. A session that completed at `off` was therefore unreachable: the mode could
not be changed afterwards and `SCR-045` drew no control, so an admin had no way to issue a certificate for a session
that had already happened. **An admin may now set the mode on a completed or archived session, and setting it to a
mode other than `off` fans out in the same transaction** — one job per eligible recipient per kind, under `11` §2.5's
key. A **cancelled** session is still refused: it has no attendance to attest.
★ **A late switch attests only what the database holds at the moment of the switch.** Eligibility is re-derived then,
from active check-ins and accepted presenters through `REQ-SES-017`'s predicate — never from a list recorded earlier.
**Acceptance:**
- A completed session at `off` shows the mode control on `SCR-045`, with its three named options and its preflight.
- Switching it to `review` creates a held certificate for each eligible recipient; to `automatic`, an issued one.
  Switching it back to `off` enqueues nothing and deletes nothing.
- Setting the same mode twice issues one certificate per recipient, not two (`REQ-CRT-003`), and a re-run moves each
  pending job rather than duplicating it.
- A certificate revoked for cause is not replaced by a late switch (`REQ-CRT-011`).
- A cancelled session shows no control and is refused by the function.
- The screen says the certificates are being **prepared**, not «saved»: the worker writes the rows.



#### REQ-CRT-018 — Certificates are held for review unless somebody chooses otherwise
**Serves:** owner 2026-10-05 · `DEC-254` §4 · `REQ-CRT-004` · `REQ-CRT-017`
A new session's certificate mode is **`review`**: when it completes, a certificate is generated for every eligible
recipient and **held** — invisible to its recipient and sending no mail — until an admin releases it.
**Acceptance:**
- A session created after this requirement and never touched on `SCR-045` completes with held certificates.
- Nothing reaches a member until a release (`REQ-CRT-004`).
- A session that existed before keeps the mode it had.

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
★★ **Amended by `DEC-254` §3 (`REQ-DSG-035`): there is ONE library level, the org's.** The platform library, duplicating from it and both acceptance lines below are withdrawn; what survives is their reason — an org's template is its own property.
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
**هوية المؤسسة** — logo, colours, fonts — feeds the designer's templates, the certificates and the
email templates. Changing a colour or a face is **one edit in one place**.
★ **Amended by `DEC-272` (the owner, 2026-10-06): a template colour may be ANY colour.** The brand colours are the editor's quick-select swatches — a swatch stays linked, so a brand-kit edit still repaints every template that chose it — and any other colour is picked freely and stays as picked. The brand kit saves any palette: the status-badge contrast lock is removed.
★ **Amended by `DEC-201` §1 (the owner, 2026-09-30): the brand kit no longer restyles the app.** The
app wears one visual language, «ساحة اللعب» (`REQ-UIX-049`), and a per-org app theme is incompatible
with a fixed direction; an org's identity inside the app is its companies' team colours
(`REQ-UIX-043`). It read «feeds the CSS theme layers, the designer's templates, and the email
templates».
**Acceptance:**
- Replacing the org logo updates every template at once.
- No brand colour is hard-coded in a template, an email or a component.
- The kit's colours reach posters, certificates and mail, and no screen of the app.

#### REQ-DSG-022 — Designer feature set
**Serves:** A31
★★ **Amended by `DEC-258` (`REQ-DSG-036`): the designer does not autosave.** «autosave» below and the first acceptance line are withdrawn; their intent — never more than a few seconds of work lost — is kept by `REQ-DSG-036`'s local draft.
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
★ **Amended by `DEC-254` §3 (`REQ-DSG-035`):** the baseline ships as a **seed every org receives as its own rows**, not as platform rows; the roster is counted per org.
Poster families — **جلسة** (talk), **ورشة** (workshop, with a tasks strip), **حوار** (panel,
multi-presenter), **لقاء** (meetup), **إعلان** (announcement) — each light and dark, RTL-first
with a mirrored LTR variant reserved for English. Certificate families — **حضور**, **تقديم**,
**إنجاز** — landscape and portrait, formal Naskh, with locked regions.
★ **Posters render on a GRADIENT background and default to the DARK scheme** (`DEC-125`, `DEC-127`);
certificates are **a library the admin chooses from**, in both orientations and both schemes
(`DEC-128`). Numerals on every template are **Western** (`REQ-INT-006`, `DEC-124`).

★★ **AMENDED BY `DEC-242` (wave 24, M26) — four of this requirement's VISUAL clauses are superseded
by `REQ-DSG-033` and `REQ-CRT-016`, and its STRUCTURE is not.** What stands: the five poster
families and the three certificate families by those names, both orientations, both schemes, the
counted roster, Western numerals, locked regions. What `DEC-242` replaces: **the gradient
background** (a flat ground), **the workshop's tasks strip** (not drawn by the design), **formal
Naskh on a certificate** (the display face), and **the Knowledge Network as the visual language**
(«ساحة اللعب»). ★ The roster's count and names are unchanged by that wave, which is why this
requirement is amended rather than withdrawn — a plan that reads the four superseded clauses as
live has missed `DEC-242` §1.
**Acceptance:**
- ★ **The seeded roster is counted, not assumed** (as amended by `DEC-148`) — **11 platform
  templates**: the 5 poster families, and the 3 certificate families each as a **landscape** and a
  **portrait** composition; **each renderable in both schemes, 22 variants**. A scheme is a palette
  chosen at render, never a second row (`DEC-125`); an orientation is a composition, so it is a row.
  A short roster **fails CI**. `0061` seeded 8 × 1, and its portrait certificates were derived from
  the landscape master, which is not a composition (`DEC-128`, `DEC-148`).
- Every template declares its dynamic fields and its safe area per preset.
- Templates honour the brand's forbidden imagery: **no books, caps, lightbulbs, education
  iconography, cartoon illustration, icon libraries, emoji or photography**. The visual language
  is the **Knowledge Network** — dots, thin lines, light.
- ★ **One exception, by `DEC-183`:** the house object set — coin, cup, flame, ticket, star badge,
  rocket — is an allowed **optional** image layer on a poster, as a **raster** and never as SVG
  (`REQ-DSG-018`). Everything else in the rule above stands, and certificates take no object.

#### REQ-DSG-027 — Staff and presenters may download every rendered poster variant
**Serves:** owner 2026-09-15 (ask 7) · DEC-076
A **تنزيل** menu on the event page and on the schedule screen lists every ready artifact — master
4:5, square, story, OG, and the print PDF where one exists — to an **مشرف المؤسسة**, a **مُنظِّم**
and the session's own **مُقدِّمون**. It mints a short-lived server-signed URL through the existing
export read path; it never builds a client-side blob.
**Acceptance:**
- The same signing function serves the designer's export panel and this menu; there is one.
- A member who is neither staff nor a presenter of that session sees no menu and, if they forge the
  request, is refused by policy.
- A variant that has not finished rendering is listed as pending, not as a broken link.
- ★ **Read with `DEC-176`** (the owner: «I just need a simple download»): one primary **«تنزيل»**
  gives the obvious file — the 4:5 master as PNG — and every other ready artifact sits behind a
  disclosure. The refusal is the audited download action's; a poster's bytes are readable by the
  org since `DEC-173`, by design.

#### REQ-DSG-028 — Layers are positioned by direct manipulation, with a non-dragging path for every dragged operation
**Serves:** `REQ-DSG-022` · DEC-077 · DEC-093 · `SC 2.5.7`, `SC 2.1.1`
A layer is positioned by **drag, eight-handle resize and rotate**, with **snapping and alignment
guides**, arrow-key nudge (1 px, 10 px with shift), reorder, multi-select and group
align/distribute — **with a single-pointer, non-dragging alternative for every dragged operation**,
and full keyboard parity.
**Acceptance:**
- Every studio operation is performable with taps alone — no press-move-release — and a Playwright
  case proves it using `page.click()` only.
- The inspector's numeric position, size and rotation fields **exist**; they are the conformance
  path and may be demoted into a collapsed accordion but never removed.
- Align, distribute and rulers operate on the **document's** logical axis; arrow keys follow the
  **visual** axis. Applying "align start" to the same document from an `ar` console and an `en`
  console stores **byte-identical** results.
- A marquee is never the only way to select more than one object.

#### REQ-DSG-029 — The editor previews every variant live, and a failing check names its layer
**Serves:** `REQ-DSG-022` · DEC-077
A variant strip shows a live thumbnail of every preset, with a warning dot where a check fails. The
checks panel is a persistent badge with a count; selecting a check **selects the offending layer**.
**Acceptance:**
- A variant is inspectable before export, not discovered at export.
- Clicking a failed check moves the selection to the layer that failed it.

#### REQ-DSG-030 — Image layers carry a focal point that drives every derived crop
**Serves:** `REQ-DSG-022` · DEC-077 · DEC-093
An image layer carries a **نقطة التركيز** used by derivation when producing every other variant, so
a crop centres on the subject. It is set by a draggable dot **and** by a nine-point preset grid.
**Acceptance:**
- The default is the geometric centre, so an untouched document derives **identically** to today
  and no parity golden moves.
- The nine-point grid alone is sufficient to set it.

#### REQ-DSG-031 — Certificate issuance is a three-step flow with a preflight
**Serves:** `REQ-CRT-001` … `REQ-CRT-004` · DEC-077
Issuance is **التصميم** (pick a template, preview with a real attendee's data) → **من يستحق** (the
mode, with the resulting list of names shown live and a count, and hold-backs made visibly) →
**الإصدار** (a preflight — fonts resolved, bindings bound, Tier A green, **the expected next serial
and count, stated as an estimate and never reserved** (`DEC-148`: a range reserved outside the
issuing transaction is the gap `DEC-010`'s locked counter exists to prevent) — then one confirmed
button, then a per-certificate progress list with a re-issue for failures).
**Acceptance:**
- The three meanings of «شهادة» — the design, the mode and the act — are separated on screen.
- Issuance cannot be triggered from a dropdown without the preflight and the confirmation.
- A failed certificate is re-issuable individually without re-issuing the batch.

#### REQ-DSG-032 — The platform default brand palette is «ساحة اللعب»
**Serves:** `DEC-242` §2 · `DEC-183` · `REQ-UIX-049` · `DEC-052` (the identity override)
The ten `BRAND_COLOUR_TOKENS`' platform default values are the accepted visual direction's palette — ink, surface,
surface-2, bone, muted and line on the dark ground; paper, paper-surface, paper-ink, paper-muted and paper-line on
the light one — with `node` carrying the single accent (lime, and lime-deep on a light ground) and `edgeStrong` the
secondary-text value. The set of tokens does not change.
**Acceptance:**
- `packages/designer-runtime/src/brand.ts` and `public.brand_kit()`'s fallbacks hold the same values, proven by
  `tests/rls/brand-kits.test.ts`.
- All six of `0144`'s status pairs clear 4.5:1 on the new defaults, so the platform default still saves.
- An org that has overridden its brand kit renders exactly as before.
- No status colour (`DEC-073`) and no company's team colour becomes a brand token.

#### REQ-DSG-033 — The baseline poster templates are the designed ones
**Serves:** `DEC-242` §1 · `REQ-DSG-008`, `REQ-DSG-026`, `REQ-UIX-026`
The five platform poster families are rebuilt to the design the library's artboard draws: a flat ground, the
category as a pill at the block-start, the title large in the display face, the presenter and the date at the
bottom-start, the verification QR at the bottom-end. The five families and the one-default-per-family rule are
unchanged; each family differs by its colourway, not its structure.
**Acceptance:**
- Every colour is a `brand.*` binding or the team colour; no hex literal reaches a document.
- A poster is never cropped on any surface that shows it (`REQ-UIX-026`).
- The roster CI count (`REQ-DSG-026`) is unchanged at five poster families.

#### REQ-DSG-034 — The superseded baseline leaves the library
**Serves:** `DEC-242` §3 · `REQ-DSG-008` · `REQ-CRT-014`
The eleven superseded baseline rows are deleted. Where a certificate or a design document references a version of
one, the database refuses the deletion by design, and the row is retired instead — invisible to the library, to a
session's picker and to issuance, and kept only so an already-issued document still renders.
**Acceptance:**
- No superseded row is offered anywhere a template can be chosen: `055`'s platform section
  (`templates.ts`), `045`'s picker (`certificates.ts`), the designer's own list (`designer.ts`) and
  all three issuance paths each filter `retired_at is null`. ★ `platform_template_library()`
  (`0096`) deliberately **does** return a retired row, with its `retired_at` and `retirable`
  columns, because `SCR-083` retires and restores — that is the super admin's own surface and it is
  not a place a template is chosen.
- Issuance never resolves a superseded template.
- Every certificate issued before the wave still renders, and its PDF is byte-reproducible (`REQ-CRT-014`).
- The migration reports, per row, whether it was deleted or retired.


#### REQ-DSG-035 — An organisation owns its templates from the day it is created
**Serves:** owner 2026-10-05 · `DEC-254` §3 · amends `REQ-DSG-008`, `REQ-DSG-026` · `REQ-CRT-014` · `REQ-CRT-015`
There is **one** library level: the مؤسسة's own. Creating a مؤسسة gives it the whole designed baseline — five poster
families and three certificate families in both orientations — as its own published, editable templates, with one
default per purpose and family. There is no platform library to copy from, no platform template an org reads, and no
way to publish an org's template to other orgs. An improvement to the baseline reaches orgs created after it.
**Acceptance:**
- A مؤسسة created through the product can export a poster and issue a certificate of each kind without any setup.
- Every مؤسسة that existed before this requirement holds the same set, and none was left without a certificate
  default at any point of the change.
- An admin edits a baseline template in place; `SCR-055` shows one list and no «انسخ لتعدّل».
- A seeded document renders byte-identically to the baseline document it came from: no parity golden moves.
- A certificate or a design document issued against a former platform version still renders as that version
  (`REQ-CRT-014`); such a version is retired, never deleted.
- The platform console has no template screen, and no function promotes a template across orgs.
- An org's last live published template of a family that issuance or a poster falls back on cannot be retired; the refusal says why (`DEC-255` §5).

#### REQ-DSG-036 — The designer saves when it is told to, and asks before work is lost
**Serves:** owner 2026-10-05 · `DEC-258` · amends `REQ-DSG-022` · `REQ-DSG-005`
The designer writes a document to the server only when the admin saves it — by the Save control, its keyboard
shortcut, or by publishing. The bar says whether the document on screen has unsaved changes. Leaving the editor with
unsaved changes asks: **save, discard, or stay**. A reload or a closed tab gets the browser's own question. Unsaved
changes are mirrored to the browser's own storage as a local draft and offered back when the editor reopens; a local
draft is never the document, and nobody else, no preview and no export reads it.
**Acceptance:**
- An edit, an undo or a redo sends nothing to the server; Save sends one write, and the bar then says saved.
- An undo back to the saved document is not an unsaved change.
- A press on the editor's back control or any in-app link with unsaved changes opens a dialog with three answers;
  «save» leaves only after the save succeeded, «discard» leaves with the server's document unchanged.
- A reload or a tab close with unsaved changes gets the browser's question, and with none it does not.
- An editor closed without saving — a crash, a closed laptop, the browser's Back — offers its edits back on reopening;
  restored, they are unsaved changes, and discarded, they are gone.
- A draft based on a version the server has since replaced is neither applied nor dropped without the admin being told.
- A save, and a confirmed discard, delete the draft; storage that is full or blocked never stops editing.
- A preview and an export render the saved document (`DEC-258` §2.5); publishing saves first (§2.4).
- No parity golden moves: the change is when a document is written, never what it renders.

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

#### REQ-NTF-009 — A notification template is an ordered list of typed blocks
**Serves:** owner 2026-09-15 (ask 13) · DEC-081
A template is an ordered list of typed blocks — `heading`, `paragraph`, `button`, `session_card`,
`detail_list`, `divider`, `spacer`, `image`, `footer` — each compiling to one table row of the
existing mail shell. The `footer` is **composed, not typed**, so `REQ-NTF-005`'s preference link can
never be forgotten. Images are **PNG/JPEG only, never SVG** (invariant 11), width-capped, always
with `alt`.
**Acceptance:**
- ★ **Every message renders through the blocks** (`DEC-170`, M13): an org with no row for a key sends the
  key's platform design; an admin's edited string template is sent as the admin's own words inside the
  design's frame, never discarded. The pinned output changes only as a reviewed diff.
- Blocks are reorderable without dragging (`REQ-DSG-028`'s rule — the shared `ui/reorderable-list`).

#### REQ-NTF-010 — The template editor previews with the production renderer
**Serves:** DEC-081
The preview calls **the same renderer the worker calls**, over sample data for that message key, in
a sandboxed iframe, in three modes: **phone at 375 px, desktop, and plain text**.
**Acceptance:**
- There is exactly one mail renderer; the preview is not a second implementation.
- The plain-text mode shows what a client that strips HTML actually displays.
- A forced-dark toggle shows the message as an inverting client renders it.

#### REQ-NTF-011 — An admin can send a live test of any template to their own address
**Serves:** DEC-081 · D56
**«أرسل اختبارًا»** sends the rendered message to the signed-in admin's own address **through the
live transport**.
**Acceptance:**
- The test goes to the admin's own address and to no other; no arbitrary recipient is accepted.
- It uses the production transport, so Outlook on Windows is testable by opening Outlook on Windows.

#### REQ-NTF-012 — Bindings are declared per message key and enforced by the database
**Serves:** DEC-081
Each `MSG-*` key declares the bindings it offers; the editor lists them rather than letting an admin
type one that will render empty. The existing template-validation trigger gains the binding check.
**Acceptance:**
- A template referencing a binding the key does not offer is refused by the **database**, for every
  writer, not by the form.
- A template missing a required field stays refused, as today.

#### REQ-NTF-013 — The plain-text alternative is generated from the blocks
**Serves:** DEC-081 · D56
The text part is derived from the blocks — a heading becomes a line, a button becomes `label: url`,
a session card becomes four lines — never authored twice.
**Acceptance:**
- One edit changes both parts; they cannot drift.
- Every message still ships with a text alternative.

#### REQ-NTF-014 — Eight designed platform templates are present for every org from creation
**Serves:** DEC-082 · A27 pattern
**إعلان جلسة · تذكير · تأكيد حجز · تغيّر موعد · إلغاء · طلب تقييم · شهادة · تكريم** ship
platform-owned and seeded for every org, in light and dark, Arabic and English, driven by the brand
kit (`REQ-DSG-021`). An org duplicates one to make it theirs; the original is never mutated.
**Acceptance:**
- **Every** message key has a designed platform template an org can adopt in one action.
  ★ **Since M13 no key falls back to unstyled text, for any org** (`DEC-170`): an org that has not
  adopted a design sends the platform's design for that key; adopting remains the way to make one's own.
- Changing the org logo restyles every message an org has adopted a design for.
- Promotion adds to the library; it never supplies the baseline.

#### REQ-NTF-015 — Six more block types, row layouts and global styles — additive
**Serves:** `DEC-235` §3.2 · `REQ-NTF-009`, `REQ-NTF-010`, `REQ-NTF-014`
The email document gains six block types — the poster, a QR code, the member's points, a certificate, the logo, social
links — row layouts (1 · 1/1 · 1/2 · 1/1/1) and global styles with per-block overrides. Each block type has a compiled
HTML form, a generated text alternative and checks.
**Acceptance:**
- Every message that renders today renders byte-identically: `tests/unit/mail-pinned/`'s files are unchanged.
- A document saved before the change opens and compiles unchanged.
- No block emits SVG; images are PNG or JPEG.

#### REQ-NTF-016 — The eight designed mail families are rebuilt to the same language
**Serves:** `DEC-242` §1, §5 · `REQ-NTF-014` · `DEC-081`, `DEC-082`
The eight designed platform families in `packages/mail-runtime/src/designs.ts` are rebuilt to the visual direction
the app and the templates wear. They remain **constants, not rows**, so there is nothing to delete and no migration:
an org that has not touched its templates receives the rebuilt design, and an org that duplicated one to edit keeps
its own.
**Acceptance:**
- All 25 message keys still resolve to one of the eight families, and each still carries its own copy.
- Every block still has an `id`, a compiled HTML form and a generated text alternative; no block emits SVG.
- A row whose `blocks` is null is still an admin's own text, framed and never replaced by a design.
- The 120 pinned files move once, as one reviewed diff, and are stable on a re-run.

#### REQ-NTF-017 — The mail that announces a member's addition is transactional, not a matrix message
**Serves:** `DEC-243` §6 · ★ `DEC-244` §8 · `REQ-TEN-009` · `REQ-NTF-014`
A person an admin has added is told by email, in Arabic, with a link that signs them in. ★ **It is not one of the
notification matrix's messages and does not become a twenty-sixth key** — a twenty-sixth would move the matrix's
count, the designed families and all 120 pinned files, and **«you have been added» is not a message anybody may
switch off.** It is a transactional send on the test send's pattern, in the same designed language as the eight
families.
**Acceptance:**
- The matrix stays at 25 keys; the 120 pinned mail files are untouched by this feature.
- ★ The recipient's address is **not in the job's payload** — the payload names the member and the address is read in
  the worker, so a forged or replayed job can mail nobody else.
- The mail carries a generated text alternative and no SVG; the copy is authored in Arabic first.
- Re-sending is the same mail to the same address, and every send is in the delivery log with its reason.
- A member who has already signed in, or who has been deactivated, is sent nothing however the job is triggered.


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

#### REQ-DSC-008 — An admin manages the tag vocabulary
**Serves:** owner 2026-09-15 (ask 11) · `REQ-DSC-002`
An **مشرف المؤسسة** renames a **وسم**, **merges** near-duplicates into one, deletes an unused one,
and sees a **usage count** for each.
**Acceptance:**
- Merging moves every attachment and leaves no orphan; the surviving tag's count is the sum.
- A merge and a delete are audited.
- Usage counts are maintained by trigger, not computed per page load.

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
- Column headers are Arabic, and so are enum values; **numerals are Western** (`DEC-124`, which
  withdrew the org setting); **dates are `YYYY-MM-DD HH:mm` in the org's time zone, the zone named in
  the column header**, so a spreadsheet sorts them (`DEC-148`).

#### REQ-ADM-018 — Audit log
**Serves:** D60 · §6 security
An **immutable** log of admin and moderator actions, manual attendance marks, point adjustments,
role changes, impersonation, and content removals. **Scoring configuration changes** are recorded
with their old and new value in `scoring_config_history`, not `audit_log`, and are read on the
scoring screen (`DEC-148`, correcting this text to the schema).
**Acceptance:**
- The log is append-only; no role can update or delete a row (`REQ-NFR-006`).
- Entries are searchable by actor, subject, action and date range.
- Retained 7 years (OQ-019).

#### REQ-ADM-019 — Break-glass impersonation is visible to the org
**Serves:** DEC-014 · D3
See `REQ-ADM-002`.

#### REQ-ADM-020 — The moderator scope is enforced, not merely hidden
**Serves:** A1
A **مُنظِّم** reaches moderation queues, event-day operations, content removal and a session's
**استبانة** — its templates, attaching one, and its withheld results (`REQ-SUR-001`, `DEC-163`) — and
nothing else.
**Acceptance:**
- A moderator calling a settings, scoring, member-management or scheduling endpoint directly is
  rejected by policy.
- A moderator cannot see per-rater ratings (`REQ-RAT-005`).
- A moderator cannot export a survey's results: an export is an admin capability (`REQ-ADM-017`), and
  the route answers a moderator exactly as it answers a stranger (`DEC-163`).

#### REQ-ADM-021 — Staff may download session photographs, individually and as an album, audited
**Serves:** owner 2026-09-15 (ask 7) · DEC-076
Any viewer who may see a photograph may download **that** photograph. Staff may additionally
download **the album** — **«تنزيل الكل»** — produced by a background job that writes a zip to
storage and notifies when it is ready. **Every download is audited.**
**Acceptance:**
- An album download never runs inside a request; a 300-photo album does not block a function.
- The served file is the EXIF-stripped one, which is the only one a row points at (`REQ-EVT-011`; `DEC-182`: the raw upload shares its path until `process_photo` runs, so the served set is read from rows, never from a bucket listing).
- Each download writes an audit row naming the actor, the session and what was taken.

#### REQ-ADM-022 — A venue names the company that owns it
**Serves:** `DEC-230` §2 (the owner) · `REQ-ADM-006`
A venue may name **one company of the same org** as its owner, or none. Ownership is a property of the place, not of a
session held there; it answers `0081`'s objection to the link (`DEC-230` §2).
**Acceptance:**
- A venue can name only a company of its own org; the database refuses any other.
- A venue may name no company, and that is a valid, final state.
- Every change of a venue's company is audited (`REQ-ADM-023`).

#### REQ-ADM-023 — Every console mutation is answerable: who, when, what
**Serves:** `DEC-231` §4 · `REQ-ADM-018` · `REQ-NFR-006`
Every change the console can make writes a record naming the actor, the time and what changed: an `audit_log` row
through `write_audit()`, or — for scoring, recognition and org settings — a `scoring_config_history` row with the old
and new value (`DEC-148`).
**Acceptance:**
- Venues, categories and companies, report resolutions and survey templates — the six kinds that wrote nothing before
  `DEC-231` — write their rows from the database, so a direct write under the table's policy is covered too.
- No record is written twice, and none can be updated or deleted by any role.


#### REQ-ADM-024 — A company carries its domains, and changing them asks before it moves anyone
**Serves:** owner 2026-10-05 · `DEC-254` §2.7 · `REQ-PRF-012` · `REQ-ADM-023` · `09` `SCR-048`
The company form on `SCR-048` holds the company's domains as a list. Saving a change that would move members first
says **how many members move and to which شركة, and how many are left alone because an admin placed them**; nothing
moves until the admin confirms. Removing a domain unplaces nobody.
**Acceptance:**
- A domain is stored lowercase and refused if malformed or already on another شركة of the مؤسسة, with that reason.
- The confirmation's two numbers equal what the save then does.
- A save that moves nobody saves without asking.
- Adding and removing a domain, and each member moved by it, is answerable in the audit log (`REQ-ADM-023`).


#### REQ-ADM-025 — An admin writes an org announcement, schedules it, and every member is told when it goes live
**Serves:** owner 2026-10-06 · `DEC-267` · `REQ-UIX-056` · `REQ-NTF-002` · `09` `SCR-042`
On the admin's «create», **إعلان** stands beside the four event types (`REQ-SES-022`) and is **not a session**: it is an
org-wide announcement — its text, when it goes live (now or a date and time), and when it ends (optional). An
**مشرف المؤسسة** alone writes, edits and deletes one. When it goes live it appears in every member's home feed, and
every active member is notified once, in the app and by email, under the preference category **الإعلانات**, which a
member may switch off.
**Acceptance:**
- A scheduled announcement is invisible to members until its time, and gone after its end.
- It is sent once, at its time; moving the time before it is sent moves the send; editing it after it is sent never
  sends it again.
- A moderator and a member cannot write, edit or delete one; a member never sees a scheduled one.
- A member who switched الإعلانات off receives no notification on that channel.

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
★ **The faces, named** (`DEC-183`): the interface's display face is **Baloo Bhaijaan 2** (700, 800);
the baseline poster templates' Kufi face is **Reem Kufi**, as shipped in M6; certificates keep their
Naskh face. `REQ-UIX-029` says how the display face enters.
**Acceptance:**
- A component setting letter-spacing on Arabic text fails review.
- A text line clipping a diacritic is a defect, not a rendering quirk.

#### REQ-INT-006 — Numerals are Western everywhere, and there is no setting
**Serves:** owner 2026-09-16 · `DEC-124` (supersedes A30's numeral clause, `DEC-095`, `REQ-INT-010`)
Every digit the product renders, anywhere, is **Western — `0123456789`**. This holds in Arabic
strings, in the UI, in email and notifications, in posters and certificates, in CSV, ICS, filenames,
serials, verification codes and URLs. **There is no org setting, no member preference and no
platform override**; the `numeral_system` enum and `orgs.numerals` are dropped (`DEC-124`).
**Acceptance:**
- No surface renders `U+0660`–`U+0669` or `U+06F0`–`U+06F9`. A test greps `src/messages/**` and
  fails on either range — a digit typed into a translation string is the way this comes back.
- The canvas is **not** authoritative here: it uses Arabic-Indic digits on all 18 artboards and
  every one is an error to be read as Western (`DEC-124`).

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

#### REQ-INT-010 — Numerals follow the org setting for display only
**Serves:** DEC-095 · `REQ-INT-006`
Numerals follow the org's **نظام الأرقام** wherever a number is **read by a person**. **Inputs,
CSV exports, certificate serials, verification codes, URLs, filenames and every other
machine-readable surface are always Western (`nu-latn`)** — always, regardless of the setting.
**Acceptance:**
- A CSV export opens in Excel and Google Sheets with numeric columns parsed as numbers.
- A certificate serial printed on paper verifies against `/verify/[code]` character for character.
- No URL or filename ever contains an Arabic-Indic digit.

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

#### REQ-NFR-019 — The public site is a live contract: its URLs, its registration behaviour and its accessibility floor never regress (re-cut by DEC-167)
**Serves:** DEC-001 · A38 · `DEC-167`
`/`, `/ar`, `/en`, `/ar/register` and `/og.png` keep working through every milestone. Their **URLs,
their registration behaviour and their accessibility floor** may never regress. Their **appearance**
may change only through a `DECISIONS.md` entry and a re-baselined visual diff, in the same commit as
the change.
**Acceptance:**
- `scripts/qa.mjs`'s **contract half** (`qa:contract`) guards the behaviour in CI, blocking, at every
  commit; its **appearance half** (`qa:appearance`) is rewritten in the commit that changes the design.
- The register form's action, field names, validation and no-JS path are unchanged; `registrations`
  is never touched (`DEC-002`).
- `main` stays deployable at all times.

#### REQ-NFR-020 — Migrations are forward-only and safe against real rows
**Serves:** DEC-001 · DEC-002
**Acceptance:**
- No migration drops or alters `registrations` (DEC-002).
- Every migration is tested against a database seeded with production-shaped data before it runs
  against production.

---

## 23. Interface system — `UIX`

*Added by `DEC-070`. This area owns the design system, the shell, the loading and failure models,
the form model, the affordance rule, focus management and motion. `16-ui-redesign.md` specifies
how each is built; this file defines what must be true.*

#### REQ-UIX-001 — A shared component system is the only source of UI primitives
**Serves:** owner 2026-09-15 (ask 1) · DEC-069
Every control, surface, status and loading element in the product comes from
`src/components/ui/`. **No screen declares its own control styles.**
**Acceptance:**
- A lint gate fails CI when a file outside the system declares a control class string the system
  already owns, and when a `<form>` holds an `<input>` not wrapped in `<Field>`.
- A change to the focus ring is a one-file change.
- Every primitive has a jsdom test, an RTL check and an entry in the gallery route.

#### REQ-UIX-002 — One shell: search, catalogue, notifications, account — and a tab bar below `md`
**Serves:** owner 2026-09-15 (ask 1) · DEC-072 · DEC-098
The application has one shell: a persistent **search** entry, a **catalogue** entry, the
notification bell and an **account menu** — with staff destinations in a labelled section of it,
not distinguished only by font colour. Below `md` a **bottom tab bar** replaces the disclosure
list; it is **contextual** — hidden on detail and immersive screens, where a bottom **action** bar
carrying that screen's one primary action replaces it.
**Acceptance:**
- Search is reachable from every app screen without typing a URL.
- **No screen ever carries two fixed bottom bars**, and a test asserts it.
- `main` carries a `padding-block-end` that clears the bar, shipped in the same commit as the bar;
  no screen's last 64 px is covered.
- A moderator can find their queue from the shell.

#### REQ-UIX-003 — A session's lifecycle status looks the same on every surface that shows a session
**Serves:** owner 2026-09-15 (ask 6) · DEC-071 · DEC-073
One badge — colour, icon and word — renders a session's derived phase and seat state identically on
the browse card, the event page hero, `/app/me`, the calendar, the admin list, the host view, the
notification rows and the public card.
**Acceptance:**
- A `completed` session is visibly ended to a **member**, not only to staff.
- `cancelled` and `in_progress` carry chrome, colour and an icon — never bare text.
- The status colours are platform constants: an org's brand kit cannot restyle what «أُلغيت» means.
- Colour is never the only channel.

#### REQ-UIX-004 — Derived status governs which actions a session offers
**Serves:** owner 2026-09-15 (ask 4) · DEC-071 · DEC-090
What a session offers is computed from its stored state **and the clock**, not from stored state
alone. **A session past its end time offers no registration, no cancellation and no calendar
action** — it shows the outcome as a read-only fact.
**Acceptance:**
- A `published` session whose start has passed offers no «احجز مقعدًا», even while the clock job
  lags.
- A member holding a confirmed reservation on a `completed`, `archived`, `in_progress` or
  `cancelled` session is not offered a live cancel form.
- The derived phase is **total**: every combination of state and null schedule maps to exactly one
  phase, proven by a test.

#### REQ-UIX-005 — Every route has a loading state shaped like its content
**Serves:** owner 2026-09-15 (ask 1)
Every meaningful route boundary has a `loading.tsx` whose skeleton has the **shape** of the page it
replaces. A skeleton renders no text, is `aria-hidden` and is direction-agnostic.
**Acceptance:**
- A coverage gate fails CI when a segment declaring a `page.tsx` has no loading state **at or
  above** it.
- No skeleton calls `getTranslations` — it renders before `setRequestLocale`.
- Navigation to a dynamic route is prefetched and immediate, not blocked on the server round trip.

#### REQ-UIX-006 — Navigation shows progress; no interaction leaves the interface apparently idle
**Serves:** owner 2026-09-15 (ask 1)
A navigation shows an inline pending affordance on the link that started it and, when it has been
pending for more than ~150 ms, a progress bar in the shell. The branded splash appears **once**, on
the first paint of a cold load, and never on an in-app navigation.
**Acceptance:**
- The bar does not flash on a navigation that resolves faster than the threshold.
- The splash is a cross-fade over content that is already there, never a gate in front of content
  that is not; if it costs LCP against `REQ-NFR-008`, the splash is dropped, not the budget.

#### REQ-UIX-007 — Every action control has a pending state that preserves its label
**Serves:** owner 2026-09-15 (ask 1)
A control that is working keeps its label, gains a spinner beside it, is `aria-busy` and cannot be
submitted twice. Optimistic updates are used **only where the outcome is not contended** — bookmark
and reaction, **never** a reservation.
**Acceptance:**
- No control blanks its label while pending.
- A seat is never optimistically confirmed and then revoked on a capacity race.

#### REQ-UIX-008 — Selecting a member is a searchable, keyboard-navigable combobox wherever it occurs
**Serves:** owner 2026-09-15 (ask 2)
Every place a member is chosen — co-presenters on a proposal, the scoring adjustment picker, any
future one — uses one combobox: type-ahead, **Arabic-normalised matching** (`REQ-DSC-004`),
single or multiple selection, full ARIA 1.2 keyboard support.
**Acceptance:**
- No screen renders every org member as a checkbox list.
- It is usable at 400 members.
- A name typed with different Arabic orthography matches.

#### REQ-UIX-009 — A failed submission is summarised above the form, focused, with one link per failed field
**Serves:** owner 2026-09-15 (ask 5)
On a failed submit, a summary appears above the form, receives focus, is announced, and lists
**every** failed field as **a link to that field's control**.
**Acceptance:**
- Activating a summary item moves focus to the named control — and the control is **not** left
  behind a sticky header (`REQ-UIX-017`).
- Every form in the product has one; the pattern is not unique to one screen.

#### REQ-UIX-010 — Field errors are adjacent, coloured, icon-marked and never colour-alone
**Serves:** owner 2026-09-15 (ask 5) · `REQ-NFR-007`
An error sits next to its control, in the error colour, with an icon and a 1 px error border.
**Acceptance:**
- No error renders in the heading colour with no icon and no marker.
- Removing colour leaves the error still identifiable.
- `aria-invalid` and `aria-describedby` are wired by the field wrapper, not by the screen.

#### REQ-UIX-011 — Required fields are positively marked; a failed submission never loses typed values
**Serves:** owner 2026-09-15 (ask 5)
Required is marked with the word **«مطلوب»** on the label — not by an asterisk, which collides with
the RTL run, and not by the absence of «اختياري». Every value the member typed survives a failed
round trip. Inline validation runs on blur **after the first submit attempt only**.
**Acceptance:**
- A failed submit re-renders with every field still holding what was typed.
- A field is never marked invalid before the member has tried to submit.

#### REQ-UIX-012 — Every list has an empty state that names the next action
**Serves:** owner 2026-09-15 (ask 1) · D60
No list, table, rail or result set ever renders as blank space. An empty state says what is missing
and links to what to do about it; a filtered-empty state names the filter that emptied it and
offers to drop just that one.
**Acceptance:**
- Every list surface has an empty state, and it is in the gallery.
- No empty state is a dead end.

#### REQ-UIX-013 — Every destructive action confirms in a dialog naming the object
**Serves:** `REQ-NFR-007` · D60
A destructive or irreversible action confirms in a house dialog that **names the object** and
states the consequence — never a browser `confirm()`, never a hint above a link.
**Acceptance:**
- Detaching a poster, deleting a tag, issuing certificates and removing a member each confirm by
  name.
- The consequence is stated **before** the click, not after.

#### REQ-UIX-014 — Motion respects `prefers-reduced-motion` globally, by token
**Serves:** `REQ-NFR-007` · DEC-100
Duration and easing are tokens, and every duration collapses to `0ms` under
`prefers-reduced-motion: reduce`, declared **once**, globally. **Collapsing a duration is not a
reduced-motion design:** each orchestrated moment additionally names its own static end state.
**Acceptance:**
- No component declares its own duration.
- Under reduced motion every animated surface reaches its end state and nothing is mid-transition.

#### REQ-UIX-015 — An affordance is rendered only when the viewer's relation permits the action
**Serves:** owner 2026-09-15 (ask 4) · DEC-090 · DEC-092
An affordance is rendered only when the **viewer's relation to the object** permits the action it
offers, and **a derived display state may only ever be more conservative than the stored state,
never less**. A slot that can render nothing has **its `<section>` and heading gated with it** —
the page owns the landmark, so the page owns the condition. RLS and the RPCs remain authoritative;
a hidden control is a courtesy.
**Acceptance:**
- No viewer is offered an action the database will refuse.
- Calendar, tasks, check-in, the host view and the staff links each carry a relation **and** a phase
  condition.
- An empty slot renders no heading, proven by one component test per slot.
- The derived phase never adds an affordance the stored state would not permit, proven for every
  phase pair.

#### REQ-CHK-017 — An admin can edit the attendance list at any time, including removing a record
**Serves:** owner 2026-09-16 · DEC-116
An **مشرف المؤسسة** — not a moderator, not a presenter — may add to and **remove from** a session's
checked-in list at any time, with a mandatory reason. `REQ-CHK-008` already covers adding; removal
is what makes an open-by-default switch safe, because anything the door lets through can be
corrected by the one role accountable for the org's records.
**Acceptance:**
- Every add and every removal is audited with the actor, the member, the reason and the time.
- A removal is a deliberate act on one member — never a side effect of closing check-in
  (`DEC-115`), and never a bulk operation without naming each member.
- ★★ **Removal reverses what attendance granted, and it cannot do so by deleting rows.**
  `points_ledger` is append-only with `service_role` revoked (`REQ-PTS-011`, invariant 9), so a
  removal that leaves the award standing is a silent inconsistency and a delete is impossible by
  design. The reversal is a **compensating ledger entry** with its own idempotency key and reason.
  A certificate already issued carries a gapless serial (`REQ-CRT-004`) and is **revoked**, not
  un-issued.
- The member sees the outcome honestly: their «حضرت» becomes «لم تُسجّل حضورك», and their points
  history shows the reversal as an entry rather than a number that quietly changed.

#### REQ-CHK-018 — Check-in says what the member has earned and when it arrives
**Serves:** owner 2026-09-22 · DEC-172
The member who checks in is told, at once, what they have earned and that it arrives when the
session ends. This replaces the feedback the ledger row used to give when a one-day session paid at
check-in (`REQ-PTS-015`), and it is the base a later gamification layer builds on.
**Acceptance:**
- It is a **state the screen reads from the data**, not a message fired once. A reload, or opening
  the event page later, shows the same thing.
- It distinguishes nothing earned, pending (with the amount, and for a multi-day session the days
  attended out of the days required), paid, and not earned because a day was missed.
- The amount shown is the one the completion pass will write, computed from the same rules — never
  a separate stored figure.

#### REQ-UIX-021 — The member's landing screen is the sessions timeline
**Serves:** owner 2026-09-15 · DEC-112
`/app` renders **the sessions a member can attend**, as a single scrollable timeline grouped by
date — not a dashboard of links and not a grid of rails. The member's next committed session is the
first item of that timeline, not a separate hero above it.
**Acceptance:**
- A member lands on something they can act on, without a second navigation.
- There is one column: nothing competes with the list for horizontal space.
- A session's state is legible while scrolling, without stopping to read (`REQ-UIX-003`).
- The empty case is the same screen with an invitation to propose, never a different page.

#### REQ-UIX-022 — Filters belong to the timeline, and their state is always visible
**Serves:** owner 2026-09-15 · DEC-112 · `REQ-DSC-005`
Filtering is part of the list, not a rail beside it. The active set is visible at all times,
each filter is individually removable, and the whole set is clearable in one action. Below `md`
the control set opens as a sheet rather than pushing the list sideways.
**Acceptance:**
- A member can tell what they are filtered to without opening anything.
- Removing one filter never clears the others.
- The filtered-empty state names the filter that emptied it and offers to drop just that one
  (`REQ-UIX-012`).

#### REQ-UIX-023 — A disclosure closes when it has been used
**Serves:** owner 2026-09-15 · DEC-111
Any menu, dropdown or disclosure in the shell closes when the member follows a link inside it,
clicks outside it, or presses `Escape`; and no two are open at once.
**Acceptance:**
- Following a link inside a menu leaves no panel over the destination — asserted by a test, because
  under Partial Rendering the layout does not re-render and the panel survives the navigation.
- `Escape` returns focus to the control that opened the panel.

#### REQ-UIX-024 — The discussion is a composition surface, not a comment log
**Serves:** owner 2026-09-15 · DEC-110 · `REQ-EVT-001` … `REQ-EVT-008`
The discussion on a session supports real composition and real feedback: an editing affordance
rather than a bare textarea, visible upload controls rather than a hidden input, a reaction whose
acknowledgement is felt, and a pending, success and failure state on every action.
**Acceptance:**
- Every action shows it is working, and says so if it fails (`REQ-UIX-007`, `REQ-UIX-010`).
- The upload control states what it accepts and how large before a file is chosen
  (`REQ-MAT-008`); the server still sniffs the bytes and still refuses SVG.
- The reaction is a whisper, not a celebration: `REQ-EVT-004` earns no points, so nothing about it
  should read as an achievement (`REQ-UIX-018`).

#### REQ-UIX-016 — Every route boundary with a loading state has an error boundary
**Serves:** DEC-091
Every boundary with a `loading.tsx` has an `error.tsx` rendering a shared body: what happened in one
sentence, a **retry**, and a way back. Every **dynamic** segment has a `not-found.tsx`. The root
error page — the one file with no translation provider and no `<html lang>` above it — is
**Arabic and `dir="rtl"` by construction**.
**Acceptance:**
- A coverage gate fails CI on a boundary with a skeleton and no error boundary.
- `global-error.tsx` exists and contains `dir="rtl"`.
- No error surface shows a stack trace, and none shows an error code as its headline.
- No member ever sees Next's default English left-to-right error page.

#### REQ-UIX-017 — A skip link precedes the shell, and nothing fixed may obscure the focused element
**Serves:** `SC 2.4.1`, `SC 2.4.11` · DEC-091 · `REQ-NFR-007`
The **first focusable element** in the shell is a skip link to `<main>`, visually hidden until
focused; console pages carry a second skip past the rail. Scroll padding and scroll margin are
derived from the height of the fixed layers, so **no sticky or fixed element ever covers the
focused element**.
**Acceptance:**
- Tabbing every focusable element on the event page and the proposal form, at 390 px and at desktop,
  never leaves the focused element intersected by a fixed or sticky element.
- An anchor jump lands its target below the sticky header, not behind it.
- At most one fixed bottom bar per screen.

#### REQ-UIX-018 — Celebratory motion uses the playground's vocabulary: objects, stickers and one burst of confetti (re-cut by DEC-183)
**Serves:** owner 2026-09-28 · `DEC-183` (which reverses `DEC-100`)
Celebration in the app is physical: a coin that drops, a ticket that rises, a stamp that lands, a
card that flips, and a confetti burst on a check-in. A sticker may overshoot to **1.08** and nothing
else overshoots. **No motion library is added** — confetti is `element.animate()`. **Nothing scales
on hover.** Attendance lists, moderation, exports, the audit log, survey results, admin tables and
**every error state** do not animate.
**Acceptance:**
- No animation dependency appears in `package.json`.
- A failure never animates.
- Outside the five moments of `REQ-UIX-019`, motion is an acknowledgement of 220–260 ms and no more.
- ★ The public site keeps the dot-and-line vocabulary and its keyframes until its own wave
  (`REQ-NFR-019`); nothing of `DEC-100`'s was built in the app, so nothing is removed.

#### REQ-UIX-019 — Five moments are orchestrated, and each names its static state (re-cut by DEC-183)
**Serves:** owner 2026-09-28 · `DEC-183` (which reverses `DEC-100`)
Exactly **five** moments are orchestrated rather than acknowledged — **الحجز** (a reservation
confirmed, `SCR-012`), **تسجيل الحضور** (a check-in accepted, `SCR-014`), **انتهت الجلسة** (the
session completed and paid, `SCR-022`), **ترقية المستوى** (a level reached) and **تغيّر الترتيب** (a
rank change, `SCR-027`, `SCR-028`). Each plays once per occurrence, never on a re-render, and each
has a **named static state** under reduced motion that is a complete experience.
**Acceptance:**
- None replays on a re-render or on a back navigation.
- Every static state is reviewed at 390 px alongside the animated one.
- The amount a moment shows is computed, never stored, and a check-in says the points arrive when
  the session ends (`REQ-CHK-018`, `REQ-PTS-015`).
- A row that falls in rank gets no colour and no shake.

#### REQ-UIX-020 — Animation touches only transform, opacity and filter, and holds 60 fps
**Serves:** `REQ-NFR-008` · DEC-100
No animation touches `width`, `height`, `top` or `margin`; a height change animates
`grid-template-rows`. No `will-change` is left on after an animation ends.
**Acceptance:**
- A lint rule fails a `@keyframes` block touching anything but `transform`, `opacity` or `filter`,
  with a documented escape hatch.
- The two orchestrated moments traced on a throttled CPU profile show **no frame over 16 ms**.


#### REQ-UIX-025 — The public site has a visible way into the platform, and says the platform exists
**Serves:** owner 2026-09-16 · `DEC-126` · A38
The marketing site carries a **persistent, visible «تسجيل الدخول»** into `SCR-002`, and its content
tells a visitor that the platform exists and what it is for. Today neither is true: the header and
both CTAs point only at `/register`, so a member with an account must type `/sign-in` by hand.
**Lands in M13**, the only milestone permitted to touch the frozen routes (`REQ-NFR-019`).
**Acceptance:**
- «تسجيل الدخول» is reachable from every marketing page, on phone and desktop, without scrolling
  to the footer.
- It is **visually distinct from «سجّل اهتمامك»** and never replaces it — the interest list and the
  sign-in door are different things (`DEC-002`, invariant 2).
- Nothing is added to the marketing header before M13; `npm run qa` stays 44/44 and the visual
  baseline is re-cut in the same commit as the rebuild, never before it.

#### REQ-UIX-026 — A poster is shown whole wherever it appears
**Serves:** owner 2026-09-22 · DEC-172
A poster is a designed artefact whose typography is the point. **No surface crops it.** Where the
space given to a poster does not match its aspect, the space around it is left empty rather than
the poster being cut.
**Acceptance:**
- At 390 px and at desktop width, the timeline card, the event page, the public card and every
  other surface showing a poster show its full width and height.
- Each surface's media aspect is chosen deliberately and written down. A surface that shows a
  photo rather than a poster says whether it may crop, and why.

#### REQ-UIX-027 — Inside the platform, the wordmark leads to the platform's home
**Serves:** owner 2026-09-27 · DEC-180
On every screen under `/app`, the wordmark in the header links to `/app`, the member's home. On the
public site, `(auth)` and `legal` it keeps linking to `/`.
**Acceptance:**
- The change is additive: `qa:contract` and the visual baseline of the public routes do **not**
  move. They are not re-baselined (invariant 1, `DEC-167`).

### The playground — the visual direction's foundation (`DEC-183`, M17)

*`docs/design/` is the visual specification; where it disagrees with this file or with
`DECISIONS.md`, they win (`DEC-183` §4). These sixteen are the foundation only: **no screen adopts
any of it in M17**. The requirements for the five moments' screens, stories, the timeline's new
items, proposal voting, the weekly leaderboard and the streak rule are written by the wave that
builds each.*

#### REQ-UIX-028 — The playground is a scope: its tokens are added, and no existing token is redefined
**Serves:** owner 2026-09-28 · `DEC-183` §4.2 · `REQ-NFR-019`
The direction's palette, radii, type scale and motion tokens are added to `globals.css` **beside**
the tokens that exist. Its semantic layer — ground, surface, raised, text, muted, line, accent,
signal — lives on a **scope class** with a light variant, never on `:root`. Outside the scope every
semantic name resolves to the value it has today.
**Acceptance:**
- No token that existed before M17 changes its name or its value, and none is removed.
- `qa:contract` is green at every commit; `qa:appearance` and the visual baseline of the public
  routes are **unchanged, not re-baselined**.
- A 390 px capture of `/app` taken before the token commit and one taken after are the same picture.
- The `@theme inline` block stays `inline`; the four new durations collapse to `0ms` in the one
  reduced-motion block (`REQ-UIX-014`).
- The status colours stay platform constants, outside the scope's remap and outside the brand kit
  (`REQ-UIX-003`).

#### REQ-UIX-029 — The display face is Baloo Bhaijaan 2, and it enters by the door every face enters
**Serves:** `DEC-183` §4.4, §4.5 · `REQ-INT-005` · `REQ-INT-009` · `REQ-DSG-016`
The interface's display face — headings inside the scope, big numbers, labels on a primary action,
stickers — is Baloo Bhaijaan 2 at 700 and 800. It is declared in `src/lib/fonts.ts`, pinned into
`packages/fonts` by SHA-256, derived to TTF for the worker, and held by `fonts:check`.
**Acceptance:**
- No production font loads from a third-party origin; `font-src` stays `'self'`.
- ★ After extraction **and** after derivation the face still carries `rlig`, `mark` and `mkmk`, and
  a lam-alef carrying tashkeel is rendered and looked at — never a Latin smoke test alone.
- One font set, identical by SHA-256 in the app, the worker's Chromium and the worker's poppler
  (invariant 12); a face present in one place and absent in another fails CI.
- The baseline poster templates keep Reem Kufi, and no parity golden moves.
- The public routes do not preload the face and do not pay for it.

#### REQ-UIX-030 — Every existing primitive reads the scope's semantic tokens, and is unchanged outside it
**Serves:** `DEC-183` §4.2, §4.17 · `REQ-UIX-001`
Each of the 37 primitives is migrated by its owner, one commit each: inside the scope it takes the
playground's look; outside it, it renders as it does today. No primitive gains or loses a behaviour
in M17 — a structural change is an opt-in prop.
**Acceptance:**
- No hex and no duration is declared in a primitive.
- Each migration carries a gallery capture at 390 px and at desktop width, inside the scope.
- The console's data-dense primitives — the table, the reorderable list, the file drop — take tokens
  and **no animation**.
- The focus ring is visible at 3:1 on the scope's ground, and every target is at least 44 px
  (`REQ-NFR-007`, `REQ-NFR-009`).

#### REQ-UIX-031 — The sticker is decoration, and never a status
**Serves:** `DEC-183` · `docs/design/04-components.md`
A die-cut pill in the display face, rotated within ±6°, with a rim drawn from the ground it sits on.
It carries celebration — «محجوز», «مستوى جديد» — on `SCR-012` and wherever a poster is shown.
**Acceptance:**
- It is `aria-hidden` unless it carries something no badge on the surface carries.
- A session's lifecycle status is never drawn as a sticker (`REQ-UIX-003`).
- Its fill comes from the allowed set by name; the component holds no hex.

#### REQ-UIX-032 — The poster block shows the rendered poster whole, and a designed placeholder until there is one
**Serves:** `DEC-183` · `REQ-UIX-026` · `REQ-DSG-023`
The card-level poster on `SCR-010`, `SCR-011` and `SCR-012`: where a rendered poster exists it is
shown whole; until it does, a block in the company's team colour carries the category, the title in
the display face and the date.
**Acceptance:**
- A rendered poster is never cropped (`REQ-UIX-026`).
- The placeholder's title balances its lines and is never clipped on a text line.
- The team colour arrives as `--team` on the element, paired with the company's name — colour is
  never the only channel.

#### REQ-UIX-033 — One control carries a session's primary action, in six states
**Serves:** `DEC-183` · `REQ-SES-013` · `REQ-UIX-004` · `REQ-UIX-007` · `REQ-UIX-015`
`SCR-012`'s and `SCR-014`'s primary action is one control: reserve, join the waitlist, booked (with
cancel beneath it), check in, attended, and none — with the reason.
**Acceptance:**
- Every state renders from props; the primitive decides nothing. Which state a viewer gets stays
  the affordance matrix's answer (`REQ-UIX-015`).
- A state that offers nothing says why, in words, and is never a greyed control with no reason.
- Pending keeps the label, and a seat is never shown as confirmed before the server says so.
- The capacity it shows is in Western digits, isolated in `<bdi>`.

#### REQ-UIX-034 — The reaction bar acknowledges, and never celebrates
**Serves:** `DEC-183` · `REQ-EVT-004` · `REQ-UIX-024`
A like and four house reactions, each with its count, on `SCR-012`.
**Acceptance:**
- Each control has an accessible name and a pressed state; a count changes in place.
- The acknowledgement is the **pressed state, shown in place**: a reaction earns no points, so
  nothing about it reads as an achievement. Whether it also pops is decided with the moments
  (`DEC-186` §4).
- Pressed is never colour alone: the glyph fills.

#### REQ-UIX-035 — The check-in code is entered in six boxes that read left to right inside an Arabic page
**Serves:** `DEC-183` · `REQ-CHK-003` · `REQ-INT-007`
`SCR-014`'s code entry: six boxes in a `dir="ltr"` group.
**Acceptance:**
- Pasting a whole code fills the boxes; autocorrect and autocapitalise are off; the input mode
  matches the code's alphabet.
- The group has one accessible name, each box its position, and an error is tied to the group by
  `aria-describedby`.
- A wrong code does not animate (`REQ-UIX-018`).

#### REQ-UIX-036 — A progress bar grows by transform, from the inline start
**Serves:** `DEC-183` · `REQ-UIX-020`
One track and one fill, used by the level on `SCR-022`, the companies race on `SCR-028` and a
story's segments on `SCR-010`.
**Acceptance:**
- The fill is `scaleX`, never `width`, and its origin is the inline start in both directions.
- It has an accessible name and a value in Western digits.

#### REQ-UIX-037 — A leaderboard row never shames
**Serves:** `DEC-183` §3 (`DEC-NEXT-8`) · `REQ-LDR-001` · `REQ-LDR-008` · `DEC-099`
A row on `SCR-027`: the rank in the display face, the **initials** avatar in its team ring, the
name and company, the points, and a marker when the rank rose.
**Acceptance:**
- A row carries initials and never a photograph (`DEC-099`).
- A row whose rank fell carries no colour, no icon and no motion.
- The viewer's own row is outlined, and says it is theirs in words.

#### REQ-UIX-038 — A race bar shows a company by its colour and its name together
**Serves:** `DEC-183` · `REQ-LDR-004`
A company's bar on `SCR-028` and on `SCR-010`: the team ring, the name, the bar and the value.
**Acceptance:**
- The colour is never the only thing that says which company it is.
- The value shown is the ranking metric the org chose, and it is marked (`REQ-LDR-005`).

#### REQ-UIX-039 — The level card has two faces, and both can be read without the flip
**Serves:** `DEC-183` · `REQ-REC-004`
On `SCR-022`: the current level and what it unlocks, and — when a level has just been reached — the
new level and what it unlocks.
**Acceptance:**
- A face lists the privileges the org has **enabled** at that level, by name, and says plainly when
  there are none. It never names a privilege the member does not have (`DEC-186` §7: in a default
  org no level grants one, and `REQ-REC-004`'s promise is the owner's to keep or amend).
- Which face is shown is a prop. With reduced motion the new face is simply shown.
- Both faces are reachable by a screen reader in either state.

#### REQ-UIX-040 — A story ring has four states, told apart without colour
**Serves:** `DEC-183` §3 (`DEC-NEXT-14`) · `REQ-NFR-007`
The ring that will open a session's story from `SCR-010`: live, upcoming, recap and seen.
**Acceptance:**
- Each state differs in its label as well as in its colour.
- The live ring reads as live by its word and its double ring, with no motion (`DEC-186` §4).
- It is a button with an accessible name that names the session; its target is at least 44 px.

#### REQ-UIX-041 — The house glyph set grows by hand
**Serves:** `DEC-183` §4.7 · `DEC-079` · `DEC-106`
Nine glyphs join `ui/icons.tsx` — flame, trophy, compass, ticket, coin, bolt, camera,
calendar-check, pause — drawn to the house shape. They serve `SCR-010`, `SCR-012`, `SCR-014`,
`SCR-022` and `SCR-027`.
**Acceptance:**
- No icon dependency appears in `package.json`.
- A glyph that already exists in the house set is not drawn twice.
- A glyph that points mirrors by the reading direction; the rest never mirror.
- Every glyph is in the gallery at 16, 20 and 24 px.

#### REQ-UIX-042 — The six objects and the wordmark are the platform's own, and nothing of them loads from elsewhere
**Serves:** `DEC-183` §4.8 – §4.10, §4.14 · `REQ-DSG-018` · `DEC-009`
Coin, cup, flame, ticket, star badge and rocket are available to the interface — inline SVG where
an object will animate, an image with a `srcset` elsewhere — for `SCR-012`, `SCR-014`, `SCR-022` and
`SCR-028`. The Arabic wordmark is a component drawn from outlines, so it needs no font.
**Acceptance:**
- No SVG reaches the designer or an `<img>` served from user storage; a poster layer is a raster
  (invariant 11).
- An object is decorative: `aria-hidden`, with the meaning carried by the text beside it.
- A number drawn on an object is the computed one, or there is none (`REQ-CHK-018`).
- The public routes' icon and wordmark do not change in M17.

#### REQ-UIX-043 — A company has a team colour, and it rings a member — it never fills the avatar
**Serves:** `DEC-183` §3 (`DEC-NEXT-4`), §4.11 · `REQ-PRF-009` · `REQ-ADM-008`
Each **شركة** may carry a team colour, chosen by an **مشرف المؤسسة** on `SCR-048`. It reaches an
element as the CSS variable `--team`.
**Acceptance:**
- The column is nullable and additive; a company with none renders with a neutral ring.
- The value is `#rrggbb` and nothing else, refused by the database for every writer.
- The avatar's fill stays one of the six tints keyed to the member id, and never encodes the
  company (`REQ-PRF-009`).
- A change is audited, naming the company, the old colour and the new one.
- No migration writes a colour onto a company.
- ★ The colour is chosen **when the company is created**, on the add form, with the same named-colour picker as
  the edit path — the named colours and «بلا لون», never a hex field — and the insert carries it (`DEC-195` §3).
- ★★ **A company has no logo** (`DEC-195` §4): a name, a team colour, and active-or-deactivated is the whole
  entity. The colour is the company's identity; a logo beside the ring would be a second one.

#### REQ-UIX-044 — A moment plays once per occurrence, from one shared mechanism, and never on a re-render
**Serves:** `DEC-195` §2 · `DEC-183` §2 · `REQ-UIX-014` · `REQ-UIX-019` · `REQ-UIX-020`
The five moments share one mechanism, owned in one place: a confetti utility on `element.animate()`, a count-up that
writes text through the repository's numeral formatter, and a keying that ties a moment to its **occurrence** — a
reservation, a check-in, a ledger row, a level, a rank — and never to a render. A reservation and a check-in play
from the result of the action the member just took, in the client that took it; the other three play at the first
sight of their occurrence. Only the surfaces `DEC-195` §1.1 names wear the playground — `SCR-012`'s action
card, `SCR-014`, the head of `SCR-022`, `SCR-027` and `SCR-028`.
**Acceptance:**
- Mounting a moment, letting it play, unmounting and mounting it again with the same occurrence plays nothing.
- A reload or a back navigation after a reservation or a check-in shows the static state, never the animation.
- Under reduced motion the confetti utility returns at once and the count-up sets its final value at once; every
  moment renders its named static state, which is a complete experience.
- Confetti's colours are the member's team colour with lime and bone, or lime and bone alone when the company has
  none; the layer is `aria-hidden`, takes no pointer events, and leaves no node behind.
- No `will-change` survives a moment; no animation dependency is added.
- The five public routes do not move: `qa:contract`, `visual`'s public pairs and the register form's fingerprint
  are unchanged (`REQ-NFR-019`).

#### REQ-UIX-045 — الحجز: a confirmed reservation raises a ticket and lands a stamp on the event page's action card
**Serves:** `DEC-195` §1.1 · `REQ-UIX-019` · `REQ-UIX-007` · `REQ-RSV-001`
When the reserve action resolves `confirmed` — never optimistically — a ticket rises from behind the action, the
stamp «محجوز» lands on it without overshoot, the card settles, the capacity updates in place, and the action becomes
its booked state with «ألغِ حجزي» beneath it; the calendar whisper follows. A waitlisted result plays the same ticket
with «قائمة الانتظار · N», in the waitlist's status tone (`DEC-073`), never a company's colour.
**Acceptance:**
- The static state — the booked action, the capacity updated, the whisper shown without motion — is complete, and is
  what every later visit shows.
- A refused reservation does not animate.
- Only the action card moves; the hero, the sub-nav and every section of `SCR-012` are unchanged.
- The gating is unchanged: the affordance matrix decides which state a viewer gets (`REQ-UIX-015`).

#### REQ-UIX-046 — تسجيل الحضور: an accepted check-in bursts, drops the coin, and tells the truth about the points
**Serves:** `DEC-195` §1.1, §2.4, §2.5 · `REQ-UIX-019` · `REQ-CHK-018` · `REQ-PTS-015` · `REQ-UIX-035`
When the check-in succeeds, confetti bursts, the coin drops and settles, and three lines appear: «أنت هنا!», the
amount the session pays and that it **arrives when the session ends**, and the time. The amount is the computed
pending figure, never stored and never a constant; when nothing is earned the coin carries no number. The screen then
returns to the event page, whose action reads «حضرت».
**Acceptance:**
- The static state — the coin at rest and the three lines, no particles — is complete.
- ★ A mistyped code shakes the boxes once — input feedback (`DEC-212`); under reduced motion it is the coral border and
  the message alone. Every other refusal does not animate.
- The code is entered in `code-input`: each box named, the refusal tied to the group, the posted field and the no-JS
  path unchanged.
- A checked-in member is not offered the check-in link again during the session.
- A trace on a throttled CPU shows no frame over 16 ms, as it does for `REQ-UIX-045`.
- ★ **After a hold of 1.4 s the screen returns to the event page on its own**, as `03-motion.md` specifies. This is a
  **recorded exception to SC 2.2.1** (`DEC-197` §1): found by `checkin`, kept by the owner, scoped to this one moment
  and nothing else. `REQ-NFR-007` stands for everything else.

#### REQ-UIX-047 — انتهت الجلسة and ترقية المستوى: the points screen counts up, the flame grows, and a level turns over
**Serves:** `DEC-195` §1.1, §2.2 · `REQ-UIX-019` · `REQ-UIX-039` · `REQ-PTS-015` · `REQ-REC-004`
The first time a member sees ledger rows a completion pass wrote, the head of `SCR-022` counts the balance up from the
old figure to the new with the delta beside it, the streak flame grows and keeps its flicker, and the level bar fills.
When a threshold was crossed, the level card turns over to its new face with one shine, and that face names what the
level unlocks — or says plainly that it unlocks nothing. It plays for the ledger rows a **completion pass** wrote, and for no
other gain (`DEC-197` §7).
**Acceptance:**
- The static states — the new balance with its delta, the flame at its larger size without flicker, **the bar at the
  member's true progress** (full only when a threshold was crossed, `DEC-197` §7); the new face shown with no shine —
  are complete.
- On a page the server painted, the moment does not jump back: it stays static and plays at the next arrival by the
  app's own navigation (`DEC-197` §5).
- The same rows seen again, on the same device or another, play nothing.
- The history and the catalogue below do not animate.
- Bars grow by `scaleX`, never `width`.

#### REQ-UIX-048 — تغيّر الترتيب: a rank change swaps two rows, and the falling row is never shamed
**Serves:** `DEC-195` §1.1, §2.6 · `REQ-UIX-019` · `REQ-UIX-037` · `REQ-UIX-038` · `REQ-LDR-004`
When a member opens a board on which their rank has changed since they last saw it, their row and the one it passed
swap places, and the risen row's arrow is shown — **it does not pulse** (`DEC-197` §2). On the company board a bar moves by `scaleX` from the inline
start. What the member last saw is recorded, so the change is real and is shown once.
**Acceptance:**
- The static state — the new order, the arrow shown — is complete.
- The falling row carries no colour, no icon, no shake and no motion of its own beyond the swap.
- A board opened again with no change plays nothing.
- Rows are initials in a team ring, never a photograph (`DEC-099`, `DEC-183` §3).

#### REQ-UIX-049 — «ساحة اللعب» is the product's only visual language, and a screen is rebuilt to its design, never restyled
**Serves:** `DEC-199` §1, §2 · `DEC-183` §1 · `REQ-UIX-028` · `REQ-NFR-019`
Every surface that is not one of the five public routes renders inside the playground's scope, applied once, at the
root of its layout: the platform shell with every member, staff and platform screen under it, the three `(auth)`
screens, the legal pages, the public session card and the certificate's verification page. No screen keeps the old
look and nothing carries a path back to it. The public site is in scope and moves in the programme's last wave;
until then it keeps today's values. Entering the scope gives a screen one palette, one type and one set of
primitives — **it is not the screen's redesign**: each screen is rebuilt from its own document,
`docs/design/screens/<SCR-id>.md`, in its own wave.
**Acceptance:**
- The scope is rendered by a layout, never by a screen or a component, and scopes do not nest.
- No file outside the public site's carries a raw palette class or `.theme-dark`.
- The toast region and every portal land inside the scope.
- The five public routes do not move: `qa:contract`, `qa:appearance`, `visual`'s public pairs and the register
  form's fingerprint are unchanged and not re-baselined, and no file they import names the scope (`REQ-NFR-019`).
- `registrations` is never dropped, altered or read; the register form's action, field names, ids, validation and
  no-JS path are byte-identical.
- An org's brand kit restyles posters, certificates and mail, and not the app (`DEC-199` §1.3).
- The accessibility sweep finds nothing on any route inside the scope (`REQ-NFR-007`).

#### REQ-UIX-050 — Every primitive has a playground design, and a gate enumerates the directory
**Serves:** `DEC-199` §3, §4 · `REQ-UIX-001` · `REQ-UIX-030`
A test reads `src/components/ui/` itself — never a list of names — and fails on any file that has no declared
playground treatment, no test that renders it inside the scope, or no gallery entry.
**Acceptance:**
- Every `.tsx` file in the directory has exactly one registry entry, and every entry a file.
- An entry's declared treatment is checked against the source: a variant is present, or the file reads semantic
  names only, or it composes primitives that themselves pass, or it renders no pixel and says why.
- A new primitive added with no entry, no scope test or no demo fails the build.
- The registry has no «pending» kind; an exemption is a visible diff with its reason.

#### REQ-UIX-051 — The page header, the section header, prose, the link, the icon button, the submit button and the reorderable list wear the playground
**Serves:** `DEC-199` §3, §5 · `REQ-UIX-001` · `REQ-UIX-029` · `REQ-INT-005` · `REQ-UIX-007`
The seven primitives the design's task list never named take their design from the documents that do speak: a
page's title and a section's heading are the display face; body text, a breadcrumb, a description and a link are the
body face; an icon button and a submit button are the button, in its faces; the reorderable list takes tokens and
no animation.
**Acceptance:**
- Each has a test that renders it inside the scope, an RTL check and a gallery entry at 390 px and desktop.
- A page's `h1` and a section's `h2` are set in the display face; `h3` and below in the body face.
- A link is told from text by its underline and never by the accent alone.
- An icon button's target is at least 44 px at its default size and its name is on the element — `sm`, for dense
  rows, stays 36 px and adds nothing that overflows its box; a submit button keeps its label while pending.
- The reorderable list keeps its buttons as the conforming path (`DEC-093`) and does not animate.
- No behaviour, prop or accessible name of the seven changes.

#### REQ-UIX-052 — Every glyph of the house set is drawn for the playground, and the public routes do not move
**Serves:** `DEC-199` §3 · `REQ-UIX-041` · `DEC-186` §1 · `REQ-NFR-019`
`ui/icons.tsx` — every glyph on every screen — has a test inside the scope and a gallery entry showing the whole
set. The five public routes import the file, so it changes last, in one commit, under contract 5's four-part proof.
**Acceptance:**
- Every exported glyph appears in the gallery, by name, at the body size and at the display size.
- A glyph draws in `currentColor`, at `1em`, and a directional one mirrors in RTL.
- `qa:contract`, `visual`'s public pairs and the register form's fingerprint are equal before and after the commit.
- No icon library is added.

#### REQ-UIX-053 — The console takes the playground's tokens, and none of its motion, objects or stickers
**Serves:** `DEC-199` §1.1 · `DEC-183` §2 · `REQ-UIX-020` · `REQ-ADM-020`
`/app/admin/**` and `/app/platform/**` render inside the scope in a sober register: the palette, the radii and the
type, and nothing that celebrates. A table, a list, the audit log and an export do not animate.
**Acceptance:**
- No file the console renders imports a moment, confetti, an object or a sticker; a test walks the import graph.
- The six data-dense primitives read tokens only and declare no animation.
- Every console screen passes the accessibility sweep on the dark ground.
- A later console pass is about layout — density, tables, the rail — and changes no token.

#### REQ-UIX-054 — The member shell has five phone tabs and, on desktop, a navigation rail and a game rail
**Serves:** owner 2026-09-30 · `DEC-205` §2 · `DEC-206` §4.30 – §4.36 · `REQ-UIX-023` · `REQ-UIX-027`
Every non-immersive screen under `/app` — `SCR-010`, `SCR-011` and each screen after them — sits in one frame. On a
phone: a top row and a bottom bar of five tabs, الرئيسية · الجلسات · اقترح · الترتيب · حسابي, the third raised. From
`lg`: a top bar with the wordmark, the search entry, the bell and the account menu, over three columns — a
navigation rail at the start, the content, and a game rail at the end. The immersive routes keep hiding the bar
exactly as they do today.
**Acceptance:**
- The five tabs are links with their names on them; the current one is marked by more than colour; the bar pads
  for the safe area and `main` gains the matching `padding-block-end` in the same commit.
- The rail links only to routes that exist; staff links sit in a ruled section, shown to staff alone, with the
  count of what needs attention.
- Search stays in the bar, and every disclosure in the shell still closes as `REQ-UIX-023` says.
- The rails are sticky and never transformed, filtered or clipped — the root scope is their ancestor.
- The game rail is a region with a name; a screen that owns its width (`SCR-012`) renders without it.
- Rebuilt from `docs/design/screens/m10a/Home.dc.html` and `HomeDesktop.dc.html`, not restyled (`REQ-UIX-049`).

#### REQ-UIX-055 — Home is the feed
**Serves:** owner 2026-09-30 · `DEC-205` §2 · `DEC-NEXT-6` · `DEC-206` §4.47 – §4.61 · amends `REQ-UIX-021`
`SCR-010`, `/app`, is its own page and no longer the sessions list on a second route: the rings of the sessions in
their window, the member's week — rank, streak, points and the way to the next level — and a feed grouped by date
of session posts, recaps of completed sessions, colleagues' badges and streak awards, and the org's announcements.
`/app/sessions` stays the canonical, filterable browse URL (`REQ-UIX-022`).
**Acceptance:**
- The feed is one column of content; on desktop the week moves into the game rail and «التالية لك» joins it.
- A session the member has committed to comes first within its day; a cancelled session offers no action.
- Every figure is read, never typed: the rank is the monthly board's, the streak is in months, the attendance
  amount is the scoring rule's, and a `+0` is never drawn.
- A post's control is a link to where the action happens; nothing is reserved from the feed.
- A ring says its state in words and opens nothing until session stories exist; it is not a button.
- An achievement is shown only for a member who has not opted out of leaderboards, and carries no reaction.
- A new org's empty feed is the date-grouped session list, with an invitation to propose.
- With no company set, the banner says so above the week and a post's control states the reason.
- The rank change and the points count-up play once per occurrence, here or on `SCR-022`, never both
  (`REQ-UIX-044`), and each has its static state.
- No frame of the hard load is left unmeasured: the rate at which the page stands twice in the DOM is recorded
  for this route beside `DEC-204`'s figure.

#### REQ-UIX-056 — An org's announcements
**Serves:** `DEC-NEXT-6` · `DEC-206` §3 · `REQ-NFR-001` · `REQ-TEN-003`
An announcement is a short text an org admin publishes to every member of the org, shown as an item of the feed on
`SCR-010` from its `published_at` until its `expires_at`, or for good when it has none. It is stored in
`feed_announcements`. **It is not** a member's post, a poll, a comment thread, a thing that can be reacted to,
or a notification: it sends nothing.
**Acceptance:**
- The table carries `org_id`, not null, referencing `orgs`, and has RLS enabled.
- A member reads the published, unexpired announcements of their own org and no other row; an admin reads every
  row of their org.
- Only an admin of the org inserts, updates or deletes one, and the author recorded is the caller. A moderator and
  a member are refused on all three; `anon` and `service_role` hold nothing; no policy names a super admin.
- Every policy has its grant in the same migration, and a test exercises each policy as the role it names.
- The generated isolation sweep covers the table from a fixture row: a member of another org sees nothing.
- The body is plain text, bidi-isolated where a name is interpolated around it, with Western numerals.
- An expired announcement leaves the feed without a job: expiry is a predicate, not a deletion.

#### REQ-UIX-057 — Four primitives for the screens: the week, a feed item, the action bar, the attendee stack
**Serves:** `DEC-205` §3 · `DEC-206` §4.78 – §4.81 · `REQ-UIX-001` · `REQ-UIX-050`
`week-hud`, `feed-item`, `action-bar` and `attendee-stack` join `src/components/ui/`; `card` gains a `post`
variant and `session-cta` renders its phases as `SCR-010` and `SCR-012` draw them. Each renders every state from
props, reads no data and no message catalogue, and is born inside the playground.
**Acceptance:**
- Each new file has a registry entry, a test that renders it inside the scope, an RTL check and a gallery entry
  showing every state in Arabic; the gate's count moves to 53 in the commit that adds the fourth.
- An addition to an existing primitive is add-only: no existing call site renders differently, proven by the
  existing suites passing untouched.
- `action-bar` holds one primary and at most two icon buttons, pads for the safe area, and is the only fixed
  element at the bottom of an immersive screen.
- `attendee-stack` draws the people it is given and a count in words; it never decides who may be seen.
- `week-hud` shows a missing rank or a disabled streak as an absence, never as a zero.
- Nothing scales on hover, and none declares a keyframe of its own (`REQ-UIX-020`).

#### REQ-UIX-058 — The door is rebuilt: sign-in, choose-org, no-access
**Serves:** `DEC-205` · `DEC-195` §5 · `DEC-206` §4.37 – §4.41 · `REQ-AUT-001`, `REQ-AUT-004`, `REQ-AUT-005`, `REQ-AUT-006`
`SCR-002`, `SCR-003` and `SCR-004` are rebuilt from `Main.dc.html`, `ChooseOrg.dc.html` and `NoAccess.dc.html`.
What each does — the one Google action, the carried destination, the permanent choice, the explanation that names
no org — is unchanged.
**Acceptance:**
- `SCR-002` names no org; an error is shown in the page above the button, never a toast; `?next=` survives.
- `SCR-003` is a radio group of names, the chosen one marked by more than colour, with the reason the choice is
  permanent; the submit keeps its label while pending.
- `SCR-004` shows the visitor their own address, masked and bidi-isolated, and names no org and no listed domain;
  its suspended, deactivated and platform variants use the same frame.
- The three screens' existing behaviour suites pass with no expectation changed.

#### REQ-UIX-059 — The public session card is rebuilt, and shows nothing `DEC-066` does not allow
**Serves:** `DEC-205` · `DEC-066` · `DEC-206` §4.42 – §4.46 · `REQ-UIX-026`
`SCR-007`, `/s/[id]`, is rebuilt from `PublicCard.dc.html`: the org's line, the poster whole at 4:5, the title,
the time and the place, one action into sign-in that carries the session, and the line saying the full page is for
members.
**Acceptance:**
- No seat count, presenter, company, abstract or attendance figure is drawn; `session_public_card()` is unchanged.
- The status badge is the clock's — live or ended — and a cancelled session offers no action.
- The route is not one of the five frozen ones, and no file they import changes.

#### REQ-UIX-060 — Browse is rebuilt
**Serves:** `DEC-205` · `DEC-206` §4.63 – §4.65 · `REQ-DSC-003`, `REQ-DSC-005` · `REQ-UIX-022`
`SCR-011`, `/app/sessions`, is rebuilt from `Browse.dc.html`: the search field in the page, one row of chips with
the rest of the facets behind «المزيد», the eight most-used tags, and the sessions as rows in date groups — this
week, next week, this month, later, and the ended ones behind one link.
**Acceptance:**
- A row shows the poster scaled whole, the status badge, the title, the date, the place, the presenter, and the
  seats or the waitlist line; its bookmark is a separate control that does not open the row.
- The active filters stay visible and individually removable; an empty result names the filter that emptied it
  and offers to drop it.
- Search results replace the groups with one group. There is no sort control.
- The query string is the state: a filtered URL opened cold renders the same list.

#### REQ-UIX-061 — The event page is rebuilt around the whole poster
**Serves:** owner 2026-09-30 · `DEC-205` §2 · `DEC-206` §4.66 – §4.74 · `REQ-UIX-026` · `REQ-UIX-015` · `REQ-SES-011`
`SCR-012` is rebuilt from `Event.dc.html`, `EventLive.dc.html`, `EventDone.dc.html` and `EventDesktop.dc.html`.
The hero is the poster, whole, at 4:5 on a phone and at desktop width; the cropped band is retired. The action
card, the sub-nav and every section follow in the artboards' order, and the affordance matrix decides what a
viewer is offered exactly as it does today.
**Acceptance:**
- The language is stated before the action; the date, time and place sit with the action.
- On a phone the one primary action is also in the bottom action bar; on desktop the action row sticks once
  scrolled past.
- Live: the count of who is present, as a number; identities only for a viewer the database already answers.
- Completed: the outcome is a read-only fact, the rating is offered inside its window, the certificate is a row.
- A section with nothing in it renders no heading, and the sub-nav lists only sections that exist.
- Moment 1 plays on the action card once, from the reserve action's own result.

#### REQ-UIX-062 — Check-in and the host view are rebuilt
**Serves:** `DEC-205` · `DEC-206` §4.75 – §4.77 · `REQ-CHK-003`, `REQ-CHK-010`, `REQ-CHK-015`, `REQ-CHK-016`, `REQ-UIX-046`
`SCR-014` is rebuilt from `CheckIn.dc.html` and `SCR-016` from `Host.dc.html`. Both are immersive. What a code
accepts, when check-in is open, who may mark by hand and what is awarded are unchanged.
**Acceptance:**
- `SCR-014`: six boxes, left to right inside a right-to-left page; the rules line says the org's rotation and says
  «no reservation needed» only when the session allows walk-ins; the amount is the rule's and arrives at completion.
- A refused code is answered by the border, the glyph and the message; whether it may also move is the owner's
  ruling (`DEC-206` §4.75), and until then it does not.
- `SCR-016`: the code in two groups of three, the time to the next rotation, the count, the open switch with its
  ceiling, the revoke action, and marking by hand in a sheet with its mandatory reason.
- Projection shows the code alone and keeps the screen awake while the session is live.

#### REQ-UIX-063 — The design files never reach the build, and no prototype's class reaches the source
**Serves:** `DEC-183` · `docs/design/README.md` · wave 18's definition of done
`docs/design/screens/` holds the artboards a screen is rebuilt from. They are references for layout, size and copy,
and nothing in them is a component.
**Acceptance:**
- A test fails if any file under `src/` imports from `docs/`, if a `.dc.html` file is under `src/` or `public/`,
  or if a class name an artboard declares appears in `src/`.
- The built output contains no `.dc.html` file.


#### REQ-UIX-064 — Four primitives for batch B: star input, stepper, page viewer, badge medallion
**Serves:** `DEC-213` §4, §5.124 – §5.126 · `REQ-UIX-001` · `REQ-UIX-050`
`star-input`, `stepper`, `page-viewer` and `badge-medallion` join `src/components/ui/`, for `SCR-015`, `SCR-018`,
`SCR-013` and `SCR-020` respectively. Each renders every state from props, reads no data and no message catalogue, and is born inside the playground.
**Acceptance:**
- Each new file has a registry entry, a test that renders it inside the scope, an RTL check and a gallery entry
  showing every state in Arabic; the gate's count moves from 53 to 57 in the commit that adds the fourth.
- `star-input` is a radio group of five real radios: star 1 is the rightmost in RTL, selection and hover fill from
  the right, ← increases and → decreases, the count is read back in words, and a read-only face exists.
- `stepper` is an ordered list; the current step carries `aria-current="step"` and a done step is marked by more
  than colour.
- `page-viewer` is the page, previous and next, a scrubber, a thumbnail rail and zoom, with a keyboard model in
  which «next» advances in the reading direction; ★ there is exactly one thing called page-viewer in `src/`.
- `badge-medallion` draws a badge's disc and its name; nothing scales on hover and none declares a keyframe of its
  own (`REQ-UIX-020`).

#### REQ-UIX-065 — The viewer is rebuilt: the page is the brightest thing, and «next» goes the way a reader reads
**Serves:** `DEC-213` · `REQ-MAT-003`, `REQ-MAT-005`, `REQ-MAT-007` · `09` `SCR-013`
`SCR-013` is rebuilt from `Viewer.dc.html` and `ViewerDesktop.dc.html`: on black, the chrome bar, the page whole and
centred, and on a phone the scrubber with previous and next; on desktop the thumbnail rail at the inline-start and
the keys listed in the bar. The route is full-screen at every width.
**Acceptance:**
- ★ In Arabic «next» advances the page, sits at the inline-end and points left; on desktop ← is next and → is
  previous; Page Down/Up and Home/End work. A test asserts each, against the buttons and the keys.
- Previous and next are always-visible tap targets; swipe is an enhancement; zoom has single-pointer controls and
  the browser's own pinch is never disabled.
- With `allow_download` false there is no download control **and no URL** — a test proves a denied member receives
  no signed URL. The source file is never fetched to render a page.
- Loading, rendering and failed are built as states; hidden chrome comes back on any key, focus or tap.

#### REQ-UIX-066 — Rate is rebuilt, and the survey stays on it
**Serves:** `DEC-213` · `REQ-RAT-001` … `REQ-RAT-004`, `REQ-RAT-006` · `REQ-SUR-004` · `09` `SCR-015`
`SCR-015` is rebuilt from `Rate.dc.html`: the back control and the title, the session's mini-row, two star inputs,
the comment with its count, the honest anonymity panel, and a bottom action bar with the submit and the window line.
**Acceptance:**
- Stars fill from the right; each row is a radio group whose count is read back.
- The anonymity notice states the threshold from the org's setting and that org admins see individual ratings.
- A session with a survey shows it on the same screen, written separately from the rating, exactly as before.
- Submitted, editable within the window, closed, and not eligible are built; a member not checked in is told why.

#### REQ-UIX-067 — Propose and my proposal are rebuilt
**Serves:** `DEC-213` · `REQ-PRO-001` … `REQ-PRO-004`, `REQ-PRO-008` · `09` `SCR-017`, `SCR-018`
`SCR-017` is rebuilt from `Propose.dc.html` and `SCR-018` from `Proposal.dc.html`. The member's own proposals are a
list above the form on `/app/propose` (`DEC-NEXT-18`), not a route.
**Acceptance:**
- No date, time or venue field exists, in the form or the schema (`REQ-PRO-001`).
- The proposal's state is a five-step stepper; «scheduled» is derived from a session that names the proposal.
- The reason for changes requested is shown with the one primary action to resubmit; nobody's name is invented.
- A co-presenter can be added after submission while the proposal is open, within the org's limit.
- Every figure on the earn panel is read from the scoring rules; the panel is absent when it would say zero.

#### REQ-UIX-068 — The member directory exists
**Serves:** `DEC-213` · `REQ-PRF-005` · `REQ-TEN-003` · `09` `SCR-019`
`/app/members` is built from `Directory.dc.html`: the title with the count and the order, search by name or job
title, the company chips with their dot, and rows with the avatar's team ring, the name, the title, the company,
the sessions presented and the level.
**Acceptance:**
- Only tier-1 fields leave the DAL; the component decides nothing about who may see what.
- Never a member of another org; deactivated members excluded, and marked when an admin is shown them.
- No rank is shown, for anyone; no verb about a member is gendered.
- The list pages through the query string, so it works without JavaScript and a cold URL renders the same list.

#### REQ-UIX-069 — The profile is rebuilt, in its three tiers
**Serves:** `DEC-213` · `REQ-PRF-004` · `REQ-RAT-006` · `REQ-LDR-008` · A33 · `09` `SCR-020`
`SCR-020` is rebuilt from `Profile.dc.html` and `ProfileDesktop.dc.html`: the header card, the standing card, the
badges, the sessions presented and the photos uploaded; on desktop a 1fr / 380 body with no game rail.
**Acceptance:**
- Tiering is the DAL's: a colleague receives the member tier's fields and no others.
- An average rating is shown on the self and admin tiers only, from three ratings.
- An opted-out member's points and ranks read «—» to a colleague; level, badges and streak still show.
- No level-up moment plays here; photos are uploaded ones, never tagged.

#### REQ-UIX-070 — The `/app/me` hub has one frame, and on desktop no game rail
**Serves:** `DEC-216` §5.8, §5.10 · `REQ-UIX-054` · `09` `SCR-021` … `SCR-026`
`/app/me` and its five pages share one frame, from `docs/design/screens/m10c/`: on a phone the page's own top row
(the title in the display face, a back control on a sub-page, the settings link on `/app/me`), the hub strip of six
links with the current one in accent, the page, and the tab bar with «حسابي» current. On desktop the shell's bar and
navigation rail, **no game rail**, a standing band (the member's avatar, name, title, company, level, points and the
distance to the next, and three figures), the hub strip under a rule with «بياناتي وخصوصيتي» as a seventh link, then
the page.
**Acceptance:**
- No hub page renders the game rail; the standing band is drawn once, by the frame, from `lg`.
- The strip's links are real links with `aria-current="page"` on the current one; the strip scrolls sideways on a
  phone and is never clipped by a parent.
- Moments 3 and 5 render on the standing card and band through the existing mechanism, once per occurrence; the
  level-up never plays on another member's profile (`DEC-213` §5.117).
- `/app/me/privacy` keeps its link and its screen (M13).

#### REQ-UIX-071 — My profile is read by default and edited on intent
**Serves:** `DEC-216` §5.12 · `REQ-PRF-001`, `REQ-PRF-002`, `REQ-PRF-008` · `09` `SCR-021`
`SCR-021` is rebuilt from `Me.dc.html` and `MeEdit.dc.html`. The profile is never an open form: it renders as
label/value rows with one «عدّل ملفك». Edit mode is entered only by that control, says it is editing, counts the
unsaved changes, marks each changed field, and offers Save and Cancel in a bottom action bar.
**Acceptance:**
- In read mode no input exists; the email is read-only and shows Google's address.
- Save is enabled only when something changed; Cancel restores every field and returns to read mode; nothing is
  written before Save; leaving with unsaved changes asks first.
- A failed save stays in edit mode with the error summary and each error at its field; a successful one returns to
  read mode and says so once.
- A member with no company is told so, and the company row is the way to choose one.
- ★ The leaderboard opt-out stays in the profile's edit mode until `SCR-029` exists in the same deployment, and
  leaves it in the commit that adds it there — there is never a deployment with no way to opt out (`REQ-LDR-008`).

#### REQ-UIX-072 — My points explains every point, and the explanations are not ledger rows
**Serves:** `DEC-216` §5.5, §5.6, §5.9 · `REQ-PTS-003`, `REQ-PTS-006`, `REQ-PTS-009`, `REQ-PTS-013`, `REQ-PTS-015` · `09` `SCR-022`
`SCR-022` is rebuilt from `Points.dc.html`, and on desktop from `HubDesktop.dc.html` as a table. The head card with
the balance, the level and the distance; the filters; the ledger grouped by month; the catalogue read live from the
scoring rules.
**Acceptance:**
- A reversal and the row it reverses are drawn in one card, linked through the reversal's `source_id`; the
  negative amount carries its minus sign as well as its colour.
- A capped action is explained in place as a row drawn with `0`; it is computed for the screen and **no ledger row,
  view or table holds it** (`05` §8).
- A manual adjustment shows the admin's reason and name.
- The empty and the filtered-empty states are built. ★ No CSV is offered: no member-side export of the ledger
  existed to keep, and a member's ledger leaves through the data export (`REQ-PRF-006`) — `DEC-218` §3.2.
- Every figure is the ledger's or the rules'; no figure is a literal and no award shows before completion.

#### REQ-UIX-073 — My certificates is one list
**Serves:** `DEC-216` §2.1 · `REQ-CRT-013`, `REQ-CRT-014` · `09` `SCR-023`
`SCR-023` is rebuilt from `Certificates.dc.html`: a row is the session's title, the kind and the date, and opens
the certificate; a download control at the row's end goes through the one audited download route.
**Acceptance:**
- A revoked certificate is a struck, dimmed row with the word «ملغاة»; its reason is on the certificate's own page.
- A certificate not yet issued is a dimmed row with «قريبًا».
- No serial, code or QR in the list; no download is ever a signed URL in the page's data.

#### REQ-UIX-074 — Bookmarks are the browse row, unchanged
**Serves:** `DEC-216` §2.1 · `REQ-DSC-006` · `09` `SCR-024`
`SCR-024` is rebuilt from `Bookmarks.dc.html`: each saved session is the row browse draws, with the badge it has
there and the filled bookmark at the end to remove it.
**Acceptance:**
- Removing is optimistic and can be undone from a toast; a failure restores the row and says so.
- No groups and no status lines; the empty state links to browse.

#### REQ-UIX-075 — The calendar page holds the connection and what failed, and nothing else
**Serves:** `DEC-216` §5.11, §5.20 · `REQ-CAL-003`, `REQ-CAL-007`, `REQ-CAL-008` · `09` `SCR-025`
`SCR-025` is rebuilt from `Calendar.dc.html`: one row for the Google connection — connected with «افصل», or not
connected with «اربط» — and, only when a session failed to reach the calendar, a list of those sessions, each with
«أعد المحاولة».
**Acceptance:**
- A healthy connection is one row; no synced session is listed; no token is ever rendered.
- Disconnecting deletes the tokens (`REQ-CAL-007`); a calendar failure never blocks anything else on the page.

#### REQ-UIX-076 — The notifications page is the inbox
**Serves:** `DEC-216` §5.13, §5.16 · `REQ-NTF-005`, `REQ-NTF-006` · `09` `SCR-026`
`SCR-026` is rebuilt from `Notifications.dc.html`: the unread-only filter, mark all read, a link to the settings,
and the items grouped by date, an unread item marked by a dot and a filled surface.
**Acceptance:**
- No preference is set on this page; the link «ما يصلني» opens `SCR-029`.
- An item that carries a session opens it; a change notice says what changed.
- The empty and the all-read states are built; «all read» replaces the mark-all control.

#### REQ-UIX-077 — `/app/me/settings` exists, and every preference a member holds lives on it
**Serves:** `DEC-216` §4, §5.13, §5.15 · `REQ-NTF-003`, `REQ-LDR-008`, `REQ-CAL-003` · `08` §1.7, §2 · `09` `SCR-029`
`SCR-029` is a new route, built from `Settings.dc.html`, wearing the tab bar with «حسابي» current and its own top
row. A group of switches, a group of links (the Google calendar with its state, the language, the data and privacy
page), and a footer with sign-out and the member's email.
**Acceptance:**
- The switches are the email channel's master switch, the optional categories of `08` §2 — `admin_queue` for admins
  and moderators only — and the leaderboard visibility; the categories `08` marks «on (not switchable)» and the
  seventeen of `08` §1.7 are **one sentence, never rows**.
- Each switch saves on change; a failed save restores the switch and says so beside it.
- In-app notifications are not a setting.
- It is reached from the settings link on `/app/me` and from the inbox's «ما يصلني»; `preference-matrix` no
  longer exists, and every preference it wrote is still written.

#### REQ-UIX-078 — The leaderboards open on this week, computed live, with the member's own rank always in view
**Serves:** `DEC-216` §2.2, §5.4, §5.7, §5.17 · `REQ-LDR-001`, `REQ-LDR-002`, `REQ-LDR-003`, `REQ-LDR-007`, `REQ-LDR-008` · `09` `SCR-027`
`SCR-027` is rebuilt from `Board.dc.html`: the window chips — this week, this month, all time, the company race —
the member's own rank card, a static podium for the first three, and the ranked rows. The category filter is a menu
in the header, not a tab. There are no leagues.
**Acceptance:**
- This week is summed from `points_ledger` at read time over the org's calendar week in the org's time zone; no
  enum value, snapshot or scheduled job exists for it.
- The movement beside a rank is the change **since the member last looked at that window**, read from and written to
  `member_seen_marks` (`0169`); the copy says so. A first visit shows no movement.
- The member's own rank is visible inside or outside the shown range; an opted-out member sees their own row and
  nobody else does.
- Moment 5 plays on the rank card once per change; the podium never animates and, under reduced motion, is the
  first three rows.

#### REQ-UIX-079 — The company race is rebuilt, with both metrics and the breakdown
**Serves:** `DEC-216` · `REQ-LDR-004`, `REQ-LDR-005`, `REQ-LDR-006` · `REQ-PRF-003` · `09` `SCR-028`
`SCR-028` is rebuilt from `Companies.dc.html`: the cup card with the quarter, its state and the ranking metric;
each company with both metrics, the ranking one marked, and a bar in its team colour growing from the inline-start;
the member's own company marked; and «كيف حصلت شركتك على نقاطها».
**Acceptance:**
- A member with no company sees the prompt to choose one in place of the breakdown.
- A company below the minimum of active members has no rank and says so.
- Every figure is the snapshot's or the live computation's that the board already reads; none is a literal.

#### REQ-UIX-080 — No explainer copy
**Serves:** `DEC-216` §5.14 · `DEC-NEXT-25`
A line of copy exists only if it changes what the person does next. Facts live in one place — the empty state, the
error — and never as hints, legends, footnotes or intro paragraphs.
**Acceptance:**
- Every string this milestone adds is tested against that sentence before it is written, in `messages/ar/` first.
- The lines the M10a and M10b screens carry that their trimmed artboards no longer draw are removed, each named in
  the story; a removed line whose fact is needed moves to the state it belongs to.

#### REQ-UIX-081 — Three primitives for batch C: podium, settings group, ledger row
**Serves:** `DEC-216` §2.1 · `REQ-UIX-001` · `REQ-UIX-050`
`podium`, `settings-group` and `ledger-row` join `src/components/ui/`, for `SCR-027`, `SCR-029` and `SCR-022`. Each
renders every state from props, reads no data and no message catalogue, and is born inside the playground.
**Acceptance:**
- Each new file has a registry entry, a test that renders it inside the scope, an RTL check and a gallery entry
  showing every state in Arabic; the gate's count moves from 57 to 60 in the commit that adds the third.
- `podium` draws the first three on three blocks, second · first · third, and declares no keyframe; under reduced
  motion or at a narrow width it is three rank rows.
- `settings-group` is a titled group of rows, each a switch or a link, a switch's failure shown beside it.
- `ledger-row` draws a signed amount with its sign at the numeral's inline-start, a reversal pair in one row, and a
  cap explanation with `0`; colour is never the only mark of a negative amount.
- There is no `status-mark` (`DEC-216` §2.1).

#### REQ-UIX-082 — A company below the org's minimum of active members is unranked, by a setting of its own
**Serves:** `DEC-220` §1 · `DEC-219` §2 · `REQ-LDR-004`, `REQ-LDR-006` · `09` `SCR-028`
The org holds `company_min_active_members` (default 3), separate from any scoring rule's minimum. A company snapshot
freezes the value; the company ranking puts eligible companies first, and a company below the minimum is drawn
«بلا ترتيب» with no rank — on the company race and on the home's race alike.
**Acceptance:**
- A final snapshot — a month or a quarter — never changes when the setting changes.
- Every stored rank stays positive; eligible companies rank first.
- The setting has no admin control this wave (`DEC-220` §1.3); its default and range are enforced by the database.

#### REQ-UIX-083 — A visible photograph earns its rule's points, and a takedown reverses them
**Serves:** `DEC-220` §2 · `REQ-PTS-002`, `REQ-PTS-006`, `REQ-PTS-012`, `REQ-PTS-013` · `REQ-EVT-011` · `09` `SCR-022`
A photograph that becomes visible pays the `photo` rule's points to its uploader, capped per session by the rule; a
hidden or removed photograph writes a compensating row; a photograph restored after a takedown pays once more, so the
net is one award, and a photograph never paid is not paid by a restore.
**Acceptance:**
- The award and the reversal are written by `security definer` functions with an idempotency key per photo and epoch;
  no ledger row is ever updated or deleted.
- The cap is read from `scoring_rules`; a photograph past it is explained in place on `SCR-022` as the cap row.
- A photograph's row exists only after its EXIF strip (`0174`), so no unstripped image earns or shows.

#### REQ-UIX-084 — The console's frame: a top bar, a rail of six ruled groups, the page beside it
**Serves:** `DEC-225` §3 (`DEC-NEXT-26`) · `DEC-226` · `DEC-227` §2 – §4 · `REQ-UIX-053` · `REQ-ADM-020` · `16` §6.7
Under `/app/admin` the console draws its own frame from `AdminDashboard.dc.html`: a 52 px top bar (the wordmark,
«لوحة الإدارة», the org's name, «التطبيق» back to the member app, the account's avatar); a 220 px rail at the
inline-start, sticky, holding the twenty `admin.shell.nav.*` items on one level divided by six rules, a queue's open
count as a small coral badge beside it; and the page beside the rail at 24 px padding, its `h1` row carrying the page's
one primary action at its end. Under `lg` the rail is a sheet behind ≡ that keeps the six groups and their rules.
**Acceptance:**
- An admin's rail renders exactly the twenty items, in the artboard's six groups; a moderator's renders only the
  routes `REQ-ADM-020` allows; a plain member's renders none; no item whose screen is not built is ever drawn.
- The group headings render no text; each group is separated by a rule a screen reader does not announce as content.
- The current item carries `aria-current="page"`, decided from the path on every navigation.
- A badge's count is read from the same source as the dashboard's attention tiles; no badge is drawn at 0.
- The skip link past the rail stays; the frame animates nothing.

#### REQ-UIX-085 — Three primitives for the console: admin rail, split view, key/value card
**Serves:** `DEC-225` §2 · `DEC-213` §4 · `DEC-227` §2 · `REQ-UIX-001` · `REQ-UIX-050` · `REQ-UIX-053`
`admin-rail`, `split-view` and `kv-card` join `src/components/ui/`. Each renders every state from props, reads no data
and no message catalogue, is born inside the playground, and declares no animation.
**Acceptance:**
- Each new file has a registry entry, a test inside the scope, an RTL check and a gallery entry showing every state in
  Arabic; the gate's count moves from 60 to 63 in the commit that adds the third.
- `src/components/admin/admin-rail.tsx` no longer exists; there is one thing called `admin-rail`.
- `admin-rail`, `split-view` and `kv-card` are among the primitives `tests/unit/console-register.test.ts` holds to no
  animation.
- `split-view` is a list beside a detail with a keyboard model — ↑ and ↓ move through the list, Enter opens the
  current item, focus is never lost to the page — and is the list alone under `lg`.
- `kv-card` is a titled card of label/value rows in read mode, with an edit twin that is the same rows as fields.

#### REQ-UIX-086 — The dashboard shows what needs the admin's attention, and every figure opens its list
**Serves:** `DEC-225` §3 · `DEC-227` §0.1 · `REQ-ADM-004` · `09` `SCR-040`
`SCR-040` is rebuilt from `AdminDashboard.dc.html`: the `h1` and the month; «يحتاج انتباهك» — four tiles, each a
count, a label and the oldest item's age, each a link to its queue; six figures for the month; the proposal pipeline as
one segmented bar with its counts in the caption; the next sessions as a table; the top presenters, categories and
companies.
**Acceptance:**
- Each attention tile opens the queue it counts in one move; when nothing waits, the four tiles are one line.
- Every figure on the page is a link to the list behind it; none is a literal.
- There is no chart beyond the one bar, and nothing on the page animates.
- A moderator has no dashboard: `/app/admin` answers them with the streamed not-found it answers today (`DEC-228` §3.1).

#### REQ-UIX-087 — The sessions table: found, filtered and acted on in bulk at a desk, usable as cards on a phone
**Serves:** `DEC-225` §4.3 · `DEC-227` §0.3 · `REQ-ADM-005` · `REQ-SES-003`, `REQ-SES-005`, `REQ-SES-012` · `09` `SCR-042`
`SCR-042` is rebuilt from `AdminSessions.dc.html` and `AdminSessionsPhone.dc.html` on `data-table`: a toolbar of
search and filter chips that carry their current value, and a count; «جلسة جديدة» on the `h1` row; a sticky header;
row selection with select-all; the title, status, date, venue, presenter and reservations columns and a row menu; a
pager. Selecting rows replaces the toolbar with a bulk bar naming how many are selected, with the actions that apply to
them and a way to clear the selection.
**Acceptance:**
- Any column header sorts; the default order is a live session first, then upcoming by date ascending, then undated,
  then past by date descending (`DEC-228` §3.5).
- A bulk action does only what the same action does on one row, through the same authority; an export goes through the
  audited export path.
- Below `md` the same rows are cards — title and status, date and venue, presenter, seats — never a horizontally
  scrolling table; the filter chips scroll in one row; the page causes no horizontal scroll at 390 px.
- A moderator sees the read-only list `09` already gives them.

#### REQ-UIX-088 — A proposal is decided without leaving the queue
**Serves:** `DEC-225` §3 (`DEC-NEXT-27`) · `DEC-227` §0.2, §5.1 · `REQ-PRO-005`, `REQ-PRO-006`, `REQ-PRO-009` · `09` `SCR-041`
`SCR-041` is rebuilt from `AdminProposals.dc.html` as a `split-view`: the queue at the inline-start, filtered by state
with counts, each row its title, proposer and company and age; the open proposal beside it with its fields, its
presenters, its preliminary materials, the edits made to its content shown as a diff, and the decision card — one
message to the proposer and approve, request changes, reject.
**Acceptance:**
- ↑ and ↓ walk the queue and Enter opens a proposal; the decision is taken without navigating away, and the next
  proposal is one key away after it.
- Requesting changes and rejecting require the written message the proposer receives (`REQ-PRO-005`); every
  decision is audited (`REQ-PRO-006`).
- When a proposal's content changed after it was submitted, the reviewer sees what changed, field by field, before
  deciding; when it did not, nothing is drawn.
- Under `lg` the queue is the page and a proposal opens at its own route.

#### REQ-UIX-089 — A session's settings are read by default, under one header
**Serves:** `DEC-225` §3 (`DEC-NEXT-28`) · `DEC-178` · `DEC-227` §5.2, §5.3 · `REQ-SES-020`, `REQ-SES-009`, `REQ-SES-019` · `09` `SCR-043`
The session hub draws one header — the breadcrumb, the title, the status, the tab's actions — above its five tabs,
الجدولة · المحتوى · الحضور · الاستبانة · الشهادات, from `AdminSessionHub.dc.html`. الجدولة is a `kv-card` in read mode
— the date, venue, capacity, the booking and cancellation deadlines, the presenters, check-in and the certificate —
with «عدّل» and «أعد الجدولة», and a side column with the reservations, the poster's formats and the session's log.
**Acceptance:**
- Edit mode is the same card as a form with save and cancel; nothing is edited without «عدّل».
- The header's lifecycle action follows the state: publish for a draft, cancel for a published session, none once
  completed.
- `DEC-178`'s redirect is unchanged: the hub's own URL lands an admin on الجدولة and a moderator on الحضور.
- المحتوى opens the event page, where content is managed; no content screen is built in the hub.

#### REQ-UIX-090 — Attendance is run live from the hub
**Serves:** `DEC-225` §4.8 · `DEC-227` §0.4 · `REQ-CHK-008`, `REQ-CHK-012`, `REQ-CHK-015`, `REQ-CHK-016`, `REQ-CHK-017` · `DEC-172` · `09` `SCR-044`
The الحضور tab is rebuilt from `AdminAttendance.dc.html`: «شاشة التقديم» as the header's primary; five figures;
beside them the code card — the code, its rotation, «أبطل» and the open/closed switch; filter chips, «تسجيل يدوي» and
the CSV; and the attendance table — the member with their face, the reservation, the time, the method and who marked
it, the status and a row menu.
**Acceptance:**
- A manual check-in names a member and a reason, is audited and flagged in exports (`REQ-CHK-008`).
- Revoking a check-in asks for a reason and writes the compensating ledger row `DEC-172` defines through the existing
  removal; no new reversal exists.
- On a completed session the code card is replaced by the final rate; an admin may still add and remove at any time
  (`REQ-CHK-017`, `DEC-228` §4.6), and nothing else on the rows is editable.
- The page renders nothing of the hub's header; faces appear here because the host placement allows them (`DEC-099`).

### The console, batch B (`DEC-230`, `DEC-231`, M24)

#### REQ-UIX-091 — A console page that holds values is read by default, and says what it saved
**Serves:** `DEC-230` §4 (`DEC-NEXT-29`) · `DEC-231` §0.1, §3 · `M10c.md` §1 (`DEC-NEXT-23`) · `09` `SCR-053`, `054`, `060`, `063`
A page whose purpose is to hold settings renders them as values with one «عدّل». Edit mode names its state: the count of
unsaved changes, each changed field marked, Save naming the count, Cancel restoring. Read mode shows the last save — a
glyph and a word, with its time and actor — read from the record the save wrote.
**Acceptance:**
- Nothing is written until Save; leaving with unsaved changes asks first.
- The saved mark is shown only from the server's answer; a save that wrote nothing says so, and a failed save keeps
  edit mode with the error at the field.
- A changed field is marked by more than colour — a screen reader hears that it changed.
- The saved mark is plain text with a glyph, never a primitive (`DEC-216` §2.1).

#### REQ-UIX-092 — `data-table` carries a switch, a pair of actions and a colour swatch in a cell
**Serves:** `DEC-230` §4 · `M11b.md` §Primitives · `REQ-UIX-085` · `09` `SCR-048`, `SCR-050`, `SCR-053`
Three cell forms on the existing primitive, added without a new file: a switch cell whose change is a named action on
the row; a two-button action cell (an approve-and-dismiss pair); a swatch cell that shows a colour **and** names it.
**Acceptance:**
- Every existing `data-table` suite passes untouched; the gate's floor stays 63.
- Each form works in the phone stack as in the table, and a switch cell's change is announced with the row's name.
- A swatch never carries its meaning by colour alone.

#### REQ-UIX-093 — Venues, each with the company that owns it
**Serves:** `DEC-230` §2 · `REQ-ADM-006`, `REQ-ADM-022` · `09` `SCR-046`
`SCR-046` is rebuilt from `AdminVenues.dc.html` on `data-table`: name, owning company, address, capacity, sessions;
«مكان جديد» on the `h1` row; a row's edit sheet with the company `select`, which may name no company.
**Acceptance:**
- A venue with no company says so in the row; nothing implies it hosts for anyone.
- Every create, edit, company change and (de)activation writes an audit row (`REQ-ADM-023`).
- Below `lg` the rows are cards; a venue referenced by a session is deactivated, never deleted.

#### REQ-UIX-094 — Categories, alone
**Serves:** `DEC-227` §3 · `REQ-ADM-007` · `09` `SCR-047`
`SCR-047` is rebuilt from `AdminCategories.dc.html`: name and sessions; «تصنيف جديد». There are no tags and no label
says «والوسوم».
**Acceptance:**
- A category in use cannot be deleted, and the row menu says why; deactivation is offered.
- Every mutation writes an audit row (`REQ-ADM-023`).

#### REQ-UIX-095 — Companies, with their team colour
**Serves:** `DEC-230` §4 (`DEC-NEXT-31`) · `REQ-ADM-008`, `REQ-UIX-043` · `09` `SCR-048`
`SCR-048` is rebuilt from `AdminCompanies.dc.html`: the colour as a swatch cell, name, members, active, the quarter's
company points; «شركة جديدة»; a row's edit sheet for the name and the colour.
**Acceptance:**
- The colour is shown as a swatch and its value in words; a company with none says so.
- No company logo and no company domain are offered (`DEC-195` §4, `DEC-231` §6.1).
- Every mutation writes an audit row (`REQ-ADM-023`); the quarter's points are read, never a literal.

#### REQ-UIX-096 — Members, roles and status, each change audited
**Serves:** `REQ-ADM-009`, `REQ-ADM-020` · `09` `SCR-049`
`SCR-049` is rebuilt from `AdminMembers.dc.html`: avatar, name, company, role badge, level, points, last active; chips
for company and role; «CSV»; a row menu that changes the role, deactivates and reactivates.
**Acceptance:**
- There is no invite: members arrive by sign-in.
- The last remaining org admin cannot be demoted or deactivated, and the menu says why.
- The CSV goes through the audited export path (`REQ-ADM-017`).

#### REQ-UIX-097 — Reminders, read by default
**Serves:** `REQ-ADM-016`, `REQ-NTF-004` · `REQ-UIX-091` · `09` `SCR-060`
`SCR-060` is rebuilt from `AdminReminders.dc.html`: one table of the reminders `08` defines — reminder, timing,
channels, enabled — with one «عدّل».
**Acceptance:**
- A reminder is never added or removed here; the set is `08`'s.
- The page meets `REQ-UIX-091`.

#### REQ-UIX-098 — Exports: what each holds, when it last ran and by whom
**Serves:** `REQ-ADM-017` · `09` `SCR-061`
`SCR-061` is rebuilt from `AdminExports.dc.html`: one row per export with its last run — actor and time — and «CSV».
**Acceptance:**
- Every file is UTF-8 with a BOM, with Arabic headers and enum values, Western numerals and sortable dates.
- Every export writes its audit row before the file is served; the last run shown is read from that row.

#### REQ-UIX-099 — The audit log answers who, when and what, for every console mutation
**Serves:** `REQ-ADM-018`, `REQ-ADM-023` · `DEC-231` §4.3 · `09` `SCR-062`
`SCR-062` is rebuilt from `AdminAudit.dc.html`: chips for the actor, the action and the period; a table of time, actor,
action and target; «CSV».
**Acceptance:**
- Configuration changes recorded in `scoring_config_history` appear beside `audit_log`'s rows, marked by kind; nothing
  is written twice.
- The CSV is a new export type through the audited path.
- No row can be edited or deleted from the screen or by any role (`REQ-NFR-006`).

#### REQ-UIX-100 — The points catalogue, read by default, editable without breaking what a member reads
**Serves:** `REQ-PTS-003`, `REQ-PTS-004`, `REQ-PTS-005`, `REQ-PTS-010`, `REQ-PTS-016` · `REQ-UIX-091` · `09` `SCR-053`
`SCR-053` is rebuilt from `AdminScoring.dc.html`: the fixed catalogue as a table — action, value, cap, cooldown,
enabled — the negative group below it, closed by default; the company rules as one line; «عدّل»; «تعديل يدوي» in a
sheet.
**Acceptance:**
- An edited rule is what `SCR-022` explains from the next award; no row already written changes (`REQ-PTS-011`).
- A manual adjustment takes a member, a signed amount and a mandatory reason, and lands in the member's ledger.
- The reservation and the interaction actions are absent, not zero.
- The stopgap host-company form is gone; hosting reads the venue (`REQ-PTS-016`).

#### REQ-UIX-101 — Badges and levels, and the achievement certificates waiting to be issued
**Serves:** `REQ-ADM-012`, `REQ-REC-001`, `REQ-REC-003`, `REQ-CRT-012` · `REQ-UIX-091` · `09` `SCR-054`
`SCR-054` is rebuilt from `AdminRecognition.dc.html`: levels — name, threshold, colour — beside badges — name, rule,
granted, enabled — each with «عدّل»; below, the held achievement certificates with «أصدر» and «أوقف».
**Acceptance:**
- A level's threshold edit keeps the levels in order and is recorded with its old and new value.
- Releasing or holding a certificate is audited.

#### REQ-UIX-102 — Settings, read by default, in four cards
**Serves:** `REQ-TEN-008` · `REQ-UIX-091` · `09` `SCR-063`
`SCR-063` is rebuilt from `AdminSettings.dc.html`: four `kv-card`s in two columns — the organisation, sessions,
privacy, integrations — with one «عدّل».
**Acceptance:**
- Every value shown is read from the org's settings; none is a literal.
- The page meets `REQ-UIX-091`.

#### REQ-UIX-103 — Reports, actioned in a table
**Serves:** `DEC-230` §3, `DEC-231` §5 · `REQ-ADM-010` · `09` `SCR-050`, `SCR-052`
`SCR-050/052` is rebuilt from `AdminModerationReports.dc.html`: one table with chips مفتوحة, التعليقات, مغلقة — the
content's excerpt and author, session, reporter, reason, age — and «أخفِ» and «تجاهل» in the row.
**Acceptance:**
- The content is shown in context and reachable from the row.
- Resolving records the outcome and the actor, in one write that also writes the audit row.
- `/app/admin/moderation/comments` redirects here.

#### REQ-UIX-104 — Photos: takedown requests and photo reports, decided in a split view
**Serves:** `DEC-231` §5 · `REQ-ADM-010`, `REQ-EVT-012`, `REQ-EVT-014` · `09` `SCR-051`
`SCR-051` is rebuilt from `AdminModerationPhotos.dc.html` on `split-view`: the queue — thumbnail, session, requester,
age — with chips for takedown requests and photo reports; the detail — the photograph large, the session, the uploader,
the requester, the status — with «احذف نهائيًا» and «أعدها للعرض».
**Acceptance:**
- A takedown request's photo is already hidden; a reported photo is not, and the detail says which.
- Every decision records its outcome and actor and writes the audit row.

#### REQ-UIX-105 — A session's survey results on the hub's tab
**Serves:** `REQ-SUR-006` … `REQ-SUR-009`, `REQ-RAT-004` · `09` `SCR-064`
`SCR-064` is rebuilt from `AdminSurveyResults.dc.html` on the hub: four figures — responded, the session's average,
the presenter's average, the response rate — a bar per star count, the free-text answers with the anonymity line, and
«CSV».
**Acceptance:**
- Below the withhold threshold, nothing but the count is shown, for the screen and the CSV alike (`DEC-160` §3).
- The page renders nothing of the hub's header.

#### REQ-UIX-106 — Survey templates, and the selected one's questions
**Serves:** `REQ-SUR-001`, `REQ-SUR-002` · `REQ-ADM-023` · `09` `SCR-065`
`SCR-065` is rebuilt from `AdminSurveys.dc.html`: the templates — name, questions, sessions — and, below them, the
selected template's questions — question, type, required; «قالب جديد». (Corrected in wave 22: this text first said
«beside», which the lead wrote without reading the artboard, which draws the questions below.)
**Acceptance:**
- Questions reorder without dragging (`ui/reorderable-list`).
- Creating, saving and deleting a template are audited.

#### REQ-UIX-107 — The studio frame: both editors on one sidebar model, with the whole viewport
**Serves:** `DEC-235` §4 (`DEC-NEXT-36`), `DEC-237` §1 · `REQ-DSG-028` · `09` `SCR-056`/`057`, `SCR-058`
The designer and the email builder render **without the console frame**: their own bar, a 68 px icon rail at the
inline-start, a 300 px panel that **swaps** with the rail's selection, the canvas, **no right panel**, and a floating
toolbar on the selection — `ui/editor-rail` and `ui/floating-toolbar`, shared by both. The other studio screens stay inside
the console frame (`REQ-UIX-084`).
**Acceptance:**
- Every rail item and every floating-toolbar control is reachable by keyboard and by a single tap.
- No motion beyond drag feedback (`REQ-UIX-053`); `tests/unit/console-register.test.ts` is not edited.

#### REQ-UIX-108 — The template library, with its certificates tab and three defaults
**Serves:** `REQ-DSG-008`, `REQ-CRT-004` · `DEC-235`, `DEC-236` §1 · `09` `SCR-055`
`SCR-055` is rebuilt from `AdminTemplates.dc.html` and `AdminTemplatesCerts.dc.html`: tabs الملصقات · الشهادات; قوالب
مؤسستك and قوالب المنصة; a card is a preview rendered by the one renderer with its bound fields as placeholders, the name,
«افتراضي» / «المنصة», the format chips and a menu (open, duplicate, set default, archive). On the certificates tab each
template shows **the one kind it serves**, and **the three defaults — حضور · تقديم · إنجاز — are named**.
**Acceptance:**
- A platform template is read-only until copied («انسخ لتعدّل»).
- Setting a default replaces the previous default **for that kind only**; there is never more than one per kind.
- Every template mutation is audited.

#### REQ-UIX-109 — A session's certificates: the mode and the template shown, held released, issued revoked
**Serves:** `REQ-CRT-004`, `REQ-CRT-011`, `REQ-CRT-014` · `DEC-177`, `DEC-178`, `DEC-236` · `09` `SCR-045`
`SCR-045` is rebuilt from `AdminCertificates.dc.html`: the mode and the template — **written here and nowhere else, before
completion** (`DEC-178`), shown as sentences after; محجوزة with row checkboxes, «أصدر المحدّد» and «أصدر الكل»; صادرة with member, kind, serial, issue date,
«PDF» and «ألغِ».
**Acceptance:**
- The serial renders in `<bdi dir="ltr">`.
- Revoking requires a reason, entered in a sheet; the verification page then shows «شهادة ملغاة» and never the reason.
- «PDF» goes through the one audited download route; no bare download link is rendered.
- A held certificate is not visible to its recipient and sends no mail.

#### REQ-UIX-110 — The designer, rebuilt over the kept engine
**Serves:** `REQ-DSG-019`, `REQ-DSG-020`, `REQ-DSG-028` … `031` · `DEC-093`, `DEC-096`, `DEC-235` §2 – §4, `DEC-237` §2 – §3 · `09` `SCR-056`/`057`
`SCR-056`/`057` is rebuilt from `AdminDesigner.dc.html` and `AdminDesignerElements.dc.html` on `REQ-UIX-107`'s frame: the
rail's items (العناصر · الحقول · الملفات · الهوية · الطبقات · الفحوصات with a count · الطبقة), the canvas on `ui/canvas-stage`
with handles, snap guides, rulers and the safe area, the floating toolbar's five controls, and the bar with **the variant
strip — one template, every format, per-format overrides**. Checks are a rail item with a count, never a modal; each
finding names its layer and selecting it opens that layer.
**Acceptance:**
- An untouched document exports identically in every format: no parity golden moves.
- Every drag has a single-pointer path that is not a drag, proven by a test using clicks alone.
- The numeric X/Y/W/H/rotation fields remain.

#### REQ-UIX-111 — The certificate canvas
**Serves:** `REQ-CRT-004`, `REQ-CRT-014`, `REQ-DSG-019` · `DEC-236` C3 – C5 · `09` `SCR-056`/`057`
The same editor on a landscape canvas (`AdminCertDesigner.dc.html`), the template's one page as its strip — **a
certificate has one preset, and the other orientation is its own template, reached by a link** (`DEC-148`,
`REQ-DSG-026`, `DEC-238` §3; the board's A3 chip is not built) — and a الحقول panel listing every certificate field the
runtime binds, **marked used or unused** — {المستوى} only for the `achievement` kind, {رمز التحقق QR}
bound to the verification URL. «معاينة بعضو» renders with a real member through the one renderer.
**Acceptance:**
- The checks fit the org's longest member name at the name layer's maximum lines.
- The QR field resolves to the one verification route, never a constructed string.

#### REQ-UIX-112 — The email gallery and the block builder
**Serves:** `REQ-NTF-009` … `REQ-NTF-015` · `DEC-235` §3.2, §4 (`DEC-NEXT-35`) · `09` `SCR-058`
`SCR-058` is rebuilt from `AdminEmailGallery.dc.html`, `AdminEmails.dc.html` and `AdminEmailAdd.dc.html`: a gallery card
per message (thumbnail, name, category, enabled state, send count), and an editor on `REQ-UIX-107`'s frame — blocks,
layouts, global styles and the selected block's content and style, the email at 600 px with selectable rows, the device
toggle, a preview with a real session and a test send to the admin's own address.
**Acceptance:**
- Every drag has a single-pointer path that is not a drag, proven by a test using clicks alone.
- The message set is `08`'s; a test send reaches only the admin's own address.

#### REQ-UIX-113 — Members and the people waiting are one screen
**Serves:** `REQ-TEN-009` · `REQ-ADM-009` · `DEC-243` §7 · `09` `SCR-049`
`SCR-049` **gains** «أضف عضوًا» as its one primary action and shows the people who have been named but have not
signed in **in the same table as the members**, marked «لم يسجّل الدخول بعد» with their age, «أعد الإرسال» and
«ألغِ الدعوة». ★ The screen is **extended, not rebuilt**: there is no artboard for an add affordance, no page file
is deleted, and no new primitive is added.
**Acceptance:**
- A waiting row offers no role change, no deactivation and no profile — it is not a member row.
- Revoking takes a mandatory reason, in a sheet, as every revoke in the console does.
- Several addresses are added at once, one per line, and each line is reported as added, already a member,
  already invited, or not an address.
- The counts the dashboard tiles and the rail's badges read are members; a waiting row is never counted as one.
- The console's sober register holds: no motion, no object, no sticker.


#### REQ-UIX-114 — The landing and the register page are rebuilt on «ساحة اللعب», and nothing they do changes
**Serves:** owner 2026-10-04 · `DEC-245` §1.3 · `DEC-247` · `REQ-NFR-019` · `DEC-167` · `09` `SCR-000`, `SCR-001`
`/`, `/ar`, `/en` and `/ar/register` are drawn from `Landing.dc.html` and `Register.dc.html`: the header with the mark,
the hero with its three poster objects and two actions, the seven companies as team rings, the four features, the two
four-step paths, the register band, the footer. `/og.png` carries the mark. Copy is `marketing.json`'s.
**Acceptance:**
- The five URLs answer as they did; `qa:contract` passes unmodified at every commit.
- The registration form posts the same field names from the same ids to the same action, validates as it did, and
  works with JavaScript off — proven by a behaviour fingerprint taken on `main` and on the branch, and equal.
- The accessibility floor holds: the sweep reports no finding on the five routes.
- The appearance, its re-baselined capture, the rewritten `qa:appearance` and the rewritten public-graph guard land in
  one commit with their `DECISIONS.md` entry.
- `registrations` is not read, altered or dropped.

#### REQ-UIX-115 — The verification page is rebuilt to its design
**Serves:** `DEC-245` · `REQ-CRT-007` · `REQ-CRT-011` · `09` `SCR-006`
`/verify/[code]` is drawn from `Verify.dc.html` in three states: valid, revoked, not found.
**Acceptance:**
- A valid certificate shows its six facts; a revoked one says «شهادة ملغاة» and **never the reason**; an unknown code
  says so and nothing else.
- The serial and the code are `dir="ltr"` inside `<bdi>`.
- The page needs no session and reveals nothing the page before it did not.

#### REQ-UIX-116 — The brand kit screen is rebuilt, read first
**Serves:** `DEC-245` · `REQ-ADM-015` · `REQ-DSG-021` · `DEC-201` · `09` `SCR-059`
`SCR-059` is drawn from `AdminBranding.dc.html`: read mode with one «عدّل»; the logo with its format, size and the A3
print result; the four fonts; the light and dark tokens; the team colours.
**Acceptance:**
- A colour is shown as a swatch **and** its value in words, never by colour alone.
- A palette the database refuses is refused on the screen with the database's reason (`REQ-DSG-021`).
- The screen says the kit feeds posters, certificates and email — not the app.
- The saved mark is read from the server's answer.

#### REQ-UIX-117 — Privacy is a hub page reached from settings
**Serves:** `DEC-245` · `REQ-PRF-006` · `REQ-PRF-007` · `REQ-PRF-008` · `REQ-NFR-013` · `REQ-EVT-012`
`/app/me/privacy` is drawn from `Privacy.dc.html`: the data export with its state, the photographs the member appears
in with «أزلني», the two legal links, and deactivation behind a confirm sheet.
**Acceptance:**
- The export shows each of its states — requested, building, ready with its date and «نزّل», expired — from the data.
- The profile-picture answer the page carried before is still given there.
- Deactivation asks before it acts and is the action it was.

#### REQ-UIX-118 — The platform console moves onto the console frame
**Serves:** `DEC-245` §1.2 · `REQ-ADM-001` · `REQ-ADM-002` · `REQ-ADM-003` · `REQ-ADM-019` · `REQ-TEN-002` · `REQ-TEN-006` · `REQ-TEN-007` · `REQ-NFR-014` · `09` `SCR-080` … `SCR-085`
★ **Amended by `DEC-254` §3.5:** `SCR-083`, the platform library, is withdrawn — **five** platform screens, not six.
The six platform screens are drawn from `Platform*.dc.html` on the console's bar and rail, with the platform's own nav
set and a «لا بيانات مؤسسات هنا» mark in the bar.
**Acceptance:**
- The orgs table and the metrics carry **counts**, never an org's content; no policy gains a super-admin disjunct.
- Deleting an org needs its slug typed back; suspending and reactivating are what they were.
- Impersonation takes an org, a mandatory reason and a duration, says it is recorded and visible to the org, and
  shows its log — and behaves exactly as it did. ★ It takes no member: the session carries none (`DEC-251` §2.1).
- The sober register holds: no motion, no object, no sticker.

#### REQ-UIX-119 — The mark is one component with three moves
**Serves:** owner 2026-10-04 · `DEC-245` §6 · `DEC-247` · `docs/design/assets/brand/logo/README.md`
The mark is an inlined drawing named «كريم معرفة». It **reveals** once on sign-in and on the landing, **breathes**
while the app waits longer than 400 ms, and **settles** once when pressed as the home control.
**Acceptance:**
- Under `prefers-reduced-motion` the mark is static in all three places.
- The reveal is not repeated on navigation.
- In a console or studio bar the mark never moves (`REQ-UIX-053`).
- The mark is a repository asset drawn by a component; nothing is uploaded (invariant 11).

#### REQ-UIX-120 — The mark stands wherever the written wordmark stood
**Serves:** owner 2026-10-04 · `DEC-245` · `REQ-UIX-027`
The app's bar, sign-in, the console and platform bars, the public card, the legal pages, the error page, the favicon
and the app icons draw the mark; the two wordmark components are deleted.
**Acceptance:**
- Inside `/app` the mark leads to `/app`; outside it, to `/`.
- No file imports a wordmark component, and neither file exists.
- The name remains as text only where it is a word in a sentence, and as the mark's accessible name.


---

## 24. Survey — `SUR`

*Added by `DEC-070`. The survey is a **staff instrument**, distinct from the rating
(`REQ-RAT-001` … `REQ-RAT-007`) in audience, policy and purpose — see `DEC-074`.*

#### REQ-SUR-001 — An optional per-session survey, built from a reusable org template
**Serves:** owner 2026-09-15 (ask 10) · DEC-074
A **جلسة** may carry one **استبانة**, created by staff from a reusable org-level template. It is
optional; most sessions have none.
**Acceptance:**
- A session with no survey shows nothing about one, anywhere.
- A template is reusable across sessions without copying its questions by hand.
- Every survey table carries `org_id`, RLS and a full policy set (`REQ-NFR-001`).

#### REQ-SUR-002 — Four question types, each required or optional
**Serves:** owner 2026-09-15 (ask 10)
Questions are **ordered** and typed: **مقياس 1–5**, **اختيار واحد**, **اختيار متعدد**, **نص حر**
(Western digits — `DEC-124`, corrected under `DEC-160`).
Each is required or optional.
**Acceptance:**
- Question order is authored and preserved, and is reorderable **without dragging**
  (`REQ-DSG-028`'s rule — the shared `ui/reorderable-list`).
- A required question blocks submission **of the survey** with an inline error and a summary entry
  (`REQ-UIX-009`, `REQ-UIX-010`).
- ★ It never blocks **the rating** (`DEC-164`). The rating's gates are the two `REQ-RAT-003` names and
  no others: on the one screen (`REQ-SUR-004`) a valid rating is written even when the survey is refused,
  the screen says both halves — «حُفظ تقييمك. أكمل الأسئلة المطلوبة لإرسال إجاباتك.» — keeps what the
  member had answered, and a second press submits the survey alone.

#### REQ-SUR-003 — Eligibility to answer is check-in, in the rating window, once
**Serves:** `REQ-RAT-003` · DEC-074
Exactly the members who may rate may answer: a **checked-in attendee**, within the same 14-day
window. **One member, one response.**
**Acceptance:**
- A member who did not check in cannot answer, enforced by the database — the one definer function
  that accepts an answer — not by the form.
- A second submission by the same member is refused, not silently duplicated. ★ **«Who has answered»
  is recorded apart from «what was answered»** (`survey_participations`, `DEC-160` §3): the refusal
  reads the first and never the second.
- The window is the rating window; there is not a second one to keep in step.

#### REQ-SUR-004 — The rating and the survey are one screen and two decorrelated writes
**Serves:** DEC-074 · DEC-094
A member answers one thing once, on one screen: `/app/sessions/[id]/rate` carries the rating first
and the survey below it. ★ **One screen — but not one submit and not one transaction.** The rating
is written by the action; the survey response is enqueued with a **jittered delay**, with **no
shared request id, correlation id or client-generated key**.
**Acceptance:**
- The member experiences one screen and one action.
- The two rows carry no shared identifier and no correlated timestamp. ★ **A stored response names
  no member and carries no timestamp at all** (`DEC-160` §3); the job that writes it carries the
  survey and the answers and nothing else, under a key not derived from the member.
- `ratings.submitted_at` **and `ratings.edited_at`** are stored coarsened to the **day**.

#### REQ-SUR-005 — Results are visible to `admin` and `moderator` only; a presenter cannot read them
**Serves:** owner 2026-09-15 (ask 10) · DEC-074
Survey results are readable by the **مشرف المؤسسة** and the **مُنظِّم** of the owning org. **A
مُقدِّم cannot read them** — by policy, not by a UI condition. This is the point of the ask.
**Acceptance:**
- A presenter querying their own session's survey results directly is refused by RLS, and there is
  an explicit test case for it.
- No aggregate, count or distribution reaches a presenter by any route.

#### REQ-SUR-006 — The minimum-count withhold covers every question type, not only free text
**Serves:** `REQ-RAT-006` · DEC-094
Below the minimum response count, results are withheld — and the withhold applies to **scale means,
choice distributions and free text alike**.
**Acceptance:**
- A distribution over fewer than the minimum number of responses is withheld, not drawn.
- The screen says results are withheld and why, rather than rendering an empty chart.
- ★ **The response count is withheld below the minimum too**, and the minimum is a setting of its own
  with **a floor of 3** that an org cannot lower (`org_settings.survey_min_responses`, `DEC-161`): in a
  survey one person answered, publishing «1» is the other half of saying who.

#### REQ-SUR-007 — Results export as audited UTF-8-BOM CSV, in Western digits
**Serves:** `REQ-ADM-017` · DEC-095
Results export through the existing audited export path, **UTF-8 with BOM**, in **Western digits**
— as every surface is (`DEC-124`; the org numeral setting this sentence once named no longer exists).
**Acceptance:**
- The file opens in Excel and Google Sheets with Arabic intact and numeric columns parsed as numbers.
- The export writes an audit row.
- The withhold of `REQ-SUR-006` applies to the export exactly as it does to the screen.

#### REQ-SUR-008 — Response rate is shown against eligible attendees
**Serves:** owner 2026-09-15 (ask 10)
The results screen shows **نسبة الاستجابة** — responses over **eligible** attendees, not over
invitees — in Western digits (`REQ-INT-006`, `DEC-124`).
**Acceptance:**
- The denominator is the checked-in attendee count for that session.
- A session with no eligible attendees shows that, rather than dividing by zero.

#### REQ-SUR-009 — A survey response and a rating by the same member are never written correlated in time
**Serves:** DEC-094 · `REQ-RAT-004`
The timing of the two writes must not identify a rater. This is a storage guarantee, not a
presentation one, and it holds in every artefact — backups, exports, worker logs, error breadcrumbs
and data dumps.
**Acceptance:**
- ★ **Restated under `DEC-160` §3, which makes the guarantee structural.** A stored response has no
  member and no instant, so «the ratings within ±N minutes of a member's response» is not a set that
  can be formed. The RLS suite asserts the structure instead: `survey_responses` and
  `survey_answers` carry **no** member, check-in, rating or timestamp column and no foreign-key path
  to a member; the queued payload names no member; and a `ratings` row's two instants are midnight.
- No client role can select a response, an answer, or another member's participation; results leave
  the database only through the one function that applies `REQ-SUR-006`'s withhold.
- No log line, breadcrumb or job payload carries both rows' identifiers.

---

## 25. Session stories — `STO`

*Added by `DEC-245`, from `docs/design/screens/STORIES-USER-STORIES.md` — one requirement per STO-01 … 18, in its
order. A story is **generated from what a session does** and from what its attendees add; nothing in it is authored
by staff. Where `docs/design/05-stories.md` disagrees with the list below, this list wins (`DEC-248` §7).*

#### REQ-STO-001 — Every session has one story, and it is the session's
**Serves:** owner 2026-10-04 · STO-01
A published session has one story: its frames in time order. It belongs to the session, never to a person.
**Acceptance:**
- A story exists for every session from publication, and has no author.
- Its frames are read in the order their triggers fired.

#### REQ-STO-002 — A frame disappears 24 hours after its trigger
**Serves:** STO-02
**Acceptance:**
- A member is not shown a frame at or after its trigger time plus 24 hours.
- A ring with no visible frame is not drawn.
- An attendee's frame older than 24 hours is still readable by staff (`REQ-STO-017`), and by nobody else.

#### REQ-STO-003 — A story is visible to its org and to nobody else
**Serves:** STO-03 · `REQ-TEN-003` · `REQ-NFR-001`
**Acceptance:**
- A member of one org receives no frame of another, by policy and by test.
- The public card and the verification page carry no story.

#### REQ-STO-004 — A frame is generated within a minute of each of eight triggers
**Serves:** STO-04
The eight: the session is published · registration opens · registration closes · 24 hours before it starts · it goes
live · an attendee's photograph becomes visible · it completes · its materials are added.
**Acceptance:**
- Each trigger produces exactly one frame, however many times it fires or is retried. ★ Two triggers that are the
  same instant are one moment and one frame: registration opening **at** publication, or closing **at** the start,
  writes no frame of its own (`DEC-251` §4.3).
- The frame is readable within one minute of its trigger.
- The live frame shows the count of people checked in, current while the session is live.
- The recap shows attendance, the rating — **only at or above the org's minimum** (`REQ-RAT-006`) — and materials,
  with the first three photographs.

#### REQ-STO-005 — A reaction on a frame is one of four, and earns nothing
**Serves:** STO-05 · `REQ-EVT-004` · `REQ-PTS-010`
**Acceptance:**
- A member holds at most one reaction on a frame; choosing another replaces it.
- Counts are visible; no ledger row is ever written for a reaction.

#### REQ-STO-006 — The ring row shows each session's story state
**Serves:** STO-06 · `REQ-UIX-040`
**Acceptance:**
- A ring is live, unseen, or seen — seen when the member has viewed every visible frame — each told apart without
  colour.
- Live rings come first, then the newest.
- A session with no visible frame has no ring.

#### REQ-STO-007 — A ring opens the viewer on the first unseen frame, and every gesture has a plain alternative
**Serves:** STO-07 · `DEC-093` · `REQ-NFR-007`
The viewer shows segmented progress, the session with its team ring, its title, its presenter and company, the frame's
age and a close control. A frame advances on a timer. Tapping the start third goes back and elsewhere goes forward;
holding pauses; swiping down closes.
**Acceptance:**
- Next, previous, pause and close each exist as a visible control operable by a single tap, and by a key —
  ← → Home End Space Escape, the arrows following the reading direction.
- A test drives a whole story with single clicks alone, and another with the keyboard alone.
- The viewer is a dialog: focus is held inside it and returns to the ring on close.
- Under `prefers-reduced-motion` frames change without a slide.

#### REQ-STO-008 — A frame's one action goes where the frame points
**Serves:** STO-08
**Acceptance:**
- A live or upcoming frame offers «افتح الجلسة»; the recap offers «حمّل المواد», opening that section.
- «شاهد القصة» appears on a live session's page and opens the same viewer.

#### REQ-STO-009 — On a wide screen the viewer is the same viewer, centred
**Serves:** STO-09
**Acceptance:**
- From `lg` the viewer is centred at phone width on the ink ground, with the same controls and keys and none added.

#### REQ-STO-010 — What a member has viewed is remembered, and is theirs alone
**Serves:** STO-10
**Acceptance:**
- A viewed frame is recorded once per member, and the record survives a reload and another device.
- No member, and no staff role, reads another member's views.

#### REQ-STO-011 — A checked-in attendee adds a frame from the room
**Serves:** STO-11 · owner 2026-10-04 (`DEC-NEXT-41`)
A photograph by a tap or a video of up to 15 seconds by a hold, from the camera or the gallery, with one caption line.
**Acceptance:**
- «أضف» is present only for a member checked in to the session, from its start until 24 hours after its end, and the
  server refuses everyone else whatever the screen shows.
- Recording a video can be started and stopped by taps alone.
- The 15-second limit is enforced in capture and again on what was uploaded.

#### REQ-STO-012 — An attendee's photograph is an album photograph; a video is a frame only
**Serves:** STO-12 · `REQ-EVT-010` · `REQ-EVT-011` · `REQ-PTS-006`
**Acceptance:**
- A photo frame is created by the album's own upload: metadata stripped by the worker, the album's points under the
  album's cap.
- A video earns nothing and does not enter the album.

#### REQ-STO-013 — An attendee's frame says who posted it
**Serves:** STO-13 · `REQ-PRF-004`
**Acceptance:**
- The frame shows the poster's avatar with the team ring, their name, its age, the caption, and a video's length.
- It expires and takes reactions as any frame does.

#### REQ-STO-014 — «أزلني» hides a frame for everyone at once, video included
**Serves:** STO-14 · `REQ-EVT-012`
**Acceptance:**
- A member who says they appear in a frame hides it immediately, by the photographs' own mechanism, audited.

#### REQ-STO-015 — A reported frame is hidden on the first report and goes to the photo queue
**Serves:** STO-15 · `REQ-EVT-014` · `REQ-ADM-010`
**Acceptance:**
- One report hides the frame from members until staff decide.
- The report appears in the existing queue, and a video can be played there.

#### REQ-STO-016 — A video is short, small, one rendition, and carries no metadata
**Serves:** STO-16 · `DEC-181` · `REQ-EVT-011`
**Acceptance:**
- A video over 15 seconds or 60 MB is refused, measured on the server.
- It is transcoded by the worker to one MP4 rendition, with every container tag removed — location included.
- A failed transcode says «تعذّر» to its poster and shows nothing to anyone else.
- The video is deleted with its session.

#### REQ-STO-017 — Staff see every attendee frame on the session's attendance tab, and may remove one
**Serves:** STO-17 · `REQ-ADM-018` · `REQ-PTS-013`
**Acceptance:**
- «قصص الحضور» lists every attendee frame, past 24 hours too, with its poster and «أزل».
- Removing takes the frame from the story and, for a photograph, from the album; it is audited, and an award is
  reversed by a compensating row.

#### REQ-STO-018 — Generated frames need nothing from staff, and cancelling ends the story
**Serves:** STO-18 · `REQ-SES-010`
**Acceptance:**
- No screen authors, edits or schedules a generated frame.
- A cancelled session shows no frame to members and has no ring.

---

## 26. Out of scope

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
