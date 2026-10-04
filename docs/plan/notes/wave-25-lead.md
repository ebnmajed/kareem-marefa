# Wave 25 — the lead's brief · M27, a member added by hand (`DEC-243`)

**Read `STATUS.md`, then `DEC-243`, then this.** ★ **This brief is written ahead of the wave, while wave 24 is open.**
It is not the map in force: `CLAUDE.md`'s wave-24 block is, until wave 24's three PRs have merged. **The next lead
writes the wave-25 ownership map into `CLAUDE.md` before spawning anyone** — `DEC-085`'s rule, unchanged.

---

## 0 · What the owner asked for, in their words

> **«I want the ability to add user to the app in addition for them becoming users on the first signin.»**

★ **«In addition» is the whole sentence.** Nothing about first sign-in changes. A Google account on an allowed domain is
still auto-provisioned on arrival with no admin in the loop (`REQ-AUT-003`); what is added is a second door. Four things
turned on the sentence and the owner answered all four (`DEC-243` §2):

1. **What an added person is before they sign in** — **an invitation row**, not a member.
2. **Whether adding beats the email-domain gate** — **yes, while the invitation is pending.**
3. **Whether they are mailed** — **yes**, and outside the notification matrix.
4. **When** — **after wave 24 merges**, as its own wave.

★ **The goal is one sentence: an admin can bring in somebody the front door refuses.** The case that justifies the
feature is the outside presenter or the partner whose address is on no org's list — today the product tells them «this
is a private platform» and there is no answer. **«Good» is not «the gates are green»**: the acceptance is the owner
adding a real person, on a real domain that is not theirs, and that person signing in.

---

## 1 · ★★ The eight measurements the decision rests on — do not re-derive them

`DEC-243` §1 has the table. The five that change what you build:

| # | What it says | What follows |
|---|---|---|
| 1 | `members.auth_user_id` is `not null unique references auth.users(id)` (`0004:239`) | **There is no state today for «a person we expect».** The entity is new; it is not a column on `members` |
| 2 | `auth_user_id` appears in **5** migrations and **nowhere** in `src/` or `worker/src/`; every read goes through `auth_member_id()` | A nullable binding *would* work — and is **refused** for this wave by measurement 5 |
| 4 | `status = 'active'` is written out in **54** places across 26 migrations | **No third `member_status` value.** The invitation's own `invitation_status` enum is a separate type on a separate table |
| 5 | `company_min_active_members` (`0176`) ranks companies on their active-member count | ★ **A pre-created member row would re-rank the company board the moment an admin pasted a list.** This is the measurement that decided the shape |
| 6 | `notify(p_org, p_member, …)` (`0026:436`) resolves the matrix row, the preference, the inbox row and the address **from a member id** | ★★ **The invitation mail cannot be a matrix message.** No 26th key; the 120 pinned files are untouched; `JOB-send_test_email` is the pattern |

---

## 2 · The tracks, and why it divides this way

**Three: the lead, `console`, `notify`.** Each owns what it writes, so every contract is a read.

| Track | Delivers | Why it is theirs |
|---|---|---|
| **lead** | the migration — `ENT-member_invitations`, the `invitation_status` enum, the full policy set with a grant each, the three RPCs, `provision_member()`'s claim, `before_user_created_hook()`'s read and its `supabase_auth_admin` grant — plus `03`'s policy rows and §8.2 test rows **in the same commit**, the RLS cases, the demonstrable specs, the gates and the PR | Tables, enums and migrations are the lead's (the migration rule). ★ **The auth hook is the single point of failure for all sign-in** and nobody else goes near it. Invariant 5 and invariant 6 both land here |
| `console` | `SCR-049` — «أضف عضوًا», the sheet, the pasted list with its per-line report, the waiting rows with their age, resend, revoke with a mandatory reason — its DAL, its strings, its tests | It has owned `/app/admin/members`, `admin-members.ts` and `admin.json` since wave 22, and it has built every console table with a bulk bar and a reason sheet |
| `notify` | `JOB-send_member_invitation`, the designed mail family, the text alternative, the `email_deliveries` row, its tests | It has owned the mail, the transport and `packages/mail-runtime` since wave 10 |

★ **Everything else is the lead's as custodian.** `sessions`, `checkin`, `scoring`, `content`, `event`, `designer`,
`platform` and `branding` are not spawned.

---

## 3 · The contracts

1. ★★ **Lead → both, and first: the migration lands before either track writes a line.** The entity, the enum, the
   policies, the grants, the RPCs, the claim and the hook are **one migration** (from `0194`, after wave 24's `0192`
   and `0193`), and the lead posts «the invitation is in at `<sha>`» with the three RPCs' exact signatures and the
   `invitation_status` values. **Nobody builds a screen or a job against a guess.**
2. ★★ **Lead → `console`: the DTO.** One DAL read returns the members and the waiting rows **as one list**, each row
   saying which it is, so the table is not two queries stitched in a component. `console` names the type in its plan;
   the lead confirms the SQL it reads. ★ **A waiting row carries no member fields** — no role control, no
   deactivation, no profile link — because the DTO does not have them.
3. ★★ **Lead → `notify`: the address is read, never passed.** The payload is `{invitation_id}` and nothing else;
   the definer function that returns the address is the lead's. `notify` never writes an address into a payload and
   never reads `member_invitations` directly.
4. ★ **`console` → lead: the counts.** `admin-dashboard.ts`'s attention rows and the rail's badges count **members**.
   `console` states in its plan which figures its screen shows and confirms that no existing count moves.
5. ★ **Everyone: there is no artboard.** `AdminMembers.dc.html` draws no add affordance (`DEC-243` §1.8). The screen
   is **extended**, built from wave 22's own structure and the console's existing sheet and reason patterns. **No
   class, id or markup pattern from a `.dc.html` in `src/`**, and a disagreement is written down, never resolved
   silently.

---

## 4 · The rules

- ★★ **The hook still fails open.** The invitation read goes **inside** `0007`'s existing `begin`/`exception` block,
  and the `when others then return event` stays verbatim. A test proves that a failing invitation read still admits a
  sign-in the domain list would have allowed. **This is the one thing in the wave that can take the product down.**
- ★★ **The override is scoped to `pending`**, and revoking is therefore a real control (`DEC-243` §5.2).
- ★★ **An invitation cannot grant `admin`** (`DEC-243` §5.4) — `member` and `moderator` only. A refusal, not a
  deferral.
- ★★ **The claim and the member's creation are one transaction**, and the `where status = 'pending'` predicate on the
  update is the lock. A concurrent double sign-in claims once and provisions one member.
- ★★ **No second sign-in method, and no `auth.users` row is ever created by us** (`DEC-243` §9): no password, no magic
  link, no OTP, no Admin API, no `service_role` on Vercel (invariant 7).
- ★ **No new primitive.** `ui/` stays **69** files and `tests/unit/ui-playground.test.ts` is untouched. The console's
  sober register holds (`REQ-UIX-053`) and `console-register.test.ts` is **not edited**.
- ★ **`registrations` is never touched; the five public routes do not move.** `qa:contract`, `qa:appearance`,
  `visual`'s public pairs and the register-form fingerprint are **unmoved, not re-baselined** — and the lead proves it.
- ★ **The matrix stays at 25 and `tests/unit/mail-pinned/**` is untouched** by anyone, `notify` included.
- ★ **Arabic first**; `<bdi dir="ltr">` on every email address; Western numerals (`DEC-124`); six ICU forms wherever a
  count appears; logical properties only.
- ★ **No explainer copy** (`DEC-NEXT-25`): a word or a number, state in the row, nothing shown when nothing needs doing.
- ★ **The existing suites are evidence**; each changed assertion is a ledger line in `STATUS.md`, in the same commit.
- ★ **No new dependency.** `package.json` is the lead's. **One migration**; a function a plan needs beyond it goes
  under `supabase/proposed/<you>/`.
- **Teammates spawn planning-only**; sync 1 approves two plans; **nobody builds before the lead posts «the invitation
  is in».**
- **One writer per file, specs included. `ui-lint --strict` has no allowlist and never gains one.**
- **Captures land at `.qa-shots/rtl/wave25-<track>-<surface>-<state>-<390|1280>.png`** from a production build the row
  names by commit, honouring `E2E_SHOTS_DIR`; the lead opens every one, in bands, never downscaled.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`, `stop`,
  branch switches, worktrees, pushes and the PR.

---

## 5 · Step order

| Step | What | Who |
|---|---|---|
| 0 | Confirm wave 24's A, B and C are merged and `main` is the base. Cut `wave-25/add-a-member` **before the first edit**, and open the PR against `main` on its first push | lead |
| 1 | The migration, whole, with `03`'s rows and its RLS cases in the same commit. Post the signatures | lead |
| 2 | Spawn `console` and `notify` planning-only; sync 1 approves two plans against §3's contracts | lead |
| 3 | The job and the mail family; the screen | `notify` · `console` |
| 4 | The five demonstrables (`14`'s M27 row), the captures, the a11y sweep, the gates | lead |
| 5 | The owner rehearses `0194` on a dump taken at `0193`, pushes, merges | owner |

---

## 6 · The one open question, and its default

★ **Does a pending invitation expire?** **Default in force: no** (`DEC-243` §10). It is revocable, and revocation is the
control. The cost is that an abandoned invitation is a standing admission for that address until somebody revokes it,
which is why the waiting rows show their **age** and the audit log answers who created each one. If the owner wants
expiry it is a column, a predicate in the hook's read and a line in `retention_periods` — **named in a plan, never
invented in one.**

---

## 7 · What NOT to build, and never-touch for every teammate

A nullable `members.auth_user_id`; a third `member_status`; a second sign-in method; creating an `auth.users` row; a
26th matrix key; an invited person in the directory, a picker, a board or any denominator; a CSV import with column
mapping; a member-visible invitation list; «request access» or any org self-registration (`01` §43); a session-level
presenter invitation (`DEC-175`); an invitation that grants `admin`; the five public routes; `registrations`; stories
and `story_views` — the ring stays inert; `/app/platform/**`; the studio; every console screen but `SCR-049`;
`DEC-194`'s two gates; `DEC-215`'s four; `DEC-186` §4; `DEC-204`; the November Railway dry run (`DEC-241` §2) is the
owner's and is not this wave's.
