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
| **3** | `designer` (M6) · `console` (M7: CRUD, moderation, exports, audit viewer — the surfaces that need only M2–M4, plus the never-built SCR-011) | M6 needs M5; the console half that needs no templates runs alongside | both demonstrables locally: every A12 variant, the detach, both QRs, the serial not-found, 28 parity assertions; a second org invisible to the first with the moderator scope proven by policy; `wave-3/m6-m7` PR green |
| **4 — done** | `platform` (M8) · `branding` (M7: brand kit, templates) | both need M6 and M7-console | M8's demonstrable and branding's (one edit, four consumers, goldens untouched); `wave-4/m8-branding` PR green; the lead's NFR-004/005 closing pass; Launch follows, owner-run |

### Ownership for wave 2 (confirmed by the owner 2026-09-14, DEC-046)

The wave-2 rows are the ones in `CLAUDE.md` § Agent team and in `.claude/agents/{notify,scoring,content}.md`;
the agent definition is authoritative for a teammate. Two carve-outs follow DEC-042's pattern —
`notify` holds `app/admin/{emails,reminders}/**` and `scoring` holds `app/admin/{scoring,recognition}/**`
for this wave; `console` inherits both at wave 3.

| Teammate | Model | Edits only |
|---|---|---|
| `notify` | opus | `src/app/[locale]/app/me/{notifications,calendar}/**`, `src/app/[locale]/app/admin/{emails,reminders}/**`, `src/app/api/{sessions/[id]/ics,webhooks,calendar}/**`, `src/lib/dal/{notifications,calendar}.ts`, `src/components/{notifications,calendar}/**`, `worker/src/{mail,calendar}/**`, `worker/src/tasks/{send_notification,schedule_reminders,send_reminder,rating_prompt,rsvp_nudge,calendar_upsert,calendar_delete,refresh_calendar_tokens}.ts`, `messages/*/{notifications,calendar}.json`, `supabase/proposed/notify/**`, its tests, `docs/plan/notes/notify.md` |
| `scoring` | sonnet | `src/app/[locale]/app/{leaderboards,me/points}/**`, `src/app/[locale]/app/admin/{scoring,recognition}/**`, `src/lib/dal/{points,leaderboards,recognition,scoring-admin}.ts`, `src/components/scoring/**`, `worker/src/tasks/{award_points,award_presenter_points,evaluate_no_shows,evaluate_streaks,evaluate_badges,evaluate_levels_perks,snapshot_leaderboards,audit_balances}.ts`, `messages/*/{scoring,leaderboards,recognition}.json`, `supabase/proposed/scoring/**`, its tests, its note |
| `content` | sonnet | `src/app/api/{upload,materials,photos}/**`, `src/lib/storage/**` (the single path builder), `src/lib/dal/{materials,photos,tasks,search,bookmarks}.ts`, `src/app/[locale]/app/sessions/[id]/materials/**`, `src/app/[locale]/app/me/bookmarks/**`, `src/components/{materials,photos,viewer,tasks,search}/**`, `worker/src/content/**`, `worker/src/tasks/{convert_document,render_pages,process_photo,rebuild_search}.ts`, `messages/*/{materials,photos,tasks,search}.json`, `supabase/proposed/content/**`, its tests, its note |

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

### Ownership for wave 3 (confirmed by the owner 2026-09-14, DEC-048) and wave 4 (draft)

The wave-3 rows are the ones in `CLAUDE.md` § Agent team and in `.claude/agents/{designer,console}.md`;
the agent definition is authoritative for a teammate. `console` inherits the seven admin screens
wave 1 and wave 2 carved out (`proposals`, `sessions`, `venues` — DEC-042; `scoring`, `recognition`,
`emails`, `reminders` — DEC-046). Three admin folders are `designer`'s inside `console`'s tree, and
`branding` waits for wave 4.

| Teammate | Model | Edits only |
|---|---|---|
| `designer` | opus | `packages/designer-runtime/**`, `packages/storage-paths/src/designer.ts`, `src/app/[locale]/app/admin/{designer,templates}/**`, `src/app/[locale]/app/admin/sessions/[id]/certificates/**`, `src/app/[locale]/app/me/certificates/**`, `src/app/[locale]/verify/**`, `src/app/api/{designer,fonts,certificates}/**`, `src/lib/dal/{designer,templates,posters,certificates,fonts}.ts`, `src/components/{designer,posters,certificates}/**`, `worker/src/render/**`, `worker/src/tasks/{render_variant,regenerate_poster,issue_certificates,materialise_font}.ts`, `scripts/parity/**` except `goldens/**`, `messages/*/{designer,templates,certificates}.json`, `supabase/proposed/designer/**`, its tests, `docs/plan/notes/designer.md` |
| `console` | sonnet | `src/app/[locale]/app/admin/**` except `designer/**`, `templates/**`, `sessions/[id]/certificates/**`, `branding/**` (so the new `admin/layout.tsx` and `admin/page.tsx` are its), `src/app/[locale]/app/sessions/page.tsx` (SCR-011 only), `src/app/api/admin/**`, `src/lib/dal/admin*.ts`, `src/lib/dal/scoring-admin.ts`, add-only admin functions in `src/lib/dal/{sessions,proposals,notifications,recognition,checkin}.ts`, `src/components/{admin,browse}/**`, `messages/*/{admin,browse}.json`, `supabase/proposed/console/**`, its tests, `docs/plan/notes/console.md` |

**Wave-3 contracts (DEC-048):**

- **The engine is settled.** DOM/SVG in the editor, headless Chromium in the worker image, Tier A
  parity on every render — as the harness proves (D66, A28, DEC-024, DEC-028). No raster canvas,
  no HarfBuzz fallback, no render route in the Next app.
- **`designer` publishes three slots as no-op placeholders on day one:** `<SessionPoster sessionId locale />`
  (`@/components/posters/session-poster` — the event page's item 1, wired by the lead; the browse
  cards, imported by `console`), `<PosterPicker sessionId locale />` (`@/components/posters/picker` —
  the three poster paths on SCR-043, DEC-012; `console` holds the screen, the lead wires the slot),
  `<CertificateModeBadge sessionId locale />` (`@/components/certificates/mode-badge`). Same rules
  as §2: server components, ids never rows, own data through the owner's DAL, no heading of their own.
- **`console` publishes the admin shell:** `src/app/[locale]/app/admin/layout.tsx` — the staff gate
  and sub-nav listing every admin route including `designer`'s. Its route list goes in
  `docs/plan/notes/console.md` on day one and never changes without the lead hearing.
- **Hooks into M2–M5 are SQL only**, as in wave 2: a trigger on `sessions` (publish → posters,
  complete → certificate fan-out, a change → `regenerate_poster`), or a `create or replace` of an
  earlier RPC in the proposed folder, promoted by the lead. Certificate mail is `public.notify()`
  (`MSG-certificate_issued`); no track writes `notifications`.
- **Goldens change only through a lead-reviewed diff** (`REQ-DSG-015`): `designer` runs `--update`,
  the lead looks at the before and after and commits `scripts/parity/goldens/**`.
- **`worker/src/index.ts` and `worker/Dockerfile` stay the lead's.** `designer` hands over the four
  task registrations and the `render` queue's concurrency of 2 (`11` §1.4); the image already carries
  Chromium at `CHROME_PATH`, the runtime and the font set, and CI runs the parity harness inside it.
- **The brand kit is a token contract this wave, a screen next wave.** `designer` resolves
  `{{brand.*}}` from the platform defaults (`06` §8.3); wave 4's `branding` supplies the org override
  through `src/lib/brand/**`, which does not exist yet.
- **SCR-011 is `console`'s first story.** The page reads the URL params `src/lib/dal/search.ts`
  already defines, calls `searchSessions()`, and renders `content`'s `<SearchFilters>` and
  `<BookmarkButton>` unchanged.

### Ownership for wave 4 (confirmed by the owner 2026-09-14, DEC-052)

The agent definitions `.claude/agents/{platform,branding}.md` are authoritative for a teammate.
`platform` takes M8 minus the two cross-cutting closing stories; `branding` takes the half of M7
DEC-048 deferred. Neither has a screen today: `src/app/[locale]/app/platform/`, `src/lib/brand/`
and `app/admin/branding/` do not exist.

| Teammate | Model | Edits only |
|---|---|---|
| `platform` | opus | `src/app/[locale]/app/platform/**` (SCR-080 … 085), `src/app/[locale]/legal/**` (SCR-005, public), `src/app/[locale]/app/me/privacy/**` (the self export and the deactivation request, `REQ-PRF-006/007`), `src/app/api/platform/**`, `src/app/api/me/export/**`, `src/lib/dal/platform*.ts`, `src/lib/dal/privacy.ts`, `src/components/{platform,legal,privacy}/**`, `worker/src/platform/**`, `worker/src/tasks/{enforce_retention,anonymise_members,assert_storage_prefixes,expire_impersonation,build_data_export,delete_org}.ts`, add-only platform-library functions in `src/lib/dal/templates.ts` (SCR-083, `REQ-DSG-008`), `messages/*/{platform,legal,privacy}.json`, `supabase/proposed/platform/**`, `tests/rls/{platform,impersonation,retention,privacy,delete-org}*.test.ts`, `tests/unit/{platform,legal,privacy}*`, `tests/e2e/{platform,legal,privacy}*.spec.ts`, `docs/plan/notes/platform.md` |
| `branding` | sonnet | `src/app/[locale]/app/admin/branding/**` (SCR-059), `src/app/api/admin/branding/**` (the logo upload — a Route Handler, sniffed, raster only, DEC-009), `src/lib/brand/**`, `src/components/branding/**`, `packages/storage-paths/src/brand.ts` (new), **add-only** `resolveBrand()` in `packages/designer-runtime/src/brand.ts`, `messages/*/branding.json`, `supabase/proposed/branding/**`, `tests/rls/brand*.test.ts`, `tests/unit/brand*`, `tests/e2e/branding*.spec.ts`, `tests/components/branding/**`, `docs/plan/notes/branding.md` |

**Wave-4 contracts (DEC-052):**

- **The super admin has no data plane** (DEC-014, invariant 8, `REQ-ADM-002`). `platform`'s DAL
  selects from `orgs`, `org_domains`, `platform_admins` (through a `security definer`
  `assert_platform_admin()` that re-reads the row — never a claim alone) and the aggregate metrics
  views it proposes; it never selects from an org's tables. Reaching into an org is an
  impersonation session (`ENT-impersonation_sessions`, `02` §4.1, ≤ 4 h by constraint) that mints
  an ordinary member's claims and lands in **that org's own audit log** the moment it starts. The
  metrics are aggregate only (`REQ-ADM-003`): no member, title or content in any query.
- **`platform` publishes `<ImpersonationBanner locale />`** from `@/components/platform/impersonation-banner`
  as a no-op placeholder on day one; the lead wires it into `src/app/[locale]/app/layout.tsx`
  above every screen («أنت تتصفح كـ …» with a stop control, SCR-085). Same slot rules as §2:
  server component, own data through its DAL, no heading of its own.
- **`platform`'s first proposed file** is the M8 schema: `impersonation_sessions` per `02` §4.1 with
  RLS (`P2` read for the org's admins — the point of the table; insert through the RPC alone; no
  update, no delete: append-only like `audit_log`), `assert_platform_admin()`, `start_impersonation()`
  / `end_impersonation()`, `create_org()` / `suspend_org()` / `set_first_admin()` (each writing
  `platform.*` audit rows), and the `03` §8.2 rows. The lead promotes it at sync 1 so the isolation
  sweep covers the table within hours.
- **The six M8 jobs** enqueue only through `public.enqueue_job()` with `11`'s keys verbatim
  (`retain:{date}`, `anon:{date}`, `storageck:{date}`, `impexp:{session_id}`,
  `export:{member_id}:{requested_at}`); the `delete_org` job is new — `11` does not list it and the lead
  amends `11` §4 under the DEC that confirms this wave. Retention periods are `12` §5.3's, in a
  table the job reads, never constants in the task. `assert_storage_prefixes` walks every bucket
  through the service-role client — `fonts` is the one un-prefixed bucket (`06` §6.4, DEC-049) and
  the assertion says so rather than skipping it.
- **The platform template library (SCR-083, `REQ-DSG-008`) is managed, not authored, on
  `/app/platform/templates`**: list, publish, retire, and promote an org's published template
  version into the platform library through `promote_template_to_platform()` (a copy — later org
  edits do not reach it). Authoring stays in an org's editor (`designer`'s SCR-057), because a super
  admin has no org and the editor is org-scoped. The default in force unless the owner says
  otherwise.
- **The A27 baseline is seeded, platform-owned, and present for every org from creation** (DEC-052):
  the five poster families and three certificate families of `0061`, light and dark by the brand
  scheme, RTL-first, readable by every org and writable by none — `create_org()` seeds nothing
  because platform scope is org-independent. Promotion adds to the library; it never supplies the
  baseline. `platform` proves it: SCR-083 lists the eight as the baseline (never retirable below
  one default per purpose), an RLS case creates an org and reads all eight, an e2e renders a poster
  and a certificate family for a freshly created org in both schemes before it publishes anything.
- **`branding` publishes `getBrandKit(orgId)`** from `src/lib/brand/kit.ts` on day one — the full
  token set of `06` §8.3 (`BRAND_COLOUR_TOKENS` light and dark, `logoAssetId`, the face) with the
  platform defaults filled in wherever the org has no override — and `public.brand_kit(p_org uuid)
  returns jsonb` (`security invoker`, `P1` read) for the SQL consumers. **The platform default is
  the identity override**: with no `brand_kits` row every consumer renders exactly what it renders
  today, which is why the parity goldens do not move this wave.
- **`branding`'s first proposed file** is `brand_kits` — one row per org, `logo_asset_id`
  referencing `design_assets` (raster, sniffed), nine light and nine dark colour tokens, the
  heading and body faces referencing `fonts` at `parity_status = 'passed'`, `updated_by`; every
  change writes `scoring_config_history` (`02` §4.1 made it general enough on purpose). `02` is
  frozen; `ENT-brand_kits` is written into §4.13 under DEC-052 — the promotion at sync 1 must
  match it.
- **The four consumers, and who wires each** (`06` §8.3): the CSS `@theme` layer — the lead reads
  `getBrandKit()` in `src/app/[locale]/app/layout.tsx` and emits the org's tokens as CSS custom
  properties over `globals.css`'s defaults (DEC-003's theme layers); the designer templates —
  `branding` proposes a `create or replace` of `export_render_context()` (`0060`) that adds a `brand`
  object, and `resolveBrand(overrides)` in the runtime; the lead wires the one call in
  `worker/src/render/**`; the email templates — the lead wires the one call in `worker/src/mail/**`
  against `public.brand_kit()`. The editor's preview reads `getBrandKit()` through `designer`'s DAL
  — an add-only function, the lead promotes it.
- **Hooks into earlier waves are SQL only**, as in waves 2 and 3. `worker/src/index.ts`, the image,
  the shell, the locale layout, Sentry (`REQ-NFR-016`) and the six task registrations are the lead's.
- **STORY-NFR-004 and STORY-NFR-005 are the lead's closing pass** after both tracks land: the WCAG
  2.2 AA audit, the performance budgets and the scale check touch every folder in the tree, so no
  teammate owns them. The real-device pass (`13` §8) and the two QR/ICS checks are the owner's.

**The wave's gate:** M8's demonstrable (`14`) — a super admin creates an org, sets its first admin,
and **cannot read a single row of its data**; a break-glass session appears in the org's own audit
log and expires on its own; every `11` §3.2 alert fires in a drill — and branding's: change one
colour and the logo on SCR-059 and see the UI theme, a poster re-render and an email preview all
change, with the goldens untouched. Then the `wave-4/m8-branding` PR is green and the owner merges.

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

**Learned in wave 2 (DEC-047):**

- **The runner check is `pgrep -fl "node_modules/.bin/vitest"`.** The old `ps aux | grep` matched
  another agent's waiting shell, and two waiters could block each other for good. A reset is not
  visible to `pgrep`: `npm run db:reset` holds `/tmp/db-reset.lock` and `scripts/rls.mjs` waits on it.
- **Never save a failing test under `tests/rls/`** — everyone's `npm run test:rls` runs it; `describe.skip`
  until green. A test may guard `applyProposed()` with `existsSync` so a promotion mid-session does
  not turn it red (notify's pattern).
- **The promotion commit `git rm`s the proposed path.** A teammate's committed proposed file stays
  tracked after `mv`; CI then applied `0039` twice through an `existsSync` guard. Commit with an
  explicit array of paths, never a `&&` chain that a failed edit can empty.
- **A namespace's JSON and its `index.ts` line go in one commit** — CI's build failed twice on
  `Cannot find module './ar/materials.json'`.
- **Every promotion that adds tables adds fixture rows** (`tests/rls/fixture-m<N>.ts`, the lead's): the
  isolation sweep is non-vacuous, and the teammate's per-policy cases then count by id or clear the
  table in their own `setup()` inside the rolled-back transaction.
- **Messages between agents arrive late and out of order.** Restate a fact with a command that proves
  it (`stat -f %Sm .next/BUILD_ID`, `git merge-base --is-ancestor`), not with a memory of a message.
- **A Sonnet teammate idles at "checkpoints".** Its task ends at its last story; the lead re-drives it
  with that sentence and the next concrete unit.

---

**Learned in wave 3 (DEC-050):**

- **The 390 px review is phone-project only.** A desktop context at 390 px carries a classic 12 px
  scrollbar that mobile emulation does not, so every page that scrolls vertically measures 402
  wide there; wave 1 and 2 never saw it because their admin pages were short. The helper asks first
  whether `scrollWidth > innerWidth + 1`, then names the offender, skipping anything inside an
  `overflow-x: auto|scroll` container (a table) or a `position: fixed` overlay (a sheet) — a probe
  against a passing notify page is what settled it, not reasoning.
- **The runner guard must not match its own shell.** `pgrep -f "node_modules/.bin/vitest"` matches
  the waiting loop's command line, so every gate waited its full timeout on itself; and
  `playwright/test` never matched the real process (`playwright test`), so resets went through
  during teammates' e2e runs — 502s from Kong, "connection terminated", a page-image pipeline
  that could not be told from environment noise. Bracket the first letter: `[n]ode_modules/.bin/vitest`,
  `[p]laywright`.
- **A trigger that enqueues or notifies is `security definer`.** It fires on any writer's row —
  a presenter's own title edit or decline — and `enqueue_job()` is definer-only (0025). Test the
  hook as a member, not as the owner: three wave-1 cases caught what the owner-only tests could not.
- **A `unicode-range` on one subset of a two-file family sends Arabic to a system font**, and
  `document.fonts.check()` says true throughout because it reports whether SOME face in the family
  covers the character. A font assertion that is not a comparison between two measured strings
  is not an assertion; the harness's own layout was insensitive to it (Tier B 0.000% both ways).
- **Playwright role names match substrings**: `getByRole("button", { name: "تم" })` resolves to
  every day cell of a September calendar («سبتمبر» contains «تم»). Use `exact: true` for short
  Arabic labels, and scope to the open `dialog`.
- **Mobile emulation keeps the focused field in view.** On a long page the click on a button
  below a focused textarea never becomes actionable: Playwright scrolls the button up, Chromium
  scrolls the field back. Blur, assert enabled, dispatch the tap; assert on the outcome.
- **An unscoped emptiness assertion on an append-only table fails for everyone after the first
  e2e run.** `audit_log` rows survive their member's cleanup; scope by `occurred_at >= now()` (the
  transaction's start) or by org — never count the table.
- **A teammate's promotion file may reference a column the DTO lacks.** CI's build is the only
  gate that sees a committed component reading a property only an uncommitted DAL adds; a
  teammate commits the DAL and the component together, always.
- **`npm run test:e2e:unconfigured` replaces `.next` with the UNCONFIGURED build**, which answers
  404 on every platform route by design (DEC-038). Run it last, and `npm run build` again before
  any `test:e2e:local`: a suite that suddenly fails 68 of 101 cases with «الصفحة غير موجودة» on
  every signed-in page, with Kong and auth healthy and no server error, is serving that build.
- **The M5 pipeline had never run for real before wave 3.** A converter and a worker container on
  the local Supabase network, two real decks, one hour: nothing was wrong, and now that is known
  rather than hoped. Run every image-backed pipeline once against local Supabase before the wave
  that builds on it.

**Learned in wave 4 (DEC-055):**

- **A reset leaves Kong pointing at the old Auth container.** Every `/auth/v1` call answers 502 and
  an e2e dies in `beforeAll` on `createUser()` with "invalid response from the upstream server"
  while the RLS suite (direct Postgres) stays green. `npm run db:reset` now probes
  `/auth/v1/health` through Kong afterwards and restarts Kong once on a 502; a teammate that sees the
  502 tells the lead rather than restarting anything.
- **The brand override is composed at request time, before the fingerprint** — never at render time.
  The worker renders pinned bindings (`0060`); a value merged at render time is a value the cache key
  never saw.
- **A lead's fixture row fires a teammate's history trigger.** Per-policy cases that count from zero
  clear their own tables — and their history — in `setup()`; the sweep's non-vacuity rows are the
  lead's.
- **`(f()).*` calls a composite-returning plpgsql function once per column**; an RLS case against a
  composite RPC uses `select * from f()`.
- **A budget the framework's own baseline cannot meet is a plan number, not a gate.** Measure first;
  enforce no-regression against a committed baseline; send the absolute numbers back to the plan.
- **A screen is "complete and unverified in the browser" until a real session walks it on a real
  build.** The shell can redirect before any page code runs (the bell's `requireSession()` sent every
  super admin to `/no-access` — DEC-057), thirty-five RLS cases cannot see it, and `page.goto()`
  reports the final response after a redirect: assert `page.url()`, not the status.
- **A job whose subject is gone returns; it does not retry twenty-five times.** `render_variant`'s
  warn-and-return is the pattern for every task whose row can be deleted underneath it.
- **The serial render queue moves at the poll interval, not at job speed.** Measure a publish end to
  end before touching concurrency (DEC-057: 60 s → bursts of three a minute; 15 s → under a minute).

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
   supabase link, vercel env, fly; never force-push; never change repository visibility, billing,
   organisation or GitHub settings, or the remotes — stop and ask the owner (DEC-051); the frozen
   marketing routes and public/ stay byte-identical (npm run visual 0.000%); Arabic first; every
   commit conventional with Refs: in the trailer paragraph.
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
- **The 390 px capture measures overflow against the layout viewport.** In an RTL document the
  vertical scrollbar sits on the left, so `scrollWidth > clientWidth` is true by the scrollbar's width
  on every page that scrolls; the helper in `tests/e2e/notify-screens.spec.ts` has the reasoning.
- **Look at the capture for two things tests cannot see:** two numeral systems on one screen, and a
  fixed `h-*` on a cell whose Arabic label can wrap (`min-h-*`). `tests/unit/<track>-i18n.test.ts`
  forbids literal digits in the Arabic catalogue and checks `<bdi>` on every text placeholder; a
  message containing a tag must be called through `t.rich`, or plain `t()` prints the key.
- **An orphaned `next start` from an earlier session** (`ppid 1`, no gate lock) can hold port 3000;
  `pgrep -fl next-server`, and never `pgrep -f "next start"` from a shell whose own command line
  contains it.
- **Only the lead resets, and only when nothing else runs** — a reset mid-e2e cuts a teammate's run
  silently; check `pgrep -fl "vitest|playwright"` before `npm run db:reset`, not only the RLS runner.
- **A mocked client never catches a policy gap between two real HTTP calls.** Every material upload's
  complete step 403'd from STORY-MAT-001 until the first e2e drove the real form against real
  Storage (migration `0054`): unit tests mocked the DAL, RLS tests never ran the download-before-
  finalize sequence together. Each track's e2e must exercise its real Route Handlers at least once.
- **The shell is in every capture.** A no-wrap label in `app/layout.tsx` overflowed every `/app`
  page by 23 px at 390 px and only a teammate's capture helper saw it; a shell change is a
  390 px review of any page.
