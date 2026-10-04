# Wave 25 — the lead's brief · M27, a member added by hand (`DEC-243`, shape set by `DEC-244`)

**Read `STATUS.md`, then `DEC-243`, then `DEC-244`, then this.** ★ **Written ahead of the wave, while wave 24 is
open.** It is not the map in force: `CLAUDE.md`'s wave-24 block is, until wave 24's three PRs have merged. **The next
lead writes the wave-25 ownership map into `CLAUDE.md` before spawning anyone** (`DEC-085`).

---

## 0 · What the owner asked for, in their words — both times

> **«I want the ability to add user to the app in addition for them becoming users on the first signin.»**

> ★★ **«i need the addition of the user to take affect and appear in the users as soon as the admin adds them»**

★★ **The second sentence is a correction of the first answer, and it is the one that governs.** `DEC-243` proposed a
roster table beside `members` and wrote «nothing else in the product can reference them» — so an added person
*appeared* on one console table and could not be assigned, picked or counted. **«Take effect» is the requirement.**
`DEC-244` withdrew the table: an added person is a **`members` row from the moment the admin saves it**, waiting only
for its auth user.

★ **Nothing about the front door changes.** A Google account on an allowed domain is still auto-provisioned on arrival
with no admin in the loop (`REQ-AUT-003`). ★ **The case that justifies the feature** is the person the front door
refuses: an outside presenter, a partner, an address on no org's list. **«Good» is not «the gates are green»** — the
acceptance is the owner adding a real person on a domain that is not theirs, **assigning them to a session before
they have signed in**, and that person then signing in and finding themselves already on it.

---

## 1 · ★★ The nine measurements — do not re-derive them

`DEC-244` §2 has the table. The six that change what you build:

| # | What it says | What follows |
|---|---|---|
| 1 | ★★ **`auth.users` is joined in exactly ONE statement in the product** — `0005:119`, inside `provision_member()` | An unbound member row is invisible to every other query **by construction**, not by care |
| 2 | `auth_user_id` is read in 5 migrations and **0** files under `src/` or `worker/`; all five key off `auth.uid()` | A null never matches, so no policy, claim or lookup changes |
| 3 | A Postgres unique constraint permits **many** nulls | `auth_user_id uuid unique` stays **exactly as written**. Only `not null` is dropped |
| 4 | ★★ **`grant select on public.members … to supabase_auth_admin` already exists** (`0006`'s «rule 3») | **The gate override needs no new grant.** Invariant 6 gains nothing to satisfy |
| 5 | `admin_list_members()` is already a `security definer` function (`DEC-232` §4.3) | «Has signed in» is a **boolean it returns**. `auth_user_id` is outside the column grant and **stays** outside it |
| 8 | ★★ **`snapshot_leaderboard()` counts `members where status = 'active'`** — org-wide (`0081:597`, `0176:39`) and per company (`0081:382`, `:411`, `:647`) | ★★ **The one real defect in the shape**, and the one thing in this wave that would corrupt data nobody is looking at. See §4 |

★ **And one that makes the wave smaller than `DEC-243`'s:** no table, no enum, no policy set, no grant, nothing for
the isolation sweep, **no third `member_status`** — so the 54 `status = 'active'` sites stay irrelevant.

---

## 2 · The tracks

**Four: the lead, `scoring`, `console`, `notify`.** ★ `scoring` is in the wave for **one function** — but it is the
function that silently rewrites published standings if nobody touches it.

| Track | Delivers | Why it is theirs |
|---|---|---|
| **lead** | the migration — `auth_user_id` nullable, `invited_by`, `add_member()`, `add_members()`, `resend_member_invitation()`, `remove_unbound_member()`, `admin_list_members()`'s boolean, `provision_member()`'s bind, `before_user_created_hook()`'s read — the RLS cases, the demonstrables, the gates, the PR | Tables and migrations are the lead's (the migration rule). ★ **The auth hook is the single point of failure for all sign-in** and nobody else goes near it |
| `scoring` | ★ `snapshot_leaderboard()`'s four predicates and the proof that existing data is byte-identical | It owns the ledger, the boards, the snapshots and what a rank **is** |
| `console` | `SCR-049` — «أضف عضوًا», the sheet, the pasted list with its per-line report, «لم يسجّل الدخول بعد» with its age, resend, delete — its DAL, its strings, its tests | It has owned `/app/admin/members`, `admin-members.ts` and `admin.json` since wave 22 |
| `notify` | `JOB-send_member_invitation`, the designed mail family, the text alternative, the `email_deliveries` row | It has owned the mail and `packages/mail-runtime` since wave 10 |

★ **Everything else is the lead's as custodian.** `sessions`, `checkin`, `content`, `event`, `designer`, `platform`
and `branding` are not spawned.

---

## 3 · The contracts

1. ★★ **Lead → everyone, and first: the migration lands before any track writes a line.** The column changes, the
   four RPCs, the bind, the hook and `admin_list_members()`'s boolean are **one migration** (from `0194`, after wave
   24's `0192` and `0193`), and the lead posts «the member can be added at `<sha>`» with the four signatures.
   **Nobody builds against a guess.**
2. ★★ **Lead → `console`: one list, one kind of row.** `admin_list_members()` returns every member with
   `has_signed_in boolean`; there is **no second query and no second row type**. ★ An unbound row offers everything a
   member row offers — the role change and the deactivation included — **plus** the delete of `DEC-244` §7.
3. ★★ **Lead → `scoring`: the predicate, and the proof.** The lead names the four counts; `scoring` changes them and
   writes the test that the org-wide and per-company counts are **identical before and after on the same data**.
   ★ **A moved number anywhere in the existing snapshot or board suites is a defect, not a re-baseline.**
4. ★★ **Lead → `notify`: the address is read, never passed.** The payload is `{member_id}` and nothing else; the
   definer context that yields the address is the one the real send already uses.
5. ★ **`console` → lead: the counts.** The dashboard tiles and the rail badges keep reading what they read; `console`
   states in its plan which figures its screen shows and confirms no existing count moves.
6. ★ **Everyone: there is no artboard.** `AdminMembers.dc.html` draws no add affordance (`DEC-243` §1.8). `SCR-049` is
   **extended**, built from wave 22's own structure and the console's existing sheet and reason patterns. **No class,
   id or markup pattern from a `.dc.html` in `src/`**; a disagreement is written down, never resolved silently.

---

## 4 · ★★ The two things that can go wrong, and what holds them

**(1) The auth hook.** `before_user_created_hook()` is the single point of failure for all sign-in. The invitation
read goes **inside** `0007`'s existing `begin`/`exception` block and the `when others then return event` stays
verbatim; a test proves a failing read still admits a sign-in the domain list would have allowed. **No new grant is
needed** (measurement 4). ★ **No teammate touches `0007`.**

**(2) The denominator.** `points_per_active_member` divides a company's points by its active members, and the count is
**frozen into every snapshot** precisely so it cannot be rewritten after the fact (`A11`, `DEC-016`, `05` §6.2).
★ **An admin adding five colleagues would lower their own company's score** — for five people who have not declined to
contribute but have not been asked — and could carry a company across `company_min_active_members`. The fix is four
predicates (`and auth_user_id is not null`) and it is **provably a no-op today**, because `auth_user_id` is `not null`
until this wave's own migration. ★ **It must land in the same PR as the nullable column**, never after.

---

## 5 · The rules

- ★★ **No second sign-in method and no `auth.users` row is ever created by us**: no password, no magic link, no OTP,
  no Admin API, no `service_role` on Vercel (invariant 7). The person signs in with Google like everybody else.
- ★★ **An addition cannot create an `admin`** — `member` and `moderator` only; the promotion path stays
  `set_member_role()`, which guards the last admin and audits.
- ★★ **Bound once, never re-bound.** `where auth_user_id is null` is the lock; a bound row is matched by
  `auth_user_id` at step one and a different account on the same address still raises `email_already_member`.
- ★★ **A hard delete only while unbound** (`DEC-244` §7), audited, refused the moment the row is bound. Once bound,
  the only way out is `REQ-AUT-008`'s deactivation with its reason.
- ★ **No new primitive.** `ui/` stays **69** files; `tests/unit/ui-playground.test.ts` is untouched; the console's
  sober register holds (`REQ-UIX-053`) and `console-register.test.ts` is **not edited**.
- ★ **`registrations` is never touched; the five public routes do not move.** `qa:contract`, `qa:appearance`,
  `visual`'s public pairs and the register-form fingerprint are **unmoved, not re-baselined** — the lead proves it.
- ★ **The matrix stays at 25 and `tests/unit/mail-pinned/**` is untouched** by anyone, `notify` included.
- ★ **Arabic first**; `<bdi dir="ltr">` on every address; Western numerals (`DEC-124`); six ICU forms wherever a count
  appears; logical properties only.
- ★ **No explainer copy** (`DEC-NEXT-25`): a word or a number, state in the row, nothing shown when nothing needs doing.
- ★ **The existing suites are evidence**; each changed assertion is a ledger line in `STATUS.md`, in the same commit.
- ★ **No new dependency.** `package.json` is the lead's. **One migration**; a function a plan needs beyond it goes
  under `supabase/proposed/<you>/`.
- **Teammates spawn planning-only**; sync 1 approves three plans; **nobody builds before the lead posts «the member
  can be added».**
- **One writer per file, specs included. `ui-lint --strict` has no allowlist and never gains one.**
- **Captures land at `.qa-shots/rtl/wave25-<track>-<surface>-<state>-<390|1280>.png`** from a production build the row
  names by commit, honouring `E2E_SHOTS_DIR`; the lead opens every one, in bands, never downscaled.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`, `stop`,
  branch switches, worktrees, pushes and the PR.

---

## 6 · Step order

| Step | What | Who |
|---|---|---|
| 0 | Confirm wave 24's A, B and C are merged and `main` is the base. Cut `wave-25/add-a-member` **before the first edit**; the PR is against `main` from its first push | lead |
| 1 | The migration, whole, with its RLS cases. Post the four signatures | lead |
| 2 | Spawn `scoring`, `console` and `notify` planning-only; sync 1 approves three plans against §3 | lead |
| 3 | The denominator and its byte-identity proof — **in the same PR as the column** | `scoring` |
| 4 | The job and the mail family; the screen | `notify` · `console` |
| 5 | The demonstrables (`14`'s M27 row), the captures, the a11y sweep, the gates | lead |
| 6 | The owner rehearses `0194` on a dump taken at `0193`, pushes, merges | owner |

---

## 7 · What NOT to build, and never-touch for every teammate

An invitation table or an `invitation_status` enum (**withdrawn**, `DEC-244`); a third `member_status`; a second
sign-in method; creating an `auth.users` row; a twenty-sixth matrix key; an addition that grants `admin`; an expiry
(the control is deactivation or the delete of `DEC-244` §7); a CSV import with column mapping; a member-visible list
of who has not arrived; «request access» or any org self-registration (`01` §43); a session-level presenter
invitation (`DEC-175`); the five public routes; `registrations`; stories and `story_views` — the ring stays inert;
`/app/platform/**`; the studio; every console screen but `SCR-049`; the member app's screens; `DEC-194`'s two gates;
`DEC-215`'s four; `DEC-186` §4; `DEC-204`. The November Railway dry run (`DEC-241` §2) is the owner's and is not this
wave's.

---

## 8 · ★★ The runbook for the push — what the owner does, in order

★ **Production is at `0191`.** `main` carries `0192`, `0193`, `0195`, `0196` and now `0197`, so the live database is
**six** migrations behind, not one. `0194` is still in open PR #69.

### 8.1 The hole in the chain, and the one flag it needs

`0195` and `0196` merged while `0194` is still open. So:

- a fresh `supabase db reset` applies **0194 before 0195/0196** (filename order);
- a production pushed in merge order receives it **after**.

The three are independent — a certificate mode, a template guard, a baseline recolour — so the divergence is in the
**order**, not the outcome. But `supabase db push` only applies what is newer than the last applied version, so the
straggler needs **`--include-all`** when #69 lands. ★ **Push `0197` before `0194`, or after it, but know which.**

### 8.2 What `0197` does to a live table, and why it is not a long lock

| Statement | Lock profile |
|---|---|
| `alter table public.members alter column auth_user_id drop not null` | **Catalog only.** `ACCESS EXCLUSIVE` for the instant it takes to update `pg_attribute`; no table rewrite and no scan |
| `alter table public.members add column invited_by uuid references public.members(id) on delete set null` | A nullable column with no default is also **catalog only**; the foreign key validates against existing rows, which is a scan of a table holding **tens** of rows in production |
| the four `create or replace function` | Catalog only |

★ **Nothing rewrites a table and nothing scans anything large.** The risk in this migration is not duration — it is
*what* it replaces: `provision_member()` and `before_user_created_hook()`, the two functions **every sign-in** goes
through. That is what earns the rehearsal, not the lock time.

### 8.3 The order, and why it is this order

1. **Rehearse on a production-shaped dump** (invariant 3). The thing to watch is not `members` — it is that a sign-in
   still provisions: `provision_member()` on an address whose domain is listed, and the hook returning the event
   unchanged for one that is not.
2. **Push the migrations, then merge #68.** `main`'s worker and Vercel both deploy from `main`, so the schema must
   lead the code: the new RPCs exist before anything calls them, and `main`'s *old* worker on the new schema does
   nothing different (it has no `send_member_invitation` registered, so those jobs simply **wait** in the queue until
   the redeploy — graphile-worker fetches only the tasks a worker registers).
3. **Vercel redeploys from `main`; Railway redeploys the worker.** The waiting `invite:*` jobs then run and the mail
   goes out. ★ **An invitation enqueued before the worker redeploys is not lost** — it is queued.
4. **Check the one thing that cannot be tested from here:** sign in as yourself. If sign-in works, the riskiest half
   of this wave is proven in the only environment that counts.

### 8.4 The rollback, if sign-in breaks

`provision_member()` and `before_user_created_hook()` are `create or replace` — so the rollback is to re-run **their
previous definitions**, which are `0005` and `0007` verbatim, and which are still in the repository. Nothing about
the column changes has to be undone for sign-in to work again: a nullable `auth_user_id` is invisible to the old
definitions. ★ **That is the property worth having on a live auth path**, and it is why the column change and the
function replacements are safe to ship together.
