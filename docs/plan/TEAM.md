# TEAM — the agent team, its waves, and the lead's spawn prompt

**Status:** `settled` (DEC-040) · **Owner:** the lead session · **Companion:** `CLAUDE.md` § Agent team

One lead Claude Code session, three to five in-process teammates, **one checkout, one branch, one
local Supabase**. Development is local Supabase and CI only until Launch (DEC-039). Nothing here
spawns anything; the owner starts the lead with the prompt in §4.

---

## 1. Waves

Derived from `14-roadmap.md` §3, `15-backlog.md` and `TRACEABILITY.md`: M1 → M2 → {M3, M4, M5};
M5 → M6; M4 + M6 → M7; M7 → M8. Nothing outside M2 can start before M2, so wave 1 **splits M2
along its own seams**.

| Wave | Teammates | Why they can run together | Gate |
|---|---|---|---|
| **0 — done** | lead | Migration `0010` (the M2 schema with RLS, grants, `03` §8.2 rows), the per-namespace messages, the gate lock, `applyProposed()`, `supabase/proposed/`, this document | PR `m2/schema` merged |
| **1** | `sessions` · `checkin` · `event` | Disjoint tables, DAL modules, screens, jobs; the one shared surface, the event page, is `sessions`' with three slots the others fill from their own folders. `sessions` also holds `app/admin/{proposals,sessions,venues}/**` and `messages/*/admin.json` for this wave (DEC-042); `console` inherits them at wave 3 | M2 demonstrable in a real room; `wave-1/m2` PR green |
| **2** | `notify` (M3) · `scoring` (M4) · `content` (M5) | Each depends only on M2 | each milestone's demonstrable, locally |
| **3** | `designer` (M6) · `console` (M7: CRUD, moderation, exports, audit viewer — the surfaces that need only M2–M4) | M6 needs M5; the console half that needs no templates runs alongside | |
| **4** | `platform` (M8) · `branding` (M7: brand kit, templates) | both need M6 and M7-console | Launch follows, owner-run |

### Ownership for wave 2 (confirmed by the owner 2026-09-14, DEC-046) and waves 3–4 (drafts)

The wave-2 rows are the ones in `CLAUDE.md` § Agent team and in `.claude/agents/{notify,scoring,content}.md`;
the agent definition is authoritative for a teammate. Two carve-outs follow DEC-042's pattern —
`notify` holds `app/admin/{emails,reminders}/**` and `scoring` holds `app/admin/{scoring,recognition}/**`
for this wave; `console` inherits both at wave 3.

| Teammate | Model | Edits only |
|---|---|---|
| `notify` | opus | `src/app/[locale]/app/me/{notifications,calendar}/**`, `src/app/[locale]/app/admin/{emails,reminders}/**`, `src/app/api/{sessions/[id]/ics,webhooks,calendar}/**`, `src/lib/dal/{notifications,calendar}.ts`, `src/components/{notifications,calendar}/**`, `worker/src/{mail,calendar}/**`, `worker/src/tasks/{send_notification,schedule_reminders,send_reminder,rating_prompt,rsvp_nudge,calendar_upsert,calendar_delete,refresh_calendar_tokens}.ts`, `messages/*/{notifications,calendar}.json`, `supabase/proposed/notify/**`, its tests, `docs/plan/notes/notify.md` |
| `scoring` | sonnet | `src/app/[locale]/app/{leaderboards,me/points}/**`, `src/app/[locale]/app/admin/{scoring,recognition}/**`, `src/lib/dal/{points,leaderboards,recognition,scoring-admin}.ts`, `src/components/scoring/**`, `worker/src/tasks/{award_points,award_presenter_points,evaluate_no_shows,evaluate_streaks,evaluate_badges,evaluate_levels_perks,snapshot_leaderboards,audit_balances}.ts`, `messages/*/{scoring,leaderboards,recognition}.json`, `supabase/proposed/scoring/**`, its tests, its note |
| `content` | sonnet | `src/app/api/{upload,materials,photos}/**`, `src/lib/storage/**` (the single path builder), `src/lib/dal/{materials,photos,tasks,search,bookmarks}.ts`, `src/app/[locale]/app/sessions/[id]/materials/**`, `src/app/[locale]/app/me/bookmarks/**`, `src/components/{materials,photos,viewer,tasks,search}/**`, `worker/src/content/**`, `worker/src/tasks/{convert_document,render_pages,process_photo,rebuild_search}.ts`, `converter/{fixtures,test}/**`, `messages/*/{materials,photos,tasks,search}.json`, `supabase/proposed/content/**`, its tests, its note |

**Wave-2 contracts (DEC-046):**

- **Hooks into M2 are SQL only.** A wave-2 track never edits wave-1 app code; it proposes a trigger
  or a `create or replace` of an M2 RPC at its marked call site (`TODO(notify, M3)` in `0014`,
  `TODO(scoring, M4)` in `0015`) and the lead promotes it.
- **`notify` publishes `public.notify(p_org, p_member, p_category, p_payload, p_key)` on day one**
  (its first proposed file, promoted at sync 1). `scoring` and `content` call only that function,
  from their own SQL, and leave a `TODO(notify)` at the call site until it is promoted.
- **Jobs are enqueued only through `public.enqueue_job()`** (`0025`), never `graphile_worker.add_job`.
  Keys are `11`'s, verbatim; a re-enqueue with the same key moves the job.
- **The lead wires the slots** — on the event page `AddToCalendar`, `Materials`, `Photos`, `Tasks`;
  on the home page `PointsStrip`; in the shell `NotificationBell`; on the propose screen
  `ProposalMaterials`; on browse `SearchFilters`. Same contract as §2: server components, ids never
  rows, own data through the owner's DAL, no heading of their own.
- **Each track proposes its own milestone's schema as its first file**; sync 1 is early so the
  isolation sweep covers the new tables within hours.
- **Mail never reaches a provider before Launch.** `worker/src/mail/transport.ts` is an interface:
  a sink (SMTP to Mailpit on `:54325` locally, an in-memory transport in CI) and Resend, wired at
  Launch. `RESEND_API_KEY` is never read in development or CI.

### Ownership for waves 3–4 (drafts — the lead confirms at each wave's start)

| Teammate | Edits only |
|---|---|
| `designer` | `packages/designer-runtime/**`, `src/app/[locale]/app/admin/{designer,templates}/**`, `src/lib/dal/{designer,certificates}.ts`, `worker/src/tasks/{render_variant,issue_certificates,materialise_font}.ts`, `src/app/[locale]/verify/**`, `messages/*/{designer,certificates}.json`, `supabase/proposed/designer/**` |
| `console` | `src/app/[locale]/app/admin/**` except `designer`, `templates`, `branding`; `src/lib/dal/admin*.ts`; `messages/*/admin.json`; `supabase/proposed/console/**` |
| `platform` | `src/app/[locale]/app/platform/**`, `src/lib/dal/platform*.ts`, `worker/src/tasks/{retention_*,anonymise_*,storage_prefix_assert}.ts`, `messages/*/platform.json`, `supabase/proposed/platform/**` |
| `branding` | `src/app/[locale]/app/admin/branding/**`, `src/lib/brand/**`, `messages/*/branding.json`, `supabase/proposed/branding/**` |

---

## 2. Contracts

### The event page slots (`sessions` publishes, `checkin` and `event` implement)

`src/components/sessions/slots.ts`, written by `sessions` on day one and never changed without
telling the lead:

```ts
export type SlotProps = { sessionId: string; memberId: string; locale: string };
// checkin implements  src/components/checkin/rsvp-panel.tsx   → export function RsvpPanel(props: SlotProps)
// event   implements  src/components/event/comments.tsx        → export function Comments(props: SlotProps)
// event   implements  src/components/event/ratings.tsx         → export function Ratings(props: SlotProps)
```

Until an implementation exists, `sessions` imports a placeholder from
`src/components/sessions/slots/` that renders nothing. Server components; each slot fetches its
own data through its owner's DAL; the page passes ids, never rows.

### SQL

Schema for all of M2 exists (`0010`). Teammates add RPCs, triggers and Realtime policies under
`supabase/proposed/<name>/`, proven with `applyProposed()`; the lead promotes at sync points. A
proposed file must apply cleanly on top of the current migrations and carry, in its header, the
`REQ-*` it serves and the `03` §8.2 rows it needs.

### Messages

One namespace file per teammate under `src/messages/ar/` (source) and `src/messages/en/`; the
namespace name added to `src/messages/index.ts` (the one shared line; add, never reorder).

---

## 3. The sync-point protocol (lead)

Every few hours, or when a teammate says "ready for sync":

1. `git status` — every changed path belongs to its owner's globs; anything else is a question.
2. Promote proposed SQL: number, move, `supabase db reset`, `npm run test:rls`, `npm run policy-diff`,
   add the `03` rows, commit.
3. `npm run build` → `npm run qa` → `npm run visual compare m0-final <wave>` → `npm run test:e2e:local`
   → `npm run test:e2e:unconfigured` (all through the gate lock).
4. Commit the shared paths; push `wave-N/…`; watch CI.
5. Update `STATUS.md`. At wave end, open the PR to `main`; the owner merges.

**Learned in wave 1 (DEC-045):**

- **Commit with an explicit pathspec** — `git commit -F msg -- <paths>` — never a bare `git commit`.
  The index is shared: three wave-1 commits carried another teammate's staged files. Teammates
  stage by explicit filename and commit immediately.
- **The RLS suite is single-runner.** Two `npm run test:rls` processes against one database collide
  on fixtures and deadlock. `pgrep -fl "node_modules/.bin/vitest"` before running it.
- **`npm run build` is the only gate that catches** a non-function export from a `"use server"`
  module and a message namespace named in `index.ts` whose JSON is uncommitted. tsc passes both.
  A teammate says "committed" only after `grep -n '^export'` on its action modules shows async
  functions and types alone, and the namespace's `ar/` and `en/` JSON are in the same commit.
- **The event-page slots render no heading of their own.** The page owns the landmark and the
  `<h2>`; a slot that repeats it is announced twice by a screen reader.
- **Open the wave PR as a draft at the first push.** CI triggers on `pull_request`, not on
  `wave-*` branch pushes.

---

## 4. The spawn prompt for the lead

Paste this into a fresh Claude Code session in the checkout. The lead runs whatever model the
owner started it with; teammates run the models their `.claude/agents/*.md` declare (`sessions`
opus, `checkin` and `event` sonnet).

```
You are the LEAD of the كريم معرفة agent team. Read docs/plan/STATUS.md, CLAUDE.md (all of it,
especially "Agent team"), docs/plan/DECISIONS.md (DEC-030 … DEC-040), and docs/plan/TEAM.md.
Then, before spawning anyone:

1. Confirm main is green and deployed (gh run list --branch main; the five frozen routes answer;
   /ar/app is 404 by design). Confirm local Supabase is up (supabase status), run
   `supabase db reset` and `npm run test:rls` — it must be green before any teammate exists.
2. Cut the wave branch: `git checkout -b wave-1/m2` from main.
3. Present the wave-1 plan to the owner in one message — the three teammates, their globs, the
   event-page slot contract, the sync-point cadence — and WAIT for approval. Do not spawn before it.
4. Spawn exactly three in-process teammates using the agent definitions in .claude/agents/:
   `sessions`, `checkin`, `event`. Each teammate's first task is its milestone track's first story
   from 15-backlog.md, planned in docs/plan/notes/<name>.md before code.
5. Run the sync-point protocol in TEAM.md §3 every few hours. You alone: promote proposed SQL,
   run supabase db reset / start / stop, run npm run build, npm run qa, npm run visual, push,
   open the PR, edit STATUS.md and DECISIONS.md.
6. Constraints that never lift: do not merge any PR; do not push to main; never supabase db push,
   supabase link, vercel env, fly; never force-push; the frozen marketing routes and public/ stay
   byte-identical (npm run visual 0.000%); Arabic first; every commit conventional with Refs: in
   the trailer paragraph.
7. When M2's demonstrable holds locally — propose → approve → schedule → publish → RSVP →
   check in with a rotating code → comment → rate — open the PR wave-1/m2 → main, update
   STATUS.md per the handoff protocol, and stop for the owner's review.
```

---

## 5. What the lead must not forget

- `supabase start` hangs on a macOS Keychain dialog for "Supabase CLI" (STATUS.md); the owner clicks
  Always Allow.
- Another session may switch `gh` to `devyaden`; `gh auth switch --user ebnmajed` before `gh`.
- `supabase db reset` does not reload `config.toml` hooks; a hook change needs stop/start.
- A nonce in the CSP header turns the prerendered marketing pages dynamic; the frozen routes get
  the nonce-less policy (`proxy.ts`).
- The gate lock is best-effort after 20 minutes (DEC-030 gotcha 2) — a run that seems stuck is
  probably waiting on it; `ls -d /tmp/task-gate.lock`.
- React 19 calls `reset()` on a `<form action>` when the action resolves: a validation failure
  empties every uncontrolled field unless the action returns what was typed and each field reads
  its `defaultValue` from that state. tsc, lint, unit and RLS all pass on the broken version.
- A write-then-`raise` RPC rolls back its own write (DEC-043): after the first write, return an
  outcome envelope.
- `docs/plan/notes/<name>.md` is where a teammate's findings live; read all three at wave end
  before writing the DECISIONS entry.
- **Three e2e traps** (DEC-045): a user has no `members` row until their first sign-in, because
  `provision_member()` runs in the callback — seed a member by signing in, not by creating the auth
  user; Next's route announcer carries `role="alert"`, so an unscoped `getByRole("alert")` is a
  strict-mode violation on every page; the `desktop` and `phone` projects share one database, so a
  row assertion that matches only on a title sees the other worker's row — tag by org or by id.
- **Never keep a 390 px capture under `test-results/`.** Playwright empties it at the start of every
  run, and in a shared tree another teammate's run deletes your screenshots between taking them and
  looking at them. Captures go to `.qa-shots/rtl/` (gitignored, never cleared).
