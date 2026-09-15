# notes — `sessions` teammate (wave 1, M2)

Working notes for the PRO / SES track. Not a plan document: `01-prd.md` defines, `09` describes,
this file only records how I am building it and what I found. Append as I go.

---

## 0. Two discrepancies found on day one (lead, please read)

**0.1 — My screen numbers do not match `09`.** My agent definition says "screens SCR-008 … SCR-012
and SCR-014 (the event page)". In `09-sitemap-screens.md` the event page is **SCR-012**, SCR-014 is
**check-in** (`checkin`'s), and SCR-008/SCR-009 do not exist. `09` owns the `SCR-*` ID space, so I
follow `09`. My screens are:

| Screen | Route | Story |
|---|---|---|
| SCR-017 propose | `/app/propose` | PRO-001, PRO-002 |
| SCR-018 my proposal | `/app/propose/[id]` | PRO-004 |
| SCR-011 browse | `/app/sessions` | SES-006 (and DSC in M5) |
| SCR-012 **the event page** | `/app/sessions/[id]` | SES-006, the three slots |
| SCR-041 review queue | `/app/admin/proposals` | PRO-003 |
| SCR-042 sessions management | `/app/admin/sessions` | SES-002 |
| SCR-043 schedule and publish | `/app/admin/sessions/[id]/schedule` | SES-001 |
| SCR-046 venues | `/app/admin/venues` | SES-004 |

**0.2 — Four of those are under `app/admin/**`, which was not in my glob list. Resolved as
DEC-042.** `TEAM.md` gives `app/admin/**` to `console` in wave 3, but PRO-003, SES-001, SES-002 and
SES-004 are M2 and mine, and the M2 demonstrable ("propose → approve → schedule → publish → …")
cannot happen without them. The lead extended my ownership for wave 1 to
`src/app/[locale]/app/admin/{proposals,sessions,venues}/**` and `src/messages/{ar,en}/admin.json`,
handed to `console` at wave 3.

---

## 1. STORY-PRO-001 — propose a topic, and nothing schedule-shaped

**Covers:** `REQ-PRO-001`, `REQ-PRO-002` · **Screen:** SCR-017 · **Size:** M

### 1.1 What the requirement actually asks for

`REQ-PRO-001` is a **schema** claim before it is a form claim: "The proposal form **and its
validation schema** contain no date, time or venue field." Migration `0010` already holds up its
half — `public.proposals` has no such column, and `02` §4.3 says so in bold. My half is the Zod
schema and the form. The ★ acceptance in `15-backlog.md` is checked by a test that reads the
schema's own key set, not by a human scanning the JSX.

`REQ-PRO-002` fixes the field list and pins three Arabic labels to copy members have already read
on the live registration form.

### 1.2 The label match, and the one place I deviate

From `src/messages/ar/marketing.json` (frozen copy, lead-only — I read it, I do not touch it):

| Field | Pre-launch label | Proposal label | Same? |
|---|---|---|---|
| العنوان | `register.topicTitleLabel` = «عنوان الموضوع المقترح» | «عنوان الموضوع المقترح» | identical |
| التصنيف | `register.categoryLabel` = «تصنيف الموضوع» | «تصنيف الموضوع» | identical |
| النبذة | `register.descriptionLabel` = «نبذة عن موضوعك (جملة أو جملتان)» | «نبذة عن موضوعك» | **label identical, parenthetical dropped** |

The parenthetical «(جملة أو جملتان)» was a *constraint of the short pre-launch form*, where the
field capped at 600 characters and the copy promised «سنجهّز التفاصيل معك لاحقًا». On the platform
`abstract` runs to 2000 characters and is the text an admin reviews. Keeping "a sentence or two" on
a 2000-character field would be a false instruction, so it moves to the hint line («اشرح فكرتك
ومن سيستفيد منها») and the **label** — which is what `REQ-PRO-002` binds — is identical.

The four seeded categories are the four pre-launch ones, verified against
`0005_tenancy_rpcs.sql:371`: فني · إداري · إبداعي · درس من تجربة. Nothing to align.

Copy above the form, from `09` SCR-017 and the live site: «لست بحاجة لأن تكون خبيرًا.»

### 1.3 DAL — `src/lib/dal/proposals.ts`

`import "server-only"`, every function through `sessionClient()`, every return a DTO.

```
ProposalCategory  { id, name }
ProposalSummary   { id, title, categoryName, level, state, decisionReason, createdAt, updatedAt }
ProposalDetail    = ProposalSummary + { abstract, targetAudience, expectedDurationMinutes, adminNotes, categoryId }

listCategories(locale)            → ProposalCategory[]     active only, ordered by name
listMyProposals(locale)           → ProposalSummary[]      proposer_id = session.memberId, newest first
createProposal(locale, input, submit) → { id }             state 'draft' | 'submitted'
getOrgNumerals(locale)            → 'western' | 'arabic'   org_settings.numerals, REQ-INT-006
```

No RPC is needed to **create or submit**. `03` §5.2b is explicit: the asymmetric `using` /
`with check` on `proposals_update_own_editable` *is* the state machine, and `proposals_insert_own`
already permits `draft` and `submitted`. A plain insert is the right call; inventing an RPC here
would be ceremony that the policy already performs.

`decision_reason` is deliberately absent from the insert and from the input type — it is not in the
column grant either, so a proposer cannot write their own rejection reason at any layer.

### 1.4 The Server Action — `src/app/[locale]/app/propose/actions.ts`

`proposalInput` (Zod 4, shape not authority):

```
title                     string, trimmed, 3–150
abstract                  string, trimmed, 1–2000
categoryId                uuid
level                     enum introductory | intermediate | advanced
targetAudience            string ≤ 300, nullable
expectedDurationMinutes   int 15–480, nullable
adminNotes                string ≤ 2000, nullable
```

Mirrors the table's own checks so a violation is a field error, not a 23514 from Postgres. **There
is no date, time, venue, capacity or deadline key, and adding one is a test failure** — see 1.6.

One action, `submitProposal(formData)`, with an `intent` of `draft` or `submit`. Not two actions:
Server Actions dispatch one at a time per client and the two differ by a single boolean.
`redirect()` on success, back to `/app/propose?created=<id>&state=<state>`; on a Zod failure it
re-renders with field errors rather than redirecting to `?error=1`, because a 2000-character
abstract must not be thrown away (the pre-launch form's own copy promises «بياناتك ما زالت في
النموذج» and members will expect the same).

`useActionState` on a client wrapper for the error state; the fields keep their values.

### 1.5 Proposed SQL — `supabase/proposed/sessions/0001_proposal_transitions.sql`

Two things, and the reason they are a **trigger** and not an RPC:

1. **`proposals_audit_transition()`** — `after insert or update of state`, `security definer`,
   calls `public.write_audit(...)` with `proposal.created` / `proposal.submitted` / etc. and
   `before` / `after` jsonb. `REQ-PRO-006` says "No transition occurs without an audit row".
   `write_audit` is revoked from `authenticated` and granted only to `service_role`
   (`0005_tenancy_rpcs.sql`), so the row can only be written from a definer context. **If I put
   that in an RPC, the audit would be optional** — `03` §5.2b lets a member submit with a plain
   PostgREST `update`, bypassing any RPC I write. A trigger makes the audit row a property of the
   table, which is what "no transition occurs without" means.
2. **`proposals_guard_transition()`** — `before update of state`, the legal edge set of
   `REQ-PRO-006` (`draft → submitted`, `submitted → in_review | approved | rejected |
   changes_requested`, `in_review → …`, `changes_requested → submitted`), raising `23514` on
   anything else. The policy permits `changes_requested → draft`, which is a skip; `REQ-PRO-006`
   says "a proposal cannot skip states; the diagram in `02` is normative".

Header carries the `REQ-*` served and the `03` §8.2 rows, per `TEAM.md` §2.

### 1.6 Tests

| Test | File | What it pins |
|---|---|---|
| the schema has no schedule-shaped key | `tests/unit/…` → **no**, my glob is `tests/components/sessions/**`; it goes in `tests/components/sessions/proposal-schema.test.ts` | ★ `REQ-PRO-001`: `Object.keys(proposalInput.shape)` contains none of date/time/venue/capacity/deadline, and the strict schema **rejects** an object carrying one |
| labels match the pre-launch form | `tests/components/sessions/proposal-labels.test.ts` | reads `ar/marketing.json` and `ar/proposals.json` and asserts the three labels |
| all six ICU plural forms | same file | every key with a count carries zero/one/two/few/many/other |
| audit row on create and on submit | `tests/rls/proposals-transitions.test.ts` (`applyProposed()`) | `REQ-PRO-006` |
| illegal transition rejected | same | `changes_requested → draft` raises 23514 |
| a member cannot write `decision_reason` | same | column grant, 42501 |
| another org's proposal is invisible | same | `proposals_read_own_or_staff` |
| propose end to end | `tests/e2e/sessions-propose.spec.ts` | form submits, lands with the success state, the row exists |

The generated isolation sweep already walks `proposals`; nothing to add there.

### 1.7 Messages

`src/messages/ar/proposals.json` first (invariant 10), `en/` twin after, namespace `proposals`
added to `NAMESPACES` in `src/messages/index.ts` — the one shared line, appended, never reordered.
Keys are `feature.screen.element` and stable: `propose.form.title`, `propose.form.titleHint`, …

`<bdi>` on every interpolated value (the proposal title in the list and in the success banner).
Logical properties only. The duration numeral follows `org_settings.numerals`.

### 1.8 The 390 px RTL screenshot

One capture of `/ar/app/propose` at 390 px in the Playwright phone project, looked at by me, not
just taken. What I am checking: no horizontal scroll, the submit control ≥ 44 px and reachable, the
category `select` opening right-to-left, the hint lines not clipping tashkeel (no `overflow: hidden`
on a text line), and the number input's Latin digits sitting inside an RTL line without the label
and the unit swapping places.

---

## 2. STORY-PRO-002 — co-presenters, and the half that is blocked

**Covers:** `REQ-PRO-003` · **Screens:** SCR-017, SCR-018 · **Size:** M

### 2.1 `REQ-PRO-004` (draft materials) cannot be built in wave 1

There is no `materials` table. `0010` covers proposals, presenters, sessions, transitions, RSVPs,
codes, check-ins, attempts, comments, reactions, reports, ratings and the aggregates view, and
nothing else; `ENT-materials` arrives with M5, which is the `content` teammate in wave 2. Its
requirement also says draft materials "obey every materials rule (`REQ-MAT-*`)", none of which
exists yet. So STORY-PRO-002 ships its `REQ-PRO-003` half now and `REQ-PRO-004` waits for M5.
When it lands it is a small addition: attach on SCR-017, admin-only until publication, carried over
with its phase.

### 2.2 Three holes the schema left, closed in `0002_copresenters.sql`

1. **A named presenter could be in another org.** `proposal_presenters_insert_by_proposer` checks
   that the ROW's `org_id` is the caller's and that the proposal is theirs. Neither says the named
   MEMBER is in that org. `REQ-PRO-003` says only same-org members may be named, and A5's presenter
   points and `REQ-CRT-001`'s certificate follow the named row — so this is a tenancy hole, not a
   validation nicety. Closed by `presenter_is_same_org()` on **both** presenter tables.
2. **A co-presenter could be added to an already-approved proposal**, collecting presenter points
   and a certificate for a session nobody reviewed them onto. Naming now closes at the decision and
   stays open through review, because a change-request often *is* "add someone who knows the
   operations side". Deletes are deliberately **not** state-locked: a decline can arrive at any
   time and `REQ-PRO-003` says the declined member is removed.
3. **Creating a proposal with presenters was three PostgREST calls, so three transactions.** A bad
   co-presenter id would have left a proposal with nobody presenting it. `create_proposal()` makes
   it one act. It is `security invoker` — it exists for **atomicity, not authority**, so RLS and
   the column grants still decide, and it takes no `proposer_id` or `org_id` because both come from
   the claims and there is therefore no argument to lie in.

### 2.3 The proposer is a presenter row

`create_proposal()` writes the proposer's own `proposal_presenters` row with `accepted = true`.
Proposing is accepting. It also makes `presenters_within_limit`'s `max_co_presenters + 1` mean what
it says — the lead presenter plus four — which is how `tests/rls/m2-schema.test.ts` already reads
it ("presenter + attendee = 2 = max_co_presenters + 1").

### 2.4 SCR-018 exists now, thinly

A named co-presenter has to be able to *reach* their invitation, so `/app/propose/[id]` and a short
"مقترحاتي" list at the foot of SCR-017 arrive with this story. The pipeline view `REQ-PRO-008`
describes — the history behind each state — is still STORY-PRO-004.

Who may open SCR-018 is `proposals_read_own_or_staff`, not a check in the page: the proposer and
the named co-presenters, nobody else. A member who is neither gets no row, and no row is a **404**
rather than a message that would confirm the id exists.

---

## 3. STORY-PRO-003 — admin review with reasons

**Covers:** `REQ-PRO-005`, `REQ-PRO-006` · **Screen:** SCR-041 · **Size:** M

### 3.1 Why this one IS an RPC, when PRO-001's was not

`proposals` has **no admin update policy**. `0010` gives the table four policies and every one of
them is the proposer's, which is `03` §5.2b saying out loud that "Approval, rejection and
change-requests are admin RPCs". So an admin cannot write this table through PostgREST at all and
`SECURITY DEFINER` is the only way in — the opposite of `create_proposal()`, which is `SECURITY
INVOKER` because it needed atomicity and not authority.

That is also why `review_proposal()` opens with `assert_fresh_admin()`. A definer function bypasses
RLS, so the caller's claim to be an admin is re-derived from the members table against
`claims_version` (`03` §1.3) rather than believed.

### 3.2 One click for the admin, the real path in the record

`02` §6.1 has no edge from `submitted` to a decision — an admin opens a proposal and then decides —
and `0011`'s guard enforces it. Making the queue's approve button a two-step would be UI ceremony
for a rule about record-keeping, so `review_proposal()` walks `submitted → in_review → approved`
itself. The admin presses once; the audit log shows both moves.

### 3.3 Approval clears a previous change-request's reason

A proposal that went `changes_requested` (reason set) → `submitted` → `in_review` → `approved`
would otherwise still carry that reason, and SCR-018 would print it under «مقبول» as though the
admin had reservations. It belongs to the earlier decision and is preserved in the audit log, so
the row is cleared on approval.

### 3.4 Two things the review card got wrong first, worth not repeating

- **Three buttons share one form**, so a single `<textarea name="reason">` per decision meant
  `formData.get("reason")` returned whichever appeared first — a filled rejection reason could be
  replaced by an empty change-request box. The boxes are named for their decision.
- **`required` inside a collapsed `<details>` blocks the whole form.** A required control that is
  not focusable makes the browser refuse to submit, silently, including the approve button that has
  nothing to do with it. The reason is enforced in the action and again in the RPC, which is where
  it has to hold anyway.

### 3.5 A moderator gets a 404, not a message

`03` §5.2a makes a moderator `is_staff()`, so they *can read* proposals; `09` §7.1 gives them four
screens and this is not one. `listProposalsForReview()` returns null for anyone but an admin and
the route calls `notFound()`. A message would confirm the queue exists.

---

## 4. STORY-PRO-004 — admin-created sessions, and the pipeline the author sees

**Covers:** `REQ-PRO-007`, `REQ-PRO-008` · **Screens:** SCR-042, SCR-018 · **Size:** S

### 4.1 `REQ-PRO-008` was already standing

The policy `proposals_read_own_or_staff` is the whole of its acceptance ("A member sees only their
own proposals and those where they are a named co-presenter"), and SCR-018 already shows the state
and the admin's written reason. `listMyProposals()` does not add an application filter on
`proposer_id`, deliberately: that would take back what the policy grants a co-presenter and hide the
very row they have to answer.

### 4.2 `REQ-PRO-007` needed a third RPC, for a third reason

`sessions` has **no insert policy and no insert grant** — `0010` gives it `select` and a
four-column `update` (title, abstract, level, language) and nothing else. So an admin cannot make a
session through PostgREST at all, and `create_session()` is `SECURITY DEFINER` with the `03` §1.3
re-read. Three RPCs now, three different reasons, which is worth keeping straight:

| RPC | Why it exists | Security |
|---|---|---|
| `create_proposal` | atomicity — three inserts, one act | `invoker`, RLS still decides |
| `review_proposal` | there is no admin policy on `proposals` | `definer` + `assert_fresh_admin` |
| `create_session` | there is no insert policy on `sessions` | `definer` + `assert_fresh_admin` |

### 4.3 Three things the RPC settles

- **A proposal becomes at most one session.** `02` §2 draws it `proposals ||--o| sessions`, so the
  file adds the partial unique index the schema was missing. A second attempt is a 23505.
- **Only an `approved` proposal can be scheduled.** Otherwise an admin could route around their own
  review by scheduling a `submitted` one.
- **Creating schedules nothing.** No `starts_at`, no venue, no capacity — the function has no
  parameter for any of them and `directSessionInput` is `.strict()`. Creating and scheduling are two
  acts, which is D13/D14, and a test asserts the created row's `starts_at`, `venue_id` and
  `capacity` are all null.

An assigned presenter is inserted **not accepted**: `REQ-PRO-007` gives them the right to decline,
which they do not have if the admin accepted on their behalf. From a proposal, the presenters who
had accepted the proposal come across accepted, because they already answered.

### 4.4 The decline has to be a trigger, and it stops at publication

A presenter can set their own `declined_at` — the policy and the column grant both allow it — but
they have no grant on `sessions.state`, so "which returns the session to `draft`" cannot be their
write. A definer trigger does it and records the `session_state_transitions` row.

It deliberately does **nothing** to a published session. People have reserved seats against a
published session and silently un-publishing it under them would be worse than leaving an admin to
handle a presenter who has withdrawn; `REQ-SES-009` is the path for that.

### 4.5 `session.created_direct` vs `session.created_from_proposal`

`REQ-PRO-007` asks for a directly created session to be "indistinguishable from a proposed one
downstream, except in the audit log". The rows are identical apart from `proposal_id`, and the
difference is carried entirely by the audit action. A test asserts both halves.

---

## 5. The bug only the e2e could find: React 19 resets a form after its action

`tests/e2e/sessions-propose.spec.ts` "a rejected submission keeps every word the member typed"
failed, and it was not the test. **React 19 calls `reset()` on a `<form action={…}>` once the
action resolves.** Every uncontrolled field therefore comes back empty on a validation failure —
so a member who mistypes a three-character title loses the 2000-character abstract they just
wrote, and the copy that promises «بياناتك ما زالت في النموذج» becomes a lie.

Nothing else in the definition of done would have caught it. `tsc`, lint, the unit tests and the
RLS suite all pass on the broken version; the form only misbehaves in a browser, after a round
trip, on the unhappy path.

**The fix:** the action returns what was typed (`values`, `coPresenters`, and the admin's `reason`
on SCR-041) and every field reads its `defaultValue` out of that state, so the reset restores the
text instead of clearing it. The reason box on SCR-041 also reopens its `<details>` when a reason
came back, or the admin would be looking at a collapsed summary and an error telling them to write
something.

**Carry this to every form in the wave** — it is not specific to proposals.

---

## 6. STORY-SES-001 — schedule and publish

**Covers:** `REQ-SES-001`, `REQ-SES-002` · **Screen:** SCR-043 · **Size:** L

### 6.1 The poster gate cannot be built yet

`REQ-SES-001` blocks publishing on six things: date, time, duration, venue, capacity **and the
ملصق**. Five are enforced by `0010`'s check constraint. The sixth cannot be: there is no poster
column, no `documents` table and no designer — that is M6 (`REQ-DSG-002`, DEC-012). SCR-043 says so
on the page rather than pretending, and the note is in the proposed file's header so it is picked
up when M6 lands. **This is the second half-blocked requirement in my track**, after
`REQ-PRO-004`'s draft materials.

### 6.2 The publish gate is the table's, and a test proves it as the owner

`15-backlog.md` marks it ★: "Publishing is blocked by a **database constraint**, not only by the
form." So the test that matters bypasses every code path and tries the update **as the owner**,
where only `0010`'s check can stop it. `publish_session()` re-derives the same list only to turn a
23514 into a message naming the gap, which is SCR-043's "incomplete" state.

### 6.3 Publishing walks the frozen chain

`02` §6.2 is frozen and has no edge from `draft` to `published`. An admin-created session has had
no review, so four buttons would be ceremony — but a synthetic `draft → published` row would record
a transition the model says cannot happen. `publish_session()` walks
`draft → submitted → in_review → approved → published`, one `session_state_transitions` row per
edge, every one `is_manual` and attributed to the admin, intermediate hops reasoned `publishing`.
Same shape as `review_proposal()` walking `submitted → in_review`. **Lead: this is a judgement call
about what the audit trail should look like, and may deserve a `DECISIONS.md` entry.**

### 6.4 Time zones are the venue's, then the org's

OQ-018. A `datetime-local` input carries no offset, so the action converts it **in the session's own
zone**, not the server's — otherwise «٦:٠٠ م» would mean the clock wherever Vercel happens to run
rather than the clock on the room's wall. The page converts back the same way for the form's
default values.

### 6.5 `ends_at` and the duration disagree on purpose

`REQ-SES-002` wants `ends_at` **stored**, derived at scheduling, independently editable; OQ-001
says the duration pre-fills and is never authoritative. So an explicit end wins over the
arithmetic, and the duration is kept as typed rather than back-computed. A test pins both halves.

---

## 7. SCR-012, the event page — and STORY-SES-006

**Covers:** `REQ-SES-013`, `REQ-SES-008`, `REQ-SES-011` (= STORY-SES-006) plus the three slots

### 7.1 The slot contract held

All three implementations landed on `SlotProps` unchanged — `RsvpPanel` from `checkin`, `Comments`
and `Ratings` from `event` — so wiring them was three imports and the placeholders are deleted.
Nobody read anybody else's code. `slots.ts` stays, because the type is the agreement.

### 7.2 One conflict between `01` and `09`, resolved in `01`'s favour

`REQ-SES-011` says «لغة الجلسة» is "shown **before** the RSVP action, not below it". `09` SCR-012
numbers the action 3 and the language 5, with the abstract. Only `01-prd.md` may define a
requirement, so its acceptance wins: the language sits in the details block above the action, at
every width, and the abstract stays at 5. Worth a `DECISIONS.md` line if the lead wants `09`
corrected rather than merely overridden.

### 7.3 The primary action is one element, sticky

`REQ-SES-013` wants exactly one primary action, in the mobile thumb zone, reachable through the
whole scroll, ≥ 44 px. A duplicated button would break "exactly one", so the slot's wrapper is
`sticky bottom-0` on mobile: one element, in reading order at position 3, pinned to the thumb zone
visually. On desktop the same element is the sticky rail `09` asks for. It carries
`padding-block-end: max(1rem, env(safe-area-inset-bottom))`, because a bottom-pinned control on a
notched phone otherwise sits under the home indicator.

### 7.4 What is absent, and why nothing stands in for it

The poster (1), the preparation tasks (6), the materials (7) and the photos (9) are M5 and M6. The
page renders **nothing** in their place rather than a grey box implying they are coming, and the
comments say which milestone owns each. `REQ-SES-008` is absent by construction: there is no stream
URL, no join link and no remote-attendance field in the DTO, because there is none in the product.

---

## 8. STORY-SES-003 — the clock moves sessions, not people

**Covers:** `REQ-SES-004`, `REQ-SES-005` · **Jobs:** `JOB-start_session`, `JOB-complete_session`

### 8.1 The "skip manual transitions" check would have been a bug

`11` §2.1 says start_session "skips any session an admin transitioned manually". The obvious
implementation — read the last `session_state_transitions` row and skip it if `is_manual` — would
skip **every session in the product**, because `publish_session()` writes `is_manual = true` on the
publish: a person published it.

Both acceptance criteria hold on the state filter alone, and more strongly:

- "running the job twice moves a session once" — the second run finds nothing in the source state;
- "a session whose state was overridden by an admin is not moved back" — the two queries only move
  **forward** along `02` §6.2, so an admin who started early leaves it `in_progress` (start matches
  nothing), and one who completed early or cancelled leaves it `completed` or `cancelled` (neither
  matches). There is no path by which the clock reverses a person.

`is_manual = false` with a null `actor_id` is how these rows say "the clock did this".

### 8.2 The check-in window closes inside the completion

`REQ-CHK-004` has no room for a gap in which a session is over and its code still works, so
`clock_complete_sessions()` shortens every live code's `valid_until` **in the same transaction**.
`check_in_codes` is the `checkin` track's table and this is the one place I write it — it only
shortens a live window and touches nothing else. **`checkin` should know.**

### 8.3 `returns setof uuid`, not `returns table (session_id …)`

A `RETURNS TABLE` column named `session_id` is an OUT parameter, and every unqualified `session_id`
in the body — including the one in the transitions INSERT — then resolves ambiguously and the
function will not run at all. Cost half an hour. The session id is all either task needs.

### 8.4 Two things the lead has to do for these jobs to run

1. **Register the tasks.** `worker/src/index.ts` is not in my globs. It needs
   `import { start_session } from "./tasks/start_session.js";`, the same for `complete_session`, and
   both added to `taskList`.
2. **Schedule them.** Both are cron, every minute (`11` §2.1). There is no crontab in the repo yet.

`start_session` enqueues `rotate_codes` per started session rather than issuing the first code
itself, because `check_in_codes` is `checkin`'s. `complete_session` enqueues **nothing**: its four
fan-out jobs are M3, M4 and M6, and graphile-worker permanently fails a job whose task name has no
handler, so enqueuing them now would turn every completed session into a stuck job and a false
alert. The task's comment is the list each milestone adds itself to.

---

## 9. STORY-SES-002 — manual transitions and archiving

**Covers:** `REQ-SES-003`, `REQ-SES-005`, `REQ-SES-010`, `REQ-SES-012` · **Screen:** SCR-042

`transition_session(session, action, reason)` — start · complete · cancel · archive · reopen —
definer over `assert_fresh_admin()`, accepting only `02` §6.2's edges, writing one manual
transition row and one audit row per move, and closing the check-in window on complete **and** on
cancel because there is nothing left to attend.

`reopen` is `archived → completed`. The frozen diagram gives `cancelled` **no outgoing edge at
all**, so a cancelled session is not reopened — it is superseded by a new one. A test pins that all
four other actions are refused on a cancelled session.

### 9.1 Why the edge set is in the function and not in a trigger — the opposite of proposals

For `proposals` I argued the guard had to be a **trigger**, because `03` §5.2b deliberately lets a
member submit with a plain PostgREST update, so anything in an RPC would have been optional.

`sessions.state` is the other case. It is in **no grant** — `grant update (title, abstract, level,
language)` is the whole of an authenticated user's write — so there is no PostgREST path to the
column, and every writer is already a definer function this track owns: `create_session`,
`publish_session`, the two clock functions and this one. A table-level guard would still be the
stronger statement and I would like one, but it would begin refusing the direct
`update … set state` that fixtures and tests across all three tracks use to arrange a scenario.
That is a change to make deliberately at the **start** of a wave, not at its gate. **`0008` is
where it goes; I have not written it, on purpose.**

---

## 10. STORY-SES-004 — venues, list and one-off

**Covers:** `REQ-SES-006`, `REQ-SES-007` · **Screen:** SCR-046 · **No SQL at all**

Both halves were already true before I wrote a line, which is worth recording because the temptation
was to add code that only restated the schema.

- **"A venue in use by a future session cannot be deleted, only deactivated."** `venues` has
  `grant select, insert, update` and **no delete grant and no delete policy** (`0004`). Deletion is
  impossible for every authenticated role, in use or not — stronger than the requirement asks. So
  SCR-046 has no delete button and a sentence saying why, and the page's "upcoming sessions" count
  is explanation rather than a guard.
- **"Selecting a venue pre-fills the session's capacity, editable afterwards."** Done in
  `schedule_session()` under SES-001, with its own test.
- **`REQ-SES-007`'s one-off venue** — name and address both required, never added to the org's list
  — is also `schedule_session()`, tested there.

What remained was the screen: create, deactivate, reactivate, and the optional time-zone override
that OQ-018 lets a venue carry. Creation is a plain insert, because `p2_admin_insert` already says
who may and an RPC would only re-implement a live policy — the same argument as
`create_proposal`'s, in the direction of *not* writing a function.

---

## 11. The 390 px RTL review, and what the screenshots could not tell me

Both captures taken and looked at: `test-results/scr-017-propose-390-rtl.png` and
`scr-041-review-390-rtl.png`.

**SCR-041** reads correctly: the card's `dt`/`dd` pairs run label-then-value right to left, the
count renders «مقترح واحد» in the singular and the age «وصل اليوم» in the zero form, and the three
actions stack flush to the inline-start edge, each ≥ 44 px, with the primary first.

**SCR-017 taught me not to trust my own eye on a scaled capture.** Reading the PNG I was fairly
sure the duration row was reversed — the number box appearing to the left of «دقيقة» — and that the
co-presenter checkbox was on the wrong side. Both were **correct**; I was misreading a 333 px-wide
render of a 390 px page.

So the review is now two assertions rather than an opinion, and they live in the 390 px test:

- the number box's `x` is greater than «دقيقة»'s — «٤٥ دقيقة» reads number-first, so the numeral is
  the rightmost of the pair in RTL;
- the checkbox's right edge is past the midpoint of its row — a checkbox belongs at the
  inline-start, which is the right.

A mixed-direction row is the one thing in an RTL page that a screenshot review reliably gets wrong,
because both orderings look plausible at a glance. **Measure it.**

### Two e2e traps worth passing on

1. **Next's route announcer is `role="alert"`.** An unscoped `getByRole("alert")` is a strict-mode
   violation on every page, not a finding. Scope it to the form.
2. **The two device projects share one database.** A database assertion matching only on a title
   sees the other worker's row: both failures in my first full run were that, not the app. Scope
   every query by `org_id`.

---

## 12. Three defects the 390 px walk found on my own screens

None of these would have shown up in `tsc`, lint, the unit suite or the RLS suite. Two were mine.

### 12.1 The sticky action panel was hiding the very row `REQ-SES-011` protects

`09` SCR-012 asks for the primary action "sticky in the thumb zone… reachable through the whole
scroll", so the slot's wrapper was `sticky bottom-0` on mobile. The panel is about 380 px tall at
390 px, so pinning it to the viewport bottom pulls it **up over the tail of the details block** and
covers «لغة الجلسة» — the one row `REQ-SES-011` requires to be visible *above* the action.

`01-prd.md` is normative and `09` is descriptive, and `REQ-SES-013`'s own acceptance asks that the
action be "reachable without scrolling past the fold", not that it be pinned for the whole scroll.
So on mobile the panel is now in flow at position 3, inside the first screenful, with nothing
covered; on desktop it is still the sticky rail. **The lead may want `09` corrected here too, in the
same breath as the language-ordering conflict.**

The test now asserts the language's bottom edge is above the panel's top, not merely that its `y` is
smaller — the weaker check passed while the row was hidden.

### 12.2 The end time repeated the whole date

«الأربعاء ١٦ سبتمبر ٢٠٢٦ في ٦:٠٠ م · حتى الأربعاء ١٦ سبتمبر ٢٠٢٦ في ٧:٠٠ م». `sameDay()` compares
the two instants **in the session's zone**, not the server's, or a late-evening Riyadh session looks
like two days to a process running in UTC.

### 12.3 The category was labelled as a language

Moving the category up beside «لغة الجلسة» left it inside that `dd`, so the page read as though
«درس من تجربة» were a language. It has its own `dt`/`dd` now.

### 12.4 Not a defect: the RSVP panel is absent for a presenter

The first capture had no primary action, which looked like a broken slot. It is `REQ-CHK-011`
working: my walk's proposer carried across as the session's presenter, and `RsvpPanel` returns null
for them. SCR-012 is now captured as a **third** account who presents nothing, and the presenter's
own view is asserted separately — «شاشة التقديم» present, no RSVP control.

### 12.5 A limitation worth a decision, not a fix

`<input type="datetime-local">` renders its own placeholder and calendar in the **browser's** locale,
so SCR-043's four date fields show `dd/mm/yyyy, --:--` in Latin regardless of the page being Arabic.
`09` SCR-043 says "the date-time picker runs right-to-left". A native control cannot be made to;
the only way to honour that line literally is a custom picker, which is not small and which nothing
in M2 budgets for. **Flagged for the lead, not worked around.**

### 12.6 Two more the captures found on my own screens

- **SCR-042 had two buttons with one accessible name.** The «جاهزة للجدولة» card's control and the
  direct-create form's submit both read «أنشئ الجلسة». A sighted reader has two headings between
  them; someone tabbing hears the same phrase twice and cannot tell them apart (`REQ-NFR-007`). The
  visible label stays short and the accessible name now carries the proposal's title.
- **A native `datetime-local` cannot be made RTL.** SCR-043's four date fields render their
  placeholder and calendar in the **browser's** locale, so they show `dd/mm/yyyy` in Latin however
  Arabic the page is. `09` SCR-043 says "the date-time picker runs right-to-left"; honouring that
  literally needs a custom picker, which nothing in M2 budgets for. **Left for the lead** as either
  a `09` correction or a backlog item.

### 12.7 A capture's pixel width is not its review width

The phone project's captures are 1024 px wide and the desktop project's are 390 px, for the same
page. Both lay out at **390 CSS pixels**; the phone project inherits Pixel 7's 2.625 device pixel
ratio, so its PNG is 390 × 2.625. I spent a while treating that as a broken viewport. Measuring the
PNG is not how you check a 390 px review — `viewportSize()` is, and `review()` now asserts it,
because every other assertion in that helper passes *more easily* at a wider viewport and a wrong
one is invisible in the result. The two projects also write per-project filenames now, since they
run concurrently and were overwriting each other.

### 12.8 Where a capture must not be written

`test-results/` is emptied by Playwright at the **start** of every run, so in a shared tree another
teammate's run deletes your evidence between taking it and looking at it — three of mine vanished
between the `ls` that listed them and the read that followed. Captures go to `.qa-shots/rtl/`,
gitignored the same way, cleared by nothing.

---

## 13. The wave gate: the M2 demonstrable in one walk

`tests/e2e/sessions-screens.spec.ts` now runs the whole chain through the real screens, crossing
all three wave-1 tracks. Nothing is seeded except the org and its accounts; the only SQL in the walk
is the clock call, where the SQL *is* the point.

    add a venue → propose → approve → create the session → schedule → publish
    → reserve a seat → the CLOCK starts it → staff read the code → check in
    → comment → the ADMIN completes → rate

**Both transition paths on purpose.** The clock starts it, so `JOB-start_session` is proved against
a real published row and its transition row has a null actor; a person completes it, so
`REQ-SES-005` is proved and that row names the admin. The two rows side by side are the clearest
statement of what "the clock moves sessions, not people" means. The console's manual start is shown
to be *offered* and declined, so that control stays covered.

**Rows asserted:** `rsvps.status` confirmed · `check_ins.method = 'code'` · the comment's
`author_id` · the rating's stars and its non-null `check_in_id` (`REQ-RAT-001` made structural) ·
no live code survives completion (`REQ-CHK-004`) · the seven-step transition chain · the seven
`audit_log` actions in order.

### 13.1 Four races, one false positive, two wrong assertions — all mine

Nothing in the product was wrong. What was wrong is worth writing down because four of the six were
the same mistake.

**Clicking a Server Action returns immediately, so reading the database on the next line beats the
write.** Posting a comment, completing the session and submitting a rating each needed the UI to
confirm first: the composer clearing, «أرشف» appearing, the `?rated=1` redirect.

The comment one hid behind a **false positive worth knowing**: the composer is a *controlled*
textarea, so React renders the typed text as its DOM child and `getByText` matched the box I had
just typed into. It passed instantly, waited for nothing, and the row was not there. Scope such an
assertion to the posted list item, never to the page.

Two assertions were simply wrong about other people's code. A rater still inside the window sees
«عدّل تقييمك»; «شكرًا على تقييمك» is the *closed-window* state. And I asserted the presenter could
not see "5" — nonsense, since the average of one rating is 5 and the presenter is meant to see it.
**The D36 boundary is attribution, not the number.** The check is now that the rater's *name* never
appears beside the score, scoped to the ratings section, because she also commented and a comment is
attributed by design (`REQ-EVT-002`).

---

## 14. STORY — the public session card (post-launch, the owner's decision of 2026-09-15)

**Covers:** `REQ-SES-006`, `REQ-SES-008`, `REQ-SES-013`, `REQ-INT-003`, `REQ-INT-006`,
`REQ-NFR-001` · **Screens:** a new public route plus SCR-012's share affordance · **Size:** M

### 14.1 Two URLs, not one page with a signed-out branch

The event page is a member's page. It carries the abstract, the presenters by name, the capacity
and the seats left, the RSVP panel, the tasks, the materials, the photos, every comment and the
ratings — nine surfaces owned by three teammates, each of which will grow. Serving a second,
poorer document from the same URL when the caller has no cookie means every future addition to
that page has to be re-audited against «what does the signed-out branch render», forever, by
whoever adds it. One missed slot is a leak.

`/{locale}/s/{id}` makes the boundary a **route** instead of a conditional. The public page can
only render what `session_public_card()` returns, because nothing else is reachable from it; the
event page can only be reached with a session, because the proxy and `requireSession()` say so.
Neither has a branch that can be got wrong.

It also survives being pasted, which was the point: a crawler fetching `/app/sessions/{id}` gets
the sign-in redirect and previews the sign-in screen.

### 14.2 The read is a function, for the three reasons `verify_certificate()` is one

`public.session_public_card(uuid)` — `security definer`, `stable`, granted to `anon` and
`authenticated`. `anon` gains no policy on `sessions` and has none today.

1. **The return type is the allowlist.** A column added to `sessions` next year cannot leak by
   being selected accidentally, because there is no select.
2. **It is reachable only by id** — no list, no filter, no ordering. One link does not open the
   catalogue.
3. **Draft, submitted, approved, archived, cancelled, another org's, a suspended org's and a uuid
   that names nothing are all the SAME empty answer.** The card cannot confirm that an unpublished
   session exists. A suspended org's cards go dark with the org, which is what suspension means.

The venue's **name** is in the type; its address and map link are not. A stranger is told which
hall, never how to find the side door — `12` T3's line, which the owner's decision moved for six
fields and no further.

### 14.3 The image, and the four ways it was not done

The `og` preset (1200×630) is already rendered by the poster pipeline into the `exports` bucket,
which `anon` cannot read. `GET /api/s/{id}/og` calls the same function and then reads the object
**as the caller** through one additive storage policy.

| Rejected | Why |
|---|---|
| `service_role` in the Route Handler | Invariant 7. A key that bypasses every policy, on a request any stranger can make. |
| A signed URL in the `og:image` tag | It cuts both ways. A crawler caches the tag and re-fetches days later, after a five-minute signature has died — a broken preview on the one link that was shared. And a signature minted before a cancellation keeps working for its whole lifetime, so the image outlives the card. |
| Making `exports` public | It holds every poster master, every A3 print PDF and every issued **certificate**, each with somebody's name on it, for every org. |
| Re-rendering the card with `next/og` / satori | A second renderer. DEC-017 and D66 say `@kareem/designer-runtime` is THE renderer; a satori OG image is exactly the Arabic shaping drift the parity suite exists to catch, and it would drift silently because nothing compares the two. |

`POL-storage.exports.public_card` is `for select to anon` over `bucket_id = 'exports'` and a
definer predicate. **It has to be a definer predicate**: a policy expression referencing another
table is evaluated as the CALLER, and `anon` has no policy on `export_artifacts`, `session_posters`
or `sessions` — an inline subquery would see nothing and deny everything, looking correct and never
granting.

**Stated, not hidden:** holding a select policy on `storage.objects` means `anon` can *list* the
objects it matches. The paths are `{org_id}/exports/{document_id}/og.png` — two opaque uuids,
neither of them a session id, so a listed path cannot be turned back into a card URL, and the bytes
it names are exactly the bytes any link-holder may already fetch. Accepted.

### 14.4 The bug the CTA found, which is not mine to fix

`safeNextPath()` (`src/lib/auth/next-path.ts`, lead-only) rejects any candidate matching
`/[\s -]/`. The `-` there is literal, so **every path containing a hyphen is discarded** — and
every session id is a uuid. `?next=/ar/app/sessions/<uuid>` falls back to `/ar/app` today, which is
`REQ-AUT-005`'s poster-QR promise not being kept. `tests/unit/next-path.test.ts` never caught it
because its fixture id is `abc`. Handed to the lead with the one-line fix.

### 14.5 Tests

| Test | File | What it pins |
|---|---|---|
| exactly the six public fields, and the key set IS the allowlist | `tests/rls/sessions-public-card.test.ts` | the return type, not the component, is the boundary |
| draft / approved / archived / cancelled / unknown are one empty answer | same | the card cannot confirm an unpublished session exists |
| a suspended org's cards go dark, the other org's do not | same | per-org, not a kill switch |
| `anon` has no policy on the six tables behind the card | same | the function is the only door |
| `anon` reads the `og.png` and nothing else in `exports` | same | master, A4, `og.webp`, a certificate and a draft's poster all stay refused |
| a cancellation closes the image door too | same | the half a signed URL would have got wrong |
| absolute `og:image` in both `url` and `secure_url` | `tests/components/sessions/public-card-metadata.test.tsx` | a relative one is no image at all in half the crawlers |
| the description is date · venue · org in the ORG's numerals and zone | same | `REQ-INT-006` |
| a missing part drops instead of leaving a stray separator | same | the thing that only ever shows up in somebody's WhatsApp |
| signed out: six fields, no abstract, no address, no external link | `tests/e2e/sessions-public-card.spec.ts` | `REQ-SES-008` included |
| the image is served to an unauthenticated crawler, bytes intact | same | the whole feature, end to end |
| a draft's card and image are 404, same as a bad id | same | |

### 14.6 Open, with my default

- **Indexing.** The card is `noindex` (the layout's default, repeated explicitly). Preview crawlers
  read OG tags regardless, so previews work. The owner opened these fields to whoever **holds** the
  link; being findable by searching for the venue is a different decision and not this one. Default:
  keep `noindex` until the owner says otherwise.
- **`/s/` is not localised by `pathnames`.** `/en/s/{id}` renders the English catalogue rather than
  redirecting to Arabic, unlike `/en/app`. That is right for a shared link: the sharer's locale is
  in the URL. Default: leave it.
- **Cache 300 s.** Short for a public image, on purpose: a cancellation must stop serving quickly,
  and the poster is re-rendered when details change. Crawlers keep their own copy far longer; that
  is their cache, and it is the trade-off the owner accepted.
