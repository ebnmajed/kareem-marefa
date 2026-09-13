# DECISIONS — append-only decision log

**Status:** `settled` · **Owner:** whoever holds the session · **Last updated:** 2026-09-13

This file is the mechanism that stops a later session from silently undoing a considered
decision. Every decision taken **after** the source brief gets an entry here.

## Rules

1. **Append only.** Entries are never edited or deleted. A reversal is a **new entry** that
   names the entry it supersedes; the old entry stays, marked superseded by the new one.
2. **A `settled` or `frozen` document may only change via an entry here.** If you are about to
   change one, write the entry first, then make the change, then list the document in
   *Documents changed*.
3. Every entry carries: ID, date, decision, rationale, what it supersedes, documents changed.
4. Decision IDs are `DEC-NNN`, allocated in order, never reused.
5. `D*` IDs belong to the source brief (`_source-brief.md` §4) and are **final** — an entry here
   may *narrow*, *extend* or *interpret* a `D*`, never contradict one. `A*` IDs are provisional
   defaults (§5) and may be superseded; `ASSUMPTIONS.md` records the status of each.

---

## DEC-001 — The platform is built into this repository

- **Date:** 2026-09-13 · **Decided by:** owner
- **Decision:** The platform is built into this repository, alongside the live pre-launch site.
  The landing page stays as the unauthenticated marketing shell; sign-in leads into the platform.
- **Rationale:** The brief assumed an empty repository. It is not: this repo is the pre-launch
  site *for this exact product*, live on Vercel with a live Supabase project. A second repo would
  split the brand, the domain, the Supabase project and the deployment for no gain.
- **Supersedes:** the literal reading of **D65** ("start fresh — no conventions inherited from
  any existing codebase"). D65 is reinterpreted as **"no legacy constrains the architecture"** —
  the existing 33 files are a marketing page, not an application architecture.
- **Consequences:** `main` stays deployable at all times. `/`, `/ar`, `/en`, `/ar/register`,
  `/og.png` are a frozen public contract. Every migration is forward-only and safe against real
  rows.
- **Documents changed:** `00-overview.md`, `04-architecture.md`, `14-roadmap.md`, `CLAUDE.md`

## DEC-002 — `registrations` is kept as a frozen historical record; the platform starts clean

- **Date:** 2026-09-13 · **Decided by:** owner
- **Decision:** The live `registrations` table is kept exactly as it is, as the historical record
  of pre-launch interest. No import job. Platform tables start empty. The table is **frozen
  legacy**: never dropped, never altered, never read by platform code.
- **Rationale:** The rows are real signups including provider topic proposals — evidence worth
  keeping. But they are interest registrations, not accounts: they have no Google identity, no
  org membership, and no verified email. Importing them would manufacture members who never
  signed in.
- **Supersedes:** nothing. It **qualifies A26** ("no data migration — greenfield, nothing to
  import"): the premise was wrong (there *is* data) but the conclusion holds (we choose not to
  import it).
- **Documents changed:** `02-domain-model.md`, `12-security-privacy.md`, `14-roadmap.md`

## DEC-003 — The existing كريم معرفة brand becomes the platform default theme

- **Date:** 2026-09-13 · **Decided by:** owner
- **Decision:** The shipped brand — Deep Navy `#0B1220`, the silver ramp, IBM Plex Sans Arabic,
  the Knowledge Network motif, the forbidden-imagery policy — becomes the **platform default
  theme**. Per-org brand kits layer on top of it as overrides.
- **Rationale:** A25 assumed no brand existed. One does, it is client-approved, and it shipped.
  Neutral tokens would mean throwing away a finished design system to rebuild a weaker one.
- **Supersedes:** **A25** ("no brand yet; neutral platform design tokens"). Status in
  `ASSUMPTIONS.md`: *proposed alternative*.
- **Consequences:** the token layer must distinguish **platform defaults** from **org
  overrides**, because A25's requirement that each org sets its own logo and colours still holds.
- **Documents changed:** `06-visual-designer.md`, `10-i18n-rtl.md`, `CLAUDE.md`

## DEC-004 — One org at launch; fully multi-tenant schema and RLS from day one

- **Date:** 2026-09-13 · **Decided by:** owner
- **Decision:** The platform launches with a single org. The schema, the RLS policies and the
  storage layout are **fully multi-tenant from the first migration**. The super-admin console
  ships minimal and grows later.
- **Rationale:** Retrofitting a tenancy key onto a live database with real rows is the single
  most expensive migration a product can take. Adding an `org_id` column costs nothing now.
  Console UI, by contrast, is cheap to add later and has exactly one user.
- **Supersedes:** nothing. It is the launch reading of **D1–D4**.
- **Consequences:** multi-tenancy is proved in M7 by standing up a **second org**, not by
  reading policies. Until that happens, isolation is untested in production conditions.
- **Documents changed:** `02-domain-model.md`, `03-permissions-rls.md`, `14-roadmap.md`

## DEC-005 — Session photos publish immediately, with three named safeguards

- **Date:** 2026-09-13 · **Decided by:** owner
- **Decision:** D34 stands — photos appear immediately, admins can remove them — **plus**:
  1. **EXIF/GPS stripping** on every uploaded image, server-side, before the file is stored.
  2. A one-click **"remove photos of me"** takedown that hides the photo instantly, pending
     review, without waiting for a moderator.
  3. An **upload-time notice** stating that photos are shared org-wide.
- **Rationale:** immediate publication is the right default for an internal event page, but a
  photo of a colleague is personal data and the uploader is not the only person with an interest
  in it. Prior review would kill the post-session moment; these three safeguards keep the
  immediacy and give the subject a real remedy.
- **Supersedes:** nothing. It **extends D33/D34**.
- **Documents changed:** `01-prd.md`, `07-content-pipeline.md`, `12-security-privacy.md`

## DEC-006 — Keynote is accepted as download-only

- **Date:** 2026-09-13 · **Decided by:** owner
- **Decision:** `.key` files are accepted, stored and downloadable. They get **no page images and
  no in-browser viewer**. At upload the presenter sees guidance to export to PDF for the viewer
  experience. PDF and PowerPoint are unaffected.
- **Rationale:** LibreOffice's Keynote import is lossy and unpredictable, and D66 forbids an
  export path that cannot guarantee Arabic shaping. A silently mangled Arabic slide deck is worse
  than an honest download link.
- **Supersedes:** the viewer half of **D27** for `.key` only. D26 (accept the format) stands
  unchanged; **A16** is narrowed accordingly.
- **Documents changed:** `01-prd.md`, `07-content-pipeline.md`, `11-background-jobs.md`

## DEC-007 — App UI follows A30; the certificate builder loads fonts via the Google Fonts API

- **Date:** 2026-09-13 · **Decided by:** owner
- **Decision:** The **application UI** follows A30's typography system in full. The **certificate
  builder** offers a font picker backed by the **Google Fonts developer API**, and the chosen
  font is **materialised** before it can be used:
  1. The picker is filtered to `subset=arabic`, so a font with no Arabic coverage cannot be
     chosen.
  2. Choosing a font downloads the actual binary **once**, stores it in Supabase Storage with a
     SHA-256, and registers it in the font manifest.
  3. **Both** the editor and the worker load that stored binary. The editor self-hosts it rather
     than hot-linking Google's CDN, whose dynamically subset slices are not byte-stable.
  4. Each newly added font runs the **shaping-parity goldens** before it becomes selectable.
  5. Templates pin the exact **font hash**, so reissuing an old certificate is byte-reproducible.
- **Rationale:** the owner wants font choice; D66 requires identical font files in the editor,
  the worker's Chromium and the LibreOffice converter; the worker has a deliberate no-network
  policy. Materialisation satisfies all three — the font is chosen freely, then frozen.
- **Supersedes:** **A30** for the certificate builder only. Status in `ASSUMPTIONS.md`:
  *superseded by owner*. A30 governs the app UI unchanged.
- **Documents changed:** `06-visual-designer.md`, `10-i18n-rtl.md`, `11-background-jobs.md`

## DEC-008 — All brand colours and fonts are centralised

- **Date:** 2026-09-13 · **Decided by:** owner
- **Decision:** One source of truth for brand colours and fonts, feeding **all** of: the CSS
  `@theme` / `@theme inline` layers, the per-org brand kit in the database, the designer's brand
  kit, and the email templates. Changing a brand colour or a face is **one edit in one place**.
- **Rationale:** an explicit owner requirement, stated as "so they can be changed later". A brand
  value duplicated across a stylesheet, an email template and a poster template is a brand value
  that will be wrong in two of the three places within a year.
- **Supersedes:** nothing. Recorded as **A40**.
- **Documents changed:** `06-visual-designer.md`, `10-i18n-rtl.md`, `CLAUDE.md`

## DEC-009 — Image layers accept PNG, JPG and WebP; SVG upload is not supported

- **Date:** 2026-09-13 · **Decided by:** owner
- **Decision:** Image layers in **both** the poster and certificate builders accept **PNG, JPG
  and WebP**. **SVG upload is rejected.** Uploads are validated server-side by **content
  sniffing, not file extension**, against the A16 limits.
- **Rationale:** an SVG is an XML document that can carry `<script>`, event handlers and external
  `<image href>` / `<use href>` references, and it would be rendered inside a privileged headless
  Chromium. Dropping the format removes the vector entirely — no sanitiser to maintain and no
  bypass to worry about.
- **Consequences, stated honestly:** org logos are now raster, so an org must supply a
  **high-resolution PNG** or the PPI guard blocks it on A3 print presets. Image layers warn below
  300 PPI at their print frame and **block below 200**. Unaffected: the **QR layer is still
  emitted as inline SVG by our own runtime**, so it stays vector at any print size — that is
  generated code, never an uploaded file.
- **Supersedes:** nothing. It **constrains A28/A31**.
- **Documents changed:** `06-visual-designer.md`, `07-content-pipeline.md`, `12-security-privacy.md`

## DEC-010 — A certificate's serial and its verification code are two different identifiers

- **Date:** 2026-09-13 · **Decided by:** owner
- **Decision:** Every certificate carries **both**:

  | | Serial | Verification code |
  |---|---|---|
  | Form | `KM-2026-000123` — org prefix, year, zero-padded sequence | 22+ character random, unguessable |
  | Purpose | Human reference, support, records | The QR target and the lookup key |
  | Printed | Yes | Yes, as text beside the QR (A29) |
  | Enumerable | Yes, by design | No |

  `/verify` accepts **only the verification code**. The serial is a reference number, never a
  credential. The serial is **per-org** and **gapless** — allocated from a counter row locked
  inside the issuing transaction, not from a Postgres `SEQUENCE`, which leaves holes on rollback.
- **Rationale:** the verification page is public and displays a real person's name (A13). A
  sequential identifier in the URL would let anyone walk `/verify/KM-2026-000001`, `000002`, …
  and harvest the name of every person the org ever certified plus which sessions they attended.
  In a certificate register, meanwhile, a gap reads as a lost or hidden certificate — so the
  human-facing number must be gapless. Two requirements, two identifiers.
- **Supersedes:** nothing. It **implements D51 and A13**.
- **Documents changed:** `02-domain-model.md`, `06-visual-designer.md`, `12-security-privacy.md`

## DEC-011 — Member profiles have two visibility tiers

- **Date:** 2026-09-13 · **Decided by:** owner (recorded in the brief's numbering as **D69**)
- **Decision:** Profile pages render at two tiers: a full **admin** view and a narrower
  **member-facing** view. Hard constraints:
  - The member-facing tier **never exposes ratings given** — D36 makes ratings anonymous to
    presenters, and a presenter is an ordinary member on someone else's session page.
  - **No-show and late-cancellation history is admin-only.** Self sees their own record.
  - **Sessions attended is not member-visible**; sessions **presented** is.
  - **Calendar OAuth tokens are hidden from org admins too** — the one row where admin access is
    narrower than member self-access, deliberately.
  - **No photo tagging at launch.** "Photos" on a profile means photos that member *uploaded*.
- **Rationale:** attendance reveals who was in a room with whom, and by inference interests and
  affiliations. No-show history is negative, HR-adjacent data whose publication would add
  informal social punishment on top of the points system's designed consequence, and would fall
  hardest on people with unpredictable schedules. A talk, by contrast, is a stage.
- **Supersedes:** nothing. **D69** is an owner addition to the brief's decision list; it does not
  appear in `_source-brief.md`, which is preserved verbatim as delivered.
- **Documents changed:** `01-prd.md`, `03-permissions-rls.md`, `09-sitemap-screens.md`

## DEC-012 — Auto-generated posters are a first-class third path, and stay live until customised

- **Date:** 2026-09-13 · **Decided by:** architect, approved with the plan
- **Decision:** D53 names two poster paths (design in-app, upload a finished poster). A third is
  made first-class and is the **default**:
  1. **Auto-generate.** On publish, the org's default poster template for the session type binds
     the session's real data and renders **every A12 variant** with no design work.
  2. **Customise.** The admin opens the generated poster in the designer.
  3. **Upload.** A finished poster is uploaded; variants derive by smart-cropping (A32).
  An auto-generated poster stays **live** — a change to title, date, venue or presenter
  regenerates it, because it is a pure function of template plus data. The moment an admin
  customises it, it becomes **detached**, and a later data change raises a *"session details
  changed — review poster"* prompt instead of overwriting their edits.
- **Rationale:** most sessions will never get design attention; the automatic path is the one
  that carries them. And losing someone's hand-tuned design to an automatic rerender is the worse
  of the two failure modes.
- **Supersedes:** nothing. It **extends D53**.
- **Documents changed:** `01-prd.md`, `06-visual-designer.md`, `11-background-jobs.md`

## DEC-013 — Cache Components is OFF

- **Date:** 2026-09-13 · **Decided by:** architect, approved with the plan
- **Decision:** The Next.js **Cache Components** flag stays off. Routes become dynamic by
  touching `cookies()` in the DAL — **never** via `export const dynamic`.
- **Rationale:** verified in the shipped bundle: next-intl resolves the locale through a React
  `cache()` slot that `use cache` isolates, falling back to `headers()`, which throws inside a
  cache scope. `getTranslations()` therefore cannot be called inside any `use cache` boundary. In
  an Arabic-first product where every cacheable fragment contains translated text, that removes
  the entire point of the flag.
- **Rejected alternative:** Cache Components ON with PPR.
- **Consequences:** keeping dynamism in the DAL rather than in route config makes a future
  migration a configuration change rather than a rewrite.
- **Documents changed:** `04-architecture.md`, `CLAUDE.md`

## DEC-014 — RLS uses claims for reads and a table lookup for privileged writes

- **Date:** 2026-09-13 · **Decided by:** architect, approved with the plan
- **Decision:** `org_id` goes into the JWT via the Custom Access Token Hook and is
  **immutable**, so isolation never depends on claim freshness. `org_role` and `status` are
  mutable, so every privileged write RPC re-reads them plus a `claims_version` and raises
  `stale_claims`. `jwt_expiry` drops to 900s. **Super admins get no data-plane access at all** —
  no `is_super_admin()` disjunct on any policy. Break-glass is time-bounded impersonation,
  audited in the **org's own** log where its admins can see it.
- **Rationale:** D3 requires that cross-org reads be *impossible*, not hidden. A super-admin
  disjunct on every policy reduces that guarantee to "one claim is correct".
- **Rejected alternative:** a `SECURITY DEFINER` table lookup on every read.
- **Documents changed:** `03-permissions-rls.md`, `04-architecture.md`, `12-security-privacy.md`

## DEC-015 — Check-in codes are stored per rotation window, not derived

- **Date:** 2026-09-13 · **Decided by:** architect, approved with the plan
- **Decision:** Each rotation window's code is a **stored row**, not an HMAC derived from a
  session secret. Single-use is `unique (session_id, member_id)`; an
  `exclude using gist (member_id, session_window)` makes attendance at two overlapping sessions
  structurally impossible. Rate limiting moves **into the check-in transaction**.
- **Rationale:** the realistic attack is someone photographing the screen and posting the code in
  WhatsApp, so the operator needs "burn it now" — one `update … set revoked_at`. A derived scheme
  forces rotating the session secret, which strands everyone mid-session, and forces re-deriving
  past windows whenever an admin changes the rotation period. The existing in-memory rate limiter
  resets per lambda instance — fine for a form backed by a unique index, wrong for guessing.
- **Rejected alternative:** derived HMAC codes.
- **Documents changed:** `02-domain-model.md`, `03-permissions-rls.md`, `12-security-privacy.md`

## DEC-016 — The points ledger is append-only with deterministic idempotency keys

- **Date:** 2026-09-13 · **Decided by:** architect, approved with the plan
- **Decision:** Idempotency keys derive from rule + source event with a **`:v1` epoch suffix**.
  `on conflict do nothing` is the only conflict action used. Balances come from a
  **trigger-maintained rollup** that self-audits nightly against a `sum()` oracle via
  `last_entry_id`. Company-leaderboard **snapshots are required, not optional**.
- **Rationale:** bumping the epoch is what makes a deliberate recompute distinguishable from an
  accidental double-award. The rollup is safe here *specifically because* the ledger is
  insert-only — a pure left fold with nothing to un-apply. Points-per-active-member has a
  time-dependent denominator, so live computation silently rewrites last quarter's standings
  whenever someone is deactivated.
- **Documents changed:** `02-domain-model.md`, `05-scoring-engine.md`, `11-background-jobs.md`

## DEC-017 — The designer renderer is bundled in the worker image; D66 is restated in three tiers

- **Date:** 2026-09-13 · **Decided by:** architect, approved with the plan
- **Decision:** The worker drives headless Chromium against a **self-contained renderer in its
  own image**, not a render route in the deployed Next app. Code identity is recovered with a
  shared `designer-runtime` package at one version plus a **blocking CI parity gate**. The
  preview an admin approves **is the worker-rendered artifact itself**.
  D66 is restated in three testable tiers:
  - **Tier A** — text identity (same glyph sequence, line breaks, fitted size) on **every**
    production export.
  - **Tier B** — pixel parity in CI, both paths inside the worker image.
  - **Tier C** — cross-browser advisory, nightly.
- **Rationale:** this trades automatic code identity for **guaranteed font identity**, and a
  font-fetch failure in the route approach produces a plausible-looking poster with silently
  wrong Arabic — the D66 nightmare. As literally written, D66 cannot be tested: pixel identity
  between an arbitrary browser and the worker's Chromium is impossible (different HarfBuzz
  builds, different rasterizers). The three tiers make it enforceable without weakening it.
- **Rejected alternative:** a ticket-gated render route in the Next app.
- **Documents changed:** `06-visual-designer.md`, `11-background-jobs.md`, `13-testing-quality.md`

## DEC-018 — graphile-worker on Fly.io

- **Date:** 2026-09-13 · **Decided by:** architect, approved with the plan
- **Decision:** **graphile-worker** as the Postgres-backed queue, on **Fly.io**. The document
  converter runs as a **separate Fly app holding no database credentials**.
- **Rationale:** job keys map directly onto D63's idempotency requirement (re-saving a poster
  leaves one pending render; rescheduling *moves* a reminder), and jobs can be enqueued from SQL
  inside the originating transaction, removing the dual-write window. Fly wins on burst economics
  for a 2 GB Chromium + LibreOffice image, and decisively lets the code parsing hostile PPTX hold
  the fewest secrets.
- **Rejected alternatives:** pg-boss; Railway.
- **Operational catch:** graphile-worker needs a **session-mode** connection (port 5432, not the
  transaction pooler on 6543) for LISTEN/NOTIFY, with a **boot-time probe**, because the failure
  mode is silent degradation to polling.
- **Documents changed:** `04-architecture.md`, `11-background-jobs.md`. Recorded as **A34**, **A35**.

## DEC-019 — Radix primitives directly; no shadcn/ui

- **Date:** 2026-09-13 · **Decided by:** architect, approved with the plan
- **Decision:** Accessible primitives come from **Radix directly**. The permitted glyph set ships
  as roughly eight **inline SVGs**.
- **Rationale:** the product needs real dialog/popover/select/tabs/toast behaviour, and Radix
  ships `DirectionProvider dir="rtl"` with unstyled markup. shadcn's value over raw Radix is a
  Tailwind layer written against `--background`/`--foreground` — a second, competing token
  vocabulary alongside the existing `--color-canvas` / `.theme-dark` system — plus
  `lucide-react`, which brand policy **bans**. The hand-written `button.tsx` already proves the
  house style.
- **Supersedes:** **A21** (shadcn/ui). Status in `ASSUMPTIONS.md`: *proposed alternative*.
  Tailwind itself is kept.
- **Rejected alternatives:** shadcn re-themed; hand-rolling every primitive.
- **Documents changed:** `04-architecture.md`, `10-i18n-rtl.md`, `CLAUDE.md`

## DEC-020 — Realtime reverses the repo's documented "no browser Supabase client" invariant

- **Date:** 2026-09-13 · **Decided by:** architect, approved with the plan — **flagged loudly**
- **Decision:** A18 (Realtime for comments, reactions, RSVP counts, check-in counts) requires a
  **browser Supabase client**, which **reverses the README's documented invariant** that no
  `NEXT_PUBLIC_` variables exist and the browser never talks to Supabase. RLS then becomes the
  only thing between a browser and the data. Decided in **M0**, with **server polling of
  check-in counts as the fallback**.
- **Rationale:** stated as a reversal rather than a detail because the invariant it breaks was
  written down deliberately. Anyone who reads the README and then sees a browser client should
  find this entry rather than assume a mistake.
- **Documents changed:** `04-architecture.md`, `12-security-privacy.md`, `README` (at
  implementation time, not in this session)

## DEC-021 — The owner confirms the Realtime trade: browser Supabase client, RLS as the sole boundary

- **Date:** 2026-09-13 · **Decided by:** **owner**
- **Decision:** Option A. Ship Supabase **Realtime** with a browser client, accepting that
  `NEXT_PUBLIC_SUPABASE_URL` and the publishable key become visible to anyone who opens the page,
  and that **RLS becomes the only boundary between a browser and the data**.
- **Rationale:** the owner was shown both options and the trade explicitly. Realtime is the
  well-trodden Supabase path, the publishable key is designed to be public, and the plan already
  builds the compensating control — the **generated isolation sweep** over every table
  (`03` §8.1), which is what turns "RLS is the only lock" from a worry into a tested property.
  The rejected alternative (Option B, server polling) costs a few seconds of latency on comments
  and a stepped rather than smooth check-in counter — acceptable in a room, but a worse product
  for no security benefit *provided* the sweep holds.
- **Supersedes:** the provisional half of **DEC-020**. DEC-020's *analysis* stands unchanged and is
  still the reason this entry exists; what is superseded is its status as an open M0 question with
  polling as a live fallback. **Polling is no longer the plan's fallback** — it is a rejected
  alternative, recorded here so a later session does not treat it as still on the table.
- **Consequences:**
  - **M0's "decide the browser client" spike becomes implementation**, not a decision point.
  - The `NEXT_PUBLIC_` invariant at `README.md:35` is **retired at implementation time**, with the
    README updated to point at DEC-020 and this entry — so a reader who finds a `NEXT_PUBLIC_`
    variable finds the decision rather than assuming a mistake.
  - The **isolation sweep is now load-bearing, not merely thorough.** It was already a blocking CI
    gate (`13` §9.1); this entry is the reason it must never be weakened, skipped for a "trivial"
    table, or allowed to go red.
- **Documents changed:** `04-architecture.md`, `12-security-privacy.md`, `14-roadmap.md`,
  `ASSUMPTIONS.md`, `STATUS.md`

## DEC-022 — Realtime gets its own authorization section: private channels and `realtime.messages` RLS

- **Date:** 2026-09-13 · **Decided by:** architect, prompted by the owner asking whether best
  practice differs from DEC-021
- **Decision:** DEC-021 stands unchanged — **Option A is the best practice**, not a compromise. But
  it is adopted with a hardening the plan had **missed**, now written out as `03` §7:
  1. **Every Realtime channel in this product is private** — `config: { private: true }`. A public
     channel can be subscribed to **without authentication at all**, which would place data outside
     RLS entirely.
  2. **RLS policies on `realtime.messages`** for `extension = 'broadcast'` and `'presence'`,
     separately for `select` (receive) and `insert` (send), scoped by `org_id` like every other
     policy in this product.
  3. **Broadcast from the database** (`realtime.broadcast_changes()` in a trigger) is the default
     mechanism, not Postgres Changes, so the payload is ours to shape and scope.
- **Rationale:** `03-permissions-rls.md` covered 64 tables and 6 storage buckets and said **nothing
  about Realtime's own authorization surface**. Realtime does not inherit table RLS for
  broadcast and presence — it has a separate model built on `realtime.messages`, and channel
  privacy is a separate control again. Under DEC-020 that gap was latent, because the browser could
  not reach Supabase at all. **Under DEC-021 it is the hole**: RLS is now the only boundary, and an
  unconfigured Realtime channel is precisely where RLS is not applied.

  The Postgres-Changes-vs-Broadcast choice matters for the same reason. Postgres Changes filters
  rows by table RLS per subscriber, which is correct but couples the wire format to the table
  shape — so a column added later is broadcast to every subscriber by default. Broadcast from the
  database makes the payload an explicit, reviewed choice.
- **Supersedes:** nothing. It **closes a gap in `03`**, and it is the reason DEC-021 is safe rather
  than merely conventional.
- **Verified against:** Supabase Realtime authorization and broadcast documentation, September 2026
  — not asserted from memory, because the channel-privacy default is exactly the kind of detail that
  changes between versions.
- **Documents changed:** `03-permissions-rls.md` (new §7; test cases renumbered to §8),
  `04-architecture.md`, `12-security-privacy.md`, `13-testing-quality.md`

## DEC-023 — The QA suite refuses to run against a real Supabase project

- **Date:** 2026-09-13 · **Decided by:** architect, after causing the incident below
- **What happened:** `scripts/qa.mjs` submits the registration form. Its header says *"Supabase
  stubbed on :54321"*, so the suite was run with `scripts/supabase-stub.mjs` started alongside it.
  **That is not sufficient and nothing said so.** `next start` reads `.env.local`, which points at
  the production project, so the form posts went to the **live `registrations` table** while the
  stub sat idle with an empty log. No error, no warning — the only symptom was later runs returning
  «هذا البريد مسجّل معنا مسبقًا», which is the unique index rejecting a second insert.

  Three test rows reached production: `sara@example.com`, `dup@example.com`, `nojs@example.com`.
  `registrations` is a frozen historical record (DEC-002), so these are contamination of the one
  table the plan says never to touch.
- **Decision:**
  1. **`scripts/qa.mjs` refuses to start** unless `SUPABASE_URL` resolves to `localhost` or
     `127.0.0.1`. It reads `process.env` first, then `.env.local`. Exit code 2, with the reason.
  2. **`npm run qa`** (`scripts/qa-run.mjs`) starts the stub, starts `next start` **with
     `SUPABASE_URL` overridden in the same command**, waits for both, runs the suite, and tears
     everything down. Overriding the env where the server is spawned is the only thing that
     actually wires them together.
  3. The suite's own staleness was fixed at the same time: the `wa.me` assertion that commit
     `e748642` invalidated now stubs `navigator.share` and asserts the composed message, and the
     screenshot path resolves to `.qa-shots/` instead of an expired session directory.
- **Rationale:** a comment is not a control. The suite is destined to be a **blocking CI gate**
  over the frozen public contract (`REQ-NFR-019`), and a gate that can write to production is worse
  than no gate — it carries authority it has not earned. The guard is deliberately a hard refusal
  rather than a warning, because the failure it prevents is silent and irreversible.
- **Supersedes:** nothing. It closes a defect in the repository's own tooling, found by using it.
- **Follow-up owed:** the three rows must be deleted from the live table. It could not be done from
  this session — there is no `psql`, no Postgres driver and no Docker available, and installing one
  to reach production was refused by the sandbox, correctly. **The SQL is in `STATUS.md` for the
  owner to run in the Supabase SQL editor.**
- **Documents changed:** `scripts/qa.mjs`, `scripts/qa-run.mjs` (new), `package.json`,
  `.gitignore`, `13-testing-quality.md`, `14-roadmap.md`, `STATUS.md`

---

## Template for new entries

```markdown
## DEC-NNN — <one-line decision>

- **Date:** YYYY-MM-DD · **Decided by:** <owner | architect | session>
- **Decision:** <what was decided, precisely enough to implement>
- **Rationale:** <why; include the alternative that was rejected and why>
- **Supersedes:** <DEC-NNN | A-NN | nothing>
- **Documents changed:** <files>
```
