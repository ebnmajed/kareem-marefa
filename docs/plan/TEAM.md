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
| **1** | `sessions` · `checkin` · `event` | Disjoint tables, DAL modules, screens, jobs; the one shared surface, the event page, is `sessions`' with three slots the others fill from their own folders | M2 demonstrable in a real room; `wave-1/m2` PR green |
| **2** | `notify` (M3) · `scoring` (M4) · `content` (M5) | Each depends only on M2 | each milestone's demonstrable, locally |
| **3** | `designer` (M6) · `console` (M7: CRUD, moderation, exports, audit viewer — the surfaces that need only M2–M4) | M6 needs M5; the console half that needs no templates runs alongside | |
| **4** | `platform` (M8) · `branding` (M7: brand kit, templates) | both need M6 and M7-console | Launch follows, owner-run |

### Ownership for waves 2–4 (drafts — the lead confirms at each wave's start)

| Teammate | Edits only |
|---|---|
| `notify` | `worker/src/tasks/{notify_*,remind_*,calendar_*}.ts`, `src/lib/dal/notifications.ts`, `src/app/[locale]/app/me/{notifications,calendar}/**`, `src/app/api/{sessions/[id]/ics,webhooks}/**`, `src/components/notifications/**`, `messages/*/notifications.json`, `supabase/proposed/notify/**` |
| `scoring` | `worker/src/tasks/{award_points,audit_balances,snapshot_*}.ts`, `src/lib/dal/{points,recognition,leaderboards}.ts`, `src/app/[locale]/app/{leaderboards,me/points}/**`, `src/components/scoring/**`, `messages/*/scoring.json`, `supabase/proposed/scoring/**` |
| `content` | `src/app/api/upload/**`, `src/lib/storage/**` (the single path builder), `src/lib/dal/{materials,photos,tasks,search}.ts`, `src/app/[locale]/app/sessions/[id]/materials/**`, `src/components/{materials,photos,viewer}/**`, `worker/src/tasks/{convert_document,render_pages,process_photo}.ts`, `messages/*/materials.json`, `supabase/proposed/content/**` |
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
