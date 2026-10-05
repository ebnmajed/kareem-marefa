# Wave 27 — the lead's brief

**Written:** 2026-10-05 by the monitor session · **For:** the wave-27 lead
**Place this at `docs/plan/notes/wave-27-lead.md`** on your own branch — do not commit it onto `main`.

**`main`:** `81511b91`, green on every merge commit · **production:** `0199` ·
**next migration:** `0200` · **next decision:** `DEC-254` · **`ui/` primitives:** 71

★ **Wave 26 merged in full on 2026-10-05** — #73 A 08:46, #74 B 08:55, #75 C 09:11, #76 D 09:28,
#77 E 09:56, closed by `DEC-253`. Every screen in `09` now has a design and is built. **This wave is
the first that is not drawn**: the owner decided its scope, so there are no artboards for most of it
and `DEC-208`'s delete-first rule applies only where a screen is genuinely rebuilt.

---

## The goal, above the process (the owner's words)

- ★★ **A member's company comes from their email domain, not from the member.** An admin adds a
  company with its domains and the platform works out who belongs to it — including people who
  already signed in and are sitting with no company.
- ★★ **An organisation owns its templates.** The designed templates stop being a read-only platform
  library an org must copy from; every org gets its own editable set from birth.
- ★ Certificates exist by default and are **held for review**, not off.
- ★ An admin can fix a session's name.
- ★ The check-in code stops changing every ten minutes.
- ★ A member can be **added** as an admin, not only promoted to one afterwards.

**«Good» is not «the gates are green».**

---

## Step 0 — what is measured and true today. Do not re-derive it.

| Claim | Evidence |
|---|---|
| `companies` has **no** domain column | `0004_tenancy.sql:158-165` — `org_id`, `name`, `deactivated_at` only |
| A member sets their own company | `src/lib/dal/members.ts:115` writes `company_id` from `SCR-021`'s profile edit |
| `provision_member()` never sets a company | `0005_tenancy_rpcs.sql:129-210` — a new member arrives with `company_id` null |
| `provision_member()` short-circuits for an existing member | `:129-136`, **before** the domain lookup at `:144`. This is why removing a domain never locks out someone already provisioned |
| `org_domains` is the org's membership gate, separate from any company | `0004_tenancy.sql:72-84`; not globally unique, by `A2` |
| `sessions.certificate_mode` defaults to `'off'` | `0010_m2_schema.sql:88`; enum `('off','automatic','review')` at `0010:20` |
| The mode has one writer and is refused after completion | `set_session_certificate_mode()` `0154:402`; `DEC-178`; `0194` fixed a case where it wrongly refused |
| **A session's title is already updatable** | `grant update (title, abstract, level, language)` `0010:469` + policy `sessions_update_admin` `0010:459-461`. `schedule_session()` has no title parameter on purpose |
| `check_in_codes` carries a hard validity window | `0010:205-217` — `valid_from`/`valid_until` both `not null`, `check (valid_until > valid_from)` |
| The rotation is an org setting | `org_settings.check_in_rotation_seconds` `0004:114`, default 600, `check between 60 and 3600`. `worker/src/tasks/rotate_codes.ts` issues the next code |
| Templates are platform- or org-scoped | enum `0055:59`; `design_templates.org_id` nullable `0055:76` |
| **Scope and `org_id` are bound by a check constraint** | `0055:92` — `check ((scope = 'platform') = (org_id is null))`. Abolishing platform scope must deal with this |
| An org **cannot** edit a platform template, by RLS | `0055:577-585` — read allows `platform or mine`; insert/update/delete all require `scope = 'org'` |
| The copy path already exists | `src/lib/dal/templates.ts:268` sets `duplicated_from` — «انسخ لتعدّل» |
| ★★ **Certificate issuance raises when no template resolves** | `0127_certificates_reissue.sql:260-274` — the org's default for the kind, else a fallback, else `raise exception 'no_certificate_template' using errcode = '42704'` |
| Production holds **24 platform templates, 24 versions** | measured 2026-10-05: 12 poster (2 retired), 12 certificate (0 retired) |
| ★ The live org was **seeded by hand** and has **no templates of its own** | `49be708a-648f-4e68-82cb-5884544ee388`; it issues certificates today only because of the platform fallback |

---

## 1 · Companies are linked to an email domain

**The owner's rulings, all settled:**

1. **Companies and orgs are separate things.** `org_domains` still decides who may join the org. A
   company's domain decides only which company a member lands in. **Neither list validates the other.**
2. **Several domains per company** — a list, not a string.
3. **One domain maps to at most one company, per org** — enforced in the database.
4. **No match at sign-in leaves `company_id` null**, as today — **and the assignment is retroactive**:
   when an admin later adds a company carrying that domain, members already sitting with no company
   who match it are swept into it.
5. **The member never sets it.** The picker comes off `SCR-021`; `members.ts:115` stops writing
   `company_id` from a member's own edit.
6. **An admin may override an individual**, and ★ **that override survives a later domain edit** — a
   deliberate placement is never undone by a domain change.
7. **Changing a company's domains re-derives, but asks first** — the save shows how many members move
   and where, the admin confirms, and members placed by hand (6) are excluded and the dialog says so.

**Touches:** a migration from `0200` · `provision_member()` · a definer function for the sweep and the
re-derive · `SCR-048` `/app/admin/companies` (the domains field) · `SCR-021` (picker removed) ·
`src/lib/dal/members.ts:115` · the admin member edit (the override, and the flag that marks it manual) ·
RLS cases, units, e2e · `01-prd.md` for the new `REQ-*`.

★ **`02-domain-model.md` is frozen** — the new column needs a `DECISIONS.md` entry.
★ **`SCR-048` has an artboard from wave 22** — adding a field is a design amendment or a question for
the designer; it is not a free-hand redesign.
★ **(6) needs a column**, not just a convention: something on `members` recording that the company was
set by a human, or the re-derive cannot tell which rows to leave alone.

---

## 2 · Templates become org-scoped; the platform library is retired

**The owner's ruling: abolish platform scope.** The baseline lives in the seeding code, not in rows.
`0193`'s documents become a function `create_org()` calls, inserting them as that org's own
`scope = 'org'` rows. Every org owns its set from birth and can edit it. A later improvement to the
baseline reaches only orgs created after it — ruled, and consistent with `REQ-DSG-008`.

★★ **THE SEQUENCING CONSTRAINT, AND IT IS THE WHOLE RISK OF THIS ITEM.** `0127:274` raises
`no_certificate_template` (`42704`) when nothing resolves. Today every org is caught by the platform
fallback. **The per-org seeding must land, be proven, and be backfilled onto every existing org
BEFORE a single platform row is removed.** An org created by any path that skips the seed is an org
that cannot issue a certificate. The live org `49be708a` has none today and must be backfilled first.

**Also goes, and the plan must say where each lands:**
- `SCR-083`, the platform library screen — **built and verified in wave 26 PR C**, now superseded.
  Delete it with its kept-behaviour table (`DEC-208`), do not leave it orphaned.
- `promote_template_to_platform()` (`0069:676`) — a super admin can no longer publish an org's
  template to a library. That capability disappears; say so in the entry rather than letting it rot.
- `templates_read`'s `scope = 'platform' or …` (`0055:578`) simplifies.
- ★ the check constraint `design_templates_scope_org` (`0055:92`) binds scope to `org_id` nullability
  and must be rewritten or dropped in the same migration.
- `0193`'s own guard refuses to touch anything but platform scope — read it before changing it.

★ **No parity golden may move.** A copy is byte-identical to the row it came from, so an untouched
document derives identically. **A golden that moves is a bug, not a re-baseline** (`DEC-176`).

---

## 3 · The certificate mode defaults to `review`

- `sessions.certificate_mode` default `'off'` → **`'review'`** (`0010:88`), and the same for
  `schedule_session()`'s `p_certificate_mode` where it still defaults to `'off'`
  (`0021:46`, `0085:54`, `0106:81`, `0112:68`; **the live one is `0154:54`, which already defaults to
  null meaning «unchanged» — check which actually needs to move before writing SQL**).
- `'review'` means held: generated for every eligible member, invisible and silent until an admin
  releases (`REQ-CRT-004`). Certificates exist by default without anything reaching a member unreviewed.
- ★ **`DEC-178` stands.** The mode is still written only on `045` and still refused after completion.
  The owner's «can't be changed» was a completed session behaving as designed.
- ★ **A default applies to new rows.** Existing sessions are not re-defaulted, and no migration
  rewrites one.

---

## 4 · An admin can edit a session's name

★ **The cheapest item in the wave: no migration, no policy, no grant.** Both halves exist already —
`grant update (title, abstract, level, language)` (`0010:469`) and `sessions_update_admin`
(`0010:459-461`). `schedule_session()` has no title parameter because schedule-shaped things go
through the RPC, and a title is not schedule-shaped.

So: a field, a DAL function through the existing grant, an action, and a test. **Decide where it
lives** — the hub header (`SCR-043`, wave 21) or the schedule tab — and say why in the plan.
★ A renamed session appears in the feed, reminders already sent, the calendar entry and any issued
certificate's snapshot. **Say in the plan what each does**; the expected answer for a certificate is
«nothing moves», because `REQ-CRT-014` renders it as issued.

---

## 5 · The check-in code stops rotating

**Ruled: remove the ROTATION only.** One fixed code per session, per day.

★★ **`valid_until` and `check_in_ceiling()` STAY.** Do not drop the column, do not drop
`check (valid_until > valid_from)` (`0010:217`). A code still cannot be used a week later, and the
anti-sharing floor holds. The owner was asked explicitly and chose the rotation alone.

Shape: a rotation of «none» — null, or 0 — rather than widening the 60–3600 range, so the setting
still reads as a choice in `SCR-063`. `worker/src/tasks/rotate_codes.ts` becomes a no-op for an org
with rotation off; **say in the plan what it does to a session whose code was already rotating.**

---

## 6 · A member can be added as an admin

**The owner's report: «now in the live app there is only member or moderator, no admin option. It was
there but it disappeared.»** Measured, and it is half true — which decides the fix.

| Path | Admin offered? | Evidence |
|---|---|---|
| **Changing** an existing member's role | ★ **Yes, works end to end** | `member-row-menu.tsx:35` offers all three; `admin-members.ts:186` validates `["admin","moderator","member"]` |
| **Adding** a member | ★ **No** | `add-member.tsx:89-92` lists only member and moderator; `admin-members.ts:253` **and** `:288` both validate `z.enum(["moderator","member"])` |

So the restriction is in **three places** — one form and two Zod schemas — not one. A fix that changes
only the `<option>` list will be rejected by the action and look like a bug.

★ **The workaround that works today**, and the owner has been told: add the person as a member, then
use the row menu to make them an admin. The `last_admin` guard (`0005:233-237`) is unaffected.

★ **Before changing it, find out whether the exclusion was deliberate.** Two schemas agreeing is not a
typo. Read the commit that introduced `:253`/`:288` and `01-prd.md`'s `REQ-ADM-*` for member
management; if a requirement says an admin is only ever promoted and never created, this item becomes a
`DECISIONS.md` entry reversing it rather than a bug fix. **Say which it is in the plan.** The
`last_admin` guard and `assert_fresh_admin()` stay whatever the answer.

---

## Order, and why

1. **Item 4** (session name) and **item 6** (add as admin) — independent, no migration, land first and
   prove the wave runs.
2. **Item 3** (certificate default) — one migration, no behaviour change to existing rows.
3. **Item 5** (rotation) — one setting, one worker task, its own tests.
4. **Item 1** (companies) — the wave's substance; a migration, `provision_member()`, two screens.
5. **Item 2** (templates) — **last**, and only after its seeding is proven and backfilled, because
   `no_certificate_template` is a hard failure and the platform rows are what prevents it today.

---

## Carried, and awaiting the owner

★ **The last-org lockout** (`DEC-253` §7.1, and the owner hit it live on 2026-10-05). Deleting the
last org empties `org_domains`, so `provision_member()` returns `no_match` for every address, and
`src/app/api/auth/callback/route.ts:38` then calls `signOut()` — **the super admin cannot obtain a
session through the product at all**, and `/no-access`'s platform-admin branch is unreachable in the
one state it exists for. Two candidate fixes: check `platform_admins` before that sign-out, or drop
the sign-out and let `/no-access` do its job. **The owner has not ruled; do not build it unasked.**

Also carried from before: impersonation's durations (`DEC-248` §7.9); the `railway.json` → `.railway/railway.ts`
migration due **2026-12-01**; `DEC-194`'s two gates; `DEC-186` §4's overshoot ceiling; `DEC-204`'s
hard-load duplicate.

---

## The rules that bind this wave

- **Teammates never write `supabase/migrations/`** — they propose under `supabase/proposed/<name>/`
  and the lead numbers and promotes.
- **Tables are the lead's; behaviour is the tracks'. One writer per file**, specs included.
- **`registrations` is never read, altered or dropped.** The five public URLs do not move: `qa:contract`
  green at every commit, the register-form fingerprint byte-identical.
- **Arabic first**, `<bdi>` on every interpolated value, Western numerals (`DEC-124`), six ICU forms,
  logical properties.
- **The existing suites are evidence** — each changed assertion is a ledger line in `STATUS.md`, in the
  same commit.
- **No new dependency.** **Additive migrations**, because `main` runs on them first; the owner rehearses
  on a production dump, pushes, merges, then checks Railway.
- **`npm run qa`, `npm run visual`, `npm run build`, `supabase db reset/start/stop`, branch switches,
  worktrees, pushes and the PRs stay the lead's.**
- ★ **The owner merges**, and the acceptance is the owner's.

## Not this wave

New scope of any kind beyond the five items; anything the owner has not ruled on, the last-org lockout
included; re-opening `DEC-178`; removing `valid_until` or the check-in ceiling; a design change to any
screen beyond the fields these items add; replacing the renderer.
