# OPEN QUESTIONS

**Status:** `settled` · **Owns:** the `OQ-*` ID space
**Cites:** `_source-brief.md`, `01-prd.md`, `DECISIONS.md`

Gaps the brief did not close. **None of them blocks work**: every one carries a recommended
default, and the rest of the plan is written *on* that default. Answering a question differently
is a `DECISIONS.md` entry, not a rewrite.

**How to read an entry:** the default is what the PRD already assumes. If the owner agrees, the
question closes with no change to any document. If not, the entry names what moves.

| Field | Meaning |
|---|---|
| **Gap** | What the brief left unsaid. |
| **Default** | What the plan assumes, in force now. |
| **Why** | One line. |
| **If answered differently** | Which documents change. |

---

## OQ-001 — How is a session's end time set?

- **Gap:** A6 has the worker move `in_progress → completed` "at end time", but nothing defines
  where end time comes from. A4 collects an *expected duration* on the proposal, which is the
  presenter's estimate, not a schedule.
- **Default:** the admin sets **start time and duration** when scheduling; `ends_at` is stored,
  derived at scheduling time, and independently editable. The proposal's expected duration
  pre-fills it and is never authoritative.
- **Why:** the check-in window, the code's expiry, the rating window and three jobs all key off
  `ends_at`. It must be a stored column, not an inference.
- **If answered differently:** `02-domain-model.md`, `11-background-jobs.md`.

## OQ-002 — Does the waitlist keep promoting after the RSVP deadline?

- **Gap:** D20 closes *new* RSVPs at the deadline. D19 promotes from the waitlist "when a spot
  opens". A spot can open after the deadline.
- **Default:** **yes — promotion continues until the session starts.** Joining the waitlist
  closes at the deadline, along with new RSVPs; promotion off an existing waitlist does not.
- **Why:** the alternative wastes a seat that someone already asked for. The deadline exists to
  freeze planning numbers, and a promotion does not change the total.
- **If answered differently:** `01-prd.md` `REQ-RSV-*`, `11-background-jobs.md`.

## OQ-003 — Can a member leave the waitlist, and does it count as a cancellation?

- **Gap:** D21's cancellation cutoff speaks about RSVPs. A waitlist entry is not a seat.
- **Default:** leaving the waitlist is **free at any time and is never an إلغاء متأخر**. It
  cannot trigger a negative point action.
- **Why:** the member never held a seat, so no one was deprived of one. Penalising it would
  discourage joining the waitlist at all, which is the opposite of what a waitlist is for.
- **If answered differently:** `05-scoring-engine.md`.

## OQ-004 — What exactly is a تغيّب (no-show)?

- **Gap:** D40 lists "no-show after RSVP" as a negative action without defining the event.
- **Default:** **a confirmed حجز with no check-in event when the session reaches `completed`.**
  Evaluated once, by the job that completes the session. A late cancellation is *not* a no-show —
  they are two different actions in the catalogue.
- **Why:** it needs to be a discrete, dated, idempotent event to sit on the ledger at all.
- **If answered differently:** `05-scoring-engine.md`, `11-background-jobs.md`.

## OQ-005 — Can someone who never reserved a seat check in?

- **Gap:** a walk-in attends and enters the رمز الحضور. D24 says a verified check-in is the sole
  trigger for attendance rewards; it says nothing about requiring an RSVP first.
- **Default:** **yes.** Check-in does not require an حجز. The walk-in earns attendance points,
  may rate, may upload photos, and receives an attendee certificate — exactly like everyone else.
  Capacity is a *planning* limit on reservations, not a door policy.
- **Why:** D24 is written as an exclusive trigger in one direction ("only a check-in grants
  these"), not a conjunction. Anything else would mean a member in the room, verified by a code
  only announced in that room, is recorded as absent.
- **If answered differently:** `01-prd.md` `REQ-CHK-*`, `03-permissions-rls.md`.

## OQ-006 — When does rating open and close?

- **Gap:** D35 says "after the session". A17 gives a 14-day **edit** window without saying when
  submission opens or whether it ever closes.
- **Default:** rating **opens** when the session reaches `completed`, and **closes 14 days
  later** — one window for both submitting and editing.
- **Why:** two different windows would need two explanations in the UI, and a rating submitted
  three months later is not measuring the session.
- **If answered differently:** `01-prd.md` `REQ-RAT-*`, `08-notifications-calendar.md`.

## OQ-007 — How long are the comment edit and delete windows?

- **Gap:** D31 requires "edit/delete windows" and gives no durations.
- **Default:** **edit for 15 minutes** after posting; **delete own comment at any time**, as a
  soft delete that leaves a tombstone (**«حُذف هذا التعليق»**) when the comment has replies, so
  the thread does not lose its structure. Moderators and admins can remove at any time.
- **Why:** 15 minutes covers typos, which is what edit windows are for; a longer window lets
  someone rewrite a comment people have already replied to.
- **If answered differently:** `01-prd.md` `REQ-EVT-*`, `02-domain-model.md`.

## OQ-008 — What happens to a reported item while it waits for review?

- **Gap:** D31 requires report/flag. Nothing says whether a reported item stays visible.
- **Default:** **reported items stay visible** pending review, with **one exception**: a photo
  hidden through the *"remove photos of me"* takedown (DEC-005) hides **instantly**, before any
  review.
- **Why:** auto-hiding on report hands any member a mute button for any other member. The
  takedown is different in kind — the person asking is the person in the photo.
- **If answered differently:** `01-prd.md` `REQ-EVT-*`, `12-security-privacy.md`.

## OQ-009 — Is rating anonymity honest when only two people rated?

- **Gap:** D36 promises presenters see aggregates only. With N = 1 the aggregate *is* the rating;
  with N = 2 and a known attendee list, it is close to it. The promise is statistically fragile
  at exactly the sizes this product will see most often.
- **Default:** **do not show the presenter any aggregate below 3 ratings** — show
  «التقييمات تظهر بعد ٣ تقييمات» instead — and **say so in the UI to the rater**, on the rating
  form, so the promise being made is the promise being kept. Org admins are unaffected (D36
  explicitly gives them per-rater visibility).
- **Why:** the alternative is promising anonymity the maths cannot deliver. Better to state the
  threshold than to be quietly wrong about it.
- **If answered differently:** `01-prd.md` `REQ-RAT-*`, `09-sitemap-screens.md`.

## OQ-010 — What level titles and thresholds ship as defaults?

- **Gap:** D47 requires levels "configurable by the org admin" and names no defaults. An empty
  levels table means no member ever has a level.
- **Default:** five levels, org-editable, deliberately easy early and progressively harder — and
  named in the product's own register rather than in game language:

  | # | العنوان | Points |
  |---|---|---|
  | 1 | **مشارِك** | 0 |
  | 2 | **مشارِك نشِط** | 100 |
  | 3 | **صاحب أثر** | 300 |
  | 4 | **كريم معرفة** | 700 |
  | 5 | **سفير المعرفة** | 1500 |

- **Why:** the §6 guidance is explicit that early levels must be easy and levels must be tied to
  real privileges — level 3 is where **priority RSVP** turns on and level 4 where **hosting**
  does (D48), so the thresholds are not decorative.
- **If answered differently:** `05-scoring-engine.md`.

## OQ-011 — What badges ship as defaults?

- **Gap:** same as OQ-010, for D47's badges.
- **Default:** eight, org-editable:
  **أول حضور** (first check-in) · **أول جلسة** (first session delivered) ·
  **صوت مسموع** (5 sessions delivered) · **حاضر دائم** (10 check-ins) ·
  **سلسلة الشهر** (a full monthly streak) · **رأي يُعتد به** (20 ratings submitted) ·
  **مُقدِّم مُقيَّم** (average ≥ 4.5 over ≥ 3 sessions) · **كريم المعرفة السنوي** (annual
  recognition — the badge behind the live marketing copy's «تكريم سنوي»).
- **Why:** badges are the non-competitive half of the recognition mix; they need to exist on day
  one or the leaderboard is the only mechanic members ever see.
- **If answered differently:** `05-scoring-engine.md`.

## OQ-012 — What does "priority RSVP" mean mechanically?

- **Gap:** D48 names priority RSVP as a perk without defining it.
- **Default:** a **priority window** — members holding the perk can reserve a seat for a fixed
  period (default 24 hours, org-configurable) **before** general RSVP opens on that session.
  Perk-holders do **not** displace anyone who already has a seat, and do **not** jump an existing
  waitlist.
- **Why:** displacement would mean a member watching their confirmed seat disappear, which is a
  worse experience than not getting one. A head start gives the perk real value without taking
  anything from anyone.
- **If answered differently:** `01-prd.md` `REQ-RSV-*`, `05-scoring-engine.md`.

## OQ-013 — Who can see the live رمز الحضور?

- **Gap:** D22 says the presenter announces it. It does not say who else can see it.
- **Default:** the **host view** is open to the session's presenters, org admins and moderators —
  nobody else, at any time, including members who have already checked in.
- **Why:** moderators run event-day operations (A1) and the presenter's phone is the single point
  of failure otherwise. A member who can re-read the code can forward it from outside the room,
  which is the exact attack rotation exists to blunt.
- **If answered differently:** `03-permissions-rls.md`, `09-sitemap-screens.md`.

## OQ-014 — What happens to points when a comment or photo is removed?

- **Gap:** D40 lists "removed comment or photo" as a *negative* action. It does not say whether
  the **original award** is also taken back.
- **Default:** **two separate movements, both explicit.** The original award is reversed by a
  **compensating ledger entry** (never a delete — the ledger is append-only), reason
  «حُذف المحتوى». The *penalty* is a separate catalogue action, off by default at 0 like every
  other negative action.
- **Why:** without the reversal, deleting a comment after earning its points is free points.
  Without the separation, an org that wants no penalties still cannot avoid one.
- **If answered differently:** `05-scoring-engine.md`.

## OQ-015 — Who revokes a certificate, and what does the verification page then show?

- **Gap:** A13 requires a valid/revoked status. Nothing defines how a certificate becomes revoked.
- **Default:** an **org admin** revokes, with a **mandatory reason**, audited. The verification
  page shows **«شهادة ملغاة»** and **not** the reason. The PDF is not deleted — a printed copy
  cannot be recalled, and the page is the source of truth.
- **Why:** the reason is internal; the fact is what a verifier needs. Publishing the reason on an
  unauthenticated page would expose an employment matter to anyone holding a QR code.
- **If answered differently:** `01-prd.md` `REQ-CRT-*`, `12-security-privacy.md`.

## OQ-016 — What address does email come from?

- **Gap:** A22 names Resend. Multi-tenancy raises a question it does not answer: whose domain?
- **Default:** **one platform-verified sending domain** for all orgs, with the org name in the
  **From display name** — `كريم معرفة <no-reply@…>` — and the org's **reply-to** set to its admin
  contact. Per-org sending domains (SPF/DKIM per tenant) are a later addition and need no schema
  change: the sending identity is a column on the org.
- **Why:** per-tenant domain verification is real operational work per org, and there is one org
  at launch (DEC-004).
- **If answered differently:** `08-notifications-calendar.md`, `04-architecture.md`.

## OQ-017 — Is a session's language recorded?

- **Gap:** D5 makes the *interface* Arabic-first. A session itself might be delivered in English,
  and A15's filters do not include language.
- **Default:** a **`language` field on the session**, default `ar`, exposed as a filter and shown
  on the event page. It describes the **room**, not the UI.
- **Why:** a member who cannot follow an English session needs to know before they reserve a
  seat, and the field costs one column.
- **If answered differently:** `02-domain-model.md`, `09-sitemap-screens.md`.

## OQ-018 — Can a session be in a different time zone from its org?

- **Gap:** A20 sets an org default time zone. Nothing says whether a session may differ.
- **Default:** a session **inherits the org time zone**; a **venue may override it**, and the
  session then inherits the venue's. Display is always in the **viewer's** local zone with the
  session's zone shown alongside when they differ.
- **Why:** a group with offices in more than one city is ordinary, and an offline session's time
  is a fact about the room, not about the reader.
- **If answered differently:** `02-domain-model.md`, `10-i18n-rtl.md`.

## OQ-019 — What are the data retention periods?

- **Gap:** §6 requires "a documented retention policy" and gives no durations.
- **Default:**

  | Data | Retention |
  |---|---|
  | Sessions, materials, comments, photos | Life of the org |
  | **سجل النقاط** (ledger) | Life of the org — it is the audit trail for every balance |
  | **سجل التدقيق** (audit log) | 7 years |
  | Check-in attempt logs (including failures) | 90 days |
  | Rate-limit counters | 24 hours |
  | Notification delivery logs | 180 days |
  | Google Calendar OAuth tokens | Until disconnect, then deleted immediately |
  | Rendered export artifacts | Until the source document or template changes |
  | Deactivated member's personal data | Anonymised after 12 months; ledger rows keep a pseudonymous ID so balances still reconcile |

- **Why:** the ledger cannot be trimmed without breaking recomputation, which is a quality-bar
  requirement. Everything else is trimmed as tightly as its purpose allows.
- **If answered differently:** `12-security-privacy.md`.

## OQ-020 — Which achievements get certificates, and when?

- **Gap:** D49 includes "achievement holders (badge earners, leaderboard winners)" without saying
  which badges, which boards, which ranks, or on what trigger.
- **Default:** **badge certificates** are opt-in per badge (a flag on the badge, off by default —
  eight certificates for eight badges would devalue all of them). **Leaderboard certificates** go
  to the **top 3** of the **monthly** board and the **top 3** of the **annual** board, issued
  from the frozen snapshot, **released by an admin** rather than automatically.
- **Why:** a certificate is worth something in proportion to how rarely it is issued. Issuing from
  the frozen snapshot matters because a live board would reissue a different winner later.
- **If answered differently:** `01-prd.md` `REQ-CRT-*`, `05-scoring-engine.md`.

## OQ-021 — How many co-presenters can one session have?

- **Gap:** A5 allows more than one and sets no ceiling. Uncapped, it is an unbounded certificate
  and points multiplier.
- **Default:** **4**, org-configurable. Enough for a panel (A27 ships a panel template); small
  enough that the per-attendee bonus cannot be farmed.
- **If answered differently:** `02-domain-model.md`, `05-scoring-engine.md`.

## OQ-022 — What happens to a cancelled session's page and materials?

- **Gap:** A6 makes `cancelled` reachable from any post-approval state and says nothing about the
  content already attached.
- **Default:** the page **stays, with a prominent «جلسة ملغاة» banner**. Materials stay accessible
  to anyone who had reserved a seat. Comments freeze — readable, no new ones. No points are
  awarded, no certificates issued, and any synced calendar event is removed (D57).
- **Why:** a pre-read someone already worked through should not vanish, and a deleted page turns
  every shared link into a dead end.
- **If answered differently:** `01-prd.md` `REQ-SES-*`, `08-notifications-calendar.md`.

## OQ-023 — Can a member delete their own account?

- **Gap:** §6 requires that members can export their own data. It does not grant self-deletion,
  and PDPL makes the question worth answering explicitly rather than by omission.
- **Default:** **self-service export: yes.** **Self-service deletion: no** — a member requests
  deactivation and an org admin performs it, after which personal data is anonymised on the
  schedule in OQ-019 while ledger rows keep a pseudonymous ID so org balances still reconcile.
- **Why:** a member's sessions, materials and comments are org content that other members depend
  on; a self-service hard delete would tear holes in other people's event pages. Anonymisation
  honours the erasure interest without doing that.
- **If answered differently:** `12-security-privacy.md`.

## OQ-024 — Does the platform ship any English UI at launch?

- **Gap:** D5 says English "is added later"; the existing site already serves `/en`.
- **Default:** the **marketing shell keeps `/en`** (it is a frozen public contract, A38). The
  **platform ships Arabic only**; `/en/app/*` routes redirect to `/ar/app/*` until the English
  message catalogue is complete. Every string is externalised from day one, so turning English on
  is a translation task, not a code change.
- **Why:** shipping a half-translated app is worse than shipping one language well, and the
  redirect is removable in one line.
- **If answered differently:** `10-i18n-rtl.md`, `04-architecture.md`.

## OQ-025 — Can the same person present and be counted as an attendee?

- **Gap:** D9 makes both per-session states of a member. It does not say whether they can hold
  both on the *same* session.
- **Default:** **no.** A presenter does not check in to their own session, does not earn
  attendance points for it, and does not rate it. They receive a **presenter certificate**, not
  an attendance one.
- **Why:** otherwise every presenter earns a 20-point attendance bonus for being in a room they
  are running, and a rating they submit for their own session pollutes their own aggregate.
- **If answered differently:** `05-scoring-engine.md`, `01-prd.md` `REQ-CHK-*`.

## OQ-026 — Does the Supabase project need to move to a Saudi or Middle East region?

*Raised by `12-security-privacy.md` §6.1 during Wave 3.*

- **Gap:** Saudi **PDPL** restricts transferring personal data outside the Kingdom, subject to
  conditions and exemptions. The live Supabase project is in **`ap-southeast-1` (Singapore)**;
  Resend, Sentry and Fly.io are likewise outside it. The brief's §6 asks that PDPL be noted
  "without assuming a specific hosting region", so the plan records the position rather than
  resolving it.
- **Default:** **stay in `ap-southeast-1` for now, and decide in M0** — before real member data
  exists, while migration is a configuration change rather than a data migration underneath a live
  platform.
- **Why:** this is a legal determination, not an architectural one. It needs the owner and whoever
  advises them on PDPL. The architecture treats the region as configuration either way, and
  Supabase offers a Middle East region.
- **If answered differently:** a new Supabase project in a permitted region, a Fly region change,
  and a review of the email provider's processing region. **No code changes.**

## OQ-027 — Where do the worker and the converter run in production?

*Raised by DEC-034 during M0.*

- **Gap:** Fly.io was the planned host for both (DEC-018) and is dropped on cost. Nothing in
  M0–M2 needs either in production; M3 (reminder emails) is the first milestone that does.
- **Default:** **run both locally and in CI until M3**; decide the host at the start of M3.
- **Why:** the code is host-agnostic — two Docker images, a session-mode Postgres URL for the
  worker, no credentials for the converter. Choosing with real usage to size against is cheaper
  than choosing now.
- **What the choice must provide:** a session-mode (port 5432) connection for LISTEN/NOTIFY; a
  place for `service_role` that is not Vercel; and **either** a private network path from the
  worker to the converter **or** an authentication token on the converter's endpoints (the
  converter's current security model assumes the former).
- **If answered differently:** a host change is a configuration change and an image push; the
  only code change is the converter token if the host has no private networking.
