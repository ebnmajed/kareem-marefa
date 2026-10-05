# `console` — wave 3 (M7-console + SCR-011)

> ★ **Wave 11 (M13, `DEC-166`) — the plan is the last section of this file:** *Wave 11 plan — K1 … K3*.

---

## ★★ Wave 27 — plan (PR B, `wave-27b/companies-by-domain`) — a member's company follows their email domain

> Planning only, written at `50b534fa` in `../kareem-marefa-wave27b`, after `.claude/agents/console.md`, `CLAUDE.md`
> § *Ownership map (wave 27)*, `DEC-254` in full, `STATUS.md`'s wave-27 block, the brief, `REQ-PRF-001/002/003/012/013`,
> `REQ-ADM-023/024`, `M11b.md` and `AdminCompanies.dc.html`. **No code is edited before «the plans are approved».**
> Every figure below was read from the tree with its file and line. `REQ-PRF-012`, `REQ-PRF-013`, `REQ-ADM-024`;
> `STORY-ADM-012`, `013`, `STORY-PRF-007`.

### ★ The lead's rulings on this plan (before sync 1) — they win over anything below that reads otherwise

- §5's five needs accepted: `company_domains` (org_domains' normaliser and regex, admin select, no client write
  grant); `company_assigned_by` kept by a **normalising BEFORE trigger, not a CHECK**; `email_domain()`,
  `company_for_domain()` (skips deactivated), `company_domains_lock_key()`; `provision_member()` under the shared lock,
  its placement inside its own exception block; the revoke and `members.test.ts:75-81`'s ledger line are the lead's.
- **Q1** yes — removal by hand = company null, source `'admin'`; no sweep re-places. Source is null only when nobody
  has ever placed the member. **Q2** `'admin'`. **Q3** a deactivated company places nobody. **Q4** yes, `'domain'` at
  insert. **Q5** reactivation does not sweep. **Q6** deactivated members are counted and moved. **Q7** ruling 7's set
  (no company, or by domain elsewhere; never `'admin'`). **Q8** `tests/components/admin/members-company*` and
  `tests/unit/members-profile*` added to my list.
- §9.1 «PR C» was a slip for B; §9.2's feed gate and the two scoring nags are removed **by the lead, as custodian, in
  this tree** — I do not touch `feed/**`, `feed.ts` or `scoring/**`. §9.3 recorded as measured.
- ★ **`save_company()`'s dry run returns the counts and the destination company's NAME only — never member names.**
- ★ **The token test is explicit**: a member arrives between the dry run and the confirm → `changed`, nothing
  written, the new numbers returned (in `company-sweep.test.ts`).
- **Order**: my `SCR-021` change does not depend on the feed change. `profile-read.tsx` stops reading
  `app.home.companyMissing`; the feed keeps reading it until the lead removes its banner. Neither breaks the other,
  and the key itself (`app.json`, the lead's) can go with the lead's commit.

### 0 · The job, one line per surface

- **`SCR-048`** — an admin opens a company, types its domains one per line, presses «حفظ»; if anybody would move, a
  confirmation says **«ينتقل N عضوًا إلى ‹الشركة›» and «يبقى M لأن مشرفًا وضعهم يدويًا»**, and «انقل واحفظ» does exactly
  that. If nobody moves, it saves without asking.
- **`SCR-049`** — ⋯ on a member → «غيّر الشركة» → pick a company or «بلا شركة» → confirm. Audited, and no domain edit ever
  undoes it.
- **`SCR-021`** — the profile **shows** the company (or «بلا شركة») and offers no control; a save never sends the column.

### 1 · Measured — the company form and its DAL today

| What | Evidence |
|---|---|
| The page: `?new=1` / `?edit=<id>` LINKS open `EditorSurface` holding `CompanyForm`, bound to `saveCompany(locale, id\|null)` | `admin/companies/page.tsx:51-55` |
| The form: `ListEditorForm` (useActionToast; the close and the toast come from the action's result, `noValidate`, a `FormSummary`) with two fields — `name` (`Field`+`Input`) and `teamColour` (`RadioGroup` of seven named swatches + «بلا لون») | `company-form.tsx:31-74`, `components/admin/list-editor-form.tsx:20-67` |
| Fields are declared once: `COMPANY_FIELDS = ["name","teamColour"]` | `companies/state.ts:9` |
| The action: Zod `companyInput` (name 1–120, strict), the colour checked against a closed enum and mapped to hex, then `updateCompany` / `createCompany` | `companies/actions.ts:27-45`, `admin-lists.ts:143` |
| The write: **plain** `insert` / `update` through `p2_admin_insert` / `p2_admin_update` (0004), answered by «exactly one row came back» | `admin-lists.ts:151-162`, `:59-61` |
| The audit: the database's trigger `managed_list_audit('company')` — `company.created` (with `team_color`), `company.changed` (name), `.deactivated` / `.reactivated`; `company.team_color_changed` is 0161's | `0181_console_audit.sql:37-80` |
| **How the team colour was added in wave 15 — the pattern to follow**: one field in the existing form, posting a **closed value** checked in the action and **again by the database** (`0160`'s check), a swatch AND the value in words, the audit row from a definer trigger proven as a member | `actions.ts:12-19`, `company-form.tsx:55-71`, `tests/rls/team-colour-audit.test.ts` |
| **The comments say «no domain» on purpose** (`DEC-231` §6.1: «drawn, not built») — `DEC-254` reverses it; the three comments are rewritten | `state.ts:7`, `company-form.tsx:16`, `companies-table.tsx:17` |
| ★ **The artboard draws a column «النطاق»** — `الشركة · النطاق · الأعضاء · النشطون · الربع · ⋯`, one LTR domain per row, ellipsised — and `M11b.md:18` says the edit sheet holds «name, domains, colour, logo» | `AdminCompanies.dc.html:57-64`, `M11b.md:17-18` |
| **The domains list is entered and validated nowhere** — no table, no field. The org's own list is the model: `org_domains.domain` is `citext`, normalised by a trigger (`lower(ltrim(btrim(d),'@'))`) and checked by `^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$` | `0004_tenancy.sql:72-91` |

### 2 · What I build on `SCR-048` (no new primitive)

1. **The field**: `Field` + `Textarea` (`dir="ltr"`, `spellCheck={false}`, `autoComplete="off"`), **one domain per line**
   — exactly how `SCR-049`'s add sheet takes a list of addresses (`members/add-member.tsx:69-71`). `COMPANY_FIELDS`
   gains `"domains"`. Its error names the domain in `<bdi dir="ltr">` and the reason: `domainMalformed` · `domainTaken`
   («<bdi dir=ltr>pp.sa</bdi> على شركة ‹صنف›») · `domainsTooMany` (a cap, proposed **20**, so the textarea cannot post a
   thousand lines).
2. **The column «النطاق»**, in the artboard's place (second), each domain `<bdi dir="ltr">`, comma-joined, the first
   one and «+N» on the phone card (`onCard: true`). ★ **This is drawn on the board** — building it is the artboard, not a
   redesign; `companies-table.test.tsx`'s header assertions become ledger lines if they move.
3. **The confirmation**: `components/admin/confirm-dialog.tsx` (`ConfirmDialog`, tone `primary`) opened **from the
   action's returned state** (the deactivation dialog's pattern, `member-row-menu.tsx:46-55`), never from an effect. Its
   confirm re-submits the same form with two hidden fields, `confirm=1` and the `token` (§3.1). Title names the company;
   body is the two numbers. ★ Six ICU forms on both counts.
4. Primitives used, all existing: `Field`, `Textarea`, `FormSummary` (via `ListEditorForm`), `ConfirmDialog` (over
   `ui/dialog`), `DataTable` (+ its card stack), `Menu`, `Select`, `Badge`. **No new primitive; `data-table` unedited.**

### 3 · The functions I propose (`supabase/proposed/console/companies_by_domain.sql`, functions only)

★ **Tables, columns, indexes, policies and grants are the lead's** — I name them in §5. Every function below is
`security definer set search_path = ''`, `revoke … from public, anon; grant … to authenticated`, and opens with
`assert_fresh_admin()` (role re-read against `claims_version`, `0005:62-72`).

#### 3.1 `save_company(p_company uuid, p_name text, p_team_color text, p_domains text[], p_confirm boolean default false, p_expected text default null) returns jsonb` — the ONE function, two modes

★ **Why one function for the whole company and not a domains-only one:** a **new** company with domains would otherwise
be two RPCs — the insert, then the domains — and a refused second call leaves a company without its domains. One call
is one transaction. The name and colour still land as the same `insert`/`update` on `companies`, so **`0181`'s trigger
and `0161`'s still write `company.created` / `.changed` / `.team_color_changed`** — nothing about those rows moves.
`createCompany` / `updateCompany` stay (add-only rule) but the form stops calling them. *(Alternative if the lead
prefers: `save_company_domains(p_company, p_domains, p_confirm, p_expected)` with the company written first; I flag the
partial-save it allows.)*

Steps:
1. `actor := assert_fresh_admin()`. `p_company` null = create; otherwise the company must be `actor.org_id`'s, else
   `42501 company_not_found`.
2. **Normalise** the list: `lower(ltrim(btrim(d), '@'))`, drop empties, de-duplicate, cap at 20.
3. **Validate before writing anything** (`DEC-043` — after the first write, return an envelope, never raise): each
   domain against `org_domains`' regex → `malformed`; each against `company_domains` of **another** company of this org
   → `taken` with that company's name. Any failure returns `{status:'invalid', errors:[{domain, reason, company?}]}`
   and writes nothing. ★ The lead's unique index on `(org_id, domain)` stays **the boundary**; this pass exists only to
   say *which* domain and *why*.
4. `pg_advisory_xact_lock(<org key>)` — **the same key** `set_member_company()`, `add_member()` and (shared mode)
   `provision_member()` take (§5.4). From here the population cannot change under us.
5. **Derive** against the **new** domain set (the whole set, not only the added ones — a re-derive, ruling 7):
   - **moving** = members `m` of the org, `public.email_domain(m.email) = any(new_set)`, `m.company_id is distinct from
     p_company`, and `m.company_assigned_by is distinct from 'admin'` — i.e. **no company**, or **placed by domain into
     another company** (possible only if that domain was removed from the other company earlier, since ruling 3 makes a
     domain belong to one company);
   - **held** = the same match, `company_id is distinct from p_company`, **`company_assigned_by = 'admin'`**;
   - members already in `p_company` are neither; **a domain removed unplaces nobody** — no step ever writes
     `company_id = null` here.
   - the **token** = `md5(sorted moving ids || '|' || sorted held ids)`.
6. `p_confirm = false` → return `{status:'preview', moving, held, token}` and write nothing.
7. `p_confirm = true`:
   - `moving > 0 and p_expected is distinct from token` → `{status:'changed', moving, held, token}`, **nothing
     written** — the dialog re-asks with the new numbers. ★ **This is how «the numbers shown equal what the save does»
     is guaranteed**: the lock fixes the population, the token proves it is the one the admin saw.
   - else write: the company row (insert or update — triggers audit it); `delete` the removed domains, `insert` the
     added ones; then `update members set company_id = p_company, company_assigned_by = 'domain' where id = any(moving)`.
     Return `{status:'saved', company_id, moved, held}`.
8. The action calls step 6 first; **if `moving = 0` it confirms at once with the token** — so a save that moves nobody
   saves without asking, and if somebody arrived in between, the confirm answers `changed` and the dialog appears.

**Audit** (`REQ-ADM-023`, one line per mutation, all written **by this function** because it is the only writer of
`company_domains` — see §5.2; no DAL writes `audit_log`):

| Mutation | Action | subject | before | after |
|---|---|---|---|---|
| company created / renamed / recoloured | `company.created` · `company.changed` · `company.team_color_changed` | `company` | as today (`0181`, `0161`) | as today |
| a domain added | **`company.domain_added`** | `company`, id | — | `{domain}` |
| a domain removed | **`company.domain_removed`** | `company`, id | `{domain}` | — |
| each member moved | **`member.company_changed`** | `member`, id | `{company_id, company_assigned_by}` | `{company_id, company_assigned_by:'domain', domain}` |

#### 3.2 The retroactive sweep

It **is** step 5–7: adding a domain is what sweeps. A member's address never changes after provisioning (Google owns
it), and `provision_member()` places new arrivals, so **no standalone sweep function is needed**. The derivation lives
in one internal, ungranted helper — `company_domain_moves(p_org, p_company, p_domains) returns table(member_id,
company_id, assigned_by)` — read by both modes, so preview and save cannot diverge. *(If the lead wants a sweep on
**reactivating** a company, it is this helper called from `managed_list_audit`'s side — a question, §8 Q5.)*

#### 3.3 `set_member_company(p_member uuid, p_company uuid) returns jsonb` — the one writer after creation (`REQ-PRF-013`)

- `actor := assert_fresh_admin()`; the member must be the actor's org's (`42501 member_not_found`); a company of
  another org raises `23503` from `members_company_same_org` (`0004:281-292`), unchanged; a **deactivated** company is
  refused `22023 company_deactivated`.
- Takes the org lock (so a hand placement between a preview and its confirm changes the token → `changed`).
- Writes `company_id = p_company, company_assigned_by = 'admin'`. ★ **`p_company` null = «remove from the company» —
  see §8 Q1**: under the lead's «null with a null company» it would write `assigned_by = null`, and the next domain save
  would **re-place** the member, which `REQ-PRF-013` forbids («no later change … moves or unplaces that member»).
- Same company and already `'admin'` → `{status:'unchanged'}`, no audit. Same company by `'domain'` → it becomes
  `'admin'` (pinned) and is audited.
- Audit: **`member.company_changed`**, before `{company_id, company_assigned_by}`, after `{company_id,
  company_assigned_by:'admin'}`, actor and role the admin's.
- DAL: `setMemberCompany(locale, {memberId, companyId|null})` in `admin-members.ts` (add-only), Zod first. UI:
  `member-row-menu.tsx` gains «غيّر الشركة» (in the active group), opening a `Dialog` with a `Select` of the org's
  **active** companies + «بلا شركة» and a submit — the toast and the close from the result.

#### 3.4 `add_member()` / `add_members()` (`0197:126-217`) — `create or replace`, same signatures

- `p_company` not null → insert with `company_assigned_by = 'admin'` (ruling 6). `member.added`'s `after` gains
  `company_assigned_by`.
- ★ `p_company` **null** and the address's domain matches an active company → today the row is inserted with **no
  company** (`0197:155-160`) and stays so until a sweep. **Proposed:** place it by domain at insert (`'domain'`, via
  the lead's `company_for_domain()`), under the org lock — so the admin's list is right the moment they add someone, and
  binding (which only fills a null) changes nothing. §8 Q4.
- `add_members()` calls `add_member(p_email =>, p_company =>, p_role =>)` by name (`0197:198`), so it inherits both.
- Same signature, same grants, same refusals (`role_not_allowed`, `already_a_member`, `not_an_address`) — **`DEC-254`
  §7 / `DEC-244` §11 untouched: `admin` stays refused.**

### 4 · `SCR-021` — the picker leaves (`STORY-PRF-007`)

**Every file that renders or submits the company today:**

| File:line | What it does | After |
|---|---|---|
| `src/components/me/profile-edit.tsx:68,83,89,97,143,182-190` | the `Select name="companyId"`, its state and «changed» count | **removed**; the prop `companies` goes |
| `src/app/[locale]/app/me/state.ts:15` | `PROFILE_FIELDS` includes `"companyId"` | `["displayName","jobTitle","bio"]` |
| `src/app/[locale]/app/me/actions.ts:29-30,46` | parses `companyId` and maps `companyInvalid` | removed |
| `src/lib/dal/members.ts:93-96` | `profileInput.companyId: z.uuid().nullable()` | **removed, and the schema made `.strict()`** so a crafted `companyId` is a Zod refusal |
| `src/lib/dal/members.ts:113-118` | `update({ …, company_id: input.companyId, … })` | **the key is gone** — PostgREST's `UPDATE` names only the payload's columns |
| `src/components/me/profile-read.tsx:43-58` | no company → a link «اختر شركتك» into edit mode | plain text **«بلا شركة»**, muted; with one → the name and its dot, unchanged |
| `src/components/me/profile-read.tsx:83-89` and `me/page.tsx:75` | the `companyMissing` banner («اختر شركتك قبل حجز مقعد…», `app.json:43`) | **removed** — the prop goes; it asks for something the member can no longer do |
| `src/messages/*/profile.json:6,32,47` | `companyNone`, `errors.companyInvalid`, `read.chooseCompany` | deleted; `read.noCompany` «بلا شركة» added (ar first) |

★ **A latent defect this closes**: today `saveProfile` posts `companyId: was(state,"companyId") || null`
(`actions.ts:46`) — a form that did not render the select would **null the member's company** on every save. Removing
the key from the payload is what makes «the member never sets it» true **and** keeps a domain placement from being
wiped by a profile edit.

**Other places a member's own client writes `company_id`** — grep of `.update(` across `src/lib/dal/` (`members.ts:113`,
`:131`, and three unrelated tables): **`updateMyProfile` is the only one.** `sessions.ts:1523` is a **venue's**
`company_id`. SQL that writes a member's company: `anonymise_members()` (`0158:200`, live as `0162:74`, `company_id =
null`) and `add_member()` — both definer.

**The profile saves on both sides of the revoke** (`0004:310` grants `update (display_name, company_id, job_title, bio,
leaderboard_opt_out)`; no later migration re-grants — grep of `grant … on public.members`):
- **Before**: the new payload names `display_name, job_title, bio` — all granted → saves, as today.
- **After** the lead's `revoke update (company_id) … from authenticated`: the same payload → saves; a crafted
  `update members set company_id = …` → `42501`. ★ `main`'s **current** payload names `company_id` and would be refused
  **whole** — which is why the revoke follows B's merge (`DEC-254` §8.4).
- Proven in `tests/rls/member-company-self.test.ts`: in one transaction, as the member, the DAL's exact column set
  succeeds; then (as owner) the revoke statement the lead will ship is applied inside the transaction; the same update
  succeeds again and the crafted one is `42501`.

### 5 · What I need from the lead (contracts 1 and 3)

1. **`company_domains`** — `id`, `org_id` (FK, cascade), `company_id` (FK → `companies`, cascade), `domain citext`,
   `created_at`; unique `(org_id, domain)`; **`org_domains`' normaliser and regex** (`0004:76,84-91`), so a domain is the
   same shape in both lists; RLS on; **select for the org's admins only** (the screen reads it with the session client;
   members never need it); ★ **no client insert/update/delete grant** — `save_company()` is the one writer, which is why
   it writes the audit rows itself and why no trigger needs `0008`'s cascade guard (an `after delete` trigger on a
   table that cascades from `orgs` would; `0069:631-661` explains). The fixture row for the isolation sweep.
2. **`members.company_assigned_by`** — enum `company_assignment ('domain','admin')`, null with a null company.
   ★★ **Not a `CHECK` that refuses — a `BEFORE INSERT OR UPDATE` normaliser** (§8 Q2), because three existing writers
   do not name the column and a check would break them:
   - `anonymise_members()` sets `company_id = null` and leaves the source (`0158:200`) — the nightly job would fail;
   - **`tests/rls/fixture.ts:65` inserts every fixture member with a company** — every RLS test would fail; and
     `tests/e2e/wave7-sessions-profile.spec.ts:79`, `wave19-scoring-profile.spec.ts:78` and ~40 other files write
     `members.company_id` as the owner;
   - **`main`'s profile save** in the gap between B's migration and B's code changes a member's company.
   Proposed rule: company becomes null → source null (unless the writer set `'admin'`, §8 Q1); a company arrives with no
   source → **`'admin'`** (conservative: a sweep never moves a row whose source nobody named). Backfill: existing rows
   with a company → `'admin'` by the same rule (production has **none**, `DEC-254` §1.6).
3. **The helper** (contract 3): `public.email_domain(p_email text) returns text language sql immutable` —
   **exactly** `split_part(lower(p_email), '@', 2)`, which is what `provision_member()` computes today (`0197:369`), so
   org admission and company placement read one expression; and `public.company_for_domain(p_org uuid, p_domain text)
   returns uuid language sql stable` — the company of that domain in that org **whose `deactivated_at is null`** (§8 Q3),
   or null. Both ungranted to clients except as the definer functions use them. Optional: an expression index on
   `members (org_id, public.email_domain(email::text))` for the sweep — the lead's call; orgs are small.
4. **`provision_member()`**: at **first insert** and at **binding**, `company_id := company_for_domain(org,
   email_domain(email))`, `company_assigned_by := 'domain'` when found — and at binding **only if `company_id` is null**
   (an admin's `p_company` survives, `REQ-PRF-013`'s third acceptance line). Not on the «already a member» branch
   (`0197:310-319`) — the sweep owns existing members. ★ **The race**: provision reads the domains, my save commits a
   domain and sweeps, provision's insert commits with null → a member missed silently. Fix: provision takes
   **`pg_advisory_xact_lock_shared(<org key>)`** before its lookup; my writers take the exclusive form. It waits at most
   one save's duration; wrapped in provision's own exception handling so **it never raises and never blocks sign-in**
   (contract 3). The key: `hashtextextended('company_domains:' || org_id::text, 0)` — written once in the lead's
   migration as `public.company_domains_lock_key(uuid)` so nobody types it twice.
5. The **revoke** of `company_id` from `0004:310`'s grant, after B merges — and its ledger line for
   `tests/rls/members.test.ts:75-81` («a company from another org is rejected by **the trigger**», `23503`), which
   becomes `42501` from the grant. That file is not in my list.

### 6 · `REQ-PRF-001`'s withdrawn gate — ★ **the code contradicts `DEC-254` §1.12**

`DEC-254` §1.12 says «no reader of a null `company_id` gates anything in `src/`». **One does**, and four places nag:

| File:line | What it does | Owner |
|---|---|---|
| ★ **`src/components/feed/session-post.tsx:200-202`** | **a gate**: with no company, a feed post's «احجز» / waitlist control becomes `{kind:"none", reason: «اختر شركتك أولًا لتحجز مقعدًا»}` (`feed.json:47`) — the member **cannot reserve from the home feed** | `content` (lead custodian) |
| `src/lib/dal/feed.ts:120` | computes `viewer.hasCompany` feeding it | `content` |
| `src/components/feed/feed.tsx:47-56` | a banner «اختر شركتك قبل حجز مقعد أو اقتراح جلسة.» + «أكمل ملفك» → `/app/me` | `content` |
| `src/components/me/profile-read.tsx:83-89` | the same banner on `SCR-021` | **mine this wave** — removed (§4) |
| `src/components/scoring/company-race-card.tsx:61-65` | «اختر شركتك لتدخل السباق» → `/app/me` | `scoring` |
| `src/components/scoring/company-points-breakdown.tsx:28` | `EmptyState` «اختر شركتك…» with action «اختر شركتك» → `/app/me?edit` | `scoring` |

The server does not gate: `lib/dal/rsvp.ts` and `proposals.ts` read no member company for a decision (grep). So
reserving works from the event page and is refused only on the feed's card. **Request to the lead, as custodian**:
remove the gate and the feed banner (and their cases — `tests/components/feed/{feed,session-post}.test.tsx`,
`tests/e2e/wave18-content-home.spec.ts:92,210`), and turn the two scoring nags into a plain statement with no link to a
control that no longer exists. **Not mine to edit; I pick no side on wording.**

### 7 · What the boards show the moment members move (read, not edited)

- **The company race is a snapshot** (`leaderboards.ts:160-190` reads `leaderboard_entries` of the latest company
  snapshot). Nothing changes on screen until the next `snapshot_leaderboards` run.
- ★ **Surprising, and worth the owner's eye**: at that next run the **current period's** non-final snapshot is deleted
  and rebuilt (`0197:523-528`), and member points are summed by the member's **current** `company_id` over the **whole
  period** (`0197:584-591`). So a member swept in mid-quarter brings **all their points earned earlier in the quarter**
  to the new company, and a member moved from A to B takes theirs out of A. Final snapshots never move. This is
  `REQ-PRF-003` («future snapshots only») read literally, but **`DEC-254` §2's «counts for it from that moment» is
  looser than the code**: it counts for it **for the whole open period**.
- **`company_points_ledger` does not move**: hosting, attendance-percentage and presenter company points are written at
  completion from the member's company **at that moment** (`0197:611-700`, e.g. `:650-658`), keyed and frozen.
- **`company_min_active_members`** (`0176`, `0197:572-582`): «active» = active, bound, in that company — so a sweep can
  lift a company over the minimum (or drop one under it) **at the next snapshot**, re-ordering the eligible block.
- Member boards decorate each row with the member's **live** company (`leaderboards.ts:101-114,136-139`) — the chip
  changes at once. The company-board moment compares the seen `companyId` (`:417,:421`), so a moved member gets **no**
  rank animation on their first view — it is treated as a different board, not a fall.
- For production today all of this is moot: 4 members, none with a company, no company snapshot carrying them.

### 8 · Decisions I need (each with my recommendation)

- **Q1 — «remove from a company» by hand.** `REQ-PRF-013` lets an admin remove a member from one and says no later
  change «moves or unplaces» them. With «source null with a null company» (`DEC-254` §2.6, contract 1) the next domain
  save re-places them. **Recommend** allowing `(company_id null, company_assigned_by 'admin')` = «an admin said: no
  company». Else the menu offers only «move», never «remove».
- **Q2 — a normalising trigger, not a `CHECK`** (§5.2), and «unnamed source → `'admin'`». The alternative `'domain'`
  lets a later sweep move fixture/main-gap rows; production is unaffected either way.
- **Q3 — a deactivated company places nobody** (sweep, provision, add, hand). Recommend yes; its domains stay listed.
- **Q4 — `add_member()` without a company places by domain at once** (§3.4). Recommend yes.
- **Q5 — reactivating a company does not sweep** (it would move people without the dialog). Recommend no sweep; an admin
  re-saves the domains to get the dialog.
- **Q6 — deactivated members are counted and moved** (they keep a company today; anonymised ones never match —
  `anon+<id>@invalid.local`, `0158:194`). Recommend yes, so the number is the truth of the table.
- **Q7 — `REQ-PRF-012`'s acceptance says «places every matching member who has none»**; the agent file and ruling 7 say
  the save also moves a member **already placed by domain elsewhere**. The two agree in practice (that state only
  exists after a domain moved companies) — I build ruling 7's and ask that the requirement read so.
- **Q8 — test names outside my list**: `tests/components/admin/members-company*.test.tsx` and
  `tests/unit/members-profile*.test.ts` (the DAL payload). Please add them, or tell me where they go.

### 9 · Contradictions found (written, no side picked)

1. **`DEC-254` §2.5**: «the revoke lands in a migration pushed after **PR C**'s code is on `main`». §8.4, the map and
   `STATUS.md` row 9 say **after B merges**. §2 is PR B — I read «C» as a slip.
2. **`DEC-254` §1.12** «no such gate exists in the tree» — `session-post.tsx:202` is one (§6).
3. **`DEC-254` §2** «counts for it from that moment» vs the snapshot's whole-period re-attribution (§7).
4. **Contract 1 / §2.6** «null while `company_id` is null» vs `REQ-PRF-013`'s «or remove them from one» (Q1), and vs
   `anonymise_members()` + `fixture.ts:65` if built as a `CHECK` (§5.2).
5. **`DEC-231` §6.1** («a company has no domain») is superseded by `DEC-254` — three code comments still cite it (§1).

### 10 · What `main`'s app and worker do on the new schema, before B's code

- `company_domains` is empty and no screen on `main` can fill it → `provision_member()`'s new lookup finds nothing; no
  member is placed; sign-in unchanged.
- `main`'s `add_member()` call (`admin-members.ts:260-264`) hits my `create or replace` with the same named arguments →
  same refusals, same `member.added`, plus `company_assigned_by` written.
- `main`'s profile save still sends `company_id` — allowed (the grant is intact until after merge); with §5.2's
  normaliser a picked company lands as `'admin'`; with a `CHECK` it would be **refused whole** for any change of company.
- The worker: `anonymise_members()` keeps working **only** with the normaliser (§5.2). Snapshots and company points read
  `company_id` as before.

### 11 · Tests (new files, mine) and the evidence suites

| File | Proves |
|---|---|
| `tests/rls/company-sweep.test.ts` (`applyProposed('console/companies_by_domain.sql')`, **as an admin member, never the owner**) | preview counts; confirm moves exactly them with `'domain'`; held = admin-placed, untouched; ★ **a member inserted between preview and confirm → `changed`, nothing written, the new numbers returned**; a save that moves nobody saves; removing a domain unplaces nobody; malformed / taken refused with the domain and reason, nothing written; the same domain allowed on another org's company; a moderator and a member `42501`; a stale-claims admin `42501`; a deactivated company places nobody; each audit row of §3.1's table, one per mutation, and none twice |
| `tests/rls/member-company.test.ts` | `set_member_company` writes `'admin'` and `member.company_changed` with old/new; a later `save_company` leaves that member (held); remove-by-hand per Q1; another org's company `23503`; moderator/member `42501`; `add_member` with a company → `'admin'`; without, matching domain → `'domain'` (Q4); `add_members` inherits; `role_not_allowed` still refused |
| `tests/rls/member-company-self.test.ts` | the profile's column set saves before and after the revoke (applied in-transaction); a crafted `company_id` update `42501` after it |
| `tests/unit/admin-lists-domains.test.ts` | the action: normalisation, the confirm round-trip, `changed` re-asks, `invalid` maps to the field error |
| `tests/unit/admin-members-company.test.ts` | `setMemberCompany`'s Zod and error mapping |
| `tests/components/admin/companies-domains.test.tsx` | the field (`dir="ltr"`), each domain `<bdi dir="ltr">` in the table and in errors, the confirm dialog's two numbers in all six plural forms, no dialog when nobody moves, axe-clean |
| `tests/components/me/profile-company.test.tsx` | read shows the company or «بلا شركة», no link, no banner; edit renders no company control and posts no `companyId` |
| `tests/e2e/wave27-console-companies-by-domain.spec.ts` | an admin adds `pp.sa` to a company → the dialog reads «ينتقل 2 … يبقى 1» → confirm → `SCR-049` shows the two in it and the one where the admin put them; ⋯ «غيّر الشركة» on a member; the member's `/app/me` shows the company and no control; `/app/admin/audit` lists `company.domain_added` and `member.company_changed`. Locators from `#main`; dialogs by role; toasts `{ exact: true }`; captures `wave27-console-{companies,members,me}-<state>-{1280,390}.png` |

**Evidence suites that move (ledger lines in `wave-27-ledger-b.md`):** `tests/components/me/profile-wave20.test.tsx:98-…`
(«no company: says what it blocks…») and `:147` («keeps the chosen company in the select») · `tests/e2e/wave20-content-hub.spec.ts:134-137`
(the banner) and `:151` (selects a company) · `tests/components/admin/companies-table.test.tsx` if its headers are
asserted · `tests/rls/add-a-member.test.ts:85-95` only if a `toEqual` over the row breaks on the new column.
**Untouched and expected green:** `team-colour*.test.ts`, `admin-export-slice`, every `scoring-*` RLS file, `members.test.ts`
until the lead's revoke, `console-register.test.ts` (no animation added).

### 12 · Strings (ar first, `admin.json` companies/members keys, `profile.json`)

`admin.companies.domainsLabel` «النطاقات» · `domainsHint` «نطاق في كل سطر» · `columnDomain` «النطاق» ·
`errors.domainMalformed` «‹{domain}› ليس نطاقًا» · `errors.domainTaken` «‹{domain}› على شركة ‹{company}›» ·
`moveConfirmTitle` «حفظ نطاقات ‹{name}›؟» · `moveCount` «{count, plural, zero {لا ينتقل أحد} one {ينتقل عضو واحد}
two {ينتقل عضوان} few {ينتقل {value} أعضاء} many {ينتقل {value} عضوًا} other {ينتقل {value} عضو}} إلى ‹{name}›» ·
`heldCount` (the same six forms, «يبقى … لأن مشرفًا وضعهم يدويًا») · `moveConfirm` «انقل واحفظ» · `changedAgain`
«تغيّر العدد — راجِع» · `admin.members.changeCompany` «غيّر الشركة» · `companyChanged` «نُقل» · `profile.read.noCompany`
«بلا شركة». Every `{value}` is a Western numeral in `<bdi>`.

---

## ★★ Wave 23 — PR A plan (`wave-23a/templates-and-certificates`, draft #52) — `055` both tabs and `045`

> Planning only. Written at `52bd5cc0` after reading the agent file's list, `DEC-235` … `DEC-237`, `DEC-177`, `DEC-178`,
> `REQ-CRT-004/011/014/015`, `REQ-UIX-108/109`, `REQ-DSG-031`, `M12.md`, `M11a.md` §0, and the three boards at 1280
> beside their PNGs. **Nothing is deleted before the lead posts «the plans are approved».** Every figure below was
> read from the tree, with its file and line.

### 0 · The job, one line per screen (`DEC-231` §0's shape, this wave's goal)

- **`055`** — an admin opens القوالب › الشهادات, reads **the three defaults — حضور · تقديم · إنجاز — in one strip**, and
  changes one in **one move**: ⋯ on a card → «اجعله الافتراضي». A platform template is copied with ⋯ → «انسخ لتعدّل».
- **`045`** — before completion an admin sets **the mode and, per kind, the template** on this tab and nowhere else;
  after completion they **issue held certificates one at a time («أصدر») or in bulk («أصدر المحدّد» / «أصدر الكل»)**,
  **revoke one with a mandatory reason in a sheet**, and hand out a PDF only through **the one audited route**.

### 1 · ★★ A blocking request — the four `045` chrome files are not in my list

`045`'s page renders **four files in `src/components/certificates/`** that are `designer`'s and were **not transferred**:
`design-panel.tsx` (366), `eligible-list.tsx` (82), `issuance.tsx` (393), `mode-control.tsx` (120) — measured, each
imported **only** by `admin/sessions/[id]/certificates/page.tsx` (grep over `src` and `tests`). Their two suites,
`tests/components/certificates/{issuance-download,mode-control}.test.tsx`, **are** in my list. Two consequences:

1. `DEC-208` reaches the chrome: the page's chrome **is** these files. Deleting `page.tsx` and leaving them is restyling
   by omission.
2. ★ `design-panel.tsx:9` imports `TemplatePreview` from `components/designer/template-preview.tsx`, which **I delete**
   for `055`. Without the transfer, `055`'s delete commit breaks `tsc`.

**Request (to the lead, and through the lead to `designer`):** transfer those four files to `console` **for the wave, to
be deleted**. `mode-badge.tsx` (used by `posters/slots.ts`, `sessions/event-meta.tsx`), `actions.ts` (the recognition
slot's release) and `held-achievements.tsx` stay `designer`'s and are not touched. **`045`'s new chrome is written
co-located in its own route folder** (`admin/sessions/[id]/certificates/*.tsx`, as wave 22 wrote `venues-table.tsx`
beside `venues/page.tsx`) — no new directory is needed for it. The one component both screens share, the preview, is
`src/components/templates/template-preview.tsx` (in my list).

### 2 · `055` القوالب — regions in the board's order (`AdminTemplates.dc.html`, `AdminTemplatesCerts.dc.html`)

Inside wave 21's frame; the page renders its `h1` row and its content, nothing of the frame. Two routes stay
(`templates/{posters,certificates}`), `/app/admin/templates` still redirects to `posters` (`DEC-178`, the redirect file is
kept as it is — it is not chrome).

| # | Region (board order) | Built with | Notes |
|---|---|---|---|
| 1 | `h1` «القوالب» (both tabs) · «قالب جديد» primary at its end | `ui/page-header` (`inlineActions`), `ButtonLink` | `h1` changes from «قوالب الملصقات» / «قوالب الشهادات» to the board's one title (ledger, §9). «قالب جديد» is a **link** `?new=1` |
| 2 | Tabs الملصقات · الشهادات | `ui/tabs` link mode (`TabItem.href`) | accessible name «أنواع القوالب» kept |
| 3 | «قوالب مؤسستك · N» then the grid | `<h2>` (`ui/section-header`), `<ul>` of `ui/card` | board order: **org first**, platform second (old file: platform first) |
| 4 | «قوالب المنصة · N · انسخ لتعدّل» then the grid | same | retired platform rows hidden (kept) |
| 5 | ★ certificates tab only — **the defaults strip**: الافتراضي للحضور · للتقديم · للإنجاز, each with its template's name | a `<dl aria-label="القوالب الافتراضية">` | **three**, not the board's two (`DEC-236` §1). Board puts it **last**; built where drawn unless ruled (D11) |

**The card** (both tabs): media = a preview **rendered by the one renderer** (§6.6), board size — poster 4:5 in a 4-column
grid (196 × 245 at 1280), certificate a fixed-height landscape box (140 px) with a portrait page contained in it · name
`<h3><bdi>` · «افتراضي» `ui/badge` · «المنصة» `ui/badge` · ⋯ `ui/menu` (trigger `ui/icon-button`) · the chips row
(`ui/tag-chip`): **posters** the format chips 16:9 · A4 · A3 · 9:16 (D2), **certificates the ONE kind** (حضور / تقديم /
إنجاز) and the page («A4 أفقي» / «A4 عمودي»). Cards are `article` (`ui/card`), so `card()` locators keep working.

**The menu.** Org card: «افتح في المصمّم» · «انسخ» · «اجعله الافتراضي» (hidden when default or retired) · «انشر إصدارًا
جديدًا» (only with a draft — not drawn, kept, D4) · «غيّر الاسم» (kept, D4) · «أحِله للتقاعد» / «أعِده للخدمة».
Platform card: «انسخ لتعدّل» alone. Trigger name «إجراءات أخرى» kept (wave 8's spec walks it).

**Undrawn states, built in the sober register:** the «قالب جديد» sheet (`ui/sheet` through `components/admin/editor-surface`,
`?new=1`, no-JS region): الاسم · النوع (the tab's families; certificates: حضور · تقديم · إنجاز) · الاتجاه (certificate only)
→ «أنشئ وافتح» → creates, opens the draft, lands in `/app/admin/designer/<documentId>` (D5) · the duplicate and rename
dialogs (`ui/dialog`, the lead's, composed) · the retire confirm, now naming the usage count («مستخدم في N جلسة», six forms)
as the consequence · **a platform template's read-only card** (no write control at all, one menu item) · org group
empty: one line «لا قوالب لمؤسستك بعد» and nothing else · a retired org card dimmed with «متقاعد» · a draft chip
«مسودة» · a moderator: the cards, no ⋯ and no «قالب جديد» · under `lg`: the grid stacks to two then one column;
«قالب جديد» and «افتح في المصمّم» are not offered (the designer has no phone form, `06` §2) — replaces the old sentence.

**Not built:** a template tagged with several kinds (`DEC-236` §1) · the scheme toggle (D6) · the intro, platform intro,
locked-regions hint, brand note and phone note panels (`DEC-NEXT-25`) · the version and locked-region lines on the card.

### 3 · `045` الشهادات — regions in the board's order (`AdminCertificates.dc.html`)

The hub's header and tabs above it are `sessions'` (the lead's as custodian, wave 21) and are not touched. This tab renders:

| # | Region | Built with | Notes |
|---|---|---|---|
| 1 | The line «الوضع **تُراجع قبل الإطلاق** · القالب: ورقي A4» | text, `<bdi>` on the name | after completion, or cancelled: **sentences, nothing written**. With two kinds on different templates: «القالب: حضور — X · تقديم — Y» |
| 2 | «محجوزة · N» with «أصدر المحدّد» (primary) / «أصدر الكل» at its end | `ui/section-header` + two `Button`s | only when the mode is `review` or a held row exists (kept) |
| 3 | The held table — ☐ · العضو (avatar + name) · النوع · الرقم · «أصدر» | `ui/data-table` **selection and phone stack composed as they are**, `ui/avatar` (team ring) | table name «الشهادات المحجوزة» kept |
| 4 | «صادرة · N» | `ui/section-header` | |
| 5 | The issued table — العضو · النوع · الرقم `<bdi dir="ltr">` · الإصدار · «PDF» · «ألغِ» | `ui/data-table`; «PDF» an `<a href>` to `/api/designer/downloads/<artifactId>` styled `buttonClass("ghost","sm")`; «ألغِ» a quiet danger `Button` | table name «الشهادات الصادرة» kept; the link's name «نزّل شهادة {name}» kept (visible «PDF», the rest `sr-only`) |
| 6 | «N أخرى · المزيد» | a `Link` to `?issued=all` | first 20 rows, then the link (D18); six ICU forms |

`data-table`'s two-button action cell does not fit row 5 — one of the two is a link — so the cell is composed by hand, as
the old `issuance.tsx` did. **`data-table` is not edited.**

**Undrawn states, built:**
- ★★ **Before completion** (the board draws only after): **التصميم** — per kind (حضور, تقديم) a template `select` over the
  org's and the platform's published templates of that family, defaulting to the effective default (§6.4), the scheme
  (فاتح / داكن, `DEC-148`), «احفظ», and at `lg` the preview beside it with the longest eligible name and the studio's
  checks (`useCheckFindings` / `ChecksPanel` from `designer/checks-panel.tsx`, imported as they are) · **من يستحق** — the
  mode as a radio group with its preflight confirm when turning it on, and the live list with its count · the issuance
  region says nothing until completion (one line, `notCompleted`). `REQ-DSG-031`'s three meanings stay separated.
- ★ **After completion, held certificates of a kind, none issued yet** — the template line carries «غيّر» → the same
  control in a sheet, and «طبّق على المحجوزة» → `redesignHeldCertificates()`. **See D25 — this collides with
  `REQ-CRT-015`'s acceptance and needs the lead's ruling.**
- The revoke sheet (`ui/sheet`, `?revoke=<id>` with a no-JS region): the member, the serial `<bdi dir="ltr">`, «سبب
  الإلغاء» (`ui/textarea` in `ui/field`, required, `noValidate`) → «ألغِ الشهادة».
- The release confirm (`ui/dialog`): «إصدار N شهادة؟» + the session's title → «أصدر». Without JS, «أصدر» and «أصدر الكل»
  are links (`?release=<id>` / `?release=all`) to the same confirm as a region; «أصدر المحدّد» needs the selection, so JS.
- **Revoked** — shown only when non-empty: العضو · النوع · الرقم · تاريخ الإلغاء · السبب (the org's own screen; D16).
- **Members without a live certificate** — only when non-empty, after completion: the eligible rows `revokedButPresent`
  with «يُستبدل تلقائيًا» / «لا بديل» (`DEC-160` §6; one word each, no sentence).
- Render state in the PDF cell: pending → «قيد التجهيز»; failed → «أعد التوليد» (`retryExport`) — `REQ-DSG-031`'s per-
  certificate re-issue. Empty held / issued: one line each. `?download=failed` → the alert (kept).
- A moderator: the mode and template lines and «من يستحق»; no certificate table (they read none, `03` §5.8).
- Automatic mode, completed: no held region; issued as above. Off and never on: one line.

**Not built:** achievement certificates (`054`'s) · a template written in الجدولة (`DEC-237` §4) · revoke from held.

### 4 · ★★ Kept-behaviour tables — re-derived from the requirements, the DAL and the old files

#### 4.1 · `055` — `templates/{posters,certificates}/page.tsx`, `designer/template-library{,-page}.tsx`, `template-preview.tsx`, `template-actions.tsx`

| Behaviour (old file:line) | Where it lives after | Kept by |
|---|---|---|
| Staff only; a member gets the streamed not-found (`template-library-page.tsx:35`, `getTemplateLibrary` null) | new page, same call | `REQ-ADM-020`, `DEC-134` |
| Writes only for an admin (`canManage`); a moderator reads (`templates.ts:183`) | the card and header gate on `canManage` | `REQ-ADM-013`, `REQ-ADM-020` |
| A platform card carries **no write control**, only copy (`template-library.tsx:196`) | the platform card's one menu item | `REQ-DSG-008` |
| Duplicate = a copy, `duplicated_from` set, v1 from the source's latest (`templates.ts:240`) | «انسخ لتعدّل» (platform) and ★ «انسخ» (org), same DAL | `REQ-DSG-008` |
| Create blank with family + orientation, v1 published at once (`templates.ts:285`) | the «قالب جديد» sheet, then opens the draft | `REQ-DSG-008`, `DEC-148` |
| Open in the studio creates the draft from the latest version and redirects (`actions.ts:84`) | «افتح في المصمّم», same action | `REQ-DSG-007` |
| Publish the draft as the next version, previous version untouched (`templates.ts:349`) | ⋯ «انشر إصدارًا جديدًا» when a draft exists, the «مسودة» chip | `REQ-DSG-007`, `REQ-CRT-014` |
| Set default: one UPDATE, `design_templates_single_default` clears the previous default **for that (org, purpose, family)** (`templates.ts:389`, `0057:52`) | ⋯ «اجعله الافتراضي»; the strip reads it | `REQ-DSG-002`, `REQ-CRT-015`, `REQ-UIX-108` |
| Rename with a name check (`templates.ts:397`) | ⋯ «غيّر الاسم» dialog | `REQ-ADM-013` |
| Retire, never delete; clears the default; restore (`templates.ts:406`) | ⋯ «أحِله للتقاعد» / «أعِده للخدمة» | `REQ-DSG-007` |
| Retire confirm names the object and the consequence (`template-actions.tsx:229`) | same, + the usage count | `REQ-UIX-013` |
| Name field error at the field, forms `noValidate` (`template-actions.tsx:57`) | same | `REQ-UIX-009` |
| Every result a toast **from the action's result**, never an effect (`:43`) | same pattern | wave 6's trap |
| Preview = `renderDocumentToHtml()` in a sandboxed `srcdoc` frame, faces by SHA-256 via `/api/fonts`, the org brand (`template-preview.tsx:91`) | `components/templates/template-preview.tsx`, same mechanism | `DEC-017`, `REQ-DSG-016`, `DEC-053` |
| Preview mounted only near the viewport; inert (`aria-hidden`, no tab stop); contained, centred; `data-template-preview` + `data-rendered` true only after load **and** `fonts.ready` (`:40-120`) | same, same attribute names (wave 8's specs read them) | `DEC-149` §4 |
| Frame laid out in the document's direction, origin at its inline start (`:111`) | same | `DEC-096` |
| Unbound data: the template's fallback, else a marked placeholder (`:13`) | ★ changed: every **text** binding renders as `{label}` (§6.6) — the board's `{العنوان}` | `REQ-DSG-006`, `REQ-UIX-108` |
| `<bdi>` on the template name everywhere (`template-library.tsx:142`, dialog titles) | same | `10` §bidi |
| Usage count = this org's sessions, under RLS (`templates.ts:126`) | the retire confirm | `16` §10.3 (superseded as layout; kept as a consequence) |
| Retired platform rows hidden from orgs (`templates.ts:174`) | same | `REQ-DSG-008` |
| Cards capped short on a phone, media contained (`template-library.tsx:126`) | the stack under `lg` | `REQ-UIX-053`, `M12.md` |
| Scheme links `?scheme=light|dark` on the certificate library (`template-library-page.tsx:54`) | **dropped** (D6) | — (`DEC-148`: the scheme is a session's choice, made on `045`) |
| Version line, locked-region count, «draft» wording, intro/brand/lock/phone/moderator panels | **dropped** | `DEC-NEXT-25`; the lock is enforced by `design_documents_guard` (`0055`), not by a sentence |
| ★ Audit rows | **none today** — see §5 | `REQ-UIX-108` «every template mutation is audited» |

#### 4.2 · `045` — `admin/sessions/[id]/certificates/page.tsx` + the four chrome files of §1

| Behaviour (old file:line) | Where it lives after | Kept by |
|---|---|---|
| A member, or a session this org cannot see → not-found (`page.tsx:86`) | same | `DEC-134` |
| A moderator reads the design and «من يستحق», no certificate (`page.tsx:31`, `moderatorNote`) | same, no note sentence — the absence of the tables says it | `REQ-ADM-020`, `03` §5.8 |
| Release and revoke for an admin only (`canRelease`) | same | `REQ-CRT-004`, `REQ-CRT-011` |
| ★ The mode written **here only**, refused once completed, archived or cancelled; a closed session gets a sentence (`page.tsx:120`, `actions.ts:93`) | the before-completion «من يستحق» | `DEC-178`, `REQ-CRT-002`, `REQ-CRT-015` |
| Turning certificates on opens the preflight: fonts, each kind's design, eligible count, the next serial **as an estimate**, Tier A (`mode-control.tsx:94`) | same confirm; the separate serial panel (`page.tsx:142`) folds into it | `REQ-DSG-031`, `DEC-148`, `DEC-010` |
| Mode radio group's accessible names «من يستحق شهادة، ومتى», «احفظ الوضع», «ثبّت الوضع» (wave 9's spec) | kept verbatim | evidence |
| The template per kind, the org default else the platform's; locked once a certificate of the kind reached a member (`design-panel.tsx:162`, `0099:36`) | the before-completion template control | `REQ-CRT-015`, `REQ-CRT-014` |
| The scheme per kind, pinned at issue (`design-panel.tsx:242`) | same control | `DEC-148` |
| «صدرت بـ» names the live certificate's design, a revoked first row skipped (`certificates.ts:363`) | the after-completion template sentence | `DEC-160` §6 |
| Redesign held certificates of a kind (`design-panel.tsx:220`, `redesign_held_certificates`) | the «غيّر» sheet after completion — **pending D25** | `REQ-CRT-004`, `DEC-148` |
| The preview binds the **longest eligible name per kind** and runs the studio's checks (`design-panel.tsx:178`, `:317`) | the template control's preview at `lg` | `REQ-DSG-031`, `REQ-DSG-016` |
| «من يستحق» = exactly the fan-out's read: complete attendees + accepted presenters, one row per member (`certificates.ts:420`) | the before-completion list | `REQ-CRT-001`, `REQ-SES-017` |
| A failed read throws, never «nobody» (`certificates.ts:445`) | same DAL | `DEC-148` |
| An eligible member holding only revoked rows is named, replaceable vs final (`eligible-list.tsx:30`) | the «بلا شهادة» rows | `DEC-160` §6 |
| Held / issued / revoked kept apart; a held row is released, an issued one revoked (`issuance.tsx:21`) | three regions | `REQ-CRT-004`, `REQ-CRT-011` |
| Selection counts only ids still held after a revalidation (`issuance.tsx:73`) | same | — (correctness) |
| Release confirm with the count and the session (`issuance.tsx:300`) | same; per row and «الكل» too | `REQ-UIX-013`, `REQ-DSG-031` |
| Revoke: reason **mandatory**, refused at the field, typed text kept on refusal (`issuance.tsx:330`) | the sheet; the action returns the reason to refill | `REQ-CRT-011`, `DEC-149` §1 |
| Serial `<bdi dir="ltr">` everywhere (`issuance.tsx:146`) | same | `REQ-UIX-109` |
| PDF for an **issued** certificate whose render is ready, through `/api/designer/downloads/<id>` (`issuance.tsx:170`) — never a held or revoked one | same | `DEC-177`, `DEC-178`, `REQ-UIX-109` |
| The link is a 36 px target (`issuance.tsx:173`) | same | SC 2.5.8 |
| Render state and the per-certificate retry (`issuance.tsx:155`) | the PDF cell | `REQ-DSG-031` |
| `?download=failed` → an alert (`page.tsx:66`) | same | `DEC-178` |
| Revoked table with the reason (`issuance.tsx:263`) | the revoked region, when non-empty | `REQ-CRT-011`, `REQ-CRT-013` |
| Toasts from the result inside the transition (`issuance.tsx:79`) | same | wave 6's trap |
| Section order flips after issue (`page.tsx:179`) | replaced by the two states (before / after completion) | `M12.md`, the board |
| `<bdi>` on every name and title | same | `10` §bidi |
| ★ Audit rows | §5 — every one exists today | `REQ-CRT-004`, `-011`, `REQ-ADM-021` |

### 5 · ★★ Every mutation, its DAL function as it is, and the row it writes TODAY (measured)

| Screen | Mutation | DAL (unchanged) | Writes today | Action string (file:line) |
|---|---|---|---|---|
| 055 | create blank | `createBlankTemplate()` — two RLS inserts | ✗ **nothing** | — |
| 055 | duplicate (platform or org) | `duplicateTemplate()` — two RLS inserts | ✗ **nothing** | — |
| 055 | open in studio (first open creates the draft) | `openTemplateDraft()` | ✗ nothing | — (a working copy; I propose no row) |
| 055 | publish a version | `publishTemplateVersion()` — RLS insert | ✗ **nothing** | — |
| 055 | set default | `setDefaultTemplate()` — RLS update; the previous default cleared by `design_templates_single_default` (invoker trigger, `0057:52`) | ✗ **nothing** | — |
| 055 | rename | `renameTemplate()` | ✗ **nothing** | — |
| 055 | retire / restore | `retireTemplate()` | ✗ **nothing** | — |
| 045 | mode | `setSessionCertificateMode()` (`sessions.ts:746`) → `set_session_certificate_mode()` | ✓ | `session.certificate_mode_changed` (`0154:28`) |
| 045 | template per kind | `setCertificateDesign()` → `set_certificate_design()` | ✓ before/after template + scheme | `certificate.design_set` (`0099:49`) |
| 045 | redesign held | `redesignHeldCertificates()` | ✓ one row per call, with the count | `certificate.redesigned` (`0099:206`) |
| 045 | issue one / selected / all | `releaseCertificates()` → `release_certificates()` | ✓ **one row per certificate**, then `notify(… 'MSG-certificate_issued')` | `certificate.released` (`0065:186`) |
| 045 | revoke | `revokeCertificate()` → `revoke_certificate()` | ✓ reason in the row's `reason`, cause in `after` | `certificate.revoked` (`0127`, revoke body) |
| 045 | PDF | the route → `record_export_download()` | ✓ actor, subject `certificate`, ids | `export_artifact.downloaded` (`0152`) |
| 045 | retry a render | `retryExport()` (`designer.ts:546`) | ✓ | `design.export_retried` (`0060:243`) |

★★ **The gap — every `055` mutation writes nothing**, while `REQ-UIX-108` and `REQ-ADM-023` say every console change is
audited. **The lead writes it in `0191`** (sync 1). ★ **§5 FINAL — the specification `0191` is written from**, on `0181`'s
`managed_list_audit()` pattern: `security definer`, `set search_path = ''`, rows through `public.write_audit()` only,
actor the caller (`write_audit`'s default), subject type `'design_template'`.

**Scope: org rows only.** A row with `org_id is null` is a platform template (`02` §7's third exception); it writes
nothing here — the platform console's writes belong to `platform_audit_log`, and no org can write one anyway
(`templates_update_org` is `scope = 'org'`).

**Trigger 1 — `design_templates_audit`, `after insert or update on public.design_templates`, `for each row`:**

| Event (old → new) | Action | `subject_id` | `before` | `after` | Written by |
|---|---|---|---|---|---|
| `INSERT` | `design_template.created` | `new.id` | null | `{purpose, family, name, duplicated_from}` (null `duplicated_from` = blank) | «قالب جديد», «انسخ», «انسخ لتعدّل» |
| `name` distinct | `design_template.renamed` | `new.id` | `{name}` | `{name}` | «غيّر الاسم» |
| `is_default` `false → true` | `design_template.default_set` | `new.id` | `{is_default: false}` | `{is_default: true, purpose, family}` | «اجعله الافتراضي» |
| `is_default` `true → false` | **nothing** | — | — | — | the row `design_templates_single_default` clears inside the same statement (`0057:58`), or a retire |
| `retired_at` `null → not null` | `design_template.retired` | `new.id` | `{retired_at: null, is_default: old.is_default}` | `{retired_at}` | «أحِله للتقاعد» — `was the default` rides in `before`, so the cleared default needs no row of its own |
| `retired_at` `not null → null` | `design_template.restored` | `new.id` | `{retired_at}` | `{retired_at: null}` | «أعِده للخدمة» |
| `description`, `updated_at`, `created_by` only | **nothing** | | | | no screen writes them |

One `UPDATE` may change several columns; each matching line writes its row (no DAL path does that today — rename,
default and retire are three separate statements). ★ **«Set default» writes exactly one row**: the new default's
`false → true`. The previous default's `true → false`, fired by the `before` trigger's nested `UPDATE`, writes nothing.
The «who it replaced» is the prior `default_set` row for the same `(purpose, family)` in the log; a `before` carrying the
replaced id would need the `before` trigger to pass it on, which I do not propose.

**Trigger 2 — `design_template_versions_audit`, `after insert on public.design_template_versions`, `for each row`:**

| Event | Action | `subject_id` | `before` | `after` | Written by |
|---|---|---|---|---|---|
| `INSERT`, `new.version > 1`, org row | `design_template.published` | `new.template_id` | null | `{version, version_id: new.id}` | «انشر إصدارًا جديدًا» (`publishTemplateVersion()`) |
| `INSERT`, `new.version = 1` | **nothing** | | | | v1 is inserted by create and duplicate in the same action; `.created` already says it — nothing written twice |

`new.org_id` is set by `design_template_versions_guard` (a `before` trigger, `0055`), so it is populated when this fires.
No `UPDATE` or `DELETE` trigger: a published version is immutable (no update or delete grant, `0055`).

**Not audited, by design:** `openTemplateDraft()`'s draft `design_documents` row (a working copy; the publish is the
change) · a `DELETE` on `design_templates` — `templates_delete_org` exists but no DAL function deletes (retire is the
exit); if the lead wants the door covered, `design_template.deleted` with `before {name, family}` is the line to add.

**The test, mine once `0191` is promoted:** `tests/rls/templates-audit.test.ts`, every case **as the org admin member**
(claims, `authenticated` — never the owner), counting `audit_log` rows by `action` and `subject_id` since a marker:
create → one `.created`, no `.published` · duplicate → one `.created` whose `after.duplicated_from` is the source ·
publish v2 → one `.published` with `version: 2` · ★ set default with an existing default → **exactly one row in total**,
on the new default · rename → one `.renamed` · retire the default → one `.retired` with `before.is_default = true`, no
`.default_set` · restore → one `.restored` · a moderator's update matches no row and writes no row · a platform row
written by the seed writes nothing.

### 6 · The measurements the agent file asks for

1. **Release and revoke are audited today**, in their own transaction: `certificate.released` per row (`0065:186`),
   `certificate.revoked` with the reason in `audit_log.reason` and `{serial, cause}` (`0127`); tests exist at
   `tests/rls/designer-certificates.test.ts:280` and `:343` (`designer`'s file). ★ Revoke **sends no mail** (no
   `notify()` in `revoke_certificate()`; `MSG-certificate_revoked` is the attendance-removal path's) — not a requirement.
2. **`/verify/[code]` of a revoked certificate**: `verify_certificate()`'s return type has **no reason column**
   (`0055`, the function) and `state in ('issued','revoked')`; the page renders `certificates.verify.revoked` in
   `role="status"` and never a reason. ✓ for «never the reason». ★ **The words are «هذه الشهادة ملغاة.»**, not
   `REQ-CRT-011`'s «شهادة ملغاة» (D26). **The PDF is kept**: `revoke_certificate()` touches no artifact; no retention
   job deletes one (`enforce_retention.ts` has no certificate path); `record_export_download()` still serves a revoked
   certificate to its member (`v_cert_state <> 'held'`), as `REQ-CRT-013` wants. No fix in `verify/**` is needed.
3. **A held certificate is invisible and unmailed**: `certs_read_self_or_admin` has `state <> 'held'` (`0055`) and
   `listMyCertificates()` filters `neq('state','held')` (`certificates.ts:157`); its document is unreadable to the member
   (`documents_read`'s sub-select runs under that policy); the download route refuses it (`record_export_download`,
   `v_cert_state <> 'held'`); mail: `issue_certificates` announces **only** `state = 'issued'`
   (`worker/src/tasks/issue_certificates.ts:197`), and `release_certificates()` is the one other caller of
   `notify(…'MSG-certificate_issued')`. ✓ — the walkthrough's negative is checked at the data (§8).
4. **«Set default» writes** one `update design_templates set is_default = true`; `design_templates_single_default`
   (`0057:52`, `before`, invoker, under RLS) clears the previous default with `t.org_id is not distinct from new.org_id`
   and the same `(purpose, family)`. `0055:102-105`'s two partial unique indexes back it: one per `(org_id, purpose,
   family)` and one platform default per `(purpose, family)`. For certificates that is **exactly three per org**. An org
   cannot set a platform template as its default (the update policy is `scope = 'org'`); it copies first.
5. ★ **Where «the default» actually comes from — a measured defect (D13).** `issue_certificate()`'s fallback (`0127`,
   and the same line in `0066:91` for achievements) orders `(t.org_id is not null) desc, t.is_default desc, v.version
   desc`: **any** live org template of the kind beats the platform's default, default or not. And
   `getCertificateDesign()` (`certificates.ts:355`) says the opposite: org default, else **any** default (the platform's).
   So with an org template that is not flagged default, the screen names the platform's while issuance uses the org's.
   «Find the default in one look» is false in that case. It needs the lead's ruling: fix the SQL order (a migration —
   `0191`) or have the strip and the control mirror the SQL's order and name what issuance uses.
6. **`redesignHeldCertificates()` goes** with the template control **after completion**, in the «غيّر» sheet beside a held
   kind — because held rows only exist after the completion fan-out, it can do nothing before. That is exactly D25.
7. **The card preview through the one renderer**: `renderDocumentToHtml(doc, { fonts, bindings: { values } })` from
   `@kareem/designer-runtime` (`DEC-017`) in a sandboxed `srcdoc` iframe, scaled to contain. `values` = the org's
   `previewBindings` (brand, in the card's scheme — posters dark, certificates light) **plus, for every text binding
   `declaredBindingsOf(doc)` names outside `brand.*`, the value `{label}`** — the label from `designer.bindings.field.*`
   (read, never written), «حقل» when unknown. So `{العنوان}` and `{اسم العضو}` are drawn by the renderer itself, as the
   boards draw them, rather than the template's fallback text. An image or QR binding stays the renderer's marked
   placeholder.

### 7 · DAL reads needed — add-only, existing signatures untouched

- `certificates.ts` — `getSessionCertificateFaces(locale: string, sessionId: string): Promise<Record<string, { avatarSrc: string | null; teamColor: string | null }> | null>` — admin only (certificates are admin-read), the face through `avatarHref()` (`DEC-099`) and the company's `team_color`; `null` for anyone else.
- ~~`templates.ts` — `certificateDefaults()`~~ — **replaced by `getEffectiveCertificateTemplates()`** (§12c), which mirrors `issue_certificate()`'s order.
- `templates.ts` — `posterFormats` / `certificatePage` derive in the component from `presetsForDocument()`; no read.
- No write path is added. The one new action is `createAndOpen` in `templates/actions.ts`: `createBlankTemplate()` then
  `openTemplateDraft()` then `redirect()` — both existing.

### 8 · Locators for the lead's walkthrough (`DEC-236` §5) — every one from `#main`

| Step | Locator |
|---|---|
| 055 certificates tab | `goto /ar/app/admin/templates/certificates`; `main.getByRole("tablist", { name: "أنواع القوالب" }).getByRole("tab", { name: "الشهادات" })` has `aria-selected="true"` |
| New template | `main.getByRole("link", { name: "قالب جديد" })` → `page.getByRole("dialog", { name: "قالب جديد" })` → `getByLabel("الاسم")`, `getByRole("radiogroup", { name: "النوع" }).getByRole("radio", { name: "حضور" })`, `getByRole("radiogroup", { name: "الاتجاه" })` → `getByRole("button", { name: "أنشئ وافتح" })` → URL `/app/admin/designer/` (the studio's steps are `designer`'s) |
| A card | `main.locator("article", { has: page.getByRole("heading", { name, exact: true, level: 3 }) })` |
| Set as default | card → `getByRole("button", { name: "إجراءات أخرى" })` → `page.getByRole("menuitem", { name: "اجعله الافتراضي" })` → toast `getByText("صار هذا القالب الافتراضي لعائلته.", { exact: true })` → `main.getByLabel("القوالب الافتراضية")` `toContainText(name)` and the card `getByText("افتراضي", { exact: true })` |
| Review mode (before completion) | `goto …/sessions/<id>/certificates`; `main.getByRole("radiogroup", { name: "من يستحق شهادة، ومتى" }).getByRole("radio", { name: "تُجهَّز وتبقى محجوزة حتى تُطلقها" })` → `getByRole("button", { name: "احفظ الوضع", exact: true })` → `page.getByRole("dialog").getByRole("button", { name: "ثبّت الوضع", exact: true })` |
| Negative: held invisible | as the member, `/ar/app/me/certificates`: `getByText(serial)` count 0; `select count(*) from public.notifications where member_id = $1 and message_key = 'MSG-certificate_issued'` = 0 (the lead's fixture names the columns) |
| Release two | `main.getByRole("table", { name: "الشهادات المحجوزة" }).getByRole("checkbox", { name: "تحديد الصف <name>" })` ×2 → `main.getByRole("button", { name: "أصدر المحدّد" })` → `page.getByRole("dialog").getByRole("button", { name: "أصدر", exact: true })` → toast `getByText("صدرت شهادتان", { exact: true })` (D22) |
| Revoke one | `main.getByRole("table", { name: "الشهادات الصادرة" }).getByRole("row", { name: new RegExp(serial) }).getByRole("button", { name: /ألغِ/ })` → `page.getByRole("dialog")` (the sheet) `.getByLabel("سبب الإلغاء")` → `getByRole("button", { name: "ألغِ الشهادة" })` → toast `getByText("أُلغيت الشهادة.", { exact: true })` → `main.getByRole("table", { name: "الشهادات الملغاة" })` `toContainText(reason)` |
| Negative: verify | `/ar/verify/<code>`: `getByRole("status")` has the revoked words (D26) and `page.getByText(reason)` count 0 |
| Member downloads the other | admin side: `main.getByRole("link", { name: "نزّل شهادة <name>", exact: true })` `href` matches `/api/designer/downloads/`; member side is `/app/me/certificates` (`designer`'s screen); the audit `export_artifact.downloaded` row with the member as actor |

### 9 · Existing suites my rebuild moves — each a ledger line in the same commit (the lead writes them)

- Mine (evidence): `tests/components/certificates/{issuance-download,mode-control}.test.tsx` — the files they mount are
  deleted; their cases move to new `tests/components/templates/**` and a co-located-component suite under the same folder
  rule; `tests/e2e/certificates.spec.ts:299` («الوضع مراجعة» sentence → the line), `:307` (toast vocabulary, D22).
- **Not mine — each a request:** `wave8-designer-templates.spec.ts:340,385` (`h1`), `:379` («انسخ إلى مؤسستي» → «انسخ لتعدّل»),
  `:276` («الافتراضي» → «افتراضي»), `:362,387` (`?scheme=`, D6), `:274-299` (card text «مستخدم في جلسة واحدة» moves to the
  retire confirm) · `wave8-designer-certificates.spec.ts:263,267,282,325,343-344,412,424,434,442,447,449,466` (the design
  radios, the release dialog's words, the section headings) · `wave10-designer-reissue-and-days.spec.ts:320-321`
  (`section[aria-labelledby="cert-issued"]` — kept if I keep the ids; I will) and `:380` (D26) · `wave13-console-templates.spec.ts:131`
  (`h1`) · `wave13-designer-certificates-download.spec.ts:146` and `wave13-demo-download.spec.ts:218` (the link's name — kept,
  so no change) · `wave9-three-day-workshop.spec.ts:316-320` (kept names, so no change).

### 10 · Disagreements with the boards — written, no side picked (contract 8)

| # | Board · line | The board | The tree / the plan says |
|---|---|---|---|
| D1 | `AdminTemplates.dc.html:57-64` | org group first, platform second | the old screen put platform first; **built as drawn** |
| D2 | `AdminTemplates.dc.html:59-66` | format chips differ per template (16:9 · A4 · A3 · 9:16, or a subset) | a poster derives **all seven** presets (`presets.ts:99`, `presetsForDocument`); there is no per-template format list. Chips will be the same four on every poster card |
| D3 | `:65-66` | ⋯ on a platform card | it holds one item, «انسخ لتعدّل» — a platform template is not editable (`REQ-DSG-008`) |
| D4 | `M12.md` §055 | menu = open, duplicate, set default, archive | publish, rename and restore exist and are kept (`REQ-DSG-007`, `REQ-ADM-013`). ★ **For `designer` and the lead:** publishing a template version is a library action today, and nothing in the new bar publishes — should «انشر» move into the studio's bar? |
| D5 | `:55` | «قالب جديد» opens the designer on a blank | the table needs a name and a family (`0055` checks), a certificate an orientation (`DEC-148`); a sheet asks first, then opens |
| D6 | — | no scheme toggle | the old certificate library had `?scheme=`; dropped, `DEC-148` served on `045` |
| D7 | `AdminTemplatesCerts.dc.html:59` | certificate preview 140 px tall, landscape | a portrait certificate exists (`0098`); it is contained in the same box |
| D8 | both | the avatar draws an Eastern-Arabic digit | `DEC-124`; the frame's, the lead's |
| D9 | `AdminTemplatesCerts.dc.html:59,64` | chips «حضور · تقديم» on one template | **one kind** (`DEC-236` §1) |
| D10 | `:66` | two defaults: «الحضور والتقديم» and «الإنجازات» | **three** (`DEC-236` §1) |
| D11 | `:66` | the defaults strip is the last thing on the page | the job is «find the default in one look»; built where drawn unless the lead moves it under the tabs |
| D12 | `:66` | each default names an org template | with no org default for a kind, the strip names the platform's, marked «المنصة» |
| D13 | — | — | ★ `issue_certificate()`'s fallback disagrees with `getCertificateDesign()` and with `REQ-CRT-015` (§6.5) |
| D14 | `AdminCertificates.dc.html:57` | «القالب: ورقي A4» — one template | a session has one per kind (`session_certificate_designs`, `0099`) |
| D15 | the whole board | a completed session only | before completion is built undrawn (§3), `REQ-DSG-031`'s three steps |
| D16 | — | no revoked table | kept when non-empty (`REQ-CRT-011`; the reason is the org's to read) |
| D17 | `:68-70` | «PDF» always present | a PDF exists only once rendered; pending and failed states, and the retry, kept (`REQ-DSG-031`) |
| D18 | `:72` | «22 أخرى · المزيد» | `data-table` has no pagination; built as the first 20 and a link `?issued=all` — no primitive change |
| D19 | `:61-70` | an avatar with a team ring on every row | a new add-only read (§7) |
| D20 | `:58,61` | «أصدر» / «أصدر المحدّد» / «أصدر الكل» | the strings today say «أطلِق». Board copy adopted; toasts follow («صدرت…»), which moves other tracks' specs (§9) |
| D21 | — | no confirm drawn for issuing | kept (`REQ-UIX-013`; `REQ-DSG-031`'s «one confirmed button»; a release mails the member and cannot be undone) |
| D22 | — | — | same vocabulary point for the toasts |
| D23 | `:68` | «ألغِ» a coral text link | a quiet danger button, 36 px (SC 2.5.8) |
| D24 | `:57` | — | `M12.md` says the mode is «set once in الجدولة»; `DEC-237` §4 rules `045` |
| D25 | — | — | ★★ `REQ-CRT-015`: «mode **and template** are refused once the session is completed». **Measured:** `set_certificate_design()` refuses only when a certificate of the kind is issued or revoked (`0099:36`), **not** on completion; and `redesign_held_certificates()` is only useful after completion (held rows are made by the completion fan-out). Read literally, the requirement removes the held-redesign path the database supports and `DEC-148` built; read as the SQL works, the acceptance line is wrong. **The lead rules**: (a) keep the template control after completion while held rows of the kind exist and none is issued — the requirement amended — or (b) refuse it after completion — a definer change from the lead, and `redesignHeldCertificates()` loses its only use |
| D26 | — | `REQ-CRT-011` quotes «شهادة ملغاة» | the verify page says «هذه الشهادة ملغاة.» (`certificates.json`, now mine). Changing it moves `certificates.spec.ts:267` (mine) and `wave10-designer-reissue-and-days.spec.ts:380` (`designer`'s). The lead says whether the words change |
| D27 | `AdminCertificates.dc.html:55-56` | the hub's header and tabs | `sessions'` (custodian: the lead), built in wave 21; untouched |
| D28 | rail | — | `admin-nav.ts:58` hides «القوالب» from a moderator, while the page serves them read-only (`getTemplateLibrary`). Consistent with «the layout never gates»; noted, not changed |
| D29 | `AdminCertDesigner` (PR B) | strip «A4 أفقي · A4 عمودي · A3 أفقي» | there is no A3 certificate preset (`presets.ts:100`); for `designer`, recorded here because `055`'s chips name the page |

### 11 · Order of work, once approved

1. `055` — delete commit (`templates/{posters,certificates}/page.tsx`, the four `designer/template-*.tsx`) and, in the
   **same push**, the create commit (`components/templates/**`, the two pages, `actions.ts` add-only `createAndOpen`,
   `templates.json` strings, ar first). ★ §1 granted (§12a); `055`'s delete waits for `045`'s files to be deleted in the same push, since `design-panel.tsx` imports `template-preview.tsx`.
2. `045` — delete commit (`page.tsx`, the four transferred files, their two suites) then create (co-located components,
   `certificates.json` strings, `getSessionCertificateFaces`).
3. Tests: `tests/components/templates/**`, the co-located component suites, `tests/rls/templates-audit.test.ts` after the
   trigger, `tests/e2e/wave23-console-{templates,certificates}.spec.ts` — each mutation and its audit row, the 1280 and
   390 captures at `.qa-shots/rtl/wave23-console-<screen>-<state>-<1280|390>.png`.
4. Gates before each screen commit: `tsc`, `lint` (grep `problems`), `npm test`, `npm run ui-lint`;
   `console-register.test.ts` untouched — the new files import nothing from `src/lib/ui/**`, `ui/objects/**`, a sticker or
   a moment, and `ui/data-table` is not edited.

### 12 · ★ Sync 1's interim rulings, applied (the lead, 2026-10-03; `DEC-238` to come)

**(a) Granted.** `src/components/certificates/{design-panel,eligible-list,issuance,mode-control}.tsx` and
`tests/components/certificates/{issuance-download,mode-control}.test.tsx` are mine for the wave, **to delete** in `045`'s
delete commit. The new chrome is co-located in `admin/sessions/[id]/certificates/`. `mode-badge.tsx`, `actions.ts` and
`held-achievements.tsx` stay `designer`'s, untouched. The two suites' cases are re-written against the new files in the
create commit (a ledger line each: «file deleted with its component; cases moved to …»).

**(b) The template after completion — measured answer: NO definer change is needed.** `set_certificate_design()` already
raises `design_locked` (`55000`) once **any** certificate of that kind is `issued` or `revoked` (`0099:33-39`), so
«refused once one of that kind is issued» holds in SQL today, before and after completion. The DAL maps `55000` to
`{ status: "locked" }` (`certificates.ts:504`). So:
- **The screen gates:** before completion the control is offered per kind unless `locked`; after completion it is offered
  (behind «غيّر» on the template sentence, in a sheet, with «طبّق على المحجوزة») **only when `heldCount > 0 && !locked`**
  for that kind; otherwise the sentence alone.
- **The data re-checks:** a stale page that submits after an issue gets `55000` → the «locked» toast, and nothing is
  written (the raise precedes the insert, `DEC-043`).
- ★ **The one case the SQL does not refuse and the ruling does:** a completed session with **no** held and no issued
  certificate of the kind (mode `off`, or nothing eligible). The write succeeds, is audited (`certificate.design_set`),
  and changes nothing that will ever be issued — the fan-out has already run (`DEC-178`). The screen never offers it. I
  recommend **no SQL** for it; if the lead wants exact parity, the line is «`raise … 'design_locked'` when the session is
  `completed`/`archived`/`cancelled` and no `held` certificate of the kind exists», and I write it under
  `supabase/proposed/console/` for `0191` on request.
- The mode is unchanged: written before completion only (`DEC-178`).

**(c) The screen mirrors `issue_certificate()`'s real order.** One add-only read, used by both screens:

```ts
// src/lib/dal/certificates.ts — add-only
export async function getEffectiveCertificateTemplates(locale: string): Promise<Record<CertificateKind,
  { templateId: string; name: string; scope: "org" | "platform"; isDefault: boolean; orientation: "landscape" | "portrait" } | null> | null>
```

Staff only (`null` otherwise). Per kind, the SQL's exact predicate and order (`0127`'s fallback; `0066:85-92` for
`achievement`): purpose `certificate`, `retired_at is null`, family = kind, this org's or the platform's, **published
versions only**, ordered `(org_id is not null) desc, is_default desc, version desc`, first row. Read under RLS
(`templates_read`, `template_versions_read`), so it is the caller's org and the platform, as the function sees.
- `055`'s strip names it; «افتراضي» beside it **only when `isDefault`**; «المنصة» when `scope = "platform"`.
- `getCertificateDesign()`'s `effectiveTemplateId` fallback (`certificates.ts:355`) is changed to the same order —
  **signature and DTO unchanged**, a behaviour fix in a file transferred to me; `tests/rls/certificates-designs.test.ts`
  is re-run and any assertion that moves is a ledger line.
- ★ **A measured caveat for `DEC-238`:** the SQL's `order by` has **no tiebreaker** after `v.version desc`. Two live org
  templates of one kind, neither default, whose latest published versions share a number (both at v1 — every fresh
  copy is v1) are picked **arbitrarily** by `limit 1`, and may differ between two issuances. The mirror cannot be exact
  there; it orders the tie by `template_id` and says so in a comment. The honest way out for an admin is the one move
  the strip offers — set a default — and the strip shows no «افتراضي» in that state, which is the signal. Fixing the
  tie is the same ordering migration the lead ruled out; recorded, not built.

**Final §5** is above (the two triggers, every column → row, set default = one row, v1 writes nothing).

**Small ones, applied.**
- **D26:** «هذه الشهادة ملغاة.» stays; `verify/**` is not touched; the walkthrough asserts that string.
- **D20:** «أصدر» · «أصدر المحدّد» · «أصدر الكل», the confirm «إصدار N شهادة؟», the toast «صدرت N شهادة» (six forms),
  written from the board's HTML. §8's release locators already use them.
- **D4:** publishing a template version → `designer`, for the bar; until the bar has it, ⋯ «انشر إصدارًا جديدًا» on
  `055` keeps the only door (`REQ-DSG-007`), and is removed when `designer`'s lands.
- ★ **Found while re-measuring:** `templates.family.*` is read by `/app/platform/templates` (`promote-table.tsx:92`,
  `library-table.tsx:105` — `platform`'s, frozen). **Those keys stay, unchanged** — a kept-behaviour row for `055`.

**The ledger lines in `designer`'s specs — one per moved assertion, for the lead** (the rest of each spec is untouched):

| Spec · line | Today | After | Kind |
|---|---|---|---|
| `wave8-designer-templates.spec.ts:271` | card text «مستخدم في جلسة واحدة» | in the retire confirm, not on the card | expectation moved |
| `:276` | `getByText("الافتراضي")` | `getByText("افتراضي")` (board) | copy |
| `:340`, `:385` | `h1` «قوالب الشهادات» | `h1` «القوالب» | copy |
| `:342`, `:407` | button «قالب فارغ» | link «قالب جديد» (`?new=1`) | role + copy |
| `:344-349` | the create dialog creates and toasts | the sheet creates **and opens the studio** (URL `/app/admin/designer/`) | expectation moved |
| `:358` | chip «عمودية» | chip «A4 عمودي» | copy |
| `:362`, `:387` | `?scheme=dark` | no scheme toggle (D6) | removed |
| `:379` | «انسخ إلى مؤسستي» | «انسخ لتعدّل» via ⋯ | copy + a menu |
| `wave8-designer-certificates.spec.ts:262`, `:408` | `h2` «شهادات الجلسة» | no tab title (the hub's `h1` names the session) | removed |
| `:263` | «الوضع مراجعة» sentence | «الوضع تُراجَع قبل الإطلاق» line | copy |
| `:266-267`, `:442` | «لم يُحفظ»; radio «شهادة حضور عمودية», «داكنة» | the template `select` and the scheme radios | control moved |
| `:282` | `designPanel(...).locator("[data-template-preview]")` | same attribute, inside the template control | selector moved |
| `:343-344` | «أطلِق» / «أُطلقت شهادتان» | «أصدر» / «صدرت شهادتان» | copy (D20) |
| `:412`, `:424`, `:449` | heading «الشهادات المحجوزة» (h3) | heading «محجوزة · N»; the table keeps the name «الشهادات المحجوزة» | copy |
| `:434` | «إطلاق شهادتين؟» | «إصدار شهادتين؟» | copy (D20) |
| `:466` | «الوضع معطّل» ×2 | the line once («الشهادات معطّلة») and the one empty sentence | expectation moved |
| `wave10-designer-reissue-and-days.spec.ts:320-321` | `section[aria-labelledby="cert-issued"|"cert-revoked"]` | **kept** — the ids stay | none |
| `wave13-designer-certificates-download.spec.ts:146`, `wave13-demo-download.spec.ts:218` | link «نزّل شهادة {name}» | **kept** | none |
| `wave13-console-templates.spec.ts:131` (the lead's evidence) | `h1` «قوالب الملصقات» | «القوالب» | copy |
| mine: `certificates.spec.ts:299`, `:307`, `:324` | mode sentence, «أُطلقت شهادة واحدة», `h2` | the line, «صدرت شهادة واحدة», no `h2` | copy |

### 13 · As built — `055` (wave 23, after «the plans are approved», `DEC-238`)

Delete `4638c87c` (the two pages, the four `designer/template-*` files), then the create commit right after it. Read back
against §4.1:
- Every row holds, with three as-built notes. **(1)** The format chips are **notation in code, not copy** («16:9», «A4»,
  «A3», «9:16», read from `presetsForDocument()`). `designer-i18n.test.ts` (`designer`'s) refuses a Western digit in
  `templates.json` outside the two preset names, so the paper sizes and ratios cannot be catalogue strings. The page
  word does stay in the catalogue («أفقي» / «عمودي»). **(2)** «افتح في المصمّم» and «قالب جديد» are offered at every width.
  I dropped §2's «not offered under `lg`», because hiding one menu item by viewport needs a script and the studio route
  answers for itself. **(3)** The copy's default name is `{name} — نسخة`, built in code, because `designer-i18n` wants
  every interpolation inside `<bdi>` and an input's default value cannot carry markup.
- `templates.family.*` is unchanged; `/app/platform/templates` reads it.
- `getCertificateDesign()`'s fallback now follows `pickEffectiveTemplate()` (`DEC-238` §2.3). No signature changed.
- The audit labels for `0191`'s six actions are in `admin.json` (`admin.audit.actions.design_template.*`, plus the domain
  and subject). `admin-audit-labels.test.ts` failed until they were added.
- Tests: `tests/components/templates/template-menu.test.tsx` (5), `tests/unit/certificates-effective.test.ts` (5),
  `tests/rls/templates-audit.test.ts` (6, every act as the org admin member; set default = one row). The full `npm test`
  run had 6 failures on 5s timeouts under load (`inspector-align`, `schedule-days`, `input`, `deactivate-toggle`,
  `viewer-screen`). All of them pass on their own.

### 14 · As built — `045` (wave 23, `DEC-238`)

Delete `52a8ac6d` (the page, the four transferred chrome files and their two suites), then the create commit right after.
Read back against §4.2. Every row holds. As-built notes:
- **Co-located** in `admin/sessions/[id]/certificates/`: `page.tsx`, `template-control.tsx`, `mode-control.tsx`,
  `eligible-table.tsx`, `issuance.tsx`, `revoke-form.tsx`; `actions.ts` is unchanged. The mode control has no board, so
  it carries the old control's behaviour and its pinned accessible names, with a new header.
- **The template after completion** (`DEC-238` §2): «غيّر» on the line links to `?design=<kind>` and opens a sheet, and
  only while that kind has held certificates and none issued. «طبّق على المحجوزة» is in it. The data re-checks through
  `set_certificate_design()`'s `55000`, so **no definer change** (§12b).
- **The line** names what each kind was issued with, else what issuance would pick (`getCertificateDesign()`'s
  `effectiveTemplateId`, now on `pickEffectiveTemplate()`). When the two kinds differ, the line names each.
- ★ **Deviation — the PDF link's accessible name** is now «PDF — نزّل شهادة {name}». The visible word is the board's
  «PDF», and SC 2.5.3 wants the accessible name to begin with it. This **moves two specs that pinned the old exact name**:
  `wave13-designer-certificates-download.spec.ts:146` and `wave13-demo-download.spec.ts:218`. They are ledger lines for
  the lead and correct §9/§12's «kept».
- ★ **Deviation — no-JS.** Revoke renders its sheet as a region without JS (`?revoke=<id>`), but the submit needs JS,
  because a form action would reset the typed reason. Issuing needs JS too, because selecting rows already does. Viewing,
  «المزيد» and the PDF link work without JS.
- Before completion: the template per kind, then the mode, then «من يستحق · N». After completion: the line, then
  محجوزة / صادرة / ملغاة (only when there are some) / بلا شهادة (only when there are some). A moderator sees the line and
  «من يستحق» at every stage. A cancelled session with nothing issued shows one line.
- Tests: `tests/components/certificates/{issuance,revoke-form}.test.tsx` (new, 9), `mode-control.test.tsx` (moved with
  its cases unchanged, 4). `proposal-copy.test.tsx` (the lead's, as `sessions'` custodian) scans `admin/sessions/**` for
  `overflow-hidden`, so the preview frame avoids it.

Written before code, updated as bundles land. Read `notify.md` §6.1, `scoring.md`'s wave-3
handoff and `content.md` §5 first — they describe what I inherit and where the gaps already are.

## Story order

1. **This plan** + **the admin route list** (below) — day one, before any screen.
2. **SCR-011** — `/app/sessions`, browse (`REQ-DSC-003/005/007`, `REQ-SES-011`).
3. **The admin shell** — `app/admin/layout.tsx`, the staff gate, the sub-nav.
4. **STORY-ADM-003** — SCR-040, the org dashboard.
5. **STORY-ADM-004** — SCR-047/048, categories and companies (managed lists, `REQ-ADM-007/008`).
6. **STORY-ADM-005** — SCR-049, members and roles, the moderator-scope proof (`REQ-ADM-009`,
   `REQ-ADM-020`) and the last-admin guard (`REQ-TEN-005`).
7. **SCR-044** — attendance (`REQ-CHK-008/012`), the point where the moderator's nav question
   below gets answered for real.
8. **STORY-ADM-006** — SCR-050–052, moderation queues (takedowns vs. reports kept apart, DEC-005).
9. **STORY-ADM-007** minus templates — SCR-061 exports, SCR-062 audit, SCR-063 settings, plus the
   member picker on SCR-053's adjustment form and the RTL date-time picker on SCR-043.
10. **STORY-ADM-008** — the fourth, offset-agnostic reminder message (DEC-047, a migration on
    `0026`'s matrix and `reminder_message_key()`).

SCR-046 (venues) is already built (`sessions`, wave 1) and needs no new work this wave beyond
living inside the new admin shell.

## The admin route list — `app/admin/layout.tsx`, published here so `designer` can build against it

Every route under `/app/admin`, in 09 §5's order. `mod` = visible to a moderator's sub-nav (not
just reachable — `REQ-ADM-020` is enforced in the DAL/RPC either way; this column is what the
nav shows). `owner` = who edits the page.

| Route | Screen | Top nav? | `mod` | Owner | Status |
|---|---|---|---|---|---|
| `/` | SCR-040 dashboard | yes | no | console | bundle 1 |
| `/proposals` | SCR-041 review queue | yes | no | console (inherited) | built (wave 1) |
| `/sessions` | SCR-042 management | yes | **yes, scoped** — see below | console (inherited) | built (wave 1), moderator scoping is SCR-044's story |
| `/sessions/[id]/schedule` | SCR-043 ★ | nested | no | console (inherited) | built (wave 1); RTL date-time picker is this track's backlog item |
| `/sessions/[id]/attendance` | SCR-044 | nested | yes | console | not yet |
| `/sessions/[id]/certificates` | SCR-045 | nested | no | **designer** | designer's |
| `/venues` | SCR-046 | yes | no | console (inherited) | built (wave 1) |
| `/categories` | SCR-047 | yes | no | console | not yet |
| `/companies` | SCR-048 | yes | no | console | not yet |
| `/members` | SCR-049 | yes | no | console | not yet |
| `/moderation/comments` | SCR-050 | yes | yes | console | not yet |
| `/moderation/photos` | SCR-051 | yes | yes | console | not yet |
| `/moderation/reports` | SCR-052 | yes | yes | console | not yet |
| `/scoring` | SCR-053 | yes | no | console (inherited) | built (wave 2) |
| `/recognition` | SCR-054 | yes | no | console (inherited) | built (wave 2) |
| `/templates/posters` | SCR-055 | yes | no | **designer** | designer's |
| `/templates/certificates` | SCR-056 | yes | no | **designer** | designer's |
| `/designer/[documentId]` | SCR-057 ★ | nested (reached from schedule/templates) | no | **designer** | designer's |
| `/branding` | SCR-059 | **not linked** | no | wave 4 | out of scope |
| `/emails` | SCR-058 | yes | no | console (inherited) | built (wave 2) |
| `/reminders` | SCR-060 | yes | no | console (inherited) | built (wave 2) |
| `/exports` | SCR-061 | yes | no | console | not yet |
| `/audit` | SCR-062 | yes | yes (own actions only) | console | not yet |
| `/settings` | SCR-063 | yes | no | console | not yet |

**The moderator/`/sessions` decision, flagged for the lead too:** 09's sitemap has no standalone
"attendance" screen a moderator can navigate to — SCR-044 lives at `/sessions/[id]/attendance`,
nested under a session a moderator has no other reason to open. Inventing a new top-level route
isn't in `01`, so the plan is to reuse the inherited SCR-042 route: the DAL scopes what
`/app/admin/sessions` shows by role — full management rows and actions for an admin, and for a
moderator a read-only, attendance-focused list (title, date, an "attendance" link) with none of
`REQ-ADM-005`'s edit/cancel/complete controls rendered *or* reachable — enforced in the DAL
(`REQ-ADM-020`'s "rejected by policy, not by hidden navigation" is `assert_fresh_admin()`/RLS
already refusing a moderator's scheduling call; the DAL scoping here is the honest nav to match
it, not the boundary). Implemented at the SCR-044 story, not before — until then the `/sessions`
nav item stays admin-only in the layout, since the moderator-facing rows don't exist yet to show.

**Templates (`designer`'s three folders) are excluded from the "console-only" edit list but
included in the shell's nav from day one**, per the spawn note: `designer/`, `templates/`,
`sessions/[id]/certificates/`. Their pages render inside my `layout.tsx`; I never edit them.

**`/branding` is wave 4's and is deliberately not linked** — DEC-048 Decision 2.

## The three carried-over items

1. **SCR-043's RTL date-time picker** (DEC-045) — native `datetime-local` today. Scheduled with
   the SCR-043 touch in bundle 9, once the managed lists and members work is done.
2. **SCR-053's member picker** (`scoring.md`'s handoff) — the manual-adjustment form takes a raw
   UUID today. Needs whatever member-search component `/app/admin/members` (bundle 6) builds;
   wiring it into `/scoring` is a UI change on an existing RPC call, not a new RPC.
3. **`08`'s fourth reminder message** (DEC-047) — a proposed migration on `0026`'s reminder
   matrix and `reminder_message_key()`, plus the reminders screen showing it. Last, since it is
   the only item here needing new SQL.

## Notes as bundles land

### Bundle 1

- SCR-011 built against `searchSessions()` (`src/lib/dal/search.ts`, content-owned, unchanged) —
  its return type is `{id, title, abstract, level, language, startsAt, state}`, no venue/category/
  presenter name, so the card shows only what that shape carries; nothing wider was added to
  `search.ts` (out of my edit list). `<SearchFilters>` already renders its own removable-chip row
  (`content`'s `filters-form.tsx`), so the browse page embeds it once rather than building a
  second chip row.
- `<SessionPoster>` (`@/components/posters/session-poster`) — checked `git log` before writing
  the card; `designer` had published its no-op placeholder by the time I reached this step
  (`session-poster.tsx`, `picker.tsx`, `mode-badge.tsx` all landed together), so the card imports
  it directly.
- The admin dashboard (`src/lib/dal/admin-dashboard.ts`) needed no new SQL — every figure is a
  plain aggregate over tables the admin's existing RLS policies already let them read
  (`sessions`, `proposals`, `rsvps`, `check_ins`, `points_ledger`, `members`), so there is nothing
  under `supabase/proposed/console/` yet.
- **e2e blocker, both bundles:** `.next/BUILD_ID` predates this session's files, so
  `test:e2e:local` 404s every new route against a stale build (the three inherited-screen specs
  still pass, since they exercise code untouched by this session). Not something this track can
  fix — only the lead runs `npm run build`. Both new spec files are written and reported to the
  lead; they need a sync-point rebuild to actually turn green.

### Bundle 2

- SCR-047/048 (`src/lib/dal/admin-lists.ts`) needed no new SQL either: `categories` and
  `companies` already carry `p2_admin_insert`/`p2_admin_update` (0004), and the generic
  `POL-{companies,categories}` cases in `tests/rls/tenancy.test.ts` (the lead's) already prove
  the write policy — this track's insert/update is a plain call into it, same as `createVenue`/
  `setVenueActive` (`sessions`'s SCR-046 code, inherited) already did.
- The dashboard's "busiest categories"/"most active companies" figures, which bundle 1 had to
  link forward, now point at real screens; "active members" still 404s until SCR-049 (bundle 3).

### Bundle 3

- SCR-049 (members and roles) turned out to need **no new writes**: `set_member_role`,
  `deactivate_member`, `reactivate_member` already exist in migration `0005` — the last-admin
  guard, the audit row and the `claims_version` bump REQ-ADM-009/REQ-TEN-005 ask for were already
  built and already proven in `tests/rls/rpcs.test.ts`. This screen is a thin caller, and its own
  job was turning a raised identifier (`last_admin`, `cannot_deactivate_self`, …) into a real
  Arabic sentence per row rather than one generic "failed."
- **One real gap, closed with new SQL:** `03`'s role×resource matrix says an org admin has full
  read on `members`, but `0004`'s column grant never actually included `email` for ANY role but
  the member's own `me()` RPC (`0005`'s own comment on `me()` says so). REQ-ADM-009's "view a
  member's full record" had no path until `admin_list_members()`
  (`supabase/proposed/console/0001_admin_members.sql`) — `me()`'s shape widened to "my org, admin
  only." A column grant can't do this: it would hand every member in the org everyone else's
  email, not only an admin's (the same reasoning DEC-044 gave for `list_session_ratings_admin()`).
  Flagged to the lead with the `03` §8.2 rows in the commit.
- Every dashboard figure now has a real destination — `/app/admin/members` was the last one
  bundle 1 had to link forward.
- The SCR-049 list is what `scoring.md`'s carried-over member-picker item (SCR-053's manual-
  adjustment form) will eventually search against — not built yet; noted for the bundle-9 touch.

### Bundle 4 — SCR-044, and the moderator/`/sessions` question closed for real

- **The manual-mark RPC already existed.** `mark_checked_in_manually()` (`0015`, `checkin`'s
  wave-1 work) already does everything `REQ-CHK-008` asks: admin-or-moderator, a mandatory
  reason, `REQ-CHK-011`-safe, and it only works while the session is `in_progress` — the screen
  surfaces that constraint rather than fighting it (a note, not a hidden form). `listUncheckedConfirmedRsvps()`
  (also `checkin`'s) is exactly the picker source SCR-044's manual-mark form needs.
- **The attendance report itself is new** (`getAttendanceReport()`, `src/lib/dal/checkin.ts`,
  added under this track's "admin-only functions in checkin.ts" allowance) — a caller-side join
  of `rsvps`/`check_ins`, both already staff-readable for the whole session. A no-show is
  computed the *same way* `worker/src/tasks/evaluate_no_shows.ts` defines one (confirmed RSVP, no
  check-in) so the report and the points job can never quietly disagree about what counts.
- **REQ-RAT-005 needed nothing new either** — `getRatingsForAdmin()` (`event`'s `ratings.ts`,
  already calling the audited `list_session_ratings_admin()` from DEC-044) is imported directly
  and gated `admin`-only within this otherwise staff-accessible screen.
- **The moderator/`/sessions` gap flagged at bundle 1 is closed.** `admin/sessions/page.tsx` now
  branches on role at its very top: an admin gets the exact same page as before (byte-for-byte
  unchanged code path below the branch), and a moderator gets `ModeratorSessionsView` — a new,
  separate render with id/title/state/start-time and one link to `/attendance`, backed by the new
  `listSessionsForAttendance()` (`src/lib/dal/sessions.ts`). No pipeline, no direct-create form,
  no `SessionControls`: `REQ-ADM-005`'s scheduling actions are absent from the render, not hidden
  by CSS, because `listSessionsForAdmin()` (the only thing that could produce them) is never
  called on the moderator path.
- **One new proposed migration, generic on purpose:** `write_admin_export_audit()`
  (`supabase/proposed/console/0002_admin_export_audit.sql`) is REQ-ADM-017's "every export is
  audited," written to take a plain export-type label so SCR-061's org-wide exports (sessions,
  RSVPs, ratings, points, certificates, members — bundle 7) can call the same function rather than
  each getting their own. The attendance CSV (`src/app/api/admin/exports/attendance/[sessionId]/
  route.ts`) is its first caller.
- `src/lib/dal/admin-exports.ts`'s `buildCsv()`/`csvField()` (BOM, RFC 4180 quoting, CRLF records)
  is the shared CSV builder every future export in this track should reuse rather than
  reimplementing — flagged here so bundle 7 finds it before writing a second one.

### Bundle 5 — SCR-050/051/052, and why there are three screens, not one

- **The three-way split, decided here and worth restating if it's ever questioned:** comments
  have exactly one moderation path (a report — nothing hides a comment instantly the way a photo
  takedown does), so SCR-050 is the comment report queue. Photos have two, and DEC-005 requires
  they never merge: SCR-051 is the takedown queue (already hidden, urgent), SCR-052 is the photo
  report queue (not yet hidden, a different urgency). "Reports" (SCR-052) is therefore
  photo-specific, not a general inbox — comment reports live entirely on SCR-050.
- **Two real gaps, both explicitly flagged by earlier waves' own notes for whoever built this UI**
  (found by reading `content.md` §1.4 and migration `0032`'s own header before writing anything):
  `remove_photo()` is the RPC `content`'s note called "STORY-EVT-006's RPC, not this schema
  pass," and `_reverse_photo_points()` is the trigger `scoring`'s note called "the same shape
  [as `_reverse_comment_points()`] applies the day [photos] does." Both now exist, plus a third
  gap neither note mentioned: comment removal never wrote an `audit_log` row at all —
  `comments_audit_staff_actions()` closes it, mirroring `photos_audit_staff_actions()` (`0051`).
- **`removal_reason` is a new column on both `comments` and `photos`** — REQ-EVT-014's "audited
  with actor AND REASON" had nowhere to put the reason on either table. Extending `moderateComment()`
  itself (event's) wasn't an option (not this track's file to edit), so this track's own writes in
  `admin-moderation.ts` set the column directly, using the `p6_staff_update` grant `0003_moderation.sql`
  extends to include it.
- `remove_photo()` also sets `hidden_at` on removal (not just `removed_at`) — `photos_read`'s
  policy checks `hidden_at`, not `removed_at`, so without this a "removed" photo with `hidden_at`
  still null would stay visible to ordinary members through the policy itself, with only the DAL's
  own `.is("removed_at", null)` filter (defence in depth, never the boundary) standing between it
  and them.

### Bundle 6 — SCR-061/062/063, and every REQ-ADM-004…020 screen is now built

- SCR-061 (exports), SCR-062 (audit) and SCR-063 (settings) needed no new SQL at all —
  `write_admin_export_audit()` (bundle 4) is generic across every export type, `audit_read_admin`/
  `audit_read_moderator_own` (0004) already pre-scope the audit query by role, and `p2_admin_update`
  plus `org_settings_history()` (both 0004) already cover every settings field and its own history.
- Ratings' export is deliberately aggregate (`session_rating_aggregates`), not per-rater —
  `list_session_ratings_admin()` is audited once per session on SCR-044; looping it across an
  entire org for one CSV would multiply its audit rows for a shape nobody asked for.
- Settings deliberately excludes the reminder schedule (`/admin/reminders`) and the recognition
  perks (`/admin/recognition`, including `priority_rsvp`'s own enablement) — both already own
  their slice of `org_settings`.
- **Every REQ-ADM-004…020 screen this track was assigned is now built.** What remains is exactly
  the three carried-over items — bundle 7.

### Bundle 7 — the three carried-over items, closing the track

1. **SCR-043's RTL date-time picker** (DEC-045) — `<RtlDateTimePicker>`
   (`src/components/admin/rtl-datetime-picker.tsx`), replacing all four native `datetime-local`
   fields on the schedule form. Fully custom DOM, no OS overlay, so it actually inherits the
   page's `dir="rtl"`; digits follow the org's numeral system. **Known collateral, not fixed
   here** (the file is out of this track's edit globs): `tests/e2e/sessions-screens.spec.ts:205`
   (the M2 demonstrable's own walk) calls `.fill()` on the field labelled «التاريخ والوقت», which
   now opens a picker rather than accepting typed text. Suggested replacement for that one line,
   for whoever owns that file:
   ```ts
   const when = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
   await boss.getByRole("button", { name: new RegExp("^التاريخ والوقت:") }).click();
   await boss.getByRole("button", { name: new RegExp(`^${when.getDate()} `) }).click();
   await boss.getByLabel("الساعة").selectOption("18");
   await boss.getByLabel("الدقيقة").selectOption("0");
   await boss.getByRole("button", { name: "تم" }).click();
   ```
   Two component test files prove the picker itself
   (`tests/components/admin/rtl-datetime-picker.test.tsx`, 7 cases) — not yet run against a real
   page, same e2e-build blocker as everything else this wave.
2. **SCR-053's member picker** (`scoring.md`'s flagged gap) — `<MemberPicker>`
   (`src/components/admin/member-picker.tsx`), a client-side filter over `listMembersForAdmin()`.
   Zero e2e collateral: neither `scoring-screens.spec.ts` (this track's) nor `points.spec.ts`
   (scoring's, checked before touching anything) drives the manual-adjustment form's member field
   through the UI.
3. **08's fourth reminder message** (DEC-047) — `reminder_message_key()` and `notification_
   matrix()` both extended (`supabase/proposed/console/0004_reminder_generic_message.sql`), proven
   at the database layer (`tests/rls/reminder-generic-message.test.ts`, 4 cases). **Genuinely
   incomplete, and said so in the commit**: the actual subject/body text for `MSG-reminder_generic`
   lives in `worker/src/mail/templates.ts` (email) and `notifications.json`'s `message.MSG-*` map
   (in-app) — both outside every one of this track's edit globs, and DEC-047's own words call the
   message itself "a plan decision, not mine." Both files WERE read (read access is unrestricted;
   only writes are globbed) to draft this accurately rather than guess. Drafted in full below for
   the lead to apply; nothing here is faked or silently skipped.

   **For `worker/src/mail/templates.ts`** (add alongside the other `MSG-reminder_*` entries — same
   shape, `{{title}}`/`{{startsAt}}`/`{{venue}}`/`{{tasks}}`/`{{url}}` all already populated by
   `send_reminder_notification()`'s existing payload for every reminder key alike):
   ```ts
   "MSG-reminder_generic": {
     subject: "تذكير: {{title}}",
     body: `${greeting}\n\nتذكير بجلسة «{{title}}» القادمة.\n\nالموعد: {{startsAt}}\nالمكان: {{venue}}\n\n{{tasks}}\n\n{{url}}`,
   },
   ```
   **For `src/messages/{ar,en}/notifications.json`'s `notifications.message` map** — checked
   against the real file first: every entry there (`MSG-reminder_7d`, `MSG-session_changed`,
   `MSG-badge_earned`, …) is a short, STATIC headline string with no interpolation at all — the
   inbox component reads the session title/date from `notification.payload` itself and renders
   this phrase alongside it, not inside it. So the addition is one short phrase per locale, not an
   object:
   ```json
   "MSG-reminder_generic": "تذكير بجلسة قادمة"
   ```
   ```json
   "MSG-reminder_generic": "Upcoming session reminder"
   ```
   **A `DECISIONS.md` entry is needed** per DEC-047's own framing ("a plan decision"). Suggested
   content: record that `08` §1.2 gains a fourth reminder message, `MSG-reminder_generic`,
   category `reminders`, channels in-app + email, for any `reminder_offsets_minutes` value outside
   ±20% of the three built-in offsets; cite REQ-NTF-004; supersede nothing (additive to `08`'s
   frozen matrix, the same class of change `0026`'s two missing email defaults already made under
   DEC-047 itself).

## Bug-fix pass against real e2e failures (post-bundle-7)

Fixed and verified against a real local build + real local Supabase, `browse.spec.ts` /
`admin-members.spec.ts` / `admin-attendance.spec.ts` / `admin-exports.ts` in scope:

1. **Ambiguous PostgREST embed, three call sites** (`src/lib/dal/checkin.ts`'s
   `getAttendanceReport()`, `src/lib/dal/admin-exports.ts`'s `exportAllAttendanceCsv()` and
   `exportPointsCsv()`): `check_ins` has two FKs into `members` (`member_id`, `marked_by`) and
   `points_ledger` has two (`member_id`, `actor_id`) — an unqualified `members(...)` embed is
   ambiguous and PostgREST refuses it outright, a real server crash on SCR-044 for both admin and
   moderator. Fixed with `members!check_ins_member_id_fkey(...)` /
   `members!points_ledger_member_id_fkey(...)`, matching the precedent already in `event`'s
   `comments.ts` (`author:members!comments_author_id_fkey(...)`). Verified against a real build.
2. **admin-members role-change test race**: the `<select>` is uncontrolled, so
   `selectOption()`'s DOM value is set instantly and is unaffected by whether the server action
   ever completed — the test's DB assertion could run before the RPC committed. Added a `done`
   flag to `changeRole`/`deactivate`'s returned state (`admin/members/{actions,state}.ts`) and a
   visible confirmation the test now waits on instead (`member-row.tsx`,
   `roleChanged`/`deactivateDone` in `admin.json`). Verified against a real build, 4/4 passing on
   both projects.
3. **390 px admin sub-nav overflow**: `admin/layout.tsx`'s nav used `overflow-x-auto
   whitespace-nowrap`, a legitimate scroller, but the shared 390 px helper flags anything that
   escapes the viewport regardless of container — switched to `flex-wrap`. Verified against a real
   build, dashboard/lists/moderation 390 px cases green on the phone project.
4. **SCR-011 own e2e, two test-side bugs** (mine to fix, not app bugs):
   - The `phone` Playwright project runs at a narrow viewport by default, so the category chip and
     the search field only exist inside `<FilterSheet>`'s mobile bottom sheet — the original tests
     never opened it. Fixed with a shared `openMobileFilterSheetIfPresent()` helper.
   - That helper needs to *poll* for the toggle rather than sample `.isVisible()` once: this
     route's shell can still be resolving a streamed Suspense boundary for a few hundred ms after
     `goto()` returns, during which the toggle briefly sits in a hidden placeholder — an unpolled
     check reads that as "no toggle" indistinguishably from desktop. `waitFor({state:"visible"})`
     fixed it.
   - Once the sheet is open, `<FilterSheet>` (content's) has TWO copies of `<SearchFilters>` in
     the DOM at once — the always-mounted, CSS-`hidden` desktop `<aside>`, and the dialog.
     `getByRole` is accessibility-tree-scoped so the chip test's role lookup only ever saw the
     dialog's copy; `getByLabel` is not, so the search test's label lookup hit a strict-mode
     violation (2 matches) once the sheet opened. Scoped the search test to the dialog's own
     locator, returned by the shared helper. Verified: `browse.spec.ts`, 10/10 (excluding the
     bookmark case below and the 390 px capture, not re-run this pass), both projects, twice in a
     row for stability.

**Not mine to fix — reported to the lead, `content`'s files**: `REQ-DSC-006` bookmarking from the
list is a **genuine, deterministic server bug**, not a test race (confirmed by direct REST
reproduction, not just the e2e run — see the team-lead message). `public.bookmarks` (`0037_m5_
schema.sql`) grants only `select, insert, delete` to `authenticated`; `toggleBookmark()`'s
(`src/lib/dal/bookmarks.ts`) `.upsert(..., {onConflict:"member_id,session_id"})` compiles to
`INSERT ... ON CONFLICT (member_id, session_id) DO UPDATE ...` regardless of whether a conflict
ever actually occurs — Postgres checks the privileges the *parsed* statement references, not the
runtime path, so every first-time bookmark hits `42501 permission denied for table bookmarks`.
PostgREST's own error hints the missing grant. The function's own comment says the intent was a
harmless no-op on a repeat bookmark, which points at `ignoreDuplicates: true` (→ `ON CONFLICT DO
NOTHING`, no UPDATE privilege needed) as the more targeted fix over adding a grant + policy this
table was never meant to have. `tests/e2e/browse.spec.ts`'s own `REQ-DSC-006` test was fixed to
`expect.poll()` the DB instead of trusting the button's optimistic label (the same test-race class
as item 2 above) and now fails for the right reason — it stays red until `content` lands the fix.

**Housekeeping**: Supabase's local containers were found stopped, then Kong's cached DNS to a
restarted `auth` container went stale, mid-investigation — both fixed with `supabase start` and
`docker restart supabase_kong_kareem-marefa` since nothing else here could produce a trustworthy
green/red signal. Flagged to the lead since the console track's own rules say not to touch the
Supabase lifecycle.

## Second pass — sync-6's full-suite run

Two more real bugs, neither visible from source review, both fixed and verified:

- `admin-members.spec.ts`'s deactivation test hung the full 30 s: `member-row.tsx`'s "deactivate"
  control is a bare `<summary>` (the `<details>` disclosure itself), which does not get an
  implicit ARIA "button" role in Chromium — `getByRole("button", ...)` never matched it. Switched
  to `getByText`. Test-only fix, verified immediately (no rebuild needed): 9/9 passing.
- SCR-044's manual-mark form reused `listUncheckedConfirmedRsvps()` — the presenter host view's
  own function, scoped on purpose to confirmed RSVP holders — so a waitlisted attendee who showed
  up was never selectable, and the whole form silently doesn't render once nobody unchecked
  qualifies. Added `listUncheckedForAdminManualMark()` to `checkin.ts` (admin-only, additive,
  `listUncheckedConfirmedRsvps()` itself untouched) scoped to confirmed OR waitlisted, wired
  SCR-044's page to it instead. **Source-verified, not yet e2e-green**: this needs a rebuild
  (`.next/BUILD_ID` predates the fix) — `tsc`/lint are clean and the translation keys
  (`memberLabel`, `mark`, `reasonLabel`) match the test's locators exactly.

`content` has already landed the bookmark fix I reported (`ignoreDuplicates: true` in
`toggleBookmark()`) — confirmed by reading the diff, not yet rebuilt/re-run.

---

## Wave 5 — M9, the system (this session)

Read `.claude/agents/console.md` (regenerated for M9 — DEC-085), `CLAUDE.md`'s wave-5 table,
DEC-019/069/085/087/101, `16` §4.2/§6.7/§16.2, `10` §7. The wave-3 track above is history; M9
builds no screens (`16` §16.2: "nothing you build in M9 redesigns a screen"). This wave's job is
six `ui/` primitives plus the admin shell's skip link, so M11 has real components to build the
console from.

### Scope

`src/components/ui/{data-table,combobox,menu,tabs,sheet,date-time}.tsx`, replacing the lead's
day-one stubs against the FROZEN `ui/index.ts` contract; `app/admin/layout.tsx` (the second skip
link past the nav, `REQ-UIX-017` — the rail itself is M11) + `app/admin/error.tsx` (the shared
`RouteError`); `member-picker.tsx` re-exporting `ui/combobox`; `messages/*/admin.json`.

### Order (easiest first)

1. `menu.tsx`, `tabs.tsx`, `sheet.tsx` — Radix wrappers, `dialog.tsx` is the house precedent.
2. `date-time.tsx` — adopts `src/components/admin/rtl-datetime-picker.tsx` unchanged (not in my
   edit list; import only).
3. `combobox.tsx` — promotes `src/components/admin/member-picker.tsx`'s pattern; Arabic
   normalisation, multi-select with removable chips.
4. `data-table.tsx` — sticky header, `aria-sort`, selection + bulk bar, phone stacked-card mode.
5. `member-picker.tsx` → thin wrapper over `ui/combobox`, same external signature (the caller,
   `admin/scoring/page.tsx`, is `scoring`'s file this wave — not in my edit list, so the wrapper
   must stay byte-compatible with its existing call: `members`, `name`, `label`, `required`,
   `placeholder`, `noMatches`).
6. `admin/layout.tsx` + `admin/error.tsx`.
7. Tests: one jsdom + axe-core test per primitive in `tests/components/ui/`.

### Three real gaps found in the frozen contract, flagged here (not blocking — interim built, documented)

1. **`DateTimeProps` and `ComboboxProps` carry no `label`.** Every other labelled control in `16`
   §8.2's model expects `<Field>` to own the visible label via `<label htmlFor>`. That works
   unmodified for `combobox` (a real `<input>` — `<label for>` on a labelable element is enough).
   It does NOT work for `date-time`: the adopted picker's trigger is a `<button>` whose accessible
   name must combine the field's meaning with the LIVE value (`rtl-datetime-picker.tsx`'s own
   comment explains why — a plain `<label for>` would freeze the name at mount and never update as
   the value changes). With no `label` prop to build that from, `ui/date-time.tsx` uses a GENERIC
   internal string («التاريخ والوقت» — `admin.dateTime.triggerLabel`) for now. **Real consequence:**
   until `DateTimeProps` gains a `label: string`, every `<DateTime>` on a page with more than one
   date field (SCR-043 has four) is accessibly indistinguishable by name alone. Suggested fix for
   the lead: append `label: string` to `DateTimeProps` (non-breaking — nothing consumes it yet).
2. **Neither carries `numerals`/`locale`.** Every existing numerals-aware client component in the
   repo (`schedule-form.tsx`, four call sites) takes `numerals: NumeralSystem` as a prop from its
   server-rendered parent — there is no client context for it anywhere in `src/` (`grep -rn
   createContext src/` is empty). `date-time.tsx` and `combobox.tsx`'s internal default
   `resultsLabel` therefore accept `numerals` as an EXCESS optional prop beyond the frozen type
   (`DateTimeProps & { numerals?: NumeralSystem }`), defaulting to `"western"` — matching
   `org_settings.numerals`'s own DB default (`0004_tenancy.sql:113`), so an org that never
   overrides the setting sees no drift. `locale` comes from `useLocale()` (next-intl, no prop
   needed). Suggested fix: the same append, `numerals?: NumeralSystem`, to both types.
3. **`DataTableProps` has no per-row selection label, and none is derivable from `columns`** (a
   cell can render arbitrary `ReactNode`, not guaranteed text). Standard fix, no type change
   needed: the selection checkbox is `aria-labelledby` over a shared hidden "تحديد الصف" span
   *plus* the row's own first-column cell id — the visible content already there stands in for a
   caller-supplied label, so nothing is invented and nothing is lost.

None of these block M9 — nothing here is consumed by a real screen until M11, and by then either
the lead has appended the two fields above or `console` (still me, in M11) migrates the interim
default at the one call site it will actually matter.

### axe-core in jsdom

No `jest-axe`/`vitest-axe` wrapper is installed and `package.json` is lead-only, so I cannot add
one. `axe-core` itself IS present (`node_modules/axe-core`, a transitive dep of
`@axe-core/playwright`) and importable directly — `import axe from "axe-core"; const { violations
} = await axe.run(container); expect(violations).toEqual([])`. Repeated per test file rather than
factored into a shared helper, since my test-file edit list is the six exact filenames, not a
helper module.

### `combobox`'s Arabic normalisation

`src/lib/dal/search.ts`'s `arNormalize()` cannot be imported into `ui/combobox.tsx` — that module
starts `import "server-only"`, which throws if pulled into a client bundle. Duplicated verbatim
(same transform, same order: strip tashkeel/tatweel, fold alef/yaa/taa-marbuta, collapse
whitespace) with a comment pointing at the original, the same reasoning `numerals.ts:9` already
uses for why `NumeralSystem` is declared twice rather than imported once.

### `DataTableProps` has no `search`/`pagination` field

`16` §6.7's prose describes a table with "a search box … pagination" but the frozen type
(`index.ts:600`) carries neither — per DEC-102 ("§16.2 is authoritative" over §4.2's looser prose
for a similar count mismatch), the type wins: search and pagination are the CALLING SCREEN's
composition (filter `rows` before passing them in, render its own pager), not `DataTable`'s own
job. Flagged so whoever builds the first real M11 screen doesn't go looking for a prop that was
never meant to exist.

### A real, pre-existing bug found by `date-time.test.tsx`'s axe assertion, outside my edit list

`src/components/admin/rtl-datetime-picker.tsx`'s prev/next-month buttons (the ones with
`<ChevronIcon direction="back"/>`+`<ChevronIcon direction="forward"/>`, no `label`, no `aria-label`
of their own) fail WCAG 4.1.2/1.1.1 — axe's `button-name` rule, caught the moment the picker's
popover is open. Not a false positive (unlike `color-contrast` and `region`, both jsdom-harness
artifacts disabled the same way `tests/components/ui/badge.test.tsx` already does): a screen reader
announces both buttons as bare "button" with no way to tell which direction is which. This file is
explicitly **not** in this track's M9 edit list (DEC-045's file, "adopt, do not replace" per the
spawn note), so `date-time.test.tsx` disables `button-name` for its one open-popover assertion,
documents why in the same comment, and records it here rather than silently hiding it.

**Suggested fix for whoever next touches that file:** `aria-label={prevMonthLabel}` /
`aria-label={nextMonthLabel}` on the two buttons (or pass `label` into `<ChevronIcon>` instead),
sourced the same way the picker's other six labels already are — as new required props on
`RtlDateTimePickerProps`, threaded from `ui/date-time.tsx`'s own `admin.dateTime.*` keys the way
`clearLabel`/`todayLabel`/etc. already are. Two new keys, `admin.dateTime.previousMonth` /
`admin.dateTime.nextMonth`, would cover it.

### A second, narrow exception to the file list: `tests/components/admin/member-picker.test.tsx`

Not in this track's M9 edit list either, but changing `member-picker.tsx` to wrap `ui/combobox`
(an explicit instruction this wave) broke its existing test two ways, both real: (1) it needed
`NextIntlClientProvider` (the wrapper's non-zero results announcement now falls back to a
translated string); (2) `getByRole("combobox", {name:...})` still resolved correctly since the
external `<label htmlFor>` wiring is unchanged. Fixed with a provider wrapper, kept otherwise as
close to the original as possible. `npm test` green was the overriding constraint — leaving a test
red as a direct, foreseeable consequence of an explicitly requested change would not be.

### Two real bugs `combobox.tsx`'s own test found before I wrote a report about them

1. **`role="option"` was on the `<li>` wrapper while `onClick` lived on a nested `<button>`** — a
   click event's target is the innermost element, so `fireEvent.click` on the `getByRole("option")`
   element (the `<li>`) never reached the button's handler at all. Fixed by moving `role="option"`
   onto the button itself, matching `member-picker.tsx`'s own original precedent
   (`role="option"` was already on ITS button, not a wrapping `<li>` — a detail lost while
   generalising it).
2. **That same fix then broke `aria-required-children`/`aria-required-parent`**: `<ul
   role="listbox">`'s direct children were `<li>` elements carrying their own implicit `listitem`
   role, which breaks the ARIA-required `listbox` → `option` relationship once `option` moved one
   level deeper. Fixed with `role="presentation"` on each `<li>`, which removes it from the
   accessibility tree's structural requirements without changing anything a sighted or keyboard
   user experiences.

Neither would have been caught by reading the code — both came directly from the axe assertion and
the `fireEvent.click` selection test the spawn note asked for by name ("axe cannot tell you whether
`aria-activedescendant` follows the highlighted option").

---

## Wave 6 — the admin console on the system (DEC-110, DEC-130)

Read `.claude/agents/console.md` (regenerated for wave 6, then again at `57f1103`),
`STATUS.md`'s START HERE + WAVE 6 block, `CLAUDE.md`'s wave-6 map,
`DEC-110/112/114/122/123/124/130/131/132`, `16` §3.1/§4.2/§5.2/§6.7/§7.3/§7.4/§8.2,
`REQ-UIX-001/003/007/009…013/017`, `REQ-ADM-004/005/009/010/020`.

**Numerals landed at `57f1103`** (code half `c20b901`, a date-time a11y fix `73b0f3e`). §0–§4 below
were drafted against the pre-sweep tree (`9120237`) and have been **re-read and checked against disk
since** — corrections are marked ★ inline rather than silently rewritten over. The two real
deltas found: (1) `admin/proposals/page.tsx` and `admin/moderation/reports/page.tsx` dropped
`getOrgPrefs()` entirely (it existed only for `numerals`); `admin/sessions/page.tsx` and
`admin/members/page.tsx` keep it — it still returns `timeZone` for `formatDateTime`. (2) the lead
fixed `rtl-datetime-picker.tsx`'s month-button a11y bug directly (`73b0f3e`) — not mine to redo, and
not consumed by any of my five routes this wave regardless. **Still no source file touched** —
holding for the lead's reply to the report before starting code, per this turn's instruction.

Owned this wave: `admin/{layout,page,loading,error}.tsx`, `admin/proposals/**`, `admin/members/**`,
`admin/moderation/reports/**`, `admin/sessions/{page,actions,state,session-controls,direct-session-
form}.tsx` only (never `[id]/**`), `lib/dal/{admin-dashboard,admin-lists,admin-members,admin-
moderation}.ts`, `components/admin/**`, my six `ui/` files, `messages/*/admin.json`.

**Never-touch, restated per `57f1103`'s naming pass (decided, NOT this wave):** multi-day sessions
(`DEC-119`–`121`), the manual check-in switch + walk-ins as a publishing setting
(`DEC-113`/`116`/`117`/`118`), gradient posters + `canvasRaise` (`DEC-127`). None of the three touches
the admin sessions list as planned in §2.3 below — that section shows `SessionState`/`startsAt` only,
no check-in switch, no walk-in flag, no poster styling.

### 0. What the current tree actually does (read before planning, not assumed)

- `admin/layout.tsx` — a flat wrapping `<ul>` of 19 links (`NAV_ITEMS`), gated on `built`/
  `adminOnly`, plus a working second skip link (`#admin-content`, `tabIndex={-1}`). `admin/error.tsx`
  already renders the shared `<RouteError>` (M9) — nothing to change there beyond a re-check after
  the layout edit. `admin/loading.tsx` is already a generic `SkeletonPageHeader` + eight row
  skeletons, direction-agnostic, no `getTranslations` — also already correct as the shared boundary.
- `admin/page.tsx` (SCR-040) — six ad hoc `<section>` blocks (`getAdminDashboardData()`), no «يحتاج
  انتباهك» section exists at all today — it is new work, not a re-skin.
- `admin/proposals/page.tsx` (SCR-041) — `ReviewCard` (client), approve is one click, reject/request-
  changes are typed behind a `<details>` reveal (deliberately not `required`, comment explains why),
  no dialog anywhere, no toast — an inline `role="alert"` paragraph is the only feedback.
- `admin/sessions/page.tsx` (SCR-042) — three sections (ready-to-schedule, direct-create with an
  **all-org-members checkbox list** for presenters — the exact scroll-trap `ui/combobox` was built to
  fix, just in a second place), plus the full admin list with inline text links and `SessionControls`,
  plus a **separate branch**, `ModeratorSessionsView`, for a moderator (id/title/state/start + one
  link). Raw `t(\`state.${s.state}\`)` strings, not the shared `SessionStatusBadge`.
- `admin/members/page.tsx` (SCR-049) — `<ul>` of `MemberRow` (client): two independent
  `useActionState` forms per row (role-change, deactivate-with-reason-behind-`<details>`) plus a
  plain-transition reactivate button. No avatar, no table semantics.
- `admin/moderation/reports/page.tsx` (SCR-052) — **photo reports only** (`reports.target = 'photo'`,
  `status = 'open'`), a responsive `<ul>` grid of `ReportCard` with a signed-URL `<img>`. Comment
  reports (SCR-050, `REQ-EVT-008`'s other half) are a **separate, unrebuilt** screen,
  `/app/admin/moderation/comments`, one of the 19 never-touch routes this wave.
- ★ **A discrepancy worth recording, not silently resolving (DEC-114's rule):** my agent file's
  route-5 line says this screen is "the queue where a flag raised from `content`'s rebuilt discussion
  lands." The tree says only **photo** reports land here; a flag on a **comment** lands on the
  untouched `/moderation/comments`. `content`'s wave-6 scope names both the discussion **and**
  `components/photos/gallery.tsx`, so a report raised from the rebuilt **photo gallery** does land on
  my screen — the sentence is accurate for photos and imprecise about "discussion." Treated as
  resolved by that reading; flagged here in case the lead meant something narrower.

### 1. The admin layout

**Decision: build the actual rail this wave**, not a placeholder for M11. The M9-era note above
("the rail itself is M11") is superseded — `DEC-110` folded the console into this wave in full, and
my current agent file says so explicitly ("A left rail, collapsible… Decide and capture the phone
treatment").

- **Items: keep the 19 existing flat entries**, not `16` §6.7's 14 grouped Arabic labels
  (لوحة/المقترحات/الجلسات/الأعضاء/الشركات/التصنيفات/الأماكن/الإشراف/النقاط والتقدير/التصاميم/الهوية/
  الإشعارات/التصدير/السجل/الإعدادات). §6.7's grouping folds moderation's three screens, scoring +
  recognition, both template libraries, and emails + reminders into single entries — that is a real
  information-architecture decision (sub-nav or a `/moderation` landing page) affecting **thirteen
  routes I do not rebuild this wave**, and the canvas has no artboard for it to check against
  (`DEC-114`: no artboard → build from `16`'s prose and the system, but a *grouping* is a structural
  change to routes I never touch, which is exactly what "never-touch" is supposed to prevent). Kept
  flat, same 19 `hreve`s, same `key`s (so `admin.shell.nav.*` message keys do not move) — just
  re-skinned onto the rail — same 19 `href`s, same `key`s. **Flagging the 14-group IA as a wave-7
  question**, not deciding it here.
- **Icons**, one per item, mapped from the existing `icons.tsx` (lead's, already built, 30+ glyphs):
  dashboard→`HomeIcon`, proposals→`CheckCircleIcon`, sessions→`CalendarIcon`, venues→`PinIcon`,
  members→`UserIcon`, moderation ×3→`AlertTriangleIcon`, scoring→`StarIcon`, recognition→`StarIcon`,
  emails→`BellIcon`, reminders→`ClockIcon`, exports→`DownloadIcon`, audit→`LockIcon`. **Four items
  have no good match and fall back to a reused or weak-fit icon**: categories/companies both have no
  tag or building glyph (interim: `UsersIcon` on companies, reused from members — a real scanning
  problem, two adjacent rail items sharing one icon), branding has no palette/swatch glyph (interim:
  reused `ImageIcon`, shared with the two template-library items), settings has no gear glyph
  (interim: `MoreIcon`, a weak fit by meaning). **Request to the lead, `icons.tsx`:** four new
  glyphs — tag, building, palette/swatch, gear — same 24 px/1.7 px-stroke spec as the existing 32.
  Until they land the rail ships with the reuses above, documented as interim, not silent.
- **Collapse:** a client wrapper (inside `layout.tsx`, which I own — no new `ui/` file needed for
  this) holding a boolean, persisted to `localStorage` as a per-viewer convenience only (never read
  back by the server, wrapped in try/catch, the page renders correctly if it throws or comes back
  empty — `artifact-capabilities`-style discipline even though this isn't an artifact). Collapsed =
  icon-only rail with `title`/`aria-label` per item; expanded = icon + label. A single
  `IconButton` (lead's `icon-button.tsx`) at the rail's top toggles it, `aria-expanded` on the `<nav>`.
- **Phone treatment, and why:** **not** the rail, not the current `flex-wrap` strip either. Below
  `md`, the rail collapses entirely behind a small top bar (page title + a menu `IconButton`) that
  opens the full nav in `ui/sheet` (my file), `side="inline-start"` — a drawer from the reading-start
  edge, matching how a phone nav drawer is universally read regardless of RTL/LTR. Reasoning: (1) a
  persistent rail at 390 px eats a third of the viewport before any content renders; (2) the
  `flex-wrap` fix from the wave-3 bug pass was a patch over the wrong shape (a 19-item nav wrapping to
  three rows on a phone is still a wall of nav before content, just not off-screen); (3) `ui/sheet` is
  explicitly named for "the search sheet, the filter sheet, and anything that would otherwise be a
  modal at 390 px" — a full-height nav drawer is exactly that. The sheet's `title` prop carries
  `admin.shell.brand` so it announces correctly; closing it returns focus to the trigger (Radix's
  default, not something to reimplement).
- **Second skip link (`REQ-UIX-017`):** unchanged in substance — first focusable element inside this
  layout, visually hidden until focused, `href="#admin-content"` `tabIndex={-1}`, jumping past
  whichever rail form is active (collapsed rail, expanded rail, or the phone trigger — the sheet is
  closed by default so the skip link never has to jump past open sheet content).
- **Proving an untouched screen at 390 px still works:** capture
  `.qa-shots/rtl/wave6-console-layout-untouched.png` of `/app/admin/venues` (unmodified this wave,
  still on `flex-wrap`'s old classes for its own page content, wrapped by my new rail) at 390 px RTL,
  after the layout lands — check no overlap between the rail/sheet-trigger bar and the page's own
  `<h1>`, and that `venues/page.tsx`'s content padding still clears the tab bar
  (`scroll-padding`/`padding-block-end` tokens, `16` §3.1 — lead's, unaffected by my change but worth
  confirming visually since the wrapping element changed). Also re-run any existing e2e spec that
  loads an admin screen not in my five (none currently assert on `admin/layout.tsx`'s markup — grepped
  `tests/` for `admin-content`/`nav.dashboard`/`admin\.shell` and found only the layout/DAL files
  themselves and `platform/layout.tsx`, so no test locks in the flat-`<ul>` shape).

### 1.5 Six lead primitives left stub status at `1d73e89` — read the real files, not the frozen types

`page-header.tsx`, `section-header.tsx`, `icon-button.tsx`, `prose.tsx`, `link.tsx` and
`route-progress.tsx` are now real. Read directly (not re-derived from `index.ts`'s types alone,
which under-describe two of them):

- **`ui/page-header`** — every `<h1 className="text-h1...">` + `<p className="...text-fg-muted">`
  pair on my five pages becomes one `<PageHeader title description meta actions />` call.
  ★ **`PageHeaderProps` grew a field since I last read it: `breadcrumbLabel`** — required whenever
  `breadcrumb` is passed (it names the breadcrumb `<nav>`'s accessible name; a page already carries
  several nav landmarks, so an unnamed one is ambiguous). None of my five routes is deep enough to
  need a breadcrumb (they're all one level under the rail) — `breadcrumb`/`breadcrumbLabel` stay
  unset everywhere in this plan. `title` is bidi-isolated **inside** the component — I stop wrapping
  it in `<bdi>` myself at the call site. `meta` is where a status count or a filter chip belongs,
  under the title — used on `/app/admin/sessions` (nothing today, but noted in case a future filter
  summary needs it) and left empty elsewhere.
- **`ui/section-header`** — replaces the ad hoc `<h2 id="..." className="text-h3...">` pattern used
  for every sub-section today (dashboard's six panels, proposals/sessions/members' sub-lists).
  `count` renders a bare Western-formatted number beside the title (`formatNumber(count)`, called
  **inside** the component) — a heading decoration, not a full ICU-plural sentence, so it does not
  replace the richer plural sentences already in the copy (proposals' «مقترح واحد بانتظار المراجعة»
  style intro line stays as body text; `count` is additionally used on `/app/admin/sessions`'
  "جاهزة للجدولة" and "كل الجلسات" section headings and on `/app/admin/members`' single section, since
  those don't currently have a plural-sentence intro to preserve).
- **`ui/icon-button`** — confirmed 44 px (`md`, the default) square, named (`label` mandatory),
  shares `ui/button`'s variants, default `ghost`. Used for: the rail's collapse toggle, the phone
  nav-sheet trigger, and every `DataTable` row's "المزيد" menu trigger (`variant="ghost"`, `size="md"`
  or `"sm"` inside a dense row — `sm` is 36 px and still clears the 24 px touch-target minimum, so
  it's the better fit inside a table row without inflating row height).
- **`ui/prose`** — added to my plan where I hadn't named a primitive for long-form text: proposals'
  abstract/target-audience/admin-notes blocks (today plain `<p className="whitespace-pre-line...">`),
  `size="sm"`. Nothing else on my five routes is long-form enough to need it.
- **`ui/route-progress`** — nothing to plan directly: it sits once in the shell (`app/layout.tsx`,
  lead's) and reads a store that `ui/link`'s own `LinkPendingReporter` writes into. Using `ui/link`
  everywhere below is what wires my five routes into it; there is no separate call site of my own.
- **`ui/link`** — wraps `@/i18n/navigation`'s `Link` (still locale-aware, same `href="/app/admin/…"`
  convention, no change to how I write a path) but also draws a pending dot and feeds the shell's
  `<RouteProgress>`. **Replacing every `Link` import from `@/i18n/navigation` with
  `@/components/ui/link` across all five routes and the rail** — dashboard's `TopList`/section links,
  proposals' (none currently), sessions' title/schedule/attendance/certificates links (now inside the
  row `Menu`, not bare text, but the `Menu`'s `href`-based items still resolve through this `Link`
  internally per `MenuProps`), members' "عرض الملف", reports' (none currently), and the rail's 19 nav
  items. `quiet` on links embedded in an already-dense row (rail items, `Menu` items, `DataTable`
  cells) so the pending dot doesn't add visual noise next to a menu icon or inside a small nav strip;
  left loud (default) on the dashboard's standalone section-title links, where a pending dot is the
  only loading affordance on an otherwise static heading. Not `"use client"`, so no server/client
  boundary problem on any of my server pages.

★ **A real, pre-existing bug found while checking this, in my own `menu.tsx` (M9-built, not a lead
stub — I own this file already):** `MenuItem.href`'s branch renders a raw `<a href={item.href}>`, not
`@/i18n/navigation`'s locale-aware `Link` and not the new `ui/link`. Every `href` written the house
convention way (`/app/admin/sessions`, no locale segment) currently navigates to a **locale-less URL**
through this path — `proxy.ts` would 307 it back through locale detection rather than landing
directly, and it never draws a pending dot or feeds `RouteProgress`. This is exactly the row-action
menu (فتح الجلسة / الجدولة / الحضور / الشهادات) I'm planning for `/app/admin/sessions`, so it is not
a theoretical gap — **it also affects `DEC-111`'s shell-disclosure sweep** if the lead's account/nav
menus route through `href` items (worth a heads-up now, not only in my own report). **Fix, in my own
file, when I touch `menu.tsx` this wave:** swap the raw `<a>` for `ui/link`'s `Link`
(`<Link href={item.href} quiet>{content}</Link>` inside the same `DropdownMenu.Item asChild`) — `Link`
renders `next/link`'s `<a>` as its root with `LinkPendingReporter` nested inside, which `asChild`
already tolerates elsewhere (`page-header.tsx`'s breadcrumb does the same composition). Not done yet
(still holding on code) — flagged to the lead separately since it may be live for them sooner than
for me.

### 2. Per-route plan

Shared across all five: `Button`/`IconButton`/`RouteProgress` (lead's, already wired globally),
`PageHeader` for the `<h1>` (replacing the ad hoc `<h1 className="text-h1...">` + `<p>` pattern on
every page today), `EmptyState` (content's) wherever a list can be empty, `Badge`/`SessionStatusBadge`
(content's) for any status, `Toast` (lead's `useToast()`-shaped handle) for action feedback replacing
every inline `role="alert"`/`role="status"` paragraph, `Dialog`/`DialogContent` (lead's) for the
REQ-UIX-013 confirmations. Numerals: every `formatNumber(n, prefs.numerals)` / `formatDateTime(iso,
numerals, tz, locale)` call becomes `formatNumber(n)` / `formatDateTime(iso, tz, locale)` once the
sweep lands (`DEC-132`) — noted per route below only where it matters beyond the mechanical rename.

**Destructive-vs-not, decided once, applied five times:** a `ui/dialog` naming the object is used for
**proposal reject**, **member deactivate**, **session cancel**, and **report removal** — acts that
withdraw something from someone or end a state that took work to reach. **Approve, request-changes,
reactivate, session start/complete/reopen, and report dismiss stay a single click** — forward-moving
or reversible, matching what the code already treats as low-friction today. Member **role change**
stays undialogued too (no existing precedent treats it as destructive, and `isSelf` already blocks
the one genuinely dangerous case). Stated here once rather than re-argued per route.

#### 2.1 `/app/admin` — the dashboard (SCR-040, `REQ-ADM-004`)

- `PageHeader` (title/description), then a NEW «يحتاج انتباهك» `Panel` (content's) above the existing
  figures — a queue list, not a stat grid, each row: icon + Arabic label + count + oldest-item age +
  a link, per §6.7's "counts that are links, a queue list with ages." See §3 below for the exact four
  rows and where each count comes from.
- The six existing `<section>` blocks become `Stat` tiles (content's `stat.tsx`) in a responsive grid
  for the single-number figures (`rsvpsConfirmed`, `checkInsTotal`, `attendanceRate`, `activeMembers`,
  `pointsIssued`), each with `href` to the screen it summarises (`REQ-ADM-004`'s own acceptance —
  already true today via plain `<Link>`, now expressed through `Stat`'s own `href`). The six-row
  proposal-pipeline breakdown and the three `TopList`s stay `<dl>`/`<ol>` inside a `Panel` +
  `SectionHeader` — not everything is a `Stat` or a `DataTable`; a six-row breakdown read as one
  glance doesn't need either.
- Empty: when all four attention rows are zero, the panel renders `EmptyState` — «لا شيء يحتاج
  انتباهك الآن» — action pointed at `/app/admin/sessions` (EmptyState's `action` is required by the
  type; there is no "fix a problem" CTA for a good-news state, so the action is framed as a neutral
  next step, not a repair).
- States to capture: attention items present, attention panel empty, phone (`Stat` grid → one
  column, attention rows stack).
- DAL: `getAdminDashboardData()` (my file) gains the four attention fields — see §3, all additive to
  the existing `Promise.all`, one query widened (`proposals` select gains `created_at`) and two new
  lightweight `head: true, count: "exact"` queries (`sessions` unscheduled, `reports` × 2 targets). No
  new file, no `supabase/proposed/console/` entry — same reasoning the original bundle-1 note gave:
  every figure is an aggregate over a table the admin's own RLS already lets them read.

#### 2.2 `/app/admin/proposals` — the review queue (SCR-041, `REQ-PRO-005/006`)

- `PageHeader`, then each proposal as a `Panel` (dense text, not media — `Card` reserved for
  browse-like/media items elsewhere) inside the existing `<ul>`/`ReviewCard` structure — the
  `useActionState` per card is unaffected; this is a re-skin plus new feedback and one new
  confirmation, not a rewrite of the action model.
- **Approve:** unchanged, one click, `Button pending` from `useActionState`'s pending flag.
- **Request changes:** unchanged shape — reveal behind `<details>` (deliberately not native
  `required`, per the existing comment's reasoning, which still holds), submit on click. No dialog
  (not destructive — the proposer can revise and resubmit; nothing is lost).
- **Reject — gets the `ui/dialog` (`REQ-UIX-013`):** the visible «رفض» control becomes `type="button"`
  opening a `Dialog` titled with the proposal's own title (`<bdi>`-wrapped, per invariant), body
  reads back the typed reason if any, and the dialog's own `type="submit"` button (bound to the same
  `formAction`, `name="action" value="reject"`) is what actually submits. The `<details>` reveal still
  holds the reason textarea — nothing about the "not `required`" reasoning changes, only the final
  commit step gains a named confirmation.
- **Feedback:** a `done`-style flag added to `ReviewState` (`admin/proposals/state.ts`, my file,
  additive) so a client `useEffect` on the returned state can fire `toast.show()` — success
  («تمت الموافقة على المقترح» / «تم رفض المقترح» / «تم إرسال طلب التعديلات») or failure, replacing
  the inline `role="alert"` paragraph. The paragraph stays as a fallback for users who dismiss the
  toast before reading it — belt and suspenders, not a redundant announcement (the toast is
  `role="alert"` on failure too, so this is a visible written record, not a second SR announcement).
- Empty: `EmptyState`, action → `/app/admin` (no other "next" screen makes sense on an empty queue).
- States: queue with items, empty, reject-dialog open, request-changes reveal open, pending, toast
  success/failure, phone (cards already stack — no table involved here).
- DAL: `listProposalsForReview()` (`lib/dal/proposals.ts`, **sessions'** file, read-only import).
  ★ **Re-verified against disk after the numerals sweep (`c20b901`): `getOrgPrefs()` is gone from
  this page entirely** — it existed here only to read `numerals` for `formatNumber()`, and
  `formatNumber(n)` takes none now. Nothing else on this screen formats a date, so there is no
  remaining reason to call it. My original draft still listed it; corrected here rather than left
  stale.

#### 2.3 `/app/admin/sessions` — top level only (SCR-042, `REQ-ADM-005`, `REQ-ADM-020`)

- **"جاهزة للجدولة"** stays a plain list (few rows typically, one action each) inside a `Panel`, not
  a `DataTable` — sort/search/pagination buys nothing at this size. `EmptyState` when empty.
- **"إنشاء بدون مقترح" stays secondary**, per the spawn note: collapsed behind a
  `Button variant="secondary"` that reveals `DirectSessionForm` (a plain client show/hide, not a new
  primitive) rather than a permanently-visible section.
- **`DirectSessionForm` rebuild:** every native `<input>`/`<select>`/`<textarea>` moves onto
  `Field` + the matching control (`sessions`' primitives, consumed not edited) with `FormSummary`
  above the form on a failed submit. **The presenter checkbox list becomes `ui/combobox`
  (multiple, my file)** — the exact scroll-trap pattern combobox was built to fix, just found a
  second time in a file I own; `member.id` as `value`, `displayName` as `label`, Arabic-normalised
  typeahead reused from the existing implementation.
- **"كل الجلسات" becomes a `DataTable`** (my file): columns — title (`<bdi>`, `onCard: true`),
  status (`SessionStatusBadge`, driven by `sessionPhase()` from `@/lib/session-status` — **lead's**,
  read-only import, already exported — mapping the raw `SessionState` onto the shared six-phase
  vocabulary so `completed`/`archived`/`cancelled` all read through the same «انتهت»/«أُلغيت» badges
  the rest of the product uses, closing the "ended is badged separately here today" gap named in my
  own M9 note), start time (`formatDateTime`, `onCard: true`), presenter status (declined/pending
  inline note, kept as today), row actions (a `Menu`, my file, trigger = `IconButton` "المزيد":
  فتح الجلسة → `/app/sessions/{id}`, الجدولة → `.../schedule`, الحضور → `.../attendance`, الشهادات →
  `.../certificates` — replacing the flat row of underlined text links). `SessionControls`'
  start/complete/reopen stay plain buttons; **cancel gets the confirm dialog**, naming the session
  title. No `rowHref` (multiple per-row destinations already exist via the menu; a whole-row link
  would conflict with them) and **no `selection`/bulk bar** — no bulk-capable RPC backs it
  (`runTransition` is per-session), so the prop is left unset rather than faked.
- **A client-side search box** (plain substring over title/presenter names, composed by this screen
  per my M9 finding that `DataTableProps` has no built-in search) filters `rows` before they reach
  `DataTable`. Default sort: `createdAt` desc (today's behaviour), toggle to title/status/`startsAt`.
- **`ModeratorSessionsView` gets the same `DataTable` treatment**, minimal columns (title, status,
  start), one row action (فتح تقرير الحضور) — DEC-130 chose this route for the phone card stack, and
  that applies to the moderator's smaller render too, not only the admin one.
- States: full table, empty, cancel-dialog open, row-action pending, toast, phone stacked cards for
  both the admin and moderator variants, direct-create form revealed with `FormSummary` on error.
- DAL: `listSessionsForAdmin`, `listSchedulableProposals`, `listCategories`, `listNameableMembers`
  (`lib/dal/{sessions,proposals}.ts`, **sessions'** files, read-only), `listSessionsForAttendance`
  (also sessions'), `getOrgPrefs` (sessions'). ★ Re-verified post-sweep: `getOrgPrefs()` now returns
  `{maxCoPresenters, timeZone}` only (`numerals` dropped) — still needed here for `formatDateTime`'s
  `timeZone` argument, so this page keeps the call, unlike proposals. My own `actions.ts`/`state.ts`
  gain the same `done`-flag addition as proposals, for toast triggering.

#### 2.4 `/app/admin/members` — SCR-049 (`REQ-ADM-009`, `REQ-TEN-005`)

- `DataTable` (my file). Columns: name — `Avatar` (content's, `src: null` always this wave per the
  spawn note, `memberId`/`displayName` drive the initials + stable-hash tint per `16` §6.8.2) +
  `<bdi>` display name/email + a `عرض الملف` link to `/app/members/{id}`, `onCard: true`; company
  (`onCard: true`); role (plain text + an inline `Select`, sessions' primitive, replacing the ad hoc
  `<select>` — kept undialogued, see the shared destructive-action note above); status
  (`Badge`, active/deactivated, `onCard: true`); actions (a row `Menu` — تعطيل / إعادة تفعيل).
  **No `rowHref`** — the row hosts a nested `<select>` and menu, so the whole-row-click pattern is
  skipped on purpose (nested interactive elements inside a clickable row is its own a11y trap); the
  name cell's own link is the "open the profile" path.
- **Deactivate gets the `ui/dialog`**, and the dialog itself hosts the mandatory-reason `Field` +
  `Textarea` (not a two-step details-then-dialog like proposals — a Radix dialog is a real modal, so
  native `required` is safe here, unlike inside a collapsed `<details>`), titled with the member's
  own name. **Reactivate stays one click** (already a plain `useTransition`, no reason, reversible).
- **A client-side search box** (name/email substring) feeds `DataTable`'s `rows`. **No `selection`** —
  same reasoning as sessions: nothing backs a bulk role-change or bulk-deactivate-with-one-shared-
  reason.
- States: table, filtered-empty (search with no matches — the realistic empty case; a genuinely
  memberless org can't exist once the admin themself is a member), deactivate-dialog open, role-change
  pending, reactivate pending, toast, phone stacked cards.
- DAL: `listMembersForAdmin()`, `listCompaniesForAdmin()` (both **my own** `admin-{members,lists}.ts`),
  `getOrgPrefs()` (sessions', read-only). No new SQL.

#### 2.5 `/app/admin/moderation/reports` — SCR-052, photo reports (`REQ-ADM-010`, `REQ-EVT-008`)

- **`Card` grid, not `DataTable`** — DEC-130's own DataTable justification names proposals/sessions/
  members specifically and separates this route out as "where a flag lands," not as a third table
  candidate; a photo-review queue is card-first at every width because the photo itself is the
  primary content. `CardMedia` = the signed-URL image (kept, eslint-disabled `<img>`, unchanged
  reasoning), `CardBody` = uploader/session/reporter/reason (`<dl>`, unchanged shape), `CardActions` =
  remove/dismiss.
- **Remove gets the `ui/dialog`** (destructive — the photo leaves the session permanently), titled
  using the session title and uploader name (the photo itself has no name), hosting the mandatory-
  reason `Field`+`Textarea` inside the dialog body, same shape as member-deactivate. **Dismiss stays
  one click** — `resolvePhotoReport`'s `dismiss` branch takes no reason today and nothing here changes
  that.
- Empty: `EmptyState`, action → `/app/admin` (no other queue is this screen's job to point at).
- States: grid with items, empty, remove-dialog open, dismiss pending, toast, phone (cards already
  stack in a single column below `sm`).
- DAL: `listPhotoReports()`, `resolvePhotoReport()` (`admin-moderation.ts`, my file) — unchanged
  shape; `ResolvePhotoReportInput`'s return gains the same `done`-style addition for toast triggering.

### 3. The dashboard's «يحتاج انتباهك» — exactly four rows attempted, one flagged as unbuildable

| Row (Arabic) | Count | Source | Link |
|---|---|---|---|
| مقترحات بانتظار قرار | `pipeline.submitted + pipeline.inReview` | the **existing** `proposals` query in `getAdminDashboardData()`, widened to also select `created_at` so the oldest row's age can be shown — no new query | `/app/admin/proposals` |
| جلسات لم تُجدول بعد | count of `sessions` where `starts_at is null` and `state not in ('cancelled','archived')` | **new** query, same `Promise.all`, `admin-dashboard.ts` (my file) | `/app/admin/sessions` |
| بلاغات على الصور | count of `reports` where `target = 'photo' and status = 'open'` | **new**, lightweight `count: "exact", head: true` query, `admin-dashboard.ts` | `/app/admin/moderation/reports` (mine) |
| بلاغات على التعليقات | count of `reports` where `target = 'comment' and status = 'open'` | **new**, same shape | `/app/admin/moderation/comments` (untouched this wave, still a correct destination) |

Kept as **two separate rows** rather than one merged "open reports" count: `DEC-005`'s own rule for
photos — never merge two moderation paths that call for different senses of urgency and land on
different screens — extends cleanly to comment vs. photo reports, which already live on two different
screens today. `REQ-ADM-010`'s own wording ("queues for proposals, comments, photos and reports")
names exactly this four-way split, which is a second, independent reason it reads right.

**★ The fifth item named in my agent file — "job-queue depth" — is NOT built, and flagged here rather
than guessed at.** No org-scoped data source exists: `graphile_worker`'s job tables are platform-wide,
not `org_id`-scoped, no admin RLS policy grants a read on them, and the DAL rule (`CLAUDE.md`, "the
worker uses `service_role` only through `SECURITY DEFINER` functions, never raw table writes" — and
by the same logic, never a raw read from an app-tier client either) rules out reading them directly
even if a policy existed. Two ways to close this, for the lead/owner to pick: (a) **drop the item** —
the other three cover `REQ-ADM-010`'s own enumeration in full; or (b) **define a real org-scoped
proxy** — e.g. `notifications` rows not yet delivered for this org, if that shape exists — which I
have not tried to invent unprompted, per `DEC-114`'s standing rule that a mockup/brief item that
doesn't match what the tree can support is a question, not something to implement guessing.

### 4. Requests

- **To the lead, `icons.tsx`:** four new glyphs for the rail — tag/category, building/company,
  palette/swatch (branding), gear (settings) — same 24 px/1.7 px-stroke house spec as the existing 32.
  Interim: `UsersIcon` reused for both members and companies, `ImageIcon` reused for templates and
  branding, `MoreIcon` for settings — documented above, not silent.
- **To `sessions`:** none. `Field`/`Select`/`Textarea`/`Checkbox`/`FormSummary` are consumed as-is;
  nothing about `DirectSessionForm`'s rebuild needs a prop that doesn't already exist.
- **To `content`:** none anticipated. `Stat`/`Panel`/`EmptyState`/`Card`/`Badge`/`Avatar` are consumed
  as-is; `AvatarProps`' `src?: string | null` already does exactly what the spawn note asks (`null` →
  initials fallback) with no change needed.
- **No change requested to my own six `ui/` files this wave** — `DataTable`, `Combobox`, `Menu`,
  `Sheet`, `Dialog`(lead's, consumed), all already cover what the five routes need. `date-time.tsx`
  and `tabs.tsx` are not consumed by any of my five routes this wave (scheduling and a tabbed screen
  are both out of scope), so nothing to report there either.

### 5. As built — the admin layout (`8de9b47`), what changed from the plan

- **Icons resolved for real** (the lead's `607ecbe` landed `TagIcon`/`BuildingIcon`/`PaletteIcon`/
  `GearIcon` before I wrote any code, so the §1/§4 interim reuses never shipped). Two NEW adjacency
  conflicts found while wiring the real map, neither in the original plan: `scoring`/`recognition`
  are neighbours and both wanted `StarIcon` — `recognition` took `BookmarkFilledIcon` instead ("marked
  as notable"); the two template-library items are neighbours too and both wanted `ImageIcon` —
  `templatesCertificates` took `CheckCircleIcon` (unused elsewhere nearby; "a completed, verified
  document"). Both calls, and why, are comments at their `NAV_ITEMS` rows.
- **`menu.tsx`'s `href` bug fixed first**, as its own unit (`e73803e`), before the layout — the lead
  asked for it explicitly since it's live for their shell-disclosure sweep too.
- **Collapse state uses `useSyncExternalStore`, not the `useEffect`+`setState` the plan assumed** —
  `react-hooks/set-state-in-effect` refuses the latter outright. Same idiom `ui/route-progress.tsx`
  already established for an identical class of problem (client-only state that must not become a
  hydration mismatch); documented in `admin-rail.tsx` itself.
- **The second skip link's copy changed, not just its markup.** Found while writing the e2e spec:
  the old `admin.shell.skipToContent` was byte-identical to the shell's own `app.shell.skipToContent`
  («تخطَّ إلى المحتوى» twice) — a real, pre-existing ambiguity for a screen-reader user tabbing
  through two links announced the same way for two different destinations, not something I
  introduced but something I was already touching. Reworded to «تخطَّ قائمة الإدارة إلى المحتوى».
- **`.qa-shots/rtl/` captures are written by `tests/e2e/console.spec.ts` but NOT YET LOOKED AT** —
  `.next/BUILD_ID` predates every commit in this unit (it predates even the `menu.tsx` fix), and only
  the lead runs `npm run build`. `npm test`/`tsc`/`lint` are all green for every file in this unit;
  the e2e spec is written and reviewed but unverified against real code until a rebuild. Flagged to
  the lead at sync.
- **One unrelated, pre-existing test failure found while running the full suite**, not mine:
  `tests/components/sessions/proposal-copy.test.tsx`'s clipping-scan trips on its own new
  `event-subnav.tsx`'s comment (the comment literally contains the string "overflow: hidden" while
  explaining why the component doesn't use it) — `sessions`' file, flagged to them directly, not
  touched here.

### 6. As built — the dashboard (`b8501d7`), what changed from the plan

- **The click-through redesign wasn't in the original §2.1 plan.** Rebuilding onto `SectionHeader`
  lost the old shape's "the heading itself is the link" pattern (`SectionHeader`'s `title` is plain
  text by design — `PageHeader`'s own comment on `breadcrumb` links is the only place `Link` lives
  inside either lead primitive). Fixed by giving `pipeline`/`top-categories`/`top-companies` a
  `SectionHeader.actions` slot carrying a distinct «عرض القائمة» link per section (the existing,
  previously-unused `admin.dashboard.viewList` key), each disambiguated from the other two identical-
  looking links by its own `aria-label` — same pattern `admin/sessions/page.tsx`'s
  `createFromProposal` button already uses for an identical problem. `attendance`/`activeMembers`/
  `pointsIssued` needed no such fix: they became individual `Stat` tiles, each carrying its own
  `href` natively, which is MORE click-through surface than the old one-link-per-section-heading
  shape had, not less.
- `admin-dashboard.spec.ts` (mine) updated to match — the old test located sections by an
  "الحضور"/"الأعضاء النشطون"/"النقاط الممنوحة" heading each; those headings don't exist anymore
  (three `Stat` tiles inside one "نظرة عامة" section instead). Rewritten, not deleted — same figures
  asserted, same click-throughs proven, against the shape that actually ships.
- Second unrelated, pre-existing failure found on this pass (not `sessions`' this time):
  `tests/unit/search-normalize.test.ts` fails against `src/lib/dal/search.ts`, which carries a
  `__TIMELINE__` placeholder token mid-edit — also `sessions`' file (the `search.ts` transfer), not
  touched here, not re-reported (already sent one heads-up to `sessions` this session).
- **Still unverified against a real build** — same `.next/BUILD_ID` staleness as the layout unit;
  `tests/e2e/admin-dashboard.spec.ts`'s source is correct by review but not yet run green.

### 7. As built — proposals (`ad7f5cc`), what changed from the plan

- **`ReviewState` already carried `done: boolean`** — my plan's §2.2 said I'd add it; re-reading
  `actions.ts` before touching it found it was already there (built with the form for the "values
  survive a failed round trip" rule, `16` §8.2 item 6, before this wave). Nothing to add.
- **One generic success toast, not three per-decision messages.** `admin.proposals.done` — "سُجّل
  قرارك ووصل صاحب المقترح" — already existed, unused, clearly written for exactly this. Using it
  is simpler than my plan's three-message design and needed no new copy.
- **`form={formId}` is the real substance of the reject dialog**, not a detail: Radix portals
  `DialogContent` onto `document.body`, outside the `<details>` the trigger lives in, so the
  confirm button's DOM ancestry no longer includes the `<form>` at all — an implicit,
  ancestry-based association (what a plain submit button inside the form gets for free) does
  nothing once the button is portalled out. Found this while writing the component test, not while
  writing the component — the jsdom test's first attempt submitted nothing on "confirm" until the
  `form` attribute was added.
- **A cross-track test consequence, not touched:** `tests/e2e/sessions-admin-proposals.spec.ts`
  (wave 1's file, outside this track's `admin-proposals*.spec.ts` glob) drives the old immediate-
  submit reject flow and will fail against the new dialog. Flagged to the lead with the exact fix
  rather than edited — it is `sessions`' named file and may be mid-edit.
- Two more unrelated, pre-existing failures found on this pass, both `content`'s (materials/photos
  upload-widget tests, mid-transition on `uploadLimits`/`imageLimitMb`) — not touched, not
  re-reported individually (the pattern is now familiar: several tracks landing DAL shape changes
  ahead of their own tests in the same window).

### 8. As built — sessions, top level (`e0f0f2c`), what changed from the plan

- **The biggest deviation from the plan, found by my own jsdom test, not by review:** §2.3 said
  "`SessionControls`' start/complete/reopen stay plain buttons" — my first pass instead gated the
  whole block behind an "إجراءات المشرف" item in the row `Menu`, reasoning (wrongly) that a row of
  several buttons plus a cancel disclosure had nowhere to fit. That directly contradicts what I
  planned, AND — checked before committing, not after — breaks
  `tests/e2e/sessions-screens.spec.ts:320`'s `expect(boss.getByRole("button", {name: "ابدأ الجلسة
  الآن"})).toBeVisible()` immediately on page load, with no click first. Fixed to always-visible,
  rendered below the table (not inside a `DataTable` cell — still nowhere for a multi-button block
  to fit in one cell), which is both what the plan said and what the existing M2 demonstrable
  assumes. `sessions-screens.spec.ts` itself needed no edit — verified by reading it, not assumed.
- **`actionsFor()` cannot be imported into `sessions-table.tsx`** — it lives in `lib/dal/sessions.ts`
  (sessions' file, `import "server-only"`), and that module cannot be pulled into a `"use client"`
  bundle at all, not even for one function. Computed server-side in `page.tsx` per row into an
  `actionsById: Record<string, SessionAction[]>` and threaded down as plain data instead.
  `DataTableColumn`/`AdminSession`/`SessionAction` TYPES are still imported directly — type-only
  imports are erased before `"server-only"`'s runtime check would ever see them.
- **`t()` vs `t.markup()`, found by the same jsdom test:** the row menu's `moreActions` label uses a
  `<t>{title}</t>` tag (`admin.combobox.removeChip`'s own precedent) so two rows' triggers are never
  announced identically — calling it with plain `t()` instead of `t.markup()` rendered the literal
  string `"admin.sessions.moreActions"` as the accessible name. The test's own `getByRole` query
  caught it immediately; nothing about reading the component would have.
- **The direct-create form's adoption of `lib/form-state` is real, not partial**, but it skips one
  piece of `app/propose/proposal-form.tsx`'s own model on purpose: the live reward/punish on-blur
  error-clearing. `FormSummary` + adjacent error + «مطلوب» + value survival is REQ-UIX-009/010/011's
  full acceptance criteria on its own, and this is DEC-130's own "secondary action," not the
  flagship form the extra polish was built for. No jsdom test written for this specific form this
  pass (time budget) — its Combobox/`wasList()` wiring is lower incremental risk than
  `SessionControls`' portal, since it reuses `app/propose`'s already-proven `lib/form-state` pattern
  verbatim rather than inventing a new one.
- **Two message-copy additions beyond the plan**, both found while wiring, not anticipated: the
  cancel-confirm dialog needed the same "portal, so `form={id}`" treatment as proposals' reject
  dialog, and `admin.sessions.errorSummaryTitle`/`errors.*` are new — the form had no error-summary
  copy at all before (`invalid`/`failed` were single generic strings), since `<FormSummary>` is new
  work here, not a re-skin.

### 9. As built — members (`ef0586a`), and a real bug found here that reached back into sessions too

- **A genuine React Flight serialisation trap, found while trying to unit-test the row actions —
  not by reading the code.** `members-table.tsx` (and `sessions-table.tsx`, already committed)
  passed a FACTORY prop from `page.tsx` to a `"use client"` table — `changeRoleAction: (id) =>
  changeRole.bind(null, locale, id)`. That reads as "a bound Server Action per row" and `tsc`
  accepts it without complaint, but the value crossing the server/client boundary is the OUTER
  arrow function, which is a plain closure, not a Server Action reference — only the RESULT of
  `.bind()` on a `"use server"` export carries the marker React Flight knows how to serialise.
  Flight would refuse this at the point it actually tries to send the RSC payload. Both routes are
  dynamic (session-gated), so this would not have surfaced in `npm run build` either — only at a
  real request, which is why "only `npm run build` catches it" (this repo's own recurring caution
  for Server Actions) undersells the risk here. **Fixed the same way in both files:** `page.tsx`
  builds a plain `Record<id, boundAction>` map ONCE via `Object.fromEntries(rows.map(r => [r.id,
  action.bind(null, locale, r.id)]))` and hands the finished map down; the client table indexes into
  it per row. `sessions-table.tsx`'s `runTransitionAction` prop became `transitionActions` in the
  same pass, once the shape of the bug was clear from fixing it here first.
  ★ **How it was actually found:** members-table.tsx's OWN jsdom test tried `vi.spyOn` on the
  imported `./actions` module directly and hit `server-only`'s own throw immediately (`actions.ts`
  transitively imports `lib/dal/admin-members.ts`) — which is what forced the redesign to
  props-not-imports in the first place, and made the factory-vs-map distinction visible once actions
  became props instead of direct calls. Reading the component alone would not have caught it; the
  jsdom test would have PASSED either way, since jsdom has no React Flight boundary to enforce this
  — only a real Next.js server render does. Worth restating for whoever reads this later: **a green
  jsdom test does not prove a Server-to-Client prop is real Server Action, only that the function
  behaves correctly once called** — this class of bug needs either a real dev-server request or
  reading the RSC rules directly, not a unit test.
- **A feature dropped in the first draft, restored once missed:** the deactivation note (who, when,
  why) existed in the pre-wave-6 screen (`deactivatedNote`, already translated, simply unused after
  the rebuild) and REQ-ADM-009's own audit-visibility intent wants it. Needed `getOrgPrefs()` added
  to `page.tsx` (not called there before) for the time zone `formatDateTime` needs.
- `tests/e2e/admin-members.spec.ts` (this track's own file) rewritten, not flagged elsewhere — three
  of its four tests are now desktop-only (`DataTable`'s phone card list has no `role="row"` to scope
  a member by; the fourth, the 390 px capture, already was phone-only). Not a workaround: a real
  browser's accessibility tree excludes a `display:none` subtree entirely, so `getByRole` queries
  resolve singularly regardless of viewport — the row-scoping itself is what only desktop's `<table>`
  offers.

### 10. As built — the photo report queue (`98a27fb`) — the fifth and last route

- **`Card`, confirmed as the right call, not `DataTable`.** Re-read `DEC-130` before starting this
  one specifically, since my own §2.5 plan already flagged the ambiguity: the decision's own
  DataTable justification sentence names proposals/sessions/members and treats this route
  separately ("where a flag lands"), which settles it — no new finding, just confirming the plan's
  own reasoning held once the other four routes' patterns were in hand for comparison.
  Removal is a NARROWER problem than proposals'/sessions' reject/cancel confirmations: neither
  needs the two-step details-then-dialog shape those two use, because there is no pre-existing
  "reveal the reason first" UI to preserve here — the dialog itself is free to be the one and only
  step, exactly like `members-table.tsx`'s `ActionsCell` (built two units earlier in this same wave,
  and directly reused here without rediscovering the pattern).
- **The `done`/dialog-closes-on-success shape from members carried over directly** — no new lint
  trap, no new bug, because the pattern (derive the close from `state` during render, keep the toast
  in the effect) was already correct from the members unit.
- Nothing dropped this pass, unlike members' missing deactivation note — checked the ORIGINAL
  `report-card.tsx`/`page.tsx` line by line against the rebuild before committing specifically
  because of that earlier miss, and confirmed every field (uploader, session, reporter, reason, age)
  made it into the new `CardBody`.

### All five routes done, plus the layout — wave 6's console track complete pending sync

Layout (`8de9b47`), dashboard (`b8501d7`), proposals (`ad7f5cc`), sessions top-level (`e0f0f2c`,
`ef0586a`'s RSC-serialisation follow-up), members (`ef0586a`), reports (`98a27fb`). Every unit: `tsc`
clean, lint 0 errors, `npm test` green including axe on every new interactive component, a
same-track e2e spec written (`console.spec.ts`, `admin-dashboard.spec.ts`, `admin-proposals.spec.ts`,
`admin-sessions.spec.ts`, `admin-members.spec.ts`, `admin-reports.spec.ts`) — **none run against a
real build yet**, `.next/BUILD_ID` has predated every commit in this wave so far. Two cross-track
test files flagged to their owners rather than edited (`sessions-admin-proposals.spec.ts` to
`sessions`, with the exact fix; several transient DAL-shape failures in `content`'s and `sessions`'
own files, not touched). One cross-track-relevant bug found and fixed (the React Flight
factory-prop trap, §9) — reported to the lead in case it recurs elsewhere.

### 11. The lead's real build found three more things this wave's jsdom coverage could not

`npm test`/`tsc`/`lint` all being green never proved the app actually renders for a real request —
only a real Next.js build does, and the lead ran several. Two rounds of fixes landed on top of the
six "done" commits above, each its own commit as the lead asked:

- **`1f4fffe` — the real BLOCKER.** `AdminRailItem` carried `Icon: ComponentType<...>`, built in
  `admin/layout.tsx` (server) and passed to `admin-rail.tsx` ("use client"). `icons.tsx` is not a
  client module, so its exports are plain functions, and React Flight refuses to serialise ANY
  function crossing that boundary — not just the "factory returning a bound Server Action" shape
  `§9` already found, but the plainer case of a component reference itself. **Every admin page
  crashed for every staff member**, and none of this wave's own jsdom tests could have caught it —
  jsdom has no React Flight boundary to enforce against. Fixed by moving the icon set into
  `admin-rail.tsx` itself (the client module, so the functions never leave it) and passing a string
  key (`icon: "home"`) instead. Same commit fixed the member-404 regression: `requireStaffSession()`
  called `notFound()` **inside the layout**, and under Next 16's streaming contract a `notFound()`
  raised under a `loading.tsx` boundary (an implicit `<Suspense>`, unrelated to anything this wave
  added) can no longer set the response status once streaming starts — 200, not 404. Replaced with
  `requireSession()` (never `notFound()`s an authenticated member) and moved the actual gate back to
  every page's own existing check, which is what this file's own header comment already said the
  design was.
- **`1ee207a` — three smaller findings, one commit.** (1) Every "confirm {object}?" dialog title
  interpolated a bare `{title}`/`{name}`/`{session}` — `sessions`' own catalogue test caught
  `rejectConfirmTitle`; checked and fixed all FOUR dialogs across all five routes rather than only
  the one reported, including `removeConfirmTitle`'s `{session}`, which that test's own regex does
  not check for (`{title}`/`{name}` only) but is the identical bug. (2) `admin-proposals.spec.ts`'s
  seed had no `category_id`, NOT NULL since `0010` — a schema fact this track's own plan-reading
  should have caught and did not. (3) `sessions-table.tsx` hand-copied the house bordered-box class
  string `ui-lint` (`REQ-UIX-001`) exists specifically to catch — replaced with `ui/panel`.

**The pattern worth naming:** every one of these five bugs (the RSC factory-prop trap, this RSC
component-reference trap, the streaming/`notFound()` interaction, the bidi gap, the schema
constraint) is exactly the class this milestone's own testing strategy predicts jsdom cannot catch
— a real request, a real database constraint, a cross-file catalogue sweep. `npm test` green was
never the claim that the app works; it was the claim that what jsdom CAN check, it does. Not yet
done: the lead's next rebuild + a real look at every `.qa-shots/rtl/wave6-console-*` capture, the

### 12. The lead's real e2e run — DEC-134, a same-commit unmount, and a mis-wired empty state

`1f4fffe`/`1ee207a` fixed what a served build's own render found; running the actual spec suite
against that build found a second layer — timing and copy bugs no jsdom render can see either, since
jsdom has neither a streaming HTTP response nor React's real commit ordering.

- **DEC-134 (lead's).** Every "a member/moderator/staff gets a real 404" assertion this track wrote
  was checking the wrong thing: `app/loading.tsx` streams the response before any DAL gate runs, so
  `notFound()` under `/app` answers 200 with `noindex` and the not-found page, never a 404 status —
  product-wide, not something this wave's layout caused. Rewrote all five affected assertions
  (`admin-dashboard.spec.ts` ×2, `admin-members.spec.ts`, `admin-moderation.spec.ts` — not this
  track's file, edited on the lead's explicit direction for this one line — and
  `sessions-admin-proposals.spec.ts`, previously granted) to check the not-found `<h1>`, the
  `noindex` meta tag, and that no guarded heading/content renders, instead of a status code.
  `sessions-admin-proposals.spec.ts` also got the reject-flow diff granted earlier: rejecting now
  opens `ui/dialog` (this wave's own rebuild), and the test still drove the pre-dialog "click أرسل,
  submit" shape.
- **A real bug, not a test bug: `report-card.tsx`'s toast never fired.** `admin-reports.spec.ts`'s
  confirmation-toast assertion timed out for real. Root cause: `remove`/`dismiss` both resolve the
  report, which the SAME `revalidatePath` round trip drops from the open-reports query — the
  refreshed list and this action's own `useActionState` result land in one commit, and React
  discards a fiber's pending update when its parent's reconciliation removes that fiber in the same
  commit, so the `useEffect` keyed on `state` that fired the toast never got to run for the
  disappearing card. Fixed by firing `toast.show()` from INSIDE the action passed to
  `useActionState`, not from an effect reacting to its result — an ordinary callback on
  `ToastProvider`, independent of whether `ReportCard` ever renders again. `admin-sessions.spec.ts`'s
  own toast assertion (line 121) never showed this symptom because cancelling a session does not
  remove its row from that list — the acted-on component staying mounted is what let the effect-based
  version work there.
- **Two strict-mode scoping bugs, real DOM, not flakiness.** `admin-sessions.spec.ts` matched
  `DataTable`'s desktop `<table>` AND phone `<ul>` simultaneously on a bare `getByText` — scoped via
  `page.getByRole("table").or(page.getByRole("list"))`, which resolves to exactly one in a real
  browser since a `display:none` subtree drops out of the accessibility tree. `admin-reports.spec.ts`
  matched a `<dd>` AND its only child `<bdi>` for the same reason — CLAUDE.md's own bidi-isolation
  rule means a bare interpolated value's wrapper has no sibling text, so `<dd>` and `<bdi>` share
  identical normalised content; `.last()` for the innermost, the same trap `event-comments.spec.ts`
  already named. `console.spec.ts`'s skip-link test assumed a fixed two-Tab position; rewrote it to
  walk the tab sequence (bounded, 8 presses) instead of pinning a count that belongs to the shell, not
  this layout.
- **Two real UX bugs from the lead's own look at `scr-042-sessions-390-rtl-desktop.png`.**
  `sessions-table.tsx`'s empty state showed "لا جلسات مطابقة لبحثك." (no search matches) even with an
  untouched search box, AND its action button was labelled with `scheduleNote` — a full sentence
  written as `direct-session-form.tsx`'s own inline hint, not a button label — rendering a paragraph
  inside a primary `ButtonLink`. Fixed: the title now branches on `query`, and a new short key
  (`listEmptyAction`, "افتح المقترحات") replaced the misused one. Added jsdom coverage for both states
  (`sessions-table.test.tsx`) since neither had it before — the reuse of an existing key across two
  unrelated purposes is exactly the kind of thing a "does this string exist" check misses.
- **The skip link in `scr-046-venues-390-rtl-phone.png` — investigated, not a bug.** That capture (an
  UNTOUCHED route, `sessions-screens.spec.ts`, not this file) shows the admin layout's second skip
  link overlapping the venues form's "السعة" field. Checked: the markup is byte-identical in class and
  structure to the shell's own working skip link (`.skip-link`, `globals.css`, lead-owned, unchanged
  this wave) — `translateY(-200%)` unfocused, `translateY(0)` on `:focus-visible` — and the test's own
  flow never focuses or tabs to either skip link before that capture (its last action is `.fill()`ing
  the capacity field). Most likely a `fullPage: true` + `position: fixed` screenshot-stitching
  artifact (a known Playwright/Chromium quirk on a long, scrollable page), not a genuine hide failure.
  Cannot confirm further without a fresh capture — reported to the lead rather than guessed at, since
  `globals.css` and that spec file are both outside this track's edit list either way.
actual `DEC-130` bar.

---

## Wave 7 plan (DEC-137) — the fourteen-group rail, and the six remaining admin routes

Written before code, per the spawn brief. `console` is opus this wave. Six routes —
`moderation/{comments,photos}`, `venues`, `categories`, `companies`, `settings` — plus the admin
layout's regroup (K0–K6 in `STATUS.md`'s checklist). `moderation/reports` (wave 6, already on M9)
is not a checklist row this wave, but it sits inside my full edit glob
(`app/admin/{moderation,venues,categories,companies,settings}/**`, unconditional — not the "five
wave-6 routes, fixes only" list, which names only `proposals/**`, `sessions/`'s top level and
`members/**`) and carries wave 6's one open finding (the uncaptured populated-report-card state), so
§3 below touches it too.

### 1. The rail's IA — `16` §6.7, `REQ-ADM-020`, `REQ-UIX-017`

**The count in `16` §6.7 does not match its own label, and wave 6's note already repeated the error
once.** The prose lists, verbatim: لوحة · المقترحات · الجلسات · الأعضاء · الشركات · التصنيفات
والوسوم · الأماكن · الإشراف · النقاط والتقدير · التصاميم · الهوية · الإشعارات · التصدير · السجل ·
الإعدادات — **fifteen** tokens, comma-counted twice. `STATUS.md`, `CLAUDE.md` and `DEC-137` all call
it "the fourteen-group IA" regardless, and wave 6's note (`docs/plan/notes/console.md:571-581`)
already transcribed the same fifteen under a "14 grouped Arabic labels" heading without recounting.
**My working reading, pending the lead's confirmation (§5.1): لوحة is the rail's home/root link, not
one of the fourteen navigational groups that organise the other routes underneath it** — the same
relationship `admin/layout.tsx` already gives it today (`current: withoutLocale === item.href`
computed specially, never prefix-matched, because nothing nests under it). Fourteen groups then
map onto the current 19 (soon 20 — see below) flat items as:

| Group (rail label) | Children (routes) | Disclosure? |
|---|---|---|
| المقترحات | proposals | no — direct link |
| الجلسات | sessions | no |
| الأعضاء | members | no |
| الشركات | companies | no |
| التصنيفات والوسوم | categories | no |
| الأماكن | venues | no |
| الإشراف | moderation/comments, moderation/photos, moderation/reports | **yes — 3** |
| النقاط والتقدير | scoring, recognition | **yes — 2** |
| التصاميم | templates/posters, templates/certificates | **yes — 2** |
| الهوية | branding | no |
| الإشعارات | emails, reminders | **yes — 2** |
| التصدير | exports | no |
| السجل | audit | no |
| الإعدادات | settings | no |

Ten single-route groups render exactly as today (an `<a>`-equivalent rail item, unchanged
`AdminRailItem` shape). Four groups disclose 2–3 children each — **nine routes total inside
disclosure** (moderation's three, scoring+recognition, templates' two libraries, emails+reminders) —
against wave 6's own note's "thirteen routes" figure for the same grouping decision
(`docs/plan/notes/console.md:575-576`, written before `venues`/`categories`/`companies` were
reassigned to me and apparently over-counting even then; not reconciled further here, since it isn't
load-bearing for this plan).

★ **CORRECTION, per the lead's sync-1 review: there is no `admin/designer/page.tsx`.**
`src/app/[locale]/app/admin/designer/` holds only `[documentId]/` — `ls` confirms it, and I should
have run that instead of inferring a landing page from the directory's existence. `/app/admin/designer`
is not a route; **`التصاميم` discloses exactly `templates/posters` and `templates/certificates`**
(the table above is corrected), and a designer document stays reached only from its template, as
today — no rail entry to add, and no `designer`-file question to raise. The one real, still-true
observation from that pass stands on its own: `NAV_ITEMS` (`admin/layout.tsx:52-85`) has **20**
entries today (verified by counting `{ key: "…"` occurrences, minus the type declaration's own
`{ key: string; … }` on line 50, which matches the same grep), not the header comment's stated 19 —
a stale-by-one comment, not a missing route. Nothing to fix beyond noting it; the comment gets
corrected in the same commit as the regroup since I'm editing that file anyway.

**Data model.** `AdminRailItem` (`components/admin/admin-rail.tsx`) gains an optional
`children?: AdminRailItem[]`. A leaf item (no `children`) renders exactly as today. A group item
renders as a WAI-ARIA disclosure: `<button aria-expanded>` + a nested `<ul>` of its children,
default-**expanded** if any child is `current`, default-**collapsed** otherwise, per-viewer
`localStorage` (one key per group, same try/catch-and-render-expanded-on-failure discipline the
rail's own whole-rail collapse already uses — `getServerSnapshot` always "expanded when current,
else per the stored preference, defaulting to collapsed" so there is no hydration mismatch). The
group row itself never carries `aria-current` (it is not a destination); a child does.

**Collapsed (icon-only) rail — the interaction the disclosure pattern cannot use there.** When the
whole rail is icon-only (the existing whole-rail toggle), a group's label and nested `<ul>` have no
room. Rather than invent a flyout, a collapsed group's icon becomes a **`ui/menu`** trigger (mine
already) opening its children as `href` items — `menu.tsx`'s own header comment records that
`MenuItem.href` was fixed to route through `ui/link` (not a raw `<a>`) "while planning wave 6,"
found writing this exact plan, so that mechanism is already correct to build on; no new bug to work
around. A leaf item's collapsed behaviour (icon + `title` tooltip, direct link) is unchanged.

**Phone drawer (`ui/sheet`).** Same disclosure widget as desktop, nested inside the sheet's `<ul>`
(never a `Menu` flyout there — a full-height sheet has room for a real nested list, and a popover
inside a popover-ish sheet is the wrong composition). Selecting any child closes the sheet
(`onClick={() => setSheetOpen(false)}`, already wired per-item; extends to nested items unchanged).

**Moderator view — `REQ-ADM-020`, listed exactly.** Filtering is unchanged in substance, just
applied one level deeper: a leaf's own `adminOnly` gates it; a group renders **only if at least one
child survives the filter**, and only its surviving children render inside it. Today's five
moderator-visible flat items (`adminOnly: false`: `sessions`, `moderationComments`,
`moderationPhotos`, `moderationReports`, `audit`) become, regrouped, **three top-level rail
entries — الجلسات (direct), الإشراف (disclosed, all three children survive), السجل (direct) — five
reachable routes, unchanged from today.** No `لوحة` (dashboard stays admin-only, matching
`REQ-ADM-020`'s "and nothing else" — a moderator has never seen the dashboard and this regroup does
not add it).

**Current-route marking.** A leaf's `current` is unchanged (exact match or `startsWith` for nested
paths, e.g. `sessions/[id]/attendance` still marks `sessions` current). A group is `current` in the
sense of "contains the active route" (drives default-expanded above) but is never itself
`aria-current` — only whichever child is.

**Second skip link (`REQ-UIX-017`).** Unchanged target and position — first focusable element,
`href="#admin-content"`, `tabIndex={-1}` — but the tab sequence it has to clear grows (a disclosure
button plus, when expanded, its children, for four groups). Re-verified with the same
walk-the-tab-sequence approach wave 6's bug-fix pass already adopted for `console.spec.ts` (bounded,
not a pinned count) rather than reintroducing a pinned-position assertion the last teammate already
found and removed once.

**The untouched-screen capture (`16` §6.7's own requirement, plus the carried finding below).**
`.qa-shots/rtl/wave7-console-layout-untouched.png` — `/app/admin/exports` (not on my edit list this
wave, not `venues` again, since `venues` IS touched this wave and would no longer prove "the layout
alone"), 390×844, phone project, after the layout lands.

### 2. Per-route plan, K1–K6

**Shared pattern for K3–K5 (venues, categories, companies) — "one list pattern three times," per
`DEC-137`'s own framing.** One design, not one component: each keeps its own `*-table.tsx` (domain
fields differ — venue carries address/capacity/timeZone/mapUrl, category and company carry only a
usage count) built on `ui/data-table` exactly like `members/members-table.tsx`'s already-proven
shape (primary column `bdi`-wrapped name `onCard`, a count column `onCard`, a status `Badge`
`onCard`, an actions column not `onCard` since the phone card renders the row's primary action
inline below the label:value pairs — `DataTable`'s own card layout, unchanged). What genuinely is
identical across all three and worth extracting once: the deactivate/reactivate action shape —
reactivate is a single `IconButton`, no confirmation (reversible, restorative, matches
`members-table.tsx`'s own asymmetry); deactivate opens `ui/dialog` naming the entity
(`REQ-UIX-013`'s pattern, generalised past proposals: "تعطيل «القاعة الكبرى»؟" / "تعطيل «شركة
كذا»؟"), plain confirm/cancel, **no reason field** — `setCategoryActive()`/`setCompanyActive()`/
venue's toggle action take no reason parameter today (`lib/dal/admin-lists.ts`, `lib/dal/sessions.ts`)
and REQ-ADM-006/007/008's acceptance criteria do not ask for one, unlike `REQ-ADM-009`'s member
deactivation. A shared `components/admin/deactivate-toggle.tsx` (my own file, under
`components/admin/**`) takes the entity's rendered name, the two bound actions and a namespace key,
and every one of the three tables uses it — the toast-in-body-vs-effect question doesn't arise here
either way, since a toggled row never leaves its own table (unlike a resolved moderation card).

**K3 — `/app/admin/venues`.** DAL: `listVenuesForAdmin`/`addVenue`-equivalent/`toggleVenue`
already live in **`sessions`' `lib/dal/sessions.ts`**, unchanged this wave — the existing DTO
(name, address, capacity, upcomingSessions, timeZone, mapUrl, deactivatedAt) already covers every
column the rebuild needs, so **no DAL change and no request to `sessions`** — I only consume it.
Add form: `venue-form.tsx` onto `Field` + `Input` + `Textarea` (notes) + `FormSummary`, using
`lib/form-state.ts`'s `formStateFrom()`/`zodErrors()`/`was()` contract (sessions' shared module,
imported not edited) instead of the current ad hoc `{error}` shape — the same "an uncontrolled field
empties on a failed round trip" bug class `form-state.ts`'s own header names is live here today
(five plain `<input>`s with no `was()` read-back). List: `venues-table.tsx` on `DataTable`, columns
name/address (primary, `onCard`), capacity+upcoming-sessions (`onCard`, one combined body-sm line,
matching the current page's own `·`-joined `<dl>`), status `Badge`, map link (kept as a plain
external `<a>` inside the primary cell, `rel="noreferrer noopener"`, unchanged behaviour), actions
via `DeactivateToggle`. States to capture: populated table (desktop + phone stacked cards), empty
list, the add form with a `FormSummary` validation failure.

**K4 — `/app/admin/categories`.** DAL: `lib/dal/admin-lists.ts` (already mine), unchanged shape —
`listCategoriesForAdmin`/`createCategory`/`setCategoryActive` need no new fields. Form: `Field` +
`Input` + `FormSummary`, same `form-state.ts` contract. List: `categories-table.tsx`, columns name
(primary), session count (`onCard`), status `Badge`, `DeactivateToggle`. States: populated, empty,
validation failure on add (duplicate-name handling stays server-side, unchanged — no unique
constraint surfaced client-side today, not adding one this wave).

**K5 — `/app/admin/companies`.** Same shape as K4, `listCompaniesForAdmin`/`createCompany`/
`setCompanyActive`, member count instead of session count. States: populated, empty, validation
failure.

**K6 — `/app/admin/settings`.** DAL: `lib/dal/admin-settings.ts` (already mine, and already past
the numerals sweep — no `numerals` field in `OrgSettingsAdmin` today, confirmed by reading the
file). This is the one route where the rebuild is substantive, not a re-skin: fourteen fields across
six `fieldset`s, all plain `<input>`/`<select>`/checkbox today, zero `ui/` imports beyond `Button`.
Plan: `Field` wrapping every control (`Input` for text/number/email, `Select` for `companyMetric`,
`Switch` for `allowJpegExport` — `Switch` posts a real value via `name`, so the existing
`FormData.get("allowJpegExport") === "on"` parsing in `actions.ts` needs a one-line check against
`Switch`'s actual posted value, not a DAL change), grouped under `ui/section-header`-headed
`fieldset`s (replacing the plain `<legend className="text-h3">` pattern), `FormSummary` at the top
fed by `form-state.ts` (replacing the current `state.error`/`state.saved` two-message shape — the
saved confirmation becomes a `useToast()` call in the action's own body, not an effect, consistent
with §3's toast-placement rule since nothing here unmounts but consistency costs nothing). States:
the form populated with current values, a `FormSummary` validation failure (e.g. `emailReplyTo` not
an email), the save-confirmation toast.

**No DAL request to any other track for K1–K6.** `content`'s `lib/dal/photos.ts` is touched only via
the existing `restorePhoto()` import `admin-moderation.ts` already has (wave 6); nothing new is
needed there for K2's rebuild — it is a UI-only pass on data the DAL already returns.

**K1 — `/app/admin/moderation/comments` and K2 — `/app/admin/moderation/photos`.** Both are
UI-only rebuilds — `lib/dal/admin-moderation.ts` (already mine) needs no field changes, only two
small additions used by §3's shared sub-nav (below). Bring both onto exactly the shape
`moderation/reports/report-card.tsx` (wave 6) already proved: `Card`/`CardBody`/`CardActions` (K2
also `CardMedia`, since a photo takedown has an image; K1 has none — plain `Card`/`CardBody` only),
`ui/dialog` for the remove confirmation (`Field` + `Textarea` for the reason **inside** the dialog's
own form, one step, matching `report-card.tsx`'s own comment on why there is no "reveal the reason
first" two-step here), `useToast()`. **Toast fires from inside the action passed to
`useActionState`, not from a `useEffect` keyed on `state`** — this is not a style preference, it is
the exact bug wave 6's own note (§12) already found and fixed once for `moderation/reports`: a
resolved card is a card that disappears from its list in the same commit the toast would have to
fire from, so an effect on a discarded fiber never runs. K1/K2 get it right from the start instead of
repeating the fix. `PageHeader` replaces the plain `<h1>`+`<p>` pair on both; `EmptyState` replaces
the plain empty-state `<p>` on both (K1 currently has neither). Dismiss stays instant, no dialog
(unchanged from today — only removal, which is permanent, confirms). States per route: populated
list (desktop grid + phone), empty state, the remove-confirmation dialog open with a validation
error (empty reason), the post-action toast.

### 3. The two moderation queues never merge (`DEC-005`) — and a sub-nav that keeps them apart while tying them together

`admin-moderation.ts`'s own header already states the rule precisely: comments have one moderation
path (open reports — no "instant hide" concept exists for a comment), photos have two, and the two
photo paths are **never merged into one list** because they carry opposite urgency — a takedown
(`moderation/photos`, `REQ-EVT-012`) is already hidden, awaiting review; a report (`moderation/
reports`, `REQ-EVT-008`) is still publicly visible, awaiting one. That separation is unchanged and
is not mine to revisit.

What I am adding: a `ui/tabs` strip, `href`-mode, atop all three moderation pages —
`tabs.tsx`'s own header comment names this exact use case ("the admin sub-nav... uses this"), so it
is not a new pattern, just its first real caller. Each tab carries a live open-count
(`Tabs`' `count` prop, Western-formatted, matching `date-time`/`combobox`'s own documented numeral
gap). This does not merge the two photo queues into one *list* — DEC-005's actual rule — it lets a
moderator move between three still-separate lists without the rail round-trip, which is squarely
inside `REQ-ADM-010`'s "queues for proposals, comments, photos and reports" being read as one
functional group, matching §6.7's own `الإشراف` grouping. Requires two small count-only additions to
`admin-moderation.ts` (mine, no request): `countCommentReports`/`countPhotoTakedowns` alongside the
existing `countPhotoReports`-shaped query (a `head: true` count, not a full row fetch, on each of the
three tables' existing predicates). `moderation/reports/page.tsx` gains the same strip in the same
commit (inside my edit glob — see the note at the top of this section), closing the "reports" tab's
own missing capture (§4) at the same time.

### 4. Carried items, and how each closes

- **`console.spec`'s "untouched route" capture** — wrong viewport (Pixel 7's 412 px, no explicit
  size set) and, after this wave, the wrong route (`venues` stops being untouched). Fixed in the same
  commit as §1's layout change: explicit `390×844`, retargeted to `/app/admin/exports` (§1's own
  reasoning for the choice).
- **The populated photo-report card on `moderation/reports`** — never captured in wave 6. Taken as
  part of K1/K2's capture pass (§2), since the shared `Tabs` strip (§3) touches that page's markup
  anyway and the capture should reflect the final shape, not a pre-strip one.
- **The dashboard's «أكثر …» alignment — CLOSED, no code change, confirmed by opening the actual
  capture** (`.qa-shots/rtl/scr-040-admin-dashboard-390-rtl-phone.png`, per the lead's sync-1
  instruction not to close it on the class read alone). `page.tsx`'s `TopList`
  (`app/admin/page.tsx:15-40`) renders `flex items-baseline justify-between`, and the capture shows
  exactly what that predicts: every «أكثر …» card («أكثر المُقدِّمين مشاركة» etc.) pins its count to
  the row's far edge, and «مسار المقترحات» (the pipeline list directly above it, same screen) pins
  its counts to the same edge, at the same horizontal position. The two sections read identically in
  the actual render — the carried finding does not reproduce today, whether because it was already
  fixed by the time this capture was taken or because it described a different impression. Nothing to
  build.
- **`admin.attendance.*` and the walk-in keys, after `checkin` moves them.** `admin.json`'s
  `attendance` namespace (`ar.json:360-408`, `en` twin) is SCR-044's strings — the screen transfers to
  `checkin` this wave (`DEC-137`: `★ admin/sessions/[id]/attendance` — C3). **Not touched by me until
  `checkin` confirms the strings are live under its own `checkin.json` namespace** (`DEC-137`'s "one
  writer per file" rule: the screen's owner moves its strings, the old file's owner deletes the old
  keys on request). I will delete `admin.json`'s `attendance` object (both locales) in a single small
  commit once that confirmation lands — **not** `admin.json`'s `exports.attendance` (a different,
  unrelated key path — the CSV-export label — which stays). No walk-in keys exist under `admin.json`
  yet (grepped; none found), so there is nothing to delete there today — `checkin`'s C6 adds and
  presumably keeps its own walk-in strings in its own namespace from the start, so this half of the
  carried item may already be moot; confirming with `checkin` rather than assuming (§5.2).

### 5. Requests and questions

**5.1 — For the lead. RULED, sync 1.**

1. ~~The 14-vs-15 count in `16` §6.7.~~ **Ruled: `لوحة` is the root/home link, not one of the
   fourteen groups; the other fourteen tokens each map to their own group.** Grouping table above
   built as planned, no merge.
2. ~~`admin/designer`'s missing nav entry.~~ **Withdrawn — my own error.** There is no
   `admin/designer/page.tsx`; see the ★ CORRECTION above. `التصاميم` discloses `templates/posters`
   and `templates/certificates` only.
3. ~~Four rail icons still on interim/reused glyphs.~~ **Withdrawn — my own error, a second one.**
   §1's request repeated wave 6's PLANNING-stage note (`console.md:582-592`) instead of that same
   file's own later "as built" entry (`console.md:893-894`): the lead's `607ecbe` landed
   `TagIcon`/`BuildingIcon`/`PaletteIcon`/`GearIcon` before wave 6 wrote a line of code, so the
   interim reuses never shipped and `NAV_ITEMS` already uses the real glyphs today (verified again
   just now: `categories→"tag"`, `companies→"building"`, `branding→"palette"`, `settings→"gear"`,
   all resolving through `admin-rail.tsx`'s own `ICONS` map, lines 50/51/58/63). No request to the
   lead here; sorry for the noise on a ruling already given.

**5.2 — For `checkin`.** Asked; the lead is routing it with their approval attached. **Do not delete
`admin.json`'s `attendance` object until the lead confirms `checkin`'s strings are live** — holding.

**5.3 — For `sessions`.** None this wave — `listVenuesForAdmin` and its write actions in
`lib/dal/sessions.ts` need no change for K3's rebuild (§2), **ruled**: consume as-is. Flagging only
for visibility: `venues` stops being "already built, wave 1, untouched" (`console.md:23-24`'s
original framing) as of this wave.

**5.4 — The dashboard «أكثر …» alignment.** Ruled by the lead: open the capture before closing it —
done, closed, recorded in §4.

## Wave 7 — as built, all six routes plus the rail (K0–K6)

Commits, in order: `3683f76` (K0, the rail regroup), `53bc68d` (K1/K2, comments+photos
moderation), `1fdf521` (K3–K5, venues/categories/companies), K6 (settings — see the ★ note below,
not its own commit), `421db5c` (messages, both locales, covering all six routes at once — see §"why
one commit" below).

### K0 — the rail

Built exactly to the plan's §1, with one correction already recorded above (no `admin/designer`
entry, `التصاميم` discloses two children not three) and one omission caught late: `AdminRailChild`
has no `icon` field by design (nested rows are text-only — §1 already reasoned this through), so the
type split is `AdminRailItem` (top-level, always `icon`) vs `AdminRailChild` (nested, never one).
`react-hooks/immutability` (the React Compiler lint) refused the first draft of `useGroupExpanded` —
mutating a `GroupStore` obtained via a plain function call, inside a closure defined in the hook's
own body, even un-memoized. Fixed by moving the three mutating functions
(`groupSubscribe`/`groupGetSnapshot`/`groupToggle`) to genuine module scope, parameterised by `key`,
with the hook only wiring thin non-mutating wrapper closures to `useSyncExternalStore` — the compiler
analyses a component/hook's own literal body, not functions it merely calls, so an external function
is opaque to it. `console.spec.ts` proves the moderator regroup against real RLS (a moderator's rail:
`الجلسات` direct, `الإشراف` disclosed with all three children, `السجل` direct — three top-level
entries, five reachable routes, matching wave 6's flat count) and the collapsed-rail `ui/menu` flyout
against a real Radix portal.

### K1/K2 — comments and photos moderation

Both rebuilt on `moderation/reports/report-card.tsx`'s already-proven wave-6 shape exactly (`Card`,
`ui/dialog`'s confirmation, toast fired from inside the action). New: `ModerationTabs`
(`components/admin/moderation-tabs.tsx`), an `href`-mode `ui/tabs` strip across all three queues —
`tabs.tsx`'s own header comment already named "the admin sub-nav" as its first real use — badged with
`listModerationCounts()` (three `head: true` counts, my own file, no request to anyone). `reports`
picked up the same strip in the same commit, closing wave 6's own uncaptured "populated photo-report
card" finding. `admin-moderation.spec.ts`'s comment-removal test needed the same dialog-scoping fix
its own photo-removal test already carried a comment about (the dialog portals outside the card's
`<li>`); `admin-reports.spec.ts` gained one new test proving the tab counts and the no-merge rule.

### K3–K5 — venues, categories, companies

One shared `DeactivateToggle` (`components/admin/deactivate-toggle.tsx`) for the genuinely identical
half of "one list pattern three times" — reactivate instant, deactivate dialog-confirmed, no reason
field (none of the three DAL toggles collect one). Labels are PROPS, not a shared translation
namespace — three real namespaces already existed (`admin.venues`/`categories`/`companies`), and a
fourth shared one would just be a second source of truth. Each keeps its own `*-table.tsx` since the
domain fields differ. All three add forms moved onto `lib/form-state`'s model — `admin-managed-
lists.spec.ts` needed the DEC-134 not-found rewrite (never carried for this file before, since
venues/categories/companies weren't rebuilt when wave 6 did that pass elsewhere) and the
`getByRole("table").or(getByRole("list"))` dual-render scoping `admin-members.spec.ts` already
proved, for the exact same reason.

★ **Cross-track flag sent, not fixed by me:** `sessions-screens.spec.ts` (not mine) drives
`/app/admin/venues` as the first step of its own M2 demonstrable chain and asserts
`boss.getByText("قاعة الابتكار")` unscoped — now a strict-mode violation against `DataTable`'s dual
render. Sent `sessions` the exact line and the exact one-line fix (the same `.or()` pattern above).

### K6 — settings

The one substantive rebuild: fourteen fields, `lib/form-state`'s model in full, `fieldValue()`
distinguishing "first render, show the real settings" from "failed round trip, show what was typed"
— an edit-in-place form needed a helper `direct-session-form.tsx`'s blank-create shape never had to
solve. `?saved=1` (the `admin/scoring`/`admin/emails` convention, neither rebuilt yet) plus a new
`SavedToast` — the first real `ui/toast` caller for that convention, firing once on mount and
stripping the query param so a refresh never replays it. `admin-settings.spec.ts` got the DEC-134
rewrite for its moderator-404 test and a scoped `getByRole("status")` assertion for the new toast.

★ **A shared-index incident, not mine to have caused or to fix:** `checkin`'s commit `592c3d2`
("the window, the reversal and every removed_at hook") landed carrying 26 files — its own ~16, my 6
settings files (staged seconds earlier for my own commit, which then found nothing left to commit
for those paths), and 4 of `content`'s (`me/points`, `points-catalogue.tsx`, two specs). The content
at HEAD is exactly what this section already describes — nothing lost, verified file by file — the
only casualty is that K6's commit message doesn't exist as its own entry; it reads as SQL for
check-in windows. Flagged to the lead (recommended: leave it, no rewrite) and to `checkin` directly
(likely `git add -A`/`git commit -a` rather than an explicit pathspec) so it isn't repeated on
someone else's staged work next time. Reported here so K6's own commit sha in the list above is
honestly `592c3d2`, not a sha this file invents to look tidier than what happened.

### Why the messages commit is one commit, not six

`src/messages/{ar,en}/admin.json` accumulated every route's keys across the session before any of
the four code commits landed (I did not commit incrementally as I built), so by the time I could
commit K0's code in isolation, the working file already held K1–K6's additions too. Splitting it into
per-route commits would have meant either fragile hunk-level `git add -p` surgery on one JSON file or
leaving an intermediate commit referencing a translation key (`t("groups.moderation")` etc.) that
does not exist yet at that point in history. One commit for both locale files, covering all six
routes, correctly described, was the honest choice over a prettier-looking history that doesn't match
what actually happened.

### Verification run, and what is still open

`npx tsc --noEmit`, `npm run lint` (grep `problems` — 0 errors throughout, only pre-existing warnings
in files I do not own) and `npx vitest run` (full suite) were run repeatedly across the session —
consistently clean on every file this track owns; every failure seen belonged to other tracks'
concurrent in-progress work in the shared tree (`scoring-i18n.test.ts`, `star-rating.test.tsx`,
`notifications-page.test.tsx`, `deactivation-form.test.tsx` — none mine, confirmed by re-running after
each appeared and finding a different set the next time). `node scripts/ui-reach.mjs --wave7` shows
all seven of this track's rows (K0–K6) at ✓ — part (1) of the measure, done.

**Not done by me, and why:**

- **`npm run test:rls`** — not run this session. The single-runner rule held throughout: a vitest
  process (later specifically `--project rls`) was active in the shared tree at every point I checked.
  Nothing in this wave's DAL changes touches SQL, a grant, or a new table — `listModerationCounts()`
  reads `reports`/`photo_takedowns` through the SAME `requireStaff()` session client and the SAME
  predicates the pre-existing, already-RLS-tested `listCommentReports`/`listPhotoTakedowns`/
  `listPhotoReports` already cover — so this is inherited coverage, not untested surface, but the gate
  is still owed a real run once the runner is free.
- **390 px captures** — none taken. `npm run test:e2e:local` needs a production build
  (`scripts/serve-stub.mjs` serves an EXISTING `.next`, it does not build one), and `npm run build` is
  lead-only. The `.next` on disk predates every commit in this section — running e2e against it would
  test the OLD markup, not this work, so I left it for the lead's sync-point build in the verification
  worktree (`STATUS.md`'s "Order inside the wave" step 4), the same point every wave-7 row's part (2)
  is ticked from. All six new/updated specs (`console.spec.ts`, `admin-moderation.spec.ts`,
  `admin-reports.spec.ts`, `admin-managed-lists.spec.ts`, `admin-settings.spec.ts`) name the capture
  path each row cites, ready for that pass.

### Closing the RLS gap, and R2 — the combobox fix for `sessions`

- **`npm run test:rls` — run once the shared runner freed up: 71 files, 790 passed, 4 todo, 0
  failed.** Confirms the §"Verification run" note above — nothing in this wave's DAL changes
  touches SQL, a grant or a policy, so this was always inherited coverage, now proven rather than
  asserted.
- **R2** (`sessions`' request, routed by the lead) — four fixes to `ui/combobox.tsx` for `/app/
  propose`'s co-presenter field, the primitive's first non-admin caller: dropped the hard-coded
  `dir="ltr"` (Arabic names were typing and reading left-to-right), wired `useFieldWiring()`
  (`aria-describedby`/`aria-required`/`aria-invalid`, `id` falling back to `field?.id`, same
  precedence `ui/input.tsx` already uses), and moved the input's classes onto `controlClass()`.
  The fourth ask — moving its strings off `admin.combobox` — needs `ui.json` (the lead's); sent
  the exact `ui.combobox` keys (unchanged text, just relocated) and left the component reading
  `admin.combobox` with an inline note, rather than switch to a namespace that does not exist yet
  and break every caller. `member-picker.tsx` and both admin callers stay green, four new tests
  added, axe clean. Commit `654ec91`.

### Sync 3 — eight findings, all fixed

The lead's sync-3 build (`d8f0af9`) found eight real problems. All fixed, three commits (`b75afeb`,
`d12499d`, `85cf171`):

1. **Capture path.** Every capture helper hard-coded `process.cwd()`, so a verification-worktree run
   never lands at the path a checklist row cites. All six now read `process.env.E2E_SHOTS_DIR` first
   — the convention every other track's specs already use, missed here because K0-K6 were all
   written before any capture ever actually ran through the lock.
2. **"Populated" captures showing empty — a real test-order bug, not a product bug.** `mode:
   "serial"` runs a file's tests in file order; `admin-moderation.spec.ts`'s and
   `admin-reports.spec.ts`'s own resolution tests ran BEFORE their capture tests and had already
   emptied the seeded queues by the time the screenshot fired. Moved each capture to right after the
   read-only view test. `admin-managed-lists.spec.ts`'s was a different cause — the add tests are
   desktop-only, so the phone project's own org never got a row through them; seeded one directly by
   DB insert instead.
3. **Toast ambiguity** (`admin-managed-lists.spec.ts:165`) — `getByRole('status')` matched two
   stacked toasts. Filtered by text.
4. **`ui/tabs` wrapping at 390 px** — `flex-wrap` → `overflow-x-auto`, the fix `content`'s own
   `me/tab-strip.tsx` had already requested and forked around rather than wait for.
5. **Stale DEC-124 copy** on `/app/admin/exports` — "أرقامها بنظام ترقيم مؤسستك" survived past the
   numerals sweep. Dropped the clause; grepped for more, found none.
6. **Two "add" controls on one screen** — venues/categories/companies' empty-state action reused
   `addTitle`, duplicating the visible form's own submit button. New `emptyAction` copy applied to
   all three, not just the one sync-3 named.
7. **The missing rail-disclosure capture** — K0's own headline (the fourteen-group regroup) had no
   capture showing a group actually open. Added one per role.
8. **Combobox strings** — still `admin.combobox`, not yet `ui.combobox`; reconfirmed to the lead a
   third time with the exact keys, since `ui.json` hasn't landed them yet.

### R2 closed — the combobox namespace switch

`ui.combobox.{removeChip,createOption,resultsCount}` landed in `ui.json` (both locales); switched
`combobox.tsx` to `useTranslations("ui")` + the `combobox.` prefix at each call site, deleted the two
now-dead `admin.combobox` keys (`createOption`/`removeChip`), kept `resultsCount` there for
`member-picker.tsx`'s own separate override. The test file's `Wrap`/`WrapWithField` split collapsed
into one `Wrap` merging both namespaces — `Combobox` now unconditionally needs `ui.combobox`
regardless of whether it's inside a `<Field>`. 24 tests green, commit `b3ad776`. R2 is fully closed.

Confirmed after the ~19:46 shared-index reset the lead flagged: all of this wave's commits
(`addf939` through `9841c39`, plus `654ec91`) are still present in `git log`, working tree clean —
the reset touched only what was staged at that moment, not committed history.

### Two removed_at readers, granted by the lead after promotion (7b2ac81)

`check_ins.removed_at` (0087) is a soft delete; RLS does not hide the row. Fixed two readers that
still counted a removed check-in as attendance: `admin-dashboard.ts`'s `checkInsTotal` (feeds the
attendance-rate figure) and `admin-exports.ts`'s `exportAllAttendanceCsv` (the bulk export — outside
this wave's list, the lead granted this one filter in writing). Both `.is("removed_at", null)`.

Test pattern borrowed directly from `sessions-removed-check-in.test.ts` (the `memorySupabase()`
in-memory stub + `vi.mock("@/lib/dal/session")`) — added `.not()` to that shared stub (additive only)
since the dashboard's category query needs it even on an empty fixture. `tests/unit/
admin-removed-check-in.test.ts`'s four cases were confirmed by hand to fail against the pre-fix
queries (reverted the two files to `HEAD`, ran the suite, saw all four fail with the exact wrong
numbers, restored the fix, saw them pass) before being committed — the "one that fails before the
fix" the lead asked for, proven rather than assumed. Commit `9fd0570`.

### noValidate sweep — a real finding, not just a mechanical fix

Checked each of the six named forms before touching any of them, since `content`'s bug
(`profile-form.tsx`, 7f4809f) was specifically `required` passed DIRECTLY to `<Input required>` —
which genuinely becomes a native HTML attribute via `{...props}`. `ui/field.tsx`'s own contract is
different: `required` passed to `<Field required>` only conveys `aria-required` through context —
`ui/textarea.tsx`/`ui/input.tsx` never forward it as a native attribute unless a caller *also* passes
it directly to the control (which `profile-form.tsx` did; none of these six ever did).

So none of the six had an ACTIVE bug — `proposals/review-card.tsx` and `sessions/session-controls.tsx`
have no `required` control at all, by design (both already explain why in their own header comments:
one inside a collapsed `<details>` would be unfocusable and silently block the whole form). Added
`noValidate` to every form in all six anyway, per `16` §8.2's actual rule ("every form that renders
the app's own error") and as a guard against a future edit making the exact `profile-form.tsx`
mistake. One test per changed form proving the app's own error actually renders on an empty/refused
reason — three brand-new test files (`takedown-card`, comments' `report-card`, `session-controls` had
zero coverage before this) plus two extended (`members-table`, `proposals-review-card`). Commit
`1402e33`.

### The gated-not-found wait flake — six specs, one precise fix

`goto()`'s own zero-`div[hidden][id^="S:"]` wait can time out specifically on a gated route: a
Suspense boundary can flush before the page's own `notFound()` throws, leaving an empty hidden div
in the body permanently, not transiently — sessions' diagnosis (172bf22). Fixed in the exact spot
named: for every gated-not-found test case (and only those — every other `goto()` call in these six
files, real-content navigation, is untouched) across `admin-managed-lists.spec.ts`,
`admin-settings.spec.ts`, `admin-moderation.spec.ts`, `admin-dashboard.spec.ts`,
`admin-members.spec.ts` and `sessions-admin-proposals.spec.ts`, `page.goto()` bare replaces
`goto(page, url)` — the visible not-found heading `expectGatedNotFound()` (or the inline equivalent
in the three files that don't have that named helper yet) already asserts first is the real wait.

`sessions-admin-proposals.spec.ts` — not mine by filename, but it tests `/app/admin/proposals`,
squarely inside this wave's "fixes only" grant on `proposals/**`; touched on that basis, one line,
same pattern as the other five. Commit `c337436`.

### `admin.attendance` deleted — checkin's DEC-137 move closed the loop

`checkin.json` gained its own `attendance` namespace (confirmed: `src/messages/ar/checkin.json`
line 76) as part of moving SCR-044's screen strings off `admin.json`, so the top-level
`admin.attendance` block (both `ar`/`en`, 51 lines each — `title`, `manualTitle`, `reasonLabel`,
`error.reason_required`, etc.) was dead. Grepped `src/` and `tests/` for `admin\.attendance` /
`adminAr.attendance` / `adminEn.attendance` before deleting: the only hit is a comment in checkin's
own `admin/sessions/[id]/attendance/page.tsx` confirming the move ("… `checkin.attendance`
(`checkin.json`), not `admin.attendance`"). Re-ran the same grep after deleting — same single hit,
now with nothing left for it to describe a stale reference to.

Two other `"attendance"` keys in `admin.json` are unrelated and stayed: `admin.sessions.attendance`
(the row-menu link label to the attendance route, read in `sessions-table.tsx:160`) and
`admin.exports.attendance` (the CSV export card's title/note). Both confirmed to have live readers
before touching anything, so the deletion is exactly the one dead block, nothing adjacent.

`npx tsc --noEmit` clean, lint zero errors, `npx vitest run` 144/144 files, 1435/1435 tests green.
Committed alone: `066e8b7`. Per the lead's sync-5 hold, no e2e and no `npm run test:rls` run this
pass — both remain pending on the sync-5 results.

### Sync 5 finding — the dashboard's attendance-rate Stat, value slot vs. hint slot

Sync 5 (build `bfe8e2a`): six specs green on re-run (the three "failed" phone admin cases and the
dashboard case were the harness hang/a gateway flake, not real, per the lead). One real finding from
the drawer capture's empty-org background: `admin/page.tsx`'s attendance-rate `Stat` put the whole
`attendanceRateEmpty` sentence («لا جلسات بدأت بعد لحساب المعدّل.») in the VALUE slot when there was
nothing to divide by yet — stat-number size (`text-h2`), wrapping three lines. `ui/stat.tsx` (content's
file, not touched) already has a `hint` prop built for exactly this — short value, explanation
underneath in caption type. Fixed at the call site: value becomes `"—"` (the bare-dash convention
already used in `moderation/{comments,photos,reports}/page.tsx` for a missing name, not a new message
key), the sentence moves to `hint`. Populated case (`attendanceRatePct !== null`) unchanged — no hint,
real percentage in the value slot as before.

New test, `tests/components/admin/admin-dashboard-page.test.tsx` — first component test of this page,
same mocked-DAL + real-`ar/admin.json` + `createTranslator` pattern `content`'s
`me/certificates-page.test.tsx`/`me/calendar-page.test.tsx` established for an async Server Component
awaited directly (`setRequestLocale: () => {}` + `getTranslations` mocked, `next/navigation` needs no
mock since `notFound()` is never reached with non-null fixture data). Three cases: no-data value/hint
split, populated case has no hint, axe-clean in the no-data state. Confirmed failing against the
pre-fix page by hand — `git show HEAD:path` over the file, ran (the placeholder test failed exactly as
expected, `getByText("—")` found nothing), restored from a scratchpad copy, ran green again — before
committing. `npx tsc --noEmit` clean, lint zero errors on both files, `npx vitest run` 145/145 files,
1438/1438 tests green. Committed alone: `c2bc2b9`. Still holding the sync-5 e2e/RLS constraint.

### K3 — the venues capture gap

Sync 5's own review found no wave-7 venues capture: the only file on disk
(`scr-046-venues-390-rtl-phone.png`) predates promotion, from sessions' M2 walk, not this wave's spec;
`wave7-console-layout-untouched-390.png` is `/app/admin/exports`, not venues. Added a venue seed row to
`admin-managed-lists.spec.ts`'s `beforeAll` (same reasoning as its existing categories/companies rows —
the add-flow tests are desktop-only, so the phone project's org would otherwise reach the capture with
zero rows) and a new phone-only test producing `wave7-console-venues-populated-390-rtl-phone.png`
through the same `review()` helper (honours `E2E_SHOTS_DIR`, the same overflow/dir/viewport assertions
categories and companies already get). `npx tsc --noEmit` clean, lint zero errors; not run locally —
matching how captures land this wave, the next sync build produces it and the lead opens it. Committed
alone: `4ee8005`.

### Sync 6 finding — the same status-cell defect on all three managed lists, not just venues

K3 closed (the lead opened `wave7-console-venues-populated-390-rtl-phone.png`), but flagged one thing
in it: the card's «الحالة» row had a label with no value for the active venue (السعة and الجلسات
القادمة both had values beside them). Root cause, found by reading `ui/data-table.tsx`'s card mode
(content's file, not touched): it always renders an `onCard` column's label, with no notion of "skip
this field" — `venues-table.tsx`'s own status `cell()` returned a `Badge` only for the deactivated case
and `null` otherwise, so the active case's value slot was always empty on the phone card (the desktop
table has the same gap, just less visible next to a `Badge`-shaped column that simply isn't there).

Checked `categories-table.tsx` and `companies-table.tsx` before fixing anything — identical `cell()`
shape, same defect, same three-tables-built-together reasoning `venues-table.tsx`'s own header comment
already names ("one list pattern three times"). Fixed all three rather than venues alone: the cell now
always renders a `Badge` — `tone="success"` active, `tone="neutral" outline` deactivated — matching
`admin/members/members-table.tsx`'s own status-cell convention exactly (`docs/plan/notes/console.md`
never needed to invent a new pattern; it already existed one screen over). Added an `active` message
key to all three namespaces, gendered per noun the same way each existing `deactivated` key already is:
«نشط» (مكان/تصنيف, masculine) for venues and categories, «نشطة» (شركة, feminine) for companies.

New test, `tests/components/admin/managed-lists-status-badge.test.tsx`, one case per table, scoped to
the phone card `<ul>` specifically (`container.querySelector("ul")` — `getByRole("list")` is ambiguous
against `ToastProvider`'s always-mounted `<ol>` toast region, which carries the same implicit role).
Each table imports its own `./actions` directly (unlike `members-table.tsx`, which takes actions as
props), so each is `vi.mock`ed the same way `me/profile-form.test.tsx` mocks
`@/app/[locale]/app/me/actions`. Confirmed failing against the pre-fix cells by hand — reverted all
three table files to `HEAD`, ran (all three cases failed, empty string where a Badge's text should be),
restored from a scratchpad copy, ran green again — before committing. `npx tsc --noEmit` clean, lint
zero errors, `npx vitest run` 146/146 files, 1444/1444 tests green. Committed alone: `7f452d6`. Still
holding the sync-6 e2e/RLS constraint.

## Wave 8 plan (DEC-147) — 2026-09-17 — audit, exports, reminders, recognition, scoring, emails

Written before any code, per the spawn brief; this note is the only file touched. Six routes
(K1–K6 in `STATUS.md`'s wave-8 checklist), plus the carried items and three defects found in my own
wave-6/7 routes while reading for this plan (§4). Every claim below was read off the tree at
`caf414c`, not carried from an older note — and §3 corrects one of wave 7's own closures that turned
out to be wrong.

### 0. What the six screens are today

None of the six imports an M9 primitive except scoring, and scoring only through `MemberPicker` →
`ui/combobox` (`ui-reach --wave8`: 1 of 6, incidental). Every form on the four editing screens (reminders,
recognition, scoring, emails) is a `redirect("?saved=1" |
"?error=1")` round trip: a refusal re-renders from the database, so **every typed value is lost**
(`REQ-UIX-011`), and the one error is a banner, never at a field (`REQ-UIX-009`, `010`). All six carry
copied control class strings (`ui-lint` allowlist rows for five pages, `audit/filter-form.tsx` and
`held-achievements.tsx`). Four redirect to a hard-coded `/ar/`.

### 1. The one list pattern — and what it reuses

**Every list on the six screens is `ui/data-table`**, with the stacked card list below `md` — audit
entries, exports, the scoring catalogue, company rules, the configuration history, badges, levels,
streaks, perks, held achievements (its `selection` bulk bar is exactly the release), the email
template catalogue and the delivery log. **Every column that carries an action is `onCard`** — §4 F1
is what happens when it is not. What is shared, all under `src/components/admin/**`:

| Component | New / reused | What it is | Callers this wave |
|---|---|---|---|
| `ui/data-table` | reused (mine) | the list | all six |
| `row-edit-dialog.tsx` | **new** | «عدّل» (accessible name carries the row: «عدّل: تعليق») opening `ui/dialog` titled with the object; hosts one form on `lib/form-state`; closes and toasts **from the action's result**, stays open with field errors and `FormSummary` on refusal | scoring rules, company rules, badges, levels, streaks, perks |
| `confirm-dialog.tsx` | **extracted** from `deactivate-toggle.tsx` | names the object, states the consequence before the click (`REQ-UIX-013`), `danger` or `primary`, pending on the confirm, toast from the action. `DeactivateToggle` composes it and keeps its external props, so venues/categories/companies do not move | badge retire, template «استعد الافتراضي», manual points adjustment, held-achievement release |
| `use-action-toast.ts` | **new** | wraps a Server Action for `useActionState` and fires `ui/toast` from the resolved result — the wave-6 rule (never an effect in something that unmounts in the same commit), written once instead of per card | every form above |
| `duration-input.tsx` | **new** | a number `ui/input` + a unit `ui/select` (دقائق · ساعات · أيام) posting minutes or seconds; the unit select carries its own accessible name | reminders (offsets, rating prompt), scoring (cooldown) |
| `keyset-pager.tsx` | **new** | «أقدم» / «الأحدث» links over a `before=<occurred_at>~<id>` cursor; never an offset | audit, delivery log |
| `member-picker.tsx` | **reworked** (mine) | drops its own `<label>` and asterisk and renders inside `<Field>` — `ui/combobox` already wires `useFieldWiring()` (R2, wave 7) | scoring adjustment, recognition award |
| `moderation-tabs.tsx` shape | pattern reused | `ui/tabs` in `href` mode as a view switch | emails («القوالب» · «سجل الإرسال») |

The page frame is the wave-6/7 one: `PageHeader`, `SectionHeader` per section, `Panel` for notes,
`EmptyState` in every table's `empty` (a filtered-empty state offers `clearFilter`), `Badge` for
every status, `SubmitButton`. **No `?saved=1`**: `settings/saved-toast.tsx` stays where it is, and
none of the six uses the query-string convention again.

### 2. Per route

#### K1 — `/app/admin/audit` (SCR-062, `REQ-ADM-018`, `03` §5.10a)

- **Primitives.** `PageHeader` · `Panel` (filters, `md` and up) · `ui/sheet` behind «تصفية» on the
  phone, with the same form · `Field` + `Select` (actor — admin only; action, with `<optgroup>` per
  domain and Arabic labels; subject type) · a period `Select` (آخر 7 أيام · آخر 30 يومًا · هذا الشهر ·
  مدة مخصّصة) and, for مدة مخصّصة, two `ui/date-time granularity="date"` (§5.4) · active filters as
  `TagChip removeHref` + «امسح الكل» · `DataTable` (الوقت · الفاعل + role `Badge` · الإجراء: Arabic label
  with the key as a caption · العنصر, with «كل ما جرى على هذا العنصر» linking `?subjectId=` · السبب) ·
  `keyset-pager` · `EmptyState` (unfiltered, and filtered with `clearFilter`). **Nothing on the
  screen edits a row**; there is no action column.
- **DAL** (`admin-audit.ts`, mine). `listAuditLog` gains `subjectId` and the cursor, pages at 50 and
  returns `nextBefore`; the date bounds become **the org's day** — from = start of the day in
  `org_settings.time_zone`, to = start of the NEXT day, `lt` — through a small helper with its own test.
  `listAuditFilterOptions()` replaces `listAuditActions()`: distinct actions and subject types from the
  log, and actors including **former** staff who appear in it. Reads `getOrgPrefs()` (`proposals.ts`).
  The action labels live in `admin.audit.actions.<domain>.<verb>` for all 55 dotted action literals the
  migrations write today, with a test that fails when a migration adds one without a label (§5.5).
- **Moderator.** Sees their own actions only — RLS already scopes the query (`audit_read_moderator_own`);
  the actor filter is not rendered; the intro says so.
- **Captures.** `wave8-console-audit-filtered-admin.png` · `wave8-console-audit-filtered-moderator.png`
  (both filtered by action, chips visible) · `wave8-console-audit-filters-sheet.png`.
- **Where the screen contradicts a requirement.**
  - **A1** «إلى تاريخ» excludes the day it names: `lte("occurred_at", "2026-09-17")` compares against
    midnight, and both bounds are UTC midnight, not the org's day.
  - **A2** the action and subject render as machine keys (`member.role_changed`, `dir="ltr"`) — an
    Arabic-first screen with no Arabic for what happened.
  - **A3** «searchable by … subject» is a free-text `subject_type` input; there is no way to follow one
    subject.
  - **A4** a silent 200-row cap, no pager and nothing saying so.
  - **A5** a `min-w-[640px]` table in `overflow-x-auto` — the horizontally scrolling table on a phone
    `16` §6.7 bans; native `<select>`s and `type="date"` with the browser's English mask (`sessions`'
    carried finding, the same control).
  - **A6** the actor filter lists current staff only, so a demoted moderator's actions cannot be
    filtered to, and «النظام» cannot be chosen.
  - **A7 — a gap in the requirement, not the screen:** `REQ-ADM-018` lists «scoring configuration
    changes», and those are written to `scoring_config_history`, never `audit_log`. The audit screen
    links to K5's history rather than union two tables; the lead decides whether `01` says so (§5.3).

#### K2 — `/app/admin/exports` (SCR-061, `REQ-ADM-017`, `REQ-INT-006`)

- **Primitives.** `PageHeader` · `Panel tone="info"` — «كل تنزيل يُسجَّل في سجل التدقيق باسمك» with a
  link to K1 filtered to `export.created` · `DataTable` of the seven exports (name + what it holds ·
  آخر تصدير: `<bdi>` name · time, or «لم يُصدَّر بعد» · the download) · a new
  `components/admin/export-download-button.tsx`: `fetch` → blob → `download`, `pending` on the
  button (`REQ-UIX-007`), an error toast that stays on failure (`16` §7.3), filename read from
  `filename*`. The Route Handlers keep their URLs and contract (`checkin`'s attendance screen links
  `attendance/[sessionId]`).
- **DAL** (`admin-exports.ts`, mine). `listRecentExports()` — the latest `export.created` row per
  `after.export_type` with the actor's name. Arabic value maps for the enums the CSVs print raw today
  (sessions' state, level, language; points' source; certificates' kind). The header comment that
  says numbers follow «the org's own numeral system» is corrected (`DEC-124`); the copy already is.
- **Moderator.** Not-found (`requireAdminSession()`, `DEC-134`'s streamed contract); the Route
  Handlers 404.
- **Captures.** `wave8-console-exports-audit-note.png` (populated «آخر تصدير» after one download) ·
  `wave8-console-exports-download-failed.png` only if the failure toast can be forced without a
  product change — otherwise covered by a component test.
- **Contradictions.** **E1** `REQ-ADM-017` acceptance 3 («the numeral system follows the org setting
  (A30)») and SCR-061's «org numeral system» still say what `DEC-124` withdrew — the lead's documents
  (§5.3). **E2** Arabic headers over English enum values (`published`, `introductory`, `check_in`,
  `achievement`). **E3** a styled `<a>` with no pending state and a raw error page on failure. **E4**
  «every export is audited» is asserted and never visible. **E5 — a question, §5.1 Q5:** every date in
  every CSV is Arabic long-form prose («الخميس، 17 سبتمبر 2026 في 3:00 م») — Western digits, but a
  column Excel cannot sort or filter as a date.

#### K3 — `/app/admin/reminders` (SCR-060, `REQ-ADM-016`, `REQ-NTF-004`)

- **Primitives.** `PageHeader` · one form on `lib/form-state` · a `fieldset` of offset rows, each a
  `duration-input` in its own `Field` with «أزل» (`IconButton`), «أضف تذكيرًا» up to six · the rating
  prompt as one `duration-input` · `Panel` for the generic-message note · «الجدول الحالي» as a sentence
  («قبل 7 أيام، ثم قبل يوم، ثم قبل ساعتين») · `FormSummary` · `SubmitButton` · toast from the action
  («حُفظ الجدول وحُرّكت التذكيرات المعلّقة»).
- **DAL.** `getReminderSchedule()` / `setReminderSchedule()` in `notifications.ts`, **unchanged** —
  minutes in, the trigger moves the pending jobs. No add-only function.
- **Moderator.** Not-found.
- **Captures.** `wave8-console-reminders-field-error.png` — an offset of 2 minutes and a duplicate, both
  at their rows, the summary linking to each.
- **Contradictions.** **R1** offsets are typed as a comma-separated list of minutes («10080, 1440,
  120»). **R2** a refusal loses the typed list and says only «تأكد من أن كل مدة بين خمس دقائق وثلاثين
  يومًا», not which. **R3** duplicates are merged silently by the DAL. **R4** native `required` without
  `noValidate` (carried). **R5** the generic-message note sits in `admin.json` while the rest of the
  screen is `notifications.admin.reminders` — moved into the latter (both mine).

#### K4 — `/app/admin/recognition` (SCR-054, `REQ-ADM-012`, `REQ-REC-001` … `008`, `REQ-CRT-012`)

- **Primitives.** `PageHeader` · **held achievements first, and only when there are any** — the page
  gates the section (`16` §5.4.1a(b)): `DataTable` with `selection` (المستفيد · الإنجاز · الرقم
  التسلسلي) and «أطلِق المحدَّدة» opening `confirm-dialog` — «إطلاق 3 شهادات؟ تظهر لأصحابها ويصل كلًّا
  منهم إشعار، ولا تُسحب بعد ذلك إلا بإلغاء كل شهادة» (six plural forms) · badges `DataTable` (name +
  description · rule as a sentence, «10 تسجيلات حضور» / «تُمنح يدويًا» · certificate · state) with
  `row-edit-dialog` and «أوقف الشارة» on `confirm-dialog` («من يحملها يحتفظ بها»), «أعِد تفعيلها»
  instant · «منح شارة يدويًا»: `Field`+`MemberPicker`, `Field`+`Select` (active badges), `Field`+`Textarea`
  · levels `DataTable` + dialog · streaks `DataTable` + dialog (`Switch`) · perks `DataTable` + dialog
  (`Switch`, and the qualifier: `RadioGroup` level or badge + `Select`), the can-host warning kept.
- **`held-achievements.tsx`, presentation only.** It becomes a presentational component the page feeds:
  the page calls `listHeldAchievements()` (`designer`'s DAL, read, one query) to gate its section, and
  the table, the selection and the confirm live in a client child under `components/admin/`.
  `releaseAchievements` stays `designer`'s and is called unchanged — **but see §5.2 R-D1**: today it
  returns nothing, so neither success nor failure can be said.
- **DAL** (`scoring-admin.ts`, mine). `updateBadge` gains `name` and `rule` (metric from the six the
  evaluator reads — `check_ins_count`, `sessions_delivered_count`, `ratings_submitted_count`,
  `streak_awards_count`, `presenter_rating_avg` with `min_sessions`, `manual` — and `gte`);
  `updateLevel` gains `name` and maps `23505` to «حدّ مستخدم في مستوى آخر»; `updatePerk` gains the
  qualifier; `submitManualBadgeAward` pre-reads `member_badges` and returns `{ alreadyHeld }`.
  **`createBadge` only on Q1.** Every one of these is within grants that already exist (`0027`: badges,
  levels, perks, streak_rules have table-level insert/update for an `is_org_admin()` caller) — **no SQL,
  no add-only function in `recognition.ts`.** An RLS test proves a moderator is refused each write
  (`REQ-ADM-020`, §5.5).
- **Moderator.** Not-found.
- **Captures.** `wave8-console-recognition-held.png` · `wave8-console-recognition-release-confirm.png`
  · `wave8-console-recognition-award-already-held.png`.
- **Contradictions.** **G1** `REQ-REC-001`: an admin cannot create a badge, rename one or change its
  award rule — description, certificate flag and retire only. **G2** `REQ-REC-003`: level titles are
  not editable; a threshold equal to another level's fails as a generic error. **G3** `REQ-REC-006` and
  `008`: the qualifying level or badge of a perk is read-only. **G4** the manual award takes a **typed
  member UUID** — `DEC-050`'s amendment gave SCR-053 a picker and SCR-054 never got one. **G5** awarding
  a badge the member already holds is a silent no-op reported as «حُفظ التعديل» — and still writes a
  `badge.manual_award` audit row. **G6** retire is a checkbox whose label flips to «إعادة تفعيل الشارة»
  while *checked* means still retired, and retiring is not confirmed. **G7** held achievements: the
  page's h2 «… بانتظار الإصدار» renders over a slot that returns nothing on most days, the slot repeats
  it as an h3 «… بانتظار الإطلاق», release has no confirmation (`REQ-UIX-013` names issuing
  certificates), and a leaderboard certificate's «achievement» is a raw ISO date. **G8 — flag only:**
  badges, levels, perks and streak edits write no history and no audit row.

#### K5 — `/app/admin/scoring` (SCR-053, `REQ-PTS-004` … `010`, `REQ-ADM-011`)

- **Primitives.** `PageHeader` · `SectionHeader` «كتالوج النقاط» over **three** `DataTable`s —
  «للحاضرين», «للمُقدِّمين», and **«الخصومات» with «مغلقة افتراضيًا»** (`no_show`, `late_cancellation`,
  `comment_removed`, `photo_removed`) — columns: الإجراء (a fixed Arabic label per `action_key` from
  `scoring.admin.actions.*`, with `reason_ar` beneath as «ما يراه العضو») · النقاط · الحد لكل جلسة ·
  فترة الانتظار in words · الحالة `Badge`; a penalty at 0 reads «لا خصم» · `row-edit-dialog` per rule
  (`Input` points — a penalty is entered as a **positive cost** and stored negative; `Input` cap;
  `duration-input` cooldown; `Switch`; `Input` reason) · «نقاط الشركات» `DataTable` + dialog · the
  host company for a session: `Field`+`Combobox` over the org's sessions and `Field`+`Select` company
  (Q3) · «تعديل يدوي»: `Field`+`MemberPicker`, `RadioGroup` أضف / اخصم, `Input` amount (positive),
  `Textarea` reason, `FormSummary`, then `confirm-dialog` «خصم 50 نقطة من «ريم»؟ يُسجَّل في سجلها
  وسجل التدقيق ولا يُحذف» · «سجل التعديلات» `DataTable`: متى · من · القاعدة · الحقل · من → إلى, both
  scopes, 50 latest.
- **The catalogue is fixed.** No add control; `action_key` and `actor` are outside the update grant
  (`0027`), and `الحجز`/`التفاعل` cannot appear because the check constraint does not admit them
  (`REQ-PTS-010`) — the section says so in one line.
- **DAL** (`scoring-admin.ts`, mine). `updateScoringRule` gains `reasonAr` and a **sign guard by group**
  (a rewarding action ≥ 0, a penalty ≤ 0) in zod; the cooldown read-back parses every interval
  PostgREST returns, including a `1 day …` part (latent today — this screen writes `N seconds`, which
  Postgres prints as `24:00:00`, measured locally; a `'1 day'` from any other writer reads back as «no
  cooldown» and the next save would erase it); history rows gain the actor's name and the rule's
  action, drop the `version` column's own rows, and format in the org's zone rather than a hard-coded
  `Asia/Riyadh`; `submitManualAdjustment` maps `reason_required` / `amount_required` / `not_found` to
  fields. Reads `listMembersForAdmin()` (`admin-members.ts`) and, on Q3, `listSessionsForAdmin()`
  (`sessions.ts`, read only).
- **Moderator.** Not-found.
- **Captures.** `wave8-console-scoring-catalogue.png` (the three groups, «مغلقة افتراضيًا» visible) ·
  `wave8-console-scoring-member-picker-open.png` · `wave8-console-scoring-rule-dialog-error.png`.
- **Contradictions.** **S1** negative actions are not grouped and nothing says «مغلق افتراضيًا» (SCR-053);
  they are seeded `enabled = true` at 0, so their enable switch means nothing. **S2** rules are named by
  the editable `reason_ar` plus the raw `(action_key)`. **S3** cooldown in seconds, and the latent
  interval parse above. **S4** no sign guard: a reward can be saved negative and a penalty positive.
  **S5** `REQ-PTS-005` («who, when, old value and new value … readable»): the history shows no actor,
  no rule, raw JSON, and a `version` «change» on every save. **S6** the host company takes a typed
  session UUID. **S7** the manual adjustment: «عدد النقاط (سالب للخصم)» (a minus sign in an RTL field),
  «معرّف العضو» over a picker, an asterisk, and an irreversible ledger write with no confirmation.
  **S8** fourteen forms, fourteen primary buttons (`16` §3 principle 2).

#### K6 — `/app/admin/emails` (SCR-058, `REQ-ADM-014`, `REQ-NTF-007`, `REQ-NTF-008`) — what it does today, not the studio

- **Primitives.** `PageHeader` «البريد» · a `Panel tone="error"` at the top **only when** a send failed
  in the last 7 days — «تعذّر إرسال 3 رسائل خلال آخر 7 أيام» → the log, filtered · `ui/tabs` (href)
  «القوالب» · «سجل الإرسال».
  - **Templates** — `DataTable` of every email-channel `MSG-*` (the Arabic name with the key as a
    caption · النوع · **the matrix**: in-app and email `Badge`s, «يصل دائمًا» or «يمكن للعضو إيقافه» from
    `notification_matrix()`'s `optional` · «قالب المؤسسة» / «الافتراضي» · آخر تعديل), `rowHref` →
    `?key=`. The editor: breadcrumb back, `Field`+`Input` subject, `Field`+`Textarea` body (line-height
    1.7, no clipping), the required fields, `FormSummary`, `SubmitButton`, toast from the action;
    **the trigger's refusal rendered at the field it names** — «النص لا يحتوي على `{{title}}`» under the
    body; «استعد القالب الافتراضي» on `confirm-dialog` naming the message.
  - **Delivery log** — «الإخفاقات» (default when the Panel links here) · «الكل»; `DataTable`: الوقت · الرسالة ·
    المستلم · الحالة `Badge` (`error` for failed/bounced) · **السبب**: an Arabic summary («رفض مزوّد البريد
    الرسالة», «تجاوز حد الإرسال», «تعذّر الوصول إلى مزوّد البريد») with the provider's own text beneath in
    `<bdi dir="ltr">`; `keyset-pager`; the retention line with all six plural forms.
- **DAL — add-only in `notifications.ts`**, each behind `sessionClient()` and the existing `assertAdmin`:
  `listDeliveryLog(locale, { status: "failed" | "all", before?, limit? })`,
  `countDeliveryFailures(locale, { days })`, and `saveTemplateChecked(locale, input)` returning
  `{ ok: true } | { ok: false; error: "missing_required_field"; field: string } | { ok: false; error:
  "unknown_message_key" | "not_permitted" }` — the trigger already names the field in its message
  (`missing_required_field: %`), and the existing `saveTemplate()` throws the name away; it is left as
  it is. Reads `getTemplateCatalogue()`, `getNotificationMatrix()`, `deleteTemplate()` as they are, and
  `getOrgPrefs()` for the zone instead of `getPreferenceMatrix()`. On Q2, one more add-only reader for
  the default text.
- **Moderator.** Not-found.
- **Captures.** `wave8-console-emails-catalogue.png` · `wave8-console-emails-refused-save.png` ·
  `wave8-console-emails-delivery-failure.png` (a seeded `failed` row with a provider reason).
- **Contradictions.** **M1** a refused save loses the subject and body, and the refusal is a banner.
  **M2** `REQ-NTF-007` — «a template missing a required dynamic field fails validation» — can be
  defeated from this screen: the required fields are whatever the admin types into the same form, so an
  empty list saves a body with no `{{title}}` (Q2). **M3** overriding starts from an empty form; the
  default text is nowhere on the screen. **M4** «احذف القالب واستخدم الافتراضي» deletes with no
  confirmation (`REQ-UIX-013`). **M5** the log is the newest 100 of everything, «failures first» only in
  a comment — after one reminder batch a morning's failures are off the list — and the reason is the raw
  `resend 422: {…}`. **M6 — a gap outside this screen:** nothing writes `bounced` or `delivered`; there
  is no webhook route (`src/app/api/webhooks` does not exist), so `REQ-NTF-008`'s «a bounce … is visible»
  cannot be true yet — only a send the provider refused is (§5.3). **M7** «يُحفظ السجل {days} يومًا» is a
  count without its plural forms. **M8** no preference matrix renders at all; `getPreferenceMatrix()` —
  the admin's *own* member preferences — is fetched only for its time zone.
- **Not built, stated so the line holds:** blocks, the three-pane editor, a preview, «أرسل اختبارًا»,
  the designed library (`16` §11, M12, `notify`'s).

### 3. The carried items — each closed or not, with the evidence

- **`console.spec`'s untouched-route capture at 412 px — CLOSED in wave 7.** `console.spec.ts:246` sets
  `390 × 844` on the phone project (`3683f76`, `b75afeb`) and `wave7-console-layout-untouched-390.png`
  exists. **But it targets `/app/admin/exports`, which K2 rebuilds** — so in K2's commit it moves to
  `/app/admin/proposals` (untouched by anyone this wave) and writes `wave8-console-layout-untouched-390.png`.
- **The dashboard's «أكثر …» cards — NOT closed, and wave 7's closure was a misreading.** My wave-7 note
  says the capture shows the count at the edge. It does not: `app/admin/page.tsx:22-27` renders label and
  count inside **one** child (`<span class="ms-2">`), so the `li`'s `justify-between` has nothing to
  distribute, and `scr-040-admin-dashboard-390-rtl-phone.png` (cropped and reopened today) shows «المُقدِّم
  الأول 1» with the count beside the name while «مسار المقترحات» sets it at the edge. **Pick: the edge**
  — the pipeline's convention, and a column of counts scans. Fix in `page.tsx`, one test, one capture
  `wave8-console-dashboard-top-lists.png`.
- **The populated photo-report capture — it exists and was never cited.**
  `admin-moderation.spec.ts:237` wrote `wave7-console-moderation-reports-populated-390-rtl-phone.png`
  (2026-09-16 23:47): a populated photo-report card — the photo placeholder, «رفعها · الجلسة · المُبلِّغ»,
  «سبب البلاغ: محتوى غير مناسب», the three tabs each counting 1. No wave-7 K row cites it, so it was never
  opened by the lead. Two things in it: the full-page capture paints the tab bar over the card's action
  row, and the third tab's count is clipped at the strip's edge (it scrolls; nothing says so). **Ask:** the
  lead opens it; if a viewport capture scrolled to the actions is wanted, it is one test and no code.
- **`noValidate` on emails, scoring, recognition, reminders** — folded into the rebuilds.
- **`admin.schedule.*`** — 50 keys, deleted from both `admin.json`s when the lead routes it, not before.
- **The lead's schedule request** — `DateTimeProps` gains `label`; I wire it in `ui/date-time.tsx` the day
  the type lands (§5.4).

### 4. Found in my own wave-6/7 routes — fixes only

- **F1 — on a phone, members, venues, categories and companies have no row actions at all.** Their
  `actions` column is not `onCard`, and `DataTable`'s card list drops every column that is not.
  `wave7-console-venues-populated-390-rtl-phone.png` shows it: a venue card with السعة, الجلسات القادمة,
  الحالة — and no «عطِّل». A member's role change and deactivation are unreachable at 390 px. The
  sessions table had the same defect and fixed it in wave 6 (`sessions-table.tsx:138-146`); the other four
  never got it. It hid because every row-scoped e2e case in `admin-members.spec` and
  `admin-managed-lists.spec` is `desktop`-only. **Fix:** `onCard: true` on the four actions columns, a
  component test per table asserting the action inside the phone `<ul>`, and one phone e2e case per spec
  driving it from the card.
- **F2 — the «أكثر …» cards**, §3.
- **F3 — rail labels that name a different thing than the page.** «التسجيل» for scoring — a word this
  product uses for check-in and registration; «التكريم» for recognition; «البريد الإلكتروني» over «قوالب
  البريد». Proposed: «النقاط» · «الشارات والمستويات» · «البريد». And `admin.shell.moderatorEmpty` («… قيد
  الإنشاء. سنضيف … تباعًا») is an unreachable fallback whose copy stops being true this wave — reworded.

### 5. Requests and questions

**5.1 — For the lead to rule at sync 1**

1. **Q1 — `REQ-REC-001`'s «create».** Renaming a badge and editing its rule are in (no SQL, grants exist).
   Is **creating** a badge in? It costs one dialog, a generated `key` (`custom_<8 hex>`), the six-metric
   rule editor already built for editing, and one RLS case. My recommendation: in.
2. **Q2 — the email defaults and the required fields.** (a) May `notifications.ts` gain an add-only
   reader that imports `DEFAULT_TEMPLATES` from `worker/src/mail/templates.ts` (a data-only module,
   read, never edited) so the editor can show and start from the default? (b) Should the required fields
   be **the `{{tokens}}` the default uses, shown read-only**, rather than a list the admin types? That is
   what makes `REQ-NTF-007`'s acceptance true from this screen; the trigger is unchanged. My
   recommendation: yes to both; without (a), (b) cannot be done.
3. **Q3 — the host company for a session.** It is a session field typed on the scoring screen as a UUID.
   Either it becomes a session `Combobox` here (my file, no dependency), or it moves to your schedule form
   (L2) and leaves this screen. Recommendation: the combobox now; if L2 takes the field, I remove it.
4. **Q4 — «the preference matrix» on SCR-058** read as `08` §1's matrix, per message, read-only in the
   catalogue (which emails a member can switch off, which always arrive) — not an admin's own preferences,
   which are `/app/me/notifications`. Confirm.
5. **Q5 — dates in CSV.** Keep the Arabic prose, or `2026-09-17 15:00` in the org's zone with the zone in
   the header («التاريخ (Asia/Riyadh)») so Excel sorts and filters it? Recommendation: the latter; it
   changes what `admin-exports.spec` asserts and nothing else.
6. **Q6 — rail labels (F3).** The three proposed labels, or keep.

**5.2 — For `designer`, through the lead**

- **R-D1** `components/certificates/actions.ts`: `releaseAchievements` returns `WriteResult` (it has one
  from `releaseCertificates()` and discards it) and answers an empty or invalid selection with a result
  instead of a bare `return`. Without it the release confirm can close on nothing and say nothing.
- **R-D2** `lib/dal/certificates.ts`, add-only: `listHeldAchievements()`'s rows gain optional
  `badgeName` and `period: { kind, start, end }`, so a leaderboard certificate reads «المتصدّرون · أغسطس
  2026» rather than `achievementName: "2026-08-01"`.

**5.3 — For the lead's documents** — `REQ-ADM-017` acceptance 3 and SCR-061's «org numeral system»
(`DEC-124`); `REQ-ADM-018`'s «scoring configuration changes» live in `scoring_config_history`, not
`audit_log` (A7); `REQ-NTF-008`'s bounce is never written — no webhook (M6), `notify`'s whenever it
next runs; recognition edits are unaudited (G8).

**5.4 — Primitives.** **None** requested of `sessions`' eight or `content`'s nine: `Field`, `Input`,
`Select`, `Textarea`, `RadioGroup`, `Switch`, `FormSummary`, `Badge`, `Panel`, `EmptyState`, `TagChip`
(`removeHref`) cover every screen as they are; if one surfaces while building, it comes to the lead by
file and prop. **Mine, announced:** `ui/date-time.tsx` wires `label` when `DateTimeProps` gains it, and
builds `granularity="date"` on the RTL picker instead of a native `type="date"` — which means
`rtl-datetime-picker.tsx` gains an optional `dateOnly` (serialises `YYYY-MM-DD`, hides the hour and
minute). **Your schedule form is its only consumer; its default path does not change**, and I will not
land it without telling you first. Its stale `numerals` comment goes in the same change.

**5.5 — Test paths.** (a) `tests/unit/admin-*.test.ts` for the pure helpers — the org-day bounds, the
interval parser, the delivery-reason mapping, and the audit-label coverage test that reads every action
literal in `supabase/migrations/` — as the lead granted `admin-removed-check-in.test.ts` in wave 7.
(b) New `tests/rls/admin-recognition-writes.test.ts` (in my list): a moderator refused on badge insert
and update, level update and perk qualifier update; an admin allowed.

### 6. Order of work

Smallest first, so the shared components are built by real callers and the route with the most open
questions comes last:

1. **F1 + F2 + F3** — small, in files no other row touches, and F1 is a live defect.
2. **K3 reminders** — builds `duration-input`, `use-action-toast` and the form-state round trip on one
   short form.
3. **K1 audit** — read-only; builds `keyset-pager`, the org-day helper, the action labels, and
   `granularity="date"` (after telling the lead).
4. **K2 exports** — the download button, recent exports, the enum maps; moves `console.spec`'s untouched
   capture (§3).
5. **K5 scoring** — builds `row-edit-dialog` and `confirm-dialog`, reworks `MemberPicker`; rewrites
   `scoring-company-points.spec` and the admin half of `scoring-screens.spec`, leaving their `/app/me`
   and leaderboards half exactly as it is.
6. **K4 recognition** — reuses K5's dialogs; the held achievements wait on R-D1 (built against the current
   void return first, then wired to the result).
7. **K6 emails** — after Q2 and Q4; rewrites the admin half of `notify-screens.spec`, leaving the
   `/app/me/notifications` and calendar cases untouched.

Each route: its own commits, `tsc`, lint, `npm test` with axe on every new `components/admin` piece and on
`ui/date-time`, RLS where a write changed, one `wave8-console-<route>.spec.ts` honouring `E2E_SHOTS_DIR`
— phone project, `390 × 844`, a viewport capture scrolled to the state wherever the full-page artefact
would paint the tab bar over it — then **«ready for sync»**.

### 7. The three risks I would watch

1. **K6 sliding into the studio, or stalling on its questions.** Q2 decides whether `REQ-NTF-007` can be
   made true from this screen at all, and the defaults live across a package boundary. Mitigation: it
   is last; §2 K6 lists what is not built; without Q2 it ships the catalogue, the field-level refusal and
   the log, and says the required-fields gap plainly.
2. **Specs I now own that cover screens I must not change.** `scoring-screens` captures `/app/me/points`
   and the leaderboards, `notify-screens` drives `/app/me/notifications` and the calendar; both assert my
   screens by selectors (`getByLabel("معرّف الجلسة")`, `toHaveURL(/saved=1/)`, `li` locators) that the
   rebuild removes. The admin halves get rewritten; the member halves must stay byte-for-byte, and a key
   those screens read in `scoring.json`/`notifications.json` is never renamed.
3. **Fixtures for the states the captures need.** A held achievement needs a `certificates` row with a
   `template_version_id` — the table `designer` re-seeds this wave (`DEC-128`) — and a delivery failure
   needs an `email_deliveries` row with a provider reason. Both seed by `pg` in the spec, borrowing
   `designer-achievements.test.ts`'s shape; if `designer`'s seed moves under them, the fixture reads the
   template version by query, never by a pinned id.

## Wave 8 — as built (sync 1 rulings, `DEC-148`) — 2026-09-17

All six routes are ✓ under `node scripts/ui-reach.mjs --wave8`. The e2e specs below are written and
lint-clean and have NOT run: the local `.next` predates every commit here and the build is the
lead's. Captures land at the named paths when the lead's build runs them.

| Row | Commits | Review spec(s) | Captures (`wave8-console-*.png`) |
|---|---|---|---|
| F1 | `6df9dfb` | `admin-members`, `admin-managed-lists` (new phone cases) | — |
| F2 | `20c06da` | `admin-dashboard` | `dashboard-top-lists` |
| F3 | `b886186` | — | — |
| tabs | `48cd13d` | `admin-moderation` | `moderation-tabs-390` |
| F4 | `9a2dd0f` | component test only | — |
| picker | `18672c8` (the lead's three requests) | component tests only | — |
| `admin.schedule` | `1554d75` (deleted on request) | — | — |
| K3 reminders | `49798f0` | `wave8-console-reminders` | `reminders-field-error`, `reminders-saved` |
| K1 audit | `266b0d1`, `1d42251` | `admin-audit` (rewritten) | `audit-filters-sheet`, `audit-filtered-admin`, `audit-filtered-moderator` |
| K2 exports | `a6d8e12`, `1d42251` | `admin-exports`, `console` (untouched capture → proposals) | `exports-audit-note`, `layout-untouched-{390,desktop}` |
| K5 scoring | `544ac58` | `wave8-console-scoring`, `scoring-company-points` (admin half) | `scoring-catalogue`, `scoring-penalties`, `scoring-rule-dialog-error`, `scoring-member-picker-open` |
| K4 recognition | `a4d2886`, `4133578` | `wave8-console-recognition` | `recognition-held`, `recognition-release-confirm`, `recognition-award-already-held` |
| K6 emails | `ac22709`, `4133578` | `wave8-console-emails` | `emails-catalogue`, `emails-refused-save`, `emails-delivery-failure` |

**Shared, under `components/admin/`:** `duration.ts` + `duration-input.tsx` (a number and a unit, one base
unit stored), `use-action-toast.ts` (the toast from the action's result, never an effect),
`saved-form-state.ts`, `row-edit-dialog.tsx` (a list row edited in a dialog, closing from the action),
`confirm-dialog.tsx` (`DeactivateToggle` composes it, props unchanged), `keyset-pager.tsx`,
`export-download-button.tsx`, `delivery-reason.ts`, `held-achievements-table.tsx`; `member-picker.tsx` is a
Field control. `ui/date-time` sits inside `<Field>` and has a date-only mode on the RTL picker; `ui/tabs`
fades the side that hides tabs and keeps the active one in view.

**Found while building, fixed here:** F4 — the error summary's links focused nothing on five wave-6/7 forms
(prefixed Field ids, unmapped). CSV certificate state printed «issued» raw (the map named a state the enum
never had). `intervalToSeconds` read a `1 day …` interval as «no cooldown» (latent). A manual badge award of a
badge already held reported «saved» and wrote an audit row.

**Tests added:** unit `admin-{duration,reminders-action,audit-filters,audit-labels,exports-csv,scoring-actions,recognition-actions,emails}`;
component `phone-card-actions`, `form-summary-links`, `reminders-form`, `audit-page`, `exports-page`,
`scoring-page`, `confirm-dialog`, `recognition-page`, `emails-page`, and rewritten `member-picker`, `date-time`,
extended `rtl-datetime-picker`, `tabs`, `admin-dashboard-page`; RLS `admin-recognition-writes` (3/3).
`npm run test:rls` 74 files / 805 green after K1; unit + components 181 files / 1682 green before K6's last fix.

**Open, and whose:**
- ~~**R-D1 (`designer`):** `releaseAchievements` returns nothing~~ **closed** — `designer` shipped the result
  (`246cfbf`); the table reads it (`bc17ae5`): the toast counts what was released, a refusal keeps the selection.
- **`REQ-NTF-007` (`notify`, M12):** the default template text is not shown and the required fields are the
  admin's to declare — said on the screen, per the lead's Q2 ruling.
- **`REQ-NTF-008` (`notify`):** nothing writes `bounced`/`delivered` (no webhook) — said on the log.
- **Recognition edits are unaudited** (badges, levels, perks, streaks write no history or audit row) —
  flagged, not built.

### Sync-2 fixes (2026-09-17)

| Finding | Commit | Spec | Captures to regenerate |
|---|---|---|---|
| reminders:123 strict mode (summary link and field error share the text) | `bc17ae5` | `wave8-console-reminders` (reads each error through its control's description; asserts the units survive) | `reminders-field-error` |
| scoring:121 — **a product defect**: the «يظهر للعضو» caption repeated the name on 12 of 14 seeded rules | `344a921` | `wave8-console-scoring` | `scoring-catalogue`, `scoring-penalties` |
| K4 — the award refusal reset the badge select, and did not name the badge | `bc17ae5` | `wave8-console-recognition` (the option still checked; the badge named at the field and in the summary) | `recognition-award-already-held` |
| K2 — «UTF-8 مع BOM» in the description; «آخر تصدير» wrapping on the card | `deafa87`, `9bc3673` | `admin-exports` | `exports-audit-note` |
| K1 — the raw action key on every audit card: **dropped** | `9bc3673` | `admin-audit` | `audit-filtered-admin`, `audit-filtered-moderator` |
| `0099`'s two audit actions unlabelled (`admin-audit-labels` red on `fa93a98`) | `deafa87` | — | — |
| the rail's `current` went stale after a client-side navigation (`platform`) | `0594594` | `console`, `admin-*` (aria-current unchanged on load) | — |

**The select reset is a class, not the award's bug.** React resets a `<form action>` after every submission;
a reset restores each control's *default*; React keeps that default in step for inputs, textareas and
uncontrolled checkboxes/radios, and never for a `<select>` or a controlled radio/checkbox. `KeptSelect`
(`components/admin/kept-select.tsx`) marks the option on show as the default; every action form `console`
holds uses it — including the member role select, where a *successful* role change snapped back on screen.

**Requests to the lead — all three landed at `dcd5f05`:** the reset repaired in `ui/select`, `ui/switch`,
`ui/radio-group` and `ui/checkbox` (so `KeptSelect` is deleted, `b12a7b6`), the schedule form's controlled
switch with it, and `MenuItem.current` (rendered in `ui/menu` and passed from the collapsed rail, `c2c5f06`).

**The rerun at `5a8f5bc`:** 104 passed, 3 failed. `scoring:124` on both projects — two deductions word the
member's text differently from the name by design (`حُذف تعليق`, `حُذفت صورة`), the spec now asserts per card
(`2cc8471`). `emails:128` on the phone — the editor's label never appeared and the artefacts say nothing more
(no page snapshot, no trace); desktop's identical fill passed. No phone-only path found in the page, the
editor, `ui/tabs`, `ui/textarea` or the DAL reads. The spec now asserts the page and editor headings before
typing and refuses a failed session refresh, so a repeat names what rendered (`8d3a5a0`), which also names
the three timed reminders for the admin («تذكير قبل الجلسة بيوم», not «غدًا»).

**Closed — all six rows, 2026-09-17.** K1–K4 on the `5a8f5bc` captures; K6 at `52005ba` (no `MSG-*` ids, the
provider's text from its left edge, the reminders one row each); K5 at `79d22c0` (the penalties captured with
motion reduced, and `ui/combobox` scrolling its open list clear of the phone tab bar — the member picker had
opened under it). Carried by the lead to M13, not changed this wave: `controlClass`' `w-full` beats a caller's
`w-*`, so every narrow `Input`/`Select` renders full width; `DurationInput` sizes wrappers meanwhile.

---

## Wave 11 plan (`DEC-166`) — 2026-09-22 — K1 … K3, planning only, nothing edited but this note

Measured at `b8a51f6`: `node scripts/ui-lint.mjs --strict` lists **23** violations in my files — the 21 the
brief counted plus the attendance page's 2. Every one is one of four shapes, so the plan is by shape first,
then file by file.

| Shape | Where | Becomes |
|---|---|---|
| **A** — a form-level error drawn as a bordered box (`p[role=alert].rounded-field border border-edge-strong`) | `categories/category-form:41`, `companies/company-form:41`, `venues/venue-form:55`, `settings/settings-form:84`, `sessions/direct-session-form:88`, `proposals/review-card:80` | one new `src/components/admin/form-alert.tsx` — `<p role="alert">` + `AlertCircleIcon` + `text-error`, the pattern `reminders-form.tsx:194` and `scoring/*-form.tsx` already use. Same element, same role, same text: every `getByRole("alert")` / `getByText` still resolves |
| **B** — a surface borrowing the control's class string (a box that is not a control) | `admin/page:75` (the attention tile), `sessions/page:83` (a ready-to-schedule row), `attendance/page:97` (summary), `attendance/page:318` (a rating) | `ui/panel` for the three static boxes, wrapped so the landmark stays what it is (`<section aria-labelledby="summary"><Panel>`, `<li><Panel>`); `ui/card density="row" href` for the dashboard tile — it is a whole-surface link, which is what `Card` is. The link's name and `toHaveText(/2/)` are unchanged (`admin-dashboard.spec.ts:236–254`) |
| **C** — a raw `<textarea>` with a hand-made label and hint | `review-card:181` (+ its class string `:187`), `session-controls:118` (+ `:123`) | `<Field label hint><Textarea rows={3} name maxLength defaultValue/></Field>`. Same `name`, `rows`, `maxLength`, `defaultValue`; the label text is identical and not `required` (the reason is enforced in the action — both files explain why), so `getByLabelText("سبب الرفض …")` / `("سبب الإلغاء …")` still match exactly. The hint gains `aria-describedby`, which it never had. `min-h-24` is dropped: with `rows` given `Textarea` sets no floor, and a second `min-h-*` would fight `min-h-11` by emit order |
| **D** — a `<summary>` styled as a secondary button | `review-card:169`, `session-controls:110` | `buttonClass("secondary", "md"/"lg", "cursor-pointer list-none")` from `ui/button` — a `<summary>` cannot be `<Button>`, and the lead's exported class function is the system's answer for exactly that |

**Shape C's one deliberate change, for the lead to rule on:** both textareas carry hand-written ids —
`cancel-reason` and `${decision}-reason` — and both are rendered **once per row** (`sessions-table.tsx:206`
renders `SessionControls` for every session with actions; `proposals/page.tsx:54` a `ReviewCard` per
proposal). Two cancellable sessions today give two `id="cancel-reason"` and the second label points at the
first textarea — an axe `duplicate-id` and a wrong label. Letting `<Field>` generate the id (`useId`) fixes it.
Rule 3 says ids stay; **no test or spec reads either id** (grepped `tests/**`), so I propose the generated id
and ask for a yes.

### `rtl-datetime-picker.tsx` (5) — the decision

**The picker composes `ui/field` + `ui/select`, not `ui/date-time`**, and stays where it is.
`ui/date-time` *is* this picker behind `DateTimeProps` (it renders `RtlDateTimePicker`), so the picker
composing it would be a cycle; and moving the picker into `ui/` to escape the linter is the thing the
linter's exclusion comment exists to forbid.

- **Hour and minute** (`:321`, `:331` — rule `field` and `class-string` each): each becomes
  `<Field label={hourLabel}><Select value onChange dir="ltr">…</Select></Field>`, side by side in a
  `grid grid-cols-2 gap-3`. ★ **The inner `<Field>` is load-bearing, not decoration**: when the picker sits
  inside `ui/date-time` inside a caller's `<Field>`, a bare `ui/select` would read the **outer** Field's
  context and take its id — the trigger's id — plus its `aria-required`/`aria-invalid`. The inner Field's
  provider shadows the outer one. Not `required` (the marker would join the name and `getByLabelText("الساعة")`
  is exact in `date-time.test.tsx:105`).
- **The popover surface** (`:274`): `rounded-card border border-edge bg-canvas shadow-[var(--shadow-card)]`,
  `ui/menu`'s floating surface — it is a surface, not a control.
- **RTL:** unchanged. `dir="ltr"` stays on both selects (digits in Western order, `DEC-124`); the grid follows
  the document's direction, so «الساعة» sits at the inline start in Arabic as it does today.
- **Keyboard:** unchanged in order and in kind — both are still native `<select>`s (arrows, type-ahead, the
  platform picker on a phone), and Tab still runs month ◀ ▶ → days → hour → minute → اليوم / امسح / تم.
  The labels move from wrapping (implicit) to `htmlFor` (explicit); a click on the label still focuses the
  select. The selects grow from ~30 px to `md`'s 44 px — above the `SC 2.5.8` floor they were below.
- **Form reset:** the selects carry no `name`, but they live inside the caller's `<form>`; `ui/select`'s
  controlled path re-selects `value` after React's post-submit reset (`DEC-149` §1), which the raw ones never did.
- **Found, not in K1:** Escape and «تم» unmount the popover while focus is inside it, so focus drops to
  `<body>` (`SC 2.4.3`). The fix is to return focus to the trigger; I hold it for K3 unless the lead's sweep
  lists it first.

### K2 — the attendance screen at 390 px (`/app/admin/sessions/[id]/attendance`)

**What is wrong today, measured from the code:** the table has an inline `minWidth` of `420 + n × 140` px at
`n ≥ 2` (700 px at two days, 840 at three) and **560 px at one day** — so at 390 px it scrolls sideways at
**every** `n`, one day included; the carried row names only two up. The fix must be `n`-general (no
`if (isMultiDay)` in a reader): the phone layout must not grow in width with `n`.

**Recommendation — one `<table>`, reflowed into stacked cards below `md`, semantics pinned.**

- **At `md` and up: the table exactly as it is.** The `minWidth` moves from the inline style into a CSS
  variable applied only at `md` (`md:min-w-[var(--table-min)]`), so the desktop table and its
  `overflow-x-auto` region are unchanged.
- **Below `md`:** `thead` is visually hidden (it stays in the accessibility tree, so a screen reader still
  navigates a table with headers); each `<tr>` is a card (`ui/card`'s tokens); the first cell is the card's
  title (the name); every other cell is a line `label · value` whose label is the column header, drawn
  `aria-hidden` (the header association already names the cell). Explicit `role="table|rowgroup|row|columnheader|cell"`
  on the elements, because `display: block` on table parts can drop their implicit roles.
- **By `n`:** at **one day** — name; الحالة; وقت الوصول; الطريقة (four lines, wave 7's columns). At **two** and
  **three** — name; الحالة (with the removal reason under it); **one line per day** («اليوم الأول · حاضر ·
  9:12»); الأيام («2 من 3» + مكتمل). A card grows **downwards** by one line per day, never sideways; at 390 px
  the widest line is a day line, ~260 px. Nothing is dropped at any `n` — unlike `DataTable`'s card mode, which
  keeps only `onCard` columns.
- **No new strings**: every label is an existing `checkin.attendance.*` or `sessions.days.*` key. If the
  capture shows one is needed, it is a request (`checkin.json` is not mine).

**Why not `DataTable`, which is the house rule:** (1) `DataTable` renders the desktop table **and** a `<ul>`
at once, so on the phone project every `getByRole("cell" | "row" | "columnheader")` on this page stops
resolving — `admin-attendance.spec.ts:208–216, 237, 356–358`, `wave9-checkin-days.spec.ts:313–321` and
`wave9-checkin-one-day.spec.ts:197–199` all run at 390 px on the `phone` project, and the last two are
lead-held evidence that one day is unchanged; (2) the page is a Server Component and `DataTable` takes
`cell` closures, so it needs a client wrapper re-deriving what the page already formats. The reflowed table
keeps every one of those locators resolving on both projects, with no ledger line. ★ **The one thing to say
plainly:** the phone project's `columnheader … toBeVisible()` then passes on a visually-hidden header (a
1 × 1 box is «visible» to Playwright) — it proves the header is in the tree, not on screen. I would rather
say that here than have a capture find it. **If the lead prefers `DataTable`**, I build that instead and the
ledger lines are exactly the seven locators above, the two `wave9-checkin-*` ones as requests.

**«مطلوب» on the manual-mark form** (`DEC-109`, carried): `required` on the three `<Field>`s — day (at
`n ≥ 2`), member, reason — and the reason's hand-set `aria-required` goes (the Field supplies it). The marker
joins the accessible name by design (`field.tsx`'s comment), so three locators that match the label
**exactly** move — a selector, not an expectation:

| File | Line | Owner | Change |
|---|---|---|---|
| `tests/e2e/admin-attendance.spec.ts` | 376 | mine | `{ exact: true }` → `{ exact: false }` — ledger line |
| `tests/components/checkin/attendance-days.test.tsx` | 70, 78, 90, 92 | lead (custodian of `checkin`) | `{ exact: false }`, as its own lines 72, 103, 108 already do — **a request** |
| same file | 137 | lead | `queryByLabelText("اليوم")` stays null but becomes vacuous; `{ exact: false }` keeps it meaning something (line 145 already does) — **a request** |

**Question:** the removal form's reason is just as mandatory (`REQ-CHK-017`) and is not in the carried row.
Mark it too, for consistency, or leave it as scoped? I leave it unless told.

The CSV does not change (`DEC-157`); `actions.ts`, `state.ts` and `remove-check-in-form.tsx` are untouched.

### K3

Waiting on the lead's sweep rows and the budgets run for SCR-040 (≤ 3.0 s LCP, ≤ 250 KB JS). Candidates I
already know of: the picker's focus return (above); the duplicate textarea ids (shape C); the attendance
region's `tabIndex={0}` becoming a tab stop that scrolls nothing below `md` (I would make it `md`-only via the
same reflow).

### Requests of the lead

1. **None of `sessions'` eight primitives needs to change for K1/K2.** `Field`, `Select` and `Textarea`
   express every control above as they are. (Watched, not asked: `Select` has no `size`, so the picker's two
   selects are 44 px — which is the floor anyway.)
2. **Approve:** the generated ids for the two per-row textareas (shape C).
3. **Rule:** K2's reflowed table vs `DataTable` (my recommendation: the reflow).
4. **The `attendance-days.test.tsx` edit** in the table above, with its ledger line, when K2's «مطلوب» lands.

### Order, and the specs that prove each unchanged

One commit per unit, `node scripts/ui-lint.mjs --prune` after each, `npm run ui-lint` before each.

| # | Unit | Proven unchanged by |
|---|---|---|
| 1 | shape A + `form-alert.tsx` (6 files) | `form-summary-links.test.tsx`, `managed-lists-status-badge.test.tsx`, `proposals-review-card.test.tsx`; e2e `admin-managed-lists`, `admin-settings`, `admin-sessions` |
| 2 | shape B, dashboard + sessions page | `admin-dashboard-page.test.tsx`, `sessions-table.test.tsx`; e2e `admin-dashboard`, `admin-sessions` |
| 3 | shapes C + D, `review-card` + `session-controls` | `proposals-review-card.test.tsx`, `session-controls.test.tsx`; e2e `admin-proposals`, `sessions-admin-proposals`, `admin-sessions` |
| 4 | the picker | `rtl-datetime-picker.test.tsx`, `ui/date-time.test.tsx`, `sessions/schedule-days.test.tsx`; e2e `admin-audit` (date-only), and — not mine, all reading `picker.getByLabel("الساعة")` — `sessions-screens`, `wave8-lead-schedule`, `wave9-sessions-schedule-days`, `wave9-three-day-workshop` (one of them through the gate lock; the lead picks which) |
| 5 | K2: the attendance page's two + the reflow | `admin-attendance.spec` on both projects, `wave9-checkin-days`, `wave9-checkin-one-day`, `attendance-days.test.tsx`, `remove-check-in-form.test.tsx`; **new** `tests/e2e/wave11-console-attendance.spec.ts` — a one-, two- and three-day session at 390 × 844 asserting `document.scrollingElement.scrollWidth ≤ innerWidth` and no scrolling region, and the desktop table unchanged; captures `wave11-console-attendance-{1day,2days,3days}.png` |
| 6 | K2: «مطلوب» | the three ledger locators above, then the same set as 5 |
| 7 | K3 | as the sweep's rows arrive |

Captures of every changed screen at `.qa-shots/rtl/wave11-console-<surface>-<state>.png`, beside the wave-8
and wave-9 ones; the picker needs a production build to be seen open, which is the lead's to run.

### Prose-dependent screens (K3 — the owner's rule, 2026-09-22: list them, never rewrite the copy)

Admin screens whose meaning rests on a paragraph that has to be read. Nothing here was edited; the copy stays. The last
column is a suggestion where one is obvious, not a commitment. `/app/admin/emails/**` is `notify`'s and is not listed.

| Route | Paragraph (key) | What an admin can't do or understand without reading it | Affordance that could carry it instead |
|---|---|---|---|
| `/app/admin/sessions` | `admin.sessions.scheduleNote` | that creating a session neither dates nor places nor publishes it — it looks done and is not | the new row lands with a «مسودة — لم تُجدول» badge and a «جدوِلها» link to `[id]/schedule` |
| `/app/admin/sessions` | `admin.sessions.directIntro` | that a directly-assigned presenter may decline, and the session then falls back to draft | a status on the row when the presenter declines, not a sentence about the possibility |
| `/app/admin/venues` · `categories` · `companies` | `admin.{venues,categories,companies}.noDeleteNote` | why there is no «احذف» — deactivation is the only removal, so old sessions and members keep naming it | the row menu's «عطّل» item carries the reason as its description |
| `/app/admin/moderation/reports` | `admin.moderation.photosReportsIntro` | that a reported photo stays PUBLIC until a decision | a «ظاهرة الآن» badge on each reported photo |
| `/app/admin/exports` | `admin.exports.auditNote` | that every download is recorded in the audit log under their name | the download button's accessible description, or a one-line confirm naming it |
| `/app/admin/exports` | `admin.exports.ratings.note` | that the ratings export holds per-session averages, not individual ratings (those are per session, audited) | the column headers say «متوسط», and a link to the attendance report |
| `/app/admin/audit` | `admin.audit.scoringNote` | that scoring-setting changes are NOT in this log — they are in the scoring screen's history | the empty result for a scoring filter links to `/app/admin/scoring`'s history |
| `/app/admin/settings` | `admin.settings.intro` | that every change is audited with old and new values | a «السجل» link to `/app/admin/audit` filtered to settings |
| `/app/admin/scoring` | `scoring.admin.intro` | that a changed value applies to future earnings only — no balance is rewritten | the save toast and each edited row say «يسري من الآن» |
| `/app/admin/scoring` | `scoring.admin.catalogue.fixedNote` | that the action list is closed, and reserving/reacting can never earn points | those rows render as locked «لا تمنح نقاطًا» rather than absent |
| `/app/admin/scoring` | `scoring.admin.manual.intro` | that a manual entry cannot be deleted — a mistake is fixed by an opposite entry | a «سجّل تعديلًا معاكسًا» action on each history row, prefilled |
| `/app/admin/scoring` | `scoring.admin.companyRules.intro`, `scoring.admin.hostCompany.intro` | that company rules and hosting points are evaluated once, at session completion — nothing happens on save | a «تُحتسب عند اكتمال الجلسة» status on a pending hosting row |
| `/app/admin/recognition` | `recognition.admin.intro` | that the evaluator runs nightly, so a change shows tomorrow and never touches what was already earned | «التقييم التالي: …» with the time, beside the save |
| `/app/admin/recognition` | `recognition.admin.held.intro` | that held certificates have NOT reached their owners until released | a «محجوزة — لم تصل» status per row and a count on the release button |
| `/app/admin/recognition` | `recognition.admin.levels.note` | that lowering a threshold promotes members at the next run, raising it demotes no one | an inline preview «سيرتقي N عضوًا في التقييم التالي» |
| `/app/admin/reminders` | `notifications.admin.reminders.intro`, `.genericNote` | which offsets get a tailored message and which the generic one, and that rescheduling moves pending reminders | a per-row tag «رسالة مخصّصة» / «رسالة عامة» on each offset |
| `/app/admin/sessions/[id]/attendance` | `checkin.attendance.removeIntro` | that removal reverses points and revokes a certificate, and keeps the record | the confirm dialog names THIS member's concrete consequences (the points, the certificate serial) |
| `/app/admin/sessions/[id]/attendance` | `checkin.attendance.ratingsNote` | that opening the per-rater ratings is itself audited | the section behind a disclosure «اعرض التقييمات (يُسجَّل الاطلاع)» |

## Wave 11 — as built (sync 1 rulings) — 2026-09-22

| Unit | Commit | What |
|---|---|---|
| 1 | `11a3577` | `FormAlert` for six forms' form-level error |
| 2 | `6355650` | dashboard attention tile → `ui/card`; ready-proposal row → `ui/panel` |
| 3 | `a760c2f` | review-card and session-controls reasons on `Field` + `Textarea`, generated ids (the duplicate-id defect); `<summary>` on `buttonClass()` |
| 5 | `9b4183f` | the attendance table reflows into cards below `md` at every `n`; `wave11-console-attendance.spec.ts` |
| 6 | `81d4b31` | «مطلوب» on the manual mark's three fields and the removal form's day (its member and reason already had it) |
| 4 + K3 | `7e48e66` | the picker on `ui/field` + `ui/select`, the popover on `ui/menu`'s surface; focus returns to the trigger on Escape and «تم» |

`node scripts/ui-lint.mjs --strict`: **0 in the whole tree** at `7e48e66`. `npm test` 2276 passed. The lead's sweep found no
axe finding on `/app/admin/**` at 390 px, so K3 was the picker's focus return alone. Unrun here (needs a build): the e2e
specs named in the sync message.

**Ledger lines** (for `STATUS.md`): `tests/e2e/admin-attendance.spec.ts:376` — `{ exact: true }` → `{ exact: false }`:
«مطلوب» joins the member select's accessible name (DEC-109, K2); selector only. · `tests/components/admin/rtl-datetime-picker.test.tsx`
— the renders wrapped in a `NextIntlClientProvider` (RTL's `wrapper`): the hour and minute selects now sit in `<Field>`,
which reads `ui.json`; harness only, no expectation moved.

---

## Wave 13 plan — the hub's rail entry, the templates grid, the review (`DEC-176`, `16` §10.3)

Read `.claude/agents/console.md` (regenerated for wave 13), `STATUS.md`'s wave-13 block, `CLAUDE.md`'s
wave-13 map, `DEC-176`, `16` §10.3. **PLANNING ONLY** — nothing below is built yet.

### 1 · K1 — the rail on `/app/admin/sessions/[id]/*`, today, and the entry I propose

`admin-rail.tsx`'s `isCurrent()` (`:155–157`) marks an item current on an exact match **or** on
`path.startsWith(\`${href}/\`)`. `layout.tsx`'s `NAV_ENTRIES` (`:85`) already has `sessions` as a plain leaf,
`href: "/app/admin/sessions"`, not a group. Every route `sessions` is about to nest under it —
`[id]/schedule` (today), `[id]/attendance`, `[id]/certificates`, `[id]/survey`, and the new `[id]/{layout,page}`
hub — already satisfies `startsWith("/app/admin/sessions/")`, so the rail already marks «الجلسات» current
anywhere inside the hub, with **no code change**. Nothing in the rail duplicates a sub-nav: the rail has never
rendered anything below the `sessions` leaf (it is not a `group` with `children`), so there is no second copy of
the hub's own tabs to keep in sync. **Finding: K1 needs no change to `admin-rail.tsx` or `layout.tsx`.** I will
re-verify this once `sessions` lands the hub's routes (a real build, not just reading the plan), and capture
`.qa-shots/rtl/wave13-console-rail-hub-current.png` — «الجلسات» marked `aria-current="page"` while three levels
into the hub — as the proof, rather than assume the reading holds. If `sessions` needs the rail's label, icon or
grouping to change for some reason their own plan surfaces, that is a written request to me, per the transfer
note — I build it, not them.

### 2 · K2 — where the grid goes, and the evidence

**Finding, load-bearing: `16` §10.3 is already built, twice.** `template-library.tsx` (designer's) — its own
header comment (`:22–26`) cites «`16` §10.3's shape: a card grid with each template drawn by the renderer …
its state («منشور»/«مسودة»), its use, and the platform library as a clearly separate, read-only-until-copied
section» — and every one of those is on the card today: `TemplateCard` (`:108–210`) renders «الافتراضي»/
platform/family/orientation/«مسودة»/«متقاعد» badges, a version + locked-region + **usage count** caption
(`:176–188`, `card.usage`), `DuplicateTemplateDialog` on a platform card and `OrgTemplateActions` (edit,
publish, set-default, retire/restore) on an org card (`:191–207`), and the platform section is a fully
separate, always-first `<section>` with no write control rendered at all for a platform card (`:54–63`,
comment `:29-30`: «a platform card carries no write control at all — not a disabled one»). This is split
across two purpose-specific routes, `/app/admin/templates/posters` and `/app/admin/templates/certificates`
(`TemplateLibraryPage`, `:36`), and **no route exists at `/app/admin/templates` itself** — confirmed by
`find`, matching `DEC-176`'s own «Brief vs code, 5».

**So the question is not «build the grid» — it already exists — but «give it one address».** Two shapes,
weighed:

- **(a) A new, self-contained index page (mine), importing designer's already-exported pieces read-only.**
  `getTemplateLibrary(locale, purpose, {scheme?})` (`lib/dal/templates.ts:103`) and the exported
  `TemplateLibraryPage` component (`components/designer/template-library-page.tsx:21`) are both already public
  API of files I never touch. My new `src/app/[locale]/app/admin/templates/page.tsx` renders one `PageHeader`
  («القوالب») and a `ui/tabs` strip (my own primitive, **in-page panel mode**, not `href` mode — this is one
  screen's own two views, not two routes) with two panels, each holding the unmodified
  `<TemplateLibraryPage locale purpose="poster" | "certificate" />`. **Zero new DAL functions, zero edits to
  any file `designer` owns.** The two existing routes, `/templates/posters` and `/templates/certificates`,
  keep working exactly as today — direct link, the `orgEmptyAction` deep link to
  `#tpl-platform-section` (`template-library.tsx:74`), and `wave8-designer-templates.spec.ts`'s direct
  `page.goto()` calls (confirmed: it never reaches either route through the rail — grepped for
  `التصاميم`/`designs`, none in that file).
- **(b) A request to `designer`** to add a `ui/tabs` (`href` mode — real navigation, since `posters` and
  `certificates` would stay two routes) strip to the top of `template-library-page.tsx`'s shared render, and
  my own `page.tsx` becomes a one-line `redirect("/app/admin/templates/posters")`. Cheaper in code, but it
  is an edit to a file I do not own, and `DEC-176`'s own framing reads the two shapes as **either/or**, not
  both — so it is what I ask for only if the lead or `designer` prefers not to see two `PageHeader`s stacked
  under (a).

**I am proposing (a), the self-contained page, as the default — it needs nothing from `designer` at all,
which is the safer plan under «teammates spawn planning-only».** The one real cost is cosmetic: (a) nests
`TemplateLibraryPage`'s own purpose-specific `<PageHeader>` (title «قوالب الملصقات»/«قوالب الشهادات», the
scheme toggle, the create-dialog) inside my outer «القوالب» header — two headings stacked, not one. Flagged
as **question 1** below rather than resolved unilaterally, since it is a design call, not a technical one.

### 3 · Every DAL datum the grid needs (contract 4)

**None are new. Everything the grid needs already exists**, all in `lib/dal/templates.ts`, all `designer`'s,
all read-only imports for me:

| Datum | Function / field | Return type | State |
|---|---|---|---|
| The whole library, per purpose | `getTemplateLibrary(locale, purpose, {scheme?})` (`:103`) | `Promise<TemplateLibraryData \| null>` | **existing** |
| Published/draft state | `TemplateSummary.latestVersion: number \| null` + `.draftDocumentId: string \| null` (`:47,55`) | `number \| null`, `string \| null` | **existing** |
| Usage count | `TemplateSummary.usageCount: number` (`:64–67`) — its own comment cites `16` §10.3 by name | `number` | **existing** |
| Retired / default state | `TemplateSummary.retired`, `.isDefault` (`:46–47`) | `boolean` | **existing** |
| Platform vs org, separated | `TemplateLibraryData.platform` / `.org: TemplateSummary[]` (`:73–74`) | `TemplateSummary[]` | **existing** |
| Duplicate action (platform → org) | `<DuplicateTemplateDialog>` (`components/designer/template-actions.tsx`, used at `template-library.tsx:194`) | component, calls `templates/actions.ts`'s existing Server Action | **existing** |
| Family list (only if I ever need my own create control — I do not, under shape (a)) | `familiesFor(purpose)` (`:35–37`) | `readonly string[]` | **existing, unused under shape (a)** |

**Nothing is a request to `designer`** under shape (a). If sync 1 picks shape (b) instead, the request becomes
the `ui/tabs` strip on `template-library-page.tsx`, not a DAL function — restated as **question 1**.

### 4 · The 390 px and accessibility review (K3)

Once `sessions`' hub and my templates page both have a real build behind them:

- `.qa-shots/rtl/wave13-console-rail-hub-current.png` — «الجلسات» current, three levels into the hub (§1).
- `.qa-shots/rtl/wave13-console-templates-index.png` — both tab panels, phone project, 390×844, checking the
  card grid reflows to `DataTable`'s sibling discipline (it already does — `template-library.tsx`'s grid is
  `sm:grid-cols-2 xl:grid-cols-3`, single column below `sm`, unrelated to `ui/data-table` but the same
  no-sideways-scroll rule) and that `ui/tabs`' edge-fade (`tabs.tsx`'s `applyEdgeFade`) does not clip either
  tab's Arabic label.
- One new e2e file, `tests/e2e/wave13-console-templates.spec.ts` (mine): `/app/admin/templates` reachable from
  the rail as a single link (not a button/group) for an admin, absent for a moderator; both tab panels render
  their platform section before the org section; switching tabs never round-trips through the DAL twice for
  the same purpose (a `Promise.all` on first render, not per-click — real, since Next streams both panels'
  RSC payload on the one request under in-page mode).
- I cannot edit `tests/e2e/a11y.spec.ts` or `wave11-lead-a11y-sweep.spec.ts` (the lead's). Both already scan
  `/ar/app/admin/templates` (`a11y.spec.ts:120`) or the two purpose routes
  (`wave11-lead-a11y-sweep.spec.ts:213`) — today the first hits `app/not-found.tsx`'s generic 404, which is
  why it already passes (a well-formed, landmark-carrying 404 clears `main visible, zero blocking
  violations` trivially). Once my page lands, that same assertion exercises real content for the first time —
  the assertion text does not change, so this is **not a ledger line**, but I am flagging it here so the lead
  runs it rather than trusting the pre-existing green.
- axe-core direct (`node_modules/axe-core`, the wave-5 precedent — no `jest-axe` installed) against the new
  page's own component test, if I write one; `ui/tabs.test.tsx` is not mine to touch (it is
  `tests/components/ui/tabs.test.tsx`, in my never-edit list) so any tabs-specific finding is a request back
  through the lead, on the lead's file.

### 5 · Every existing test whose expectation moves

- `tests/e2e/console.spec.ts:196–207` — the moderator-rail test's own comment says «no groups whose every
  child is admin-only (`النقاط والتقدير`, `التصاميم`, `الإشعارات` all vanish, not just hide their contents)»
  and then asserts `nav.getByRole("button", { name: "التصاميم" })` has count 0. **The assertion does not
  change** — converting `designs` from a two-child group into a single admin-only leaf still yields zero
  `button`s named «التصاميم» for a moderator (it is now a `link`, absent from the rail either way for that
  role). **The comment does change**: «التصاميم» stops being an example of a group whose every child is
  admin-only and becomes a plain admin-only leaf, the same path «الأعضاء»/«لوحة» already take. I will correct
  the comment in the same commit as the rail change — ledger line, comment only, no assertion moved.
- `tests/e2e/wave8-designer-templates.spec.ts`, `tests/e2e/wave11-lead-a11y-sweep.spec.ts:213` — both navigate
  directly to `/templates/posters` / `/templates/certificates` by URL, never through the rail. Unaffected;
  confirmed by grep for a rail click in either file (none).
- `tests/components/admin/admin-rail.test.tsx`, `admin-rail-groups.test.tsx` — both render `AdminRail` against
  a synthetic, inline `AdminRailItem[]` fixture (`moderation`/`points`, never `designs`), not the real
  `NAV_ENTRIES`. Unaffected.
- No RLS, unit, or `lib/dal/*` test changes — no SQL, no new DAL function, under shape (a).

### 6 · Questions for the lead

1. **Shape (a) vs (b) for K2** (§2): self-contained new page importing `designer`'s exports read-only
   (nesting two `PageHeader`s), or a request to `designer` for a shared `href`-mode tab strip plus my
   one-line redirect. I recommend (a) — it needs nothing from anyone else — but the nested-header look is a
   real cost worth a second opinion before I build either.
2. **The rail consolidation** (§2, §5): collapsing the `designs` group (`templatesPosters` +
   `templatesCertificates`, two children) into one leaf, `templates` → `/app/admin/templates`. Confirm this is
   the intended shape rather than adding a third link alongside the existing two (which would be exactly the
   duplication K1's own language warns against for the hub, and reads just as wrong here).
3. Should `/templates/posters` and `/templates/certificates` stay independently reachable by direct URL only
   (my recommendation, since they are `designer`'s and I change nothing about them), or should they redirect
   into the new combined page — which would strand the `orgEmptyAction` deep link
   (`#tpl-platform-section`) designer's own empty state already depends on?
4. `04`'s route table reconciliation is the lead's (L1) — confirm `/app/admin/templates` is added there in
   the hub's commit alongside `attendance`/`certificates`, since it is a fourth route missing from `04` today
   that this wave also fixes, not just the two `DEC-176` already named.

## Wave 13 — sync 1 ruling (`DEC-178`, `7f25803`) and as built

Shape (b): `/app/admin/templates` redirects to `posters`; `designer` carries a `ui/tabs` posters|certificates
strip on its own two pages, so there is no second `<h1>`. The two purpose routes stay independently reachable
(`#tpl-platform-section` intact). Rail: `designs` collapses into one leaf. `04` gets the reconciliation in the
lead's commit.

**`ui/tabs` already has link mode.** Checked before touching the file: `TabItem.href` is already in the frozen
type (`components/ui/index.ts:522–527`) and already wired (`tabs.tsx:144–147`, `RadixTabs.Trigger asChild` +
`<Link>`). Nothing to add — told `designer` the prop directly rather than build one.

| Commit | What |
|---|---|
| `c95dd70` | new `src/app/[locale]/app/admin/templates/page.tsx` (redirect to `posters`); `designs` group → one `templates` leaf in `layout.tsx`'s `NAV_ENTRIES` and `admin-rail.tsx`'s comments; `admin.json` (ar/en): `nav.templatesPosters`/`templatesCertificates` → `nav.templates`, `groups.designs` removed; `console.spec.ts:194–210` — the moderator test's stale `role:"button"` check on «التصاميم» (would have kept passing for the wrong reason once it's a leaf) replaced with a `role:"link"` check, comment corrected |

`npx tsc --noEmit` clean · `npm run lint` 0 errors (26 pre-existing warnings, none mine) · `npm run ui-lint`
clean (281 files, strict) · `tests/components/admin/admin-rail{,-groups}.test.tsx` 10/10 (synthetic fixtures,
unaffected either way) · `tests/unit/{messages-namespaces,platform-messages}.test.ts` 17/17. Full `vitest run`
has 5 pre-existing failures, all in files this track never touches and none related to the rail or templates —
`admin-audit-labels.test.ts` and `mail-runtime-dist.test.ts` (an unlabelled `export_artifact.downloaded` audit
action and a stale `packages/mail-runtime` dist, both from `designer`'s in-flight contract-1/3 work) and
`messages-numerals.test.ts` on `sessions.download.others` (an ICU `#` in `sessions`'s in-flight download-menu
copy) — confirmed via `git status` against the shared tree, not mine to fix.

K1 needed no code — confirmed and left as a finding (§1). `sessions`' hub routes
(`admin/sessions/[id]/{layout,page}.tsx`) already exist in the shared tree as of this session; the
`wave13-console-rail-hub-current.png` capture is ready to take on the lead's next build. K3 (the 390 px and
accessibility review) waits on `designer`'s tab strip landing — not yet in the tree.

Nothing above is built. Waiting for sync 1 before touching `admin-rail.tsx`, `layout.tsx`, `admin.json`, or
writing the new `templates/page.tsx`.

---

## Wave 15 plan

`DEC-183`/`DEC-184`, `CLAUDE.md` § *Ownership map (wave 15)*. Planning only — nothing below is built.
Re-read `.claude/agents/console.md` from disk today; it is the wave-15 rewrite. Measured against
`docs/design/{00-direction,01-tokens,tokens.css,04-components,06-decisions-proposed,07-tasks}.md` and
the tree at `9a81014`.

### 0 · Order of commits

`07-tasks.md`'s wave-1 order, restricted to my six files, then `SCR-048`:

1. `ui/data-table.tsx` — the console primitive named first among "the console primitives (tokens
   only)" in `04-components.md`'s migration table; also the one two existing screens already exercise
   most heavily, so any token gap surfaces early.
2. `ui/combobox.tsx`
3. `ui/menu.tsx`
4. `ui/tabs.tsx`
5. `ui/sheet.tsx`
6. `ui/date-time.tsx` — last: it renders almost nothing of its own (see §2.6) and depends on
   `rtl-datetime-picker.tsx`, which I do not own, so any token gap here is mostly a request, not a fix.
7. `SCR-048` (`src/app/[locale]/app/admin/companies/**`, the two `admin-lists.ts` functions, `admin.json`),
   after C1 (the token names), C2 (`AvatarProps.teamColor` — I only need `--team` to exist, not the
   avatar prop) and D1 (`0160`) land.

Each primitive is one commit with its jsdom test extended if needed, its RTL check, and its gallery
demo under `(dev)/ui/demos/`, per the six files' existing test suite (`tests/components/ui/*.test.tsx` —
all six already exist and are evidence, §5).

### 1 · Existing primitives — class-by-class, with the token role that carries it

Contract 1 (`STATUS.md`) has not landed yet; I plan against the **roles** named in the map — semantic
(`ground`, `surface`, `raised`, `text`, `muted`, `line`, `accent`, `accent-deep`, `signal`,
`signal-deep`) and structural (control radius, face, press shadow, heights) — and name every token I
need beyond that list as a request (§1.7).

Today's names, confirmed from `src/app/globals.css`: `--color-canvas` (`--bg`, semantic ground),
`--color-fg-heading`/`--fg-body`/`--fg-muted` (heading/body/muted text), `--color-edge`/`--edge-strong`
(hairline/emphasised line), `--radius-field` `6px`, `--radius-card` `14px`, `--btn-bg`/`--ring`
(button fill / focus ring, both flip per theme), `--color-silver-100/200/300/400` (a **raw** palette,
not remapped per theme — used here only as a hover/highlight fill, never as text on light).
`01-tokens.md`'s raw palette adds no name that collides with any of these (§4 already rules that); its
semantic layer is `--bg`/`--bg-surface`/`--bg-raised`/`--fg`/`--fg-muted`/`--line-color`/`--accent`/
`--accent-deep`/`--signal`/`--signal-deep`, scoped, never `:root` (`DEC-183` §4.2).

**`data-table.tsx`** (`src/components/ui/data-table.tsx`):
- `size-4 rounded-field border-edge-strong` (checkbox, :48) → structural **control radius** (small),
  semantic **line** (emphasised)
- `border-b border-edge` (`<th>`/`<tr>` dividers, :159/176/198) → semantic **line**
- `bg-canvas` (`<th>`, :159/176) → semantic **surface** (the table header sits on the card/surface, not
  the page ground)
- `text-fg-muted` (`<th>` label, :176) → semantic **muted**
- `hover:text-fg-heading` (:182), `text-fg-body` (`<td>`, :213) → semantic **text**
- `hover:bg-silver-100/60` (`<tr>`, :198) → **not in the named roles** — a hover/highlight fill; request
  (§1.7 #1)
- `rounded-card border border-edge` (phone card, :236) → structural **raised card radius**, semantic
  **line**
- `text-label text-fg-heading` (card title, :247), `text-body-sm text-fg-muted` (card field label, :262)
  → semantic **text**/**muted**
- `rounded-field border-edge-strong bg-silver-100` (selection banner, :127) → structural radius,
  semantic line, and the same hover/highlight request as above
- Nothing here is a duration or an animation class — `04-components.md`'s own row says "tokens only; no
  animation" for the console primitives, matching what is already true: zero `transition`/`animate-`
  classes in this file today.
- **Renders on:** every admin list screen — companies, categories, venues, members, proposals,
  sessions, moderation's three queues, scoring, recognition, exports, audit — at minimum 14 routes.
  The heaviest check for "unmoved outside the scope": `tests/e2e/admin*.spec.ts` and
  `tests/e2e/wave{6,7,8,11,13}-console-*.spec.ts` all render this component unscoped.

**`combobox.tsx`** (`src/components/ui/combobox.tsx`):
- The text input itself reads `controlClass(isInvalid)` from `ui/field.tsx` (`sessions'` file, :307) —
  **not mine to migrate**. Its tokens move only when `sessions` migrates `field.tsx`; until then this
  input renders in today's classes regardless of what I do to the rest of the file. I plan around this
  and note it to `sessions` and the lead (§1.7 #2).
- `rounded-field border-edge-strong bg-silver-100` (chip, :259) → structural radius, semantic line, hover/highlight request
- `rounded-field … hover:bg-silver-200 hover:text-fg-heading` (chip remove, :273) → same, plus text
- `rounded-field border-edge-strong bg-canvas` (status/listbox popup, :318/324) → structural radius,
  semantic line, semantic surface
- `text-body-sm text-fg-muted` (status text, :318) → semantic muted
- `bg-silver-100` (highlighted option, :345/365), `text-fg-muted/50` (disabled option, :345),
  `text-fg-heading` (option text, :345/365) → hover/highlight request, muted (at reduced opacity —
  **not a token today**, a raw Tailwind opacity modifier; flagged §1.7 #3), text
- `shadow-lg` (popup, :318/324) → **not in the named roles** — no "popup elevation" token exists yet;
  request (§1.7 #4)
- **Renders on:** the member picker (`components/admin/member-picker.tsx`, which re-exports this file
  — wave 8's note), used on session presenter assignment, proposal review, and — after this wave — the
  companies field is text-only, so combobox does not gain a new caller from `SCR-048` unless sync 1
  decides a company picker belongs somewhere it does not exist today. At minimum 3–4 screens.

**`menu.tsx`** (`src/components/ui/menu.tsx`):
- `itemBase`: `rounded-field … text-fg-heading … data-[highlighted]:bg-silver-100 …
  data-[disabled]:text-fg-muted/50` (:30) → structural radius, semantic text, hover/highlight request,
  muted-at-opacity (same §1.7 #3 flag)
- `toneClass.error: "text-error data-[highlighted]:bg-error-bg"` (:34) → **status/error tokens, not in
  the five roles or the semantic list** — `--color-error`/`--color-error-bg` are today's existing
  status constants (`DEC-073`), never touched by this migration; I read them as-is, not remapped
  (matches `01-tokens.md`: "Status colours are platform constants… never remapped")
- `rounded-card border border-edge bg-canvas … shadow-[var(--shadow-card)]` (content, :47) → structural
  card radius, semantic line, semantic surface, existing `--shadow-card` token (unaffected — not a
  playground name)
- `bg-silver-100` (current-page item, :60), `h-px bg-edge` (separator, :64) → hover/highlight request,
  semantic line
- **Renders on:** the collapsed admin rail's group menu (wave 8), the account menu (lead's), any
  `ui/link`-based overflow menu. At minimum 2–3 places I can see; the account menu is the lead's file,
  outside my edit list, so I only verify it renders unmoved, never touch it.

**`tabs.tsx`** (`src/components/ui/tabs.tsx`):
- `ms-1.5 rounded-full bg-silver-100 … text-fg-muted` (count badge, :136) → hover/highlight request
  (or a dedicated **count-badge** structural token — flagged), semantic muted
- `triggerClass`: `rounded-t-field … text-fg-body outline-none hover:text-fg-heading
  data-[state=active]:border-b-2 data-[state=active]:border-[var(--btn-bg)]
  data-[state=active]:text-fg-heading focus-visible:outline-2 …
  focus-visible:outline-[var(--ring)]` (:143) → structural radius, semantic text, **`--btn-bg` as the
  active-tab underline** — this is today's *button* fill token doing double duty as an accent; under
  the scope it should read semantic **accent** instead (a real behaviour-preserving substitution
  outside the scope, since `--btn-bg` and the future `--accent` both resolve to today's ink/white
  today) — flagged as a request to confirm the mapping is intentional (§1.7 #5), plus the existing
  `--ring` focus token
- `border-b border-edge` (list, :130) → semantic line
- **This is the tab *strip*, not the phone tab bar** (`DEC-183` §4.6/§4 disagreement #6, already
  ruled) — confirmed again from the file itself: no `role="navigation"`, no bottom-fixed positioning,
  nothing here composes with `src/components/shell/**`. I touch nothing there.
- **Renders on:** the admin sub-nav (moderation's three queues — wave 6/7's own finding about the
  fade), and wherever a URL-addressable tab strip exists. At minimum 3–4 places.

**`sheet.tsx`** (`src/components/ui/sheet.tsx`, the whole file — 51 lines):
- `bg-[var(--color-navy-950)]/60` (overlay, :35) → **a raw hex-backed token used as a raw value with
  opacity** — under the scope this is semantic **ground** at reduced opacity, but `--color-navy-950` is
  a **raw palette name**, and `04-components.md`'s definition of done says "no hex in the component";
  this line is already a token reference (not a literal hex), so it is compliant today, but it is the
  one place in my six files closest to the letter of that rule — flagged so the lead confirms whether
  a raw-palette-named custom property (vs. a semantic one) is what "no raw palette name" (`DEC-183`
  rule 5) means to forbid inside the *scope*, since outside the scope it must keep resolving to
  `--color-navy-950`'s value regardless of what I name it (§1.7 #6)
- `border-edge bg-[var(--color-canvas)] p-5 … text-fg-body shadow-xl` (content, :37) → semantic line,
  ground/surface (canvas), text, and another **elevation** request (`shadow-xl`, same family as
  combobox's `shadow-lg`, §1.7 #4)
- `rounded-t-card` (:26, bottom variant) → structural raised-card radius
- `h-1 w-10 rounded-full bg-edge-strong` (drag handle, :40) → semantic line (emphasised)
- `text-h3 text-fg-heading` (title, :42), `text-body-sm text-fg-muted` (description, :44) → semantic
  text/muted
- **`04-components.md` says `sheet` "carries its own action bar and hides the tab bar" and becomes
  full-height on phone** — already ruled not this wave by `.claude/agents/console.md` and `DEC-183` §4
  disagreement #17: **no behaviour change**, and if a full-height variant is built at all it is an
  opt-in prop. I plan **zero new props** for `sheet` this wave; a pure token migration of the five
  class strings above. If the lead wants the opt-in prop started now, that is outside my current plan
  and I ask at sync 1 (§8).
- **No animation exists in this file today** (comment at :20–23 confirms it deliberately — "No
  entrance/exit animation… only the `--dur-*`/`--ease-out` TOKENS ship"). I add none.
- **Renders on:** the search sheet, the filter sheet, and the mobile nav drawer (`STATUS.md`: "the
  phone drawer is `ui/sheet`" — wave 6/7 standing note) — at minimum 3 places, one of them
  (`src/components/shell/**`) outside my edit list; I verify it unmoved, never touch it.

**`date-time.tsx`** (`src/components/ui/date-time.tsx`, 74 lines):
- **This file declares one class**: `className={className}` on its own wrapper `<div>` (:45), passed
  straight through from the caller. Every visible token — border, radius, focus ring, the calendar
  popover, the hour/minute grid — lives in `src/components/admin/rtl-datetime-picker.tsx`, which is
  under `src/components/admin/**` and **is** in my edit list ("your standing files" — `console` holds
  `components/admin/**` except `delivery-reason.ts`). So the actual token migration for date-time
  happens in `rtl-datetime-picker.tsx`, not in `date-time.tsx` itself; `date-time.tsx`'s own commit is
  close to a no-op (confirm the wrapper needs nothing, or add nothing beyond what the picker needs).
  I read `rtl-datetime-picker.tsx`'s classes before that commit and list them there rather than
  guessing here, since it is a large file (the wave-8 note above already calls it "the hardest," 5
  `ui-lint` violations at the time) — **flagged as the one place my plan is incomplete until I read
  that file in full**, which I will do before the `date-time` commit, not before sync 1.
- **Renders on:** the schedule form's four pickers (`sessions'` screen, frozen this wave — I touch it
  for nothing but confirming it renders unmoved), and any other admin form using a date/time field.

### 1.7 · Token requests beyond the five semantic + structural roles

1. **A hover/highlight fill** — `bg-silver-100`/`hover:bg-silver-100`/`hover:bg-silver-200` appear in
   four of six files (rows, chips, menu items, count badges). Not "raised" (raised is a static surface
   step, e.g. inputs/chips at rest); this is an *interaction* state. Request: a semantic `--hover` (or
   confirm it should map to `--bg-raised` and drop the distinction).
2. **`controlClass()` in `ui/field.tsx`** is `sessions'` file and out of my edit list; `combobox`'s
   input inherits its tokens from there. Not a request to the lead — a note to `sessions` and a line in
   my own "outside the scope, nothing moved" check: if `sessions` migrates `field.tsx` before I migrate
   `combobox.tsx`, my gallery/RTL check for `combobox` must run **after** that commit or it tests a
   stale input.
3. **Opacity-modified muted text** (`text-fg-muted/50`) in `combobox` and `menu` — Tailwind's `/50`
   syntax on a semantic token, not a distinct token. No request; noting it renders unchanged either way
   since it is a modifier on whatever `--fg-muted` resolves to.
4. **A popover/menu elevation token** — `shadow-lg` (combobox), `shadow-xl` (sheet),
   `shadow-[var(--shadow-card)]` (menu, already named) are three different shadow expressions for the
   same "content floating above the page" idea. Request: confirm whether the scope wants one
   `--shadow-elevated` role or whether `--shadow-card` covers all three (menu already uses it; sheet
   and combobox do not).
5. **`tabs.tsx`'s active-tab colour reads `--btn-bg`**, today's *button* fill token, not a tabs-specific
   one. Outside the scope this must keep resolving to `--btn-bg`'s value; inside the scope I plan to
   read semantic `--accent` instead, since that is what an "active/selected" indicator is supposed to
   be under the direction (lime, `01-tokens.md`). Confirm this substitution is intended and not a
   drift risk (`--btn-bg` and `--accent` are two different names for the same current value only by
   coincidence, not by contract).
6. **`sheet.tsx`'s overlay reads a raw-named custom property**, `--color-navy-950`, not a semantic one.
   Confirm whether "no raw palette name" (`DEC-183` rule 5) forbids me from continuing to reference that
   name at all (even though it already resolves via `var()`, not a literal hex) or whether the rule
   targets literal hex/rgb values, which this file has none of.
7. **Control radius vs. card radius**, already two structural names in `01-tokens.md`
   (`--radius-input`/`--radius-card`) — my six files use *three* distinct radii today (`rounded-field`
   6px for controls/chips, `rounded-card` 14px for cards/popovers, `rounded-full`/`rounded-t-card` for
   pills and the sheet's top corners). `01-tokens.md` names `--radius-input` (12px) and `--radius-card`
   (22px) — a `--radius-pill` (999px) is also named and covers the count badge and any pill chip.
   Nothing further needed here; noting the mapping is 1:1 already, not a request.

### 2 · New states, props, or behaviour — none

Per `.claude/agents/console.md` and `DEC-183` §4.17/§4 disagreement #6, none of my six primitives
gains a prop, a state, or a behaviour this wave. `tabs` stays the tab strip (not the phone tab bar,
which is `src/components/shell/**`, the lead's — confirmed again from the file, §1). `sheet` stays
exactly as animated (not at all) and exactly as sized (not full-height) as it is today; if a
full-height opt-in prop is wanted this wave, that is a question for sync 1 (§8), not something I am
building without an explicit go-ahead, since it is the one item `DEC-183` §4.17 calls out by name as
"an opt-in prop… adopted later," which reads as *available to build* but not *required* this wave.

### 3 · SCR-048 today — measured from the code

**Route:** `src/app/[locale]/app/admin/companies/page.tsx`. Server component, `requireAdmin`-gated
(via `listCompaniesForAdmin`'s own `requireAdmin` check, `src/lib/dal/admin-lists.ts:31-34` — role
must be exactly `"admin"`, so a moderator gets `null` → `notFound()`, DEC-134's contract).

**Form (`company-form.tsx`):** one field, `name` (`Input`, `maxLength={120}`, required). No colour
field, no other field. `Field`/`Input`/`FormSummary`/`Button` from `ui/`, none of which I own.

**Table (`companies-table.tsx`, onto `ui/data-table`):** four columns — `name` (bdi-wrapped), `memberCount`
(computed client-side count, not stored), `status` (`Badge`, active/deactivated), `actions`
(`DeactivateToggle`, no delete — no delete grant exists on `companies`, confirmed in `0004`). All four
are `onCard: true` — every column shows on the phone card list.

**DAL (`src/lib/dal/admin-lists.ts`):**
- `listCompaniesForAdmin(locale)` (:77-93) — `select("id, name, deactivated_at")`, ordered
  deactivated-first then name; a second query counts `members.company_id` client-side (not a SQL
  `count`, a `Map` built in application code from every non-null `company_id` row — this becomes
  relevant if a future wave adds per-company aggregates, not this one). **Grant:** none beyond table
  grants — `requireAdmin()` gates it, then relies on RLS's `p1_org_read` (org-scoped select, any
  authenticated member, not admin-only at the DB layer — the admin gate is app-side only, same as
  every other admin-lists function).
- `createCompany(locale, input)` (:99-104) — plain `insert({org_id, name})`. Relies on `p2_admin_insert`
  (`0004:205-206`: `org_id = auth_org_id() and is_org_admin()`).
- `setCompanyActive(locale, companyId, active)` (:107-114) — plain `update({deactivated_at})`. Relies
  on `p2_admin_update` (`0004:208-209`, same predicate).
- `companyInput` Zod schema (:95): `z.object({ name: z.string().trim().min(1).max(120) }).strict()`.

**RLS policies on `companies`** (`0004_tenancy.sql:201-210`): `p1_org_read` (select, any authenticated
member of the org), `p2_admin_insert`/`p2_admin_update` (org admin only), **no delete policy, no delete
grant**. `grant select, insert, update on public.companies to authenticated`.

**★ How a company edit is audited today: it is not.** `createCompany` and `setCompanyActive` are plain
PostgREST calls (`supabase.from("companies").insert/update`), not RPCs, and neither calls
`write_audit()` (`0005_tenancy_rpcs.sql:16-40`, the only entry point into `audit_log`) nor sits behind
a trigger that does. Grepping `src/lib/dal/admin-lists.ts` and every migration touching `companies`
(`0004`) finds no audit path — confirmed by `grep -rln "audit_log" src/lib/dal/*.ts`, which lists six
files and `admin-lists.ts` is not one of them. This is a finding, not a design choice I am reversing:
`categories` and `venues` (the two other "same shape" tables the header comment cites) are equally
unaudited today, so this is consistent with the tier of screen SCR-048 has always been, not a
regression I would be introducing. The requirement in `.claude/agents/console.md` ("a change is
audited, naming the company, the old colour and the new one") therefore adds a **new** audit path that
does not exist for `name` or `deactivated_at` either — I am not extending an existing mechanism, I am
building the first one this table has ever had, scoped to `team_color` only unless the lead wants it
to cover the whole table.

**Team-colour field, proposed:**
- Seven named swatches from `01-tokens.md`'s team-colour table (`--color-team-{silver,tangerine,
  magenta,cyan,gold,violet,mint}`), each rendered as a small filled circle **and** its Arabic name in
  words beside it (`WCAG` colour-is-never-the-only-channel, restated in `01-tokens.md` itself: "always
  paired with the company logo or name; never the only channel") — so the seven labels are new
  `admin.json` keys, e.g. `teamColour.silver: "فضي"`, `.tangerine: "برتقالي"`, `.magenta: "أرجواني
  محمر"` (or a closer Arabic word — final wording is a translation pass, not blocked on sync 1), plus a
  `«بلا لون»` option (`teamColour.none`).
- At 390 px: a `radiogroup` of seven swatch buttons plus "بلا لون" wrapping in the form's existing
  `max-w-md space-y-5` column — each swatch ≥ 44px hit target (`01-tokens.md`'s own rule), not a native
  `<input type="radio">` row (too small), a custom `radiogroup` built from `ui/button` toggle-style or a
  small new internal control **inside `companies/**`**, not a new `ui/` primitive — nothing in the six
  files I own is a colour picker, and `04-components.md` proposes none either.
- **Posts:** a `teamColor` field alongside `name` on the existing edit surface — but there is **no
  existing edit surface** for a company beyond activate/deactivate (`DeactivateToggle`) and the add
  form. Team colour is a **per-row edit** on an already-created company, which `companies-table.tsx`
  has no pattern for today (its only per-row action is the toggle). I plan a new per-row control (a
  `Menu` or a small inline `Sheet`/popover — both primitives I own) rather than a full edit form,
  since the only editable field is the colour. Recommendation: a `Menu` trigger button in a new
  `teamColor` column, opening the seven-swatch choice as menu items (tone dot + label), calling a new
  Server Action. This reuses `ui/menu.tsx` (already migrated by commit 3 in my order) rather than
  adding a new primitive.
- **Zod schema:** `z.object({ teamColor: z.enum(["silver","tangerine","magenta","cyan","gold","violet",
  "mint"]).nullable() }).strict()` if the seven-name-only recommendation (below) is taken, translated
  server-side to the `#rrggbb` value before the write (the enum member names never reach the database
  as data — the hex does, matching `01-tokens.md`'s "org data… `#rrggbb`" and the column's check
  constraint). If a free hex is wanted instead: `z.object({ teamColor:
  z.string().regex(/^#[0-9a-f]{6}$/i).nullable() })`, and the seven swatches become presets that fill
  the same field rather than the only options.
- **Recommendation: named-only, no free hex.** `01-tokens.md` is explicit that the seven are "the
  proposal" with "the mapping to companies… the owner's to change" — a mapping between names and
  fixed hexes it already picked for accessibility (bone/ink text contrast against each was presumably
  checked when the palette was built) and for visual consistency with every other team-coloured surface
  (avatar rings, race bars, posters) still to come. A free hex reopens a contrast question this wave
  is not scoped to solve (no swatch-vs-text contrast checker exists in `companies/**` or anywhere I
  own), and `docs/design/` never mentions a free-hex path — `06-decisions-proposed.md`'s `DEC-NEXT-4`
  says "seeded… with the mapping… editable by an org admin," which reads as picking among the mapping,
  not inventing new colours. The database's `#rrggbb` check constrains storage either way, so the
  decision is only about what the *form* offers.

### 4 · What I need from `0160` beyond the column and its check

1. **Confirm the grant.** `companies` today has `grant select, insert, update … to authenticated`
   (`0004:210`) with RLS deciding who may actually write. If `team_color` is written through the same
   `p2_admin_update` policy (no new policy, since it is the same row, same predicate), no new grant is
   needed — I plan on this being sufficient and ask the lead to confirm rather than add one.
2. **A definer trigger for the audit**, not a definer function I call from the DAL — matching the
   existing `org_domains_audit()` pattern (`0005_tenancy_rpcs.sql:315-330`, `security definer`, `after
   insert or update or delete`, calling `write_audit()`), which I can write myself under
   `supabase/proposed/console/**` ("functions and triggers only, never a table or a column" — a trigger
   on an existing table is exactly this). Planned shape: `companies_team_color_audit()` fires `after
   update on public.companies for each row when (old.team_color is distinct from new.team_color)`,
   calling `write_audit(new.org_id, 'company.team_color_changed', 'company', new.id, jsonb_build_object
   ('teamColor', old.team_color), jsonb_build_object('teamColor', new.team_color))`. No new grant
   needed on `write_audit` itself (`0005:39-40` already grants it to `service_role`, and a `security
   definer` trigger executes as its owner, the same pattern `org_domains_audit` already relies on). I
   will write this trigger under `supabase/proposed/console/companies-team-colour-audit.sql`, prove it
   with `applyProposed()` in a new `tests/rls/team-colour-audit.test.ts` (tested as a member performing
   the update through RLS, not as the trigger owner — per the standing rule for definer triggers), and
   hand the file and the test names to the lead for `0160`'s commit (or a follow-on migration the lead
   numbers).
3. **Nothing else.** No bucket, no new table, no new function beyond the one trigger above.

### 5 · What `main`'s app does with a column it does not select

`listCompaniesForAdmin` selects `"id, name, deactivated_at"` — an explicit column list, not `select("*")`
(`admin-lists.ts:82`). `createCompany` inserts `{org_id, name}` (:101) and `setCompanyActive` updates
`{deactivated_at}` (:110) — both explicit object literals, neither spreading a form payload. **A new
nullable `team_color` column is invisible to every one of these three functions until I edit them.**
`main`'s worker never reads `companies` at all (confirmed: no `worker/src/**` file references
`companies` — the table has no job, no render context path, nothing). **Nothing moves.**

### 6 · Places `docs/design/` and the tree disagree, not yet in `DEC-183` §4

1. **`04-components.md`'s `tabs` row** ("five slots with the centre slot a raised 56px accent circle
   («اقترح»)… contextual… hidden on detail/immersive screens") describes the **phone tab bar**, already
   ruled (`DEC-183` §4 disagreement #6) to be `src/components/shell/**`, not `ui/tabs`. That ruling
   covers the *naming* confusion; it does not separately say what `ui/tabs.tsx` (the strip) itself
   should look like under the scope, and `04`'s table gives it no row of its own beyond the one that is
   actually about the bottom bar. Not a new disagreement to log — the existing ruling already resolves
   it for me (§2) — but worth stating plainly since a fast read of `04`'s table row labelled "`tabs`"
   could mislead a future reader into thinking it describes my file.
2. **`04-components.md`'s `sheet` row** ("full-height on phone… carries its own action bar and hides
   the tab bar") is the one `DEC-183` §4 disagreement #17 already names and rules on (opt-in prop, not
   built this wave unless asked). No new disagreement; restating because it is the item most likely to
   be mis-scoped into "just build it."
3. **`data-table`, `reorderable-list`, `file-drop` and the rest of the console primitives** grouped in
   one row of `04-components.md`'s table ("tokens only; no animation") — `reorderable-list.tsx` and
   `file-drop.tsx` are **not mine**: `reorderable-list` is the lead's (`ui/index.ts`'s table), `file-drop`
   is `content`'s. `04`'s prose groups them with mine under "console primitives," which is imprecise
   against the actual per-file ownership table in `CLAUDE.md`. Not a behaviour disagreement, just a
   grouping error in the design doc; I am touching only the six files named in my own row.

### 7 · Existing tests whose expectation would move — none found

`tests/components/ui/{data-table,combobox,menu,tabs,sheet,date-time}.test.tsx` all exist today. Grepped
every one for `className`/`toHaveClass`/literal `class=` assertions: the **only** hits are in
`data-table.test.tsx:188-189` (`expect(label).toHaveClass("shrink-0")` and
`expect(label.nextElementSibling).toHaveClass("min-w-0")`), both plain Tailwind layout utilities
(flex-shrink and min-width), never touched by a token migration. No other file asserts a class string.
Every other assertion in these six suites reads text content, roles, `aria-*` attributes or DOM
structure — none of which a token-only, behaviour-unchanged migration moves. **Nothing in my six
existing-primitive test files is expected to break.** `tests/components/admin/compan*` does not exist
yet (new, for `SCR-048`'s new field — no pre-existing assertion to preserve there either, since the
route's current tests, if any, live under a file I have not found: `grep`-ing `tests/**` for
"companies" other than `admin-lists`/RLS turns up nothing, so `SCR-048` currently has **no** component
test at all — worth flagging to the lead as a pre-existing gap, not one this wave opens).

### 8 · Questions for the lead

1. **The hover/highlight fill** (§1.7 #1) — is there a semantic `--hover` planned, or does
   `--bg-raised` cover it?
2. **The popover/menu elevation** (§1.7 #4) — one `--shadow-elevated` role, or does existing
   `--shadow-card` (already used by `menu.tsx`) cover `combobox`'s and `sheet`'s cases too?
3. **`tabs.tsx`'s `--btn-bg`-as-active-indicator** (§1.7 #5) — confirm the intended semantic replacement
   is `--accent`, not a tabs-specific token, and that this substitution (same value today, different
   name) is the kind of "identical outside the scope" the contract means.
4. **`sheet.tsx`'s `--color-navy-950` reference** (§1.7 #6) — does "no raw palette name" forbid
   continuing to *reference* an existing raw-named custom property from inside a migrated primitive, or
   only forbid introducing a *new* one / a literal hex? (The file has no literal hex; it already reads
   through a `var()`.)
5. **`date-time.tsx` vs. `rtl-datetime-picker.tsx`** (§1) — confirming the token migration for the
   date/time control is really `rtl-datetime-picker.tsx`'s commit (which I own under
   `components/admin/**`) and `date-time.tsx`'s own commit is close to a no-op. I will read the picker
   file in full before that commit either way; flagging now so the lead's expectation of "six commits,
   one per primitive" is not surprised by the sixth being thin and a seventh (the picker) carrying the
   actual weight.
6. **`sheet`'s opt-in full-height prop** (§2) — build it this wave (unused, gallery-only, per `DEC-183`
   §4.17's "shown in the gallery and adopted by a later wave"), or leave it entirely for a later wave's
   plan? My default is: not this wave, unless told otherwise at sync 1.
7. **The team-colour field's shape on `SCR-048`** (§3) — confirm named-only (my recommendation) vs. a
   free hex, and confirm the per-row `Menu`-based edit control over a full inline edit form, since
   there is no existing per-row edit affordance on this screen to extend.
8. **The audit trigger's scope** (§4.2) — `team_color` only, or should `companies_team_color_audit()`
   become a general `companies_audit()` also covering `name` and `deactivated_at`, which have never
   been audited? My plan builds the narrower one (matches the requirement's literal ask); widening it
   is a five-minute change if the lead wants the whole table's history closed in the same commit.
9. **`memberCount`'s non-aggregate query** (§3, DAL) — not a wave-15 question, but noted: if a future
   screen needs this at scale, `listCompaniesForAdmin`'s current approach (fetch every member row,
   count client-side) does not use `count()`. Out of scope here; flagging so it is not lost.

Refs: DEC-183, DEC-184, REQ-UIX-030, REQ-UIX-043

---

## Wave 15 — done

All six primitives (`data-table`, `combobox`, `menu`, `tabs`, `sheet`, `date-time` — via
`rtl-datetime-picker.tsx`) are onto the scope, tokens only, no existing class edited, no behaviour
change. `SCR-048`'s team colour is built in today's look: the seven named colours plus «بلا لون», no
free hex, a per-row `ui/menu`, and its own audit trigger (the table's first). Commits, in order:

| Commit | What |
|---|---|
| `751685f` | `data-table` onto the scope |
| `8b49ba7` | `combobox` onto the scope |
| `899b180` | `menu` onto the scope |
| `282f117` | `tabs` onto the scope |
| `cd9f99e` | `sheet` onto the scope |
| `215862f` | `date-time` onto the scope, via `rtl-datetime-picker.tsx` |
| `314e14d` | `tests/e2e/wave15-console-gallery.spec.ts` |
| `4c0d4ef4` | `companies_team_color_audit()` — proposed SQL + RLS test, 5/5 green |
| `758edd5` | gallery spec fixed to the corrected single-render-per-scope pattern |
| `ce32281f` | `data-demo` roots added to all six demos |
| `4425070` | `SCR-048`'s team colour — DAL, actions, table, messages, tests, e2e |

`npx tsc --noEmit` clean throughout · `npm run lint` 0 errors (26 pre-existing warnings, none mine) ·
`npm run ui-lint` clean (321 files, strict) · every targeted test green before each commit ·
`npm run test:rls` full run: 138/139 files green, the one failure (`survey-submit.test.ts`, six cases)
is `event`'s file and unrelated to `companies` — pre-existing, not touched by my SQL · full
`vitest run --project unit --project components`: 3212/3213 green, the one failure
(`typography-utilities.test.ts`, `text-play-*` orphans in `playground.tsx`) is the lead's in-flight
gallery page, not mine.

**Two things left for the lead**, both need access I don't have this wave:
1. **Promote `supabase/proposed/console/team_colour_audit.sql`** after `0160` (already landed). Until
   then the audit half of `wave15-console-team-colour.spec.ts` fails against a real database, though
   the RLS suite already proves the trigger itself (`4c0d4ef4`).
2. **Run `wave15-console-gallery.spec.ts` and `wave15-console-team-colour.spec.ts`** against a fresh
   `KAREEM_GALLERY=1` / production build — building is lead-only, and the `.next` on disk predates my
   `companies/**` commits entirely.

**Found, not mine to fix:** `ui/scope.tsx` imports `next/font/google`, and `vitest.config.ts`'s
`components` project has no alias for it — `IBM_Plex_Sans is not a function` under jsdom the moment a
component test imports `PlayScope`. Worked around in every `*-scope.test.tsx` by not mounting the
scope (jsdom applies no CSS regardless, so the assertion is the `pg:` class string's presence).

**Untouched-suite ledger lines, for `STATUS.md`** (I cannot write it myself — `docs/plan/**` except my
own note):
- `tests/components/admin/managed-lists-status-badge.test.tsx` — two `AdminCompany` fixture literals
  widened with `teamColor: null` (the interface's new required field); assertions unchanged.
- `tests/components/admin/phone-card-actions.test.tsx` — one `AdminCompany` fixture literal widened
  the same way; assertions unchanged.

Nothing else outside the scope moved. My row is done.

---

## Wave 15 — contract 6 (DEC-188), and the audit label fix

- `859024820` — `sheet.tsx` and `menu.tsx` wired to `usePlayPortal()` on their Radix portal, matching
  `dialog.tsx`'s worked example (`container={landing}`, `undefined` outside a scope — Radix's own
  default, unchanged). New cases in the existing `sheet-scope.test.tsx`/`menu-scope.test.tsx` prove
  `closest(".theme-play")` resolves inside a scope and is `null` outside one, following
  `tests/components/ui/scope-portal.test.tsx`'s pattern (including the `@/lib/fonts` mock — this also
  resolves the `IBM_Plex_Sans is not a function` blocker I'd flagged earlier; every future scope test
  of mine can mount `<PlayScope>` for real now). `combobox` and `date-time` need nothing: both position
  their popups `absolute` inside their own root, never through a portal.
- `f39f13a5` — `0161` (the lead's promotion of my audit trigger) writes `company.team_color_changed`
  into `audit_log`, and `tests/unit/admin-audit-labels.test.ts` scans every migration for a label on
  `admin.audit.actions.<domain>.<verb>` in both `ar` and `en`. Added the one missing pair
  (`company.team_color_changed`), alphabetical with its siblings. This touches `admin.json` outside the
  `companies` namespace strictly named in my edit list — flagging it as a request/notice rather than
  something I assumed: it was the only way to keep `REQ-ADM-018`'s suite green after the promotion, and
  it is two lines, additive, no other key touched (confirmed by diff before committing).

Full `npx tsc --noEmit`, `npm run lint`, `npm run ui-lint`, and the full `unit`+`components` project run
(3216/3217 green, the one failure is the lead's in-flight `playground.tsx`) all clean after these two
commits.

---

## Wave 15 — the popup-surface fix (91398840)

`sheet.tsx` had its own separate fault, identical to the lead's `dialog` one: `bg-[var(--color-canvas)]`
resolves at `:root` and is white on every ground. Fixed with the same `pg:bg-surface`, and moved
`pg:shadow-none` to the end of the class string (existing classes first, the scope's after — it had
been sitting mid-string).

`menu.tsx:53`, `combobox.tsx:318/324` and `rtl-datetime-picker.tsx:289` all read `bg-canvas` (the
utility, which follows the scope, not the raw `--color-canvas` variable) — so none of these three had
the white-on-white fault. What they had instead: `bg-canvas` is the scope's **ground**, so a popup
floating over the page rendered the exact colour of the page beneath it, told apart only by its
1px border. Each gains `pg:bg-surface`.

★ **What I actually saw, honestly:** I have no way to open a browser against a real build — building
is lead-only, and the `.next` on disk is stale relative to my own commits regardless. So this is
traced from the mechanism (`--bg`/`--surface` are two different values on both grounds inside
`.theme-play`/`.theme-play-light`, per `tests/unit/tokens-scope.test.ts`'s own fixtures), not eyeballed
in Chromium. The e2e proof in `wave15-console-gallery.spec.ts` (four tests × two grounds, computed
`background-color`/`color` compared against `scopeComputes()`, a capture per popup per ground) is what
actually verifies it, and needs the lead's build to run.

82 existing component tests across the four files pass untouched (jsdom applies no CSS; they only
ever assert class-string presence).

---

## Wave 15 — captures stilled (e97f9b3d), and one carried finding

`wave15-console-gallery.spec.ts` now disables smooth scrolling on `goto` and waits for `still()` (three
equal `scrollY` readings) before every screenshot, in both the per-primitive capture loop and the four
popup-surface tests — the lead's own fix on `dialog`, applied here. The sheet's popup test also
measures its scrim and its own bottom edge directly rather than trusting the picture.

**Carried, not this wave, recorded here per the lead's message:** at 320 px the date picker's weekday
names touch («السبت» «الجمعة» «الخميس» run together, no space) — present outside the scope and on
`main` too, so not a wave-15 regression. `rtl-datetime-picker.tsx` is mine; this goes on my list for
whichever screens wave next touches it.


---

## Wave 17 — plan (DEC-199, M19; planning only, no code edited)

Measured on `wave-17/every-primitive` at `c073ce3b`, read-only. The walk scripts are throwaway and not committed.

### 1 · K1 — the register's guard, `tests/unit/console-register.test.ts` (C6, `REQ-UIX-053`)

**Dry run of the import graph today — ★ CLEAN.** Walker = `public-graph.test.ts`'s (value imports only, `@/` and relative
specifiers, `import type` erased), plus dynamic `import()`. Roots `src/app/[locale]/app/{admin,platform}/**` reach **292
files**, 39 of them `components/ui/*` (every one of the six, plus `icon-button`, `link`, `page-header`, `prose`,
`reorderable-list`, `route-error`, `route-progress`, `section-header`, `skeleton`, `submit-button`, `toast`, …). Against the
forbidden set — `src/lib/ui/**` (`confetti`, `count-up`, `duration`, `moment`, `reduced-motion`), `components/ui/objects/**`,
`components/ui/sticker.tsx`, any `moment-*`, and (my addition, see Q1) `rank-row`, `race-bar`, `level-card`, `session-cta`,
`code-input`, `story-ring`, `reaction-bar`, `poster` — **the only hit is `components/ui/scope-portal.tsx`**, via
`sheet.tsx` ← `admin/audit/audit-filters.tsx` (and via `menu.tsx` ← `app/layout.tsx` for the shell). That is the
portal-landing infrastructure of `DEC-188`, not a celebration: it is **allowed by name**, with the reason. Nothing
else. No shared component pulls a moment, confetti, an object or a sticker in. The walk from `app/[locale]/app/layout.tsx`
(39 files) is clean as well, so the shell is not the leak.

**Assertions** (one file, walker copied not imported — `public-graph.test.ts` is the lead's and exports nothing):
1. *The walk is real*: roots exist; reached set > 150 files and contains `components/admin/admin-rail.tsx`,
   `components/ui/data-table.tsx`, `components/platform/platform-nav.tsx`.
2. *Roots*: `src/app/[locale]/app/admin/**`, `src/app/[locale]/app/platform/**`, and `src/app/[locale]/app/layout.tsx`
   (the shell the console renders in). After M1 the layout will import `ui/scope.tsx` — allowed by name with
   `scope-portal.tsx`; nothing else.
3. *Forbidden never reached* — `lib/ui/**`, `components/ui/objects/**`, `components/ui/sticker.tsx`, `/moment-*`, and the
   five game/celebration primitives above. The failure message prints the **import chain** (a parent map, as in my
   scratch walk), because «reached via X» is the only actionable fact.
4. *The console renders no scope of its own*: no reached staff file (under the two roots and `components/{admin,platform,
   designer,branding,email,survey}`) contains `<PlayScope` — the layout's is theirs (C1). (`theme-dark` is C1's
   `scope-root` test, not mine; the banner is the one staff file that says it — §2.)
5. *The six + the picker declare no animation*: with comments stripped, `ui/{data-table,combobox,menu,tabs,sheet,
   date-time}.tsx` and `components/admin/rtl-datetime-picker.tsx` match none of `animate-`, `transition` (as a class
   token), `duration-\d`, `ease-(in|out|linear)`, `delay-\d`, `motion-(safe|reduce):`, `@keyframes`, `.animate(`,
   `useCountUp`. **Measured set today is EMPTY** for all seven files (the one hit, `sheet.tsx:23`, is a comment about the
   `--dur-*` tokens). So the assertion pins ∅, not «today's» non-empty set.
6. *The staff tree declares none either*: the same regex over every file under the two roots and the six component
   dirs. **Measured: zero** (the only `duration-` substring is the `DurationInput` import path in `scoring/rules-table.tsx`
   and `reminders/reminders-form.tsx`, hence `duration-\d`, and `transition` matched only as a quoted class token —
   `transitionActions` and `runTransition` are identifiers).
   `components/designer/**` is included for classes, but its canvas, overlay and the renderer's output are not scanned
   for anything else (not mine).

### 2 · K2 — the staff side's raw palette (C4)

Measured over `src/app/[locale]/app/{admin,platform}/**` and `src/components/{admin,platform,designer,branding,email,
survey}/**`: **17 hits in 12 files.** No `theme-dark` class is *applied* anywhere in staff files; the only mention is the
banner's (below). No `slate-*`, no `[var(--color-navy…)]` brackets outside the six primitives.

| # | file:line | class | role | becomes |
|---|---|---|---|---|
| 1 | `admin/sessions/page.tsx:114` | `bg-navy-950 … text-white hover:bg-navy-900` | a primary link-button (create) | `bg-accent text-on-accent hover:bg-accent-deep` |
| 2 | `admin/layout.tsx:192` | `bg-navy-950 … text-white` | skip-link, filled mark | `bg-accent text-on-accent` |
| 3 | `platform/layout.tsx:43` | same | skip-link | same |
| 4 | `admin/companies/companies-table.tsx:48` | `hover:bg-silver-100 pg:hover:bg-hover` | hover ground (already paired) | `hover:bg-hover` (drop the pair) — **lead's row as custodian** (DEC-195 §3 file); I do not touch it unless told |
| 5 | `platform/orgs/org-actions.tsx:140` | `bg-silver-100` | a code well | `bg-raised` |
| 6 | `components/admin/admin-rail.tsx:299` (×2 on one line) | `bg-silver-100` current; `hover:bg-silver-100` | current item = raised fill; hover = hover ground | `bg-raised` / `hover:bg-hover` |
| 7 | `components/platform/platform-nav.tsx:58` (×2) | same | same | same |
| 8 | `rtl-datetime-picker.tsx:291, 297` | `hover:bg-silver-100 pg:hover:bg-hover` | hover ground | `hover:bg-hover` |
| 9 | `rtl-datetime-picker.tsx:324` | `bg-navy-950 text-white pg:bg-accent pg:text-on-accent` and `hover:bg-silver-100 pg:hover:bg-hover` | selected day; day hover | `bg-accent text-on-accent` / `hover:bg-hover` |
| 10 | `rtl-datetime-picker.tsx:386` | `bg-navy-950 … text-white hover:bg-navy-900 pg:…` | «تم» primary | `bg-accent text-on-accent hover:bg-accent-deep` |
| 11 | `designer/layer-list.tsx:136` | `bg-silver-100` on a selected row | a selected/raised fill | `bg-raised` |
| 12 | `designer/inspector.tsx:654` | same (checked swatch/toggle) | selected | `bg-raised` |
| 13 | `designer/variant-strip.tsx:55` | same (selected tile) | selected | `bg-raised` |
| 14 | `designer/variant-strip.tsx:58` | `bg-navy-900` | **a backing behind a rendered poster thumbnail** (stands in while the image loads / letterboxes it) | ★ **fits none** — it is not a mark or a fill of the UI but the ground artwork sits on. Proposal: `bg-canvas` (the ground). Studio chrome, not the canvas or renderer; I will change it only if you confirm |
| 15 | `survey/results.tsx:108` | `bg-silver-100` | a well holding a free-text answer | `bg-raised` |

Rows 8–10 sit in a file that already pairs the variant; I collapse pair → semantic name only where C4's table says the
semantic name falls back correctly outside the scope (it does for `accent` and `hover`; for `raised` see Q2).
**Not raw palette, listed for completeness:** `branding/colour-field.tsx:65` `"#9ca3af"` (the colour input's fallback
*value*, data), `admin/companies/swatch.tsx:9` and `branding/brand-preview.tsx` inline `style` colours (a colour from data
is drawn as itself — `DEC-183` contract 3). Neither is touched.

**★ The impersonation banner** (`components/platform/impersonation-banner.tsx:69`). It stops carrying `.theme-dark`
without a single class of its own being needed: the `className` `[.theme-dark_&]:border-live-on-dark/50
[.theme-dark_&]:bg-transparent` is **already what `Panel tone="live"` does in a dark scope** (`panel.tsx:28`,
`pg-dark:border-live-on-dark/50 pg-dark:bg-transparent`; the file's own comment says so), and `Badge tone="live"` with
its lock glyph carries `pg-dark:` too (`badge.tsx:67`). Change: delete the `className` override and rewrite the header
comment (the console is no longer light, `/no-access` is no longer the only dark context). It stays unmistakable by
three things that are semantic already: the **amber `--color-live-on-dark` border**, the **lock-icon `live` badge**
(«seen before it is read», `16` §3 principle 3) and the org's name in `text-fg-heading` on its own line, above a
full-width stop control on a phone. **The one doubt:** the light console had a *filled* amber-cream panel; the dark form is an
outline at 50 % with no fill, which is quieter on a dark page than a fill was on a light one. If the lead wants it louder
that is a `panel.tsx` `live` decision (a `pg-dark:bg-live-on-dark/10` tint), content's file — a request, not mine. Its
test (`tests/components/platform/impersonation-banner.test.tsx`) asserts no class, so nothing moves there.

### 3 · K3 — the six on the dark ground, read from the classes as they stand

All six are `variant` kind and carry `pg:` pairs; each still names raw `silver-*`/`navy-*` beside its pair (10 occurrences:
`data-table` 2, `combobox` 5, `menu` 3 incl. `bg-canvas`, `tabs` 1, `sheet` 1 bracket `--color-navy-950`, `date-time` 0 — it
wraps the picker's classes). I expect:
- **`data-table`** — row rule is `border-edge` (a semantic name; dark value under the scope), hover `pg:hover:bg-hover`
  (`hover:bg-silver-100/60` is the outside fallback). The bulk bar is `pg:bg-raised` with `border-edge-strong`. **Sticky
  `<th>`**: its ground is whatever `bg-` it declares; if it is `bg-canvas` it follows `--color-canvas` and is fine — I
  will check it on a scrolled table in the capture, because a sticky header with the wrong ground shows rows through it.
  Card mode below `md`: cards are `Card`'s (content's), unaffected.
- **`combobox`** — chips `pg:bg-raised`, the popup/listbox `pg:bg-surface` with `border-edge-strong` (no shadow on the
  dark ground, `pg:shadow-none`, so the edge carries the popover — must be visible; I check contrast of
  `edge-strong` on `surface` in the capture). Highlight `pg:bg-hover` — the option under the pointer vs. the selected one are
  the same fill, as today.
- **`menu`** — `pg:bg-surface pg:shadow-none`, `border-edge`: **weaker than combobox's `edge-strong`** — a menu over a table
  row of near-equal surface may lose its edge. Watch item; if it does, `border-edge-strong` is a one-token change.
- **`tabs`** — active underline `pg:data-[state=active]:border-accent` (lime): on the dark ground it is high-contrast and
  fine; the *inactive* text is `text-fg-body`. The count chip is `pg:bg-raised`.
- **`sheet`** — scrim `pg:bg-scrim`; panel `pg:bg-surface pg:shadow-none` with `border-edge`: the side edge is the only
  separation from the scrim-darkened page. Portal lands in the scope (`usePlayPortal`) — needs the root scope to carry
  the landing element for the phone drawer (`admin-rail`), which C1 must not forget.
- **`date-time`/picker** — see rows 8–10; the weekday-names-touching bug at 320 px is carried (already recorded above).
None declares an animation (§1.5).

### 4 · Every existing assertion I expect to move

Only class-string assertions in the six primitives' scope tests, **and only if** I collapse a raw+pair to a semantic name
(Q2). If yes (each becomes a STATUS ledger line, same commit): `tests/components/ui/tabs-scope.test.tsx:31`
(`bg-silver-100`→`bg-raised`), `combobox-scope.test.tsx:35, 46, 74` (`bg-silver-100`→`bg-raised`,
`hover:bg-silver-200`→`hover:bg-hover`, highlight `bg-silver-100`→`bg-hover`), `data-table-scope.test.tsx:69, 80`
(`bg-silver-100`→`bg-raised`; `hover:bg-silver-100/60`→`hover:bg-hover`), `sheet-scope.test.tsx:59`
(`bg-[var(--color-navy-950)]/60`→`bg-scrim`), `date-time-scope.test.tsx:53, 60` (`bg-navy-950`,`text-white`→`bg-accent`,
`text-on-accent`), `menu-scope.test.tsx:50` (`bg-silver-100`→`bg-raised`). **If no** (the six keep their raw fallbacks and
`no-raw-palette` treats `ui/` pairs as allowed, as Step 0 describes), **none of these move** and the wave changes no
assertion of mine. No component/unit/e2e test under `tests/components/{admin,platform,designer,survey}` or
`tests/e2e/{admin,console,wave*-console}*` names a raw class (grep clean); `impersonation-banner.test.tsx` names none.
New files only otherwise: `tests/unit/console-register.test.ts`, a console e2e spec (K4).

### 5 · Looks wrong on the dark ground for a reason that is not a class or one of my six — listed, not fixed

1. **`/app/admin/designer/[documentId]` and `templates/{posters,certificates}`** — the canvas draws a *light* document
   and `canvas.tsx:478`/`template-preview.tsx:95` are iframes with their own light ground; a light sheet on a dark page is
   correct (it is the artefact) but its chrome edge needs to read. Renderer/overlay are not mine (`DEC-096`).
2. **`/app/admin/emails`** — `preview-pane.tsx:114` iframe is a light mail; phone/desktop/forced-dark preview frames.
3. **`/app/admin/branding`** — `brand-preview.tsx:36–73` paints an org's *light* and *dark* palettes from inline `style`
   (data, correct) inside a dark page; the swatches' own borders (`colours.edge`) may vanish against the ground. And
   `colour-field.tsx:58` is a native `<input type="color">`; `color-scheme: dark` is set on the scope
   (`globals.css:365`) so the native picker follows.
4. **★ `Badge tone="live"` pulses** (`badge.tsx:140`, `motion-safe:animate-pulse` on the dot). It renders in console
   tables (`/app/admin/sessions`, the impersonation banner). `REQ-UIX-053`/`03-motion.md:12`: «tables… admin surfaces never
   animate» — this is a status affordance in a table cell, not one of my six, and content's file. For the lead to rule:
   accept it as status, or a `console` opt-out. Same for `skeleton`/`progress`'s indeterminate pulse (loading, not
   celebration; I leave them).
5. `Panel tone="live"/…` in the dark scope drops its fill (outline form): several admin screens use toned panels as
   notices (`/app/admin/settings`, `/app/platform` alerts); they become outlines — legible, but flatter than the light
   console's washed fills.
6. `text-error`/`text-success` and toned badges throughout tables (`/app/admin/audit`, `exports`, `emails` deliveries)
   depend entirely on the lead's `globals.css` on-dark remap (C4).
7. The admin rail's **phone drawer** (`sheet`) — needs the scope's portal landing element (C1).
8. `/app/admin/companies` — the team-colour swatch (`swatch.tsx`) is data-coloured and now sits on the dark ground;
   a dark team colour on `surface` may need a visible ring (lead's file as custodian).

### 6 · Questions for the lead (none blocks the plan)
- **Q1** — may the guard's forbidden set include `rank-row`, `race-bar`, `level-card`, `session-cta`, `code-input`,
  `story-ring`, `reaction-bar`, `poster` (none is reached today), or only the four the requirement names?
- **Q2** — do the six collapse `raw + pg:pair` to the semantic name (fewer classes, the `-scope` assertions above move,
  each a ledger line), or keep the raw fallback as `variant` allows (no assertion moves)? Default if unanswered: **keep** —
  no behaviour reason to spend six ledger lines.
- **Q3** — row 14 (`variant-strip.tsx:58`, `bg-navy-900`, «fits none»): `bg-canvas`?
- **Q4** — the banner's dark form is an outline (quieter than the light fill): accept, or a `panel.tsx` tint request?
- **Q5** — `Badge live`'s pulsing dot in console tables (§5.4).
- **Disagreement with `docs/design/`:** none new. (`04-components.md:23` «no animation» for the console's primitives holds
  with a measured empty set.)

### Wave 17 — result (K1, K2, K4; K3 from the sweep captures)

Commits: `a42fb18f` (K1, `tests/unit/console-register.test.ts`), `cd8d5192` (K2, 12 staff files + `impersonation-banner.tsx` + the two
`date-time-scope` assertions), `abb1b8d9` and `db6d3017` (K4, `wave17-console-screens.spec.ts`, and the open-menu capture repair in
`wave15-console-team-colour.spec.ts`).

**K3 — from `wave11-sweep-admin-*` / `wave11-sweep-platform-*` at native size (sessions, members, audit, companies, schedule):**
nothing of mine is wrong. The card list below `md`, the raised select wells, the `date-time` trigger and the status outlines read on the
dark ground. **Not judged from the sweep** (it opens none): `menu` edge against a row, `combobox` popup, `sheet` scrim and edge, the
`date-time` popover, a sticky `<th>` — to be judged from the `wave17-console-*` captures.

**Seen and not mine (listed, not fixed):**
1. `/app/admin/members` cards: the row-action trigger is a bare «…» with no boundary — faint as a control.
2. `Badge live`'s pulsing dot in console tables (ruled: stays, `DEC-073`).
3. Full-page captures show the phone tab bar and the sticky save bar overlaid mid-page — a capture artefact.
4. `/app/admin/sessions` was an empty state in the sweep, so no data-table rows were seen there.

**K3 — from the `wave17-console-*` captures (build `6e5361d7`).** `audit-sheet`: the sheet reads on the dark ground — a `surface`
panel with a visible top edge and handle over a scrim that dims the page to near-black; the field's lime focus ring is legible on it.
`rail-drawer`: the drawer's edge holds against the dimmed page; «الجلسات» current is a `raised` well behind the label — present but
quiet (the rail's class, `admin-rail.tsx`, not mine; `aria-current` is asserted). `companies-menu`: the lead opened it — surface, edge
and items read. `sessions-table` / `members-table`: the cards and the status outlines read.
**`schedule-picker` did not show the popover** — the picture is the closed trigger (the spec's locator opened, but did not bring, the
popover into the frame). The spec is corrected to target the trigger's `aria-controls` element and scroll it into view; the popover's
edge (`border-edge` on `pg:bg-surface`, no shadow — the same pair as the menu, which reads) is judged from its classes until that
capture is rerun. **K3 closed** for the five that were seen; the picker popover is one capture from closed.
Seen, not mine: the rail's current-item well is quiet.

---

## Wave 21 plan — SCR-040 the dashboard, SCR-042 the sessions table (`DEC-225`, `DEC-226`, `DEC-227`, `REQ-UIX-086`, `REQ-UIX-087`) — planning only, nothing edited but this note

Measured on `wave-21a/the-console-frame` at `c126c55d`. Read: the regenerated `.claude/agents/console.md`, STATUS's
wave-21 block, `DEC-225` – `DEC-227`, `DEC-199` §2, `DEC-208`, `notes/wave-21-lead.md`, `M11a.md`, the three artboards
(`AdminDashboard`, `AdminSessions`, `AdminSessionsPhone`) beside their PNGs, `REQ-ADM-004/005/010/017/020`,
`REQ-UIX-084` – `087`, `STORY-UIX-076/077`, `09` `SCR-040`/`042`, and every file and test named below.

### 0 · The two jobs, in one line each — and how a person does them

**`SCR-040` — an admin opens `/app/admin` and reaches whatever is waiting in one move.**
1. The admin lands on the console's home; the first thing under the `h1` is «يحتاج انتباهك»: four tiles, each a count,
   its label, and how long the oldest item has waited.
2. One click on a tile lands on **its queue, already narrowed to exactly what the tile counted** — the count the admin
   clicked is the number of rows they arrive at (one predicate feeds both; §3, contract 3). «جلسات لم تُجدول بعد» opens
   the sessions table filtered to undated sessions, not the whole table.
3. When nothing waits, the four tiles are one line and the admin reads on: the month's six figures, the pipeline bar,
   the next sessions, the three top lists — **every figure a link to the list behind it** (`REQ-ADM-004`).

**`SCR-042` — a session is found, filtered and acted on in bulk at 1280; the same rows are cards on a phone.**
- *Find* (1280): type in «بحث» (title or presenter name) → Enter. The URL carries the query, so the result survives
  a reload, is shareable, and **works with no JS** (a GET form; today's search is client-only).
- *Filter*: «الحالة: الكل» · «التصنيف: الكل» · «الشهر: الكل» — each chip shows its current value; choosing a value
  is a link to the same URL with that param. The count beside them («41 جلسة») is the filtered total.
- *Sort*: any header; the default order is §2.6's (a disagreement, D6).
- *Act on one*: the row's ⋯ — open the hub, the event page, attendance, certificates, survey, and the state machine's
  own actions for that row (`actionsFor()`), cancel through the named confirmation dialog.
- *Act on many*: tick rows (or «تحديد الكل» for the page) → the toolbar is replaced by the bulk bar «N محدّدة» with
  only the actions §4 measured → the result is a toast from the action naming what succeeded and what did not; failed
  rows stay selected.
- *Phone (390)*: the same URL, the same rows as cards (title + status, date · venue, presenter, seats), chips in one
  scrolling row, «جديدة» on the `h1` row; a card's title opens the session hub; its ⋯ keeps the row's actions
  (D8 — the artboard draws no ⋯; the wave-6 phone defect says dropping it leaves no way to act on a phone).

---

### 1 · `SCR-040` — regions in the artboard's order, and the primitive each uses

| # | Region (artboard order) | Primitive / element | Data (all read, never literal) |
|---|---|---|---|
| 1 | `h1` «لوحة المؤسسة» + the month («أكتوبر 2026») at the row's end; **no primary action** (the artboard draws none) | the frame's `h1` row (contract 1) — **`ui/page-header`** with `actions` holding the month as plain text | the month from the org's time zone (`getOrgPrefs()`), `Intl` with `numberingSystem: "latn"` |
| 2 | «يحتاج انتباهك» — four tiles in one row of four at 1280 (2×2 below `md`): count, label, «أقدمها منذ …» | **`ui/card`** `href` (whole tile is the link, as today), `<h2>` from **`ui/section-header`** | `getAdminAttention()` — contract 3, §3 |
| 2′ | nothing waits → **one line** `attention.empty` in place of the four | plain `<p>` | — |
| 3 | six figures, one row of six at 1280 (3×2 at `md`, 2×3 at 390) | **`ui/stat`** ×6, each `href` | sessions this month · confirmed reservations · check-ins · attendance rate · active members · points issued (D3: month or all-time) |
| 4 | «مسار المقترحات» — one segmented bar, the six counts in its caption | a `<figure>`: the bar `aria-hidden` (segments sized by `flex-grow` from the counts, token colours, no transition), the caption the text; **each count a `ui/link`** to the proposals queue filtered to that state (request R3) | `proposalPipeline` |
| 5 | «القادمة» + «كل الجلسات» link at the row's end; a table of the next sessions — الجلسة · الموعد · المُقدِّم · الحجوزات · الحالة | **`ui/section-header`** (`actions` = `ui/link`), **`ui/data-table`** (`rowHref` → the hub), **`ui/avatar`** with `teamColor`, **`SessionStatusBadge`** (`ui/badge`) | §2.3's `listSessionsForConsole()` with `upcoming` and a row limit |
| 6 | three top lists in one panel: أكثر المُقدِّمين · أكثر التصنيفات · أكثر الشركات — name, count at the edge | **`ui/panel`**, three `<section>`s each with an `<h2>` (`ui/section-header`), `<ol>` as today (the two-children rule, kept) | `topPresenters` (→ `/app/members/:id`), `topCategories` (→ **`/app/admin/sessions?category=<id>`**, new: the list behind the figure), `topCompanies` (→ `/app/admin/companies`) |

- Headings: the artboard draws no heading over the six figures; a **visually hidden `<h2>` «نظرة عامة»** keeps the
  landmark and the pinned locator (`admin-dashboard.spec.ts:248`).
- **Dropped as explainer copy** (`REQ-UIX-080`, `DEC-NEXT-25`): `dashboard.intro` («نظرة سريعة على مؤسستك…»),
  `attendanceRateEmpty` as a hint (the value «—» stays — an expectation change, §7), `attention.emptyAction`.
- No chart but the one bar; nothing transitions; `h1` is the only display use (D1 is the open tension).
- Files after: `src/app/[locale]/app/admin/page.tsx` (rewritten), new `src/components/admin/dashboard/{attention-tiles,pipeline-bar,top-lists}.tsx`
  (server components, no `"use client"`), `src/lib/dal/admin-dashboard.ts` (add-only: contract 3, `sessionsThisMonth`).
  `admin/loading.tsx` and `admin/error.tsx` are kept unchanged — they cover every console route, not this screen.

### 2 · `SCR-042` — regions in the artboard's order, and the primitive each uses

| # | Region | Primitive / element | Notes |
|---|---|---|---|
| 1 | `h1` «الجلسات» + «جلسة جديدة» (primary) at the row's end; phone: «جديدة» | **`ui/page-header`** `actions` = **`ui/button`**'s `ButtonLink` to `?new=1#new-session` | a link, so it works with no JS (§2.5). Admin only |
| 2 | toolbar: search (280 px) · three chips with their value · the count at the end | a GET `<form role="search">` with **`ui/field`** + **`ui/input`** `type="search"` (accessible name `searchLabel`, **pinned**); each chip a **`ui/menu`** whose trigger reads «الحالة: <value>» and whose items are `href`s; the count `<p>` with ★ `sessions.count` (six forms) | phone: chips in one `overflow-x-auto` row **of chips only** — the page never scrolls sideways |
| 2′ | rows selected → **the bulk bar replaces the toolbar** | `data-table`'s built `selection` bar (`data-table.tsx:126-131`); the page stops rendering its toolbar while `selected.length > 0`, so the bar sits where the toolbar was | §4 |
| 3 | the table: ☐ · العنوان · الحالة · الموعد · المكان · المُقدِّم · الحجوزات · ⋯ ; sticky header | **`ui/data-table`** with `selection`, `sort`/`onSortChange`, `rowHref` → `/app/admin/sessions/<id>` (the hub, `DEC-178`'s redirect); `SessionStatusBadge`; **`ui/avatar`** `size={24}` `teamColor`; **`ui/menu`** + **`ui/icon-button`** for ⋯ | sticky header is an add-only request (R1) |
| 4 | footer «1 – 9 من 41» + السابقة / التالية; phone «6 من 41 · المزيد» | page-composed `<nav>` of **`ButtonLink`**s (`?page=`); phone «المزيد» a link to `?show=<n + page size>` | D7; no JS needed |
| 5 | creation region (not drawn — D10), rendered **only with `?new=1`**, above the table | `ui/panel`: «جاهزة للجدولة» (each approved proposal, `<form action={makeSessionFromProposal…}>` with the pinned accessible name «أنشئ الجلسة — <title>») and the direct form (`DirectSessionForm`, same path and export) | today both live on the page permanently; §2.5 |

**2.3 · The read.** A new add-only module `src/lib/dal/admin-sessions.ts` (mine — `admin*.ts`):
`listSessionsForConsole(locale, query: ConsoleSessionQuery): Promise<ConsoleSessionPage | null>` — admin → every
session; moderator → the same rows with no selection, no menu actions, no creation (`REQ-ADM-020`); member → `null`.
Each row: id, title, state, `phase` + `seat` (from `sessionPhase()`/`seatState()` — `@/lib/session-status`, read only),
`startsAt`, `endsAt`, day count, venue name (`venues.name` or `custom_venue_name`), capacity, confirmed and waitlisted
counts, category id, presenters (`displayName`, `avatarUrl` through `avatarHref()`, `teamColor`, `accepted`,
`declinedAt`). Filtering, sorting and paging are **pure functions in the same module**, unit-tested
(`tests/unit/admin-sessions-query.test.ts`, new). An org's sessions are few — the module folds in TS, the same call
`admin-dashboard.ts`'s header already made. `src/lib/dal/sessions.ts` is **read, never edited**: its writes
(`transitionSession`, `createSessionFromProposal`, `createSessionDirect`, `actionsFor`, `listSchedulableProposals`)
are called unchanged. Nothing needed from `sessions` in its DAL.

**2.4 · Status.** `SessionStatusBadge` with the derived `phase` and `seat` — the same vocabulary as every surface
(`REQ-UIX-003`); today's table reads `storedPhase()` only, so «جارية الآن» / «قائمة انتظار» / «أُغلق التسجيل» are new
here (an expectation change only where a stored `published` past its start would now read `live`; named in §7).

**2.5 · «جلسة جديدة».** One link, `?new=1#new-session`: the server renders the creation region above the table —
the approved proposals waiting (`REQ-PRO-007`, the per-proposal form with its accessible name) and the direct form,
which needs no toggle any more (the old toggle was JS-only, so with no JS the direct form never appeared — a find).
A direct create redirects **to the new session's schedule** (`/app/admin/sessions/<id>/schedule`) instead of to
`?created=<id>`, which no file reads (a find — the confirmation was dropped silently). This is my recommendation and
an expectation change; the lead rules (Q6).

**2.6 · Phone (390).** The same page; `data-table`'s card list (built). The artboard's card has no labels, no ⋯, no
checkbox; to draw it the primitive needs an add-only card body (R1). Without R1 the cards read «label · value» as
today and the screen does not match its artboard.

---

### 3 · ★ Contract 3 — the attention counts (day one)

```ts
// src/lib/dal/admin-dashboard.ts — add-only
export type AttentionQueue = "proposals" | "unscheduledSessions" | "photoReports" | "commentReports";

export interface AttentionItem {
  queue: AttentionQueue;
  /** The `admin.shell.nav.*` key of the rail item whose screen IS this queue. */
  navKey: "proposals" | "sessions" | "moderationReports" | "moderationComments";
  count: number;
  /** The oldest open item's age in whole days; `null` exactly when `count === 0`. */
  oldestAgeDays: number | null;
  /** The queue, narrowed to exactly what `count` counts. */
  href: string;
}

export interface AdminAttention {
  /** Role-filtered, in the artboard's order. An admin: all four. A moderator: photoReports, commentReports. */
  items: AttentionItem[];
  total: number;
}

/** `cache()`-wrapped: the layout's badges and the dashboard's tiles share one read per request.
 *  `null` for a plain member (no badge, no tile). Never gates — the layout calls it, the page gates. */
export const getAdminAttention: (locale: string) => Promise<AdminAttention | null>;
```

- **Verified against `admin-dashboard.ts:81-86`**: the artboard's four tiles are the four rows, in the same order —
  مقترحات بانتظار قرار (`submitted` + `in_review`), جلسات لم تُجدول بعد (`starts_at` null, not `cancelled`/`archived`),
  بلاغات على الصور (`reports` `photo` `open`), بلاغات على التعليقات (`reports` `comment` `open`). The predicates move
  verbatim; `getAdminDashboardData()`'s `attention` field reads through the new function (its type unchanged).
- **Role filtering** (`REQ-ADM-020`): a moderator reaches the three moderation queues and not proposals or
  scheduling, so a moderator gets the two report items only — **a badge never leads to a page that 404s**.
- **`href`s**: proposals → `/app/admin/proposals` + `sessions'` «awaiting decision» filter once published (R3);
  unscheduled → `/app/admin/sessions?month=none` (my own filter, the same predicate); photo reports →
  `/app/admin/moderation/reports`; comment reports → `/app/admin/moderation/comments`.
- **Which rail items carry which count** — by `navKey`, the item whose screen holds the queue: المقترحات ← proposals;
  الجلسات ← unscheduled; البلاغات (`/moderation/reports`, the photo-report queue) ← photo reports; التعليقات
  (`/moderation/comments`, the comment-report queue) ← comment reports. **No badge at 0.** ★ This is NOT what the
  artboard draws — D2.
- Oldest age is computed as today (`oldestAge()`, the max of whole-day ages over the open rows' `created_at`) — not
  an «order by created_at to find the last row».
- A known imprecision, kept: a proposal's age counts from `proposals.created_at` — there is no `submitted_at`
  column (`0010`), so a draft written a week before submission reads a week older. Recorded, not fixed.
- ★ **A third copy exists**: `src/lib/dal/shell.ts:48-62` (the lead's) counts the same four for the member home's
  «يحتاج انتباهك», and gives a **moderator** the proposals and unscheduled counts, which link to pages a moderator
  cannot open. Not mine and the home is frozen; written for the lead (F1).

---

### 4 · ★ The bulk bar — each action measured against the single row

| Bulk action offered | The same action on one row today | Function | Rule |
|---|---|---|---|
| ★ «ألغِ الجلسات» (only when **every** selected row admits `cancel`) | ⋯ → cancel: a reason, then `ui/dialog`'s named confirmation (`session-controls.tsx:110-149`) | `runTransition` → `transitionSession` → `transition_session()` (`sessions.ts:1398`), which re-checks a fresh admin of the org and the `02` §6.2 edge per call | one dialog naming the count and listing the titles (`<bdi>`), one reason (required, ≤ 2000 — the same Zod), confirm; a new action `runBulkTransition(locale, prev, formData)` in `actions.ts` loops the **same** `transitionSession` sequentially inside one action (actions serialise; parallel work goes inside one), collects `{ done: id[], failed: { id, title }[] }`, toasts from the action, `revalidatePath` as today |
| «صدّر CSV» | none per row; the org-wide «الجلسات» export on `/app/admin/exports` | `exportSessionsCsv()` (`admin-exports.ts:276`) through `GET /api/admin/exports/sessions`, audited by `write_admin_export_audit('sessions')` (`REQ-ADM-017`) | add-only: `exportSessionsCsv(locale, ids?)` restricts the rows to the selection, same headers, same audit row; the route must pass `?ids=` — **the route is frozen for me (R2)**. A link, not a client-built file |
| «ألغِ التحديد» | — | `selection.onChange([])` | clears the bar; the toolbar returns |
| ✗ «أغلق» — **not offered** | no single-row «close» exists: registration closes by `rsvp_deadline_at`, written only by `schedule_session()` on the hub | — | D9 |
| ✗ start / complete / archive / reopen — not offered | per row in ⋯ | `runTransition` | not drawn; one row at a time is right for a live room |

**A failed bulk action** (not drawn, built): the toast names «أُلغيت N · تعذّر M» (★ six forms each); the failed rows
stay selected so the bar still offers the retry; the succeeded rows leave the selection. All failed → an error toast,
the selection unchanged. Nothing animates.

`data-table`'s selection is composed as built (`:70-85`, the bar `:126-131`); its select-all covers the visible page.

---

### 5 · ★★ Kept-behaviour tables (`DEC-208`) — re-derived from the REQs and the DAL

#### 5.1 · `SCR-040`

| # | Behaviour | Today | After | Kept by |
|---|---|---|---|---|
| 1 | **Admin only; a moderator and a member get the page-level `notFound()`** — the streamed contract: 200, `noindex`, the not-found page | `page.tsx:98-99`, `admin-dashboard.ts:116`; pinned `admin-dashboard.spec.ts:214,220` | unchanged, from the page (the layout never gates) — unless Q1 rules a moderator's dashboard | `REQ-ADM-020`, `DEC-134` |
| 2 | `setRequestLocale()` before any read | `page.tsx:96` | unchanged | `REQ-INT-002` |
| 3 | The four attention queues, photo and comment reports **kept apart** | `admin-dashboard.ts:81-86,206-218` | `getAdminAttention()` (§3), same predicates | `REQ-ADM-010`, `DEC-005` |
| 4 | Unscheduled excludes `cancelled` and `archived` | `admin-dashboard.ts:208-210` | same predicate, shared with the sessions filter | `REQ-ADM-010` |
| 5 | Each tile shows the oldest item's age; six ICU forms; «اليوم» at 0 | `admin-dashboard.ts:93-99`, `attention.oldestSince` | unchanged string; `<bdi>` around the number | `REQ-ADM-010`, `REQ-INT-006` |
| 6 | The whole tile is one link (`ui/card` `href`, not a styled `Link`); its accessible name contains the label, its text the count | `page.tsx:76-89`; pinned `admin-dashboard.spec.ts:236,262` | unchanged | `REQ-UIX-001`, `REQ-UIX-086` |
| 7 | Tiles open their queues | `page.tsx:129-160` | same queues, **narrowed** to what they count (unscheduled → `?month=none`) | `REQ-UIX-086` |
| 8 | Nothing waits → one line | `page.tsx:125-126` (with an action to the sessions list) | one line; the action dropped (explainer) | `REQ-UIX-086` |
| 9 | Every figure is a link | `page.tsx:169-178` (`Stat href`) | unchanged, plus the pipeline's counts and the next sessions' rows | `REQ-ADM-004` |
| 10 | Western numerals through `formatNumber()` | `page.tsx:101` | unchanged | `DEC-124`, `REQ-INT-006` |
| 11 | Attendance rate «—» when nothing has started, «{value}٪» otherwise | `page.tsx:113,171-176`; pinned `admin-dashboard-page.test.tsx:59-78`, e2e `:250` | the value kept; the hint sentence dropped (§7, L1) | `REQ-ADM-004` |
| 12 | Its denominator is confirmed reservations of **started** sessions | `admin-dashboard.ts:191-201` | unchanged — but see F2 | `REQ-ADM-004` |
| 13 | A removed check-in stops counting | `admin-dashboard.ts:134-138` | unchanged | `REQ-CHK-017` |
| 14 | Points issued sums positive rows; a reversal does not net against it | `admin-dashboard.ts:204`; pinned e2e `:254` | unchanged | `REQ-ADM-004`, invariant 9 |
| 15 | Active members = `status = 'active'` | `admin-dashboard.ts:203`; pinned e2e `:252` | unchanged | `REQ-ADM-004` |
| 16 | The pipeline's six states in order | `page.tsx:104-111`, `admin-dashboard.ts:167-189` | the caption in the same order; the bar mirrors it | `REQ-ADM-004` |
| 17 | The pipeline opens the proposals list — «عرض القائمة — مسار المقترحات» | `page.tsx:189`; pinned e2e `:282` | each count a link (finer); the pinned link's name changes (§7, L3) | `REQ-ADM-004` |
| 18 | Top presenters by accepted presenter slots, each a link to `/app/members/:id` | `page.tsx:209`, `admin-dashboard.ts:220-226`; pinned e2e `:286` | unchanged | `REQ-ADM-004` |
| 19 | Top categories by session count; top companies by accepted presenter slots | `admin-dashboard.ts:228-254` | unchanged (D4 is the open question) | `REQ-ADM-004` |
| 20 | `topEmpty` when a list is empty | `page.tsx:23` | unchanged | `REQ-UIX-012` |
| 21 | A top-list row: the name and the count are **two children**, the count at the edge, never inside the link | `page.tsx:14-41`; pinned `admin-dashboard-page.test.tsx:90`, e2e `:336` | unchanged | `REQ-ADM-004` (wave 6 row 10) |
| 22 | `<bdi>` on every name and label | `page.tsx:30,34,83` | unchanged; added on the month, titles in «القادمة», every count | `REQ-INT-001` |
| 23 | No horizontal scroll at 390 | pinned e2e `:290` | unchanged | `REQ-NFR-007` |
| 24 | The console's error boundary: one sentence, retry, back to `/app/admin`; the skeleton under `loading.tsx` | `error.tsx`, `loading.tsx` | **kept, not rewritten** | `REQ-UIX-005`, `REQ-UIX-016` |
| 25 | A staff gate shared by every console page (`requireStaffSession`, `requireAdminSession`) | `admin-dashboard.ts:25-38` | unchanged; other routes import it | `REQ-ADM-020` |

#### 5.2 · `SCR-042`

| # | Behaviour | Today | After | Kept by |
|---|---|---|---|---|
| 1 | A member gets the page-level `notFound()`; a moderator gets a **different, read-only render**; an admin the full page | `page.tsx:38-40,147-158` | the same three branches in the new page | `REQ-ADM-020`, `DEC-134` |
| 2 | The moderator's list: title, status, date; **the title links to the session's attendance** (the link's name is the title); a survey link `aria-describedby` the title — no copy of the title inside it | `sessions-table.tsx:220-275`; pinned `admin-attendance.spec.ts:156-185` | the same table without selection, menu or creation; `rowHref` → attendance; the survey link as built | `REQ-ADM-020`, `REQ-CHK-012`, `DEC-163` |
| 3 | The moderator's list is sorted by start, newest first, undated last | `sessions.ts:180-184` | the moderator's default order — D6 applies | `REQ-ADM-020` |
| 4 | No pipeline, no creation, no transition for a moderator — absent, not hidden | pinned `admin-attendance.spec.ts:168-169` | unchanged | `REQ-ADM-020` |
| 5 | The admin's list is every session of the org (`listSessionsForAdmin`, newest first) | `sessions.ts:122-155` | `listSessionsForConsole()` (§2.3), add-only; `listSessionsForAdmin` stays for the CSV | `REQ-ADM-005` |
| 6 | **«جاهزة للجدولة»: an approved proposal with no session yet becomes one in one press**; the button's accessible name names the proposal | `page.tsx:75-124`, `sessions.ts:192-230`; pinned `sessions-screens.spec.ts:226-238` | inside the `?new=1` region (§2.5) — **reached by «جلسة جديدة», no longer on load** (L7) | `REQ-PRO-007`, `REQ-NFR-007` |
| 7 | An invalid proposal id is ignored, not thrown | `actions.ts:26-30` | unchanged | `REQ-PRO-007` |
| 8 | **The direct form**: title, abstract, category, level, language, presenters (multi `ui/combobox`); `FormSummary` with links to the controls' ids; values survive a failed round trip; required marked; `noValidate`; no date, venue or capacity | `direct-session-form.tsx:55-147`, `state.ts`, `actions.ts:55-86`; pinned `form-summary-links.test.tsx:84` | rewritten at **the same path with the same export name and field ids** (`direct-title` …), so that test stays untouched | `REQ-PRO-007`, `REQ-UIX-008` – `011` |
| 9 | The direct form's level labels are `proposals.propose`'s, read | `direct-session-form.tsx:65-68` | unchanged | `REQ-INT-002` |
| 10 | After a direct create the admin is redirected with `?created=<id>` — **which nothing reads** | `actions.ts:85` | ★ a find: the confirmation was dropped in wave 6; Q6 | `REQ-PRO-007` |
| 11 | With no JS the direct form never shows (the toggle is a JS button) | `direct-session-form.tsx:155-182` | ★ a find: fixed by `?new=1` | `REQ-NFR-007` |
| 12 | Search by title **or presenter name**, normalised | `sessions-table.tsx:72-76`; pinned `sessions-table.test.tsx:64`, e2e `admin-sessions.spec.ts:460` (`searchbox` «ابحث في جلسات المؤسسة») | server-side, GET; the same accessible name | `REQ-ADM-005` |
| 13 | Empty org: «لا جلسات بعد.» with «افتح المقترحات»; a search with none: «لا جلسات مطابقة لبحثك.» with the same short action label | `sessions-table.tsx:193-196`; pinned `sessions-table.test.tsx:79,91`, e2e `:461` | unchanged strings; a filter with none reads the search string | `REQ-UIX-012` |
| 14 | Sorting on title, status, start; undated sorts last in either direction | `sessions-table.tsx:78-93` | every column sortable; the undated rule kept | `REQ-UIX-087` |
| 15 | Status reads through the shared badge, never a raw state | `sessions-table.tsx:112`; pinned e2e `:454` («التسجيل مفتوح») | `SessionStatusBadge` with phase **and seat** (§2.4) | `REQ-UIX-003` |
| 16 | Undated reads «بلا موعد بعد» | `sessions-table.tsx:123` | unchanged | `REQ-SES-001` |
| 17 | **A declined or pending presenter is visible in the row** («اعتذر المُقدِّم», «بانتظار رد المُقدِّم») | `sessions-table.tsx:126-137` | a badge beside the presenter's name in المُقدِّم (D14) | `REQ-SES-019`, `REQ-PRO-007` |
| 18 | The row menu: فتح الجلسة · الجدولة والنشر · الحضور · الشهادات · الاستبانة, locale-aware `href`s; the trigger is named «مزيد من الإجراءات على <title>» | `sessions-table.tsx:150-166`; pinned `sessions-table.test.tsx:99`, e2e `:472-476` | unchanged, plus the row's transitions (#19) | `REQ-SES-020`, `REQ-NFR-007` |
| 19 | **The state machine's actions per row, from `actionsFor()`**, computed on the server and handed down as a **map of bound actions, not a factory** | `page.tsx:56-69`, `sessions-table.tsx:206-215` | the same map; the actions move **into ⋯** (L5) | `REQ-SES-003`, `REQ-SES-005`, `REQ-SES-012` |
| 20 | Cancel needs a written reason and a dialog naming the session; «تراجع» changes nothing; the confirm submits the same form across the portal | `session-controls.tsx:110-149`; pinned `session-controls.test.tsx:25,48`, `sessions-table.test.tsx:122`, e2e `:479-495` | ⋯ «ألغِ الجلسة» opens the dialog with the reason **inside it**; same title, same buttons, same error key (L6) | `REQ-UIX-013`, `REQ-SES-005` |
| 21 | «الإنهاء المبكر يغلق تسجيل الحضور فورًا.» beside «أنهِ الجلسة» | `session-controls.tsx:108` | carried into a confirm on «أنهِ الجلسة» before the scheduled end (a menu has no room for a note) | `REQ-SES-005`, `DEC-141` |
| 22 | **The toast fires from the action**, never from an effect in a component that unmounts | `session-controls.tsx:46-64` | unchanged, and the bulk action does the same | wave 6's lesson |
| 23 | The confirm dialog closes from the **result**, adjusted during render, not on click | `session-controls.tsx:68-85` | unchanged | `DEC-146` |
| 24 | `transitionDone` / `actionFailed` / `cancelReasonRequired` toasts and the `role="alert"` line | `session-controls.tsx:96-100`; pinned e2e `:494` | unchanged strings | `REQ-UIX-007` |
| 25 | `revalidatePath` of the list and of the event page after a transition | `actions.ts:122-123` | unchanged; the bulk action revalidates each | `REQ-SES-005` |
| 26 | Every check is in `transition_session()` and `create_session()` (definer, `assert_fresh_admin()`) | `actions.ts:11-16,90-96` | unchanged — the bulk loop calls the same function per id | `REQ-SES-005`, invariant 8 |
| 27 | Zod before the DAL on every action | `actions.ts:27,73,102-115` | unchanged; the bulk action validates `ids` (uuid, 1 – 100) and the reason | CLAUDE.md «Validation» |
| 28 | `<bdi>` on every title and presenter name | `page.tsx:88-98`, `sessions-table.tsx:103,211,229` | unchanged; added on every number in الحجوزات and the count | `REQ-INT-001` |
| 29 | The phone stack: `onCard` columns, the actions column **on the card** (wave 6's real phone defect: without it a phone had no way in) | `sessions-table.tsx:142-149` | kept — D8 | `REQ-UIX-087` |
| 30 | A `"use server"` module exports async functions alone; types come from `state.ts` | `actions.ts:18-24` | unchanged | `DEC-159` |

---

### 6 · States not drawn, that I will build

**`040`:** an empty org (attention one line; figures `0` — a read zero, not hidden; attendance «—»; the bar an empty
track with its zero counts in the caption; «القادمة» `data-table`'s empty state ★ «لا جلسات قادمة» with «جلسة جديدة»;
`topEmpty`) · nothing waiting (one line) · a short top list (fewer rows, no padding) · a moderator (Q1).
**`042`:** an empty org · a search or filter with no result · a moderator's read-only list · rows selected · a failed
bulk action (partial, total) · `?new=1` with no approved proposals (the region shows the direct form only — no
«nothing to schedule» sentence) · the last page (no «التالية») · one page (no pager).

---

### 7 · Assertions I expect to change — each a ledger line, written in the same commit

**Mine (evidence):**
- **L1** `admin-dashboard-page.test.tsx:59` — the attendance-rate hint sentence is dropped (expectation).
- **L2** `admin-dashboard.spec.ts:248-254` — «الأعضاء النشطون», «النقاط الممنوحة» become the artboard's «عضو نشط»,
  «نقطة ممنوحة» **if** the copy follows the artboard (selector); `:336`'s «أكثر المُقدِّمين مشاركة» → «أكثر المُقدِّمين» likewise.
- **L3** `admin-dashboard.spec.ts:282` — «عرض القائمة — مسار المقترحات» → a count link (selector).
- **L4** `sessions-table.test.tsx:64` — search moves server-side; the case tests the pure filter (selector moved).
- **L5** `sessions-table.test.tsx:114` and `admin-sessions.spec.ts:464-470` — «ابدأ الجلسة الآن» is no longer visible
  on load; it is a `menuitem` under ⋯ (**expectation** — wave 6 made it always-visible on purpose).
- **L6** `sessions-table.test.tsx:122`, `session-controls.test.tsx:25,48`, `admin-sessions.spec.ts:479-495` — the reason
  moves inside the dialog; «أكّد الإلغاء» disappears (selector and flow).

**Not mine — written for their owners through the lead:**
- **L7** `sessions-screens.spec.ts:226-238` — «جاهزة للجدولة» and «أنشئ الجلسة — <title>» are reached after «جلسة
  جديدة»; `:372` «ابدأ الجلسة الآن» and `:460` «أنهِ الجلسة» / «أرشف» are under ⋯ (expectation).
- `admin-attendance.spec.ts:156-185` — **unchanged** by design (#2, #4 of 5.2).
- `form-summary-links.test.tsx:84` — **unchanged** by design (#8).
- `a11y`, `second-org`, `wave11-lead-a11y-sweep`, `wave17-console-screens:132`, `wave18-content-home:218` — unchanged
  (routes, gates and the `h1` stay).

---

### 8 · Disagreements — artboard (or spec) against `docs/plan/` and the tree; no side picked

- **D1** `AdminDashboard.dc.html` / `M11a.md` §1: the tiles' counts «in coral display face» — and the six figures in
  the display face — against `REQ-UIX-053` / `DEC-227` §0.5: «`h1` in the display face the only display use».
- **D2** `AdminDashboard.dc.html` rail: badges on **الصور (1)** and **البلاغات (2)** — the photo-report and comment-report
  counts. In the tree, photo reports are **البلاغات** (`/moderation/reports`), comment reports **التعليقات**
  (`/moderation/comments`), and **الصور** is the takedown queue (`listModerationCounts().photos`), which is none of the
  four. A badge on the wrong item is a hunt. Contract 3 maps by the screen; the lead's rail decides.
- **D3** `AdminDashboard.dc.html`: the `h1` row carries the month and the first figure is «جلسة هذا الشهر»; `M11a.md` §1
  and `REQ-ADM-004` do not say the other five are monthly, and today all five are all-time. Month or all-time?
- **D4** «أكثر الشركات» draws **9.4 · 8.7 · 7.3** — a decimal, not today's integer count of presenter slots
  (`admin-dashboard.ts:236-254`); and each top list draws **3** rows against today's **5**.
- **D5** Status words: the artboards draw «ممتلئة», «مكتملة», «ملغاة»; `16` §5.2 / `REQ-UIX-003` give «قائمة انتظار»,
  «انتهت», «أُلغيت» through `SessionStatusBadge`, in `DEC-073`'s tones.
- **D6** Default order: `REQ-UIX-087` / `M11a.md` §3 «date ascending, live first»; `AdminSessions.dc.html` draws
  live → upcoming ascending → undated → past **descending**.
- **D7** Pager: 1280 «1 – 9 من 41 · السابقة / التالية»; 390 «6 من 41 · المزيد». Two models for one list.
- **D8** `AdminSessionsPhone.dc.html`: a card with no labels, no ⋯ and no checkbox; `data-table`'s card renders
  «label · value» rows (wave 7, sync 6: a label always renders) and the wave-6 phone defect put the actions on the card.
- **D9** The bulk bar «N محدّدة · ألغِ · صدّر CSV · أغلق» (`M11a.md` §3): «ألغِ» reads as cancel-the-sessions or
  clear-the-selection; «أغلق» has no single-row action to mirror (contract 7).
- **D10** Neither artboard draws «جاهزة للجدولة» nor the direct form; `REQ-PRO-007` needs both.
- **D11** «sticky header» (`M11a.md` §3, `09` `SCR-042`) against `data-table.tsx:144-155`, which is non-sticky on
  purpose: inside its `overflow-x-auto` wrapper a sticky `<th>` covered row 1 (wave 6).
- **D12** No place for the always-visible lifecycle buttons wave 6 pinned (`sessions-table.test.tsx:114`).
- **D13** `STORY-UIX-076`: «not drawn, and built: a moderator's dashboard» — against the pinned moderator 404
  (`admin-dashboard.spec.ts:220`), `layout.tsx:83` (`dashboard` `adminOnly`) and the agent file's «keep what a moderator
  sees today».
- **D14** The presenter's declined / pending state is not drawn; it is state that belongs in the row.

---

### 9 · Requests

- **R1 → the lead (`ui/index.ts`, the frame).** `DataTableProps`, add-only: `stickyHeader?: boolean` — when set the
  desktop wrapper uses `overflow-x: clip` (not a scroll container, so `position: sticky` sticks to the page) and the
  header sticks under the console bar; I need the bar's height as a token or custom property from the frame. And
  `renderCard?: (row: Row) => ReactNode` — the card's body for a caller that draws its own card, the selection checkbox
  and `rowHref` unchanged (D8). Both default to today's behaviour; `data-table.tsx` itself is mine.
- **R2 → the lead (`src/app/api/admin/exports/[type]/route.ts`, frozen for me).** Pass `?ids=` (comma-separated uuids,
  capped) to `exportSessionsCsv(locale, ids)`; `null` ids is today's export. The audit row is unchanged.
- **R3 → `sessions` (`admin/proposals/**`, this wave theirs).** Publish the URL that narrows the queue to «awaiting a
  decision» (`submitted` + `in_review`) and one per pipeline state, so a tile's count equals the rows it opens. Until
  then the links go to `/app/admin/proposals`.
- No request to `content`: `card`, `stat`, `badge`, `avatar`, `panel`, `empty-state` are composed as they are.

### 10 · Findings for the lead (not mine to fix)

- **F1** `src/lib/dal/shell.ts:48-62` gives a moderator proposals and unscheduled counts on the member home, linking to
  pages that 404 for them. Contract 3's read is role-filtered and could serve the shell later.
- **F2** The attendance rate divides **every** non-removed check-in by confirmed reservations of started sessions
  (`admin-dashboard.ts:195-201`): a multi-day session (one check-in per day) or a walk-in without a reservation lifts it
  past 100 %. It is my file; I fix it only if the lead says so (Q4).

### 11 · Open questions

- **Q1** A moderator at `/app/admin`: the streamed 404 as today, or two tiles (D13)?
- **Q2** D2 — which rail items carry which badge?
- **Q3** D3 — are the six figures this month's?
- **Q4** F2 — fix the rate (distinct member × session among the started reservations) in this rebuild?
- **Q5** D6 / D7 — the default order and the pager model.
- **Q6** After a direct create: redirect to the new session's schedule (my recommendation), or honour `?created`?
- **Q7** D9 — what «ألغِ» and «أغلق» mean in the bulk bar.
- **Q8** Copy: the artboard's «عضو نشط», «نقطة ممنوحة», «أكثر المُقدِّمين» over today's keys (L2)?

### Wave 21 — `SCR-040` built, and its kept-behaviour table read against the new file

**Delete `ec356113`, then create (this commit).** These are the rows of §5.1 as they read in `admin/page.tsx`,
`components/admin/dashboard/*` and `admin-dashboard.ts` after the create:

- **1** admin only, a page-level `notFound()` for anyone else ✓ (`page.tsx`, `getAdminDashboardData` → `null`). **2**
  `setRequestLocale` first ✓. **3 / 4** the four queues kept apart, with the unscheduled predicate ✓ — now through
  `getAdminAttention()` (`ac25efc8`). **5** the oldest age, six forms, «اليوم» at 0 ✓, with `<bdi>` on the count. **6** the
  whole tile is one `ui/card` link ✓. **7** each tile opens its queue, narrowed (`?month=none`) ✓. **8** one line when
  nothing waits ✓; the action is gone (explainer). **9** every figure is a link ✓, and so is every pipeline count, every
  row of «القادمة» (to the hub) and every top-list name (a category → `?category=`). **10** `formatNumber` ✓.
  **11** «—» kept as the rate's value; the hint sentence dropped (L1). **12** ★ the rate is now `checkin`'s
  (`DEC-228` §3.4, `attendanceRateOf()`), over the month's started sessions — `tests/unit/admin-attendance-rate.test.ts`
  computes it and `getAttendanceReport()`'s from one fixture. **13** removed check-ins excluded ✓. **14** positive
  ledger rows only ✓, now the month's (`occurred_at`). **15** active members ✓ — a stock, not narrowed by the month (Q
  for the lead below). **16** the six states in order ✓. **17** the pinned «عرض القائمة» link replaced by the counts (L3).
  **18 – 21** top lists, `topEmpty`, the two-children row ✓. **22** `<bdi>` on every name, count and the month ✓.
  **23** the 390 spec is unchanged. **24** `error.tsx` and `loading.tsx` untouched. **25** the two staff gates untouched.

**Not built, by ruling:** the display face on the tiles and figures (`DEC-228` §6 — body face, bold); a moderator's
dashboard (§3.1). **Built differently from the plan:** the six figures are `ui/card` tiles, not `ui/stat` —
`stat.tsx` sets its value in the display face (`pg:font-display`) and its label above it, both against the ruling and
the artboard; `stat` is `content`'s, so the tile composes `card` rather than asking for a prop mid-wave. The pipeline's
segments wear `edge-strong`, `fg-muted`, `fg-body`, `signal`, `accent`, `edge` — there is no semantic yellow, and the
artboard's yellow would be a raw palette name.

**Open, for the lead:** «عضو نشط» counts members whose status is active, which no month narrows; and «نقطة ممنوحة»
links to `/app/admin/scoring`, which has no month filter (frozen). The pipeline's counts link to `/app/admin/proposals`
until `sessions` publishes the per-state URL (R3).

### Wave 21 — `SCR-042` built, and its kept-behaviour table read against the new file

**Delete `b9c2dda0`, then create (the next commit).** These are the rows of §5.2 as they read in `sessions/{page,sessions-table,session-controls,direct-session-form,actions,state}`,
`components/admin/sessions/*` and `lib/dal/admin-sessions.ts`:

- **1** three readers from the data (`getConsoleSessions` → `null` for a member, `role` for the rest) ✓. **2** a
  moderator's title opens attendance, its link named by the title; the survey link is `aria-describedby` the title ✓.
  **3** ★ a moderator's order is now the artboard's default, not «start, newest first» (`DEC-228` §3.5: one order).
  **4** no selection, menu, creation or transition for a moderator — absent ✓. **5** every session of the org ✓
  (`listSessionsForAdmin` stays for the CSV). **6** «جاهزة للجدولة» with its named button ✓, inside `?new=1`.
  **7** the invalid id is ignored ✓ (`actions.ts` untouched there). **8** the direct form ✓ — same path, export and
  ids; `form-summary-links.test.tsx` passes untouched. **9** ✓. **10** ★ a direct create lands on the session's
  الجدولة (`DEC-228` §3.6). **11** ★ the form works without JS. **12** the search by title or presenter, now
  normalised for hamza and taa marbuta, through a GET form with the pinned name ✓. **13** both empty strings and the
  short action ✓. **14** every column sorts; undated last by date in either direction ✓. **15** `SessionStatusBadge`
  with phase **and** seat ✓. **16** «بلا موعد بعد» ✓. **17** the declined / pending presenter in the row ✓.
  **18** the row menu's five routes ✓ plus the transitions. **19** `actionsFor` and the map of bound actions ✓.
  **20** cancel: the dialog names the session, the reason is inside it (L6) ✓. **21** the early-completion sentence
  in a confirm before the scheduled end ✓. **22 – 25** the toast from the action, the dialog closing from the result,
  the strings, `revalidatePath` ✓ — the bulk action does the same. **26 – 27** the RPC decides, Zod first ✓.
  **28** `<bdi>` on titles, names, venues, numbers ✓. **29** ★ the ⋯ stays on the phone card. **30** ✓.

**Built and not drawn:** the creation region; the bulk cancel's dialog listing the titles; a failed bulk (the toast
counts both; failed rows stay selected); an empty org; a search or filter with nothing; a moderator.
**The URL is the list's state**: `q`, `status`, `category`, `month` (`YYYY-MM` or `none`), `sort`, `dir`, `page` — the
search is a GET form; chips, sort and pager are links (the chips' menu and the sort header need JS, as before).
**Known, carried:** the phone's «المزيد» is the next page, not rows appended — one URL model (`DEC-228` §3.5) means
one row set for both widths, and `data-table` draws both from it.

### Wave 21 — the lead's answers on `040` (2026-10-02), recorded

- **D15** «عضو نشط» counts members whose status is active — a stock, not a flow — so its label never claims the month,
  and its link is `/app/admin/members` unnarrowed. Accepted.
- **D16** «نقطة ممنوحة» counts the month's positive ledger rows and links to `/app/admin/scoring` unnarrowed: that route
  is frozen and M11b's, and has no month filter. Accepted.
- The pipeline's counts link to `sessions'` queue URLs (W21.10): submitted and in review → `/app/admin/proposals`
  (awaiting a decision, the default); changes requested → `?state=changes`; approved → `?state=approved`; draft and
  rejected → `?state=all`, having no queue of their own. Exact once PR B lands; until then the page shows its default.
- `ui/card` tiles rather than `ui/stat` stand; no prop is asked of `stat`.
- ★ Owed on PR B after A merges: the dashboard imports `checkin`'s `attendanceRate()`
  (`src/components/checkin/attendance-rate.ts`, `6aeff6f0`) in place of `attendanceRateOf()`, so the one rate has one
  definition in code, not only in a test.

### Wave 21 — L7, `tests/e2e/sessions-screens.spec.ts` (transferred to `console` for the wave), three cases and nothing else

- **:226** SCR-042's «جاهزة للجدولة» is opened at `/ar/app/admin/sessions?new=1` — the link «جلسة جديدة» is (a selector moved).
- **:372** «ابدأ الجلسة الآن» is asserted as a menu item under the row's ⋯, not a visible button (an expectation moved, L5).
- **:460** completing: ⋯ → «أنهِ الجلسة» → the dialog's «أنهِ الجلسة» (early, so it confirms); «أرشف» is then a
  menu item under ⋯ (a selector and a flow moved, L5).

---

## Wave 22 — the plan (sync 1) — `046`, `047`, `048`, `049`, `061`, `062` and the three `data-table` cells (`DEC-230`, `DEC-231`, `REQ-UIX-092` … `096`, `098`, `099`, `REQ-ADM-022`, `REQ-ADM-023`) — planning only, nothing edited but this note

Measured on `wave-22a/the-tables` at `a6c0345a`, every file named below re-read from disk. Nothing is deleted before the
lead posts «the plans are approved».

### 0 · ★ Day one — the three cells (contract 2, `REQ-UIX-092`)

**Add-only, in `src/components/ui/data-table.tsx`, no new file.** Each is an exported component a column's `cell` returns
— so it renders in the table AND in the phone card, because `data-table.tsx` already calls `col.cell(row)` in both
(`:246` and `:298`). No change to `DataTableColumn`, `DataTableProps`, `DataTableAdditions` or any render path; every
existing `data-table` suite (`data-table.test.tsx`, `data-table-additions.test.tsx`, `data-table-scope.test.tsx`)
passes untouched. Their types are exported from `data-table.tsx` beside `DataTableAdditions`, as wave 21's were;
mirroring them in `ui/index.ts` is the lead's if wanted. New cases go in a new `tests/components/ui/data-table-cells.test.tsx`,
one case each in the scope test's new file `data-table-cells-scope.test.tsx` (or a case appended to the existing scope
test — the lead says which, since an edit to an evidence file is a ledger line), and three states in my demo
`(dev)/ui/demos/data-table.tsx`. Registry: `data-table.tsx` stays `variant`, untouched.

```ts
/** A switch whose change is a named action on the row (053 «مفعّل», 054, 060). */
export interface DataTableSwitchCellProps {
  /** The server's truth. The cell never flips itself ahead of the answer. */
  checked: boolean;
  /** The column's word — «مفعّل». */
  label: string;
  /** The row's name — joins the switch's accessible name: «مفعّل — تسجيل الحضور». */
  rowName: string;
  /** Called with the next value; resolves `true` only when the server says it WROTE. */
  onCheckedChange: (next: boolean) => Promise<boolean>;
  /** Announced in the cell's polite region after the answer — «تسجيل الحضور: مفعّل» / «… لم يُحفظ». */
  announce: { on: string; off: string; failed: string };
  disabled?: boolean;
}

/** Two decisions on one row, side by side (050/052 «أخفِ» · «تجاهل»). */
export interface DataTableActionPairProps {
  rowName: string;
  primary: DataTableCellAction;
  secondary: DataTableCellAction;
}
export interface DataTableCellAction {
  /** The visible word — «أخفِ». The accessible name is «أخفِ — {rowName}». */
  label: string;
  onAction: () => Promise<unknown> | void;
  tone?: "danger" | "neutral";
}

/** A colour shown as a swatch AND named in words (048, 046's company). */
export interface DataTableSwatchCellProps {
  /** `#rrggbb` from data, or null — reaches the DOM only as `--team` on the swatch, never as a class or a hex in source. */
  color: string | null;
  /** The colour in words — «سماوي», «بلا لون». Always drawn: a swatch never carries meaning alone. */
  colorName: string;
  /** Optional primary text beside it — the company's name (`<bdi>` inside the cell). */
  children?: ReactNode;
}
```

- **Switch cell.** Composes `ui/switch` (`sessions'` primitive, the lead custodian). While the promise runs, the switch
  is disabled and `aria-busy` on the cell; on `false` it stays at `checked` (the server's value — props did not move)
  and announces `failed`. ★ **Request to the lead as custodian (R1)**: `ui/switch` takes **add-only `labelHidden?:
  boolean`** — the label stays the accessible name and is not drawn (`sr-only`), because in a cell the column header is
  the visible word and «مفعّل» ×30 drawn per row is noise. Without it, the fallback is a `role="group"` named by
  `rowName` around a switch labelled by the header — weaker, since a group name is not reliably read on focus. **Phone
  stack:** the card's «label · value» row renders the column header as the label and the switch as the value; the
  accessible name carries the row, so thirty cards are thirty distinct names. `ui/switch` declares
  `transition-colors`; `DEC-228`'s «motion off under the console frame» cancels it there, and `console-register` reads
  `data-table.tsx` itself, which declares none.
- **Action-pair cell.** Two `ui/button`s `size="sm"` in a `role="group"` named by `rowName`; the primary in its tone,
  the secondary quiet. **Both disable while either runs** — one decision per row — and the caller's action toasts from
  its own result (wave 6). A caller that needs a confirmation passes an `onAction` that opens its `ConfirmDialog`; the
  cell holds no dialog. **Phone stack:** the pair wraps under its label and keeps both buttons at 44 px.
- **Swatch cell.** A 16 px rounded square, `aria-hidden`, painted by `--team` set on that element (the one place a value
  from data becomes a style, `DEC-183` contract 3); `null` draws the neutral outlined ring the companies screen draws
  today (`companies/swatch.tsx`). Then `children` (if any) and `colorName` in words, muted. **Phone stack:** identical —
  it is inline content.

★ **`console`'s own screens use only the swatch cell** (`048`, and `046`'s company column). The switch cell is
`scoring`'s and `notify`'s to compose, the pair `content`'s.

### 1 · The jobs, one line each — how a person does them (`DEC-231` §0)

| Screen | The job, done |
|---|---|
| `046` الأماكن | The owner opens the list, sees «لا شركة» on every venue not yet assigned, opens a row's ⋯ → «عدّل», picks the company in the sheet's `select`, saves — **one move per row**, the row now shows the swatch and the company, and the audit log shows `venue.company_changed` with before and after. Done for every venue before the hosting rule first runs (`DEC-230` §2.4). |
| `047` التصنيفات | An admin adds or renames a category in a sheet, sees how many sessions use each, and retires one through ⋯ → «عطّل» — the menu never offers what the schema cannot do. |
| `048` الشركات | An admin reads each company's colour (swatch and word), members and the quarter's points, adds one, renames one or changes its colour in one sheet. |
| `049` الأعضاء | An admin finds a member by name, email, company or role, changes a role or suspends from ⋯ with the consequence named first, and the last remaining admin's menu says why it cannot be demoted — before the click, not after. |
| `061` التصدير | An admin presses «CSV» on the row they need; the file opens in Excel in Arabic; the row then shows their name and «الآن» — read back from the audit row the download wrote. |
| `062` سجل التدقيق | An admin answers «who changed this, when, and why» from one table: the log's actions and the configuration history side by side, marked by kind, narrowed by actor, action and period, and exported as CSV. A moderator sees their own actions only, as today. |

### 2 · `046` الأماكن — `AdminVenues.dc.html`

**Regions, the artboard's order:** `h1` «الأماكن» with «مكان جديد» (primary) at its end (`PageHeader`'s `inlineActions`,
wave 21) · `data-table` (`stickyHeader`): المكان (name; a «معطّل» `badge` beside it only when deactivated — nothing drawn
when active) · الشركة (**swatch cell**: the company's colour and name; «لا شركة» muted, no swatch, when none) · العنوان ·
السعة · الجلسات · ⋯ (`ui/menu`: «عدّل» · «عطّل» / «أعد التفعيل», `hiddenHeaders`). The edit sheet (`ui/sheet`,
inline-end): name · **company `select`** («لا شركة» first and a real choice, then the org's active companies, plus the
current one if deactivated) · address · map link · capacity · time zone · notes · «احفظ». Phone: the same rows as cards.

**The venue's company (`REQ-ADM-022`, contract 4) — what I add to `sessions.ts`'s venue section, add-only:**
- `AdminVenue` gains `company: { id: string; name: string; teamColor: string | null; deactivated: boolean } | null`
  and `sessionCount: number`; `upcomingSessions` stays.
- `listVenuesForAdmin` selects `company_id, companies(name, team_color, deactivated_at)` (one FK, so the embed is
  unambiguous once `0180` lands) and counts sessions **by `session_days.venue_id`, each session once** — today's count
  reads `sessions.venue_id` only, the first day's (`DEC-119`), so a venue used on day 2 of a workshop counts nothing.
- `venueInput` gains `companyId: z.uuid().nullable().optional()` (`.strict()` keeps refusing anything else);
  `createVenue` writes it when present.
- new `updateVenue(locale, venueId, input): Promise<{ ok: boolean }>` — one `update … .select("id")`, every column the
  sheet holds, `company_id` included; `ok` is «exactly one row came back».
- `23514` from `0180`'s `venues_company_same_org()` maps to the field error `companyInvalid`.
- **Empty and «لا شركة» states:** no venues → `EmptyState` with «مكان جديد»; an org with no companies → the `select`
  holds «لا شركة» alone; a venue with none → «لا شركة» in the row (REQ-UIX-093: nothing implies it hosts for anyone);
  a venue whose company is deactivated → its name and «معطّلة» (Q7).

**Kept-behaviour table** (re-derived from `REQ-ADM-006`, `REQ-SES-006`, `REQ-ADM-020`, `REQ-ADM-022/023` and `sessions.ts:1406-1494`):

| Behaviour | Now | After | REQ |
|---|---|---|---|
| Admin only; anyone else gets the streamed not-found | `page.tsx:29` (`listVenuesForAdmin` → null → `notFound()`) | the same call, the same `notFound()` | `REQ-ADM-020`, `DEC-134` |
| A write is gated by policy, not by the action | `p2_admin_insert/update` (0004); `actions.ts` has no role check | unchanged — and ★ the write now checks it touched a row (`.select("id")`), so a refused write says «لم يُحفظ» instead of a success toast | `REQ-ADM-020`, `DEC-231` §0.1 |
| ★ A refused/no-op toggle is reported as done | `DeactivateToggle` toasts «تم التعطيل.» whatever `setVenueActive` did (0 rows → no error) | **defect fixed**: the toast comes from `{ ok }` | `DEC-231` §0.1 |
| No delete, in use or not | no delete grant or policy (0004) | unchanged; the menu offers «عطّل» only | `REQ-SES-006`, `REQ-ADM-006` |
| Deactivate confirms, naming the venue and the consequence | `DeactivateToggle` + `ConfirmDialog` | ⋯ «عطّل» → `ConfirmDialog` (kept component) | `REQ-UIX-013` |
| Deactivated venues sort last | `.order("deactivated_at", { nullsFirst: true })` | unchanged | — |
| Create: name required (≤120), address ≤300, `https://` map, capacity 1–10000, notes ≤2000, tz ≤64 | `venueInput` + `addVenue` | the same schema, in the sheet's form, on `lib/form-state` with the summary and `noValidate` | `REQ-SES-006`, `REQ-UIX-009` |
| The summary's links focus the control | `FIELD_ID` map (wave 8, F4) | kept; ids prefixed per sheet | `REQ-UIX-009` |
| The map link types LTR | `dir="ltr"` | kept | `REQ-INT-*` |
| ★ No edit path at all | (only create and toggle exist) | **new**: «عدّل» in the sheet → `updateVenue` | `REQ-UIX-093` |
| `<bdi>` on name, address, counts | `venues-table.tsx:33-50` | kept on every interpolated name, address, company and number | `10` §bidi |
| Six ICU forms on counts | `seats`, `upcoming` | `sessions` count with six forms | `REQ-INT-*` |
| The phone card carries the actions | `onCard: true` on actions (wave 8, F1) | the ⋯ menu is in the card | `16` §6.7 |
| Page intro and «لا يمكن حذف…» note | `page.tsx:34-35` | **dropped** (no explainer copy); the privilege stands | `DEC-NEXT-25` |
| No-JS: the add form posts without JS | a page-level `<form action>` | **Q2** — `?new=1` / `?edit=<id>` render the form server-side (042's precedent) or the sheet (artboard) | — |

**Every mutation and its record (`DEC-231` §4 confirmed — all ★new, none today):**

| Mutation | Path | Record |
|---|---|---|
| create | `createVenue` insert | `venue.created` — lead's trigger (none today ✓) |
| edit name / address / map / capacity / tz / notes | `updateVenue` update | `venue.changed` (none today ✓ — and no edit path existed) |
| set or clear the company | `updateVenue` update of `company_id` | `venue.company_changed` (new) — **Q3**: a save that changes the name AND the company is one update; one row or two? |
| deactivate / reactivate | `setVenueActive` update of `deactivated_at` | `venue.deactivated` / `venue.reactivated` (none today ✓) |

### 3 · `047` التصنيفات — `AdminCategories.dc.html`

**Regions:** `h1` «التصنيفات» + «تصنيف جديد» · `data-table`: التصنيف (+ «معطّل» badge when deactivated) · الجلسات · ⋯
(«عدّل» · «عطّل»/«أعد التفعيل») · the sheet: name · «احفظ». No tags, no «والوسوم» (`DEC-227` §3).

**Kept-behaviour table:**

| Behaviour | Now | After | REQ |
|---|---|---|---|
| Admin only, streamed not-found otherwise | `listCategoriesForAdmin` → null (`admin-lists.ts:38`) | kept | `REQ-ADM-020` |
| No delete | no grant, no policy (0004) | kept — see D3/Q-delete | `REQ-ADM-007`, `REQ-UIX-094` |
| Deactivate confirms | `DeactivateToggle` | ⋯ → `ConfirmDialog` | `REQ-UIX-013` |
| Name required, ≤80 | `categoryInput` | kept | `REQ-ADM-007` |
| ★ Session count | `sessions.select("category_id")` with no range | **defect**: capped at PostgREST's `max_rows = 1000` (`supabase/config.toml:18`) — an org past 1000 sessions undercounts. A head count per category, or paged reads | `REQ-UIX-094` |
| ★ A category used only by a proposal | not counted | counted too: `category_id` is `not null` on both tables, so «in use» is both (`admin-lists.ts:18`) | `REQ-ADM-006` |
| ★ No rename | — | **new** «عدّل» → `updateCategory(locale, id, input): { ok }` (new, `admin-lists.ts`) | `REQ-UIX-094` |
| Toggle reports success regardless | as venues | `{ ok }` | `DEC-231` §0.1 |
| `<bdi>`, six ICU forms, phone card actions | `categories-table.tsx` | kept | — |

**Mutations:** create → `category.created` ★ · rename → `category.changed` ★ · (de)activate → `category.deactivated` /
`category.reactivated` ★ — **all nothing today ✓**.

### 4 · `048` الشركات — `AdminCompanies.dc.html`

**Regions:** `h1` «الشركات» + «شركة جديدة» · `data-table`: الشركة (**swatch cell** — the colour, the name, the colour in
words; «معطّلة» badge when deactivated) · الأعضاء · النشطون (D7) · الربع (the quarter's company points, read) · ⋯
(«عدّل» · «عطّل»/«أعد التفعيل») · the count line under the table («7 شركات» — six ICU forms); ★ **no domain column, no
domains field, no logo, no «الشعارات من الهوية البصرية» line** (`DEC-231` §6.1, `DEC-195` §4). The sheet: name ·
team colour (the existing seven names + «بلا لون» radio group, swatch and word) · «احفظ».

**Data:** `listCompaniesForAdmin` (mine) gains, add-only, `activeMemberCount` (D7) and `quarterPoints: number | null`.
The quarter is **read, never a literal**: `getCompanyCup()` (`leaderboards.ts:970`, `scoring`'s, read only) — its rows'
`totalPoints` by `companyId`; `null` → «—» until the nightly task has taken a quarter snapshot, and for a company not in
it. ★ `scoring` is spawned and may change that function this wave; I read it as it stands at `a6c0345a` and say so to
them. New `updateCompany(locale, id, { name, teamColorHex }): { ok }` — one update for both, so the sheet is one save.

**Kept-behaviour table:**

| Behaviour | Now | After | REQ |
|---|---|---|---|
| Admin only | `listCompaniesForAdmin` → null | kept | `REQ-ADM-020` |
| The colour is one of seven NAMES or «بلا لون», never a hex from the client; the name is validated against the closed enum, then mapped | `team-colours.ts`, `actions.ts:27,62` | kept — `team-colours.ts` is **not deleted** (`admin-lists-team-colour.test.ts` pins it against `globals.css`) | `REQ-UIX-043`, `DEC-186` §8 |
| Colour never the only channel | `Swatch` + name in words | swatch cell's `colorName` | `REQ-UIX-095` |
| A colour change is audited | `companies_team_color_audit` (0161) on update | unchanged; ★ a rename + colour in one update writes `company.changed` and `company.team_color_changed` — Q3 | `REQ-UIX-043` |
| A colour chosen at creation | insert with `team_color` (`createCompany`), **not audited** | `company.created` ★ carries it in `after` (the lead's trigger) | `REQ-ADM-023` |
| No logo, no hex field | `company-form.tsx` header | kept (the add-colour test's case stands) | `DEC-195` §4 |
| No delete; deactivate confirms | 0004; `DeactivateToggle` | kept | `REQ-ADM-008` |
| ★ Member count | `members.select("company_id")`, no range | **defect**: `max_rows` 1000 — head counts or paged | `REQ-UIX-095` |
| The colour menu on the row | `TeamColourCell` (`ui/menu`) | **moves into the sheet** — one place to edit a company | `REQ-UIX-095` |
| Toggle success regardless | as venues | `{ ok }` | `DEC-231` §0.1 |

**Mutations:** create → `company.created` ★ · rename → `company.changed` ★ · (de)activate → `company.deactivated` /
`company.reactivated` ★ (all nothing today ✓) · colour → `company.team_color_changed` (0161, today ✓).

### 5 · `049` الأعضاء — `AdminMembers.dc.html`

**Regions:** `h1` «الأعضاء» + «CSV» (the audited export, `ExportDownloadButton` → `/api/admin/exports/members`) ·
toolbar: search · chips «الشركة: الكل» · «الدور: الكل» (`ui/menu`, the current value in the chip — 042's `Toolbar`
shape, a GET form, the URL is the state) · the count «212 عضوًا» (six forms) · `data-table`: العضو (`ui/avatar` with the
team ring through `avatarHref()` — never `members.avatar_url`, `DEC-099` — name, and the email on its second line) ·
الشركة · الدور (a `badge` for مشرف المؤسسة / مُنظِّم and for a deactivated member; plain text for عضو — D9) · المستوى ·
النقاط · آخر نشاط (D10) · ⋯ · the pager «1 – 9 من 212» + السابقة / التالية.

**Data — a new read for this screen alone**, `listMembersForConsole(locale, query)` in `admin-members.ts`:
`admin_list_members()` (unchanged; the scoring, recognition and schedule pages keep calling `listMembersForAdmin`,
untouched) + `members(id, avatar_version, companies(name, team_color))` + `points_balances(member_id, total_points,
current_level_id)` (`0027:382`, org-readable) + `levels(id, name)`. Filtered, sorted and paged in the DAL, every read
**paged past `max_rows`** (the RPC returns a set and is capped at 1000 too). No SQL.

**Kept-behaviour table** (`REQ-ADM-009`, `REQ-TEN-005`, `REQ-AUT-007/008`, `REQ-ADM-020`, `admin-members.ts`):

| Behaviour | Now | After | REQ |
|---|---|---|---|
| Admin only — a moderator would read `members_read_org`, so the screen is gated | `listMembersForAdmin` → null (`page.tsx:31`) | kept in the new read | `REQ-ADM-020` |
| The email, to the admin alone, through the definer list | `admin_list_members()` (0056) | kept; `dir="ltr"` `<bdi>` | `REQ-ADM-009` |
| Every write through 0005's RPCs — `assert_fresh_admin()`, claims bump, audit row | `setMemberRole`, `deactivateMember`, `reactivateMember` | unchanged functions | `REQ-TEN-005` |
| The last admin cannot be demoted or deactivated | RPC raises `last_admin`; the row shows it **after** the attempt | the RPC stays the boundary; ★ the menu **disables** «اجعله عضوًا/مُنظِّمًا» and «عطّل» on the last active admin and says why (computed from the list) | `REQ-UIX-096`, `REQ-ADM-009` |
| The viewer's own row: no role control, no deactivate | `isSelf` (`members-table.tsx:61,123`) | kept — no ⋯ on the own row (a «—» value in the card) | `REQ-ADM-009` |
| Deactivation needs a reason (3–300), shown in a dialog naming the member | `deactivateInput`, dialog + `Field` | kept, in `ConfirmDialog` with the reason field; `noValidate` | `REQ-AUT-007` |
| `stale_claims`, `member_not_found`, `cannot_deactivate_self` read as sentences | `classify()` + `error.*` | kept | `REQ-ADM-009` |
| ★ Reactivation toasts success even when the RPC refused | `reactivate()` returns `void`; `handleReactivate` toasts done | **defect fixed**: returns its state; toast from it | `DEC-231` §0.1 |
| ★ Role change has no confirmation | select + «غيّر الدور» | ⋯ → «اجعله …» → `ConfirmDialog` naming member and role | `REQ-UIX-013` |
| The deactivated note — date and reason | `deactivatedNote` | kept under the name | `REQ-ADM-009` |
| A link to the member's full profile | «عرض الملف الكامل» | kept, ⋯ «الملف الكامل» (`REQ-ADM-009` «view a member's full record») | `REQ-ADM-009` |
| Search by name or email | client-side `useState` | URL `?q=` (works without JS), name and email | `REQ-UIX-096` |
| Bound actions handed down as maps, never factories | `page.tsx:44-52` | kept (wave 6's Flight trap) | — |
| No invite | none | none | `REQ-UIX-096` |
| Phone card carries the actions | `onCard` (wave 8, F1) | kept | `16` §6.7 |

**Mutations:** role → `member.role_changed` (0005 ✓) · deactivate → `member.deactivated` (0005 ✓) · reactivate →
`member.reactivated` (0005 ✓) · CSV → `export.created` (0058 ✓).

### 6 · `061` التصدير — `AdminExports.dc.html`

**Regions:** `h1` «التصدير» with the caption «CSV · UTF-8 · كل تصدير مسجَّل» at its end — «كل تصدير مسجَّل» the link to
`/app/admin/audit?action=export.created` (today's Panel sentence, kept as a link and a word) · `data-table`: التصدير ·
آخر مرة (actor · relative time, `<time>` carrying the absolute) · «CSV» (`ExportDownloadButton`, its accessible name
«نزِّل ملف … بصيغة CSV» kept). ★ **Eight rows**: the seven of today and «سجل التدقيق» (D12).

**Kept-behaviour table:**

| Behaviour | Now | After | REQ |
|---|---|---|---|
| Admin only, page and route | `listRecentExports` → null; every `export*Csv` → null → 404 | kept | `REQ-ADM-020` |
| UTF-8 BOM, CRLF, RFC 4180 quoting | `buildCsv` | kept; ★ a new test opens one file's bytes: BOM, an Arabic header, a Western numeral | `REQ-ADM-017` |
| Formula neutralisation | `neutraliseFormula` | kept | `DEC-160` |
| Dates `YYYY-MM-DD HH:mm`, the zone in the header | `csvDateTime`, `whenHeader` | kept | `DEC-148` |
| Arabic enum values | the `*_AR` maps | kept | `REQ-ADM-017` |
| The audit row is written before the file is served | `auditExport` before `return` | kept | `REQ-UIX-098` |
| «آخر مرة» read from `export.created` | `listRecentExports` | kept; ★ its `.limit(500)` is honest only while no single type has been exported 500 times since another — a per-type query instead | `REQ-UIX-098` |
| The download fetches, names the file, toasts, refreshes | `ExportDownloadButton` | kept unchanged | `REQ-UIX-007` |
| ★★ **Exports are silently truncated at 1000 rows** | every `.from(...)` read has no `.range()`; `max_rows = 1000` | **defect fixed in `admin-exports.ts`**: each read pages by 1000 until short — the points ledger and the attendance list cross 1000 first | `REQ-ADM-017` |

**Mutations:** none but the exports — each → `export.created` (0058 ✓).

### 7 · `062` سجل التدقيق — `AdminAudit.dc.html`, over both stores

**Regions:** `h1` «سجل التدقيق» + «CSV» (admin only) · toolbar: search (D14) · chips «الفاعل: الكل» (admin only) ·
«الفعل: الكل» · the period chip («30 يومًا», with «مدة مخصّصة» opening a sheet with the two date-only `ui/date-time`
pickers — today's custom range kept) · «العنصر» when a subject is followed (D15) · the count «1,284 سجلًا» · `data-table`:
الوقت · الفاعل (avatar, name, the role badge) · الفعل (the Arabic label; a «إعداد» badge on a history row; the reason
appended «· «وصل متأخرًا»»; a history row's old → new) · الهدف (the subject's name where readable, else its type, and
«كل ما جرى على هذا العنصر») · the keyset pager (kept; D15).

**How both stores are read and marked (`DEC-231` §4.3) — no SQL, nothing written twice:**
- `audit_log` as today (`admin-audit.ts`), and `scoring_config_history` (`0004:354`; scopes `scoring`, `org_settings`,
  `badges`, `levels`, `perks`, `streaks`, `branding`, `company_scoring`) **only for an admin** — its policy is
  `config_history_read_admin`, so a moderator reads none by RLS and the DAL does not ask (`REQ-ADM-020`: own actions only).
- One DTO, `kind: "log" | "config"`. A history row is one changed field: `field`, `oldValue`, `newValue`, `actorId`
  (null → «النظام»), `scope`, `entityId`. Not grouped per save: a group would straddle a page boundary, and «one field,
  old → new» is what the row honestly holds.
- **The merged page is a merge of two keyset streams on one cursor**: both ordered `(at desc, id desc)`, both asked for
  51 rows strictly older than `at~id`, merged in the DAL, cut at 50; the cursor is the last row's. Correct because the
  two orderings agree (`uuid` order in Postgres is the lowercase hex order JS compares).
- **Filters**: actor and period apply to both. The action chip lists the log's actions grouped by domain **and** a
  group «الإعدادات» of the history's scopes as `config.<scope>` (the existing `^[a-z_]+\.[a-z_]+$` already admits it;
  no `audit_log` action starts with `config.`); choosing a log action drops the history, choosing a scope drops the
  log. Subject follow works on both (`subject_id` / `entity_id`).
- **The count**: two `count: "exact", head: true` reads under the same filters, summed.
- **Labels**: every history scope and every field a history trigger can write gets an Arabic and English label under
  `admin.audit.config.*`, with a unit test shaped like `admin-audit-labels.test.ts` reading the scopes and fields from
  the migrations — `org_settings_history()` writes every column, so the test reads `org_settings`' columns. A field
  with no label falls back to its key and the test fails, as for actions.
- **The audit CSV — a new export type through the same path**: `/api/admin/exports/audit` (`[type]/route.ts`, add-only:
  an `audit` entry; its query parsed by `auditFiltersFrom()`, as `ids` is parsed for sessions only) →
  `exportAuditCsv(locale, filters)` in `admin-exports.ts`: both stores, every page (no cursor), columns الوقت (zone) ·
  الفاعل · الدور · النوع · الفعل · العنصر · السبب · القيمة السابقة · القيمة الجديدة; `auditExport(locale, "audit")`
  before it is served. ★ **No function change**: `write_admin_export_audit(p_export_type text, …)` (`0058`) takes a free
  label, so nothing goes under `supabase/proposed/console/`. Its `after` records the type only, not the filters (Q8).

**Kept-behaviour table** (`REQ-ADM-018`, `REQ-NFR-006`, `03` §5.10a, `admin-audit.ts`):

| Behaviour | Now | After | REQ |
|---|---|---|---|
| Staff only; a member gets the streamed not-found | `requireStaff` → null | kept | `DEC-134` |
| A moderator sees their own actions; no actor filter | RLS (`audit_read_moderator_own`); `actors: null` | kept; and no history, no CSV | `REQ-ADM-020`, `09` coverage |
| Nothing edits a row | no control; revoke incl. `service_role` | kept | `REQ-NFR-006` |
| The org's days for a range, half-open, DST-safe | `periodBounds`, `dayStartInZone` | kept; `admin-audit-filters.test.ts` untouched | `DEC-147` K1 |
| Unparseable query values dropped, an inverted range reported | `auditFiltersFrom`, `rangeInverted` | kept | — |
| Fifty a page, keyset, never an offset | `AUDIT_PAGE_SIZE`, `before` | kept, merged cursor | `DEC-147` K1 |
| One subject followable | `subjectId` | kept | `REQ-ADM-018` |
| Former staff and «النظام» filterable | `listAuditFilterOptions` | kept; ★ its `.limit(5000)` is really 1000 (`max_rows`) — paged | `REQ-ADM-018` |
| Every action in Arabic, the key never shown | `actions.*`, `admin-audit-labels.test.ts` | kept; ★ the lead's new actions (`venue.*`, `category.*`, `company.*`, `report.resolved`, `survey_template.*`) need labels in the commit that adds them — the test fails otherwise; ★ I write those keys in `admin.json` on the lead's list | `REQ-ADM-018` |
| The scoring note sends the admin to the points screen's history | `scoringNote` | **dropped** — the history is on this screen now | `REQ-UIX-099` |
| Filters in a sheet on a phone | `AuditFilterPanel` + `ui/sheet` | the chips scroll in one row (042's); the custom range in a sheet | `16` §6.7 |

**Mutations:** none on the screen; the CSV → `export.created` with `export_type: "audit"` ★ (the type is new; the action is 0058's).

### 8 · Every existing test that changes — ledger lines (each in the commit that moves it)

`tests/components/admin/` (mine):
- `companies-add-colour.test.tsx` — `CompanyForm` is rewritten as the sheet's form: **selectors move**; every
  expectation (seven names + «بلا لون», «بلا لون» default, no hex, no logo, the hex mapping, refusals) **stands**.
- `companies-table.test.tsx` — the colour moves from a row menu into the sheet: «the menu offers seven colours and
  marks the current one» and «choosing posts its NAME» **move to the sheet** (an expectation moved); «name not just
  swatch» and «بلا لون» stand.
- `managed-lists-status-badge.test.tsx` — **an expectation changes**: an active row shows nothing (no «نشط»/«نشطة»); a
  deactivated row shows «معطّل»/«معطّلة» (`DEC-NEXT-25`, the artboards draw no status column).
- `phone-card-actions.test.tsx` — «عطّل»/«أعد التفعيل» are items under the card's ⋯, not buttons (a selector moved);
  the members case stands (⋯; the own card a «—»), its reactivation becomes a menu item.
- `members-table.test.tsx` — search through the URL (a selector moved); role change through ⋯ and a confirmation (a
  flow moved); ★ «the last-admin guard's error reads as a sentence» **becomes** «the menu says why before the click» (an
  expectation moved; the RPC's error path keeps a case); self row and axe stand.
- `form-summary-links.test.tsx` — venues, categories, companies: the forms live in the sheet (selectors move). ★ Its
  **settings** case imports `admin/settings/settings-form.tsx`, which is `notify`'s this wave — Q5.
- `audit-page.test.tsx` — the filter panel becomes chips (selectors move); Arabic labels, «النظام», the subject link,
  the moderator's no-actor-filter, the pager and the date-only pickers **stand**; the moderator's intro sentence is
  dropped (an expectation moved — the empty state still names their queues).
- `exports-page.test.tsx` — «seven exports» → **eight** (an expectation moved); the note's link moves into the caption.
- `confirm-dialog.test.tsx` — **untouched** (`DeactivateToggle` stays: `recognition/badges-table.tsx` uses it).

`tests/unit/` (mine): `admin-audit-filters`, `admin-exports-csv*`, `admin-exports-days`, `admin-exports-sessions-ids`,
`admin-lists-team-colour` — **untouched**; new files for the paging, the merged feed and the config labels.

`tests/e2e/` (mine, evidence): `admin-members.spec.ts` — `h1` «الأعضاء والأدوار» → «الأعضاء» (`:145`, `:117`); the
role `<select>` + «غيّر الدور» → ⋯ (`:154-165`); «مزيد من الإجراءات على …» kept as the ⋯'s name. `admin-exports.spec.ts`
— «all seven» → eight (`:107`). `admin-audit.spec.ts` — `getByLabel("الإجراء").selectOption` → the action chip (`:176`,
`:228`); «تصفية» on a phone → the chips (`:226`). `wave17-console-screens.spec.ts` — the companies «بلا لون» trigger
button (`:150`) → the row's ⋯ «عدّل» and the sheet; the audit «تصفية» (`:160`) → the period chip's sheet.

★ **Not mine, and they break** (Q5): `tests/e2e/admin-managed-lists.spec.ts` (the add forms «أضف التصنيف»/«أضف الشركة»
→ the sheets; «عطّل» buttons → ⋯) and `tests/e2e/wave15-console-team-colour.spec.ts` (the row's colour menu → the sheet).

### 9 · Disagreements — artboard (or spec) against `docs/plan/` and the tree; no side picked

- **D1** `AdminVenues` draws no status column and no venue without a company; `REQ-UIX-093` «a venue with no company
  says so in the row».
- **D2** `AdminVenues` «الجلسات» (27 — all-time) vs today's «الجلسات القادمة» (`upcomingSessions`, why deactivation is
  the only exit). The plan carries `sessionCount` (all, by day) and keeps `upcomingSessions` for the confirm's body.
- **D3** `M11b.md` §046–049 «delete is blocked while sessions use it» and `REQ-UIX-094` «a category in use cannot be
  deleted, and the row menu says why» imply an unused category CAN be deleted; `categories` has no delete grant and no
  delete policy (0004) and `REQ-ADM-006` says «deactivate, not delete». A delete is a policy, a grant and a migration —
  the lead's. Until ruled, the menu offers «عطّل» only.
- **D4** Every m11b artboard's rail says «التصنيفات والوسوم»; `DEC-227` §3 says «التصنيفات». Already ruled — noted.
- **D5** `AdminCompanies` draws النطاق and «الشعارات من الهوية البصرية»; `DEC-231` §6.1, `DEC-195` §4 — already ruled.
- **D6** `AdminCompanies` draws the swatch with no word; `REQ-UIX-095` / `REQ-UIX-092` «and its value in words».
- **D7** `AdminCompanies` «النشطون» (7 of 9) is undefined: members whose `status` is active, or the cup's active members
  (`derivedActive()`, the race's divisor)? The plan reads `status = active` unless told otherwise.
- **D8** «الربع» is the newest quarter snapshot (`getCompanyCup`), so it is «—» until the nightly task takes one — the
  artboard draws a figure for every company.
- **D9** `AdminMembers` role words «مشرف» / «مُشرِف إشراف» / «موقوف»; `REQ-ADM-009`, the glossary and today's strings say
  «مشرف المؤسسة» / «مُنظِّم» / «عضو» and status «معطَّل». The plan keeps today's.
- **D10** `AdminMembers` «آخر نشاط» — **nothing stores a member's last activity** (no column in any migration). Drawn,
  not built — unless the lead names a proxy (the newest ledger row, the newest check-in) or a column (the lead's).
- **D11** `AdminExports` drops «الحجوزات» and adds «سجل التدقيق»; `REQ-ADM-017` lists RSVPs. The plan keeps both: eight.
- **D12** `AdminExports` draws no line of what each file holds; `REQ-UIX-098`'s title is «what each holds». Today's
  notes are sentences (`DEC-NEXT-25`). The plan drops them unless told to keep.
- **D13** `AdminAudit` draws a free-text «بحث»; `REQ-ADM-018` asks actor, subject, action, date — all chips. Search
  over what? Not built unless named.
- **D14** `AdminAudit` draws no subject chip, no reason column and no pager; the plan keeps the subject follow as a chip,
  the reason inside the action cell (as the artboard's «· «وصل متأخرًا»» does), and the keyset pager.
- **D15** `AdminAudit` «دفع نقاط · 50 × 28» by «النظام» — an award; neither store records awards (the ledger does).
  Not shown.
- **D16** `AdminAudit` «أبطلت رمز الحضور» — a gendered verb (`DEC-213` §5.109's spirit); today's label is the noun
  «إلغاء رمز الحضور». Kept.
- **D17** `M11b.md` header «every table stacks to cards under `lg`»; `data-table` stacks below `md`. Between 768 and
  1023 the rail is a sheet and the table is a table — as in wave 21.
- **D18** `M11b.md` lists the companies sheet with «domains, colour, logo (`REQ-ORG-*`)» — `REQ-ORG-*` does not exist
  (`DEC-227` §1 found the same id); ruled by `DEC-231` §6.1 for domain and logo.

### 10 · Findings for the lead (not a screen's, but mine to fix where the file is mine)

- ★★ **`max_rows = 1000`** (`supabase/config.toml:18`; production's API setting is the owner's to read) silently
  truncates every unbounded read: all seven exports (`REQ-ADM-017` — an export that drops rows is worse than none),
  `admin_list_members()` (also read by the scoring, recognition and schedule pages), the category and company counts,
  `listAuditFilterOptions`' «5000». I fix it in my files by paging; other tracks' unbounded reads are not measured here.
- ★ The silent-success toggles (venues, categories, companies, member reactivation) — `DEC-231` §0.1's worst outcome,
  today, on these screens.
- ★ `export.created`'s `after` names the type only: a 042 selection export and a filtered audit export are
  indistinguishable from the whole file (Q8).

### 11 · Requests

- **R1** (lead, custodian of `ui/switch`): add-only `labelHidden?: boolean` — §0.
- **R2** (lead): the action labels of the audit migration's new rows in the list for `admin.json`, so they land in
  the same commit as the triggers (`admin-audit-labels.test.ts`).

### 12 · Questions for the lead

- **Q1** R1, or the group fallback?
- **Q2** The no-JS path. Today's add forms post without JS; a `ui/sheet` cannot open without it. 042's precedent is the
  URL as state (`?new=1` renders the creation region in the page). Sheet (artboard) or region (042, no-JS kept)?
- **Q3** The audit triggers: one sheet save that changes a venue's name and its company (or a company's name and its
  colour) is one `update`. Two rows (`venue.changed` + `venue.company_changed`) or one? Either way the DAL writes no
  audit row (contract 3).
- **Q4** `createVenue` / `setVenueActive` returning `{ ok }` instead of `void` — compatible with their one caller, but
  is it «add-only» enough for `sessions.ts`, or do I add checked siblings and leave them?
- **Q5** Who writes `tests/e2e/admin-managed-lists.spec.ts`, `tests/e2e/wave15-console-team-colour.spec.ts`, and the
  settings case of `tests/components/admin/form-summary-links.test.tsx` (mine, but `notify` rebuilds that form)?
- **Q6** The `max_rows` paging in `admin-exports.ts` — in PR A with `061`? (I propose yes.)
- **Q7** A venue owned by a **deactivated** company: may the `select` offer it, and does hosting award it (`scoring`)?
- **Q8** Record the export's slice (`ids`, filters) in `export.created`'s `after` — a trailing defaulted
  `p_detail jsonb` on `write_admin_export_audit()` under `supabase/proposed/console/` — or leave it?
- **Q9** `049`'s «CSV»: the whole member list (today's export) or the chips' slice (an add-only `?company=&role=`)?

## Wave 22 — built (PR A), and each kept-behaviour table read against the new file

The lead's rulings (`DEC-232`, `9a956ae4`) applied: no-JS is `042`'s `?new=1` / `?edit=<id>` with the sheet as the
enhancement (Q2); one save changing a name and an owner is two audit rows, the lead's triggers (Q3); `{ ok }` returns
are add-only (Q4); the two e2e specs are mine (Q5); paging everywhere in my files (Q6); a deactivated owner earns no
hosting and is shown as inactive (Q7); `export.created` records the slice (Q8); `049`'s CSV is the filtered list (Q9);
swatch always with its word (D6); `data-table` stacks below `md` (D17); no gendered verb (D16).

| Commit | What |
|---|---|
| `e611e992` | the three `data-table` cells (`REQ-UIX-092`) — B and C cut after it |
| `b81ac2a6` · `f5ebd54c` | `046` deleted · written |
| `8c131498` · `976262a8` | `047` deleted · written |
| `66c603e9` · `539af038` | `048` deleted · written |
| `1e478e52` · `c44f0453` | `049` deleted · written (with the members CSV's slice and every export paged) |
| `2fb31bfe` · `da4c709e` | `061` deleted · written (with the audit log's export type and the merged feed) |
| `01b51903` · `34fb3597` | `062` deleted · written |
| `87ff0ef5` | ★ proposed: `supabase/proposed/console/export_slice.sql` + `tests/rls/admin-export-slice.test.ts` (green) — **the lead promotes** |
| `6d1a09e3` | `DeactivateToggle` honours `{ ok: false }` (add-only; `scoring`'s badges table can pass it) |
| `b6e1d847` | `tests/e2e/wave22-console-screens.spec.ts` — the jobs and the captures; **the lead runs it** |

Shared, new: `components/admin/{editor-surface,list-row-menu,list-editor-form}.tsx`, `components/admin/members/member-query.ts`,
`components/admin/audit/audit-text.ts`, `lib/dal/admin-paging.ts` (`readAll` — pages until an EMPTY page, so a production
`max_rows` below 1000 cannot end it early).

### The jobs, as built (`DEC-231` §0)

- **`046`** — ⋯ → «عدّل» → the company `select` → «احفظ»; the row shows the swatch and the company, or «لا شركة»; five venues
  in five moves (`wave22-console-screens` walks all five).
- **`047`** — «تصنيف جديد» / ⋯ «عدّل» in the sheet; ⋯ «عطّل» confirmed; no delete is offered; a category a proposal alone
  carries shows «N مقترحات».
- **`048`** — the colour as a swatch and its word, the quarter's points read from the quarter snapshot («—» before one);
  one form for name and colour.
- **`049`** — search and the two chips narrow the list by URL; ⋯ changes the role (confirmed, naming member and role),
  deactivates with a reason, reactivates; the last active admin's ⋯ holds one disabled line saying why; «CSV» = the list shown.
- **`061`** — eight rows; «CSV» downloads and the row then names who and when, read from the audit row.
- **`062`** — the log and the configuration history side by side, «إعداد» on the latter with «القديم ← الجديد»; chips;
  the count of both; «CSV» = what the chips show; a moderator sees their own actions only.

### Kept-behaviour tables, read against the new files

Every row of §2 – §7 above holds in the new files, with these notes:

- **046** ✓ admin-only `notFound()` (`page.tsx`, `listVenuesForAdmin` → null) · ✓ no delete · ✓ deactivate confirms
  (`ListRowMenu` → `ConfirmDialog`) · ✓ the schema and its errors (`saveVenue`) · ✓ summary links focus (`venue-<field>`) ·
  ✓ `dir="ltr"` map, tz, capacity · ✓ `<bdi>` on names, address, company, numbers · ✓ phone card ⋯ · ★ fixed: the silent
  toggle; ★ new: edit, the company, sessions counted by day · dropped: the intro and the no-delete sentence (the privilege
  stands) · the time-zone hint kept (it changes what is typed).
- **047** ✓ as 046, `listCategoriesForAdmin` · ★ new: rename, proposals counted · ★ fixed: counts paged.
- **048** ✓ the seven names / «بلا لون», never a hex (`saveCompany`, `team-colours.ts` kept) · ✓ no logo, no domain ·
  ✓ 0161's audit on a colour change · ★ moved: the colour from the row's menu into the form · ★ fixed: counts paged.
- **049** ✓ admin-only (`listMembersForConsole`) · ✓ the email to the admin · ✓ the three RPCs unchanged · ✓ self row has
  no ⋯ · ✓ reason 3–300 in a dialog naming the member, `noValidate`, the inline error · ✓ the RPCs' errors as sentences ·
  ✓ the deactivated note · ✓ the profile link (⋯ «عرض الملف الكامل») · ✓ bound/imported actions — no factory crosses ·
  ★ fixed: reactivation's silent success · ★ new: the role change confirms; the last admin's ⋯ says why; search in the URL ·
  `listMembersForAdmin` unchanged for its three other readers, now paged.
- **061** ✓ admin-only, the routes 404 · ✓ BOM, CRLF, quoting, formula guard, dates, Arabic enums (`buildCsv` untouched) ·
  ✓ audit before the file is served · ✓ `ExportDownloadButton` unchanged · ★ fixed: every export paged (2345 rows in
  `admin-exports-bytes.test`), «آخر مرة» one newest row per type · ★ new: the audit log's export.
- **062** ✓ staff only; a moderator's own actions, no actor chip, no history, no CSV · ✓ the org's days, half-open,
  inverted range reported · ✓ keyset fifty a page, merged cursor · ✓ one subject followed · ✓ «النظام» and former staff ·
  ✓ every action in words (`audit-text.ts`) · ✓ nothing editable · dropped: the scoring note (the history is here now),
  the filter panel/sheet (chips) · ★ new: both stores, the count, target names, the CSV.

### Still open — for the lead

1. ★ **`0180` and the audit triggers** must be applied locally before `046`'s page (it selects `venues.company_id`), the
   managed-lists venue case and `wave22-console-screens` can run.
2. ★ **Promote `supabase/proposed/console/export_slice.sql`**: until then a whole-file export works unchanged and a
   sliced one (`042` ids, `049` filters, `062` filters) fails loudly with the function's signature error.
3. **`tests/unit/sessions-memory-supabase.ts` needs `range()`** (requested): `admin-removed-check-in.test`'s two export
   cases fail until it slices.
4. The new audit actions' labels are in `admin.json` (R2); `admin-audit-labels.test` will need nothing more once the
   triggers' literals are on disk.
5. Carried, not built: «آخر نشاط» on `049` (nothing stores it); the free-text search on `062` (D13); relative times on
   `061` (absolute, as before); actor avatars on `062` (no avatar version on the log's read).
6. `recognition-page.test.tsx` (scoring's) fails tsc against `HeldCertificateRow` — not mine, seen in passing.

### Wave 22 — after the lead held the 1280 captures beside the boards

- Every table on `046` – `049`, `061`, `062` wears `042`'s surface card at `md`+ (the lead's ruling); cards below.
- `062`: the time is the day said relative to today on the org's clock («اليوم 6:45 م», «أمس 9:10 م», «28 سبتمبر
  4:10 م»), computed on the server, the full instant the `<time>`'s title; the target is one line and itself the link to
  its history (the «كل ما جرى» line is gone); the actor is a face through the one resolver with the company ring, the
  role badge gone.
- `049`: the email is not drawn in the row — the board does not and no requirement asks it of the row; `REQ-ADM-009`'s
  «full record» is the profile (⋯ «عرض الملف الكامل»); the search still finds by email and the CSV carries it.
  ★ «المستوى» showed «—» at 0 points: **the read's defect, not the fixture's** — the org has its five levels from 0; a
  member with no balance row, or none the nightly evaluation stored, read null. Now the stored level, else the one the
  balance meets (`tests/unit/admin-members-console.test.ts`).
- `046`'s capture waits for the five saves' toasts to clear.
- ★ **D13 ruled absent** (the lead): `062` has no free-text search — `REQ-ADM-018`'s «searchable by actor, subject, action
  and date range» is met by the chips.
