# Wave 28 — the lead's brief

**Written:** 2026-10-05 by the monitor session · **For:** the wave-28 lead
**Place this at `docs/plan/notes/wave-28-lead.md`** on your own branch. Never commit onto `main`.

★★ **READ `docs/plan/STATUS.md` FIRST** — and confirm these, measured at 2026-10-05 17:10Z after
wave 27 closed:

- **`main`:** `5f495453` (merge of #83, `wave-27/close`) · **wave 27's five PRs**: #79 merged 13:29Z,
  #80 13:53Z, #81 14:23Z, #82 16:18Z, #83 17:02Z
- **production:** `0210`, matching `main`'s last migration `0210_platform_rows_read.sql`
- **next migration:** `0211` · **next decision:** read `DECISIONS.md`'s tail; `DEC-255` was wave 27's
  sync-1 entry and the wave wrote more after it
- ★ **`main`'s CI was still `in_progress` on `5f495453` when this was written.** Read the run's own
  conclusion before trusting it (`DEC-192`) — not the check rows, and not this line.

---

## The goal, above the process (the owner's words)

★★ **«instead of auto save i want the user to manually save and in case they made edits that weren't
saved then a popup shows up to either discard or save».**

The designer is the one surface in the product that writes to the server without being told to. An
admin arranging a poster should decide when their work becomes the document — and should never lose
work because they decided late. **Both halves matter**: a manual save that loses a laptop's worth of
edits is worse than the autosave it replaced.

**«Good» is not «the gates are green».**

---

## Step 0 — what is measured and true. Do not re-derive it.

| # | Claim | Evidence |
|---|---|---|
| 1 | The editor's state machine is the module wave 23 kept **verbatim** | `src/components/designer/editor-state.ts`, moved intact before `editor.tsx` was deleted (`DEC-237` §2) |
| 2 | ★ **Dirty tracking already exists** | `editor-state.ts:48-56` — `SaveState` is `clean · saving · saved · error · conflict · forbidden · locked · invalid` |
| 3 | ★ **Autosave is one constant and two timers** | `AUTOSAVE_DELAY_MS = 1200` at `:60`; `setTimeout` at `:229` and `:247` |
| 4 | The write is a **Route Handler**, not a Server Action | `src/app/api/designer/[documentId]/route.ts` — Server Actions cap at 1 MB and a document exceeds it |
| 5 | The bar already renders the state | `src/messages/ar/designer.json:60` «محفوظ»; «مسودة» beside it (`M12.md` §056) |
| 6 | ★★ **The leaving-with-changes pattern ALREADY EXISTS, in seven files** | `src/components/me/profile-edit.tsx` (the reference, `DEC-231` §3) · the four wave-22 console pages — `settings-edit`, `catalogue-edit`, `recognition-edit`, `reminders-edit` · `src/components/branding/brand-kit-edit.tsx` · ★ **`src/components/email/builder.tsx` — the other editor, and the closest analogue** |
| 7 | ★★ **The house rule is written down, verbatim** | `profile-edit.tsx:40-42`: «a press on any link while something is unsaved opens a dialog; a reload or a closed tab gets the browser's own question. The browser's Back is not asked about» |
| 8 | ★ **No file in the product keeps a local draft** | no `localStorage`, `sessionStorage` or `indexedDB` in any of the seven — §1.3 is the first |
| 9 | Preview and export read the **saved** document | the owner ruled special handling «totally not needed» — recorded, see §1.5 |

★★ **The consequence of 6 and 7: this item ADOPTS an existing pattern, it does not invent one.** A plan
that designs a new unsaved-changes mechanism has not read `profile-edit.tsx`. Read it, read
`email/builder.tsx` — the other editor, which solved this for a canvas of blocks — and then say in the
plan **what the designer needs that neither already does**.

---

## 1 · The designer saves manually, and asks before work is lost

### 1.1 Manual save

The two `setTimeout`s go. `push()` **does not change** — the route, the document model and the engine
are untouched. A Save control in the bar calls the same `push()`, and the bar's «مسودة» / «محفوظ»
becomes the real dirty indicator instead of an autosave echo.

★ **`SaveState` already distinguishes `clean` from `saved`** (`:49`, `:51`). Use them as they are;
inventing a parallel dirty flag beside a union that already has one is how two sources of truth start.

### 1.2 Asking — three exits, three mechanisms, two of them already built

| Exit | Mechanism | Precedent |
|---|---|---|
| The editor's back control, and any in-app link | ★ **the custom dialog: save · discard · cancel** | `profile-edit.tsx`, `email/builder.tsx` |
| Tab close, reload | `beforeunload`, **armed only while dirty** | the same seven files |
| A crash, a closed laptop, a killed process | ★ **a local draft** | **none — new, §1.3** |

★★ **`beforeunload` cannot carry your words.** Chrome and Safari ignore any custom message and show
their own; it fires only if the person has interacted with the page first. That is a browser limit, not
a design choice. **Do not attempt a custom dialog there**, and say so in the plan so nobody tries again
in a year.

★ **The browser's Back is deliberately not asked about** in `profile-edit.tsx` (`:41-42`, recorded under
D13). Decide what the designer does with Back and **say why**; the reference's answer may not fit a
full-screen editor with no read mode to return to.

### 1.3 The local draft — the one new thing

Unsaved edits are mirrored to the browser's own storage while editing, and offered back when the
editor reopens.

★★ **A local draft is not autosave, and the plan must say so in these terms:** autosave wrote to the
**server**, which is what exports, previews and other people read. A local draft never becomes the
document. **The document still changes at exactly one moment, and it is the one the person chooses.**

**The plan must answer:** what happens when a restored draft disagrees with a server document that has
moved on since — rare, because these documents have one editor at a time, but it needs a rule rather
than an accident. `SaveState` already has a `conflict` kind (`:53`); read what it means today before
giving it a second meaning.

★ **If the owner would rather not take new ground here, §1.3 is separable** — §1.1 and §1.2 are the
whole of the owner's literal ask and stand alone. Ask before dropping it; do not drop it silently.

### 1.4 Discard

**Discard reloads the document from the server.** With autosave gone the server holds the last manual
save, so discard needs no undo stack and no snapshot. ★ It also drops the local draft of §1.3 — a
discard the person confirmed is a discard.

### 1.5 Preview and export — ruled, and deliberately not handled

`«معاينة بجلسة»` and `«صدّر»` read the **saved** document, so with unsaved edits they render the last
saved version. ★ **The owner ruled this «totally not needed».** It is recorded as a decision, not an
oversight. Do not add a save-first flow, and do not save silently on preview — that is autosave through
a side door. Revisit only if it confuses people in use.

### 1.6 What the plan must still answer

- **Where the Save control sits** on the bar (`M12.md` §056 draws back · name · state · undo/redo ·
  the variant strip · zoom · preview · export) and its keyboard shortcut.
- **What a dirty document does when the session expires** — the auth boundary is at the data, so the
  save fails rather than silently succeeding. Say what the person sees, and whether the local draft
  survives it.
- **Whether `email/builder.tsx` should move onto whatever this builds**, or stay as it is. One editor
  adopting a pattern and the other keeping its own copy is how two patterns start. ★ A change there is
  `notify`'s file — a written request, not an edit.

### 1.7 Not this item

Collaborative editing · a version history · a server-side draft separate from the document ·
reintroducing a server autosave under any name · touching `canvas.tsx`'s engine, the parity goldens or
the export pipeline · a new `ui/` primitive — the dialog is `ui/dialog`, and `ui/` stays where wave 27
left it.

---

## 2 · The last-org lockout — ★ AWAITING THE OWNER'S RULING. DO NOT BUILD IT UNASKED.

Measured live on 2026-10-05, when the owner deleted the only organisation from the platform console:

1. `delete_org` removes the org; every org-scoped table cascades, `org_domains` included.
2. `provision_member()` joins `orgs` to `org_domains` (`0005_tenancy_rpcs.sql:143-148`) and returns
   `no_match` when nothing matches — which, with no domains at all, is **every address**.
3. `src/app/api/auth/callback/route.ts:38` then calls `supabase.auth.signOut()`.

★★ **So the super admin cannot obtain a session through the product at all**, and `/no-access`'s
platform-admin branch (`no-access/page.tsx:42`, which needs `kind === "no_org"`) is unreachable in the
one state it was written for, because the sign-out makes it `"none"`. Recovery required seeding an org
directly in SQL.

**Two candidate fixes, neither built:** check `platform_admins` before that sign-out, or drop the
sign-out entirely and let `/no-access` do its job — `requirePlatformAdmin()` already reads the table
rather than the claim (`src/lib/dal/platform.ts:46-49`), so the console works the moment a session
exists.

★ **`DEC-253` §7.1 names this as the owner's to rule on. It is not scope until they say so.**

---

## 3 · Two narrowings from wave 27 the owner may want reversed

Both are the wave-27 lead's judgement inside the owner's scope, both defensible, both narrower than
what was asked. ★ **Only in scope if the owner says so.**

- **`DEC-255`** — a session is renameable **only until it is published**. The owner asked for «the admin
  to be able to edit the name of the session», unqualified.
- **`DEC-254`** — keeps `DEC-244` §11: **an addition by email never grants `admin`**. The owner asked for
  «the ability to make a member an admin». Promotion after the fact already works
  (`member-row-menu.tsx:35`, `admin-members.ts:186`); only the add path refuses, in four places, one of
  them the database.

---

## The rules that bind

- **Teammates never write `supabase/migrations/`** — they propose under `supabase/proposed/<name>/`.
- **One writer per file**, specs and demos included. **Tables are the lead's.**
- ★ **No migration is expected.** This wave is client state; if a plan needs one, it is the lead's, from
  whatever `STATUS.md` says is next, additive, rehearsed by the owner on a production dump.
- ★ **The studio is the sober register** (`REQ-UIX-053`): no motion beyond drag feedback, the dialog does
  not animate, and **`tests/unit/console-register.test.ts` stays green and untouched.**
- ★ **No parity golden moves** (`DEC-176`). This wave changes when a document is written, never what it
  renders. **A golden that moves is a bug, not a re-baseline.**
- **`registrations` is never read, altered or dropped.** The five public URLs do not move: `qa:contract`
  green at every commit, the register-form fingerprint byte-identical.
- **Arabic first**, `<bdi>` on every interpolated value, Western numerals (`DEC-124`), six ICU forms,
  logical properties — **except `DEC-096`'s overlay**, which nobody tidies.
- **The existing suites are evidence** — each changed assertion is a ledger line in `STATUS.md`, in the
  same commit.
- ★ **The designer is desktop-only** (`06` §2). No phone designer is invented.
- **`npm run qa`, `npm run visual`, `npm run build`, `supabase db reset/start/stop`, branch switches,
  worktrees, pushes and the PRs stay the lead's.** ★ **The owner merges**, and the acceptance is theirs.

## Carried, not this wave unless the owner says

The Railway check owed from `DEC-253` · impersonation's durations (`DEC-248` §7.9) · the `railway.json`
→ `.railway/railway.ts` migration due **2026-12-01** · `DEC-194`'s two gates · `DEC-186` §4's overshoot
ceiling · `DEC-204`'s hard-load duplicate.

## A note on the live database

The org `49be708a-648f-4e68-82cb-5884544ee388` (`يمان`/`hoiu49`/`TST`) was **seeded by hand** on
2026-10-05 after the owner deleted the only organisation, and wrote no `org.created` audit row —
deliberately, and recorded. If wave 27 did not finish item 2's per-org template seeding, **check that
this org has templates of its own before anyone issues a certificate from it**: `0127:260-274` raises
`no_certificate_template` (`42704`) when nothing resolves.
