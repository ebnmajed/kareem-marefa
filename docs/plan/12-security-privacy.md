# 12 — Security and Privacy

**Status:** `draft` · **Serves:** `REQ-NFR-001` … `REQ-NFR-006`, `REQ-NFR-012` … `REQ-NFR-015`,
`REQ-ADM-018`
**Cites:** `02-domain-model.md` (frozen), `03-permissions-rls.md`, `04-architecture.md`

---

## 1. Threat model

Who this product is actually exposed to, and what each party can try.

| # | Actor | Capability | Wants | Primary control |
|---|---|---|---|---|
| T1 | **A member of the org** | Valid session, full app access | Points they did not earn; seeing who rated them; reading another member's attendance | RLS + the check-in gate + A33 tiering |
| T2 | **A member of another org** | Valid session, different `org_id` | Any cross-org read | `org_id` immutable claim + RLS on every table (`REQ-TEN-003`) |
| T3 | **A curious outsider** | Unauthenticated, has a certificate QR | Enumerate recipients; learn about the org | Random verification code + rate limiting (DEC-010) |
| T4 | **A leaked check-in code** | The code, forwarded outside the room | Attendance points without attending | Rotation + grace + in-transaction rate limiting + burn (DEC-015) |
| T5 | **A malicious upload** | Member-uploaded PPTX or image | RCE in the converter; XSS in the renderer | Credential-free converter app + content sniffing + **no SVG** (DEC-009) |
| T6 | **A compromised Vercel function** | Env vars, request context | Database-wide access | `service_role` **never on Vercel**; RLS applies to app queries |
| T7 | **A super admin** | Platform access | Reading an org's data unobserved | **No data-plane access**; break-glass only, audited in the org's own log (DEC-014) |
| T8 | **A departing employee** | Valid session until deactivated | Bulk-exporting member data | Export audited and rate-limited; deactivation ends access immediately |
| T9 | **An org admin** | Full org control | Rewriting the ledger or the audit log | Both **append-only at the database**, `revoke` includes `service_role` |

**T1 is the realistic one.** This is an internal platform where everyone is a colleague; the threat
is not an attacker, it is a normal person finding that the system lets them do something it
shouldn't — seeing who gave them three stars, or noticing that points are easy to farm. Most of
this document is about T1.

---

## 2. Defence in depth

Five layers. **A control at one layer never assumes another is working.**

```
1. Network    CSP with per-request nonce · HTTPS · security headers
2. Session    getClaims() verified server-side · narrow on `data` not `error` · 900 s expiry
3. Input      Zod at every action and handler · content sniffing on every upload
4. Authority  RLS on every table · column grants · SECURITY DEFINER for invariants a policy can't hold
5. Audit      Immutable log · append-only ledger · nightly assertions
```

### 2.1 Network

Strict CSP set in `proxy.ts` with a **fresh nonce per request** (`REQ-NFR-003`). No `unsafe-inline`
in production script or style directives. Plus `Strict-Transport-Security`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`X-Frame-Options: DENY`, and a restrictive `Permissions-Policy`.

`frame-ancestors 'none'` everywhere **except** the embedded video player's own frame, which is the
one place a third-party frame is required (`REQ-MAT-007`).

### 2.2 Session

```ts
const { data } = await supabase.auth.getClaims()
if (!data?.claims) redirect('/sign-in')
```

**Narrow on `data`, never on `error`.** `getClaims()` returns a three-way union in which
`{data: null, error: null}` is a reachable no-session state. `if (error) redirect(...)` therefore
lets unauthenticated requests **straight through** while looking like a correct guard — the worst
kind of bug, because it passes review and passes a happy-path test.

Verification is **local, via WebCrypto** against a cached JWKS, so the check costs no round trip
and there is no excuse for skipping it.

`org_id` is an **immutable** claim; `org_role` and `status` are re-read from the table on every
privileged write, against a `claims_version` (`03` §1.3). JWT expiry is **900 s**.

### 2.3 Input

**Zod at every Server Action and Route Handler** (`REQ-NFR-002`), before anything else happens.

And the distinction that matters: **validation checks shape; it does not check authority.** A
well-formed `{ sessionId, materialId }` can name a row the caller has no business touching. So
every action takes a **reference plus the change**, and re-derives ownership server-side from the
session — never accepting the object's contents from the client.

Uploads are sniffed on **content, not extension** (`REQ-MAT-012`, `REQ-DSG-018`), after the bytes
land, because the pre-upload declared type comes from a client that may be lying.

### 2.4 Authority

`03-permissions-rls.md` in full. Three things worth repeating here because they are security
properties rather than modelling choices:

- **Cross-org reads are impossible, not filtered** (`REQ-TEN-003`). The generated isolation sweep
  (`03` §8.1) covers every table automatically, so a new table is protected the day it is created.
- **No super-admin disjunct exists on any policy** (DEC-014). An escape hatch on every policy would
  reduce D3's guarantee to "one claim is correct".
- **The check-in gate is one function.** `has_checked_in()` backs attendance points, the right to
  rate, the attendee certificate and photo upload (`03` §2). One definition, four rights, no drift.

### 2.5 Audit

Both `ENT-audit_log` and `ENT-points_ledger` `revoke update, delete` from **every** role **including
`service_role`** (`REQ-NFR-006`, `REQ-PTS-001`). Not even the worker can rewrite history; writes go
through `SECURITY DEFINER` functions that insert only.

---

## 3. Rate limits

`REQ-NFR-005`.

| Surface | Limit | Window | Where enforced |
|---|---|---|---|
| **Check-in attempts** | 10 per member per session | 10 min | **Inside the transaction** (DEC-015) |
| **Certificate verification** | 20 per IP | 1 min | Route handler, shared store |
| Sign-in attempts | 10 per IP | 5 min | Supabase Auth + handler |
| Material upload | 20 per member | 1 h | Handler |
| Photo upload | 30 per member per session | — | Handler + the per-session point cap |
| Comment | 30 per member | 1 h | Handler |
| Data export | 2 per member | 24 h | Handler |
| Search | 60 per member | 1 min | Handler |
| Designer export | 50 per org | 1 h | Job enqueue |

### 3.1 Why check-in rate limiting moved into the database

This repository has an **in-memory limiter** today (`src/lib/anti-spam.ts`). For the registration
form it is adequate: the form is backed by a unique index, so the real defence is the constraint
and the limiter only trims noise.

**It is wrong for code guessing.** Serverless memory resets per instance, so an attacker
distributing attempts across instances gets an effectively unlimited budget while the limiter
reports healthy numbers.

So the check-in counter is **rows in `ENT-check_in_attempts`, counted inside the check-in
transaction** (`03` §5.4b). And the attempt row is written **before** the limit is checked —
otherwise exceeding the limit is how you avoid counting toward it.

### 3.2 Certificate verification

Per-IP, because the caller is unauthenticated. With a 22-character random code the search space is
not brute-forceable regardless; the limit exists to stop scraping attempts from becoming a load
problem and to make the attempt visible.

---

## 4. Audit log design

`REQ-ADM-018`, `ENT-audit_log`. Append-only, retained **7 years** (OQ-019).

### 4.1 What is always audited

| Category | Examples |
|---|---|
| Tenancy | org created, suspended, domain added/removed |
| Roles | every role change, every deactivation **with its reason** |
| Sessions | published, edited, cancelled, completed manually |
| **Attendance** | **every manual mark, with its mandatory reason** |
| Check-in codes | every revocation |
| Scoring | every config change (old → new), every manual adjustment **with its reason** |
| Moderation | every removal, every takedown resolution, every restoration |
| Certificates | issued, released, **revoked with reason** |
| Ratings | **an admin reading per-rater ratings** (`REQ-RAT-005`) |
| Materials | **an admin downloading a material whose download is disabled** |
| Exports | **every CSV export** — a bulk read of personal data |
| **Impersonation** | start, end, expiry — **in the org's own log** |

### 4.2 Three of those are unusual and deliberate

**Reading per-rater ratings is audited.** D36 grants org admins that access; auditing it means the
access exists without being invisible. A presenter who suspects their admin looked up who gave them
two stars can be told the truth either way.

**An admin download of a download-disabled material is audited.** The presenter said no; the admin
can override; the override leaves a trace.

**Every CSV export is audited.** An export is the single largest personal-data read in the product,
and it is the T8 scenario in one click.

### 4.3 An action and its audit row commit together

`write_audit()` is called **inside the transaction that performs the audited act**. An action that
succeeds without its audit row, or an audit row for an action that rolled back, are both
impossible — which is what makes the log usable as evidence rather than as a hint.

---

## 5. Privacy

### 5.1 Data minimisation

| Collected | Why | Not collected |
|---|---|---|
| Name, avatar, email (Google) | Identity, notification | Phone, address, national ID |
| Company, job title, bio, interests | Leaderboards, discovery (D12, A3) | Salary, manager, department hierarchy |
| Attendance, ratings, comments, photos | The product | Location beyond the session's venue |
| Calendar tokens | D57 | Calendar **contents** — the scope is event-write only |
| IP and user agent on audit rows | Security | Behavioural tracking, ad identifiers |

**EXIF and GPS are stripped from every photo** before storage (`REQ-EVT-011`) — a phone photo in a
meeting room otherwise carries coordinates, a device identifier and a precise timestamp, and
sharing it org-wide would publish all three.

### 5.2 The four visibility decisions with a privacy rationale

From A33 / DEC-011, restated here because they are privacy controls, not UI preferences:

1. **Ratings given are never member-visible.** Otherwise D36's anonymity unwinds in one click — a
   presenter is an ordinary member on someone else's session page.
2. **تغيّب / إلغاء متأخر is admin-only.** Negative, HR-adjacent data. Publishing it stacks informal
   social punishment on the points system's designed consequence, and falls hardest on people whose
   schedules are not their own. **Self sees their own record**, so the system stays transparent to
   the person it judges.
3. **Sessions attended is not member-visible.** Attendance reveals who was in a room with whom, and
   by inference interests and affiliations. Sessions **presented** is visible — a talk is a stage.
4. **Calendar tokens are hidden from org admins too.** The one place admin access is narrower than
   member self-access. A token is a credential for a personal Google account, not org data.

### 5.3 Retention (OQ-019)

| Data | Retention | Enforced by |
|---|---|---|
| Sessions, materials, comments, photos | Life of the org | — |
| **Points ledger** | **Life of the org** | It is the audit trail for every balance (`REQ-PTS-011`) |
| Audit log | 7 years | `JOB-enforce_retention` |
| Check-in attempts (incl. failures) | 90 days | `JOB-enforce_retention` |
| Rate-limit counters | 24 h | `JOB-enforce_retention` |
| Notification delivery logs | 180 days | `JOB-enforce_retention` |
| **Calendar OAuth tokens** | **Until disconnect, then deleted immediately** | `REQ-CAL-007` — outside the schedule |
| Export artifacts | Until the source changes | `source_fingerprint` |
| Deactivated member's personal data | Anonymised after 12 months | `JOB-anonymise_members` |

**The ledger is not trimmed**, and that is a deliberate trade: it holds a member's participation
history for as long as the org exists. The alternative — trimming it — breaks recomputation, which
`REQ-PTS-011` requires and which is the only thing that makes `REQ-PTS-003`'s promise verifiable.

### 5.4 Anonymisation, and why deletion is not offered

`REQ-PRF-007`, OQ-023. **Self-service export: yes. Self-service deletion: no.**

A member requests deactivation; an admin performs it; personal data is anonymised after 12 months
while **ledger rows keep a pseudonymous ID** so org balances still reconcile. Authored content
remains, attributed to **«عضو سابق»**.

The reason to say no plainly rather than quietly: a member's sessions, materials and comments are
content **other members depend on**. A self-service hard delete would tear holes in other people's
event pages — a pre-read vanishing from a session someone is preparing for, a comment thread losing
its first message. Anonymisation honours the erasure interest without doing that, and the member is
told which it is.

### 5.5 Org deletion

`REQ-NFR-014`. Deleting an org removes its rows **and its storage objects**, with a post-deletion
assertion finding neither. Super-admin only, confirmed, audited, irreversible — and **distinct from
suspension** (`REQ-TEN-006`), which retains everything.

---

## 6. PDPL

`REQ-NFR-015`. The Saudi **Personal Data Protection Law** applies: the members are employees of a
Saudi group, and their personal data is processed here.

| Obligation | How the plan meets it |
|---|---|
| Lawful basis, stated | Employment/legitimate-interest basis stated in the privacy page, in Arabic |
| Purpose limitation | §5.1 — nothing collected beyond a named requirement |
| Data minimisation | §5.1 |
| Right of access | `REQ-PRF-006` — self-service export |
| Right of correction | Profile fields are self-editable |
| Right of erasure | §5.4 — anonymisation, with the limits stated honestly |
| Retention limits | §5.3, enforced by a job |
| Security measures | §2 |
| Breach notification | Incident runbook — §8 |
| **Cross-border transfer** | **See below** |

### 6.1 The hosting-region fact, recorded as a fact

**The live Supabase project is in `ap-southeast-1` (Singapore).** Resend, Sentry and Fly.io are
likewise outside the Kingdom.

PDPL restricts transferring personal data outside Saudi Arabia, subject to conditions and
exemptions. **This document does not conclude that the current arrangement is compliant, and it
does not conclude that it is not** — that is a legal determination, not an architectural one, and
§6 of the brief explicitly asks that PDPL be noted "without assuming a specific hosting region".

What the plan does instead:

1. **Records the region as a fact to revisit**, with the decision-maker named as the owner.
2. **Keeps the region a configuration choice.** Nothing in the architecture assumes Singapore.
   Supabase offers a Middle East region; moving is a project, not a redesign.
3. **Lists what would move**: the Supabase project (database, storage, auth), the Fly apps, and the
   email provider's processing region.
4. **Raises it in M0**, where a region change is cheap, rather than after real member data exists.

Recorded as **OQ-026** below so it is tracked rather than buried in a paragraph.

---

## 7. Secrets

`04` §10 holds the table. Two rules restated because they are security properties:

- **`service_role` is never on Vercel.** Anything needing it is a job. A compromised Vercel
  function (T6) gets the user's own RLS-scoped access, not the database.
- **The converter app holds no secrets at all** beyond its Fly token. The code parsing hostile PPTX
  (T5) gets two short-lived signed URLs. An RCE there yields those two URLs, not `service_role`.

Rotation: quarterly for API keys; **`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is stable across builds
by design** (`04` §9.2) and rotated only deliberately, because rotating it invalidates in-flight
action references — during a live session that is a member unable to check in.

---

## 8. Incident response

| Incident | First action | Then |
|---|---|---|
| **Check-in code leaked** | Presenter or moderator hits **«أبطل هذا الرمز الآن»** | New code issues instantly; prior check-ins stand; review attempts |
| Cross-org read observed | Disable the affected route; run the isolation sweep | Fix the policy; add the missing test; the sweep proves the fix |
| Storage prefix violation | Page immediately; the nightly assertion caught it | Fix the path builder; re-run the assertion across all buckets |
| Ledger divergence | Rebuild the rollup (safe, no ledger writes — `05` §4.2) | Find the cause **before** re-enabling awards |
| Tier A parity failure | The export already failed; nothing shipped | Check font manifest drift first — it is the usual cause |
| Credential leak | Rotate; audit the log for the window | Note the exception for the action-encryption key (§7) |
| Personal-data breach | Contain; assess; notify per PDPL timelines | Log the incident in the audit trail |

**The check-in row is first on purpose.** It is the most likely incident in this product, it
happens during a live event, and the response is one button — which is exactly why DEC-015 chose
stored codes over derived ones.

---

## 9. Known accepted risks

Stated rather than omitted. Each is a decision, not an oversight.

1. **Browser Supabase client** (DEC-020). Realtime requires it, which reverses the README's
   documented invariant. **RLS becomes the only thing between a browser and the data.** Contained
   by: the generated isolation sweep, column grants, and the absence of any super-admin disjunct.
   **Confirmed by the owner (DEC-021)**; server polling was the named alternative and is
   rejected. This is the risk in this list with the least slack: the sweep is the mitigation, so a
   red or skipped sweep converts an accepted risk into an unmitigated one. **DEC-022** adds the
   second control the plan had missed: Realtime does **not** inherit table RLS for broadcast and
   presence, so every channel is private and `realtime.messages` carries its own policies
   (`03` §7). An unconfigured channel is the one place a browser reaches data that §5's policies
   never see.
2. **Storage path prefixes** depend on application correctness (`03` §6). Contained by a single
   path builder, a restrictive prefix policy, and a nightly assertion.
3. **No virus scanning at launch** (`07` §2.3). Uploads come from authenticated members of a single
   organization; the riskiest parser holds no credentials. A scanning step slots in front of
   `JOB-convert_document` if the threat model changes.
4. **Rating anonymity is statistically fragile at small N.** Contained by withholding aggregates
   below 3 ratings and **saying so in the UI** (OQ-009) rather than promising what the maths cannot
   deliver.
5. **Points-per-active-member is gameable** by shrinking the denominator (`05` §6.2). Contained by
   freezing it in the snapshot, requiring a reason for deactivation, and always showing both
   metrics.
6. **`allow_download` is friction, not DRM** (`07` §6). Page images can be screenshotted. The UI
   does not imply otherwise.
7. **Hosting region and PDPL** (§6.1). Open, tracked as OQ-026, to be decided in M0.

---

## 10. Open question raised by this document

### OQ-026 — Does the Supabase project need to move to a Saudi or Middle East region?

- **Gap:** PDPL restricts cross-border transfer of personal data. The live project is in
  `ap-southeast-1`; Resend, Sentry and Fly are also outside the Kingdom. §6 of the brief asks that
  PDPL be noted **without assuming a hosting region**, so the plan records the position rather than
  resolving it.
- **Default:** **stay in `ap-southeast-1` for now, and decide in M0** — before real member data
  exists, when migration is a configuration change rather than a data migration with a live
  platform on top of it.
- **Why:** it is a legal determination, not an architectural one, and it needs the owner and
  whoever advises them on PDPL. The architecture treats the region as configuration either way.
- **If answered differently:** a new Supabase project in a permitted region, a Fly region change,
  and a review of the email provider's processing region. **No code changes.** Adding this to
  `OPEN-QUESTIONS.md` as OQ-026.
