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

## DEC-024 — The parity spike lands: Tier A is geometry, not glyph IDs, and blank captures are the real enemy

- **Date:** 2026-09-13 · **Decided by:** architect, from the M0 spike (`scripts/parity/`)
- **Verdict: the approach works.** Headless Chromium renders Arabic correctly — lam-alef forms,
  stacked tashkeel positions and is not clipped — and is **bit-for-bit deterministic**: 0.000%
  pixel drift between two renders of the same document, repeatably. A substituted face is caught
  at **2–10% pixel difference** and by advance-width drift on every case. **D66 is achievable
  through this pipeline**, and M6 can be planned on it.
- **Decisions the spike forced:**
  1. **Tier A is geometry, not a glyph dump.** No browser exposes shaped glyph IDs, so
     `06` §9.1's "same glyph sequence" is implemented as the geometry shaping *produces*: line-box
     count, per-line rounded widths, total advance, per-character rect count, and computed size.
     It changes when shaping changes and holds when it does not, which is the property that was
     actually wanted.
  2. **A blank capture must be a hard failure.** Twice during the spike the goldens recorded
     *nothing* and passed every comparison — the worst possible outcome, because a blank golden is
     permanently green. The harness now measures inked pixels and **refuses to write a golden**
     below 0.1% ink.
  3. **Tier B compares against the golden, not only run-to-run.** Comparing two renders of the
     same broken configuration proves only that the renderer is consistent with itself, which a
     substituted font satisfies perfectly.
  4. **Fonts are inlined as data URIs by SHA-256.** The render is hermetic and the golden is tied
     to exact bytes (A39, `REQ-DSG-016`). `npm run parity:fonts` materialises them out of the
     next/font build output.
- **Two failure modes worth carrying into M6, because both are silent:**
  - **`font-display: block` hides glyphs while metrics still resolve.** Measurements looked
    correct, `document.fonts.check()` returned true, and the screenshots were empty. Use `swap`,
    and `await document.fonts.load()` per weight rather than trusting `document.fonts.ready` —
    a face that is declared but never exercised is not "pending", so `ready` resolves early.
  - **In an RTL document, an overflowing absolutely-positioned element overflows *leftward*.** A
    measurement helper with `white-space: nowrap` pushed `scrollWidth` to 1008 against an 800px
    viewport and sat at `x = -74`, which shifted the scroll origin and made **every
    element-relative screenshot capture the wrong region** — silently. Helpers are now
    `position: fixed`, which cannot affect scroll size. **This is an RTL-specific trap that would
    not occur in an LTR layout**, and the designer's own export path takes element screenshots.
- **Supersedes:** nothing. It implements `REQ-DSG-014` / `REQ-DSG-015` as far as M0 can, and
  confirms DEC-017's premise.
- **Scope, honestly:** this proves Tiers A and B for **DOM text in the app's own Chromium**. It
  does **not** yet cover the four export paths of `REQ-DSG-015` (poster PNG, poster PDF,
  certificate PDF, slide page images) — those need the worker image and the designer, in M6. The
  suite is built so each path plugs into the same seven cases.
- **Documents changed:** `06-visual-designer.md`, `13-testing-quality.md`, `14-roadmap.md`,
  `STATUS.md`

## DEC-025 — Environments are local + CI, not three hosted Supabase projects

- **Date:** 2026-09-13 · **Decided by:** owner, on cost
- **Decision:** **dev is local** (`supabase start` — the full stack in Docker on the developer's
  machine) and **CI runs against an ephemeral Postgres container**. **No new hosted Supabase
  projects are created.** Production stays as it is. A hosted **staging** project is deferred until
  there is a reason for one.
- **Rationale:** A23 asked for "environments dev/staging/prod with separate Supabase projects" and
  the plan carried that through **without costing it**. That was an omission on the architect's
  part, and the owner caught it. Each additional hosted project is roughly **$10/month**, so the
  literal reading of A23 is ~$20/month of recurring spend.

  It buys very little, because of what each environment is actually *for*:

  | Need | What it is really for | What covers it |
  |---|---|---|
  | dev | Migrate and iterate without fear | **Local** — free, and faster to reset |
  | CI | The ~86 RLS policy tests (`03` §8) | **A Postgres service container** — free |
  | staging | A *shared* pre-prod with real OAuth | A hosted project — **the only one that costs** |

  The safety M1 genuinely needs is *"never run an untested migration against production"*, and
  local plus CI delivers that completely. The RLS suite — the highest-value testing in the plan —
  needs an ephemeral Postgres, **not** a hosted project. Sharing is the only column a hosted
  staging wins, and there is one developer.
- **Supersedes:** **A23**'s "separate Supabase projects" clause. Status in `ASSUMPTIONS.md` moves
  to *proposed alternative*. The rest of A23 — Vitest, Playwright, GitHub Actions — is unchanged.
- **When to revisit:** a second person joins, or the launch rehearsal needs real Google OAuth
  against a shared host. Both are good reasons; neither is true now. Adding a project later is a
  dashboard click and an env var, not a migration.
- **Prerequisite, and it is the owner's:** **Docker is not installed on this machine.** Local
  Supabase needs it (Docker Desktop or OrbStack, both free). The same install unblocks
  `supabase db dump`, which is why the three stray test rows could not be cleaned up from the
  session (DEC-023).
- **Unrelated blocker found at the same time:** the `supabase` CLI on this machine is authenticated
  as **devyaden's Org**, while the `kareem-marefa` project lives in org `irrxywjeaahimtvyldgo`.
  The CLI therefore cannot see the production project. `supabase login` with the owning account
  fixes it. **Local development needs no account at all**, so this blocks nothing here.
- **Documents changed:** `ASSUMPTIONS.md`, `13-testing-quality.md`, `14-roadmap.md`, `STATUS.md`

## DEC-026 — Correction: Docker was installed all along

- **Date:** 2026-09-13 · **Decided by:** architect — a correction, not a decision
- **Correction:** **DEC-025 and `STATUS.md` stated that Docker was not installed on this machine.
  That was wrong.** Docker Desktop is installed (client 29.4.3, `/usr/local/bin/docker`); only the
  **daemon was not running**. Starting it took two seconds.
- **How the error was made, since it is a repeatable one:** the check was
  `docker info >/dev/null 2>&1 && echo "docker running" || echo "no docker"`. `docker info` exits
  non-zero when the daemon is unreachable **and** when Docker is absent, so the two cases were
  collapsed into one and reported as the wrong one. **Test for the binary and the daemon
  separately** — `command -v docker` answers "installed", `docker info` answers "running".
- **What it changes:**
  - DEC-025's decision (**local + CI, no new hosted projects**) is **unaffected and now cheaper to
    act on** — the prerequisite it listed was already met.
  - The owner-action item "install Docker" is **removed** from `STATUS.md`.
  - The DEC-023 row cleanup is **no longer blocked by tooling**. It is still blocked by the CLI
    being authenticated to the wrong organisation (`supabase login`), which is genuinely the
    owner's to do.
- **Supersedes:** the "Prerequisite" bullet of **DEC-025** only. Per this log's own rule, the
  original entry is left standing rather than edited.
- **Documents changed:** `STATUS.md`, `14-roadmap.md`

## DEC-027 — Local Supabase is the dev environment, and `supabase db query --linked` is how production SQL gets run

- **Date:** 2026-09-13 · **Decided by:** architect, from doing it
- **Outcome:** DEC-025 is **implemented**. `supabase start` brings up twelve healthy containers —
  Postgres, Auth, Storage, Realtime, Studio, Kong, Mailpit and the rest — and `supabase db reset`
  applies both existing migrations to a clean database. **The dev environment costs nothing and
  needs no account.**
- **Two findings worth carrying:**
  1. **`supabase db query --linked` runs SQL against production through the Management API, using
     the CLI access token — no database password.** This is the sanctioned way to run a one-off
     statement. The cached `supabase/.temp/pooler-url` carries **no password**, `psql` is not
     installed, and installing a Postgres driver to reach production is (rightly) refused by the
     sandbox. Every earlier attempt failed on those.
  2. **`supabase db dump --linked` also works token-only**, and is the read-only way to inspect
     production. Note that a `--data-only` dump of `public` contains **every real signup's personal
     data**, so it is deleted immediately after use rather than left in `/tmp`.
- **Closes:** DEC-023's outstanding follow-up. The three stray rows are deleted; `registrations` is
  back to 19 rows with no `@example.com` remaining.
- **Convention this sets:** production SQL goes through `supabase db query --linked`, is **read
  first**, and is scoped by an explicit predicate. It is never run as a migration — migrations are
  schema, forward-only, and run in every environment forever; a one-off data fix is none of those.
- **Documents changed:** `STATUS.md`, `/CLAUDE.md`

## DEC-028 — CI wires the four gates, and parity goldens are environment-bound

- **Date:** 2026-09-13 · **Decided by:** architect
- **Decision:** `.github/workflows/ci.yml` runs seven jobs on every push and pull request:
  **plan** (traceability + policy-diff + "the generated matrix is current"), **lint** (tsc +
  eslint), **unit**, **rls** (migrations against an ephemeral Postgres service container, per
  DEC-025), **build**, **qa** (the frozen public contract), and **parity**.
- **`scripts/policy-diff.mjs` now exists.** `13` §3.5 called it "the highest-value automation in the
  plan" and it had not been written. It fails on four conditions: a policy in a migration but not in
  `03`; a policy in `03` but not in any migration once its table exists; RLS enabled with no policy;
  and **a policy with no matching `GRANT`** — migration `0002`'s exact lesson, now caught by a
  machine. `registrations` is exempt as frozen legacy (DEC-002). Self-tested: it catches both the
  undocumented policy and the missing grant.
- **The parity decision — Tier A is portable, Tier B is not. Measured, not assumed.** The goldens
  were produced by a developer's **macOS Chrome**; CI runs **Linux**. Rather than guess, the suite
  was run inside a Debian/Chromium 152 container against the same goldens:

  | | macOS vs Linux, same font bytes | Under a substituted font |
  |---|---|---|
  | **Tier A** (advance widths, line counts, fitted size) | **identical on all 7 cases** — 168.81, 88.05, 469.73, 509.70, 666.19, 549.21, 564.04 | **moves on all 7** (168.81 → 208.66) |
  | **Tier B** (pixels) | **0.7–3.9% drift** — an order of magnitude above the 0.1% threshold | 11%+ |

  So Tier A is a function of the **font bytes and the layout algorithm**, not the rasteriser, and
  Tier B is the rasteriser. The harness splits accordingly:

  | Check | Cross-platform |
  |---|---|
  | **Tier A layout geometry** | **BLOCKING everywhere** |
  | Blank capture, font fell back, letter-spacing, determinism | **BLOCKING** — platform-independent properties |
  | Tier B pixel regression vs golden | **advisory (Tier C)**, and the run says so |

  **This gives CI a real, blocking D66 check today** — verified by running the substitution case
  inside the Linux container, where all seven fail. It does not wait for M6. Tier B additionally
  becomes blocking on Linux in M6, when goldens are regenerated inside the worker image, which
  DEC-017 already names as the reference environment.

  Two supporting details: `CHROME_NO_SANDBOX=1` opts into `--no-sandbox` for containers running as
  root, deliberately **opt-in** so a developer machine never silently drops the sandbox; and
  `--font-render-hinting=none` plus `--force-color-profile=srgb` pin the two things that would
  otherwise vary between machines.

- **What is armed but not yet meaningful:** the `rls` job proves the migrations apply to a clean
  Postgres and runs `tests/rls` when it exists. M1 creates that suite. `policy-diff` likewise
  reports "no platform policies yet" and starts comparing the moment the first policied table lands.
- **Documents changed:** `13-testing-quality.md`, `STATUS.md`, `14-roadmap.md`

## DEC-029 — The workspace adds `packages/*`; the Next app stays at the repo root

- **Date:** 2026-09-13 · **Decided by:** architect
- **Decision:** npm workspaces with `packages/*`, and **`@kareem/designer-runtime`** as the first
  package — the one renderer shared by the app and the worker image (DEC-017). **The Next app stays
  at the repository root.** It is not moved to `apps/web`.
- **Rationale for not moving the app:** `04-architecture.md` sketches `packages/designer-runtime`
  alongside the app and never required `apps/web`. Moving `src/` would mean changing Vercel's root
  directory on a **live deployment** for no benefit: npm workspaces do not require it, and —
  verified in `node_modules/next/dist/docs/` — **Turbopack transpiles workspace packages
  automatically under the App Router**, so no `transpilePackages` entry is needed either. The
  roadmap flags this restructure as touching the live site; the cheapest way to honour that is to
  not touch it.
- **What the package contains:** the document/layer model (`06` §2) as real types, and
  `renderDocumentToHtml()` — DOM/SVG, never a raster canvas (A28). The typographic invariants from
  A30 are **CSS in the package**, not advice in a document: letter-spacing 0, line-height 1.7,
  `overflow: visible` on text, `text-align: start`, and `<bdi>` around every interpolated value.
- **The change that makes it real:** the parity suite now renders **through the package** instead
  of a bespoke fixture. A fixture only proved Chromium can shape Arabic, which was never in doubt.
  The suite now proves **our renderer** produces correct Arabic, and fails if the renderer
  regresses — which is what DEC-017's "shared `designer-runtime` package at one version plus a
  blocking CI parity gate" actually means.
- **Two fixes it forced, both worth keeping:**
  1. Capture frames are sized to the case's **expected line count plus one**. They were six lines
     tall regardless, so a one-line case was measured in a frame that was mostly white — which
     **dilutes the Tier B ratio** and can hide a real difference under the 0.1% threshold.
  2. The off-screen measurement controls are positioned through the runtime's `extraCss` with
     `position: fixed`, preserving the DEC-024 fix rather than reintroducing the RTL
     overflow-leftward trap.
- **Build order:** root `build` runs `npm run build -w @kareem/designer-runtime && next build`
  explicitly rather than relying on `prepare`, because Vercel restores a build cache and reports
  "up to date" — which would leave `dist` missing or stale.
- **Verified:** the route table is byte-identical before and after, `npm run qa` is 44/44, parity
  holds on macOS **and** in the Linux container, and the break test still fails all 14 assertions.
- **Documents changed:** `04-architecture.md`, `STATUS.md`, `14-roadmap.md`

## DEC-030 — The repo carries a shared Claude Code configuration, and task completion is gated on QA

- **Date:** 2026-09-13 · **Decided by:** owner
- **Decision:** `.claude/settings.json` and `.claude/hooks/` are **tracked**; `.claude/settings.local.json`
  and `.claude/worktrees/` are ignored. The tracked settings carry a permission allowlist for the
  commands this repo runs constantly (`npm run qa`, `npm run build`, `npm run dev:*`,
  `npx vitest:*`, `node scripts/traceability.mjs`, `node scripts/qa.mjs`, and read-only git plus
  `git add`/`git commit`), and a **`TaskCompleted` hook** that runs `npm run qa` and exits `2` on
  failure, so a task cannot be closed while the frozen public contract is red. `.worktreeinclude`
  lists `.env.local` — the only gitignored env file this repo has — so a worktree comes up able to
  run.
- **Rationale:** the allowlist stops every machine growing its own divergent local approvals. The
  gate puts `REQ-NFR-019` at the point of work rather than only in CI, where a red result is found
  later and by someone else. The rejected alternative was leaving this to each developer's
  `settings.local.json`, which is exactly how the approvals drift.
- **Gotchas the next session must not trip on:**
  1. **`TaskCompleted` is a real hook event** — verified against the Claude Code 2.1.270 binary,
     alongside `PreToolUse`, `PostToolUse`, `PermissionRequest`, `SessionStart`, `UserPromptSubmit`,
     `SubagentStop`, `Notification`, `PreCompact` and `SessionEnd`. It is newer than most hook
     documentation; do not "correct" it to `Stop`.
  2. **The mkdir lock is best-effort, not a hard gate.** After 240 five-second attempts (20 minutes)
     the loop gives up with `HAVE_LOCK=0` and runs QA **anyway, unserialized**. Under sustained
     contention it degrades to the old racy behaviour rather than blocking a task. That is the
     intended trade; it is not a bug to "fix" by making it exit non-zero.
  3. **The stale-lock sweep reads the lock's creation mtime**, which nothing refreshes. A legitimate
     run lasting over 30 minutes can have its lock cleared by a waiter while still working. Harmless
     while QA is short; it will bite the day a long Playwright suite lands — which is M0 work.
  4. **The gate costs a full QA pass on every task completion.** `"timeout": 2400` is sized for the
     20-minute wait plus that pass. Shortening the timeout without shortening the wait will kill
     queued runs.
- **Verified:** `bash -n` clean, `settings.json` parses with `timeout` 2400, the executable bit is
  recorded in the index as `100755` (not merely on disk), and a dry run — `echo '{}' | bash
  .claude/hooks/task-gate.sh` — exited **0** with the lock released and no stray temp files.
- **Supersedes:** nothing
- **Documents changed:** `STATUS.md`

## DEC-031 — `packages/fonts` is the font manifest; the app keeps `next/font/google`

- **Date:** 2026-09-13 · **Decided by:** owner ("Option A"), on the architect's recommendation
- **Decision:** `ENT-fonts` exists in the repository as the workspace package **`@kareem/fonts`**
  (`packages/fonts/`): a `manifest.json` plus every font file named by its SHA-256. It is the only
  way a font enters the editor, the worker's Chromium or the worker's LibreOffice (`REQ-DSG-016`).
  The **app keeps `next/font/google`** exactly as `10` §4.1 specifies; the manifest's web faces
  (`faces`, `.woff2`) are the **exact bytes the build emits** — so the live site is byte-identical
  and no font byte the public routes serve changed. For LibreOffice, which cannot read woff2, each
  `(family, weight, style)` gets **one TrueType file (`ttf`) derived losslessly** from its woff2
  subsets by `scripts/fonts/derive-ttf.py` (fontTools, pinned): Arabic and Latin subsets are merged
  into one face so LibreOffice does not see two fonts of the same name, and the script **refuses to
  write** a derived font that lost `rlig`, `mark` or `mkmk`. `derivedFrom` records the woff2
  hashes each TTF came from.
- **The gate:** `scripts/fonts/check.mjs` (`npm run fonts:check`) asserts (1) every manifest file
  exists and hashes to its name, with no stray font in the package; (2) every web face group has
  exactly one TTF derived from exactly that group's hashes; (3) when a Next build is present, the
  Arabic and Latin faces it emitted are exactly the manifest's, by hash. CI runs it in the `build`
  job after `next build`. The worker and converter images run it with `--no-build` at image build,
  so an image cannot ship a font the manifest does not name.
- **Rationale:** the alternative ("Option B") was `next/font/local` over a pinned upstream IBM Plex
  release with our own subsetting. It removes Google from the build, but it changes every served
  font byte on a live site, contradicts `10` §4.1's "as shipping today", needs a non-zero visual
  diff reviewed and an `/en` LCP measurement — for no D66 gain, since parity is a property of the
  bytes, not of where they came from. Production's three Arabic files were verified to hash-match
  the manifest before the decision. Option B remains available as a later entry if Google-at-build
  ever becomes a problem; the gate above is what would detect it.
- **Path change:** `scripts/parity/fonts/` → `packages/fonts/`; `scripts/parity/extract-fonts.mjs`
  → `scripts/fonts/extract.mjs`; `npm run parity:fonts` → `npm run fonts:extract`. The parity
  harness reads `packages/fonts/manifest.json`. Goldens unchanged; parity re-verified at 0.000%.
- **Scope of the set, stated so nobody widens it by accident:** the manifest holds the **Arabic
  and basic-Latin** subsets of both families. next/font also emits Cyrillic, Greek, Vietnamese and
  Latin-Extended subsets; they are not part of the set, because a font set is a promise about what
  the product renders. Adding a script means adding it here and to the parity cases.
- **Supersedes:** nothing. Implements `REQ-DSG-016` and `REQ-INT-009`; makes invariant 12 checkable.
- **Documents changed:** `STATUS.md`, `CLAUDE.md` (folder layout)

## DEC-032 — The converter lives at `converter/`, is dependency-free Node, and refuses to boot with a credential

- **Date:** 2026-09-13 · **Decided by:** session, within `04` §7.1
- **Decision:** Fly app 2 — the credential-free converter — is the top-level directory
  **`converter/`**: `server.mjs` (Node built-ins only, no npm dependencies), a `Dockerfile` built
  **from the repository root** so it can copy `packages/fonts`, a `fly.toml` with **no
  `[http_service]`** so the app is reachable only over Fly private networking from the worker, and
  `test/smoke.mjs`, which builds the image and drives it through its real contract. The image
  installs LibreOffice Impress, poppler, libwebp and unzip; its fonts are **exactly the manifest's
  TrueType files**, and the build runs `scripts/fonts/check.mjs --no-build` and greps `fc-list` for
  both families before the image can exist (`REQ-DSG-016`).
- **The contract** (`07` §4): `POST /convert` takes a signed input URL and a signed output URL,
  sniffs the input on content (a PowerPoint declared as PDF is a `415`), converts with a **fresh
  LibreOffice profile per job** in a temp dir that is always removed, uploads the PDF, and returns
  the page count plus a font report — `used`, `embedded`, `substituted` (families the deck names
  that the image lacks, by name, for `REQ-MAT-011`) and `inPdf` (what `pdffonts` finds actually
  embedded). `POST /pages` takes a signed PDF URL and per-page signed PUT URLs and renders WebP at
  the long edge and quality `07` §4.5 specifies (1600 px / q82; thumbnails 320 px / q70). Input is
  capped at 200 MB, JSON at 1 MB, LibreOffice at 180 s.
- **The boot guard:** the process exits `1` before listening if any environment variable name
  matches a credential shape (`SUPABASE`, `DATABASE`, `SERVICE_ROLE`, `POSTGRES`, `PG*`, `RESEND`,
  `SECRET`, `PASSWORD`, `API_KEY`, `PRIVATE_KEY`, `ENCRYPTION`), printing the **names only**. The
  security model of `04` §7.1 is that this app holds nothing; a guard makes that a property of the
  process rather than a hope about the deployment. Only `PORT` and, for the local smoke test,
  `CONVERTER_ALLOW_HTTP=1` are read.
- **Rationale:** a workspace package would have put the converter's dependencies into the root
  `node_modules` that Vercel installs, for a service that needs none; a separate lock file would
  have been a second thing to keep npm-version-safe. Zero dependencies avoids both. Node over a
  Python or shell service because the fonts gate is a Node script and the image can run it
  unchanged. The substitution *report* is produced here because only this process can see what
  LibreOffice had; writing it to the material and surfacing the warning remains M4.
- **Not decided here:** deployment. `fly deploy` has not been run and `flyctl` is not installed;
  the image is built and tested locally and in the CI `converter` job. Deploying both Fly apps is
  the owner's step (`STATUS.md`).
- **Supersedes:** nothing. Implements `REQ-MAT-003`'s conversion path within `04` §7.1.
- **Documents changed:** `STATUS.md`, `CLAUDE.md` (folder layout)

## DEC-033 — `13` §1 records the M0 test stack as installed; `Refs:` lives in the trailer paragraph

- **Date:** 2026-09-13 · **Decided by:** owner
- **Decision:** the "Where we start from" table in `13-testing-quality.md` §1 is updated to say
  what is true after M0: Vitest runs two projects (`unit` under Node, `components` under jsdom in
  an RTL document), jsdom and `@testing-library/*` are installed, Playwright is installed and runs
  against the QA stub with a CI `e2e` job, and GitHub Actions is configured (DEC-028) with the
  `converter` image job added. `13` is `settled`, so the change needed this entry; the previous
  session left the rows stale rather than edit a settled document without one (`STATUS.md`).
- **Also decided, for every commit from here on:** the `Refs:` line goes in **git's final
  trailer paragraph** — the same block as `Co-Authored-By` and `Claude-Session`, with no blank
  line between them — so `git interpret-trailers` and `%(trailers:key=Refs)` parse it. The seven
  M0 commits on `m0/foundation` carry `Refs:` one paragraph above the trailers; they are pushed
  and are not rewritten (no force-push).
- **Rationale:** a "not installed" row in the testing document sends a session to install what
  exists. The trailer placement is so tooling can read citations, not only people.
- **Supersedes:** nothing.
- **Documents changed:** `13-testing-quality.md` §1, `CLAUDE.md` (commit template)

## DEC-034 — No Fly.io; the worker and converter are developed locally and hosting is decided by M3

- **Date:** 2026-09-13 · **Decided by:** owner
- **Decision:** **Fly.io is dropped.** The owner will not take on a paid hosting plan for
  infrastructure that nothing in M0–M2 needs in production. The worker (`worker/`) and the
  converter (`converter/`) are **developed and proven locally and in CI**: the worker against
  `supabase start` on session-mode port **54322** and against CI's Postgres container, the
  converter as a Docker image. **Where they run in production is an open question — OQ-027 —
  with a deadline of M3**, the first milestone that needs a job to run unattended (reminder
  emails). `converter/fly.toml` is deleted so nobody deploys from stale config.
- **What does not change:** everything the code depends on. The worker needs a **session-mode**
  Postgres connection (port 5432 on Supabase, never the 6543 pooler) and runs the LISTEN/NOTIFY
  boot probe before it starts; `service_role` lives only on the worker and is used only through
  `SECURITY DEFINER` functions (invariant 7, `04` §10); the converter holds **no credentials**
  and is reached only by the worker (`04` §7.1). Any host must provide a private path from the
  worker to the converter, or the converter gains an authentication token — that is the one design
  point Fly's private networking was carrying, and OQ-027 names it.
- **Rationale:** Fly was chosen (DEC-018, A34) for burst economics and private networking, not for
  anything in the code. Both apps are plain images. Paying for two containers to idle through M1
  and M2 buys nothing; picking a host at M3, with real usage to size against, loses nothing.
  Candidates to verify then, not now: a small VPS (Hetzner), Oracle Cloud's always-free ARM VM,
  Railway. **Rejected:** running the worker on Vercel or Supabase Edge Functions — neither can
  run Chromium with the manifest's fonts or LibreOffice, and Vercel must never hold `service_role`.
- **What this session did instead of deploying:** `worker/` with the probe (`worker/src/probe.ts`),
  a `ping` task, a unit test over a fake client, and a CI `worker` job that runs the probe
  **directly against Postgres (must pass) and through pgbouncer in transaction mode (must fail)**
  — the silent failure `11` §1.2 warns about, demonstrated rather than described.
- **What running it taught, and the plan had wrong:** the probe as written in `04` §7.2 and
  `11` §1.2 — LISTEN, then NOTIFY, on one connection — **passes through pgbouncer in transaction
  mode** (2 ms round trip) when the pool is idle, because both statements reuse the same server
  connection. A boot probe always runs in that quiet moment, so it would have approved the exact
  configuration it exists to refuse. The probe therefore uses **two connections**: the listener's
  server connection is idle in the pool when the notification lands and the delivery is dropped,
  which is the real production failure. Verified locally against **both poolers**: direct
  session mode passes (3 ms); pgbouncer transaction mode refuses, pgbouncer session mode passes
  (7 ms); **Supavisor** — Supabase's own pooler, enabled in `supabase/config.toml` for this —
  transaction mode refuses on both its host port `54329` and its internal `6543`, session mode on
  its internal `5432` passes (2 ms). The commands are in `worker/README.md`. Both plan documents
  are corrected under this entry.
- **Supersedes:** **DEC-018**'s hosting clause and **A34** (status: *superseded by owner*).
  graphile-worker itself (A35) and the two-app split stand.
- **Documents changed:** `04-architecture.md` §7, §9, §10 · `11-background-jobs.md` §1 ·
  `14-roadmap.md` M0 · `ASSUMPTIONS.md` A34 · `OPEN-QUESTIONS.md` (OQ-027) · `CLAUDE.md` ·
  `STATUS.md`

## DEC-035 — M1's schema and policy deltas, and how the RLS suite runs

- **Date:** 2026-09-13 · **Decided by:** session, within the owner's approved M1 plan
- **Decision — schema deltas from `02` (frozen) and `03` (settled), all in migrations `0003`–`0006`:**
  1. `orgs.first_admin_email citext` — `REQ-TEN-002` says the super admin "sets … the first org
     admin", but that person cannot exist before their first sign-in. The address is recorded at
     creation and `provision_member()` grants `admin` when it arrives. The alternative — the first
     member of an org becomes its admin — hands the org to whoever signs in first.
  2. `public.auth_claims_version()` joins the claim readers of `03` §2, so the staleness check in
     `assert_active_member()` is `is distinct from` against a typed reader rather than an inline
     cast that a missing claim would turn into a null comparison that passes.
  3. The `members` select grant carries `org_id`, `status` and `leaderboard_opt_out` in addition to
     `03` §5.1b's list: `org_id` so the generated isolation sweep can `select org_id` from every
     table with one query shape, the other two because the app shows them on the member tier.
     `email`, `claims_version`, `deactivated_*` and `anonymised_at` stay out. `members_member_view`
     is `security_invoker` so the base table's RLS and column grant still bind through it.
  4. Named policies `03` did not spell out: `org_domains_read_admin` (§5.1 says "P2-read", which
     P2 does not define), `config_history_read_admin`, and the P1/P2/P3 instances on `companies`,
     `categories`, `venues`, `member_interests`. `03` §8.2 gains a test row for each.
  5. `org_settings` changes reach `scoring_config_history` through an **after-update trigger**,
     one row per changed column, rather than through an RPC — so no code path can change a setting
     silently, including a future admin screen that forgets.
  6. Audit rows for `org_domains` come from a trigger for the same reason.
  7. `platform_admins` has RLS enabled, **no policy and no grant** — exactly `03`'s "No policy at
     all". `scripts/policy-diff.mjs` now reads that phrase from the per-table map and requires the
     migration to match it, instead of reporting "denies everything".
  8. **`service_role` holds no direct privilege on any platform table.** Invariant 6 says the
     worker reaches data only through `SECURITY DEFINER` functions; a hosted project's default
     privileges would nonetheless hand `service_role` everything, while local Supabase's current
     defaults hand it nothing. Every table revokes it explicitly so both environments mean the
     same thing, and a leaked `service_role` key cannot read a table.
  9. **citext under `set search_path = ''`:** the citext `=` operator lives in `extensions` and is
     not found with an empty search path, so `citext = citext` silently degrades to
     case-sensitive `text` comparison. `provision_member()` compares with `lower()` on both
     sides; every future function that compares an email or a domain must too.
- **Decision — the RLS suite:** `tests/rls` is a Vitest project driven through `pg` directly:
  each test runs in a transaction, does `set local role authenticated` and sets
  `request.jwt.claims` — which is exactly how Supabase evaluates policies — and rolls back.
  **Local Supabase is the source of truth**; CI's bare Postgres gets a minimal `auth` shim in
  `scripts/ci/roles.sql` (`auth.users`, `auth.uid()`, `auth.jwt()`, `supabase_auth_admin`) so
  the identical suite runs there too. The project is only registered when `RLS_DATABASE_URL` is
  set, so `npm test` without a database still runs the other projects.
- **Rationale:** each delta is the smallest change that makes a requirement enforceable rather
  than described. The trigger choices trade a little opacity for the guarantee that history
  cannot be skipped.
- **Supersedes:** nothing. Amends `02` §4.1 (`orgs`) and `03` §5.1, §8.2 as described.
- **Documents changed:** `02-domain-model.md`, `03-permissions-rls.md`, `STATUS.md`

## DEC-036 — CSP ships report-only first; proxy refreshes the token; the `NEXT_PUBLIC_` reversal is executed

- **Date:** 2026-09-13 · **Decided by:** session, within the owner's approved M1 plan
- **Decision — CSP (`REQ-NFR-003`):** `proxy.ts` sets a strict policy — `script-src` and
  `style-src` by per-request nonce with `strict-dynamic`, no `unsafe-inline` — as
  **`Content-Security-Policy-Report-Only` on every route**, reporting to `/api/csp-report`. On the
  platform routes (`/{locale}/app`) the nonce and the policy are also forwarded as request
  headers, so Next nonces its own inline scripts and a layout can read `x-nonce`. On the frozen
  marketing routes the policy is a **response header only**: their HTML stays byte-identical
  (`REQ-NFR-019`, verified by `npm run visual` at 0.000%), and the reports say what an enforced
  policy would break there. **Enforcement is a later step**, after a review of the reports from a
  preview deployment — first on `/app`, then everywhere once the marketing pages' inline script
  and style attributes are addressed.
- **The open question it raises — OQ-028:** `REQ-NFR-003` says no `unsafe-inline` in the style
  directive. Radix primitives set inline `style` attributes (positioning, scroll lock), which a
  nonce-only `style-src` blocks. Either the requirement admits `'unsafe-hashes'`/`'unsafe-inline'`
  for `style-src` on the platform routes (low risk: style injection, not script), or the
  primitives are configured to avoid inline styles. Decided at enforcement time, with reports in
  hand.
- **Decision — the optimistic check refreshes the token:** `04` §6 says proxy does a cookie-presence
  check and no database call. It now also calls `getClaims()`, which verifies the JWT locally
  against the project's JWKS and **only calls Auth to refresh an expired access token** — never
  the database. The refresh has to live here because Server Components cannot write cookies, and
  with `jwt_expiry` at 900 s a member who is quiet for fifteen minutes would otherwise be signed
  out. A forged cookie still passes proxy and is rejected at the data. **PR C prerequisite:** the
  hosted project must use **asymmetric JWT signing keys**; with the legacy HS256 secret,
  `getClaims()` falls back to a network call per request.
- **Decision — DEC-020/DEC-021 executed:** `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` exist. `README.md`'s invariant that none do is retired
  with a pointer to both entries. The frozen registration form keeps its server-only variables and
  client untouched. The browser client (`src/lib/supabase/browser.ts`) exists and is unused until
  Realtime; all data access is the DAL's server client.
- **Also:** `/en/app/*` and the English auth screens redirect to Arabic until the platform's
  English catalogue exists (STORY-INT-004); marketing `/en` is untouched. Sign-in starts
  server-side (a Route Handler calling `signInWithOAuth`), so no browser client is needed for it.
- **Supersedes:** nothing. Refines `04` §6 as described; `REQ-NFR-003`'s enforcement is deferred,
  not waived.
- **Documents changed:** `OPEN-QUESTIONS.md` (OQ-028), `README.md`, `STATUS.md`

## DEC-037 — `anon` loses `TRUNCATE` on the frozen `registrations` table

- **Date:** 2026-09-14 · **Decided by:** owner
- **Decision:** migration `0009` runs `revoke truncate on table public.registrations from anon;`
  and the owner runs the same statement by hand in the hosted project's SQL editor. Nothing else
  about the table changes: not its rows, not its columns, not its insert policy, not the
  `select/update/delete` revocations of `0001`, not the `insert` grant of `0002`.
- **Rationale:** PR A found that the hosted project's old default privileges had granted `anon`
  `ALL` on the table when it was created, and `0001` revoked only `select, update, delete`.
  `TRUNCATE` was not reachable through the publishable key — PostgREST never issues it — but a
  privilege nobody needs is a privilege to remove. `REFERENCES` and `TRIGGER` remain granted by
  the same accident; they are equally unreachable and the owner may revoke them later with the
  same one-liner shape.
- **Supersedes:** narrows DEC-002's "never touch": the table and its data stay frozen; a
  **privilege revocation that only removes access** is allowed, by decision, one at a time.
- **Documents changed:** `STATUS.md`

## DEC-038 — The marketing routes live in a `(marketing)` route group; the platform is a 404 until configured

- **Date:** 2026-09-14 · **Decided by:** owner
- **Decision 1 — the route group.** `page.tsx`, `register/`, `not-found.tsx` and `[...rest]/`
  move from `src/app/[locale]/` into `src/app/[locale]/(marketing)/`, whose layout renders the
  header, the `main` landmark and the footer exactly as the locale layout did. The locale layout
  keeps `html`, fonts, the sting script, `NextIntlClientProvider` and `Direction.Provider`, and
  renders `children`. **URLs are unchanged**: a route group adds no path segment and no DOM, so
  the frozen routes' HTML is byte-for-byte what it was (`npm run visual` 0.000%, `npm run qa`
  44/44). The `(auth)` and `app` layouts render their own `main` under the wordmark and no longer
  pad for a fixed marketing header they no longer have. This is the structure `04` §4 always
  described; PR B rendered the platform inside the marketing chrome only because the frozen files
  could not be moved without this approval.
- **Decision 2 — the unconfigured guard.** `platformConfigured()` is true only when both
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set. When it is false
  — production's state until PR C — `proxy.ts` rewrites every platform route and auth screen to
  the marketing catch-all with status **404**, and the auth Route Handlers answer 404. The build
  itself needs neither variable. `npm run test:e2e:unconfigured` builds with both empty and proves
  the 404s and the untouched frozen routes; CI runs it as the `unconfigured` job. This is what
  "`main` stays deployable" means between M1 and launch: the live site is the marketing site and
  nothing else, with no 500s behind it.
- **Rationale:** the alternative to the group was branching the shared layout on the pathname,
  which puts platform logic in a frozen file forever. The alternative to the guard was configuring
  the hosted project early, which is PR C and is deferred (DEC-039).
- **Supersedes:** the STATUS note from PR B that the platform renders inside the marketing chrome.
- **Documents changed:** `04-architecture.md` is already right; `STATUS.md`

## DEC-039 — PR C (production cutover) is deferred to launch; M2 onward build on local Supabase and CI only

- **Date:** 2026-09-14 · **Decided by:** owner
- **Decision:** the production cutover — the schema-only rehearsal, `supabase db push`, the hosted
  Auth settings (asymmetric JWT keys, 900 s expiry, both hooks, the Google provider), the two
  `NEXT_PUBLIC_` variables on Vercel, the first org's one-off seed — **does not happen at the end
  of M1.** It happens once, at **launch**, as the roadmap's final item. Until then the hosted
  project keeps only the frozen `registrations` table and its policy; production serves the
  marketing site and returns 404 for every platform route (DEC-038's guard). **The PR C checklist
  in `STATUS.md` stays exactly as written** and is the script for that day; nothing in it is
  started early.
- **Consequence for every milestone from M2:** development and proof are **local Supabase and
  CI only** (DEC-025). Migrations accumulate forward-only and are rehearsed together against a
  schema-only dump at launch; no migration is pushed to the hosted project before then. A
  milestone's "demonstrable" line is demonstrated locally.
- **Rationale:** cutting over after M1 would put an auth hook, Google sign-in and RLS onto the
  live project months before any member can use them, with the hook a single point of failure
  for sign-in (`14` M1 risks) and nothing to gain but exposure. Deferring costs one rehearsal at
  launch, which the plan required anyway (invariant 3). The one thing this trades away is early
  real-OAuth feedback; the local Auth API and the e2e session specs cover the flow until then.
- **Supersedes:** the M1 scope line "PR C — production cutover" in `STATUS.md`; the roadmap gains
  a **Launch** item (`14` §2, after M8) holding the rehearsal and the cutover.
- **Documents changed:** `14-roadmap.md`, `STATUS.md`

## DEC-040 — The agent team: one checkout, one branch per wave, lead-owned migrations, a shared gate lock

- **Date:** 2026-09-14 · **Decided by:** owner, on the architect's plan (`docs/plan/TEAM.md`)
- **Decision — shape:** a lead Claude Code session with three to five **in-process** teammates
  sharing this checkout, one integration branch per wave (`wave-N/…`), and one local Supabase.
  Waves follow `14` §3: wave 1 splits **M2 along its seams** into `sessions` (PRO, SES, clock jobs;
  owns the event page and its slot contracts; **opus**), `checkin` (RSV, CHK; **sonnet**) and
  `event` (EVT, RAT, private Realtime; **sonnet**); wave 2 is M3 · M4 · M5; wave 3 is M6 ·
  M7-console; wave 4 is M8 · M7-branding. The lead runs whatever model the owner starts it with.
  Ownership is a map of path globs per teammate plus a lead-only list (`CLAUDE.md` § Agent team);
  a teammate stages only its own paths.
- **Decision — migrations are the lead's.** Teammates never write into `supabase/migrations/`:
  `supabase db reset` applies every file on disk, so a half-written migration breaks everyone the
  moment it is saved, and two teammates would race for a sequence number. SQL is authored under
  `supabase/proposed/<name>/` (ignored by the CLI), proven with `applyProposed()` inside the RLS
  suite's rolled-back transactions, and promoted by the lead with its `03` §8.2 rows. Only the
  lead runs `supabase db reset`, `start`, `stop`, and `npm run build`.
- **Decision — the gate lock.** `npm run qa`, `npm run visual`, Playwright's web server, the
  unconfigured build-and-test and the `TaskCompleted` hook take one mutex,
  `/tmp/task-gate.lock` (`scripts/lib/gate-lock.mjs`, same directory and same 30-minute stale
  sweep and 20-minute give-up as the hook of DEC-030), so port 3000 and `.next` are used by one
  run at a time and the hook queues behind a manual run instead of racing it. A parent that holds
  the lock passes `KAREEM_GATE_HELD=1` so its children do not deadlock on it.
- **Decision — wave 0 is done by the M1 session, as PR `m2/schema`:** migration `0010` (the whole
  M2 schema — proposals, presenters, sessions, transitions, RSVPs, codes, check-ins, attempts,
  comments, reactions, reports, ratings, the aggregates view — with RLS, grants, the guard
  triggers, `is_presenter_of()` and `has_checked_in()`), the `03` §8.2 rows for the six pattern
  tables, the per-namespace message catalogue (`src/messages/{ar,en}/<ns>.json` merged by
  `src/messages/index.ts`), the gate lock, `applyProposed()`, `supabase/proposed/`, the three agent
  definitions, the settings allow/deny lists, and `TEAM.md`. **The RPCs are not in wave 0**; they
  are the teammates' first proposed files.
- **Rationale:** the three tracks of M2 touch disjoint tables and screens and share exactly one
  surface, which a slot contract turns into an interface. A branch per teammate is impossible in
  one working tree, and worktrees would multiply the local Supabase problem; one branch with
  path ownership is the honest version of "commit small, often". The lock exists because one
  port and one `.next` cannot be shared by concurrent builds, and the DEC-030 hook already owned
  the only mutex in the repo.
- **Settings:** allow the local Supabase and test commands teammates run; deny `supabase db
  push`, `link`, `--linked` queries and dumps, `config push`, `secrets`, `vercel`, `fly`,
  `gh pr merge`, `gh auth`, pushes to `main`, force-pushes, `reset --hard`, `stash`, `rebase`,
  `clean`, switching to `main`.
- **Supersedes:** nothing. `13` §1's table is unchanged; `TEAM.md` is a new document at
  `settled`.
- **Documents changed:** `CLAUDE.md`, `03-permissions-rls.md` §8.2, `TEAM.md` (new),
  `STATUS.md`

## DEC-041 — Settings correction: branch switching is the lead's; merging is the owner's

- **Date:** 2026-09-14 · **Decided by:** owner (merged PR #10 by hand when the deny rule stopped the session)
- **Decision:** the shared settings deny `gh pr merge` to **every** session, including the lead:
  **the owner merges**, on GitHub or in their own terminal. `git checkout main` and
  `git switch main` are removed from the deny list — the lead must return to `main` between waves
  and cut the next wave branch; the `CLAUDE.md` rule (teammates never switch branches) carries the
  intent that the deny rule cannot express per agent. `git fetch`, `git pull --ff-only`,
  `git checkout`, `git switch` and pushes to non-`main` branches are allowed explicitly.
- **Rationale:** DEC-040's first deny list was written for teammates and then blocked the lead's
  own hand-off steps the same day. Settings are per checkout, not per agent; anything that only
  the lead may do is a rule in `CLAUDE.md`, and only the actions no session may ever take belong
  in the deny list.
- **Supersedes:** the settings paragraph of DEC-040 for those two commands.
- **Documents changed:** `CLAUDE.md` § Agent team, `.claude/settings.json`

## DEC-042 — Wave 1: `sessions` owns the M2 admin surfaces for proposals, sessions and venues; `console` inherits them at wave 3

- **Date:** 2026-09-14 · **Decided by:** session (the wave-1 lead), on the `sessions` teammate's finding
- **Decision:** for the duration of wave 1, the `sessions` teammate's globs extend to
  `src/app/[locale]/app/admin/{proposals,sessions,venues}/**` and `src/messages/{ar,en}/admin.json`
  (the `admin` namespace name in `src/messages/index.ts` included). STORY-PRO-003 (admin review),
  STORY-SES-001 (schedule and publish), STORY-SES-002 (the state machine) and STORY-SES-004
  (venues) are M2 stories on the `sessions` track whose screens — SCR-041, SCR-042, SCR-043,
  SCR-046 in `09` — live under `/app/admin`. At wave 3 the `console` teammate inherits those
  folders as working screens; its `TEAM.md` §1 row already says `app/admin/**`, so no later edit is
  needed. The other admin folders (`categories`, `companies`, `members`, `domains`, `settings`,
  `moderation`, `exports`, `audit`) stay untouched until wave 3.
- **Also corrected:** the screen numbers in the three agent definitions were drafted before `09`
  was finalised. `09` owns the SCR ID space: the event page is **SCR-012**, check-in is
  **SCR-014**, the host view SCR-016, rate SCR-015, propose SCR-017, my proposal SCR-018.
- **Rationale:** the wave gate is the M2 demonstrable — propose → approve → schedule → publish →
  … — and approve and schedule are admin screens. Deferring them to wave 3 would mean driving the
  demonstrable from SQL, which proves the database and not the product, and would leave `console`
  to build M2 behaviour it did not design. The path split is disjoint from every other wave-1
  glob, so the ownership rule (one writer per path) still holds.
- **Supersedes:** the wave-1 row of the ownership map in `CLAUDE.md` § Agent team and `TEAM.md`
  §1, for these paths only.
- **Documents changed:** `CLAUDE.md` § Agent team, `TEAM.md` §1, `.claude/agents/{sessions,checkin}.md`,
  `STATUS.md`

## DEC-043 — A write-then-maybe-refuse RPC returns an outcome envelope; it never raises after its first write

- **Date:** 2026-09-14 · **Decided by:** session (the wave-1 lead), on the `checkin` teammate's finding
- **Decision:** `check_in()` (migration `0015`) returns a JSON envelope `{status, check_in?,
  conflict_session_id?}` for every outcome downstream of the `check_in_attempts` insert —
  `ok`, `already_checked_in`, `rate_limited`, `invalid_code`, `revoked`, `not_started`,
  `session_ended`, `overlap`, `presenter` — and raises only for `not_found`, before anything is
  written. The same rule applies to every future RPC whose contract is "record the attempt, then
  decide": `promote_next_waitlisted`, the M4 `award_points` path, the M5 upload finaliser. The DAL
  maps `status` to the screen state; the app never branches on a SQLSTATE for these outcomes.
- **Rationale:** `03` §5.4's sketch wrote the attempt row and then `raise exception 'rate_limited'`
  in the same call. In Postgres one RPC call is one statement is one transaction, and an exception
  rolls back everything the call did — including that insert — so the "attempt is still recorded"
  clause of `REQ-CHK-006` was unsatisfiable as sketched, in production exactly as much as in the
  RLS harness. `provision_member()` (`0005`) already uses the envelope shape for the same reason.
  The rejected alternative, a subtransaction (`begin … exception when others`) around the insert,
  keeps the raise but costs a savepoint per attempt on the product's hottest write path and hides
  the rule instead of stating it.
- **Also:** a repeat check-in returns `already_checked_in`, not `ok`, because `09` SCR-014 specifies
  "already checked in" as its own screen state.
- **Supersedes:** the `raise` in `03` §5.4's `check_in()` sketch and the wording of the
  `POL-check_ins.rate_limit` and `POL-check_ins.single_use` rows in §8.2.
- **Documents changed:** `03-permissions-rls.md` §8.2, `STATUS.md`

## DEC-044 — Realtime host topics are org-scoped; admin per-rater ratings reads go only through the audited RPC

- **Date:** 2026-09-14 · **Decided by:** session (the wave-1 lead), on the `event` teammate's two findings
- **Decision 1 — host topic:** `realtime_host_select` (migration `0016`) requires the session named
  in `host:{id}` to belong to the caller's org before the staff-or-presenter disjunct is consulted.
  `03` §7.2's sample policy had no org check, so any org's staff could have read another org's
  check-in counts. The sample is corrected in place.
- **Decision 2 — ratings:** `0010`'s `ratings_read_admin` policy is **dropped** in `0017`.
  `REQ-RAT-005` requires the admin's per-rater read to be audited; RLS cannot leave an audit row
  as a side effect of a select, so a direct policy is an unaudited path by construction. The only
  admin path is `list_session_ratings_admin()`, a `security definer` RPC that re-checks admin
  freshness, writes one `audit_log` row, and returns the rows. An admin selecting the table gets
  zero rows, like a presenter. The aggregates view and the self policies are untouched.
- **Also promoted:** `delete_own_comment()` (`0018`) — `comments_update_own` gated a self-delete
  behind the same 15-minute window as a body edit, making `REQ-EVT-005` unreachable past it — and
  `session_rating_count()` (`0019`) for the bare count `REQ-RAT-006` shows below the minimum.
- **CI:** `scripts/ci/roles.sql` gains the `realtime` schema, `realtime.messages` and
  `realtime.send()` (Supabase's own body), mirroring local Supabase, because the bare container
  has none of them and the first CI run of the Realtime tests failed with `3F000`.
- **Rationale for dropping rather than keeping the policy "for the dashboard":** an access path
  that exists only to be avoided by convention is the pattern `12` §2 calls out; the policy-diff
  gate cannot see a `drop policy`, so `03` §5.6 records the drop in prose where the policy stood.
- **Supersedes:** the `realtime_host_select` sample in `03` §7.2; the `ratings_read_admin` block
  in `03` §5.6; the `POL-ratings.select.admin` row in §8.2.
- **Documents changed:** `03-permissions-rls.md` §5.6, §7.2, §8.2; `scripts/ci/roles.sql`; `STATUS.md`

## DEC-045 — Wave 1 closing decisions: the PRD's ordering on the event page, the publish chain, the deferred guard, and the team's working rules

- **Date:** 2026-09-14 · **Decided by:** session (the wave-1 lead), closing wave 1
- **`09` SCR-012 follows `REQ-SES-011`.** The PRD says the spoken language appears before the RSVP
  action; `09` had the action at 3 and the language at 5. Only `01` may define a requirement, so
  the built page puts the language above the action and `09`'s list is corrected and renumbered
  rather than overridden in silence.
- **`09` SCR-012's sticky action is desktop-only.** `09` asked for the primary action pinned in
  the thumb zone through the whole scroll; at 390 px the RSVP panel is ~380 px tall and pinning it
  covered the language row `REQ-SES-011` requires above it. On mobile the panel is in flow at
  position 4 (inside the first screenful, nothing covered); on desktop it stays the sticky rail.
  A y-coordinate assertion alone did not catch this — the row was *under* the panel — so the
  390 px review also asserts the row is not occluded.
- **`09` SCR-043's "date-time picker runs right to left" is not honoured in M2.** A native
  `datetime-local` renders its placeholder and calendar in the browser's locale; the only literal
  fix is a custom picker, which M2 does not budget. Backlog item for M7-console; `09` notes it.
- **`publish_session()` walks `02` §6.2's whole chain** from `draft` to `published` and writes one
  transition row per edge, all flagged manual and attributed to the admin, instead of jumping.
  The audit trail shows the path the state machine defines even when a person pressed one button.
  `review_proposal()` does the same through `in_review` (`0013`).
- **No table-level guard on `sessions.state` in wave 1.** `sessions.state` is in no grant, so
  every writer is a definer function the sessions track owns and there is no PostgREST path to the
  column; a trigger would also start refusing the direct `update … set state` that fixtures in
  all three tracks use to arrange scenarios. It is the stronger statement and is the **first
  migration of wave 2**, written before any teammate is spawned, with the fixtures moved to the
  RPCs at the same time.
- **Deferred, not faked:** `REQ-PRO-004` (draft materials on a proposal — M5's `materials` table);
  the poster gate of `REQ-SES-001` (M6's designer; the other five gates are `0010`'s check
  constraint, and SCR-043 says the poster is coming); `REQ-EVT-007` reply notifications (M3's
  `notifications` table); job enqueueing from the RSVP and check-in RPCs (`graphile_worker` schema
  does not exist on local Supabase until the worker is hosted, OQ-027 at M3 — the call sites are
  marked). `STORY-CHK-005`'s four rights derive from `has_checked_in()`, which exists; the tables
  they gate arrive with M4 and M5.
- **`audit_log.occurred_at` stays `now()` this wave.** Rows written by one transaction share an
  instant and their order is undefined; `clock_timestamp()` fixes it but `02` is frozen. Decide at
  the start of wave 2 with the `sessions.state` guard.
- **Working rules** added to `TEAM.md` §3 and §5: commit with an explicit pathspec; the RLS suite
  is single-runner; the build is the only gate for `"use server"` exports and namespace JSON;
  slots render no heading; the wave PR opens as a draft at the first push; React 19 form reset;
  the envelope rule; three e2e traps (no member row before first sign-in, the route announcer's
  `role="alert"`, two Playwright projects on one database). Each was learned by breaking
  something this wave.
- **Supersedes:** the SCR-012 list in `09` (settled document, changed under this entry);
  `TEAM.md` §3 and §5 (settled, extended under this entry).
- **Documents changed:** `09-sitemap-screens.md` SCR-012, `TEAM.md` §3, §5, `STATUS.md`

---

## DEC-046 — The session edge set is a table trigger; evidence tables timestamp per statement; wave-2 standing decisions from the owner

- **Date:** 2026-09-14 · **Decided by:** session (the wave-2 lead) for the guard and the clock; **the owner** for OQ-027 and email transport
- **Decision 1 — `sessions.state` is guarded by the table.** Migration `0024` adds
  `sessions_guard_transition`, a `before update of state` trigger accepting exactly `02` §6.2's
  edges and refusing every other change of state with `23514`, for every writer including the
  migration owner and `service_role`. It is the migration DEC-045 deferred to "the first of wave
  2". There is **no insert guard**: a row is born with a state and no edge, `create_session()` is
  the only door for people, and the wave-1 fixtures and e2e seeds insert published and completed
  rows to arrange history. The fixtures that *updated* `state` directly now walk legal edges
  (`tests/rls/sessions-{creation,scheduling}.test.ts`); the new `tests/rls/sessions-guard.test.ts`
  proves the edge set, the RPCs through it, and the ordering below.
- **Decision 2 — `02` §6.2 gains four edges back to `draft`:** from `submitted`, `in_review`,
  `changes_requested` and `approved`, labelled "presenter declines". `01`'s `REQ-PRO-007` says a
  decline "returns the session to `draft`" and migration `0020` implements it; a strict guard would
  have broken the decline silently. Only `01` defines requirements, so the frozen diagram is
  amended under this entry rather than the guard permitting an undrawn edge. A published session is
  not returned to draft by a decline (people hold seats; `REQ-SES-009` is the path).
- **Decision 3 — append-only evidence tables default `occurred_at` to `clock_timestamp()`.**
  `now()` is the transaction's start, so `publish_session()`'s four transition rows and one audit
  row shared an instant and tests ordered by `ctid`, which is not evidence. `0024` moves the
  default on `audit_log` and `session_state_transitions`; `points_ledger` (M4) is created with it.
  Indexes are unchanged. `02` §4.3 and §4.16 are corrected under this entry.
- **Decision 4 (owner) — OQ-027 is closed for wave 2 without a host.** The worker stays a
  host-agnostic Docker image running locally and in CI; the production host is decided at Launch
  with PR C. **Nothing in wave 2 waits on hosting.** Consequence for the `notify` and `scoring`
  tracks: the `graphile_worker` schema must exist wherever the RLS suite runs, because
  `reserve_seat()`, `check_in()` and the M3/M4 RPCs enqueue from SQL (`02` §4.17). The lead
  installs it with `graphile-worker --schema-only` after `supabase db reset` locally and after the
  migrations in CI's `rls` job; an RPC that enqueues does so through one wrapper,
  `public.enqueue_job(name, payload, key)`, so a missing schema fails loudly in one place.
- **Decision 5 (owner) — email in development and CI never reaches a provider.** The worker's
  mail transport is an interface with two implementations: a **sink** (local Supabase's Mailpit on
  `:54324` via SMTP in development; an in-memory transport the tests read back in CI) and Resend,
  which is wired at Launch. `RESEND_API_KEY` stays unset everywhere until then; `04` §10 is
  unchanged. `email_deliveries` rows are written by the sink exactly as by Resend, so `REQ-NTF-008`
  is testable now.
- **Rationale:** the guard is the stronger statement 0023 asked for; the decline edge is the PRD's;
  per-statement clocks make the log readable as a sequence, which is what an audit log is for;
  the hosting and transport decisions remove the only two things that could have blocked M3.
- **Supersedes:** the "no table-level guard in wave 1" and "`occurred_at` stays `now()`" paragraphs
  of DEC-045; the default in force under OQ-027 ("decide the host at the start of M3").
- **Documents changed:** `02-domain-model.md` §4.3, §4.16, §6.2 (frozen, changed under this entry);
  `03-permissions-rls.md` §5.2, §8.2; `OPEN-QUESTIONS.md` OQ-027; `STATUS.md`; `TEAM.md` §1 (at wave start)

---

## DEC-047 — Wave 2 closing decisions: the promotions' amendments to frozen and settled documents, the plan gaps the code found, and the team's working rules

- **Date:** 2026-09-14 · **Decided by:** session (the wave-2 lead), closing wave 2; the owner for the Launch inputs
- **`02` amendments (frozen, changed under this entry):** `email_deliveries.notification_id` and `notification_preferences.updated_at` (both additive, `0026`); `sessions.search_vector` — a generated `tsvector` over `ar_normalize(title, abstract)` with a GIN index and a trigram index (`0037`, `REQ-DSC-003`); `reports.photo_id` gains its foreign key (`0037`); `points_ledger.occurred_at` defaults to `clock_timestamp()` as DEC-046 decided.
- **`08` corrections (settled):** §1.7 lists seventeen keys under a heading that says eleven — the list is authoritative and the matrix in `0026` carries all seventeen; §3.2 lists 22 templates for 24 messages with an email channel — `MSG-proposal_submitted` and `MSG-presenter_assigned` gain defaults, and `tests/unit/mail-render.test.ts` diffs the template file against the matrix in the migration; §1.2's three reminder messages against `reminder_offsets_minutes` as a free `int[]` — `reminder_message_key()` picks the nearest by magnitude, and a fourth, offset-agnostic message is the honest fix, left to M7-console; `MSG-rsvp_deadline_soon` (§1.3) has no job in `11` — unimplemented, not faked.
- **`07` §9.2 amendment (settled):** `process_photo` strips EXIF/XMP/ICC by removing the segments in place (JPEG APP markers, PNG ancillary chunks, WebP RIFF chunks) and asserts on the stored bytes; no image library enters the worker and the converter gains no endpoint. WebP re-encoding through the converter is a later size optimisation, not a correctness requirement.
- **The append-only guards are table triggers with one legitimate delete:** `points_ledger`, `leaderboard_snapshots` and `leaderboard_entries` refuse update and delete for every writer including the owner (`0027`, the `members_org_immutable` pattern), and let an org deletion cascade through because the parent row is already gone. `calendar_disconnected()` (`0038`) skips when the member is gone for the same reason.
- **`sessions.state` and `proposals.state` are the tables' edge sets**, and a wave-2 track hooks into M2 by SQL only: a trigger on the table (`0029`, `0031`, `0039`), or a `create or replace` of an M2 RPC at its marked call site (`0028` on `check_in()`, `0045` on `reserve_seat()` — flagged, since no marker existed there: a gate that changes the accept/reject decision cannot be a trigger). Nothing in wave-1 app code was edited by a wave-2 track; the lead edited three wave-1 DAL DTOs for the numerals fix and one wave-1 test helper.
- **The priority RSVP window exists only while the org's `priority_rsvp` perk is enabled, and the perk ships disabled** (`0045`, `0027`). OQ-012's default of 24 hours applies once an admin turns it on; with nobody holding the perk a window only closed general RSVP for a day after every publish, which every M2 flow — the demonstrable included — contradicts.
- **`remove_material()` (`0037`)** exists because a row an UPDATE produces must still satisfy the table's SELECT policy, and `materials_read` requires `removed_at is null`; the same reason `delete_own_comment()` exists (DEC-044). `removed_at`, `removed_by` and `removal_reason` leave the client column grant.
- **`public.enqueue_job()` and `public.cancel_job()` are the only doors to the queue** (`0025`, `0034`); the `graphile_worker` schema is installed wherever the suite runs (`scripts/rls.mjs`, `npm run db:reset`, CI's `rls` job), and `npm run db:reset` holds `/tmp/db-reset.lock` while the runner waits on it.
- **Numerals follow the org setting** (`REQ-INT-006`): `NumeralSystem` spells the enum's value `arabic_indic` (the shared type and three wave-1 DTOs spelled `arabic`, so Arabic-Indic orgs silently got Western digits); no literal digit of either system in an Arabic catalogue, every interpolated value inside `<bdi>` — `tests/unit/<track>-i18n.test.ts` per track; `min-h-*` on any cell whose Arabic label can wrap.
- **The path builder is a workspace package**, `@kareem/storage-paths`, imported by the app and the worker (the DEC-029 pattern), not a port.
- **Launch inputs recorded, not decided here:** the Google OAuth client with calendar scopes and its secret on Vercel for the callback's code exchange (not `service_role`; reasoning in `src/app/api/calendar/oauth.ts`), the Resend account; the production host for the worker image (DEC-046).
- **Working rules** added to `TEAM.md` §3 and §5: the runner check is `pgrep -fl "node_modules/.bin/vitest"` (the old grep matched other agents' waiting shells); never save a failing test under `tests/rls/` — `describe.skip` until green; a test may guard `applyProposed()` with `existsSync` so a promotion mid-session does not turn it red; the promotion commit `git rm`s the proposed path (tracked copies made CI apply `0039` twice); a namespace's JSON and its `index.ts` line go in one commit (CI's build failed twice on `./ar/materials.json`); an orphaned `next start` from an earlier session (`ppid 1`, no gate lock) can hold port 3000 — `pgrep -fl next-server`; the 390 px capture measures overflow against the layout viewport (the RTL scrollbar sits on the left); messages between agents arrive out of order — restate facts with a verifiable command; a Sonnet teammate idles at "checkpoints" — its task ends at the last story, and the lead re-drives it with that sentence.
- **Supersedes:** the `08` §1.7 heading, §3.2 count and §1.2 reminder set; `07` §9.2's WebP re-encode; `02` §4.3, §4.6, §4.7, §4.14 column lists as amended above.
- **Documents changed:** `02-domain-model.md`, `07-content-pipeline.md`, `08-notifications-calendar.md`, `TEAM.md` §3, §5, `OPEN-QUESTIONS.md` OQ-012 (note), `STATUS.md`

---

## DEC-048 — Wave 3: the engine stays DOM/SVG with Chromium exports; the console half that needs templates waits for wave 4; SCR-011 is `console`'s; the path builder is a package and the worker image carries the renderer

- **Date:** 2026-09-14 · **Decided by:** the owner for the engine and the console split; session (the wave-3 lead) for the assignments and the pre-spawn work
- **Decision 1 (owner) — the designer engine is settled as the parity harness proves it.** DOM/SVG in the editor, headless Chromium in the worker image, Tier A parity on every render (D66, A28, DEC-024, DEC-028). No raster canvas, no HarfBuzz fallback (A28's fallback clause is not exercised), no render route in the Next app (`04` §7.4). M6 builds on `@kareem/designer-runtime` and `scripts/parity/` as they stand.
- **Decision 2 (owner) — the console half that needs templates waits for wave 4.** Wave 3's `console` takes `REQ-ADM-004` … `012`, `014`, `016` … `018`, `020` and SCR-044; `REQ-ADM-013` (template management) is `designer`'s with SCR-055/056; `REQ-ADM-015` (branding, SCR-059), `src/lib/brand/**` and the platform library (SCR-083) are wave 4's. `designer` resolves `{{brand.*}}` from the platform defaults until then (`06` §8.3).
- **Decision 3 — SCR-011 (`/app/sessions`, browse) is `console`'s first story.** Wave 1 never built it (STATUS, wave-2 sync 12). `console` owns every list, filter and table surface this wave and inherits the admin session list, so the member-facing browse page is its nearest surface; `designer` supplies the poster on each card through the `SessionPoster` slot. The page edits only `src/app/[locale]/app/sessions/page.tsx`, calls `searchSessions()` and renders `content`'s `<SearchFilters>` and `<BookmarkButton>` unchanged.
- **Decision 4 — `console` inherits the seven carved-out admin screens** (`proposals`, `sessions`, `venues` from DEC-042; `scoring`, `recognition`, `emails`, `reminders` from DEC-046) and the three carried-over items: the RTL date-time picker on SCR-043 (DEC-045), the member picker on SCR-053's adjustment form (`notes/scoring.md`), and `08`'s fourth, offset-agnostic reminder message (DEC-047). Three folders inside `app/admin/**` are `designer`'s: `designer/`, `templates/`, `sessions/[id]/certificates/`.
- **Decision 5 — the path builder is the workspace package `@kareem/storage-paths`** (DEC-047 recorded it; commit `7c5e280` did it). The app imports it through `src/lib/storage/paths.ts`, which keeps `server-only`; the worker imports it directly; the wave-2 port and its parity test are gone. The M6 shapes sit in `src/designer.ts`, the one file in the package `designer` may edit. Workspace packages build from a root `prepare` — npm runs a linked workspace's own `prepare` inside `npm ci --workspace` even under `--ignore-scripts`, before an image has copied the sources.
- **Decision 6 — the worker image carries Chromium, the runtime and the font set before M6 starts**, not after: Debian's `chromium` at `CHROME_PATH`, `puppeteer-core`, `@kareem/designer-runtime`, and `packages/fonts` installed through the same hash-verified step the converter image runs (`REQ-DSG-016`). CI runs the parity harness inside the image on every push (`CHROME_NO_SANDBOX` inside the container only). Verified locally: 1.42 GB, probe OK, seven cases Tier A identical, Tier B 0.4–2.8% drift as DEC-028 measured. Debian's `chromium` pulls DejaVu in as a dependency; the renderer inlines faces by SHA-256 so no export ever falls through to it, and `fonts:check` still governs `packages/fonts` alone.
- **Decision 7 — the M5 pipeline ran once for real before M6 builds on it** (STATUS's item 4): the converter and worker images on the local Supabase network with `CONVERTER_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; two real decks (`converter/fixtures/{plex-arabic,cairo-missing}.pptx`) uploaded to the `materials` bucket and enqueued through `public.enqueue_job()`. Both reached `render_status = ready` with one `material_pages` row each; the Cairo deck's material carries `font_substitution_warning = 'Cairo'` (`REQ-MAT-011`). Nothing in M5 needed a change.
- **Decision 8 — the stale notes.** `notes/scoring.md`'s warning that four evaluators are unregistered no longer holds (all four are in `worker/src/index.ts`'s `taskList` and crontab). The three `TODO(notify, M3)` comments in `0014` and `0045` stay as they are (forward-only); both spawn prompts say so.
- **Rationale:** the engine question was the one that could have restarted M6 from zero, and the harness had already answered it; splitting the console along the template dependency lets M7's CRUD, moderation, exports and audit ship a wave early; SCR-011 needs an owner whose other work is list-shaped; a real M5 run costs an hour and finding a broken page pipeline under M6 costs a wave.
- **Supersedes:** the `designer`/`console` draft rows of TEAM.md §1 (waves 3–4); nothing in DEC-047 (Decision 5 executes its last bullet).
- **Documents changed:** `TEAM.md` §1 (wave-3 rows, contracts, wave-4 draft), `CLAUDE.md` § Agent team (wave-3 map), `.claude/agents/{designer,console}.md` (new), `worker/Dockerfile`, `.github/workflows/ci.yml`, `STATUS.md`

---

## DEC-049 — Wave-3 sync 1: `fonts` is the fifth table without `org_id`; the fourth parity export path is the converter's slide pages, skipped loudly when unconfigured

- **Date:** 2026-09-14 · **Decided by:** session (the wave-3 lead), promoting `designer`'s M6 schema as migration `0055`
- **Decision 1 — `ENT-fonts` carries no `org_id`.** `02` §4.13 already gave it none and made `sha256` platform-wide unique; `06` §6.4 and §7.3 make the point of the table that the editor, the worker's Chromium and the worker's LibreOffice read the same bytes, and `03` §6 leaves the `fonts` bucket un-prefixed for the same reason. A per-org font table would contradict both and produce three copies. `02` §7 (frozen) gains the fifth exception under this entry; `tests/rls/isolation.test.ts` lists `fonts` in `NO_ORG_ID` and in the non-vacuity exclusion; the read policy is `fonts_read` (every member), the write path is the job alone. CLAUDE.md's invariant 5 ("four documented exceptions") is updated to five with this entry.
- **Decision 2 — the parity suite's fourth export path is the converter's slide-page images**, as `06` §9.2 lists, exercised by posting a generated deck to `CONVERTER_URL`; when the variable is unset the harness reports "21 of 28 — converter path not configured" and passes on 21 **loudly**, never silently. CI's `worker` job starts `kareem-converter` beside the worker image so CI runs all 28. The alternative — a certificate PNG as the fourth path — would have measured a rasteriser twice and slide shaping never.
- **Decision 3 — the M6 fixture** (`tests/rls/fixture-m6.ts`): one platform poster template and version and one platform font row once; per org a certificate template and version, an asset, a poster document bound to the published session with its poster row and one ready artifact, one issued presenter certificate for `members[0]` on the completed session, and the counter row issuance leaves behind. A per-policy case counts by id or clears its tables in `setup()`.
- **Rationale:** the schema is `02`'s as frozen; the one departure it needed (`fonts`) is the model's own intent written down; the export-path question was the only place the plan and the images disagreed, and the honest answer is the one that measures shaping where shaping happens.
- **Supersedes:** the "four exceptions" count in `02` §7 and CLAUDE.md invariant 5.
- **Documents changed:** `02-domain-model.md` §7 (frozen, changed under this entry), `03-permissions-rls.md` §8.2 (+16 rows), `CLAUDE.md` invariant 5, `TEAM.md` (nothing), `STATUS.md`

---

## DEC-050 — Wave 3 closing decisions: the promotions' amendments to frozen and settled documents, the gaps the code found, the two demonstrables as run, and the team's working rules

- **Date:** 2026-09-14 · **Decided by:** session (the wave-3 lead), closing wave 3; the owner's two standing decisions are DEC-048's
- **`02` amendments (frozen, changed under this entry):** `comments.removal_reason` and `photos.removal_reason` (additive, `0059`, `REQ-EVT-014`); `design_documents.draft_for_template_id` and the rewritten one-binding check (`0057` — a template is edited through a working document and published as the next version, because a published version has no update grant); `export_artifacts.render_context` (`0060`, the pinned faces and bindings a render is reproduced from); the additive columns of `0064` on `fonts`; `sessions` gains no column — posters hang off `session_posters` as §4.13 drew them.
- **`08` amendment (settled):** §1.2 gains the fourth, offset-agnostic reminder `MSG-reminder_generic` (category `reminders`, in-app + email) for any org offset outside ±20% of the three fixed ones, and §3.2 its template — DEC-047's "honest fix", built as `0062`.
- **`09` amendment (settled):** SCR-054 hosts the release of HELD achievement certificates (`HeldAchievements`). `REQ-CRT-012` says an admin releases a leaderboard certificate; SCR-045 is per session and an achievement certificate has no session, so as drawn they would sit held forever. SCR-043 gains the poster section (the three paths of DEC-012) and the RTL date-time picker DEC-045 deferred; SCR-011 exists at last.
- **Two readings of `REQ-CRT-012` (designer's, accepted):** "top 3 annual" is any FINAL member-ranked snapshot (`leaderboard_kind` has no annual member; topic boards are excluded), and a badge certificate issues outright while a snapshot one is held, because the requirement says "released by an admin" of the leaderboard case only.
- **`03` §5.9 amendment:** every trigger that enqueues or notifies is `security definer set search_path = ''` and its RLS case drives it as a member — `0063`'s two poster hooks were promoted with that change after three wave-1 cases turned red ("permission denied for function enqueue_job" on a presenter's own title edit); `0065`'s completion hook and `0066`'s two achievement hooks were written that way. `public.fonts` is revoked from `service_role`; the worker reads it as the owner, and a future job running as `service_role` would need the grant — recorded, not granted.
- **Render concurrency is 1, not `11` §1.4's 2.** `request_render()` enqueues on the named queue `render`, and a graphile-worker named queue runs one job at a time; two is two queue names chosen by hash in the SQL, not a second process. Serial is the safe side for Chromium memory under concurrent A3 renders (`14`'s named risk) and stays until a measured need.
- **The font set is 21 faces / 12 TrueType** (Reem Kufi 400–700 and Amiri 400/700 joined Plex): a VARIABLE face is instanced at its manifest weight before the subsets merge (`fontTools.varLib.instancer`), so the Plex TrueType hashes changed while the woff2 faces the editor and Chromium load did not. A `unicode-range` on one subset of a two-file family sends Arabic to a system font while `document.fonts.check()` says true — shipped in DSG-003, caught by DSG-008's comparative gate, reverted; the harness's own layout was insensitive to it (Tier B 0.000% both ways). A font assertion that is not a comparison between two measured strings is not an assertion.
- **The parity suite is 28 of 28** — seven cases × poster PNG, poster PDF (print emulation), certificate PDF (Amiri) and the converter's slide-page images, the last skipped LOUDLY when `CONVERTER_URL` is unset; CI's worker job runs the converter beside the image on the host network and passes all 28. The goldens moved twice this wave, both reviewed diffs (`eb4f0d0`, `150a166`).
- **The two demonstrables, as run.** M6 (`scratchpad/m6-demo.sh`, STATUS sync 12): publish → 12 of 12 variants with Tier A; detach one-way, a later edit marks stale and re-renders nothing; completion with a check-in issues attendance and presenter certificates with consecutive serials from the locked counter; the code verifies for `anon`, the serial does not; the presenter's A4 certificate PDFs rendered. **Not closed by a machine:** scanning both QRs on paper at print size (nothing in this repository has ever decoded one of its symbols) — an owner check for Launch, beside notify's open-the-ICS-in-Outlook. M7 (`tests/e2e/second-org.spec.ts`): two orgs with real users, each admin walks the dashboard, members, sessions, categories, the audit log, browse and the members export and sees nothing of the other; a member of A opening B's session by id gets the not-found boundary; the RLS sweep stays the per-table proof.
- **Found by running rather than reading, all fixed:** the attendance report and two CSV exports crashed on an ambiguous PostgREST embed (two FKs into `members`); every first bookmark was `42501` because an upsert compiles to `ON CONFLICT DO UPDATE` on a table with no update grant; the M5 host-view function was reused for the admin's manual mark and never listed a waitlisted walk-in; the automatic poster path pinned no faces because `public.fonts` holds only materialised fonts; a layer's own `locked` flag did not bind the editor; the QR encoder's generator polynomial was reversed and its dark module cleared by its own reservation; `/verify/[code]` served a 500 on the unconfigured live site because a public route sits outside `isPlatformPath` (it now answers `notFound()`; widening the proxy predicate is the wave-4 lead's).
- **Left open, named:** the issuance path writes more certificate artifact rows than it enqueues render jobs (STATUS sync 12; `designer`'s last item); render concurrency above; the `fonts` grant; the proxy predicate; the QR scan.
- **Working rules** added to `TEAM.md` §5: the 390 px review is phone-project only and its helper asks whether the page scrolls before naming an offender; the runner guard brackets its first letter; a trigger that enqueues or notifies is a definer tested as a member; role names match substrings (`«سبتمبر»` contains `«تم»`); mobile emulation keeps the focused field in view; an unscoped emptiness assertion on an append-only table fails after the first e2e run; a DAL and the component that reads it commit together; run every image-backed pipeline once for real before the wave that builds on it.
- **Supersedes:** DEC-047's "the path builder is a workspace package" bullet (done, `7c5e280`); `11` §1.4's render concurrency of 2 (deferred, above); `09`'s placing of the achievement release on SCR-045.
- **Documents changed:** `02-domain-model.md` §4.6, §4.7, §4.13 (frozen, under this entry), `03-permissions-rls.md` §5.9, §8.2 (+45 rows this wave), `08-notifications-calendar.md` §1.2, §3.2, `09-sitemap-screens.md` SCR-043, SCR-054, `11-background-jobs.md` §1.4 (note), `TEAM.md` §5, `CLAUDE.md` invariant 5 (DEC-049), `STATUS.md`

---

## DEC-051 — Wave-4 pre-spawn: the proxy gates every public platform route, `fonts` grants `service_role` a read, no session changes repository or GitHub settings, render concurrency stays serial, the repository stays public until Launch, and the history holds no secret

- **Date:** 2026-09-14 · **Decided by:** the owner for decisions 1, 2 and 5; session (the wave-4 lead) for 3, 4 and 6, doing DEC-050's open items before anyone is spawned
- **Decision 1 (owner) — render concurrency stays serial until measured.** `request_render()` keeps the single named queue `render`; `11` §1.4's 2 stays deferred. The wave that measures a need (queue age on `render` under a real publish burst) proposes the hash-split into two queue names; nobody raises it on reasoning alone.
- **Decision 2 (owner) — the repository stays public until Launch.** Nothing in the tree is a secret (decision 6), the plan is the product's documentation, and visibility is the owner's setting, not a session's (decision 5). Revisited at Launch, by the owner.
- **Decision 3 — the proxy's unconfigured gate names every platform route.** `src/lib/auth/next-path.ts` gains `isPublicPlatformPath()` (`/{locale}/verify/**`, `/{locale}/legal/**` — the two public platform screens of `04` §4, SCR-005 and SCR-006) and `isUnconfiguredGatedPath()` (platform ∪ auth screens ∪ public platform). `proxy.ts` answers 404 for all of it while `NEXT_PUBLIC_SUPABASE_*` are unset (DEC-038) and gives the public routes the platform's CSP nonce; the sign-in redirect stays on `isPlatformPath()` alone — a stranger holding a printed certificate is never sent to sign in. `/verify/[code]`'s own `notFound()` guard stays as defence in depth. `tests/e2e/unconfigured.spec.ts` asserts the two new paths; the frozen routes are untouched (`npm run qa`, `npm run visual`). The alternative — every future public page guarding itself, as wave 3 had to — is the bug DEC-050 recorded.
- **Decision 4 — `0067` grants `select` on `public.fonts` to `service_role`.** Read only. `0055` revoked everything and the worker reads the manifest as the migration owner, so nothing failed; but wave 4's `assert_storage_prefixes` and the retention job walk every bucket through the service-role client, and a job reading `fonts` that way would fail `42501` behind a policy that looks correct — invariant 6, `0002`'s lesson. The write path stays `record_font()` alone (`0064`); `POL-fonts.select.service_role` proves the read and the three refused writes. `03` §5.9 and §8.2 carry the row.
- **Decision 5 (owner) — no session changes repository visibility, billing, organisation or GitHub settings.** `CLAUDE.md` § Git in a shared tree states it; `.claude/settings.json` denies `gh repo edit|archive|unarchive|rename|transfer|set-default|deploy-key`, `gh api`, `gh secret`, `gh variable`, `gh ruleset`, `gh org`, `gh workflow enable|disable`, `gh extension`, and `git remote set-url|remove|rm|rename`; TEAM.md §4's constraint 6 and both wave-4 agent definitions repeat it. A task that seems to need one of these stops and asks the owner.
- **Decision 6 — the full history holds no secret; recorded so nobody re-scans on a hunch.** Every ref (8), every commit (335), every added line and every path that ever existed, scanned for Supabase secret and access tokens, service-role JWTs, JWTs of any kind, Resend, Google OAuth, Sentry, Vercel, GitHub, Slack, AWS and Anthropic key shapes, private-key blocks, database URLs with credentials, and secret-bearing file names. Findings: the only env-shaped file ever committed is `.env.example` with placeholders; 45 pattern hits, all of them the local Supabase default `postgres:postgres@127.0.0.1` / CI-container connection strings, the `pooler-dev` local URL, `u:p@db.example` in the probe tests and `re_live_key` / `re_test_key` placeholders in the mail-transport tests; zero JWTs, zero `sbp_`, zero private keys. The project ref in `CLAUDE.md` is an identifier, not a credential. The scan script lives in the session scratchpad, not the repository; a re-run is `git log --all -p` piped through the same patterns.
- **Also done before spawn:** the two 390 px captures DEC-050 said to retake (`scr-023-certificates`, `scr-045-certificates`) were retaken on a fresh build with `ca10bd8`'s `break-all` in it and looked at — the 24-character code wraps inside its card, nothing sits past 390 px on either screen.
- **Rationale:** the four open items of DEC-050 that were the lead's are cheap alone and expensive under a running wave (the proxy is a lead-only file, the grant is a migration, both would otherwise become a sync-point interruption); the settings rule closes the one class of action the deny list did not name; the scan is what "the repository stays public" rests on.
- **Supersedes:** DEC-050's "left open, named" for the proxy predicate and the `fonts` grant; nothing else.
- **Documents changed:** `CLAUDE.md` (§ Agent team wave-4 map — proposed, § Git in a shared tree), `TEAM.md` §1 (wave-4 rows and contracts — proposed, pending the owner), §4 constraint 6, `.claude/settings.json`, `.claude/agents/{platform,branding}.md` (new), `03-permissions-rls.md` §5.9 and §8.2, `supabase/migrations/0067_fonts_service_role_grant.sql`, `src/proxy.ts`, `src/lib/auth/next-path.ts`, `STATUS.md`

---

## DEC-052 — Wave 4 confirmed: `platform` and `branding` as proposed, with the A27 baseline seeded as platform-owned templates for every org from creation; `delete_org` joins `11`; `brand_kits` amends `02` §4.13

- **Date:** 2026-09-14 · **Decided by:** the owner (the ownership and the A27 amendment); session (the wave-4 lead) for the two document amendments the confirmation carries
- **Decision 1 (owner) — the wave-4 ownership is DEC-051's proposal, confirmed.** `platform` (opus) and `branding` (sonnet), the globs and contracts of `TEAM.md` §1, `CLAUDE.md` § Agent team and `.claude/agents/{platform,branding}.md`. The lead wires the banner, the platform nav link, the org theme layer, the render and mail seams and the six task registrations; NFR-004/005 are the lead's closing pass.
- **Decision 2 (owner) — SCR-083 stays managed rather than authored, and the A27 baseline ships seeded as platform-owned templates.** The five poster families (talk, workshop, panel, meetup, announcement) and the three certificate families (attendance, presenter, achievement), light and dark, RTL-first, are **present for every org from creation and depend on no org publishing first**; `promote_template_to_platform()` is the path for additions, never the source of the baseline. What `0061` already delivers: the eight families as `scope = 'platform'` rows, one template per family rendering light or dark by the `{{brand.*}}` scheme (`library.ts`'s header, `06` §3.3), readable by every org and writable by none — org-independent by construction, so `create_org()` seeds nothing. What `platform` owes under this decision: SCR-083 lists the seeded eight as the baseline (never retirable below one default per purpose); an RLS case creates an org and proves it reads all eight with `is_default` set per purpose; an e2e renders a poster family and a certificate family for a freshly created org in both schemes before that org has published anything. A later revision of a family is a new version of its template (`0061`'s rule), shipped by migration, not by promotion.
- **Decision 3 — `JOB-delete_org` joins `11` §2.7 and §4** (`REQ-NFR-014`, `12` §5.5): on request, key `orgdel:{org_id}`, super-admin only through `delete_org()` — confirmed with the slug typed back, audited on the platform side, irreversible, distinct from suspension. The job removes the org's rows in dependency order and every storage object under its prefix in every org-prefixed bucket (`fonts` is un-prefixed and untouched, DEC-049), then runs the post-deletion assertion: no row and no object bearing the id.
- **Decision 4 — `02` §4.13 (frozen) gains `ENT-brand_kits` under this entry** (DEC-051 wrote "§4.12" for it; §4.12 is Certificates, the designer is §4.13 — corrected here, DEC-051 stands as written): one row per org (`unique (org_id)`), `logo_asset_id uuid references design_assets`, nine light and nine dark colour tokens as `text` constrained to `#rrggbb` (`BRAND_COLOUR_TOKENS`, `06` §8.3), `heading_font_id` and `body_font_id` referencing `fonts` at `parity_status = 'passed'`, `updated_by`, `updated_at`; P1 read, P2 write through an `assert_fresh_admin()` RPC that writes the audit row and a `scoring_config_history` row in the same transaction; the platform default is the identity override. Promoted from `branding`'s first proposed file at sync 1.
- **Rationale:** the baseline is what makes "publish a session and get every variant with no design work" true for the second org on its first day (`14` M6's demonstrable, M7's second-org demonstrable); a library that waits for an org to publish first is empty exactly when it is needed. Managed-not-authored stays because a super admin has no org and the editor is org-scoped (DEC-051). The two document amendments are the plan catching up with a confirmation.
- **Supersedes:** DEC-051's "proposed" marking on the wave-4 rows; the §4.12 reference in DEC-051 decision text (the section is §4.13).
- **Documents changed:** `02-domain-model.md` §4.13 (frozen, under this entry), `11-background-jobs.md` §2.7 and §4, `TEAM.md` §1 (wave-4 rows confirmed, the A27 bullet), `CLAUDE.md` § Agent team (the map heading), `.claude/agents/platform.md` (SCR-083), `.claude/agents/branding.md` (§4.13), `STATUS.md`

---

## DEC-053 — Wave-4 sync 1: `brand_kits` promoted as `0068`; the brand override is resolved at request time, not render time; the shell's org theme layer; `JOB-evaluate_alerts` joins `11`; the two font ids stay stored and unbound

- **Date:** 2026-09-14 · **Decided by:** session (the wave-4 lead), promoting `branding`'s first proposed file and wiring the four consumers of `06` §8.3
- **Decision 1 — `0068_brand_kits.sql` is `branding`'s file as proposed**, `02` §4.13's entity column for column plus what the RPCs needed: `save_brand_kit()` / `reset_brand_kit()` behind `assert_fresh_admin()`, one `scoring_config_history` row per changed column — `scoring_config_history.scope`'s check gains `'branding'`, which `02` §4.1 anticipated ("general enough to carry non-scoring settings") — `public.brand_kit(p_org)` merging the platform defaults in SQL, and `export_render_context()` re-created with a raw `brand` column. Eleven `03` §8.2 rows. `tests/rls/fixture-m7.ts` seeds one kit per org with different palettes so the isolation sweep is non-vacuous and a leak would show in the values.
- **Decision 2 — the override is resolved at REQUEST time, in the three places the bindings are composed** (`regenerate_poster`, `issue_certificates`, the editor's preview in `src/lib/dal/designer.ts`), through `worker/src/render/brand.ts` (`brandBindings()` → `resolveBrand()`), BEFORE the fingerprint. `0060`'s rule is that the worker renders the pinned bindings and never a fresh resolution (`REQ-DSG-013`, `REQ-CRT-014`), so resolving at render time — what `export_render_context().brand` was built for — would have let a colour change leave an artifact's key untouched. The column stays (harmless, documented, tested) and the worker does not read it; a changed colour is a new fingerprint and a re-render, which is the self-invalidation the plan wants. No row is the identity override at every seam: `resolveBrand(null) === platformBrand()`, and the parity goldens did not move.
- **Decision 3 — the four consumers, as wired:** the CSS layer — `src/app/[locale]/app/layout.tsx` reads `getSessionState()` (a read, never a redirect: the pages still gate at the data) and, when a member session exists and the kit `isOverridden`, emits `.brand-org{--canvas:…}` and `.brand-org .theme-dark{…}` in a nonced `<style>` and adds the class to the shell; `@theme inline` resolves the variables at use, so every utility picks the org value up; the templates — decision 2; the email — `send_notification` reads `public.brand_kit(org_id)` and the renderer uses `fgBody`, `fgMuted` and `surface`, keeping its old neutral literals as the fallback when a caller passes none (the unit tests pass nothing and are unchanged); the editor's preview — `brand_kit()` through `resolveBrand`, add-only in `designer`'s DAL.
- **Decision 4 — `JOB-evaluate_alerts` joins `11` §2.7 and §4** (`REQ-NFR-016`, `11` §3.2): every minute, key `alerts:{minute}`, evaluates the eight thresholds from SQL and emits through one `AlertSink` — console and in-memory locally and in CI, Sentry wired by the lead at Launch, never a network call before it. The drill (`14` M8's "every alert fires") is a test that seeds each condition and asserts exactly that alert fires once and clears. `platform` builds it after ADM-002.
- **Decision 5 — `heading_font_id` and `body_font_id` are stored and unbound this wave.** No consumer of `06` §8.3 and neither demonstrable needs a face token; inventing `brand.headingFace` is a runtime contract change for a later wave, recorded here rather than improvised.
- **Rationale:** the request-time resolution is the only one consistent with `0060`; the identity override is what lets every consumer be wired before SCR-059 exists; the shell reads rather than gates because Partial Rendering means a layout is not the boundary.
- **Supersedes:** nothing; refines DEC-052 decision 4's "P2 write" into "RPC-only, no write grant" as `0068` does it.
- **Documents changed:** `03-permissions-rls.md` §8.2 (+11), `11-background-jobs.md` §2.7 and §4 (`JOB-evaluate_alerts`), `STATUS.md`

---

## DEC-054 — Wave-4 sync 1 (platform): the M8 schema promoted as `0069`; three entities join `02` §4.1 and the `org_id` exceptions become seven; the org's staff read impersonation sessions; expiry is scheduled per session; the hook reads impersonation; no deactivation queue; two `text` + check columns to convert

- **Date:** 2026-09-14 · **Decided by:** session (the wave-4 lead), promoting `platform`'s first proposed file; the readers question resolved in favour of the settled document
- **Decision 1 — `0069_m8_schema.sql` is `platform`'s file as proposed.** `impersonation_sessions` (`02` §4.1 verbatim, ≤ 4 h by constraint, append-only with insert/update/delete revoked from `authenticated` and `service_role`), `retention_periods`, `platform_audit_log`, `data_export_requests`; the RPCs (`start_impersonation` / `end_impersonation` / `expire_impersonation_sessions` / `my_impersonation`, `set_first_admin`, `add_org_domain` / `remove_org_domain`, `request_data_export`, `request_deactivation`, `write_platform_audit` / `platform_audit`, `retention_period` / `retention_schedule`, `promote_template_to_platform` / `retire_platform_template` / `set_platform_template_default` / `platform_template_library`, `platform_metrics_by_org` / `platform_metrics_totals` / `platform_job_health`, `delete_org` / `perform_org_deletion` / `assert_org_deleted`); two views reached only through the asserting functions; two `create or replace` of earlier migrations — `custom_access_token_hook` (`0006`) and `org_domains_audit` (`0008`). `assert_platform_admin()`, `create_org()`, `suspend_org()`, `reinstate_org()` stay `0005`'s. Fourteen new `03` §8.2 rows and three §5 rows. `tests/rls/platform-schema.test.ts`, 28 cases, including the ★ no-data-plane sweep over every `org_id` table and DEC-052's baseline-for-a-new-org case.
- **Decision 2 — `02` §4.1 (frozen) gains `ENT-retention_periods`, `ENT-platform_audit_log` and `ENT-data_export_requests` under this entry, and §7's exceptions become seven.** `retention_periods` and `platform_audit_log` carry no `org_id` and take the `platform_admins` shape exactly (RLS enabled, no policy, no grant). The alternatives were rejected on the file's own reasoning: dropping `data_export_requests` gives up a status and a storage path for `REQ-PRF-006`; dropping `platform_audit_log` leaves org deletion without evidence, because `audit_log.org_id` cascades from `orgs` and an `org.deleted` row written there dies with the org it records. `CLAUDE.md` invariant 5 and `tests/rls/isolation.test.ts`'s `NO_ORG_ID` list follow.
- **Decision 3 — the org's staff read `impersonation_sessions`** (`03` §5's `P1 + is_staff()`, moderator and admin), not admins alone as DEC-052 and the agent definition said. `03` is the settled document, `policy-diff` reads it, and "the org knows" includes its moderators. DEC-052's narrower wording is superseded on this point.
- **Decision 4 — `JOB-expire_impersonation` runs at `expires_at`**, scheduled by `start_impersonation()` with `11`'s own key `impexp:{session_id}`; a run expires every due session, so a missed run self-heals. `11` §2.7's "every minute" was a cron sweep with no key, and is amended.
- **Decision 5 — the deactivation request has no queue table.** `request_deactivation()` writes `member.deactivation_requested` to the org's own audit log; the admin acts with `0005`'s `deactivate_member()`. A queue is a second place the same fact would live.
- **Decision 6 — the auth hook gains a `select` on `impersonation_sessions` for `supabase_auth_admin`** and mints `org_id`, `org_role = 'member'`, `status`, `org_status` and the session id for an active session — and no `member_id`, so every privileged RPC's re-read of the member row finds none and a break-glass session reads what a member reads and writes nothing privileged. The hook's three rules (never raises, returns the event unchanged without a member row, three grants) are kept and re-tested; claims are minted at issuance, so the console refreshes the session after `start_impersonation()`.
- **Decision 7 — two columns ship as `text` + check and are converted:** `retention_periods.action` and `data_export_requests.status` violate the naming rule (enums are Postgres enum types, never `text` + check). `platform` proposes the conversion to `retention_action` and `data_export_status` on top of `0069`, early in bundle 2 while both tables are empty; forward-only.
- **Findings recorded:** `(f()).*` calls a composite-returning plpgsql function once per output column — RLS cases against a composite RPC use `select * from f()`; `design_templates`' platform rows read as a leak in a naive sweep and are not one (null `org_id` by requirement) — the ★ sweep asserts on rows carrying an `org_id`; replacing `org_domains_audit()` silently dropped `0008`'s org-deletion escape and made `delete_org()` impossible — the guard is back, and every other append-only trigger on the cascade path already carries it.
- **Wiring owed by the lead:** the six task registrations and three crontab lines when bundle 4 lands (not before — the worker fails to boot on a missing module); the banner is a placeholder until `platform` says otherwise.
- **Rationale:** the file is `02`'s intent for M8 with the three tables the requirements need and did not name; the readers question is decided by which document is settled; scheduling at `expires_at` is the only reading of `11`'s key.
- **Supersedes:** DEC-052's "admins only" for impersonation readers; `11` §2.7's "every minute" for `JOB-expire_impersonation`.
- **Documents changed:** `02-domain-model.md` §4.1 and §7 (frozen, under this entry), `03-permissions-rls.md` §5 (+3) and §8.2 (+14), `11-background-jobs.md` §2.7, `CLAUDE.md` invariant 5, `tests/rls/isolation.test.ts`, `tests/rls/fixture-m7.ts`, `STATUS.md`

---

## DEC-055 — Wave-4 sync 2: `0070` and `0071` promoted; break-glass browses nothing this wave (C, with A named for the next); the closing pass's two harnesses, and the four budget misses the first measurement found

- **Date:** 2026-09-14 · **Decided by:** session (the wave-4 lead), promoting the second files of both tracks and running the first half of STORY-NFR-004
- **Decision 1 — `0070_platform_console_reads.sql`** (`platform`): `platform_org()` and `platform_impersonations()`, both `security definer` behind `assert_platform_admin()`. A super admin has no `org_id` claim, so `orgs_read_own` and `org_domains_read_admin` give them zero rows — DEC-014 working — which left `REQ-ADM-001`'s "manages allowed domains" with no door. No table, no policy; two `03` §8.2 rows.
- **Decision 2 — `0071_regenerate_posters_on_save.sql`** (`branding`): `save_brand_kit()` and `reset_brand_kit()` re-created to enqueue `regenerate_poster` through `public.enqueue_job()` with `0063`'s key `poster:{session_id}` on the `render` queue for every session of the org with a **live** poster; a customised one is left alone (`REQ-DSG-003`, DEC-012's asymmetry). Unconditional on any successful save — which columns matter would be a second copy of the renderer's binding logic — and on reset, because a reset is a brand change. Five RLS cases; a burst of saves collapses to one job through the key.
- **Decision 3 — break-glass browses nothing this wave (option C).** `02` §4.1 gives an impersonation session an `org_id` and no target member, so the hook mints no `member_id`; `getSessionState()` requires both for the `member` branch, so an impersonating super admin reaches the platform console and `/no-access` and nothing else. The three options as `platform` laid them out: (A) a fourth session state `impersonating` in `session.ts` with a second helper for read screens — smallest change to the file, changes on every screen; (B) `memberId: string | null` on `Session` — honest, touches every DAL that reads it; (C) accept the narrower behaviour. C for this wave, A for the next: `session.ts` is the sign-in boundary, and widening it under a running wave is the change that passes tsc and breaks a member's redirect. The M8 demonstrable holds in full as built (create, no data plane, the org's own audit row, expiry); `<ImpersonationBanner />` is real on the platform screens and on `/no-access` through `my_impersonation()`, which is keyed on `auth.uid()` and needs no org claim. SCR-085's "a persistent banner across every screen" is met exactly where a break-glass session can be, and `09` says so under this entry.
- **Decision 4 — the closing pass has two harnesses, both e2e against real local Supabase.** `tests/e2e/a11y.spec.ts` runs axe with the WCAG 2.x A/AA tags on the sign-in screen, seven member screens and six admin screens; a serious or critical violation fails the screen naming the rule, the selector and the help URL; the rest print as advisories for the manual half of `13` §2. First run: one serious finding, an `overflow-x-auto` table wrapper with no keyboard stop (`scrollable-region-focusable`) on the audit log and the attendance report — fixed with `tabIndex`, a region role and a name; the rule now applies to every table scroller. `tests/e2e/budgets.spec.ts` measures `13` §7's six screens on Lighthouse's throttled mobile profile, driving the Chromium Playwright launched with the member's or admin's cookies; INP has no lab measurement, so TBT stands in with `13`'s INP number as its ceiling.
- **Decision 5 — the budgets are enforced as no-regression; the absolute numbers are reported and go back to the owner.** The first measurement, local `next start` on a laptop: every `/app` screen carries **164 KB** of gzipped JS — Next's App Router shell, React and the message catalogue — so the check-in budget of **80 KB** is not reachable on this rendering path at all, and the session list and leaderboard miss 150 KB by the same shell; LCP misses on the marketing landing (3.9 s vs 2.0), the event page (2.6 vs 2.5), the session list (2.9 vs 2.5) and check-in (3.7 vs 1.5) are throttled-lab numbers against a laptop, not a CDN, and the marketing page is frozen byte-for-byte and cannot be changed here. The spec fails a screen that regresses more than 10 % on LCP, TBT or JS or 0.02 on CLS against `tests/e2e/budgets.baseline.json`, which moves only through a reviewed commit. **For the owner, at Launch:** measure the same six screens against the production deployment with the same spec pointed at the live domain, then either amend `13` §7 to what the shell allows (the JS floor is ~160 KB gz on this stack) or schedule the shell split — a bare layout for the check-in route, the catalogue loaded per namespace — as a Launch-hardening item.
- **Rationale:** a budget that cannot be met by the framework's own baseline is a plan number, not a gate; a gate that measures the wrong environment misleads; no-regression against a recorded baseline is what this harness can honestly enforce today.
- **Supersedes:** nothing; narrows SCR-085's banner reach for this wave.
- **Documents changed:** `03-permissions-rls.md` §8.2 (+4), `09-sitemap-screens.md` SCR-085 (note), `13-testing-quality.md` §7 (note), `STATUS.md`

---

## DEC-056 — Wave-4 sync 3: `0072` and `0073` promoted and the six M8 jobs registered; the member's export is a column, not an object; ICU's `#` is banned from every plural; three `platform` findings recorded

- **Date:** 2026-09-14 · **Decided by:** session (the wave-4 lead), promoting `platform`'s third and fourth files
- **Decision 1 — `0072_platform_library.sql`**: SCR-083 as DEC-052 fixed it — managed, not authored. `promote_template_to_platform()` copies a published org version into the platform library (later org edits never reach it, `REQ-DSG-008`), `retire_platform_template()` refuses to go below one non-retired default per purpose (the A27 baseline can shrink to eight, never below), `set_platform_template_default()`, `platform_template_library()`, and `platform_promotable_versions()` listing what an org has published. Two `03` rows.
- **Decision 2 — `0073_retention_and_privacy.sql`**: `enforce_retention()` reads `retention_periods` and deletes or anonymises per class, idempotent, never `points_ledger`; `anonymise_members()` rewrites a deactivated member's personal columns after `12` §5.3's twelve months, sets `anonymised_at` and keeps the row's id as the pseudonymous key — every org total unchanged (`REQ-PRF-007`); `build_data_export_payload()` assembles the member's own rows with another member's comment attributed by display name alone (`REQ-PRF-006`); `request_data_export()` is rate-limited and one-open-per-member; `record_data_export()` is the worker's door; `my_data_export()` the member's read. Eight `03` rows. **The archive is a `jsonb` column on the member's own request row, not a storage object:** `exports_storage_read` has no member conjunct — every member of the org reads that bucket — and a storage policy is permissive, so the subtree could not be narrowed without rewriting M5's policy; the alternatives were a seventh bucket or `service_role` on Vercel (invariant 7). `data_export_requests` keeps its `storage_path` column, unused, until `tests/rls/fixture-m7.ts` writes `payload` instead; a later migration drops it.
- **Decision 3 — the six jobs are registered** in `worker/src/index.ts` — `enforce_retention`, `anonymise_members`, `assert_storage_prefixes` nightly at 03:00/03:00/03:30; `expire_impersonation`, `build_data_export`, `delete_org` on request — and the image builds with them. `JOB-evaluate_alerts` is not yet registered: its task and the drill are `platform`'s last unit.
- **Decision 4 — ICU's `#` is banned from every plural in the catalogue.** `#` formats with the locale's numbering system — Arabic-Indic for `ar` — which contradicts `REQ-INT-006` for an org set to western numerals. `platform` found it in its own namespace and refused it there; the lead's closing pass found five more in `checkin`, `rsvp` and `scoring` (the host view's check-in count, seats left, the waitlist length, the catalogue's cap and points) and fixed each to print a `{value}` the component formats with `formatNumber(n, numerals)`; `tests/unit/messages-numerals.test.ts` walks every namespace in both locales and refuses `#` inside any plural block. `10` §3's rule stands as written; the test is what makes it hold.
- **Findings recorded** (`notes/platform.md` §1): replacing `org_domains_audit()` for attribution silently dropped `0008`'s org-deletion escape and made `delete_org()` impossible — the guard is back, and every other append-only trigger on the cascade path carries the same escape, which is why one `delete from public.orgs` is enough and nothing disables a trigger; `(f()).*` evaluates a composite plpgsql function once per output column (DEC-054); the exports bucket's read policy shape, above.
- **Still open at this sync, all `platform`'s:** the banner real under DEC-055's option C; `JOB-evaluate_alerts` with the eight-condition drill; the enum conversion for `retention_periods.action` and `data_export_requests.status` (DEC-054 decision 7); `tests/e2e/platform-console.spec.ts` line 215.
- **Rationale:** the archive-as-column trade is the one that keeps invariant 7 and M5's policy untouched; a catalogue rule with no test is a rule three tracks broke without noticing.
- **Supersedes:** nothing.
- **Documents changed:** `03-permissions-rls.md` §8.2 (+10), `worker/src/index.ts`, `STATUS.md`

---

## DEC-057 — Wave 4 closing decisions: the shell bug the RLS suite could not see, the render queue measured, the two demonstrables as run, the closing pass, and the working rules

- **Date:** 2026-09-14 · **Decided by:** session (the wave-4 lead), closing wave 4; the owner's standing decisions are DEC-051's and DEC-052's
- **Decision 1 — the shell classifies the session once, and renders the bell and the org theme for a member alone.** `NotificationBell` called `getUnreadCount()` → `requireSession()` on every `/app` route; a platform admin has no member row, so every `/app/platform/**` screen redirected to `/no-access` before the console rendered — the console had never rendered for anyone. Thirty-five RLS cases, the DAL and the policies were all correct, and none could see it; a real session against a real build through the real shell did (`platform`, sync 3). `src/app/[locale]/app/layout.tsx` now calls `getSessionState()` once and shows the bell and the theme layer for `kind === "member"`; every e2e that lands on a page asserts `page.url()`, not the response status, because `goto()` reports the final response after a redirect.
- **Decision 2 — the render queue, measured (DEC-051's condition).** Twelve poster variants on the rebuilt worker image completed in bursts of three at each 60-second poll boundary — four minutes for one publish — because a worker finishing a job on the named `render` queue does not always take the queue's next job itself. The knob the measurement named is the poll interval, not concurrency: `pollInterval` is 15 s (a publish under a minute; LISTEN's latency is milliseconds, so a regression still shows as a stall in the queue-age alert). Concurrency stays 1; the hash-split into two queue names waits for a measured need under a real publish burst. Built, not re-measured this wave.
- **Decision 3 — the two demonstrables, as run** (`scratchpad/wave4-demo.mjs`, gitignored; the record is here): the worker image (`worker/Dockerfile`, rebuilt with the wave-4 tasks, LISTEN/NOTIFY probe OK) and the converter image on the local Supabase network. **M8:** `create_org()` as a platform admin through PostgREST → the new org reads all eight A27 baseline templates (DEC-052) → the platform admin selects from `orgs`, `members`, `sessions`, `points_ledger`, `materials`, `comments`, `audit_log`, `brand_kits` and gets **zero rows** → `start_impersonation()` writes `impersonation.started` into **that org's own** `audit_log` → `end_impersonation()` sets `ended_at` → `my_impersonation()` answers none. `tests/e2e/platform-console.spec.ts` walks SCR-080 … 085 as a super admin across two seeded orgs on the real build; the ★ RLS sweep in `tests/rls/platform-schema.test.ts` proves every `org_id` table returns nothing or `42501` to a platform admin. **M7-branding:** `publish_session()` as an admin → 12 of 12 variants ready with Tier A (one fingerprint) → `save_brand_kit()` → `brand_kit()` returns `isOverridden` with the org's colours → **12 variants re-rendered under new fingerprints**, the poster carrying the org's colours; the theme layer is proven by `tests/e2e/branding.spec.ts` (the page's own `<h1>` takes the saved colour after a reload) and the mail by `send_notification`'s `brand_kit()` read.
- **Decision 4 — the closing pass** (STORY-NFR-004): axe on fourteen screens with the WCAG 2.x A/AA tags — one serious finding (table scrollers with no keyboard stop) fixed everywhere; Lighthouse on `13` §7's six screens — the absolute budgets go back to the owner (DEC-055) and the gate is no-regression, median of three; ICU's `#` banned from every plural with a catalogue-wide test (DEC-056). STORY-NFR-005 (scale, PWA-readiness): no plan degrades to a sequential scan at the target counts is `02`'s index list as written and the RLS suite's fixture sizes, not a load test — recorded as **not run** this wave; no service worker is built, and no decision assumes its absence.
- **Decision 5 — `0074_enum_types.sql` and `0075_alerts.sql`** (`platform`, the final sync): `retention_periods.action` → `retention_action` and `data_export_requests.status` → `data_export_status` (DEC-054 decision 7; a CHECK that mentions the column and a partial index predicate both store their expression resolved against `text`, so both are dropped and restored around the type change — `RPC-request_data_export.rate_limited` proves the index came back); `evaluate_alerts()` returns all eight of `11` §3.2 on every call — a cleared alert must be distinguishable from one nobody evaluated — and `worker/src/platform/alerts.ts` holds the `AlertSink` with an edge-triggered fire-once/clear-once, console and in-memory sinks, no network call; the drill `tests/rls/platform-alerts.test.ts` seeds each condition alone and asserts the firing set is exactly that one, then cleared, then all eight together. **Signed off as written:** ledger divergence and parity failure are read from the records the nightly jobs already write (an alert job that re-runs a sweep every minute becomes the outage it reports); "> 3 consecutive" renders is three in a row; no alert-state table (a worker restart re-fires every open alert once — pinned by a test; Sentry's fingerprinting is the dedupe at Launch). Seven jobs registered; `evaluate_alerts` every minute.
- **Decision 5b — `0076_job_health_due.sql`** (`platform`, after the rebuild): SCR-084 showed a NEGATIVE queue age because `platform_job_health()` measured `now() - run_at` over every unfinished job, including one deliberately scheduled ahead — `expire_impersonation` at a session's `expires_at`; a healthy platform with one live break-glass session read «أقدم منتظرة: ‎-1,679». **Pending means due** now, on the count and the age, matching `evaluate_alerts()`'s own `run_at <= now()`. One `03` row. And the alert drill arranges its own queue inside the transaction: `graphile_worker`'s schema outlives every test, so an overdue job left by an earlier e2e run fired `queue_stalled` in every case — a drill whose result depends on what the machine was doing is not a drill. Both found by a picture and a re-run after the rebuild, neither by a policy case.
- **Decision 6 — parity is 28 of 28 on all four export paths** on the local converter, goldens unchanged through the whole wave: the identity override held at every seam.
- **Decision 7 — the `ImpersonationBanner`** is real on the platform shell and on `/no-access` (the lead's wiring), which under DEC-055 is every screen a break-glass session can reach; the stop control is a client component because ending the session removes the org from the NEXT token and the current one lives 900 s.
- **Left open, named:** the terminal handling for a deleted subject in `build_data_export`, `delete_org`, `expire_impersonation` and `anonymise_members` (`platform` confirmed it OPEN at shutdown: `build_data_export` marks the request `failed` and then rethrows, so `member_not_found` retries 25 times; `delete_org`, `expire_impersonation` and `anonymise_members` have no deleted-row guard at all — a payload naming a row that no longer exists should log once, mark what still exists, and return, `render_variant`'s shape; the Launch session's first worker item); DEC-055's option A (a fourth session state so a break-glass session browses the org's screens); the check-in budget (DEC-055); `data_export_requests.storage_path` (drop once the fixture writes `payload`); the two font ids on the kit, unbound (DEC-053); STORY-NFR-005's load test; the QR scan and the ICS-in-Outlook checks and the real-device pass, the owner's at Launch; Sentry as the `AlertSink` transport at Launch.
- **Working rules** added to `TEAM.md` §5 (wave 4): a reset leaves Kong pointing at the old Auth container — the reset script probes and restarts it; the brand override is composed before the fingerprint, never at render time; a lead's fixture row fires a teammate's history trigger; `(f()).*` evaluates a composite function once per column; a budget the framework's baseline cannot meet is a plan number, not a gate; **a screen is "complete and unverified in the browser" until a real session walks it on a real build** — the shell can redirect before any page code runs, and only an e2e that asserts the final URL sees it; a job whose subject is gone returns, it does not retry twenty-five times.
- **Supersedes:** `worker/src/index.ts`'s 60 s poll (DEC-034's comment stands as the rationale for a long interval; 15 s is the measured compromise); nothing else.
- **Documents changed:** `TEAM.md` §5, `STATUS.md` (the Launch handoff), `worker/src/index.ts`, `src/app/[locale]/app/layout.tsx`

---

## DEC-058 — Uploads are PDF-only from Launch; the converter is removed and PDF page rendering moves into the worker; the worker host is Railway

- **Date:** 2026-09-15 · **Decided by:** owner (the Launch session's opening instructions), implemented by session
- **Decision:** **Document uploads are PDF-only.** PowerPoint and Keynote are not accepted: the upload form offers `pdf`, `image`, `audio`, `video_link`, `external_link`; the DAL's `materialKindSchema` and the Route Handlers' declared kinds carry no `powerpoint`/`keynote`; `sniffedKindMatchesDeclared()` still recognises both (so a deck declared as anything else is refused by name) and matches them to nothing; and migration **`0077_pdf_only`** adds `materials_kind_pdf_only` (`check (kind not in ('powerpoint','keynote'))`, added `not valid` then validated) and re-creates `finalize_material_upload()` and `carry_over_proposal_materials()` so that `pdf` alone is `pending` and enqueued. The `material_kind` enum keeps its two values — an enum value cannot be dropped and migrations are forward-only (invariant 3) — so the CHECK is the retirement. **The converter is removed** (`converter/`, `CONVERTER_URL`, the `converter` CI job, `npm run converter:test`, the signed-URL minting in `worker/src/content/storage.ts`, `convertedPdfPath()` in `@kareem/storage-paths`): with no PowerPoint there is no LibreOffice, and with no LibreOffice there is nothing left for DEC-032's isolation to isolate. **PDF page rendering runs in the worker image:** `worker/Dockerfile` installs `poppler-utils` and `webp` beside Chromium; `worker/src/content/pdf.ts` wraps `pdfinfo`, `pdffonts`, `pdftoppm`, `cwebp` at `07` §4.5's numbers verbatim (1600 px / q82, 320 px / q70); `JOB-convert_document` keeps its name for the enqueue contract (`0046`/`0053`/`0077`, key `conv:{version_id}`) but **inspects** — page count, and `REQ-MAT-011`'s substitution is now «a font the PDF names and does not embed, whose family the image lacks», from `pdffonts`' `emb` column against `fc-list`; `JOB-render_pages` renders and uploads each page and thumbnail with the worker's own key, the way `process_photo` always did, and records width/height. Both mark the material `failed` and **return** when the stored object is not a PDF (terminal), and record-then-rethrow on a tool failure (retried per `11` §2.4). **The parity suite's path 4** (`scripts/parity/poppler.mjs`, replacing `converter.mjs`) runs the same chain locally and skips loudly without the tools; inside the worker image CI sets `PARITY_REQUIRE_POPPLER=1`, which turns that skip into a failure — the goldens are unchanged (verified below). **The worker host is Railway** (the owner's existing Hobby subscription): one service from `worker/Dockerfile`, Singapore, auto-sleep off, `DATABASE_URL` on the session-mode port 5432 (the probe refuses the pooler) — OQ-027 closed, and there is no converter to host.
- **Copy (Arabic first, `ar/materials.json`):** the substitution warning now says the font is not embedded in the PDF and asks for an export with fonts embedded; `renderStatus.rendering`/`failed` and `viewer.states.failed` speak of «تجهيز الصفحات» rather than «التحويل»; the `kind.powerpoint`, `kind.keynote`, `downloadOnly`, `downloadOnlyHint`, `states.keynoteDownloadOnly`, `states.keynoteHint` keys are removed from both locales (keys are stable, dead keys are not kept).
- **Rationale:** one fewer service to host, secure and pay for at Launch, and no LibreOffice — the largest CVE surface in the design — anywhere in the system. The cost is that poppler now parses a member's PDF in the process that holds `service_role` (`12` T5 as amended); the owner accepts it: the bytes are sniffed at upload (`REQ-MAT-012`) and again by the job, poppler's surface is a fraction of LibreOffice's, and DEC-032's guard existed for PPTX specifically. The alternative — keep the converter as a PDF-only page renderer — was rejected as an extra container whose whole justification had left with LibreOffice. Rendering with Chromium instead of poppler was rejected because it would move the seven slide-page goldens for no reason the suite could name.
- **Verification (this session):** `tsc` clean · lint 0 errors · unit + components 65 files / 588 passed (`worker-tasks` rewritten on the poppler contract, `worker-pdf` and `platform-tasks` new, `storage-signing` retired with the signing) · `db:reset` + RLS suite with `0077` (`POL-materials.kind_pdf_only` new, `RPC-finalize_material_upload.enqueues` amended) · `policy-diff` agrees · traceability no gaps · the worker image rebuilt with poppler, probe OK, parity **28 of 28 inside it with `PARITY_REQUIRE_POPPLER=1`, goldens unchanged** — see STATUS for the exact figures.
- **Post-launch, recorded here so it is not lost:** re-encoding photos to WebP (deferred by DEC-047, once «through the converter») would now be a worker-side `cwebp` call — still deferred.
- **Supersedes:** D26's «PowerPoint and Keynote files» (narrowed — the rest of D26 stands), **DEC-006** (Keynote download-only — withdrawn; `REQ-MAT-004` and STORY-MAT-003 marked withdrawn, kept as IDs), **DEC-032** (the converter — removed), the converter half of DEC-049 (parity path 4 now runs in the worker image), OQ-027's converter clause and its open host (closed: Railway). `02` §4.6 gains the CHECK under this entry (the document is frozen; this is the amendment).
- **Documents changed:** `01` (REQ-MAT-002/003/004/011), `02` §4.6, `03` §8.2 (+1 row, 1 amended), `04` §7 diagram, §7.1, §9 table, §10, §12.3, `06` §6.4/§7.2/§7.3 (poppler for LibreOffice), `07` §2.1, §4.1–§4.4, §11, `11` §1.4, §2.4, `12` T5 and §7, `13` §1 and §4.5, `14` (M0 and M5 rows, the M5 demonstrable), `15` STORY-MAT-003, `OPEN-QUESTIONS` OQ-027, `ASSUMPTIONS` A16/A34/A39, `TEAM.md` §1, `CLAUDE.md` (invariants 11 and 12, the folder layout, the wave-2 ownership row), `worker/README.md`, `.claude/agents/{content,console,designer}.md`, `.claude/settings.json`, `.github/workflows/ci.yml`, `package.json`, `.dockerignore`, `STATUS.md`

---

## DEC-059 — Terminal handling for a deleted subject: `build_data_export` returns; the other three were already terminal; the rest of DEC-057's open list is post-launch

- **Date:** 2026-09-15 · **Decided by:** owner (Launch order, item 1), implemented by session
- **Decision:** A job whose subject is gone **logs once, marks what still exists, and returns** — it never rethrows into graphile-worker's 25 retries (`render_variant`'s shape, `TEAM.md` §5's rule). Applied to the four DEC-057 named:
  1. **`build_data_export`** — the real case. It now re-reads the request row first (a deleted row: warn and return; a row whose `member_id` differs from the payload's: error and return, the row is the authority), and in the failure path distinguishes `member_not_found` / `request_not_found` (both `42501` from `0073`, matched on the message because `42501` is also a grant failure) — those are recorded on the row through `fail_data_export()` and **returned**; every other error is recorded and **rethrown** so the retry and Sentry see it. `tests/unit/platform-tasks.test.ts` pins all six branches.
  2. **`delete_org`** — already terminal for a missing org: `perform_org_deletion()` returns `{deleted: false}` and the post-deletion assertion still runs (a replay is the design). The assertion failing (rows or objects left) is kept as a **throw**: that is a genuine `REQ-NFR-014` alarm the retries and the alert should surface, not a deleted subject.
  3. **`expire_impersonation`** — set-based by design (`expire_impersonation_sessions()` ends every due session; the payload's id is not consulted), so a deleted session is nothing to do. No change.
  4. **`anonymise_members`** — a nightly sweep over `anonymised_at is null`; no subject in the payload. No change.
  The two content jobs gained the same shape under DEC-058 (a stored object that is not a PDF is marked `failed` and returned).
- **Audit of the other subject-bearing tasks** (recorded, not changed): `send_notification` throws `no context` when `notification_send_context()` returns nothing for a deleted member — retried, then dead-lettered; the message row already exists, so nothing is lost and no mail can go to a deleted address. `award_points`, `award_presenter_points`, `promote_waitlist`, `rsvp_nudge`, `rating_prompt`, `send_reminder` call SQL that returns quietly for a missing row. `issue_certificates` already returns on «no longer eligible». `materialise_font` and `process_photo` already return on their terminal branches. **Post-launch:** make `send_notification`'s missing-context branch return like the others.
- **The rest of DEC-057's «left open»** is **post-launch**, by the owner's order: DEC-055's option A (a break-glass session browsing the org's screens), the check-in budget, dropping `data_export_requests.storage_path`, the two unbound font ids on the brand kit (DEC-053), STORY-NFR-005's load test, Sentry as the `AlertSink` transport (Launch step 10 wires the DSN; the transport swap follows).
- **Supersedes:** nothing; closes DEC-057's first open item.
- **Documents changed:** `worker/src/tasks/build_data_export.ts`, `tests/unit/platform-tasks.test.ts`, `11` §2.7 note below, `STATUS.md`

---

## DEC-060 — No Sentry at Launch; the alerts stay on the console sink

- **Date:** 2026-09-15 · **Decided by:** owner
- **Decision:** Sentry is not used — the platform is an internal app, not public, and observability-as-a-service is «a big maybe» later. `SENTRY_DSN` is set nowhere (no code reads it: no SDK was ever installed). `JOB-evaluate_alerts` keeps the console `AlertSink`; the eight `11` §3.2 alerts are read from the worker's log on Railway. The handoff's step 10 (the DSN into Vercel and the worker, the transport swap) is dropped, not deferred.
- **Rationale:** an internal app with one org and one operator gains nothing from a paid error tracker that the deploy log does not already show; wiring it would add a secret and a network destination for a service nobody would watch.
- **Supersedes:** the `SENTRY_DSN` rows of `04` §10 and the Launch handoff's step 10; DEC-059's «Sentry as the `AlertSink` transport» post-launch item.
- **Documents changed:** `STATUS.md` (the inventory)
## DEC-061 — `0016` guards its `alter table realtime.messages`; the rehearsal proves schema shape, not the hosted role's DDL rights

- **Date:** 2026-09-15 · **Decided by:** session, on Launch day, with the owner's push output in hand
- **What happened:** `supabase db push` (step 3) applied `0003` … `0015` and stopped at `0016`'s first statement, `alter table realtime.messages enable row level security`, with `42501 must be owner of table messages`. Production is at `0015`; each migration runs in its own transaction, so nothing of `0016` landed and `registrations` is untouched. On the hosted project `postgres` owns none of `realtime.messages`, `storage.objects`, `storage.buckets` (owners `supabase_realtime_admin` / `supabase_storage_admin`, no inherited privilege — the owner's introspection query), RLS is already on for all three, and **`create policy` on them is allowed anyway** through Supabase's `supautils` policy grants, which is how every project's storage and realtime policies are created. `alter table` is not.
- **Decision:** `0016` is edited in place — it was never applied anywhere permanent, so a new migration could not make it succeed — to run the `alter table` only when `pg_class.relrowsecurity` is false (a local or CI database, where `postgres` may), and skip it where RLS is already on (hosted). The policies and the `grant` stay as written; a `grant` by a non-owner without grant option warns and grants nothing rather than failing, and Supabase's own migrations already grant `authenticated` on `realtime.messages`. No other migration alters a Supabase-owned table (grepped); `0037`/`0053`/`0054` only create and drop policies on `storage.objects` and insert into `storage.buckets`, which `postgres` may.
- **The rehearsal's gap, recorded:** step 2 ran on a plain `postgres:17` container where `postgres` is a superuser; the hosted `postgres` is not, so the rehearsal proves that the migrations fit production's **schema** and hold under its default privileges, not that the hosted role may run every statement. The dry run plus per-migration transactions are the backstop, and they held. **Post-launch:** make `scripts/ci/roles.sql` apply the migrations as a non-superuser `postgres` with the hosted grants, so CI catches this class.
- **Supersedes:** nothing.
- **Documents changed:** `supabase/migrations/0016_realtime_authorization.sql`, `STATUS.md`

---

## DEC-062 — The RLS fixture's slugs carry a per-run token, so the drill can run against a database that already holds the real org

- **Date:** 2026-09-15 · **Decided by:** session, on Launch day, from the owner's drill output
- **What happened:** step 5's alert drill (`tests/rls/platform-alerts.test.ts`, run by the owner against production over the session pooler, every case inside a rolled-back transaction) failed 12 of 12 at the fixture's first insert with `orgs_slug_key`: the fixture named its first org `kareem`, and the real org `kareem` had been created an hour earlier. Nothing was written. Local and CI databases are empty, so the literal had never collided. The live half of the drill — `evaluate_alerts()` on production returning all eight alerts clear, twelve cron entries registered, the queue empty — had already passed.
- **Decision:** `tests/rls/fixture.ts` suffixes its two slugs with an eight-character token generated once per process (`kareem-<token>`, `other-<token>`). Every test reads the slug from the fixture object (`f.a.slug`), none from a literal; `tenancy.test.ts`'s immutability case still sets `slug = 'other'` and is still refused by the guard, literal or not. The full RLS suite passed locally with the change (61 files / 713). Every other fixture row is org-scoped or randomly keyed; `orgs.slug` was the one platform-wide literal, and the drill's purpose — the same SQL, the same roles, production's shape — is exactly what a fixture that can coexist with real rows preserves.
- **Rationale:** the alternative, a separate production-only drill without the fixture, would have proven less than the suite already does; the alternative of skipping the production run would have left «the drill against production» as an untested claim in the launch record.
- **Also recorded:** the owner's drill command carried the database password into the session transcript; the password is to be rotated after the smoke test and `DATABASE_URL` on Railway updated (STATUS post-launch list).
- **Supersedes:** nothing.
- **Documents changed:** `tests/rls/fixture.ts`, `STATUS.md`

---

## DEC-063 — The sending domain is `peninsulapictures.dev`, sender `kareem-notifications@peninsulapictures.dev`

- **Date:** 2026-09-15 · **Decided by:** owner, at Launch step 6
- **Decision:** All platform mail is sent from **`kareem-notifications@peninsulapictures.dev`** through Resend, on the owner's already-registered `peninsulapictures.dev` domain, not from `no-reply@kareem.pp.sa` as `08` §3.4 assumed. Configured entirely by variables on the worker: `MAIL_TRANSPORT=resend`, `RESEND_API_KEY` (sending access, restricted to that domain), **`MAIL_FROM_ADDRESS=kareem-notifications@peninsulapictures.dev`** (the code's default remains `no-reply@kareem.pp.sa`; the variable overrides it — `worker/src/mail/transport.ts`). The display name stays the org's. No code change.
- **Rationale:** the domain the owner already operates and has in Resend; `kareem.pp.sa` carries no mail records and adding them would put DNS changes on the launch's critical path for no member-visible gain. The sender's domain differing from the site's domain costs nothing for deliverability with Resend's DKIM on the sending domain; a DMARC-aligned `kareem.pp.sa` sender can be adopted later by changing one variable.
- **Verification (this session):** no Resend DNS records were visible at `resend._domainkey.` / `send.` of either domain from the session's resolver at the time of the decision; the owner reports the domain verified in Resend. The first send of the smoke test is the proof; a rejection shows as a 403 in the worker log.
- **Supersedes:** `08` §3.4's «one platform-verified sending domain» is unchanged in principle; its example address is.
- **Documents changed:** `STATUS.md` (the inventory: `MAIL_FROM_ADDRESS` required, not optional)

---

## DEC-064 — A check-in code exists only while the session is live; every feature is reachable from the navigation

- **Date:** 2026-09-15 · **Decided by:** owner (the smoke-test finds), implemented by session
- **Decision 1 — the code window is enforced at issuance.** `ensure_check_in_code()` (0015) checked who may read the code and not when; the host view minted a code for a published session days before it started. `0078` re-creates it to raise `not_open` (P0001) unless `sessions.state = 'in_progress'`, after the `not_authorized` check so a member is still refused by role and never learns the window (REQ-CHK-014). `getHostView()` returns `code: null` with a `phase` (`not_started` / `ended`) and the host view says so instead of showing a code; the revoke control appears only with a code. `check_in()`'s own refusal outside the window (REQ-CHK-004) is unchanged — the two now agree at both ends. `RPC-ensure_check_in_code.only_live` in `03` §8.2 and `tests/rls/checkin.test.ts`.
- **Decision 2 — nothing is URL-only.** The shell links home, sessions, propose, members, leaderboards, profile, the bell, and — by role — the admin console and the platform console (the `platform_admin` claim now rides on the member `Session` DTO); the member's profile hub links its six pages; the admin nav lists the two template libraries and branding (built since waves 3 and 4, hidden by a stale `built: false`); every admin session row links schedule, attendance and certificates; the event page links check-in for a member while the session is live, and the three admin screens for staff; the app shell's footer and the sign-in card link the legal pages. The audit was a script over every `page.tsx` looking for an inbound `href` (eleven routes had none).
- **Not changed, by the plan's own decision:** the owner asked that only registered members be able to check in. `REQ-CHK-010` (D24, OQ-005) says the opposite on purpose — a walk-in with a valid code is checked in and earns everything, capacity being a planning limit and not a door policy. Left as specified pending the owner's explicit decision; changing it is one condition in `check_in()` plus that requirement's text.
- **Supersedes:** nothing.
- **Documents changed:** `03` §8.2 (+1 row), `STATUS.md`, `supabase/migrations/0078_check_in_code_only_live.sql`, the shell and hub screens, the message files (Arabic first)

---

## DEC-065 — Walk-in check-in is a per-session switch that staff turn on; off by default

- **Date:** 2026-09-15 · **Decided by:** owner («make the walk-in rule a feature the admin or moderator can enable per session»), implemented by session
- **Decision:** `sessions.allow_walk_ins boolean not null default false` (`0079`; `02` §4 amended under this entry). `check_in()` is re-created: after the window check and before the code lookup, a member with no `confirmed` reservation is answered `reservation_required` unless the session allows walk-ins — the attempt row and the rate limit are untouched (DEC-015), and the answer never reveals whether the code was right. `set_session_walk_ins(p_session, p_allow)` flips the flag for an admin or a moderator (`is_staff()`), refuses everyone else including the session's presenter, and audits `session.walk_ins_changed` with the before and after. The host view (SCR-016) carries the switch for staff with its state in words; the member's check-in screen explains the refusal and points at the reservation. `REQ-CHK-010` is amended in `01` (the only place a requirement is defined); `03` §8.2 gains `RPC-check_in.reservation_required` and `RPC-set_session_walk_ins.staff`, both in `tests/rls/checkin.test.ts`. The existing check-in cases keep walk-ins on through the test helper because they drill the code, the window and the rate limit, not the door.
- **Rationale:** the plan's walk-in rule (D24, OQ-005: capacity is a planning limit, not a door policy) was written before anyone ran a room; the owner, who does, wants the door policy by default and the exception in staff hands per session. Everything a walk-in earned before is unchanged on an opened session, and reporting still distinguishes walk-ins (no reservation row).
- **Not in this change:** the switch on the admin schedule screen (SCR-043) — the host view is where both roles stand when it matters; the design milestone can add it to the schedule form.
- **Supersedes:** `REQ-CHK-010`'s unconditional walk-in (narrows D24 on this point); nothing else.
- **Documents changed:** `01` REQ-CHK-010, `02` §4 (the column), `03` §8.2 (+2 rows), `supabase/migrations/0079_walk_ins_per_session.sql`, `src/lib/dal/checkin.ts`, the host view and check-in screens, `messages/*/checkin.json` (Arabic first), `tests/rls/checkin.test.ts`, `tests/e2e/checkin.spec.ts`

---

## DEC-066 — Every session has a public card: a shared link previews title, time, venue and the poster

- **Date:** 2026-09-15 · **Decided by:** owner («each and every session gets its own public metadata … yes to the scope»), built by the `sessions` teammate, promoted by the lead
- **Decision:** a public, unauthenticated route **`/{locale}/s/[id]`** renders the session card — title, date and time in the org's time zone and numerals, venue name, org name, the poster's `og.png` — with the Open Graph and Twitter tags for link crawlers and one action, sign in with `next` set to the session. The event page carries a «share the link» affordance that copies the card's URL, never the event URL. The read is **`session_public_card(uuid)`** (`0080`): SECURITY DEFINER, granted to `anon` and `authenticated`, returning exactly those fields and only for a session in `published`, `in_progress` or `completed` of an active org — an empty answer, not an error, for everything else. The image reaches crawlers through **`/api/s/[id]/og`**, a Route Handler that reads the object under one additive storage policy, `exports_storage_read_public_card` for `anon`, whose predicate `export_is_public_card(name)` admits only the `og.png` of a card-eligible session's poster; every other object in `exports` stays refused and nothing is writable. `isPublicPlatformPath()` matches `/s/`, so the proxy gives the route the nonce, never the sign-in redirect, and 404s it while unconfigured (DEC-038). Alternatives the teammate rejected: a signed URL minted by the app (needs `service_role` on Vercel — invariant 7); copying `og.png` into a public bucket from the worker (a second copy to keep in step and to revoke on cancellation); serving the tags from the event page (the proxy redirects a crawler to sign-in before any page code runs).
- **The trade-off, stated:** anyone holding the link, member or not, learns the session's title, time, venue and poster, and crawlers cache them; `12` T3 kept a link-holding outsider out. The owner chose the opening for exactly those fields and no more — no abstract, presenters, capacity, comments, materials or attendee counts leave the org. A cancellation or a suspension closes both the card and the image door at once (the same predicate).
- **Also fixed on the way:** `safeNextPath()`'s control-character class carried its range endpoints as literal invisible bytes; rewritten with explicit escapes and pinned by a uuid case — no behaviour change (the teammate had read it as «space or hyphen»).
- **Supersedes:** narrows `12` T3 for those fields; `REQ-SES-008` stands (no stream link, no remote-attendance affordance on the card).
- **Documents changed:** `03` §6 (+1 storage policy) and §8.2 (+2 rows), `supabase/migrations/0080_public_session_card.sql`, `src/lib/auth/next-path.ts`, the `s/[id]` page, the `api/s/[id]/og` handler, the event page's share affordance, `messages/*/sessions.json`, `tests/rls/sessions-public-card.test.ts`, `tests/e2e/sessions-public-card.spec.ts`, `tests/e2e/unconfigured.spec.ts`, `docs/plan/notes/sessions.md`

---

## DEC-067 — Companies earn points of their own: hosting, attendance share, presenting share

- **Date:** 2026-09-15 · **Decided by:** owner («the company is awarded points based on the employees' participation: the company hosting, the percentage of attended employees, the percentage of presenting employees»), designed and built by the `scoring` teammate, promoted by the lead as `0081`
- **Decision:** three company-level rules on top of the derived company score (`05` §6.2 stands): **`company_hosting`** (flat, default 100) credits the session's host company once on completion; **`company_attendance_pct`** and **`company_presenting_pct`** credit `round(percent × points_per_percent)` capped (defaults 1.00/100 and 2.00/150) per completed session, where the percent is the company's share of its own active members who checked in, respectively who presented as accepted presenters, and only when the company has at least `min_active_members` (default 3 — the small-denominator guard `05` §6.2 already applies to the derived metric; without it a one-person company scores 100 % on every session). All three are catalogue rows an admin edits on SCR-053 (`company_scoring_rules`, history in `scoring_config_history` with scope `company_scoring`), evaluated by `evaluate_company_points()` from the `evaluate_no_shows` job that already fires once per completed session — no new job type — and recorded in **`company_points_ledger`**, append-only like `points_ledger` (invariant 9, `service_role` revoked), with `company_points_balances` as the rollup and `audit_company_balances()` in the nightly audit. `snapshot_leaderboard()` folds the company ledger into the company board's total; the frozen active-member denominator is untouched. The host is **`sessions.host_company_id`** (nullable, same-org guarded), per session rather than per venue: a venue is reused by many hosts over time and some sessions have no venue row. `02` §4 gains the three entities and the column under this entry. `_seed_org_scoring()` seeds the three rules for every new org and the promotion backfills existing ones (the live `kareem` on push).
- **Two readings left to the owner, with the teammate's default in force:** (1) the two percent rules are evaluated for **every company** with a member present at the session, not only the host company — the derived board is company-agnostic in the same way; the narrower reading is one condition in `evaluate_company_points()`. (2) `min_active_members = 3` is the teammate's anti-gaming addition, not a number the owner named.
- **Known gap:** the host company is set today from a stopgap form on SCR-053 (session id typed in, company chosen); the real field belongs on the schedule screen (SCR-043, `console`'s) and goes there with the design milestone.
- **A Postgres trap, recorded for the next reader:** `select … into r; if r is not null` is false for a row with any null column (row-wise `IS NOT NULL` requires every field non-null); test `r.id is not null`. Three cases inserted zero rows silently before the teammate found it.
- **Supersedes:** nothing — `REQ-LDR-004` and `05` §6 are extended, not replaced.
- **Documents changed:** `02` §4 (three entities, one column), `03` §8.2 (+10 rows), `supabase/migrations/0081_company_points.sql`, `worker/src/tasks/{evaluate_no_shows,audit_balances}.ts`, `lib/dal/{leaderboards,scoring-admin}.ts`, SCR-053 and SCR-028, `messages/*/{scoring,leaderboards}.json` (Arabic first), `tests/rls/scoring-company-points.test.ts` (18), `tests/e2e/scoring-company-points.spec.ts`, `docs/plan/notes/scoring.md`

---


---

## DEC-068 — Launch closed: the company-rule defaults stand, the design milestone is deferred, the hands-on checks are post-launch

- **Date:** 2026-09-15 · **Decided by:** owner («1, 2, 3 ok, do the closing PR, and defer the design»)
- **Decisions:** (1) DEC-067's two readings are confirmed as the owner's: the two percentage rules credit **every company** with a member present at a completed session, not only the host, and **`min_active_members = 3`** stands (admin-editable on SCR-053). (2) The **design milestone** (a component layer, the shell and navigation, then screen by screen — raised by the owner on Launch day as «the pages are plain and the UI/UX is nearly non-existent», never a story in the plan) is **deferred** and starts with a short brief when the owner asks; nothing else waits on it. (3) The owner's **hands-on checks** — the poster and certificate QRs on paper at print size, the ICS in Outlook on Windows, the main flows on a real phone in Arabic — and the **two secret rotations** (the database password and the Google client secret, both of which reached the session transcript) are the owner's, post-launch; whatever they surface comes back as a fix on a branch. (4) The attendee half of the smoke test runs with the first real member.
- **The launch record** is `STATUS.md` → *Launch session*, closed by the same PR as this entry; the post-launch list there is the backlog for the next session.
- **Supersedes:** nothing.
- **Documents changed:** `STATUS.md`

---

## DEC-069 — The design milestone opens: the app *and* the marketing site, one system, rolled out in place

- **Date:** 2026-09-15 · **Decided by:** owner (fifteen asks, opened on Launch day: «the pages are plain and the UI/UX is nearly non-existent … do not build on the current UI/UX. Rebuild from scratch»)
- **Decision:** the milestone deferred by DEC-068 opens as **`16-ui-redesign.md`**, with three framing decisions taken before the document was written. (1) **Scope:** the app *and* the marketing site are one system; invariant 1's frozen public contract is deliberately unfrozen and re-baselined, sequenced **last** (§14, `DEC-078`). (2) **Deliverable:** this document plus a visual canvas of the key screens at phone and desktop, in Arabic RTL, approved before code — the canvas is <https://claude.ai/artifact/3X5NcyyjigheNJG4M1wKKR>, eighteen artboards over three pages (الشاشات · النظام والنماذج · الاستوديو). (3) **Rollout:** **in place, group by group** — the system and the shell land first, then screens are replaced in groups, each group a mergeable PR that ships. No `v2` tree, no long-lived branch, no feature flag; `main` stays deployable (invariant 4) at every step.
- **What does not change:** the logo and the wordmark; the navy/silver palette; Arabic-first authoring (invariant 10); the DAL, RLS, migrations, worker and renderer engine; every hard invariant except the first, and that one only in the controlled way §14 describes.
- **Rationale:** a rebuild behind a flag on a live product is a second product to keep working. Group-by-group is slower per group and cheaper overall, because each group is proved on the live domain before the next starts. The marketing half is sequenced last because it is the only part serving real visitors who never signed in.
- **Supersedes:** DEC-068 item (2), which deferred this milestone and said it «starts with a short brief when the owner asks». The owner asked.
- **Documents changed:** `docs/plan/16-ui-redesign.md` (new), `00-overview.md`, `14-roadmap.md`, `15-backlog.md`, `STATUS.md`

---

## DEC-070 — Two new requirement areas: `UIX` (interface system) and `SUR` (survey)

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §12), approved by the owner 2026-09-15
- **Decision:** `00-overview.md` §5's requirement-area table gains **`UIX` — interface system** (the design system, the shell, loading, failure, forms, affordances, motion, focus) and **`SUR` — survey** (the staff-read instrument of ask 10). `01-prd.md` gains §23 `UIX` (`REQ-UIX-001` … `REQ-UIX-020`) and §24 `SUR` (`REQ-SUR-001` … `REQ-SUR-009`); *Out of scope* moves to §25.
- **Rationale:** the alternative was to scatter twenty interface requirements across `NFR` and `INT`. `NFR` is where a requirement goes to be untestable, and `INT` is about language, not interface. A survey filed under `RAT` would be the exact confusion §9.2 exists to prevent — different audience, different policy, different screen section. An area code is cheap; a miscategorised requirement is permanent.
- **Supersedes:** nothing — `00-overview.md` §5's table is extended from 22 areas to 24.
- **Documents changed:** `00-overview.md` §5 and §8, `01-prd.md` §23 · §24 · §25, `TRACEABILITY.md`

---

## DEC-071 — A derived phase governs what a session offers; the clock is authoritative for the screen, the clock *job* for the database

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §5.1), approved by the owner 2026-09-15
- **Decision:** `src/lib/session-status.ts` publishes **three pure functions, not one enum**, using the database's own spellings: **`sessionPhase(session, now)`** → `draft | pending_schedule | open | live | ended | cancelled` (lifecycle × clock, total), **`seatState(session, counts)`** → `unlimited | available | full | closed` (capacity, presentation only, never gates a write), and **`viewerRelation(session, viewer)`** → `none | confirmed | waitlisted | attended | absent | presenter | staff` (read from the viewer's own rows, never inferred). `<SessionStatusBadge phase seat />` composes the first two into one label, so «قائمة انتظار» and «يُغلق التسجيل قريبًا» are derivations rather than states. The `OR published and …` clauses in `sessionPhase` are the fix for ask 4: a `published` session past its end reads `ended` on screen even while the clock job lags.
- **Rationale:** the obvious design — one nine-value `sessionStatus()` — was tried and failed three ways. It conflated three independent axes (`waitlist` is capacity, `closing` is clock, neither is lifecycle); it was **not total** (a `published` session with a null `starts_at` matched no branch, and those exist); and it renamed a database state for no reason (`pending_schedule` → `awaiting_schedule`), which guarantees someone eventually compares the two. The affordance table it was meant to drive also depends on a fourth thing an enum cannot carry — **who is looking**.
- **Supersedes:** nothing. It is presentation over `sessions.state`, which is unchanged.
- **Documents changed:** `16` §5.0–§5.2, `01-prd.md` (`REQ-UIX-003`, `REQ-UIX-004`), `09-sitemap-screens.md` §7.2

---

## DEC-072 — The shell gains a bottom tab bar below `md`; the `<details>` disclosure is retired

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §6.1), approved by the owner 2026-09-15
- **Decision:** `src/app/[locale]/app/layout.tsx` is replaced: **two rows on desktop** (wordmark · تصفّح ▾ · persistent search · bell · account menu) and **one row plus a bottom tab bar on phone** (الرئيسية · الجلسات · اقترح · حسابي). The `<details>` disclosure holding both consoles and sign-out is retired; staff links move into a ruled section of the account menu on desktop and into the drawer on phone. `PageHeader` becomes a primitive — breadcrumb, eyebrow, title, description, actions — used by every screen.
- **Rationale:** the current shell shows **three** items on a phone and eight on a desktop, and there is **no search anywhere in the navigation** of a product whose core object is a searchable session. The shipped file's own comment records why a second *top* row was rejected: it pushed the RSVP action past the fold and broke `REQ-SES-013`. A bottom bar costs **zero vertical space at the top**, so that constraint is satisfied more comfortably rather than weakened.
- **Consequence that must not be missed:** `app/layout.tsx:156` has **no bottom padding**, so a fixed, safe-area-padded bottom bar covers the last ~64 px of **all 49 app screens at once**. The `padding-block-end` ships in the **same commit** as the bar, and the proof capture is a 390 px screenshot of an **old, untouched** screen.
- **Supersedes:** nothing. `REQ-SES-013` is unchanged and better served.
- **Documents changed:** `16` §3.1 · §6.1, `01-prd.md` (`REQ-UIX-002`, `REQ-UIX-017`), `09-sitemap-screens.md`

---

## DEC-073 — Status colours `live` and `ended` are platform constants, not brand-kit tokens

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §4.1), approved by the owner 2026-09-15
- **Decision:** `--color-live`, `--color-live-bg`, `--color-live-on-dark`, `--color-ended` and `--color-ended-bg` join `--color-error` and `--color-success` as **functional, non-brand** tokens in `src/app/globals.css`. They are **not** added to `BRAND_COLOUR_TOKENS`, and a teammate must not try.
- **Rationale:** `BRAND_COLOUR_TOKENS` (`packages/designer-runtime/src/brand.ts:21`) is a nine-entry `as const` shared by three consumers at once — the app's `.brand-org` theme layer, the designer's templates (where `0055`'s `design_template_versions_guard` refuses a hex literal outright) and the email renderer — and `brandColourSet` is `z.object(...).strict()`. Adding two entries would move the parity goldens, widen a strict schema, and let an org recolour what «أُلغيت» means. **A status colour must mean the same thing in every organisation**, which is precisely why it is a platform constant. The org theme restyles the card the badge sits on; it does not restyle the badge.
- **Consequence, discharged in M13:** an org may override `light_canvas`/`light_surface` to any `^#[0-9a-f]{6}$` string (`0068_brand_kits.sql:69-70` — a regex and no other constraint) while the status backgrounds stay near-white and frozen. `branding` adds the status pairs to the contrast set and makes `save_brand_kit()` **refuse** a palette on which a status badge fails AA (`16` §16.6). `checkContrast()` exists today (`src/lib/brand/contrast.ts:38`) but is advisory only.
- **Supersedes:** nothing.
- **Documents changed:** `16` §4.1 · §16.6, `10-i18n-rtl.md` (token list), `01-prd.md` (`REQ-UIX-003`)

---

## DEC-074 — The survey is a separate instrument from the rating: same eligibility and window, different audience

- **Date:** 2026-09-15 · **Decided by:** owner (ask 10), designed in `16` §9.2
- **Decision:** a new area `SUR` and four entities — `surveys` (one per session, optional, from a reusable `survey_templates` row), `survey_questions` (ordered, typed `scale_1_5 | single_choice | multi_choice | free_text`, each required or not), `survey_responses` (one per member per survey) and `survey_answers`. **Who may answer:** exactly who may rate — a checked-in attendee inside `REQ-RAT-003`'s 14-day window — so a member answers one thing once, on one screen. **Who may read results:** `admin` **and** `moderator` of the owning org. **Not the presenter** — by policy, not by a UI condition. Results live on `/app/admin/sessions/[id]/survey` (**SCR-064**). `org_id` on all four tables, a full policy set, generated isolation-sweep coverage: invariant 5, no exception requested.
- **Rationale:** `REQ-RAT-004` makes ratings anonymous **and visible to the presenter** above `REQ-RAT-006`'s minimum of three. A survey is an instrument the *organisation* reads. A presenter reading a survey aggregate would be indistinguishable from the rating aggregate they already get, which would make the whole ask pointless.
- **Supersedes:** nothing. `RAT` is untouched except for `DEC-094`'s coarsening of `submitted_at`.
- **Documents changed:** `16` §9.2, `01-prd.md` §24 (`REQ-SUR-001` … `REQ-SUR-009`), `02-domain-model.md` §4 (four entities, under this entry), `03-permissions-rls.md` §8.2, `04-architecture.md` §4 (the route), `09-sitemap-screens.md` (SCR-064), migration `0085`

---

## DEC-075 — The proposal is the source of session content; `create_session()` copies every field

- **Date:** 2026-09-15 · **Decided by:** owner (ask 3: «the proposer enters the information; the admin only changes settings»)
- **Decision:** *the proposer writes the session; the admin schedules it.* `create_session()` copies **every** proposal field, not four. `target_audience` and `expected_duration_minutes` exist on `proposals` (`0010_m2_schema.sql:38-39`) and are **dropped on the floor** today; they are added to `sessions` and copied, and `expected_duration_minutes` **pre-fills** the schedule form's duration instead of being asked again. SCR-043 is re-cut into two tabs — **«المحتوى»**, the proposal's fields shown read-only behind an explicit «تعديل المحتوى» that records who changed what and notifies the proposer, and **«الإعدادات»**, where an admin normally lives. The admin's direct-create path stays (`0020`) but is demoted behind «إنشاء بدون مقترح». The proposal review card gains a diff view when an admin has edited content.
- **Rationale:** `create_session()` (`0020_session_creation.sql:64-68`, insert at `:75`) copies title, abstract, category and level, plus the accepted presenters at `:86-93`, and nothing else — so `schedule-form.tsx:89-107` defaults duration to `initial.durationMinutes || "60"` with no prefill, and an admin re-types what a proposer already wrote. Re-typing is where content drifts from what was approved.
- **Supersedes:** nothing — `REQ-SES-001` is extended by `REQ-PRO-009`.
- **Documents changed:** `16` §9.1, `01-prd.md` (`REQ-PRO-009`, `REQ-PRO-010`, `REQ-SES-014`), `09-sitemap-screens.md` SCR-043, migration `0084`

---

## DEC-076 — Staff photo downloads are audited acts; album downloads are a worker job, not a request

- **Date:** 2026-09-15 · **Decided by:** owner (ask 7), designed in `16` §9.5
- **Decision:** downloads are **reach, not plumbing** — `signExportUrl()` already mints a five-minute signed URL through `exports_storage_read` and three screens already consume it with a plain `<a href … download>`. (1) **Poster:** a «تنزيل» menu on the event page and SCR-043, visible to `admin`, `moderator` and the session's own presenters, listing each ready artifact (master 4:5, square, story, OG, print PDF) and calling the same `signExportUrl()`. (2) **Photos:** the real work — nothing in `src/components/photos/` downloads anything and photos sit under a different prefix with a different read policy, so they need their own signer; per photo for any viewer who may see it, and **«تنزيل الكل»** for staff through a new **`JOB-zip_session_photos`** (the 35th job) that writes a zip to storage and notifies when ready. (3) **Both are audited** — `0086` adds the audit action rows and nothing else.
- **Rationale:** zipping in a request blocks a Vercel function on an album of 300 photos. A staff download of member-uploaded photographs is exactly the kind of act `12-security-privacy.md` expects in `audit_log`. EXIF is already stripped at upload (`REQ-EVT-012`), so the download serves the stripped file — the only file that exists.
- **Supersedes:** nothing.
- **Documents changed:** `16` §9.5, `01-prd.md` (`REQ-ADM-021`, `REQ-DSG-027`), `11-background-jobs.md` §2.4 (`JOB-zip_session_photos`), `12-security-privacy.md` (audit actions), migration `0086`

---

## DEC-077 — The studio gains direct manipulation, closing `REQ-DSG-022`; the engine is unchanged

- **Date:** 2026-09-15 · **Decided by:** owner (ask 12), designed in `16` §10
- **Decision:** the editor is rebuilt to the industry pattern — top bar (back, inline-renamable title, state chip, undo/redo, preview, export menu), a tabbed left rail, the artboard, an inspector accordion showing only the sections the selected layer has, and a **variant strip** of live thumbnails. The canvas gains **drag, eight-handle resize, rotate, snap, arrow-key nudge, marquee multi-select and group align/distribute**. The iframe stays pointer-inert; all interaction is in the overlay in document coordinates, and snapping reuses the `snap`/`snapTargets` exports that are **already written and currently driven only by number entry** (`editor.tsx:6`, `:250-253`). The checks panel is promoted to a persistent badge with a count and click-to-select-the-offending-layer. **Nothing below the editor changes:** one renderer shared by editor, worker and parity suite (DEC-017), the iframe canvas carrying `renderDocumentToHtml()`'s real output, bindings from real rows, Tier-A parity on every render, the font set by SHA-256 (DEC-031), autosave over a Route Handler, fifty-step undo.
- **Rationale:** `editor.tsx:243` records that dragging is *deliberately absent*, so an admin positions a layer by typing numbers — and `REQ-DSG-022` has required "layers with alignment guides and snapping" and "focal-point cropping" since the PRD was written. The maths is built and unused by any pointer.
- **Supersedes:** the "deliberately absent" note at `editor.tsx:243`. `REQ-DSG-022` is closed by `REQ-DSG-028` … `REQ-DSG-030`.
- **Documents changed:** `16` §10.1–§10.3, `01-prd.md` (`REQ-DSG-028` … `REQ-DSG-031`), `06-visual-designer.md`, `09-sitemap-screens.md` SCR-057 · SCR-045, migration `0087`

---

## DEC-078 — Invariant 1 is not deleted, it is re-cut: URLs, registration behaviour and the accessibility floor stay frozen; appearance moves

- **Date:** 2026-09-15 · **Decided by:** owner (`DEC-069` scope), designed in `16` §14
- **Decision:** the invariant becomes: **`/`, `/ar`, `/en`, `/ar/register` and `/og.png` are a live public contract. Their URLs, their registration behaviour and their accessibility floor may never regress, and `scripts/qa.mjs` guards them in CI. Their appearance may change only through a `DECISIONS.md` entry and a re-baselined visual diff.** In M13: `qa.mjs` splits into **`qa:contract`** (behavioural, unchanged, still blocking) and **`qa:appearance`** (design-coupled, rewritten against the new design in the same commit); `npm run visual capture pre-redesign` is taken from `main` **before** the branch; `registrations` is not touched (invariant 2, DEC-002) and the register form's action, field names, validation and no-JS path are preserved byte-for-byte.
- **The split, counted rather than estimated:** `qa.mjs` has **44** `check()` call sites, all 44 carrying a literal string label (the eight that look computed are multi-line calls whose label sits on a later line: `:94`, `:110`, `:182`, `:220`, `:261`, `:305`, `:351`, `:404`). **28 are behavioural** — the role round-trip and its two value-retention checks, the error summary, focus to first invalid, on-blur email and its clear-on-fix, the success panel and its focus move, the invite button and its two link assertions, the provider description block, the duplicate panel, five no-JS cases, both no-horizontal-scroll checks, the 16 px input floor, both `dir` assertions, the `/`→`/ar` redirect. **13 are appearance-coupled** — `:101` `:119` `:127` `:320` `:324` `:330` `:367` `:373` `:374` `:379` `:386` `:404` `:416`. **3 assert behavioural intent on an appearance element** — `:342` `:346` `:351`, the reduced-motion trio, which cannot survive verbatim if the sting and the WebGL constellation go and must be re-expressed against whatever replaces them **without weakening the guarantee**. So `qa:contract` is 28, or 31 if the third bucket is re-expressed rather than moved.
- **Rationale:** two-thirds of the suite is behaviour that *should* hold forever and is in fact the standard the rest of the product now adopts. Freezing appearance alongside it was an accident of packaging. Note `:119` — the mirrored network SVG — is design-coupled and is the check most likely to be missed, because it reads like an RTL contract test.
- **Supersedes:** **invariant 1 as written in `CLAUDE.md` and `14-roadmap.md` §1.3**, from M13 onward. Until M13 the old invariant holds verbatim: `npm run qa` stays 44/44 and `npm run visual` stays 0.000%.
- **Documents changed:** `16` §14, `CLAUDE.md` (invariant 1, at M13), `14-roadmap.md` §1, `01-prd.md` `REQ-NFR-019` (at M13), `13-testing-quality.md`

---

## DEC-079 — The client brief's icon ban is split by surface: the marketing site keeps the eight glyphs, the app gets a house-drawn set

- **Date:** 2026-09-15 · **Decided by:** owner
- **Decision:** `.impeccable.md` records the client brief's rule — *icon libraries, emoji and photography are banned; permitted glyphs are dots, lines, chevron, check and spinner* — and `icons.tsx` ships exactly those eight. **That rule was written for the marketing site and is wrong for the app.** It splits: **marketing** (`/`, `/ar`, `/en`, `/ar/register`) keeps the eight glyphs unchanged; **the app, the consoles and the studio** get a **house icon set of thirty-two**, each with a one-word Arabic name in the gallery — search · filter · sort · bookmark (outline + filled) · share · download · upload · calendar · clock · pin · users · user · star · check-circle · alert-circle · alert-triangle · info · chevron · arrow · plus · close · menu · more · image · lock · eye · trash · link · dot · line · spinner. Direction-aware glyphs flip by *logical* axis.
- **Three conditions carry the brief's real intent forward.** (1) **Hand-authored inline SVG; no icon dependency, ever** — not Lucide, not Heroicons, not Phosphor: the tell is not that an interface has icons, it is that it has *someone else's*. (2) **One drawing spec** — a 24 px grid, 1.7 px stroke, round caps and joins, 2 px minimum interior gap, geometry built from the same circles and straight lines the eight glyphs use; the dot and the line stay the family's ancestors. (3) **The forbidden *imagery* stands on both surfaces** — no open books, graduation caps, lightbulbs, mortarboards or cartoon illustrations. A calendar is a calendar; a lightbulb is never an idea.
- **Icons never travel alone in a primary action.** An icon-only control ships only where the meaning is unambiguous and the accessible name is on the element — `REQ-NFR-007`, not a style rule.
- **Rationale:** a landing page carries its meaning in one metaphor and any stock icon cheapens it. A console of 31 admin and platform screens is the opposite problem: a bottom tab bar with no icons is not a tab bar, a dense admin table with no row affordances is a wall of text, and every control forced to carry a word makes the interface heavier, not purer.
- **Supersedes:** `.impeccable.md`'s glyph rule **for app surfaces only**. The dependency ban is unaffected and stands.
- **Documents changed:** `16` §4.2.1, `04-architecture.md` §11 (see `DEC-084`), `01-prd.md` `REQ-NFR-007` (unchanged, cited)

---

## DEC-080 — The app adopts the brand's per-section dark/light rhythm

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §4.2.2), approved by the owner 2026-09-15
- **Decision:** the brand's rhythm is **per-section, not per-user**: dark navy cover, light content, dark close. The event page's hero — poster, title, presenters, status — sits on a `theme-dark` band and the content below it is light. **One dark band per screen, at the top**, where the session's identity lives. The same band carries the certificate and poster previews in the studio.
- **Rationale:** `globals.css`'s `.theme-dark` and `.impeccable.md` already define this rhythm and the marketing site already reads that way. Every app screen is white, which is why the product feels like a form and the landing page feels like a film. For the studio the band is not decoration: it is the surface the artwork actually sits on.
- **Supersedes:** nothing — `.theme-dark` is used, not changed.
- **Documents changed:** `16` §4.2.2 · §6.3 · §10, `09-sitemap-screens.md` SCR-012 · SCR-057

---

## DEC-081 — Email templates are block-based, not canvas-based; `@kareem/designer-runtime` is not reused for mail

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §11.2), approved by the owner 2026-09-15
- **Decision:** the email studio is **block-based**. A template is an ordered list of nine typed blocks — `heading`, `paragraph`, `button`, `session_card`, `detail_list`, `divider`, `spacer`, `image`, `footer` — each compiling to one table row. Bindings are declared **per message key** and the editor lists them; `notification_templates_validate` gains the binding check so an unknown binding is refused by the **database**, for every writer. **The plain-text alternative is generated from the blocks, not authored twice.** `render.ts`'s existing HTML shell is correct and stays; it gains a block compiler beside its existing string path, so an org that has not touched its templates keeps **byte-identical** output and the existing golden tests do not move. The string path is removed only after every key has a block template, in M13.
- **Rationale:** `render.ts`'s header records the five constraints that make mail not-the-web — layout tables and inline CSS, `dir="rtl"` on `<html>` *and every cell* because Outlook ignores inherited direction, a fallback font stack and never a web font, numerals per the org setting, and a plain-text alternative for every message. A free-form visual editor cannot honour those and stay correct; a constrained block compiles to table HTML deterministically. This is the pattern Mailchimp, Braze, Customer.io and MJML all converge on, for this reason.
- **A reconciliation that is the email track's first task:** `DEFAULT_TEMPLATES` holds **25** `MSG-*` keys, not the 22 `08` §3.2 lists — the file's own comment at `:29-30` explains the drift. A golden suite built to 22 silently misses three keys, and an eight-template library leaves **17** unmapped, not 14.
- **Supersedes:** nothing. DEC-017's one-renderer rule is about *posters* and is unaffected — this entry states explicitly that it does not extend to mail.
- **Documents changed:** `16` §11, `01-prd.md` (`REQ-NTF-009` … `REQ-NTF-014`), `08-notifications-calendar.md` §3.2 (the 22/25 reconciliation), `02-domain-model.md` (`notification_template_blocks`), migration `0088`

---

## DEC-082 — Eight designed email templates ship platform-owned and seeded for every org, on the A27 pattern

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §11.5), approved by the owner 2026-09-15
- **Decision:** two tiers, mirroring the designer's (`REQ-DSG-008`, DEC-052). **The platform library** — eight designed templates seeded platform-owned and present for every org from creation, exactly as the A27 brand baseline is: **إعلان جلسة · تذكير · تأكيد حجز · تغيّر موعد · إلغاء · طلب تقييم · شهادة · تكريم** — each a real design (org logo band, session card, one primary button, preference footer) in light and dark, Arabic and English. **The org library** — an org duplicates a platform template and it becomes theirs; the original is never mutated. **Every one of the 25 message keys maps to a template**, and a key with no org override falls back to the platform one rather than to a paragraph of unstyled text. The brand kit drives all of it (`REQ-DSG-021`): changing the org logo restyles every message.
- **Rationale:** promotion adds, it never supplies the baseline — the same rule `0061` establishes for the A27 font baseline (DEC-052). Today the default *is* the wall of text, which is the whole of ask 13's complaint.
- **Supersedes:** nothing.
- **Documents changed:** `16` §11.5, `01-prd.md` (`REQ-NTF-014`), `08-notifications-calendar.md`, migration `0088`

---
## DEC-083 — `04-architecture.md` §4's canonical route tree is amended: the `(dev)` gallery and the survey results screen

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §4.3 · §9.2), approved by the owner 2026-09-15
- **Decision:** `04` §4 gains two routes. (1) **`/[locale]/ui`** — the component gallery, in a new **lead-owned `(dev)` route group**. It renders every primitive in every variant, in both themes and both locales, reads no data, and is where the 390 px RTL review happens and where the gallery visual baseline is captured. (2) **`/app/admin/sessions/[id]/survey`** — the survey results screen (**SCR-064**, `DEC-074`). **No route is built before this entry exists.**
- **Why the gallery is not `/app/admin/ui`:** two concrete reasons found while stress-testing. `src/app/[locale]/app/admin/**` belongs to `console` (DEC-048), so a lead-owned gallery under it is an ownership collision on day one of M9. And **`scripts/visual-diff.mjs:33` hardcodes `ROUTES = ['/ar', '/en', '/ar/register']` and has no authentication path at all** — it drives a browser at public URLs, so an admin-gated gallery is simply not capturable by the harness we have, and "the gallery visual baseline" would have been a gate that could never run.
- **How "dev-only" and "visually baselined" are reconciled — `NODE_ENV` does not do it.** `visual-diff.mjs:26` boots through `startStubbedServer`, and `scripts/lib/stubbed-server.mjs:41-44` **refuses to start without `.next`**: it serves the *production build* through `next start`. A route excluded from the production bundle makes `npm run visual` 404; a route included in it is publicly reachable on the live domain. There is no third option through `NODE_ENV`. **So it is gated at the edge:** `src/proxy.ts` returns 404 for `/[locale]/ui` unless `process.env.KAREEM_GALLERY === "1"`, and `visual-diff.mjs` sets that variable when it spawns `next start` — it already overrides the environment, which is the entire reason `stubbed-server.mjs` exists (DEC-023). Roughly six lines, deterministic, runnable in CI, never public. **`src/proxy.ts` is therefore on the critical path of M9 and is lead-only (`DEC-085`).**
- **Rationale:** `04` owns the canonical route table and everything else cites it. A route that exists in code and not in `04` is a route nobody decided about.
- **Supersedes:** nothing — `04` §4 is extended.
- **Documents changed:** `04-architecture.md` §4, `09-sitemap-screens.md` §1 and SCR-064, `16` §4.3, `src/proxy.ts`, `scripts/visual-diff.mjs`

---

## DEC-084 — `04-architecture.md` §11 is amended by `DEC-079`: the glyph rule now reads per-surface

- **Date:** 2026-09-15 · **Decided by:** architect, approved by the owner 2026-09-15
- **Decision:** `04` §11's sentence — «The permitted glyph set — dots, lines, chevron, check, spinner — ships as roughly **eight inline SVGs**» — is amended to read per-surface, per `DEC-079`: eight glyphs on marketing, a thirty-two-glyph house set for the app, the consoles and the studio, hand-authored inline SVG under one drawing spec. **The ban on `lucide-react` — and on any icon library — *as a dependency* is unaffected and stands**, and so does the ban on education-cliché imagery.
- **Rationale:** `04` §11 is where a teammate looks up what the UI foundation permits. Leaving it saying "eight" while the app ships thirty-two would make the document wrong in the one place it is consulted, and would invite someone to "fix" the app back.
- **Supersedes:** `04` §11's glyph-count sentence.
- **Documents changed:** `04-architecture.md` §11

---

## DEC-085 — `CLAUDE.md`'s lead-only list is amended and all ten agent definitions are regenerated; four ownership transfers are recorded

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §16.1), approved by the owner 2026-09-15
- **Decision:** **no wave-5 teammate is spawned before this lands.** (1) `CLAUDE.md`'s lead-only path list gains **`src/components/ui/index.ts`**, `src/app/globals.css`, `src/app/[locale]/app/{layout,page}.tsx`, `src/app/[locale]/app/me/layout.tsx`, `src/lib/session-status.ts`, `src/lib/form-state.ts`, **`src/proxy.ts`**, `src/app/[locale]/(dev)/**` and `src/messages/*/ui.json`. (2) **Every one of the ten `.claude/agents/*.md` is regenerated in the same commit**, with per-file `ui/` ownership spelled out as **literal file lists, not globs**, and with a never-touch paragraph that names `src/components/ui/**` (minus that track's own files), `src/app/globals.css` and the app shell. (3) Four **ownership transfers** are recorded: `src/app/[locale]/app/sessions/page.tsx`, `src/components/browse/**` and `src/messages/*/browse.json` **`console` → `content`** (all three are `console`'s under DEC-048, `TEAM.md:69`); `src/app/[locale]/app/admin/emails/**` **`console` → `notify`** for M12 and thereafter; and `src/app/[locale]/app/members/**`, which is in **no** edit list anywhere today, **to `scoring`**.
- **Rationale, verified against the tree:** `src/components/ui/**` appears in **no teammate's edit list and — more dangerously — in no teammate's never-touch list**. `console.md:26` enumerates fourteen component directories to avoid and omits `ui`. Today that is harmless: three files. The moment it holds thirty-one primitives it is the most-contended directory in the repository and nothing forbids anyone from editing it. `src/app/globals.css` is lead-only **by folklore** — absent from `CLAUDE.md`'s list and forbidden only in `branding.md:26`; the wave-1 agents (`sessions`, `checkin`, `event`, written before the shell mattered) forbid neither it nor the app shell. `src/app/[locale]/app/layout.tsx` is likewise absent from the lead-only list though seven of the ten agents happen to forbid it. **Ownership lives in those never-touch paragraphs or it does not exist.**
- **Supersedes:** DEC-048's assignment of `app/sessions/page.tsx`, `components/browse/**` and `messages/*/browse.json` to `console`; DEC-042's and DEC-046's carve-out of `app/admin/emails/**` to `console`, from M12.
- **Documents changed:** `CLAUDE.md` (lead-only list, the wave-5 ownership map), `.claude/agents/*.md` (all ten), `docs/plan/TEAM.md` §1, `16` §16.1 · §16.2

---

## DEC-086 — `09-sitemap-screens.md` is not edited, it is annotated

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §13), approved by the owner 2026-09-15
- **Decision:** `09` keeps the screen inventory and `16` owns the appearance. Each screen `09` describes gains a **one-line pointer** to the `16` section that supersedes its visual notes; its purpose, roles, states, primary action and RTL notes are untouched. New screens (`SCR-007` the public session card, `SCR-064` the survey results) are added to `09` in the normal way, because `09` owns the `SCR-*` ID space.
- **Rationale:** rewriting 53 screen blocks would produce a document that disagrees with `16` within a week and a diff nobody could review. A pointer is one line, is checkable, and keeps each document doing the one thing it owns.
- **Supersedes:** nothing.
- **Documents changed:** `09-sitemap-screens.md` (§0 pointer table, §7.2, §8)

---

## DEC-087 — CI grows from four blocking gates to fourteen, and two of them are non-trivial to build

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §17), approved by the owner 2026-09-15
- **Decision:** the four blocking gates (`qa`, `policy-diff`, `parity`, `trace`) are joined by **`ui-lint`**, **`loading-coverage`**, **`error-coverage`**, **the gallery visual baseline**, **axe (split in two)**, **the email goldens**, **the 49-cell status matrix**, **the focus-obscured spec**, **the skip-link check** and **the no-drag operability spec** — fourteen in total by M12. `13-testing-quality.md` §7's CI budget is amended with their runtime.
- **The two that must not be hand-waved.** **`ui-lint`** is not "a simple AST check": it is a `ts-morph` pass over `src/app/**` and `src/components/**`, **excluding `src/components/ui/` for both rules**, failing on (a) a JSX `<input|select|textarea>` whose nearest ancestor is not `<Field>` and (b) a string literal matching `/rounded-field border border-edge(-strong)?/`. ★ **The exclusion is not optional and applies to both rules** — `ui/input.tsx` and `ui/select.tsx` must contain a raw `<input>` that is not wrapped in `<Field>`, so a pass scoped to `src/components/**` without it **fails the primitives it exists to protect**. **`loading-coverage`** walks `src/app/[locale]/app/**` and fails when a segment declaring a `page.tsx` has **no `loading.tsx` at or above it** — the "at or above" is load-bearing, and a gate written without it produces 49 files instead of ~12.
- **Both ship with a committed allowlist that may only shrink**, and flip to hard-fail in M13. **65 files carry the copied control-class string today**; a gate that hard-fails from M9 blocks every PR for four milestones.
- **Axe is split in two, because the obvious version reports green by skipping.** `tests/e2e/a11y.spec.ts:26` is `test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY)` and `playwright.config.ts:24-26` serves the **stub** in CI, so "axe on every screen in CI" would assert nothing. So: **primitives** get `axe-core` inside the Vitest `components` project (jsdom, already configured, no server, no lock, genuinely blocking) and **screens** stay under `test:e2e:local`, sharded per track and **lead-run at sync points** — `a11y.spec.ts:31` is `describe.configure({mode:"serial"})`, so 49 screens is a long serial run holding the gate lock.
- **Rationale:** a design system without a lint rule is a convention, and a convention with four writers is a suggestion. Ten new gates is a real cost, which is why it is a decision and not a detail.
- **Supersedes:** nothing — `13` §7's gate list is extended.
- **Documents changed:** `13-testing-quality.md` §7 and §10, `16` §17, `scripts/**`, `.github/workflows/**`

---

## DEC-088 — The `TaskCompleted` hook is made path-aware before wave 5 opens

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §16.1), approved by the owner 2026-09-15
- **Decision:** `.claude/hooks/task-gate.sh` becomes **path-aware**. It runs `npx tsc --noEmit && npm run lint && npx vitest run` — **no server, no lock** — and falls through to the full `npm run qa` only when the changed paths intersect `src/app/[locale]/(marketing)/**`, `public/**`, `src/app/[locale]/layout.tsx`, `src/app/globals.css`, `src/proxy.ts` or the marketing components. Roughly twenty lines, in a lead-only file.
- **Rationale:** `.claude/settings.json` registers the hook on **`TaskCompleted`** with a 2400-second timeout and the script runs the **full `npm run qa`** — stub, `next start`, Puppeteer — holding `/tmp/task-gate.lock`, **every time any teammate finishes any task**. A teammate cannot opt out by policy, so §16.1's "`qa` is lead-only" rule was unenforceable: **the hook is the harness and the harness wins.** Four teammates × roughly six stories is about twenty-four forced `qa` runs per wave that the rule believes are not happening. And `scripts/lib/gate-lock.mjs:22-23` lets a waiter **give up after 20 minutes and proceed anyway** — two `next start` processes on port 3000. `npm run qa` guards the frozen marketing routes; a task that touched only `app/admin/**` cannot have broken them. During M9 the lead touches `globals.css` and still pays the full cost; the teammates stop paying it two dozen times a wave.
- **Supersedes:** nothing — it makes `16` §16.1's lock rule enforceable rather than aspirational.
- **Documents changed:** `.claude/hooks/task-gate.sh`, `CLAUDE.md` (the gate-lock paragraph), `16` §16.1

---

## DEC-089 — Session objectives are a `text[]` on `proposals` and `sessions`, not a fourth entity

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §9.3), approved by the owner 2026-09-15
- **Decision:** ask 9's **أهداف التعلّم** is a column on both `proposals` and `sessions`:

  ```sql
  objectives text[] not null default '{}'
    check (cardinality(objectives) <= 8)
    check (not exists (select 1 from unnest(objectives) o where length(o) > 140 or btrim(o) = ''))
  ```

  `REQ-SES-014`'s acceptance — ordered, ≤ 140 characters each, at most 8 — is satisfied by the array order and the two checks. `0082` carries it; `0084`'s `create_session()` copies it like any other proposal column.
- **Rationale:** invariant 5 means every table has an `org_id`, RLS, a full policy set and a test. A fourth entity for an ordered list of at most eight short strings buys a join, a policy set, four more rows in `03` §8.2 and a new line in the generated isolation sweep — to model something with **no identity, no lifecycle and no independent access rule**. An earlier draft of `16` referred to `session_objectives` in one place and a column in another; the difference is expensive and is settled here.
- **If objectives ever grow an identity of their own** — per-objective completion, say — that is a new entity with a migration and a decision, **not a refactor smuggled in later**.
- **Supersedes:** nothing.
- **Documents changed:** `16` §9.3, `01-prd.md` (`REQ-SES-014`, `REQ-PRO-010`), `02-domain-model.md` (two columns, under this entry), migration `0082`

---

## DEC-090 — The affordance rule: commitment before convenience, and a derived phase may only ever REMOVE an affordance

- **Date:** 2026-09-15 · **Decided by:** owner («how can a user add a session to their calendar without registering for it? It should be an option after the registration flow»), generalised in `16` §5.4
- **Decision:** **an affordance appears only when the state that gives it meaning exists.** Two corollaries. (1) **Commitment before convenience** — diarising a session, preparing for it and checking into it are downstream of *deciding to attend it*; they belong to the **confirmed** state, revealed by the act of reserving, not standing beside the primary action competing with it. (2) ★ **The derived phase may only ever REMOVE an affordance, never add one.** Hiding a register button the database would still honour costs a member nothing; showing a *rate* button because the clock says `ended` when `complete_session` has not run means the member clicks and the RPC refuses. **RLS and the RPCs are authoritative; `sessionPhase()` may only be more conservative than the stored state, never less.** One unit test asserts the direction for every phase pair. This is a correction to `16` §5.1's own clock-over-job rule, which is safe in one direction only.
- **The sweep found eight instances, of which five are live in the shipped application:**
  1. **«أضف إلى التقويم» to a viewer with no seat** — `components/calendar/add-to-calendar.tsx:22-23` gates on `!session || session.cancelled` **and nothing else**. Any viewer, any scheduled session. *(live)*
  2. **The calendar offered to a waitlisted member** — same code path. A waitlist place is not a seat; it appears when the promotion does, and `MSG-rsvp_promoted` already carries the ICS. *(live)*
  3. **Pre-session tasks shown to a viewer with no seat** — `components/tasks/panel.tsx:16` calls `getTasksPageData()` with no RSVP condition. `REQ-TSK-002` is untouched: tasks stay reminder-only and are never read by check-in. *(live)*
  4. ★ **«سجّل حضورك» offered to a viewer who never reserved** — **the worst of the eight.** `app/sessions/[id]/page.tsx:225` gates the check-in link on `state === "in_progress" && !viewerIsPresenter` **and nothing else**, and renders it as the **primary navy button**, so any member sees it on any live session; `check-in/page.tsx:10` lists `reservation_required` among its known errors, **so the RPC refuses**. The full loop is: a primary button → a screen where you type six characters standing up, under time pressure → «لم تحجز مقعدًا». Gate on `confirmed`, or on `none` when that session's walk-in switch is on (DEC-065). **M9 story, not M10.** *(live)*
  5. **The check-in screen does not know which session it is** — `check-in/page.tsx` calls `requireSession()` then renders the code form for **any** session id: no title, no phase read, no RSVP read. It renders happily for a `draft`, a `cancelled`, or a session that ended last March. It must read the session, show its title and `sessionPhase()`, and render the reason in place of the form when the phase or relation is ineligible. The RPC stays authoritative; the screen stops lying. *(live)*
  6. **The host view and the admin links have no phase gate** — `page.tsx:235` renders «عرض المُقدِّم» for `viewerIsPresenter || viewerIsStaff` with no phase condition, and `:244-253` does the same for the staff links. The host view is `live` (and `open`, for the pre-flight); attendance management is `live` and `ended`. *(live)*
  7. **A rate CTA the database will refuse** — introduced by the clock-over-job rule itself; fixed by corollary 2.
  8. **«نزّل شهادتك» before a certificate exists** — issuance is a deliberate staff act that may not have happened. Render on the certificate **row**, not on the attendance fact; the ended page says «الشهادات لم تُصدر بعد» once, quietly.
- **The pattern to copy, which the sweep found already correct:** `getPhotosPageData()` (`lib/dal/photos.ts:146`) computes `canUpload: !!checkedIn || !!presents || isStaff` and `gallery.tsx:44` renders the uploader on it. The capability is derived in the DAL, returned in the DTO, and the component renders on it rather than re-deriving.
- **What "after the registration flow" means:** not a second screen. The action card has **two states** and reserving swaps one for the other — before, one primary «احجز مقعدًا»; after, «أضف إلى التقويم» plus the tasks. **The reveal is the receipt**: a confirmation that only says «تم» teaches nothing. Both states are a **server render of `viewerRelation`**, so they survive a reload and JavaScript being off, and the member arriving from the confirmation email sees the after state.
- **Supersedes:** the shipped gating in the five files named above.
- **Documents changed:** `16` §5.4 – §5.4.2, `01-prd.md` (`REQ-UIX-015`, `REQ-UIX-004`), `09-sitemap-screens.md` SCR-012 · SCR-014 · SCR-016

---

## DEC-091 — A failure model to match the loading model, and focus management against four sticky layers

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §3.1 · §7.4), approved by the owner 2026-09-15
- **Decision, part 1 — the failure model.** `find src -name "error.tsx"` returns **zero**; `global-error.tsx`: zero; there is one `not-found.tsx`, in marketing. So: an **`error.tsx` at every boundary that has a `loading.tsx`** — the same ~12 — rendering a shared `<RouteError>` (what happened in one sentence, a **retry** wired to `reset()`, a way back to `/app`; never a stack trace, never an error code as the headline); a **`not-found.tsx` per dynamic segment** (`notFound()` is already called in six places with no boundary to catch it); and **`global-error.tsx`, the one file in the product that may hard-code Arabic and `dir="rtl"`** — it replaces the root layout, so there is no `NextIntlClientProvider` and no `<html lang>` above it and `getTranslations` is unavailable **by construction**. `error-coverage` joins `loading-coverage` as a gate over the same segment list.
- **Decision, part 2 — focus.** `SC 2.4.1` **Bypass Blocks**: a **skip link** becomes the first focusable element in the shell, visually hidden until focused, targeting the existing `<main id="main">`; console pages get a second skip past the rail. `SC 2.4.11` **Focus Not Obscured (Minimum)**: `--header-h`, `--subnav-h` and `--tabbar-h` drive `html { scroll-padding-block-start / -end }` and `[id] { scroll-margin-block-start }`, and a **Playwright gate** tabs every focusable element on the event page and the proposal form at 390 px and desktop, reads the focused element's `getBoundingClientRect()`, **asserts at most one fixed bottom bar per screen**, and **fails when a fixed or sticky element intersects the focused element**.
- **Rationale:** every `/app/**` route is dynamic and touches the DAL. A Supabase timeout, an RLS `42501`, a `getClaims()` union landing on the no-session branch or an expired signed URL renders **Next's default error page: English, left-to-right, no shell, no wordmark** — the single least Arabic surface in the application, and nobody has ever seen it. On focus: `grep -rn "scroll-padding\|scroll-margin" src/` returns **nothing** today, and this plan **creates the hazard** — it adds four sticky layers. It also silently breaks `16` §8.2 item 4: `<FormSummary>`'s links "jump to and focus the field", and an anchor jump under a sticky header lands the focused control behind it — the accessibility feature defeating itself. Neither is assertable by eye, which is why both are gates.
- ★ **An ordering consequence:** `error.tsx` is a **client** component by Next's contract, so it is the one place in the app shell that cannot read the DAL. Everything it needs — the locale, the `/app` link — comes from props or the route.
- **Supersedes:** nothing — both were absent from the first draft and from the codebase.
- **Documents changed:** `16` §3.1 · §7.4, `01-prd.md` (`REQ-UIX-016`, `REQ-UIX-017`), `13-testing-quality.md`

---

## DEC-092 — `SlotProps` gains `viewerRelation`, and `getSessionForEvent()` returns it — an explicit amendment to DEC-045

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §5.4.1a), approved by the owner 2026-09-15
- **Decision:** `getSessionForEvent()` returns **`viewerRelation` once**, and `SlotProps` gains it. This is an amendment to DEC-045's "ids as props and never rows" slot contract, **made explicitly rather than by drift**. A derived enum is not a row, so the spirit of the contract survives.
- **Rationale:** `16` §5.4.1's claim that "none of them is a new query" was **wrong**. `getSessionForEvent`'s DTO (`lib/dal/sessions.ts:385-386`) carries `viewerIsPresenter` and `viewerIsStaff` and **no RSVP at all** — the viewer's seat is read *inside* `RsvpPanel`, through `getRsvpPanelData`. Gating four slots on the viewer's relation therefore either adds a viewer-RSVP read to the page DTO or makes four slots each re-read it: **four extra round trips on the product's most important page**. And "the slot takes `relation`" contradicts the contract as written — `add-to-calendar.tsx:9-12` says "ids as props and never rows".
- **Supersedes:** DEC-045's slot contract, narrowly: `SlotProps` is `{sessionId, memberId, locale, viewerRelation}`.
- **Documents changed:** `16` §5.4.1a, `docs/plan/TEAM.md` §2, `src/components/sessions/slots/**`, `src/lib/dal/sessions.ts`

---
## DEC-093 — `SC 2.5.7` is satisfied by a pointer path, not by the keyboard; the inspector's numeric fields are conformance and may not be removed

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §10.2.1), approved by the owner 2026-09-15
- **Decision:** dragging appears in **five** places in this plan, not one, and each needs a **single-pointer, non-dragging** path. (1) **Layer position, size, rotation** — ★ **the numeric X/Y/W/H/rotation fields ARE the conformance path and they stay.** `16` §10.2 calls positioning by typing numbers "the single biggest usability failure in the product", which reads as a mandate to delete them: **do not.** They are *demoted* into a collapsed «الموضع والحجم» accordion, and pointer operations that do the same job better are added beside them — **align and distribute, prominent rather than tucked away, because they are conformance and not a convenience**; «لائم المنطقة الآمنة»; «وسّط أفقيًا/رأسيًا»; tap-to-select-then-tap-to-place. (2) **Layer order** — ▲▼ on every row plus bring-to-front / send-to-back in the overflow; drag-in-list is the *enhancement*. (3) **Focal point** (`REQ-DSG-030`) — a **nine-point preset grid** beside the draggable dot; the dot refines, the grid is the path, and it is what a phone user actually wants. (4) **Objectives, email blocks, survey questions** — ▲▼ on every row: **three lists, one primitive**, `ui/reorderable-list`, built once, buttons first, drag layered on. (5) **Marquee multi-select** — shift-click on the canvas and "select all of this layer type" in the left rail; a marquee has **no** non-drag equivalent, so it must never be the only way to select more than one object. **The exception we claim, claimed out loud:** the eight resize handles may take 2.5.7's *essential* exception for the handle affordance itself — **but only because the numeric fields and the align buttons provide the function.**
- **`REQ-DSG-028` is written with the corrected criterion**: "…with a **single-pointer, non-dragging alternative for every dragged operation**, and full keyboard parity" — not "…with full keyboard parity", which encodes the wrong success criterion.
- **Rationale:** an earlier draft answered dragging with keyboard parity. **That is `SC 2.1.1`. `SC 2.5.7` Dragging Movements (AA, new in WCAG 2.2) is separate**: any function operated by a dragging movement must also be operable by a single pointer without dragging — a tap, path-independent. It exists for the touch user with a tremor or limited dexterity, **on a phone, with no keyboard attached**, which is most of this product's population and the whole reason every screen gets a 390 px review. A studio that is fully keyboard-operable and drag-only by pointer **fails 2.5.7 while passing every other test this plan proposes**. This entry exists so that an auditor gets an answer and, more importantly, so that a teammate who later "cleans up" the number fields discovers they are load-bearing before deleting them.
- **One gate proves it, and axe never will:** a Playwright case that performs **every** studio operation using `page.click()` only — no `mouse.down/move/up` — and asserts the document changed.
- **Supersedes:** the keyboard-parity-only reading of `REQ-DSG-022`.
- **Documents changed:** `16` §10.2.1, `01-prd.md` (`REQ-DSG-028`), `13-testing-quality.md`, `06-visual-designer.md`

---

## DEC-094 — The rating and the survey are written DECORRELATED in time; `ratings.submitted_at` coarsens to the day

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §9.2a), approved by the owner 2026-09-15
- **Decision:** `REQ-SUR-004`'s "one screen" stands; **"one submit, one transaction" does not.** (1) **Two writes, decorrelated** — the rating is written by the action; the survey response is enqueued through `public.enqueue_job()` with a **jittered delay**, with **no shared request id, correlation id or client-generated key**. (2) **`ratings.submitted_at` coarsens to the day** — nothing reads it at minute precision; the presenter sees an aggregate withheld below three. (3) ★ **`REQ-SUR-006`'s minimum-count withhold covers distributions, not only free text** — a five-point distribution over four responses in a twelve-person session, read against the attendance list the same admin can see, identifies people by inference. Small-n disclosure control applies to **every question type**. (4) **The one test that would have caught it**, in the RLS suite beside `REQ-SUR-005`'s case: for any member, the set of ratings whose `submitted_at` falls within ±N minutes of their survey response is **not of size 1**.
- **Rationale, read from the migrations rather than assumed.** `ratings` carries `member_id` **and** `submitted_at` (`0010_m2_schema.sql:375, 380`). Anonymity is enforced **by a view, not by storage** — `session_rating_aggregates`, `security_invoker = off`. **An org `admin` may already read attributed ratings** (`ratings_read_admin`, `0010:576-577`) and `is_org_admin()` is `role = 'admin'` **only** (`0003:40-43`); **a `moderator` may not** — `is_staff()` is the admin-or-moderator test (`0003:45-48`) and `ratings` does not use it. So attribution is **deliberately an admin-only capability**: `REQ-RAT-004`'s anonymity is anonymity *from the presenter* and `REQ-RAT-005` is the org-admin exception. `16` §9.2 grants survey results to `admin` **and** `moderator` and would have written both rows in one transaction. That does not hand a moderator a join through RLS — they cannot read `ratings` at all — but it does three things: it **converts an enforced role boundary into a property of two timestamps**, leaked into every backup, audited CSV, worker log line, Sentry breadcrumb and `--data-only` dump; it is **irreversible for whoever it affects first** (once written correlated, always correlated — a fix next quarter does not protect the people who answered this quarter); and **every test stays green**, because no policy changed.
- ★ **This does not exist in the shipped app, because the survey does not exist yet. It existed in this plan, and no policy test would have caught it.**
- **Supersedes:** `16` §9.2's "one submit, one transaction"; `REQ-SUR-004` is written as one screen, two writes.
- **Documents changed:** `16` §9.2 · §9.2a, `01-prd.md` (`REQ-SUR-004`, `REQ-SUR-006`, `REQ-SUR-009`), `02-domain-model.md` (`ratings.submitted_at` precision), `03-permissions-rls.md` §8.2, `12-security-privacy.md`, migration `0085`

---

## DEC-095 — Numerals follow the org setting for display only; every machine-readable surface is Western

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §9.2b), approved by the owner 2026-09-15
- **Decision:** the rule, for `10-i18n-rtl.md` §5.2: **numerals follow the org setting for *display*. Inputs, CSV, serials, verification codes, URLs, filenames and every machine-readable surface stay `nu-latn`, always.** `REQ-SUR-007` as drafted exported survey results «in the org's numerals»; it does not.
- **Rationale:** **Arabic-Indic digits break numeric parsing in Excel and Google Sheets** — every column lands as text and every downstream sum is wrong, on an export that is audited and therefore trusted. The same class, and worse: a **certificate serial** and a **verification code** are identifiers, not quantities; rendered Arabic-Indic on the PDF and Western on `/verify/[code]`, **the one public proof artefact this platform has fails to verify**.
- **Supersedes:** the org-numerals reading of `REQ-INT-006` for machine-readable surfaces; `REQ-INT-010` states the boundary.
- **Documents changed:** `16` §9.2b, `01-prd.md` (`REQ-INT-010`), `10-i18n-rtl.md` §5.2, `01-prd.md` `REQ-CRT-009` (cited, unchanged)

---

## DEC-096 — Align, distribute and rulers follow the DOCUMENT's direction, not the console's

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §10.2.2), approved by the owner 2026-09-15
- **Decision:** the artboard has its own direction, which is the **document's**, not the console's. **Align and distribute** operate on the **document's** logical axis and their icons are drawn in the **document's** direction. **Rulers** share an origin with the inspector's position fields — the **document's** start edge. **Resize handles** keep **visual** identity for the pointer (the NW handle is up-and-left on screen) and **write back to logical** coordinates. **Arrow keys** follow the **visual** axis, never the logical one — a member pressing → expects the layer to move right, and that matches Figma, Canva and Illustrator. ★ **The overlay carries a documented exemption from the logical-properties rule**: it positions handles in *document* coordinates inside a *console* DOM, so `inset-inline-start` there resolves against the console's direction and lands on the wrong side; **it must use physical `left`/`top` computed from document geometry.**
- **Rationale:** an earlier draft said "the handles, the rulers and the align buttons follow the console's direction." The arrow-key half is right; the rest is a **correctness bug**. `model.ts:19` defines `LogicalAlign = 'start' | 'center' | 'end'`, used by `TextLayer.align` (`:95`) and `DynamicFieldLayer.align` (`:130`) — **alignment is stored logically**, which is exactly what makes an LTR template variant a direction flip rather than a second layout (`10` §7.1). So "align start" computed from the *console's* direction writes a **left** intent into a logical-start field when an Arabic poster is edited in an English console, and a **right** one when the same document is opened in Arabic. **A document's render would become a function of the editor's locale** — a parity-golden drift source that is **not a font, not a renderer and not a binding**, and invisible in the diff. A ruler running console-LTR over an RTL artboard also shows a number that does not match the X the admin just typed, turning `DEC-093`'s numeric fields — now the 2.5.7 conformance path — into a **second source of truth**. Because English is not shipped (`REQ-INT-008`, OQ-024) it lies **dormant** until someone completes `en.json`, at which point templates authored months earlier start moving.
- **One test locks the whole class:** render an Arabic poster document, apply "align start" to a text layer from an `en` console and from an `ar` console, and assert the two stored documents are **byte-identical**.
- **Supersedes:** `16` §10.2's first-draft rule, which is corrected in §10.2.2. The exemption narrows `10-i18n-rtl.md`'s logical-properties rule for the designer overlay only.
- **Documents changed:** `16` §10.2.2, `10-i18n-rtl.md` (the overlay exemption), `06-visual-designer.md`, `01-prd.md` (`REQ-DSG-028`)

---

## DEC-097 — Every one of the 59 routes carries a milestone or an explicit, reasoned «leave»

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §15), approved by the owner 2026-09-15
- **Decision:** mapping all 59 `page.tsx` files against the five milestone tables found **eleven routes in none of them**, and they are placed: `(auth)/sign-in`, `(auth)/choose-org` and `(auth)/no-access` → **M9**; `app/sessions/[id]/{check-in,host,rate}`, `app/sessions/[id]/materials/[materialId]` and `s/[id]` → **M10**; `verify/[code]` → **M12**; `legal/{privacy,terms}` and `app/me/privacy` → **M13**. **And the rule that stops it recurring: a coverage table of all 59 routes**, each with a milestone or an explicit «leave».
- **Why each of the eleven cannot be left out:** `sign-in` is **the first screen every member ever sees** and the only place `SC 3.3.8` Accessible Authentication applies (allow paste, `autocomplete="one-time-code"`, never block a password manager). `choose-org` is the fork that decides which `org_id` the whole session carries, permanently. `no-access` is the product's only answer to «فتحت الرابط ولا شيء يعمل» — principle 5 applies here more than anywhere. `check-in` is «the most operationally important input in the product» (`10` §6), used standing, one-handed, under time pressure — and `DEC-090` row 5 just rewrote it. `host` is projected in front of a room, often landscape, from a shared machine with a possibly-wrong clock: **the only screen with an audience rather than a user**. `rate` appears above only as the *host* of the M11 survey and was never designed while §9.2 rebuilt what sits on it. The material viewer is the most complex RTL read surface here, and `10` §2.4 flags its next/previous direction as «the one that gets missed». `verify/[code]` is public, reached from a **printed** certificate, and is where `DEC-095`'s numeral bug fails silently. `s/[id]` is **how members actually arrive** (`.impeccable.md`'s WhatsApp entry path) and is the first impression of the redesign for everyone outside the org. The legal pages are the natural home for the accessibility statement this plan does not yet have. `app/me/privacy` is **the screen a member uses when they are unhappy**, which is the worst possible time to meet an unrebuilt page.
- **A screen absent from a plan is not a screen deferred — it is a screen nobody decided about.**
- **Supersedes:** nothing — `16` §15's milestone tables are completed, not changed.
- **Documents changed:** `16` §15, `09-sitemap-screens.md` (SCR-007, the §8 coverage table — see `DEC-102`), `14-roadmap.md`, `15-backlog.md`

---

## DEC-098 — Three Coursera borrows are corrected for scale, and the phone tab bar becomes contextual

- **Date:** 2026-09-15 · **Decided by:** architect (`16` §2.2a · §6.2 · §6.3 · §6.6), approved by the owner 2026-09-15
- **Decision, and the general rule first:** **a pattern that organises abundance becomes noise under scarcity.** Coursera's patterns are tuned to seven thousand atemporal items with a long tail; this is roughly **thirty temporal ones** with a near-term horizon, where «متى؟» outranks every other question. Three borrows do not survive the difference.
  1. **Browse is a schedule, not a store.** No nine-facet rail. A **date-grouped list is the default view** — هذا الأسبوع · الأسبوع القادم · هذا الشهر · سابقة — with **one chip row** (الحالة + التصنيف), a **top-eight tag cloud**, search in the shell, and the full facet sheet behind «المزيد من عوامل التصفية». Nine facets over ~30 sessions gives اللغة `{العربية 29, الإنجليزية 1}` and المُقدِّم twenty-five values of count 1: **a facet whose count equals the result count carries zero bits**, and the draft's own "render a zero-count facet disabled so the shape of the catalogue is legible" fills the rail with dead rows that *obscure* the shape. It also costs nine `GROUP BY` aggregates per load on a dynamic, uncached route. `REQ-DSC-005` is satisfied by the chip row. **Revisit the rail past ~200 sessions, and not before.**
  2. **Home is one «التالية لك» card, not five rails.** A member with four upcoming sessions gets the same card rendered three times under three headings, and **a horizontal scroller holding three items over a long empty track reads as broken, not generous**. Netflix rails work on catalogue depth plus repeat consumption; an internal platform has neither. What the page is instead: one hero «التالية لك» card carrying the check-in action when the phase is `live` and the due pre-session task when there is one; one plain «هذا الأسبوع» list; «اقترح موضوعًا» as a CTA band; for staff, the «يحتاج انتباهك» strip; and «من تصنيفك المفضّل» **only when `member_interests` has rows for this member**. ★ That rail does have a data source — **`member_interests` exists** (`0004_tenancy.sql:326`, `REQ-PRF-001`) — but it is **self-declared, not behavioural**, so for most members in most orgs it is empty, and the first draft never described that zero state. ★ **The zero state is the design:** when nothing is upcoming, **home *becomes* browse** — the date-grouped list inline — rather than five empty rails with a greeting on top.
  3. **The phone tab bar is CONTEXTUAL, not universal**, and the action card stays in flow on phone. The tab bar **hides on detail and immersive screens** — the event page, check-in, the host view, the materials viewer, the studio — where it is **replaced by a bottom action bar** carrying that screen's one primary action plus bookmark, share and, after commitment, calendar. Three reasons, and the third is the one that matters: a universal tab bar plus a sticky action card is **two fixed bottom bars on one screen**; navigation is not what a member came to a detail screen to do; and **it is a better answer to `REQ-SES-013` than the first draft's in-flow card** — a member who scrolls past an in-flow card has **no route back to «احجز مقعدًا»** on the one screen where the requirement demands reachability. On desktop the action card is a full-width row under the hero that becomes sticky only once it scrolls out of view, rather than a 30 %-wide column pinned beside a shorter left column, which leaves an empty gutter beneath it.
- **Supersedes:** `16`'s own first-draft §6.2, §6.3 and §6.6.
- **Documents changed:** `16` §2.2a · §6.2 · §6.3 · §6.6, `01-prd.md` (`REQ-UIX-002`), `09-sitemap-screens.md` SCR-010 · SCR-011 · SCR-012

---

## DEC-099 — Avatars are stored by the platform and the Google hotlink is retired

- **Date:** 2026-09-15 · **Decided by:** owner (*there are no profile pictures*), designed in `16` §6.8
- **Decision:** **draw what is already flowing, and fix how it got there.** `members.avatar_url` **already exists** (`0004_tenancy.sql:243`), is **already populated from Google's `picture` claim** at provisioning (`0005_tenancy_rpcs.sql:124`), is **already returned by five DAL modules** (`comments.ts:118`, `ratings.ts:260`, `members.ts:13`, `notifications.ts:448`, `event/comment-list.tsx:41`), and `proxy.ts:109` **already allows** `lh3.googleusercontent.com` in the CSP — **and no component has ever rendered it.** The value travels the whole stack and is discarded at the last step. So: **upload into our own storage** through the existing pipeline (sniffed on content not extension, **EXIF stripped** exactly as session photos are, PNG/JPEG only — **no SVG**, invariant 11, because an avatar renders inside the same privileged headless Chromium the posters do); **one path-builder entry** in `packages/storage-paths/src/content.ts`, org-prefixed, so the nightly prefix assertion (`REQ-NFR-014`) covers it the day it exists; **derivatives by the existing worker job** at 96 px and 192 px WebP — a size list, not a new job; **Google's photo offered once as an explicit import** on first sign-in («نستخدم صورتك من Google؟»), and on yes **copied**, never linked; **initials the default and the permanent fallback** — the first letter of the display name over one of six navy/silver tints chosen by a **stable hash of the member id**, not of the name, which would change when someone corrects their spelling; wrapped in `<bdi>`, and the tint never encodes role, company or status; **member-controlled** (upload, replace, remove on `/app/me`, removal immediate and real); **moderatable**, with a taken-down avatar reverting to initials rather than a broken frame; **`anonymise_members` clears it and deletes the object** and the member data export (`REQ-NFR-013`) includes it. **The `lh3.googleusercontent.com` CSP entry is removed**, so this is a net security improvement.
- **Four things wrong with the current design, which is why this is not simply "render the field":** (1) **hotlinking Google leaks every viewer to Google** — the *viewer's browser* fetches from Google on every page render, disclosing their IP and `Referer` to a third party with no role in an internal platform: a PDPL-relevant disclosure with no consent and no purpose. (2) **Those URLs rotate**, so an avatar breaks silently and nobody can tell why. (3) **No member consented and none can change it** — it is whatever Google held at provisioning, imported silently, the opposite of `REQ-NFR-012` and of `PRF-006/007`'s self-service posture. (4) **It is outside every content control the product has** — the moderation queues cover comments and photos, not avatars, and `grep` finds no `avatar_url` handling in anonymisation or the data export.
- **Six placements, and the third justifies the feature:** presenter cards on the event page (56 px); the member directory and profiles (96/160 px); ★ **the host view's attendance list (40 px) — the highest-value placement in the product**, because a host verifies people in a room, in person, against a list, and this is the one screen where a photograph does work a name cannot; comments and ratings (32 px, already fetched and drawn nowhere); the account menu (34 px); browse cards (24 px, stacked, capped at two plus a count). **Not** in leaderboards (ranking by face invites comparison the product does not want), **not** in email (Outlook blocks images by default, so an avatar there is a broken frame or a tracking pixel — initials render as text and always arrive), and **not** on posters or certificates (binding a face into `@kareem/designer-runtime` would move the parity goldens and put a member's photograph on a printed artefact nobody reviewed).
- **Rejected:** Gravatar — it discloses a hash of the member's email to a third party on every render, which is the same defect as the Google hotlink with an extra step.
- **Supersedes:** the `^https://` check on `members.avatar_url` (`0004:243`) and the CSP entry at `proxy.ts:109`, both removed by `0089`.
- **Documents changed:** `16` §6.8, `01-prd.md` (`REQ-PRF-008` … `REQ-PRF-011`), `02-domain-model.md` (`members.avatar_url`), `07-content-pipeline.md`, `12-security-privacy.md`, `src/proxy.ts`, migration `0089`

---

## DEC-100 — The app adopts the marketing site's motion vocabulary: nine moments, three tiers, no motion library

- **Date:** 2026-09-15 · **Decided by:** owner («I want more animations and fun — the like button shows an animation when clicked, once registered it shows some animation that the knowledge is preserved»), designed in `16` §7.5
- **Decision, and the interesting part first: this is not a new design problem, it is an unused asset.** `globals.css` already defines **twelve** keyframe animations — `rise-in`, `network-fade`, **`dot-pulse`**, **`ripple-ring`**, `sting-ignite`, `sting-ring`, **`sting-draw`**, `sting-pop`, `sting-wordmark`, `sting-sweep`, `sting-curtain`, `focus-pull` — used by **three files, all marketing**, while `/app` contains **no motion of any kind**. `dot-pulse` and `ripple-ring` *are*, almost exactly, the like-button animation being asked for. So the app is missing **the motion language its own landing page already speaks**, with the personality already owner-approved in `.impeccable.md`.
- **Nine moments in three tiers**, because a product where everything celebrates has celebrated nothing. **Tier 1 — two moments that carry meaning**, orchestrated, ~900 ms, once per occurrence, never repeated on a re-render: **الحجز** (the action card cross-fades to its confirmed state and, behind it, a dot ignites and a line draws to two neighbouring dots — `sting-ignite` + `sting-draw`, already written: the member's commitment *joining the network*, which is the initiative's entire metaphor doing product work instead of decorating a landing page; reduced motion: the constellation already drawn, still, with the confirmed card over it) and **تسجيل الحضور** (the six characters resolve, the field settles with a `focus-pull`, and the room's constellation gains one lit dot — operationally the most important success in the product, and today a text string). **Tier 2 — five acknowledgements**, 200–360 ms, `--ease-out`, transform and opacity only: the reaction (`dot-pulse` + `ripple-ring` — the glyph pulses once and one silver ring expands and fades; no heart, no burst, no particles; `REQ-EVT-004` says reactions earn nothing, so the motion is a *whisper*, and it is the most-repeated animation in the product), points awarded (count up over 400 ms, a hairline sweeps the row), badge/level (the badge draws its outline then fills — the one place a longer beat is earned, because it happens rarely), bookmark (120 ms, the outline fills; a private act, not an achievement), proposal submitted (one dot ignites, **alone, un-connected** — it joins the network when the session is *published*, not when it is proposed, which is also true). **Tier 3 — the connective tissue** of §7.1, which a member sees a hundred times a day and which therefore stays quiet.
- **The grammar is already settled** (`.impeccable.md`, not re-litigated): cinema, not decoration — camera and edit grammar with exponential ease-outs, **never UI-library defaults: no bounce, no elastic, no hover scale-ups, no confetti**; one metaphor everywhere — knowledge starts as a dot of light and shared becomes a network; grand but graceful — every moment degrades to *a still that could hang in the deck*; 60 fps on a mid-range phone or it does not ship.
- **Where nothing animates:** attendance lists, the moderation queue, exports, the audit log, survey results, admin tables, and **every error state** — a failure that animates is a failure that is pleased with itself. **And no avatar, badge or card scales on hover**, which is the UI-library default the brief bans by name.
- **How it is built:** CSS keyframes first, reusing the twelve that exist; the two Tier-1 moments orchestrated with the **Web Animations API**; **no motion library** — `framer-motion` is ~34 KB gzipped for what `element.animate()` does natively, and the tell is not that a product has motion, it is that it has *someone else's*. Transform and opacity only — no animated `width`, `height`, `top` or `margin`; a height change animates `grid-template-rows`; no `will-change` left on. Every Tier-1 and Tier-2 moment is a component in `ui/`, **owned by the lead**, so the vocabulary cannot drift track by track. `--dur-*` and `--ease-out` collapse to `0ms` under `prefers-reduced-motion`, declared once — **but collapsing a duration is not a reduced-motion design**: each Tier-1 moment names its own static state and the 390 px review looks at both.
- **Three gates:** a reduced-motion Playwright pass over both Tier-1 and all five Tier-2 moments asserting the end state is reached and **nothing is mid-transition** (the marketing suite already does exactly this for the sting, `qa.mjs:342-351`); a **frame budget** — the two Tier-1 moments traced on a throttled CPU profile, **any frame over 16 ms fails**; and a `ui-lint` rule failing a `@keyframes` block that touches anything but `transform`, `opacity` or `filter`, with a documented escape hatch.
- ★ **This is M10, not M9**, and not to shed load: **you cannot build the reservation animation before the reservation card exists**, and that card is M10, as is the check-in screen. Only `--dur-*` and `--ease-out` land in M9.
- **Supersedes:** nothing.
- **Documents changed:** `16` §7.5, `01-prd.md` (`REQ-UIX-014`, `REQ-UIX-018` … `REQ-UIX-020`), `13-testing-quality.md`

---

## DEC-101 — Wave 5 runs FOUR teammates: `sessions` takes the form model, `error.tsx` distributes to route owners, motion moves to M10

- **Date:** 2026-09-15 · **Decided by:** owner (asked whether teammates had been accounted for), corrected in `16` §16.2
- **Decision:** wave 5 runs **four** teammates, which `CLAUDE.md` allows ("three to five"). (1) **`sessions` joins wave 5** and takes the **whole form model** — eight primitives (`field`, `input`, `textarea`, `select`, `checkbox`, `radio-group`, `switch`, `form-summary`) plus `src/lib/form-state.ts`. It owns the propose form, the largest and most-complained-about form in the product, and it is an opus track. (2) **`error.tsx` distributes to route owners.** The lead keeps only the shared `<RouteError>` and `global-error.tsx` — the one file that cannot read the DAL or a translation provider — and each track writes the boundaries under its own routes, consistent with the per-file principle in §16.0. (3) **The motion system moves to M10** (`DEC-100`). The resulting split: **lead** 12 primitives + the spine; **`sessions`** 8 primitives + `form-state.ts`; **`console`** 6 (`data-table`, `combobox`, `menu`, `tabs`, `sheet`, `date-time`) + `admin/layout.tsx`; **`content`** 9 (`card`, `badge`, `tag-chip`, `avatar`, `progress`, `empty-state`, `stat`, `panel`, `file-drop`); **`checkin`** the 49-cell affordance matrix including the `DEC-090` gates.
- **Rationale:** teammates were in the *estimate* — waves 1–4 each ran two or three and each took one lead session, so "one wave per session" is already a with-teammates number — **but not in the table.** The lead held nineteen primitives plus the shell plus both page shells plus the form model plus the loading model plus `proxy.ts` plus every gate script, on a lane the ownership audit had already called "the tightest single lane in the milestone" — and then §7.4's failure model and §7.5's motion system were added to it afterwards without re-balancing. That is a one-agent critical path with three idle agents attached.
- **Why the split falls where it does**, since "by future consumer" is a rule with two exceptions. **`combobox` and `data-table` go to `console` even though they are the hardest**, because they are the only two where **no upstream library does the work** — combobox is the full ARIA 1.2 pattern with `aria-activedescendant` over Arabic-normalised typeahead, and `data-table` carries `aria-sort`, selection labelling and a whole second rendering mode for the phone stack; `menu`, `tabs` and `sheet` are Radix wrappers where Radix owns the accessibility, and `dialog.tsx` is already in the repo as the house precedent. ★ `console` also already owns **a working combobox** — `src/components/admin/member-picker.tsx`, built for SCR-053 — so `ui/combobox` is **promote and generalise**, not build. **`page-header`, `section-header` and `prose` go to the LEAD, not `content`**, because they have no single future consumer — `page-header`'s consumer is every screen. **`file-drop` goes to `content`, not `console`** — `content` owns every upload path in the product and `console` has no upload surface at all.
- **Ordering inside the wave:** the lead's `src/components/ui/index.ts` stub commit is **hour one** and blocks everything — **types only**, with stub implementations rendering plain semantic HTML, imported by path; this is precisely what `src/components/sessions/slots/` did in wave 1 and why wave 1 parallelised at all. A runtime barrel would drag `toast`, `combobox` and `route-progress` — all `"use client"` — into the client graph of every server page that imports `Card`. `checkin` additionally waits on `src/lib/session-status.ts`, the lead's second commit, same day. **Both `console` and `content` are Sonnet tracks in unfamiliar file shapes**; DEC-047's lesson applies — the lead re-drives each with the next concrete unit at every sync rather than waiting for a ready signal.
- **Supersedes:** `16` §16.2's first draft, which gave M9 to the lead with `console`, `content` and `checkin` attached.
- **Documents changed:** `16` §16.2, `CLAUDE.md` (the wave-5 ownership map), `docs/plan/TEAM.md` §1, `.claude/agents/*.md`

---
## DEC-102 — Step 0's corrections of record: where the 59-route table lives, what `trace` could not see, and three small facts `16` has slightly wrong

- **Date:** 2026-09-15 · **Decided by:** the wave-5 lead session, promoting `16` into the plan set
- **Why this entry exists:** `16` is `settled`, so rule 3 applies — **it may only change through an entry here.** Promoting it turned up four places where the document and the tree disagree. None changes a design decision; all four would have cost the next session an hour, so they are written down rather than fixed silently.
- **1 · The 59-route coverage table lives in `09-sitemap-screens.md` §8, not in `16` §15.** `DEC-097` says «§15 carries a coverage table of all 59 routes». `16` §15 carries the eleven-screens table and the five milestone tables — **it does not contain the coverage table it promises.** `09` owns the `SCR-*` ID space and the screen inventory, and `16`'s own header says «`09` keeps the screen inventory and this document specifies what those screens become», so `09` §8 is where it belongs and where the next reader will look. `DEC-097` is otherwise unchanged; only its location is.
- **2 · `scripts/traceability.mjs` could not see a milestone above M8.** `RE.milestone` was `/\bM[0-8]\b/g`, so every M9–M13 story would have reported «requirement with no milestone» and the `trace` gate would have failed on correct input. It becomes `/\bM(?:1[0-3]|[0-9])\b/g` — longest-alternative-first, so `M13` matches as `M13` and not as `M1` followed by a stray `3`. **This is a gate change in a lead-only file and is listed here so it is not mistaken for drift.** `trace` was already red on `design/m9-m13-plan` before this session — `16` cites 50 requirements `01` had not yet defined — which is exactly what Step 0 discharges.
- **3 · `04-architecture.md` is `draft`, not `settled`.** `DEC-083` and `DEC-084` both say «`04` is settled, so no route is built before this entry exists». `04`'s status line reads `draft`. The entries stand and the amendments are made through them regardless — a decision entry is the *stricter* path, not the weaker one — but the reason given is wrong and a later reader checking it would be entitled to doubt the rest.
- **4 · The primitive count is 31 components in 34 files.** `16` §4.2 says «**Thirty-one** components» and §16.2's file lists add three that §4.2's table omits: **`ui/link.tsx`** (§7.1.1 makes it a house primitive — it is where `useLinkStatus()` lives), **`ui/route-error.tsx`** (§7.4's shared boundary body) and **`ui/data-table.tsx`** (§6.7's console table). `src/components/ui/index.ts` therefore carries **34 signatures**, and the per-file ownership lists of §16.2 are authoritative over the count in §4.2. The set is otherwise exactly as §4.2 describes and every file has exactly one owner.
- **Supersedes:** nothing. `DEC-097` item 1 is relocated, not changed; `DEC-083` and `DEC-084` keep their decisions and lose one wrong premise each.
- **Documents changed:** `09-sitemap-screens.md` §8 (new), `scripts/traceability.mjs`, `docs/plan/TRACEABILITY.md`

---

## DEC-103 — Three files the five affordance fixes need had no owner in wave 5; the lead takes the event page, `checkin` gets its two screens back

- **Date:** 2026-09-15 · **Decided by:** the wave-5 lead session, closing a gap found while writing the agent definitions
- **The gap.** `16` §16.2 gives `checkin` «§5.3's affordance matrix, wired, **including the four §5.4 gates**» with an edit list of `src/components/checkin/**`, `src/lib/dal/{rsvp,checkin}.ts` and its tests. **Three of the five live bugs are not in any of those files**, and one of them is in **no wave-5 teammate's list at all**:
  - `src/app/[locale]/app/sessions/[id]/page.tsx` — the check-in link, the host-view link and the four staff links, plus the `<section>` and `<h2>` over every gated slot. It is `sessions`' file by wave-1 ownership, and `sessions` in wave 5 holds the form model and only `error.tsx` under those routes.
  - `src/app/[locale]/app/sessions/[id]/check-in/**` and `.../host/**` — §5.4.1 rows 4b and 4c rewrite both, and both are **`checkin`'s own screens from wave 1**, dropped from its wave-5 list.
  - `src/components/sessions/slots.ts` and `getSessionForEvent()` in `src/lib/dal/sessions.ts` — `DEC-092` widens `SlotProps` with `viewerRelation` and has the DAL return it once. Neither file is in a wave-5 list.
- **Decision.** (1) **The lead owns `src/app/[locale]/app/sessions/[id]/page.tsx` for M9**, for the affordance gating and the slot conditions only — no redesign; the event-page rebuild is M10 and returns to `sessions` then. This follows the standing rule since wave 1 (**the lead wires the slots**) and `16` §5.4.1a(b)'s rule that *the page owns the landmark, so the page owns the condition*. (2) **The lead owns `src/components/sessions/slots.ts` and `getSessionForEvent()`'s DTO for M9**, because `DEC-092` is a contract change four tracks read and `16` §16.7 says the lead does not delegate what every track imports. (3) **`checkin` gets `sessions/[id]/{check-in,host}/**` back** — a restoration of its wave-1 ownership, not a widening.
- **The consequence that makes this cheap:** because the gate is at the **page**, with the section and the heading, **`src/components/calendar/add-to-calendar.tsx` (`notify`'s) and `src/components/tasks/panel.tsx` (`content`'s) do not change at all in M9** — neither track is in wave 5, and neither needs to be. A design that gated inside the slots would have required both.
- **Rationale:** the alternative was for `checkin` to hand the lead a patch to three files it may not open, or for the lead to widen a Sonnet track's edit list into the product's most important page on day one of a wave. `checkin` supplies the predicate — as an exported function or a DAL field, not as prose — and the lead wires it.
- **Supersedes:** `16` §16.2's edit lists for `lead`, `sessions` and `checkin`, narrowly and for M9 only.
- **Documents changed:** `CLAUDE.md` (the wave-5 ownership map), `.claude/agents/{checkin,sessions}.md`, `16` §16.2

---

## DEC-104 — `ui-lint` parses with `typescript`, not `ts-morph`; both gates ship with counted allowlists, and the real numbers are bigger than `16` estimated

- **Date:** 2026-09-15 · **Decided by:** the wave-5 lead session, building the `DEC-087` gates
- **1 · No new dependency.** `16` §17 specifies `ui-lint` as «a `ts-morph` pass». **`ts-morph` is not installed**, and adding it means `npm run lockfile` in Docker — the npm-version-sensitive path that has broken CI twice — for an object model this gate does not need. **`typescript` is already a dependency at 5.9.3**, and `ts.createSourceFile(..., ScriptKind.TSX)` plus a recursive `forEachChild` walk does the whole job: find a JSX `<input|select|textarea>` with no `<Field>` ancestor, and find a string literal matching the control-class regex. Same reasoning as the icon set and the motion system: **no library for what the platform already does.** Scripts are lead-only, so this is a lead decision, but it contradicts a line in a `settled` document and therefore belongs here.
- **2 · The gates are `scripts/ui-lint.mjs` and `scripts/route-coverage.mjs`**, exposed as `npm run ui-lint`, `npm run loading-coverage` and `npm run error-coverage` (one script, two `--kind`s — it is one directory walk). They run in a new `system` CI job beside `lint`: a TSX parse and a directory walk, no server and no build, so they cost seconds and fail fast. A fourth CI step asserts **the allowlists did not grow**, because an allowlist that grew is a gate that was worked around.
- **3 · The allowlist is a COUNT per file per rule, not a file list.** A file is permitted its recorded number of existing violations; **more fails, fewer is progress and is reported** with a `--prune` hint. A bare file list would let a file already on it accumulate ten more violations silently, which is how an allowlist becomes an exemption.
- **4 · The real numbers, measured rather than estimated.** `16` §1.1 and §16.1 say **65 files** carry the copied control-class string — that is exactly right for `rounded-field border border-edge-strong`, and §17's rule is `/rounded-field border border-edge(-strong)?/`, which also catches the 78 files carrying the plain variant. **The true baseline is 106 files holding 425 violations — 265 class strings and 160 unwrapped controls.** Separately, **43 of the 49 pages have no loading boundary** (the single existing `sessions/loading.tsx` covers six), **49 have no error boundary**, **12 dynamic pages have no `not-found.tsx`**, and `global-error.tsx` does not exist. None of that changes the plan; it changes how long the allowlist takes to empty, and it is written down so M13's «flip to `--strict`» is scoped from a number rather than a guess.
- **5 · Three carve-outs, each one a place where the obvious rule is wrong.** (a) **Both rules exclude `src/components/ui/`** — `ui/input.tsx` and `ui/select.tsx` *must* contain a raw `<input>` outside `<Field>`, because they are what `<Field>` wraps; `16` §17 already says this and it is restated in the script because it is the kind of exclusion someone removes while tidying. (b) **`<input type="hidden">` is exempt** — it is not a control a member fills in, and wrapping it in a labelled `<Field>` would be wrong rather than merely unnecessary. (c) **`not-found` coverage measures dynamic segments from `src/app/[locale]/app`, not from the repo root** — `[locale]` is a dynamic segment above every route in the product, and counting it demands a `not-found.tsx` beside all 49 pages, which makes the gate meaningless. That was a real bug in the first version of the walk, caught by the number being 49 instead of 12.
- **6 · `global-error.tsx` has two assertions that are NOT allowlistable**: it must contain `dir="rtl"`, and it must **not** reference `getTranslations`, `useTranslations` or `NextIntlClientProvider`. It replaces the root layout, so there is no provider and no `<html lang>` above it; a member meeting it meets Next's English left-to-right default unless it is hand-written (`DEC-091`).
- **Supersedes:** `16` §17's naming of `ts-morph`. The rules, the exclusions and the shrinking-allowlist policy are unchanged.
- **Documents changed:** `scripts/{ui-lint,route-coverage}.mjs`, `scripts/{ui-lint,route-coverage}-allowlist.json`, `package.json`, `.github/workflows/ci.yml`, `13-testing-quality.md` §7

---

## DEC-105 — Two rows of `16` §5.1's totality table cannot happen, and the «`open` forever» reading is the wrong answer for a session whose start has passed

- **Date:** 2026-09-15 · **Decided by:** the wave-5 lead session, implementing `src/lib/session-status.ts`
- **The constraint, read from the migration rather than assumed.** `0010_m2_schema.sql:102-104` is a table check constraint on `public.sessions`:

  ```sql
  check (state not in ('published', 'in_progress', 'completed', 'archived')
         or (starts_at is not null and ends_at is not null and capacity is not null
             and (venue_id is not null or custom_venue_name is not null)))
  ```

  So **a `published` session always has both ends and always has a capacity**, and has since M2. Nothing in `0011`–`0081` relaxes it; the only later `alter table public.sessions` statements add `search_vector`, `allow_walk_ins` and `host_company_id`.
- **What that makes unreachable.** Two rows of `16` §5.1's totality table — «`published`, `starts_at` null» and «`published`, start set, `ends_at` null» — **describe states the database forbids**, and §5.0's «Sessions with no schedule exist» is true only of `draft`, `submitted`, `in_review`, `changes_requested` and `approved`. A third consequence follows: **`seatState()` can never return `unlimited` on a member-facing surface**, because the `open` phase comes only from `published` and `capacity` is not null from `published` onward — so §5.2's badge row «`open` + `available`/`unlimited`» has a dead half.
- **Decision.** (1) **Totality is still implemented and still swept**, over every state × schedule × clock combination. A constraint is not a type; a `draft` on the schedule screen legitimately has nulls; and a total function that throws on a legal row is worse than a branch that never runs. (2) **The unreachable rows are marked in the code and in the tests**, so the next reader does not spend an afternoon on the «`open` forever» case and, more importantly, does not reason from it to a member-facing conclusion. (3) ★ **Where §5.1 and the ask disagree, the ask wins:** §5.1 resolves a `published` session with a passed start and no end to «`open` forever». That is the right answer for a session the clock cannot *place* and the wrong one for a session whose **start** has passed — «احجز مقعدًا» on a talk that began an hour ago is precisely ask 4. `sessionPhase()` returns **`live`** there. Because the source is then the clock rather than the row, `canGrantOn()` still refuses check-in, so the conservative direction of `DEC-090` holds in both directions at once.
- **A fourth thing this session changed, and it is the more interesting one.** `DEC-090`'s corollary 2 — «the derived phase may only ever REMOVE an affordance, never add one» — **cannot be expressed as a scalar ordering over phases**, which was the first implementation and was wrong. Permissiveness is not one-dimensional: `ended` *removes* registration and cancellation and *grants* rating, the survey and the certificate. So a session the clock calls `ended` while `complete_session` has not run is safe to hide the register button on and **unsafe to offer a rate button on** — which is §5.4.1 row 5, the defect this plan introduced into itself. The rule is therefore implemented **per affordance**: `sessionPhaseSource()` says whether a phase came from the row or from the clock, `GRANTING_AFFORDANCES` lists the five affordances that no earlier phase offers, and **`canGrantOn()` is the single predicate every granting affordance calls** — it refuses whenever the source is the clock. `checkIn` is in that list for the same reason `rate` is: the check-in RPC refuses on a session `start_session` has not moved to `in_progress`, so a clock-derived `live` must not render the button either.
- **Supersedes:** `16` §5.1's totality table, in the two unreachable rows and in the «`open` forever» resolution; and its implication that corollary 2 is a property of phases rather than of affordances.
- **Documents changed:** `src/lib/session-status.ts`, `tests/unit/session-status.test.ts`, `16` §5.1 · §5.2 · §5.4

---

## DEC-106 — The house icon set is drawn at the ancestors' stroke, not §4.2.1's number, and it is thirty-four exports rather than thirty-two

- **Date:** 2026-09-15 · **Decided by:** the wave-5 lead session, implementing `DEC-079`
- **1 · The stroke is 2, not 1.7.** `16` §4.2.1 condition 2 specifies «a 24 px grid, **1.7 px stroke**, round caps and joins». The eight existing glyphs in `src/components/ui/icons.tsx` are drawn at **2**, and they cannot be redrawn: they are the marketing site's entire vocabulary, `/`, `/ar`, `/en` and `/ar/register` are the frozen public contract until M13, and `npm run visual` is 0.000 % on them. Condition 2's *purpose* is that **the set reads as one hand**, and its own text names the eight as «the family's ancestors» — so a set drawn at 1.7 beside ancestors drawn at 2 fails the condition in order to satisfy the number. **The number yields; the hand does not.** Everything else in the spec is followed exactly: the 24 px grid, round caps and joins, the 2 px minimum interior gap, and geometry built from the same circles and straight lines.
- **2 · Two glyphs the list does not name, and the shell needs.** §4.2.1 lists thirty-two. The shell adds **`bell`** — §6.1's own diagram shows 🔔 in both the desktop and phone rows, so the list simply omits what its neighbouring section requires — and **`home`**, for the tab bar's first tab. A house is **not** on the brief's forbidden list, which bans *education clichés*: books, graduation caps, lightbulbs, mortarboards, cartoon illustration. It is drawn from the same straight lines as the rest, with no chimney, no door and no window, because each of those is the detail that makes an icon read as bought. `icons.tsx` therefore exports **thirty-four** functions: the eight marketing ancestors (seven of which the app set also uses) plus twenty-six drawn for the app.
- **3 · Both surfaces keep their bans.** No icon dependency, ever — not Lucide, not Heroicons, not Phosphor. No education imagery, on marketing or in the app. An icon never travels alone in a primary action, and `ui/icon-button` makes the accessible name a **required prop** so it cannot be forgotten.
- **Rationale for writing this down rather than quietly using 2:** a number in a `settled` document is exactly the kind of thing a later session re-derives from the document and "fixes" in the code, and the fix would break the one hand the condition exists to protect. The gallery (`/[locale]/ui`, `DEC-083`) renders every glyph at 16, 20 and 24 px so any future drift is visible rather than inferred.
- **Supersedes:** `16` §4.2.1's stroke figure and its count of thirty-two.
- **Documents changed:** `src/components/ui/icons.tsx`, `04-architecture.md` §11, `16` §4.2.1

---

## DEC-107 — The affordance matrix is 42 cells and nine columns, not 49 and eight; and `getSessionForEvent()` needs `allow_walk_ins` as well as `viewerRelation`

- **Date:** 2026-09-15 · **Decided by:** the `checkin` teammate, flagged rather than decided; promoted by the wave-5 lead
- **1 · 42 cells, not 49.** `16` §5.3's prose says «**7 phases × 7 relations = 49 cells**» and §17 repeats it as the gate's size. **§5.1's own `SessionPhase` union has six members** — `draft`, `pending_schedule`, `open`, `live`, `ended`, `cancelled` — and §5.3's own table lists six rows. The prose miscounts the table printed directly beneath it. The matrix is **6 × 7 = 42**, and `tests/unit/session-matrix.test.ts` asserts one cell each. §17's gate is satisfied in substance — *one assertion per cell* — and not in its arithmetic.
- **2 · Nine affordance columns, not eight.** §5.3's table has eight — RSVP, cancel, calendar, tasks, check in, rate, share, materials — and the host console is decided in prose. It becomes a **column**: `session-status.ts`'s own `GRANTING_AFFORDANCES` already names `hostConsole` beside `checkIn`, and the host screen needs an answer from the table rather than a condition written out again at its call site. `attendanceOutcome` is the ninth, for §5.3's two ★ cells — the `ended` read-only fact that replaces the live cancel form.
- **3 · `getSessionForEvent()` returns `allowWalkIns`, which `DEC-092` does not mention.** DEC-092 widens the DTO with `viewerRelation` and stops there. The check-in gate needs a **third input the (phase, relation) pair cannot encode**: DEC-065's per-session walk-in switch turns `none` from ineligible into eligible for that session alone. So `sessions.allow_walk_ins` joins the DTO's select — a column already on the table since `0079`, read by nothing on this page. Without it the gate either refuses every walk-in or re-reads the session inside the predicate, which is the round trip DEC-092 exists to avoid.
- **4 · The gate is at the PAGE, and that is what keeps two tracks out of the wave.** Because `16` §5.4.1a(b)'s rule — *a slot that can render nothing must have its `<section>` and heading gated with it* — puts the condition on the page that owns the landmark, **`src/components/calendar/add-to-calendar.tsx` (`notify`'s) and `src/components/tasks/panel.tsx` (`content`'s) do not change at all.** Neither track is in wave 5. A design that gated inside the slots would have required both of them, and `SlotProps`' new `viewerRelation` would have had to be mandatory rather than optional.
- **Rationale for an entry rather than a note:** the first two are arithmetic in a `settled` document, and arithmetic is exactly what a later reader re-derives and "corrects" back. The third is a gap in another decision, which is the kind of thing that gets discovered twice.
- **Supersedes:** `16` §5.3's cell count and column list, and §17's «7 phases × 7 viewer relations = 49»; extends `DEC-092`.
- **Documents changed:** `src/components/checkin/session-matrix.ts`, `src/lib/dal/sessions.ts`, `src/components/sessions/slots.ts`, `src/app/[locale]/app/sessions/[id]/page.tsx`, `16` §5.3 · §17

---

## DEC-108 — `text-body-sm` was undefined and used in 123 files; it is aliased to the caption ramp, and a gate now refuses the next one

- **Date:** 2026-09-15 · **Decided by:** found by the `sessions` teammate during wave 5, verified and decided by the lead
- **The finding.** `src/app/globals.css` declares `text-display`, `text-mega`, `text-chapter`, `text-statement`, `text-index`, `text-h1`, `text-h2`, `text-h3`, `text-body-lg`, `text-body`, `text-caption`, `text-label` and `text-eyebrow` as `@utility` blocks. **`text-body-sm` is not among them, there is no `--text-*` theme key for Tailwind v4 to generate one from — and it is used in 123 files under `src/`.** Verified against the compiled stylesheet rather than inferred: `.text-caption` and `.text-body` are both present in `.next/static/chunks/*.css`; **`.text-body-sm` is absent.** So every hint, caption, error message and meta line using it has rendered at **inherited body size — 17 px on mobile in Arabic — where its author meant 15 px.** Since M0.
- **Why nothing caught it, which is the part worth keeping.** A missing utility is **not a type error, not a lint error and not a test failure**. The class reads as real in every file that uses it, and it is one letter from `text-body-lg`, which does exist. `npm run visual` covers only the three marketing routes, and **marketing does not use it** — the frozen pages and every component they import use it zero times, which is exactly why four milestones of visual diffs stayed green over it. It took a teammate adopting the *correct* token (`text-caption`) on a new primitive and noticing their own text was visibly smaller than the screens around it.
- **Decision.** (1) **`@utility text-body-sm` is defined as an alias of the caption ramp** — `--fs-caption` / `--lh-caption` — which is the size every caller intended. (2) **Not a codemod.** Rewriting 123 files to `text-caption` would touch every track's ownership mid-wave for the same rendered result, and `text-body-sm` is a reasonable name for that step of the ramp. (3) **`tests/unit/typography-utilities.test.ts` now fails if any house `text-*` class used under `src/` has no definition in `globals.css`** — two file reads and a regex, and the only thing standing between the next invented token and another 123 files.
- **Safe for invariant 1, and proved rather than assumed:** the frozen routes use it zero times, and `npm run visual` was **0.000 % on all six pairs** after the change.
- **A false positive the new gate found on its first run, kept as a note:** `[text-indent:-1.25rem]` in `legal/privacy` is Tailwind v4's arbitrary-**property** syntax, which emits real CSS and is not a utility. The regex now refuses a `[` lead-in and a trailing `:`. That is the right kind of false positive — it meant the test was reading class strings the way Tailwind does, one case short.
- **Supersedes:** nothing. `10-i18n-rtl.md`'s typography ramp is unchanged; this makes one step of it real.
- **Documents changed:** `src/app/globals.css`, `tests/unit/typography-utilities.test.ts`, `10-i18n-rtl.md` §1

---

## DEC-109 — The «مطلوب» marker replaces «اختياري» on SCR-017, and that is the requirement landing rather than drift

- **Date:** 2026-09-15 · **Decided by:** the lead, answering a question the `sessions` teammate raised three times and did not act on unilaterally
- **The conflict, stated plainly.** The lead's brief for the propose-form adoption said «adoption only: no redesign, no new layout, **no copy change**». `16` §8.2 item 2 and `REQ-UIX-011` say **required is marked positively** — «مطلوب» on the label, **never an asterisk**, because an asterisk collides with the RTL run and because a member should never have to infer "required" from the *absence* of «اختياري». Applying the requirement to SCR-017 removes its «اختياري» markers, which is a visible copy change on a live screen. Both instructions were mine and they contradict each other.
- **Decision: the requirement wins, and the markers stand.** «no copy change» was written to prevent a redesign smuggled in under an adoption; `REQ-UIX-011` is the thing the adoption exists to deliver. A form that marks only its optional fields is the pattern the requirement replaces, and leaving one screen on the old pattern while thirteen others move to the new one is worse than either alone.
- **Consequences.** (1) **`ui.field.optional` is removed** from `ar/ui.json` and `en/ui.json`. `FieldProps` has `required?: boolean` and no `optional`, so the key had nowhere to be used — and now it has no reason to exist either. `proposals.propose.form.optional` stays in the catalogue because `admin/proposals` still uses it. (2) **`ui.form.summaryTitle` stays and SCR-017 keeps its own heading.** «تعذّر إرسال النموذج» names the failure; SCR-017's shipped M2 copy «يرجى تصحيح الأخطاء التالية:» names the *remedy*, which is better copy for the screen that has it. `FormSummary.title` is a required prop, so the house key is the default for the fourteen forms that have no summary today — it is unused, not dead. (3) **`ui.form.remaining` carries the full six-form ICU block** the teammate designed, so it is correct the day M10 wires it: `zero` says «اكتملت الحقول المطلوبة» rather than «المتبقّي: ٠ حقول», and `one`/`two` carry no `{value}` because «حقل واحد» and «حقلان» already say the number.
- **§8.2 item 7's counter is DEFERRED to M10**, and the teammate was right to refuse it. A remaining-fields counter is a new visible element on a live screen — squarely what «no copy change» forbids — and it belongs beside the step indicator the same item asks for, which is the M10 redesign.
- **The general rule this settles:** when a lead's scoping instruction collides with a requirement, **the requirement wins and the collision is recorded here.** A teammate that flags it rather than choosing is behaving correctly; a teammate that chooses silently is how a requirement quietly does not ship.
- **Supersedes:** the lead's «no copy change» instruction, for `REQ-UIX-011` on SCR-017 only.
- **Documents changed:** `src/messages/{ar,en}/ui.json`, `src/app/[locale]/app/propose/**`, `docs/plan/notes/sessions.md`

---

## DEC-110 — The redesign is the whole app to the canvas, admin console included, and it comes BEFORE M9's remaining system work

- **Date:** 2026-09-15 · **Decided by:** owner, after reviewing M9 running locally
- **The instruction, in the owner's terms:** «redesign the whole app to match the mockups 100% and make sure to include the admin dashboard, it hasn't even been touched by the redesign».
- **What this changes about the plan.** `16` §15 sequences the milestone as **system first, screens after** — M9 the design system, M10 the member surfaces, M11 the console. The owner has reviewed M9 and the sequencing does not serve them: a system with no redesigned screens is not a reviewable increment. **The screens move first.** M9's remaining system work — the motion system, `RouteProgress`, `Splash`, the `(auth)` screens — is carried alongside the screens that need it rather than shipped ahead of them.
- **Decision.** (1) **Every app screen is rebuilt to the canvas** — <https://claude.ai/artifact/3X5NcyyjigheNJG4M1wKKR>, eighteen artboards over three pages — at phone and desktop, in Arabic RTL. (2) ★ **The admin console is in scope from the start, not deferred to M11.** It has had no design attention at all, and `16` §16.4's sequencing put it two waves out. (3) **The canvas is the reference, not the specification** — see `DEC-114` for the errors in it that must not be reproduced.
- ★ **The comments surface becomes a Notion-style comment experience** (`16` §6.3's «النقاش» slot, `REQ-EVT-001` … `REQ-EVT-008`), which is a larger change than "re-skin the comment list". It carries: inline composition with a real editing affordance rather than a bare textarea; **the reaction/like animation** — which `DEC-100` already specifies as `dot-pulse` + `ripple-ring`, Tier 2, «a whisper, not an achievement»; **proper upload controls** with visible affordances rather than a hidden input; and **feedback behaviour throughout** — pending, success and failure states on every action, per `REQ-UIX-007` and `16` §7.3. The upload path is `content`'s and the sniff-on-content rule is unchanged (`DEC-009`, invariant 11: no SVG, anywhere).
- **What does NOT change:** the frozen marketing contract until M13 (invariant 1, `DEC-078`); `registrations`; the DAL, RLS, migrations, worker and renderer; Arabic-first authoring; and the design system itself, which M9 built and which every rebuilt screen now consumes rather than re-deriving.
- **Supersedes:** `16` §15's milestone ordering and §16.3–§16.4's wave assignment. The milestones' *contents* stand; their sequence does not.
- **Documents changed:** `14-roadmap.md`, `16` §15 · §16, `STATUS.md`

---

## DEC-111 — The shell ships with defects: a sweep of every behaviour and position is a blocking task, not a polish pass

- **Date:** 2026-09-15 · **Decided by:** owner, from the running app
- **The instruction:** «the nav dropdown is stuck when clicking on an item and the icons aren't correctly positioned, so do a thorough sweep to check all behaviours and positions are correct».
- **Root cause of the stuck dropdown, found by inspection and not in doubt.** Both menus in the shell — «تصفّح» in `app/layout.tsx` and the account menu in `components/shell/account-menu.tsx` — are native `<details>` elements. **A `<details>` has no reason to close when a link inside it is followed**, and under Next's Partial Rendering **the layout does not re-render on navigation**, so `open` survives the transition and the panel is still hanging over the new page. The comment in `account-menu.tsx` justifying `<details>` — no JavaScript, keyboard-native — is right about what it buys and silent about what it costs.
- **Four behaviours the native element does not give us, all required:** it does not close on navigation; it does not close on an outside click; it does not close on `Escape`; and **two panels can be open at once**. A disclosure that stays open over the screen it navigated to is the defect the owner hit, and the other three are the same omission.
- **A positioning defect of the same family, confirmed in the code.** `components/shell/search-entry.tsx` passes `ps-10` to `ui/input` to clear the search glyph, while `controlClass`'s `md` size contributes `px-4`. **Both set `padding-inline-start`**, and which wins is decided by the order Tailwind emits them in the stylesheet, not by the order they appear in the class attribute. It renders correctly today by luck of that ordering. The house rule this establishes: **never pair a directional padding utility with an axis one on the same element** — set `ps-*` and `pe-*`, or set neither.
- **Decision.** (1) The sweep is a **task with a deliverable**, not a review: every interactive element in the shell and the primitives, at 390 px and desktop, in Arabic RTL, against open/close, focus, `Escape`, outside click, navigation, and icon alignment. (2) **The two shell menus move to `ui/menu`** — `console` built it over Radix in M9, and Radix owns exactly the four behaviours the native element lacks. The no-JavaScript argument does not survive: the panels are navigation convenience, and the same destinations are reachable from the tab bar and the account page without them. (3) **`16` §17 gains a gate** so this class cannot return: a Playwright pass that opens every disclosure in the shell, follows a link inside it, and asserts the panel is closed on the destination.
- **Supersedes:** `account-menu.tsx`'s and `app/layout.tsx`'s use of `<details>`, and the reasoning recorded in their comments.
- **Documents changed:** `src/components/shell/**`, `src/app/[locale]/app/layout.tsx`, `16` §6.1 · §17, `13-testing-quality.md`

---

## DEC-112 — `/app` IS the sessions list: a timeline of what a member can attend, not a dashboard

- **Date:** 2026-09-15 · **Decided by:** owner, from the running app
- **The instruction:** «the landing page is the sessions list — the user lands on the available ones, not the current one, which has no purpose and no meaning at all. The sessions list should look and feel like a social-media timeline, with filters properly positioned and experienced by the user».
- **Decision.** (1) **`/app` renders the sessions list.** The «أهلًا ريم» dashboard of `16` §6.6 and the `Home.dc.html` artboard is withdrawn as the landing experience. (2) **The list is a timeline, not a catalogue grid** — a single vertical column a member scrolls, date-grouped, showing what they can attend now and next. Social-media in *rhythm and scanning*, not in ornament: one column, generous cards, state legible at a glance, no sidebar competing with the content. (3) **Filters are part of the timeline, not a rail beside it** — reachable, visibly reflecting the active set, and clearable, with the phone treatment as a sheet (`ui/sheet`, built in M9). `REQ-DSC-005`'s "the active set is visible and clearable" is unchanged and is now the primary interaction rather than a footnote.
- **What survives from the withdrawn design, and where it goes.** The «التالية لك» card — the member's next committed session — is the **first item of the timeline**, not a separate hero. «يحتاج انتباهك» for staff moves to the **admin dashboard**, which `DEC-110` brings into scope and where it belongs. The `member_interests` rail is withdrawn entirely: `16` §6.6 already recorded that it is empty for most members in most orgs, and a timeline has no rails.
- ★ **This is consistent with `16` §6.6's own zero state** — «when nothing is upcoming, home *becomes* browse» — promoted from the empty case to the only case. The document had already reasoned its way to the right screen and kept the dashboard in front of it.
- **Consequence for the route table:** `/app` and `/app/sessions` now render the same thing. `04` §4 keeps both — the second is the canonical, linkable, filterable URL and the first redirects or renders it — and the shell's «الجلسات» tab and «الرئيسية» tab must not become two names for one destination. Resolving that is part of the work, not a detail.
- **Supersedes:** `16` §6.6 in full, and the `Home.dc.html` artboard as the landing design.
- **Documents changed:** `16` §6.2 · §6.6, `04-architecture.md` §4, `09-sitemap-screens.md` SCR-010 · SCR-011, `01-prd.md` (`REQ-UIX-002`, `REQ-DSC-005`)

---

## DEC-113 — Check-in is opened and closed by hand, by the presenter or staff, with a two-hour ceiling after the session ends

- **Date:** 2026-09-15 · **Decided by:** owner
- **The instruction:** «for the check-in, make it manual, not time-bound. The presenter, the moderator and the admin can lock or unlock it whenever they want, until 2 hours after the session's scheduled time has ended».
- **What this replaces.** Check-in is currently gated by the session's *phase*: the `check_in()` RPC and the screen both require `in_progress`, which the clock job sets. That makes the room's most operationally important act depend on a background job firing on time, and it is why `16` §5.4.1 row 4 and `DEC-090` needed a direction guard for `checkIn` at all — a clock-derived `live` had to be refused because the RPC would refuse it.
- **Decision.** (1) **A per-session switch, `check_in_open`,** opened and closed at will by the session's **accepted presenters**, any **moderator** and any **org admin**. (2) **A hard ceiling:** the switch cannot be opened, and an open switch stops admitting, **from `ends_at + 2 hours`**. The ceiling is absolute and is enforced in the RPC, not in the UI. (3) **The phase no longer gates check-in.** A presenter may open it before the session starts — setting up a room early is a real thing — and the ceiling, not the phase, is what closes it. (4) **Every open and close is audited** with who and when: it decides whether attendance can be recorded, and `REQ-PTS-*` pays points off attendance.
- **Two readings the owner has not specified, with the default I will implement unless told otherwise.** (a) **The switch starts CLOSED** and is opened deliberately — an attendance window nobody opened is safer than one nobody closed, and the host view makes opening a one-tap act on the screen already projected in the room. (b) **Closing it does not revoke check-ins already recorded**; it stops admitting new ones.
- **What is unaffected.** The **code itself** — six characters, rotating, with its grace period (`REQ-CHK-002`) — is unchanged; the switch decides whether a correct code is accepted. **Presenters still cannot check in to their own session** (`REQ-CHK-011`). **Walk-ins remain a separate switch** (`DEC-065`): `check_in_open` decides *whether anyone may check in*, `allow_walk_ins` decides *whether a member with no reservation may*. They are orthogonal and both are needed.
- ★ **A consequence worth stating: this removes `checkIn` from the direction-guard problem.** Once the switch is the gate, the clock no longer grants check-in and `canGrantOn(…, "checkIn")` has nothing to protect against — the switch is a stored fact like any other. `GRANTING_AFFORDANCES` keeps `rate`, `survey`, `certificate` and `attendanceOutcome`, which are still clock-adjacent, and loses `checkIn`. `DEC-090`'s corollary 2 stands; one of its four instances dissolves.
- **Supersedes:** `REQ-CHK-004`'s window rule as the gate on check-in, and the `live`-phase condition in `session-matrix.ts`'s `checkIn` column and `canOfferCheckInLink()`.
- **Documents changed:** `01-prd.md` (`REQ-CHK-015`, `REQ-CHK-016`, amends `REQ-CHK-004`), `02-domain-model.md` (`sessions.check_in_open`), `03-permissions-rls.md` (the RPC and its policy), `09-sitemap-screens.md` SCR-016, `16` §5.3, a migration

---

## DEC-114 — The canvas is a reference, not a specification: three classes of error in it must not be reproduced

- **Date:** 2026-09-15 · **Decided by:** owner («there are slight errors in the mockups, so be sure not to make them»), catalogued by the lead
- **Decision.** Where the canvas and `01-prd.md` disagree, **the PRD wins**; where the canvas and a `DECISIONS.md` entry disagree, **the entry wins**; where the canvas is internally inconsistent, it is resolved in favour of the rule stated in `16`. The canvas is the visual reference for **layout, rhythm, density and hierarchy** — not for behaviour, copy, or which elements exist.
- **Three classes found on inspection, and the owner is asked to add any others they have in mind** (this entry is amendable by a follow-up entry, not by editing):
  1. ★ **`Home.dc.html` is withdrawn entirely** by `DEC-112` — the landing page is the sessions timeline, not the «أهلًا ريم» dashboard. Do not build that artboard.
  2. **Any rating shown on a browse card or a public surface.** `REQ-RAT-004` makes ratings anonymous and `REQ-RAT-006` withholds them below three; `16` §2.2 is explicit that stars belong to the presenter's own view and the staff console and **never** to a browse card. The canvas does not appear to show one, which is worth recording as *checked* rather than assumed.
  3. **Numerals on machine-readable surfaces.** `DEC-095` and `REQ-INT-010`: display follows the org setting, but CSV, serials, verification codes, URLs and filenames are always Western. An artboard showing Arabic-Indic digits in any of those is an error, not a style.
- **The standing rule this sets, because it will come up on every screen:** a mockup that contradicts a requirement is a **question**, not an instruction. Raise it; do not implement it and do not silently correct it either.
- **Supersedes:** nothing. It governs how the canvas is read.
- **Documents changed:** `16` §0, `STATUS.md`

---

## DEC-115 — Closing check-in stops admitting and revokes nothing; the switch starts closed

- **Date:** 2026-09-16 · **Decided by:** owner («yes, it is closing accepting check-ins»), confirming the two defaults `DEC-113` left open
- **Decision.** (1) **Closing the switch stops admitting new check-ins and revokes none already recorded.** An attendance record is evidence that someone was in the room; the switch governs whether the door is open, never whether the people already inside were there. A member who checked in and then finds their attendance withdrawn because a presenter tidied up afterwards is a member whose points, certificate eligibility and «حضرت» all moved without them doing anything. (2) **The switch starts closed**, and is opened deliberately — an attendance window nobody opened is recoverable in the room; one nobody closed quietly admits people who were never there.
- **What this settles for the implementation.** `check_in_open` is a plain boolean with a `false` default and no bearing on existing `check_ins` rows. Closing is an `update` of one column, not a cascade — there is no "undo check-in" path anywhere in this feature, and if one is ever wanted it is a separate, audited act on a single attendance record (which `REQ-CHK-008`'s manual marking already models).
- ★ **The owner's words answered the second question directly; the first is taken as confirmed by the same «yes».** Recorded that way rather than as two equal confirmations, so a later reader can see which was explicit. If the switch was meant to default open, it is a one-line change and this entry is the place to look.
- **Supersedes:** nothing — it closes `DEC-113`'s two stated defaults, which were flagged as open precisely so they would not be settled by silence.
- **Documents changed:** `01-prd.md` (`REQ-CHK-015`), `STATUS.md`

---

## DEC-116 — Check-in is open by default and closed by hand; the admin can edit the attendance list at any time

- **Date:** 2026-09-16 · **Decided by:** owner («the check-in starts open where people can check in but is closed manually, and the checked-in list can be updated manually by the admin at any time … the presenter and moderator control when to close, and the admin has the additional ability and editing. I think it is much simpler this way»), reversing `DEC-115`'s second clause with the reason given
- **The model, and it IS simpler than both versions before it.** Nothing has to be opened. Check-in is available from the moment a code is valid, the people who are in the room decide when to stop taking attendance, and an admin can repair the list afterwards. The previous design put a manual act in front of the common case and relied on someone remembering to perform it in a room, under time pressure, on the screen that is projected in front of an audience.
- **Decision.**
  1. **The switch defaults to OPEN.** `check_in_open` defaults to `true`. No one opens check-in; it is already available.
  2. **Closing is manual**, by the session's accepted **مُقدِّمون**, any **مُنظِّم** or any **مشرف المؤسسة**. Reopening is the same act by the same people.
  3. ★ **The window has a floor as well as a ceiling, and the floor is `REQ-CHK-004`'s, unchanged.** A code is only valid while the session is running, so "open by default" cannot mean a member checks into a talk three weeks early — there is no code to enter. `DEC-113`'s ceiling extends the tail to **`ends_at` + 2 hours** so the room can finish taking attendance after the session ends. The switch closes the window early; it never opens it wider.
  4. ★ **The admin may edit the attendance list at any time — including REMOVING a record.** `REQ-CHK-008` already lets an admin or moderator *add* a member with a mandatory reason. Removal is new, it is **admin-only** (not moderator, not presenter), and it is the escape hatch that makes a default-open switch safe: anything the door lets through can be corrected afterwards by the one role accountable for the org's records.
- ★★ **The consequence that must be designed, not assumed: removing a check-in cannot un-pay its points by deleting a row.** `points_ledger` is **append-only and `service_role` is revoked** (invariant 9, `REQ-PTS-011`) precisely so balances are recomputable and the ledger is evidence. So removing an attendance record leaves the award standing unless something reverses it, and the reversal must be a **compensating entry** carrying its own idempotency key and reason — never a delete, and never a silent recompute. The same applies to anything else attendance grants: a certificate already issued has a **gapless serial** (`REQ-CRT-*`) and is revoked, not un-issued. **Whoever builds `REQ-CHK-017` designs that reversal first; it is the hard half.**
- **Supersedes:** `DEC-115`'s second clause (the switch starting closed) and `DEC-113`'s default (a). `DEC-115`'s **first** clause stands and is untouched: **closing still admits nobody new and revokes nobody** — an admin removing a record is a separate, deliberate, audited act on one member, not a side effect of closing the door.
- **Documents changed:** `01-prd.md` (`REQ-CHK-015` amended, `REQ-CHK-017` added), `02-domain-model.md` (`sessions.check_in_open` default `true`), `03-permissions-rls.md` (the close RPC's role set; the removal RPC is admin-only), `09-sitemap-screens.md` SCR-016 · SCR-044, `STATUS.md`

---

## DEC-117 — Walk-ins are a publishing setting on the session, not an in-room control

- **Date:** 2026-09-16 · **Decided by:** owner («regarding accepting walk-ins, it is a setting in the session publishing settings itself — the admin/approver can enable it or disable it»)
- **Decision.** `sessions.allow_walk_ins` moves to **SCR-043's «الإعدادات» tab** — the second tab `DEC-075` re-cut the schedule screen into, and the one an admin normally lives in — set by the **مشرف المؤسسة** who schedules and publishes the session. **The host-view toggle (SCR-016) is removed**, and with it the moderator's ability to flip it mid-session.
- ★ **This is exactly what `DEC-065` deferred.** Its own "Not in this change" line reads: «the switch on the admin schedule screen (SCR-043) — the host view is where both roles stand when it matters; **the design milestone can add it to the schedule form**». The design milestone is here, and the owner has decided it is not an addition but a relocation.
- **Why the separation is now clean, and worth stating because two switches on one feature invites confusion.** After `DEC-116` there are two controls and they answer different questions for different people:

  | | Who | When | Question |
  |---|---|---|---|
  | `allow_walk_ins` | **admin**, at publish | before anyone arrives | **may someone without a reservation attend at all?** — a policy about the session |
  | `check_in_open` | presenter · moderator · admin, in the room | during and just after | **are we still taking attendance?** — an operational act |

  The org decides the door policy; the room decides the door's timing.
- ★ **The cost, stated rather than discovered: there is no longer an in-room override.** A moderator standing in a room that has filled with people who did not reserve cannot admit them; an admin changes the setting from the schedule screen instead, which takes seconds but requires a different person. That is the trade the owner has chosen, and it is the right way round — a walk-in earns attendance points and a certificate (`REQ-CHK-010`), so who may attend is an org decision, not a corridor one.
- **What this changes in code:** `set_session_walk_ins()` narrows from `is_staff()` to admin; the host view loses its walk-in section; SCR-043's settings tab gains the field; the audit action `session.walk_ins_changed` is unchanged. **`check_in()`'s `reservation_required` answer is untouched** — the door logic does not care where the flag was set.
- **Supersedes:** `DEC-065`'s placement of the switch on the host view and its `is_staff()` role set. Everything else in `DEC-065` stands: off by default, audited, the refusal never revealing whether the code was right.
- **Documents changed:** `01-prd.md` `REQ-CHK-010`, `03-permissions-rls.md` (the RPC's role set), `09-sitemap-screens.md` SCR-016 · SCR-043, `16` §9.1, a migration

---

## DEC-118 — Walk-ins are fixed at publication and changed only where the date is changed — with one divergence from the analogy, flagged

- **Date:** 2026-09-16 · **Decided by:** owner («the allowing of walk-ins is a setting before publishing that can't be changed, similar to the date and time of the session»)
- **Decision.** `allow_walk_ins` is decided **when the session is scheduled and published**, on SCR-043's «الإعدادات» tab, alongside the date, the venue, the capacity and the deadlines. It is **not changeable from anywhere else** — not the host view (`DEC-117` removed that), not a member surface, not an ad-hoc toggle. It moves into `schedule_session()`'s parameter set, so it is written by the same audited RPC that writes the time and the place.
- ★★ **THE ANALOGY DIVERGES, AND THE OWNER SHOULD KNOW WHERE.** «Can't be changed» and «similar to the date and time» point in different directions, because **the date and time of a published session CAN be changed** — deliberately, and by design. `0021_session_scheduling.sql` says so in a comment on the guard itself: *«REQ-SES-009 makes editing a PUBLISHED session legitimate (it notifies and re-syncs calendars)»*. Rescheduling is a first-class flow: `MSG-session_rescheduled` goes out, calendar events are upserted, and pending reminders **move** rather than duplicate (`08` §5).
- **So the analogy is honoured and the literal phrase is not, deliberately.** `allow_walk_ins` behaves **exactly like the date**: set at publication, editable afterwards **only** through `schedule_session()`, by an admin, audited — and by nobody and nowhere else. It is not made immutable.
- **Why that way round, since the two readings are not equally recoverable.** Immutable-after-publish creates a dead end with no exit: an admin who published with walk-ins off, standing in front of a room that has filled with people who did not reserve, has *no path at all* — the only remedy is cancelling and recreating the session, which destroys every reservation on it. The other error is cheap: if an admin changes it who should not have, the audit row names them. **A wrong setting that can be corrected beats a right setting that cannot.**
- ★ **If the owner did mean immutable — stricter than the date — it is a trigger and this entry is the signpost.** `sessions_walk_ins_immutable`: refuse an update to `allow_walk_ins` when the row's state is already `published` or beyond. Three lines, one migration, and a follow-up entry.
- **What is unchanged:** off by default (`DEC-065`); admin-only (`DEC-117`); audited as `session.walk_ins_changed`; `check_in()`'s `reservation_required` answer, which never cared where the flag was set.
- **Supersedes:** nothing beyond `DEC-117`'s placement, which this narrows from "a settings field" to "a parameter of the scheduling act".
- **Documents changed:** `01-prd.md` `REQ-CHK-010`, `03-permissions-rls.md` (`schedule_session`'s signature), `09-sitemap-screens.md` SCR-043, a migration

---

## DEC-119 — A session can span several days, and a day is an entity: its own check-in, its own files, its own notes

- **Date:** 2026-09-16 · **Decided by:** owner («nearly all the workshops are one day only, and the current form doesn't allow scheduling a multi-day session where each has its check-in and files and notes … the default assumes a one-day session unless the user explicitly clicked on multi-day settings»)
- ★★ **This is not a form change.** «Each has its check-in and files and notes» gives a day **identity, lifecycle and its own access surface**, which is exactly the test `DEC-089` used to refuse an entity for objectives and which a session day passes. `02-domain-model.md` is **frozen**, so the entity is defined under this entry.
- **The entity.** **`ENT-session_days`** — `org_id`, `session_id`, `position` (1…n), `starts_at`, `ends_at`, `venue_id` **or** the inline custom-venue trio, and `notes`. `org_id` on it, RLS enabled, a full policy set and a generated-sweep row: **invariant 5, no exception requested.** A one-day session is a session with **one** day — there is no second code path, and that is what keeps the common case from paying for the rare one.
- **What moves to the day**, because attendance and content are per meeting:
  - **`check_in_codes`**, **`check_ins`**, **`check_in_attempts`** — each day has its own rotating code, its own attendance list and its own rate-limit stream. `check_ins.session_window` is derived from **the day's** window.
  - **`materials`** — a file belongs to the day it is for. A session-level file is a file on day 1, not a second concept.
  - **`notes`** — a `text` column on the day, authored by the presenter or staff. ★ **The owner has not defined who reads these**; see the open questions.
  - **`calendar_events`** — one per day, so a three-day workshop puts three entries in a member's calendar. **`MSG-reminder_*`** fire per day (`08` §5's reminders «move, they do not duplicate» rule applies per day).
- **What stays on the session**, because they are about the *thing*, not the *meeting*: `rsvps` (**one registration covers every day** — a member signs up for the workshop, not for Tuesday), `certificates`, `ratings`, `comments`, `reactions`, `photos`, `bookmarks`, `session_tags`, `session_presenters`, `session_posters`, `session_tasks`.
- ★ **This is NOT the recurring series `A14` rules out, and the distinction must survive this entry.** A recurring series is **N independent sessions** on a schedule, each with its own registration, its own certificate and its own identity. A multi-day workshop is **ONE session with N meetings**: one registration, one certificate, one rating, one discussion. `A14` stands untouched — nothing here schedules anything automatically or repeats a session into the future.
- **The form, which is what the owner actually asked to be fixed** (`REQ-SES-016`):
  1. **One day is the default and costs nothing.** The multi-day controls are behind an explicit «جلسة متعدّدة الأيام» affordance; a user who never touches it fills in exactly the fields they fill in today.
  2. **End time follows duration.** Entering a 60-minute duration sets the end 60 minutes after the start, live, as the start moves. `OQ-001` already says the duration pre-fills and is never authoritative — **an explicitly edited end wins** and stops following.
  3. **Each added day defaults to the previous day's time and place**, and both are editable per day. Adding day 3 to a workshop that meets 6–8 p.m. in القاعة الكبرى should take one tap.
  4. **Validation is immediate and in-place** — a day that ends before it starts, days that overlap each other, a deadline after the first day's start — each said at the field, on blur, in the form model M9 built (`REQ-UIX-009`, `REQ-UIX-010`).
- **Consequences that must be designed, not discovered:**
  - **`sessionPhase()` becomes a function of the day set.** A session is `live` while **any** day is running, `ended` once the **last** day has ended. The `ends_at + 2 h` check-in ceiling (`DEC-113`) is per **day**, not per session.
  - **`0010`'s publish constraint** — `starts_at`/`ends_at`/`capacity` not null from `published` onward (`DEC-105`) — becomes "at least one day, every day complete". The session's own `starts_at`/`ends_at` become **derived** from the first and last day, kept as stored columns so every existing index, sort and query keeps working.
  - **`REQ-CHK-013`'s "a member cannot be in two rooms at once"** now compares day windows, not session windows.
- ★★ **POINTS AND CERTIFICATES ARE AWARDED FOR FULL ATTENDANCE, and that is a bigger change than it reads** (owner, same message: «it also affects the certificates and points, where the default is only awarding them if the employee attends all the dates»). Both are awarded **once for the session** and **only when the member attended every day** — not accrued per day. It is **the default**, so it is a per-session setting an admin can relax, and it sits beside `certificate_mode` where that decision already lives.
  - ★ **The consequence: for a multi-day session, attendance points can no longer be awarded at check-in.** `REQ-CHK-009` makes the verified check-in the sole trigger and `JOB-award_points` fires off it — which cannot work when the award depends on days that have not happened yet. **For a multi-day session the award moves to session completion**, where the full day set is known; for a one-day session nothing changes, because attending "all days" is attending the one. The idempotency key becomes per member **per session**, not per check-in, so a re-run cannot double-pay.
  - **Partial attendance earns nothing by default.** That is the owner's call and it is the right default for a certificate — a printed artefact saying you attended a workshop you attended a third of is a false statement. It is stated here because it is also unforgiving, and the per-session setting is the release valve.
- **Two questions still open, with my recommendation:**
  1. **Who reads a day's notes** — staff only, presenters, or every attendee? The word covers all three and the answer sets the policy. *No recommendation: the three readings produce three different features.*
  2. **Capacity — per session, or per day?** *Recommend per session*: one registration, one seat count. Per-day capacity implies per-day RSVP, which contradicts one registration covering the workshop.
- **Supersedes:** `02` §4's single-window session for scheduling purposes; `REQ-SES-002`'s assumption that a session has one `starts_at`/`ends_at` pair as its source of truth.
- **Documents changed:** `01-prd.md` (`REQ-SES-015`, `REQ-SES-016`, `REQ-SES-017`, amends `REQ-SES-002`, `REQ-CHK-002`, `REQ-CHK-009`, `REQ-CHK-013`, `REQ-MAT-001`, `REQ-PTS-012`, `REQ-CRT-001`), `02-domain-model.md` §4 (the entity and four FK moves, under this entry), `03-permissions-rls.md` (its policy set and the sweep), `08-notifications-calendar.md` §5, `09-sitemap-screens.md` SCR-043 · SCR-014 · SCR-016 · SCR-044 · SCR-045, `05-scoring-engine.md`, `11-background-jobs.md`, a migration

---

## DEC-120 — "Notes" meant the day's content, not a text field: `session_tasks` joins materials on the day, and the column goes away

- **Date:** 2026-09-16 · **Decided by:** owner («what I meant by notes is the material, and pre-session tasks and so on»), closing both questions `DEC-119` left open
- **What I got wrong.** `DEC-119` read «each has its check-in and files and **notes**» as a free-text `notes` column on the day, and then asked who may read it. The owner meant the **content that hangs off a day** — its materials, its pre-session tasks, and whatever else a member needs *for that meeting*. The question about readership dissolves with the column.
- **Decision.** (1) **`session_days.notes` is removed** from the entity. (2) **`session_tasks` moves to the day**, joining `materials`, `check_in_codes`, `check_ins`, `check_in_attempts` and `calendar_events`. A task belongs to the meeting it prepares you for — «اقرأ الملف قبل اليوم الثاني» is a day-2 task, and a task for the whole workshop is a task on day 1, exactly as a session-level file is a file on day 1. (3) **Capacity stays on the session** — the owner agreed: one registration, one seat count, and per-day capacity would imply per-day RSVP, which contradicts a single حجز covering every day.
- **`REQ-TSK-002` is untouched and matters more now:** tasks remain **reminder-only and are never read by any check-in path**. Attaching them to a day puts them next to that day's attendance in the schema for the first time, and the invariant that they are unrelated is exactly the kind of thing a later reader assumes away.
- ★ **This makes the entity smaller, not larger**, which is the right direction for a change that was only ever meant to be a form improvement: `ENT-session_days` is now **when, where, and which meeting** — `starts_at`, `ends_at`, a venue and a position — with everything else hanging off it by foreign key. No free text, no second policy set, no new readership question.
- **Both of `DEC-119`'s open questions are now closed.** Nothing about multi-day is waiting on the owner.
- **Supersedes:** `DEC-119`'s `notes` column and its placement of `session_tasks` on the session.
- **Documents changed:** `02-domain-model.md` `ENT-session_days`, `01-prd.md` `REQ-SES-015`, `STATUS.md`

---

## DEC-121 — Content belongs to the session OR to a day, and the choice is made by WHERE you are, not by a field you fill in

- **Date:** 2026-09-16 · **Decided by:** owner («can there be session materials, photos, pre-tasks and the same for each day, and the user can choose either or both? I am concerned it may create UX complexity — design the story and the UI in a way that doesn't limit the features and is still user friendly»)
- **The tension is real, and `DEC-120` had resolved it the cheap way.** It said «a session-level file is a file on day 1». That is fine until someone looks for the syllabus on day 3 and it is filed under Wednesday, or reorders the days and the syllabus moves. Some content genuinely belongs to the **workshop** — the reading list, the plan, the certificate criteria — and some genuinely belongs to a **meeting** — day 2's slides, day 3's exercise. Forcing one onto the other is a lie in the data. But offering «session or day?» as a question on every upload is a tax paid by the ~95 % of sessions that have one day and no such distinction.
- ★★ **The design, in one sentence: scope is implied by WHERE you are, shown afterwards as a chip you can change, and does not exist at all when there is one day.**

### The data

`session_day_id` is **nullable** on `materials`, `session_tasks` and `photos`. **Null means the
whole session.** That is the entire model — one nullable column, three tables, no scope enum, no
second table, no join table.

★ **A one-day session's content is session-scoped (`null`), not day-1-scoped**, which gives a
property worth having: **adding a second day to an existing session re-scopes nothing.** The
syllabus does not suddenly become Wednesday's.

### The member's view — one list, grouped, never a choice

One «المواد» section, in day order, with the session's own content first:

```
المواد
  للورشة كاملة          ← the group is omitted entirely when empty
      الخطة الدراسية
  اليوم الأول · الأربعاء
      شرائح المقدمة
  اليوم الثاني · الخميس
      تمرين عملي
```

**For a one-day session there are no groups and no headings** — it renders exactly as it does
today. The multi-day machinery is dormant, not hidden.

### The uploader's view — the button carries the scope

The same grouped list, with **«أضف» in each group's header**. Pressing add under «اليوم الثاني»
uploads to day 2. There is **no dropdown, no modal and no question** — the place you pressed *is*
the answer. Afterwards the item carries a scope chip («اليوم الثاني ▾») which can be changed in one
tap, so a mistake costs a correction rather than a re-upload.

**Photos never ask, including of attendees.** A photo has a moment: it is scoped to **the day whose
window contains its upload time**, falling back to the nearest day. Staff can re-scope it; an
attendee uploading from the gallery is never shown the concept.

### ★ `phase` is relative to the scope, and this is the part that would have been got wrong

`materials.phase` (**قبل** / **بعد**) already exists, and scope × phase reads like a grid. It is
not one, because **phase is relative to whatever the material is attached to**: a session-scoped
«بعد» material appears when the **session** completes; a day-scoped «بعد» material appears when
**that day** ends.

★ **That is a fix, not a complication.** `REQ-MAT-006` today says a «بعد الجلسة» material is hidden
until the session reaches `completed` — so on a three-day workshop, day 1's slides would be withheld
until Friday. Scoping phase to the day releases them on Wednesday evening, which is when they are
useful.

### Day deletion and reordering

- **Reordering days** moves day-scoped content with its day. Session-scoped content does not move.
- **Deleting a day that has content** asks, and **defaults to promoting that content to the
  session**. Nothing is deleted silently as a side effect of a scheduling change.

### What this deliberately does not do

- No scope picker before an upload.
- No second «materials» screen, tab set or navigation branch.
- No scope concept anywhere in a one-day session.
- No change to `REQ-TSK-002`: tasks remain reminder-only and are never read by check-in, at either
  scope.
- **Supersedes:** `DEC-120`'s «a task for the whole workshop is a task on day 1» and `DEC-119`'s
  equivalent for files — both are now genuinely session-scoped. `REQ-MAT-006`'s visibility rule is
  amended to be relative to the scope.
- **Documents changed:** `01-prd.md` (`REQ-SES-018`, amends `REQ-MAT-006`), `02-domain-model.md` (three nullable FKs, under this entry), `09-sitemap-screens.md` SCR-012 · SCR-013, `07-content-pipeline.md`, `STATUS.md`

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

---

## DEC-122 — The canvas's fourth error, named by the owner: the ended session's poster overlaps the action card, and the cause is the mockup's own missing `box-sizing` reset

- **Date:** 2026-09-16 · **Decided by:** owner («the mockup errors are in الجلسة المنتهية — الطلبان ٤ و ٦ page there is a slight overlap»), measured and diagnosed by the lead
- **Amends `DEC-114`**, which catalogued three classes found by inspection and said the owner would add any others. This is the fourth, and it is the one the owner actually saw. `DEC-114`'s rules are unchanged.

### What it is

In `EventEnded.dc.html` — the artboard `canvas.json` titles **«الجلسة المنتهية — الطلبان ٤ و ٦»** — the greyed poster block overlaps the sidebar's action card. Measured in a real browser at the artboard's own 1240 px width:

| | |
|---|---|
| Poster box | `l=392.3 … r=1183.0`, 190 px tall — **790.7 px wide** |
| Its grid column | **726.7 px** wide (`minmax(0, 2fr)` of a 1126 px content box, 36 px gap) |
| Overspill | **64 px** past the column's inline-end |
| Sidebar card | `l=57.0 … r=420.3` |
| **Visible collision** | **28 px × 190 px**, and `elementFromPoint` at its centre returns the **poster** |

The poster paints *on top* because it carries `position: relative` (for no reason — it has no positioned child), which lifts it above the static sidebar card. What it covers: the second line of «باب التقييم مفتوح حتى الاثنين ١٥ سبتمبر. تقييمك لا يُنسب إليك.» and the inline-end edge of the «نزّل شهادتك» and «المواد» buttons.

### The cause, which is the part that matters

```html
<div style="width: 100%; … padding: 0 32px; …">
```

The artboard sets `box-sizing: border-box` **inline on its root `<div>` only**. `box-sizing` does not inherit, and the artboard's `<helmet>` has no `*` reset — so every descendant is back to the initial `content-box`. `width: 100%` therefore resolves to the column's 726.7 px and the 2 × 32 px padding is added *outside* it: 726.7 + 64 = **790.7**. Exactly the measured number.

★ **This means the overlap cannot be reproduced by building the screen correctly.** `src/app/globals.css:1` is `@import "tailwindcss"`, whose preflight sets `box-sizing: border-box` on `*, ::before, ::after`; the same markup in the app is 726.7 px wide and does not overlap anything. **The defect lives in the mockup's rendering environment, not in its design.**

### What an implementer must therefore do

1. **Do not reproduce the bleed.** A poster that runs out of its column into the sidebar is not a full-bleed treatment the design is asking for — it is 64 px of missing reset. The poster is **exactly as wide as its column**.
2. **Drop the `position: relative`.** It has no positioned descendant; it exists only in the mockup and is what makes the collision paint over the card instead of under it.
3. Trust the **intent** of an artboard's geometry, not its **measurements**. This is `DEC-114`'s standing rule with a number attached to it.

### One more instance of the same class, found by the same measurement

`Main.dc.html` has it too: a `width: 100%` element with `padding: 26px` in a 372 px column, rendering **426 px** — a **54 px** overspill on the card beginning «كيف اختصرنا وقت التقارير الشهرية». Same cause, same instruction. **A sweep of all 18 artboards found no third instance**, so this class is now closed.

### How it was found, because the method is reusable

Not by reading the HTML — the artboard contains no `position: absolute`, no negative margin and no `z-index`, so inspection finds nothing. It was rendered headless at its own width and every element compared against its containing block. Two other detectors (sibling-box intersection, text overflowing its box) produced only deliberate overlaps — stacked avatars, badges on posters — which is the expected signal-to-noise and the reason the `box-sizing` detector was narrowed to *declared percentage width under `content-box` with horizontal padding*.

- **Supersedes:** nothing. Extends `DEC-114`'s catalogue from three classes to four.
- **Documents changed:** `STATUS.md` (the owner-blocked item is now closed)

---

## DEC-123 — The rest of the canvas, swept by measurement: nothing reaches the app, four classes are mockup artefacts, and two of `DEC-114`'s guesses are now verified

- **Date:** 2026-09-16 · **Decided by:** lead, at the owner's instruction («yes, since it is cheap»)
- **Extends `DEC-114`/`DEC-122`.** All 18 artboards were rendered headless at their own declared widths, after webfont settle, and checked for text contrast (compositing ancestor `opacity` and `filter: grayscale` before scoring, and scoring gradient backgrounds at their worst stop), touch-target size, and the five Arabic rules `CLAUDE.md` states: no clipped line, no letter-spacing, no justification, body line-height, minimum size.

### ★ The finding that looked like an app bug and is not — checked before it was written down

The canvas shows the header search field's placeholder at **2.12:1** (`Home`, `Main`). The obvious
worry was that the app matches it, because **M9 shipped `SearchEntry` into the shell** and the field
is now on every screen. It does not: `src/components/ui/field.tsx:77`'s `controlBase` already carries
`placeholder:text-fg-muted`, so the placeholder is `--fg-muted` `#5b6780` on `--canvas` `#ffffff` —
**5.68:1**, comfortably AA.

★ **This was nearly logged as a live AA failure.** `input.tsx` was grepped for `placeholder` and has
none — the class string lives in `field.tsx`'s shared `controlBase`, which `input.tsx` reaches
through `controlClass()`. Reading one file and not the helper it imports produced a confident,
wrong number (≈3.53:1, Tailwind preflight's default mix) that was corrected only by opening
`field.tsx`. **A contrast claim about the app is only worth making from the declaration that
actually applies.**

So this joins the list below: **a mockup-only problem. Do not reproduce it.**

### Mockup artefacts — the `DEC-122` family, and the same instruction applies

1. ★ **The "ended" wash swallows the status badge.** `EventEnded` and `Browse` put the status badge
   *inside* the poster that carries `filter: grayscale(1); opacity: .35–.5`, so «انتهت» measures
   **1.87:1** and «أُلغيت» **1.75:1**. The app's own tokens are fine — `--color-ended` `#5b6780` on
   `--color-ended-bg` `#f1f3f7` is **5.11:1**, and `--color-live` is **5.43:1**. **The wash belongs to
   the poster image only; the status badge composites *over* it and is never dimmed.** Copying the
   artboard's nesting takes a compliant badge to a quarter of the required contrast.
2. **`line-height: normal` on wrapped Arabic body text** — 1.20 where `CLAUDE.md` asks 1.7, in four
   places (`CertBuilder`, `Email`, `Main`, `Schedule`). The app's ramp is 17/30 = **1.765** on mobile
   and 16/26 on desktop, so building with `text-body` is automatically correct. Do not copy the
   inline `line-height` values.
3. **`Motion`'s storyboard frames crush Arabic to two and three lines** in cards too narrow for the
   string («سُجِّل حضورك», «أنت في القاعة الآن»). A storyboard frame is a thumbnail of a moment, not a
   spec for the card's width.

### Real, on product surfaces, and worth a design answer

- **Tag counts in the browse filter chips are 1.96:1** (`Browse`, five of them) — «أتمتة ٥», «إكسل ٤».
  The count is the part a member scans and it is the least readable thing in the chip.
- **`Main`'s poster caption «الملصق · ٤:٥ · مُولَّد من قالب المؤسسة» is 3.30:1 at 13 px.**

### Not defects — surfaces that are not product

`Shell`'s «محتوى الصفحة» (1.99:1) is a wireframe placeholder inside a phone diagram;
`EmailLibrary`'s 9 px text with `overflow: hidden` is an email **preview thumbnail**, where both are
correct; `Motion`'s 11 px «660ms — الخط الثاني» labels are spec annotations on a storyboard. These
were flagged by the sweep and cleared by looking at them, which is the reason the sweep does not
get to be the verdict.

### ✓ Two of `DEC-114`'s entries move from *assumed* to *verified*

- **Class 2 — no rating appears on a browse card or any public surface.** Checked every card in
  `Browse` and `Home`: title, presenter, date, tags, seat line. **No stars anywhere.** `REQ-RAT-004`
  and `REQ-RAT-006` are not contradicted by the canvas.
- **Class 3 — no Arabic-Indic digits in a machine-readable string.** Zero hits across 18 artboards
  against URLs, filenames, CSV, serials and verification codes. (The first pass flagged «الموضوع ٤»
  and «١٠٨٠ بكسل»; both are counted nouns — display, not machine-readable — and the detector was
  narrowed rather than the finding accepted.)

### Touch targets — no AA failure, one house-standard note

36 controls fall under the house 44 px (`h-11`), **all of them ≥ 32 px**, so all pass WCAG 2.5.8's
24 px floor. Every one is desktop editor chrome (`CertBuilder`, `Studio`, `Email`, and `Browse`'s
filter button). **None on the phone artboard.** Build to 44 px anyway — that is the house standard
and the reason `h-11` exists.

### Method note, since this is now the second time it has paid

The first pass produced **643 line-height findings and 116 size findings**, nearly all false: it
measured border boxes, so a padded one-line pill read as two lines, and it judged 12 px badge
labels as body text. Counting real line boxes with a `Range` and requiring three or more words cut
those to **8 and 8**. **A sweep that cries wolf is worse than no sweep**, and the numbers above are
after looking at every surviving finding.

- **Supersedes:** nothing. Verifies two of `DEC-114`'s three classes and adds the app fix.
- **Documents changed:** `STATUS.md`

---

## DEC-124 — Numerals are Western everywhere, always. The org setting is withdrawn, and the canvas is wrong on every artboard

- **Date:** 2026-09-16 · **Decided by:** owner («keep using arabic numerals 1,2,3,4 not the indian ones ١،٢،٣،٤. Never use the indian numerals anywhere never ever ever»)
- **Decision.** The product renders **Western digits — `0123456789` — on every surface without exception**: UI, email, notifications, posters, certificates, CSV, ICS, filenames, serials, verification codes, URLs, and every Arabic string. **There is no setting.** A member cannot change it, an admin cannot change it, the platform cannot change it.

### What this withdraws

| | |
|---|---|
| `REQ-INT-006` — «The numeral system is an org setting» | **rewritten**: numerals are Western, full stop |
| `A30`'s numeral clause | the choice it assumed does not exist |
| `02` §2's `create type numeral_system as enum ('western', 'arabic_indic')` | **dropped** |
| `02` §4's `orgs.numerals numeral_system not null default 'western'` | **dropped** |
| `DEC-095` · `REQ-INT-010` — Western on machine-readable surfaces | **subsumed.** They carved out an exception to a setting that no longer exists; the carve-out is now the whole rule |
| `01` §2134 (CSV headers follow the setting), §2777 (invitees in the org's numerals) | follow the rule instead |

★ **The column is `not null default 'western'` and no production row has ever been set to
`arabic_indic`**, so dropping it changes no rendered output. This is a forward-only migration that
removes a capability, not a data migration.

### ★★ The consequence for the canvas, which is the expensive part

**The canvas uses Arabic-Indic digits on all 18 artboards — 468 glyphs.** «٥٤» attendees, «٢١» photos,
«١٥ سبتمبر», «٣ جلسات», «٦:٠٠ م», «٤:٥». Under this decision **every one of them is wrong.**

This collides head-on with «we are following the mockups designs to a t». **The numeral rule wins.**
It is the owner's instruction, it is stated absolutely, and a mockup is a reference (`DEC-114`), not
a specification. So this becomes **the fifth and largest canvas error class**, after `DEC-122`'s
`box-sizing` overlap and `DEC-123`'s four:

> **Read every number in the canvas as Western.** «٥٤» means `54`. Never transcribe the glyph.

`DEC-123` recorded class 3 as *verified clean* — no Arabic-Indic digits in a machine-readable string.
That finding stands and is now beside the point: the rule is no longer about machine-readable
surfaces, it is about all of them.

### Where the work lands

A sweep of `src/`, `worker/`, `packages/` for the setting is the first task of whichever wave takes
this; the admin settings form, its action, and the platform pages all read it today. The
`numeral_system` drop is a lead-owned migration. **`messages/ar/*.json` must be swept too** — an
Arabic-Indic digit typed into a translation string is not caught by removing the column.

- **Supersedes:** `REQ-INT-006` as written, `DEC-095`, `REQ-INT-010`, `A30`'s numeral clause.
- **Documents changed:** `01-prd.md` (`REQ-INT-006`), `02-domain-model.md` (§2 enum, §4 `orgs`), `CLAUDE.md`, `ASSUMPTIONS.md` (`A30`), `STATUS.md`

---

## DEC-125 — A generated poster is dark by default, because the canvas is and the renderer is not

- **Date:** 2026-09-16 · **Decided by:** owner («since we are following the mockups designs to a t. This means that also the generated poster should also have dark backgrounds, correct?»), verified by the lead
- **The owner is right, and the gap is real.** Every poster surface in the canvas is dark — `EventEnded`, `Browse` and `Home` all paint the card media as `linear-gradient(140deg, #111a2c, #1d2a42)`. The renderer ships **light**.

### What the tree actually does today

Each of the eight baseline families binds `background: { type: 'solid', color: '{{brand.canvas}}' }`
(`packages/designer-runtime/src/library.ts:209`, `:350`; eight occurrences in
`0061_baseline_library.sql`). `brand.canvas` is `#ffffff` in the light palette and `#0b1220` in the
dark one — and **`scheme` defaults to `'light'` in all three places that take it**:
`platformBrand()` (`brand.ts:72`), `resolveBrand()` (`:105`) and `brandBindings()`
(`worker/src/render/brand.ts:53`). So a poster generated today is **white**.

★ `06` §3.3 says the families ship "each light and dark", which is true but easy to misread: the
variant is the **scheme**, not a second template row. `0061` seeds **8 families × 1 version**, and
nothing chooses `dark`.

### Decision

**The default scheme for a generated poster is `dark`.** Certificates stay **light** — they are
printed, and `06` §3.3's certificate families are formal Naskh on paper. The org can still override
through its brand kit (`REQ-DSG-021`); the platform default changes, the mechanism does not.

**One thing the canvas asks for that the model cannot express:** the mockups use a *gradient*, and
`model.ts:144` allows only `background?: { type: 'solid'; color: string }`. Either the poster takes
the flat dark canvas (`#0b1220`) or the layer model gains a gradient fill. **The flat colour is the
default; a gradient is a scoped change to `06`, not something to improvise in a template.**

★ **This moves the parity goldens**, which `DEC-052` was careful not to do. The golden refresh is a
reviewed diff (`13`, `CLAUDE.md`) and the lead's, never automatic.

- **Supersedes:** the light default in the three signatures above.
- **Documents changed:** `06-visual-designer.md` §3.3, `STATUS.md`

---

## DEC-126 — The marketing site has no way into the platform, and that is a gap in the plan, not an oversight in the build

- **Date:** 2026-09-16 · **Decided by:** owner («did we include in the plan the marketing page to be updated to include the login button and the content updated so it gives a way to access the platform?»), checked by the lead
- **Answer: no, it is not in the plan.** Not as a requirement, not as a story, not in `M13`'s scope.

### What the check found

- `src/components/header.tsx:56` — the marketing header's **only** link is `/register`.
- `(marketing)/page.tsx:87` and `:240` — both CTAs are `/register`.
- `09` §1 lists `/sign-in` as `SCR-002` and `09`'s ownership table puts it in **M9** — it exists and it works. **Nothing public links to it.**
- `M13`'s scope (`16` §15) is «the marketing rebuild on the system», «the register form re-presented, behaviour byte-identical», the accessibility and performance passes. **No entry point.**
- `A38` asserts «sign-in leads into the platform», which is the assumption — but no requirement implements the link, so nothing was ever built and no gate noticed.

★ **The live site therefore has no door.** A member with an account must type `/sign-in` by hand.
`REQ-NFR-019` froze the marketing routes, which is exactly why the omission survived: the one
guarded surface is the one nobody was allowed to add a link to.

### Decision

**`REQ-UIX-025` is added**: the public marketing site carries a persistent, visible way into the
platform, and its content says the platform exists. It lands in **M13** with the marketing rebuild,
because that is the milestone permitted to touch the frozen routes.

Two constraints that are not negotiable and are the reason this is not a five-minute change:

1. **`/`, `/ar`, `/en`, `/ar/register`, `/og.png` stay a frozen public contract until M13**
   (invariant 1). **Nothing is added to the marketing header before then** — not as a quick win.
2. `registrations` is untouched (invariant 2, `DEC-002`). **«تسجيل الدخول» and «سجّل اهتمامك» are
   different doors** and the rebuild must not merge them: the register form is a pre-launch interest
   list, not a sign-up.

- **Supersedes:** nothing. Fills a hole.
- **Documents changed:** `01-prd.md` (`REQ-UIX-025`), `15-backlog.md`, `16-ui-redesign.md` §15 M13, `STATUS.md`

---

## DEC-127 — The poster background is a gradient, so the layer model gains a gradient fill and the brand gains one token

- **Date:** 2026-09-16 · **Decided by:** owner («regarding the flat dark no it is not flat it is gradient»)
- **Corrects `DEC-125`'s fallback.** `DEC-125` took the flat dark canvas because `model.ts:144` allows only `background?: { type: 'solid'; color: string }`. The owner has chosen the other branch it named: **the model gains a gradient fill.**

### What the canvas actually paints

`linear-gradient(140deg, #111a2c, #1d2a42)` — in `EventEnded`, `Browse` and `Home`, on every card
medium and every poster surface. ★ **Both stops are house tokens**: `#111a2c` is `--color-navy-900`
and `#1d2a42` is `--color-navy-800` (`globals.css:14`, `:16`). This is not an arbitrary pair.

### The model change

```ts
background?:
  | { type: 'solid';    color: string }
  | { type: 'gradient'; angle: number; stops: { color: string; at?: number }[] }
```

Touching, at minimum: `model.ts:144`, `render.ts:201` and `:221` (both resolve
`doc.background?.color` and would read `undefined` on a gradient — **this is the failure mode to
watch: a gradient document silently renders on the `'#ffffff'` fallback**), and `bindings.ts:114`/`:137`,
whose collector walks `background?.color` and must walk every stop or the gradient's colours are
never counted as bindings.

### The brand token, because a gradient stop is not allowed to be a hex literal

`brand.canvas` is `#0b1220` and `brand.surface` is `#111a2c`; **the second stop `#1d2a42` is not any
existing token.** Writing it as a literal would put a navy past `0055`'s guard and give an org that
rebrands a gradient whose far end is somebody else's colour. So `BRAND_COLOUR_TOKENS` gains one
entry — **`canvasRaise`** — `#1d2a42` in dark, `#f1f3f7` in light. The addition is add-only, which
`brand.ts`'s own rule requires.

The baseline poster background becomes
`{ type: 'gradient', angle: 140, stops: [{ color: '{{brand.surface}}' }, { color: '{{brand.canvasRaise}}' }] }`.

### Two consequences worth naming now

1. ★ **The mirrored LTR variant must mirror the angle** — `360 − angle`, so `140°` becomes `220°`.
   A gradient does not follow `dir`, so an unmirrored LTR poster lights from the wrong corner while
   every other layer has flipped. `06` §3.1's «`align` is `start`/`end`, never `left`/`right`» has
   no equivalent for angles, which is exactly why this is written down.
2. **The parity goldens move**, as `DEC-125` already said. Both renderers consume the same CSS
   string, so the editor and the worker agree; it is the stored goldens that change, and a golden
   changes only through a lead-reviewed diff.

- **Supersedes:** `DEC-125`'s "the flat colour is the default" clause. The dark default itself stands.
- **Documents changed:** `06-visual-designer.md` §3.3, `01-prd.md` (`REQ-DSG-026`), `STATUS.md`

---

## DEC-128 — Certificates are a library of several templates, not one light default — and the roster `REQ-DSG-026` already promises was never seeded

- **Date:** 2026-09-16 · **Decided by:** owner («for the certificates we would have multiple templates for them»)
- **Corrects `DEC-125`.** That entry said «certificates stay light», reasoning from print. The owner's answer is that certificates are **a choice among templates**, so there is no single scheme for them to stay at.

### ★ The check this prompted found something neither of us was looking for

`REQ-DSG-026` promises poster families **«each light and dark»** and certificate families
**«landscape and portrait»**. `0061_baseline_library.sql` seeds **8 families × 1 version** —
`talk`, `workshop`, `panel`, `meetup`, `announcement`, `attendance`, `presenter`, `achievement`.

| Promised | Seeded |
|---|---|
| 5 poster families × light + dark = **10** | **5** |
| 3 certificate families × landscape + portrait = **6** | **3** |

**Half the baseline library does not exist.** Nothing caught it because `REQ-DSG-026`'s acceptance
criteria test what a template *declares* — dynamic fields, safe areas, forbidden imagery — and
never that the roster is complete. `06` §3.3's "each light and dark" reads as a description of
rows and is in fact a description of the **scheme mechanism** (`DEC-125`), which is how one
sentence covered a missing half.

### Decision

1. **The certificate baseline is a real library** — the three families in **both orientations**, and
   in **both schemes**, selectable by the admin at issue time. A certificate's look is a template
   choice, never a global default.
2. **The poster roster is completed too**, since it is the same omission and the same seed file.
3. `REQ-DSG-026` gains an acceptance criterion that **counts** the seeded roster, so the next
   missing half fails CI instead of surviving three milestones.

⚠ **The exact roster is the owner's.** The shape above is what `REQ-DSG-026` already promises; if
certificates should carry more than three families, or fewer orientations, say so and this entry is
amended by a follow-up rather than edited.

- **Supersedes:** `DEC-125`'s «certificates stay light» clause.
- **Documents changed:** `06-visual-designer.md` §3.3, `01-prd.md` (`REQ-DSG-026`), `STATUS.md`

---

## DEC-129 — The three `(auth)` screens were assigned to M9 and shipped untouched; they are carried, not dropped

- **Date:** 2026-09-16 · **Decided by:** owner («the login page wasn't touched at all in the first redesign attempt, so make sure to include it as well»), confirmed by the lead
- **The owner is right, and it is a documented miss rather than a discovery.** `DEC-097` placed `(auth)/sign-in`, `(auth)/choose-org` and `(auth)/no-access` in **M9**. M9 shipped without them.

### The measurement

| Screen | `ui/` primitives imported |
|---|---|
| `(auth)/sign-in/page.tsx` | **0** |
| `(auth)/choose-org/page.tsx` | **0** |
| `(auth)/no-access/page.tsx` | **0** |

Not "partly adopted" — **none of the three imports a single primitive**, and `sign-in` still carries
hand-rolled control class strings. They are exactly as M0 left them.

### Why this is the worst of the M9 misses

`DEC-097`'s own reasoning, unchanged and now overdue: `sign-in` is **the first screen every member
ever sees** and **the only place `SC 3.3.8` Accessible Authentication applies** — allow paste,
`autocomplete="one-time-code"`, never block a password manager. `choose-org` is the fork that fixes
which `org_id` the whole session carries. `no-access` is the product's only answer to «فتحت الرابط
ولا شيء يعمل».

★ **And `DEC-126` sharpens it.** That entry adds «تسجيل الدخول» to the public site because there is
no door. **The door leads here.** Shipping the marketing entry point onto an unrebuilt sign-in screen
would make the redesign's first impression the one screen the redesign never touched.

### Decision

The three screens are **carried into the next wave** with the screen work, not left at M9. Three
things travel with them and are not optional:

1. **`SC 3.3.8`** on `sign-in`, tested: paste is allowed into the code field,
   `autocomplete="one-time-code"` is present, and no handler blocks a password manager.
2. **The `DEC-124` numeral rule** applies here first — a one-time code is digits, and it is
   **Western**, always.
3. `no-access` names the next action (`REQ-UIX-012`), because a dead end that explains nothing is
   the failure this screen exists to prevent.

★ **The lesson for the next lead, which is the reusable part:** `DEC-097` existed *because* routes
had gone unassigned, and it still did not get these built — **a route table proves a screen was
decided about, not that it was done.** The next wave's definition of done names screens, and a
milestone does not close while a screen it lists imports zero primitives. That check is one grep.

- **Supersedes:** nothing. `DEC-097`'s placement stands; only the milestone moves.
- **Documents changed:** `16` §15, `09-sitemap-screens.md` §8 coverage table, `STATUS.md`

---

## DEC-130 — Wave 6 is fourteen named routes on the M9 system, owned by the lead and three teammates, measured by what a route imports and a capture someone looked at

- **Date:** 2026-09-16 · **Decided by:** owner (the wave-6 brief and its `/goal`: «Put 14 named routes … onto the M9 design system, in one wave, without touching the frozen marketing contract»), the file-level map by the lead
- **Supersedes:** the wave-5 ownership map in `CLAUDE.md` as the map in force (it stays, marked as the record); `16` §16.3's wave-6 table (already superseded on sequencing by `DEC-110`); `DEC-085`'s placement of `app/page.tsx` in the lead-only list and of `app/sessions/page.tsx`, `components/browse/**`, `messages/*/browse.json` with `content`; `DEC-103`'s placement of `app/sessions/[id]/page.tsx` with the lead, which was for M9 only.

### The measure — the owner's, made mechanical

A route counts as done only when (1) its `page.tsx` **reaches `src/components/ui/` through its import graph** — directly or through a component it imports, type-only imports excluded — **and** (2) a 390 px RTL capture of it was **looked at**. `scripts/ui-reach.mjs` computes (1).

★ **The strict reading is the gate.** A route that reaches `ui/` only through `button.tsx`, `dialog.tsx` or `icons.tsx` **does not count**: those three predate M9 (`16` §1.1 — "`src/components/ui/` contains three files") and importing a legacy `ButtonLink` does not put a screen on the system. Measured on `main` at `413245f`, both readings, because the owner's quoted baseline sits between them:

| | strict (M9 primitives) | loose (any `ui/` file) | owner's quoted baseline |
|---|---|---|---|
| `(auth)` | 0/3 | 0/3 | 0/3 |
| `app/admin` | 1/24 | 14/24 | 2/24 |
| `app/sessions` | 2/6 | 3/6 | 2/6 |
| `app/me` | 0/7 | 1/7 | 0/7 |
| `app/platform` | 0/7 | 5/7 | 2/7 |
| `/app` | 0/1 | 0/1 | 0/1 |

★ **Passing the measure is the floor, not the bar.** One `Badge` import satisfies (1); the capture is what proves the screen was rebuilt to the canvas, and the canvas is a reference, not a specification (`DEC-114`).

### The fourteen

| Owner | Routes / surfaces |
|---|---|
| **lead** (3) | `(auth)/sign-in` · `(auth)/choose-org` · `(auth)/no-access` — plus two sweeps that are not routes: the shell disclosure sweep (`DEC-111`, `REQ-UIX-023`) and the numerals sweep (`DEC-124`, `DEC-132`) |
| **`sessions`** (3) | `/app` (the timeline, `DEC-112`) · `/app/sessions` (browse) · `/app/sessions/[id]` (the event page) |
| **`content`** (3) | the discussion on the event page (`REQ-UIX-024`) · materials (the slot and `sessions/[id]/materials/[materialId]`) · photos (the gallery slot) |
| **`console`** (5 + the layout) | the admin layout, and exactly: `/app/admin` (the dashboard) · `/app/admin/proposals` · `/app/admin/sessions` · `/app/admin/members` · `/app/admin/moderation/reports` |

**Why those five admin routes.** The dashboard is where `DEC-112` moved «يحتاج انتباهك» and `16` §6.7 wants "a real dashboard"; proposals, sessions and members are the three lists an admin opens every week and the three that most need `DataTable`'s phone card stack; the reports queue is where a flag raised from `content`'s rebuilt discussion lands (`REQ-EVT-008`), so the two ends of one loop move together. **Not chosen, deliberately:** `schedule` (its artboard is the two-tab re-cut, which needs `0084` and carries `DEC-117`/`DEC-118`'s walk-in setting — neither is this wave), `attendance` (adjacent to `DEC-116`'s attendance editing, decided and not built), `settings` (the lead edits it in the numerals sweep), and the studio routes (`designer`'s, M12).

### Three consequences the map resolves rather than leaves to the day

1. ★ **`/app` and `/app/sessions` are ONE component on two routes, not a redirect.** `DEC-112` said the first "redirects or renders" the second. It **renders**: sign-in lands on `/app` and a redirect would cost every member a round trip on every landing. `/app/sessions` stays the canonical, linkable, filterable URL — tag chips, the shell's search form and every existing link already target it — and a filter applied on `/app` navigates there. **The phone tab bar loses «الرئيسية»**: one tab, «الجلسات», current on both routes, because two tabs for one destination is exactly what `DEC-112` forbade.
2. ★ **Files of tracks NOT spawned this wave are held by the lead as custodian** — `checkin`, `event` (ratings), `notify`, `scoring`, `designer`, `platform`, `branding`. No redesign; the lead edits them for the numerals sweep and on a teammate's written request, nothing else. **Three presentation files transfer outright**, because the event page cannot be rebuilt to `Main.dc.html` without them: `components/checkin/{rsvp-panel,attendance-outcome}.tsx` and `components/calendar/add-to-calendar.tsx` go to **`sessions`** — markup and classes only; the gating predicates, `session-matrix.ts`, `lib/dal/{rsvp,checkin}.ts` and every matrix assertion stay untouched and green.
3. ★ **The discussion transfers from `event` to `content`**: `components/event/{comments,comment-composer,comment-item,comment-list,actions}`, `lib/dal/{comments,reactions,reports}.ts`, `lib/realtime/**`, `messages/*/event.json`. `ratings.tsx`, `star-rating.tsx`, `rate/**` and `ratings.json` stay `event`'s — the rate screen is not this wave. **"Visible upload controls" means the photo and materials uploaders onto `ui/file-drop`**: `comments` has no attachment column (`0010:284-296`), so attachments on a comment would be a new schema, which is a decision for the owner, not a composer detail.

### The rest of the transfers, for the record

`/app/page.tsx` lead → `sessions`; `app/sessions/page.tsx`, `components/{browse,search}/**`, `lib/dal/{search,bookmarks}.ts`, `messages/*/{browse,search}.json` → `sessions`; `app/sessions/[id]/page.tsx` lead → `sessions`. `src/lib/form-state.ts` is `sessions'` — it built it in M9 — and `CLAUDE.md`'s lead-only list, which named it too, is corrected. `console` keeps every admin route it held, but edits only the five above plus the layout this wave; the other nineteen are never-touch until wave 7.

- **Documents changed:** `CLAUDE.md` (the wave-6 map), `.claude/agents/*.md` (all ten), `STATUS.md` (the checklist), `scripts/ui-reach.mjs` (new)

---

## DEC-131 — `sign-in` has no credential field, so `SC 3.3.8` holds by construction; `DEC-129`'s three clauses are applied to what the screen actually is

- **Date:** 2026-09-16 · **Decided by:** lead, from the tree, on starting `DEC-129`'s carried work
- **What the tree says.** `(auth)/sign-in/page.tsx` renders **one control**: a `<form method="post" action="/api/auth/sign-in">` with a hidden `next` and a «الدخول عبر Google» button. There is **no code field, no password field and no input a member types into** — authentication is Google's OAuth (`REQ-AUT-001`), and no magic-link or one-time-code path exists anywhere (`grep one-time-code src/` → nothing).
- **So `DEC-129` clause 1 has no field to apply to.** «Paste is allowed into the code field, `autocomplete="one-time-code"` is present» describes a screen this product does not have. `SC 3.3.8` Accessible Authentication asks that **our** step not require a cognitive function test; a single button requires none, and the credential step happens at Google, whose conformance is Google's.
- **Decision.** (1) The rebuilt `sign-in` is tested for what makes `SC 3.3.8` true **here**: the page contains **no text-entry control**, its one action is a named `<button>`, and nothing on it intercepts `paste`, `copy` or autofill. (2) ★ **If an email one-time code or magic link is ever added, `DEC-129`'s three clauses bind that field in full** — this entry defers them, it does not waive them. (3) `DEC-129` clause 2 (numerals) and clause 3 (`no-access` names the next action, `REQ-UIX-012`) apply unchanged.
- **Not done, deliberately:** inventing a code field so the clause has something to test. That would be a new authentication method, decided by nobody.
- **Also reads** `STORY-UIX-016`'s second bullet (`4d0e67f`), which repeats the same «paste into the code field» wording — the story is right about the obligation and wrong about the field, and this entry is how it is applied.
- **Supersedes:** nothing. Reads `DEC-129` clause 1 against the screen that exists.
- **Documents changed:** `STATUS.md`

---

## DEC-132 — The numerals sweep, measured: the column is `org_settings.numerals`, the frozen contract holds eleven glyphs not three, and the parity fixture stays

- **Date:** 2026-09-16 · **Decided by:** lead, measuring `DEC-124`'s debt before touching it
- **Three corrections of fact to `DEC-124` and the wave-6 brief.**
  1. **The column is `org_settings.numerals`**, not `orgs.numerals` (`0004_tenancy.sql:113`). The enum is `public.numeral_system` (`0003:13`). Readers in SQL: `0030` (`send_notification` context), `0063` and `0065` (render-context functions **returning `numeral_system` in their result type**, so they are dropped and re-created, not replaced), `0080` (the public card). The migration is **`0082`** — `16` §16.4's reservation of `0082` for objectives is sequencing `DEC-110` superseded, and migration numbers are promotion order.
  2. ★ **The frozen marketing contract holds eleven Arabic-Indic glyphs, not three.** `(marketing)/page.tsx:16` has three; **`src/components/chapter.tsx:5` has eight** (`["٠١", "٠٢", "٠٣", "٠٤"]`) and is imported by that page. It is a marketing component on the frozen route, so **all eleven wait for M13**, and the brief's "three" undercounted the frozen half by the part that lives outside the route file.
  3. **The setting reaches ~150 files across every track** — twenty DAL modules select it, and `formatNumber`/`formatDateTime`/`formatTime` take it as a parameter at every call site, including every file this wave's three teammates will rebuild. **So the sweep lands atomically, before any teammate edits code**; a teammate re-skinning `admin/members/page.tsx` while the lead removes a parameter from it is a guaranteed conflict in a shared tree.
- **What stays, and why it is not an exception to the rule.** `scripts/parity/cases.mjs`'s `numeral-systems` case renders «٣ جلسات · 3 sessions · ١٢٣ / 123» into a golden. It proves **the font set can shape** Arabic-Indic digits — which a member can still type into a title or a comment — not that the product renders them. `DEC-124` governs what the product emits; a font-shaping fixture is neither a surface nor a setting, and removing it would move goldens for no product change.
- **What the sweep does.** `numerals.ts` loses `NumeralSystem`: `formatNumber(value)`, `formatDateTime(iso, timeZone, locale)`, `formatTime(iso, timeZone, locale)`, always `nu-latn`; the designer runtime's binding formatters and the worker's mail renderer the same; every DAL `select("numerals")` and every DTO `numerals` field removed; the settings form's numeral field and its action removed; `admin.json`'s `numeralsArabicIndic` keys removed; the 27 message glyphs rewritten Western. ★ **The migration is NOT part of the sweep** (the owner, 2026-09-16): `0082_western_numerals.sql` — re-creating the four SQL readers without the column, then dropping `org_settings.numerals` and `public.numeral_system` — is a forward-only change to a live database with real members (invariant 3), so it is **rehearsed exactly as Launch step 2 was** before it enters the PR: the owner runs `supabase db dump --linked` (schema only — the CLI's default), the dump is applied to a fresh local Postgres, **every** migration including `0082` is applied on top, `npm run test:rls` runs green against it, and the dump is deleted. The numbers make the drop safe — `not null default 'western'`, and no row was ever `arabic_indic` — which is a reason to verify, not to skip. **The code half lands first and is correct on either side of the migration:** once nothing reads the column, dropping it changes no rendered output. **The catalogue test:** `tests/unit/messages-numerals.test.ts` fails on `U+0660–U+0669` and `U+06F0–U+06F9` anywhere under `src/messages/**` (`REQ-INT-006`'s acceptance). Comments that quote an Arabic-Indic example are rewritten Western, because a comment is where the next author copies from.
- **Supersedes:** `DEC-124`'s "three glyphs in `(marketing)/page.tsx`" and its `orgs.numerals` naming.
- **Documents changed:** `STATUS.md`, a migration (rehearsed before promotion)

---

## DEC-133 — "The icons aren't correctly positioned" had a root cause: `inset-inline-*` compiles to nothing in Tailwind 4, and an empty toast viewport sat over the tab bar

- **Date:** 2026-09-16 · **Decided by:** lead, from the 390 px capture taken for `DEC-111`'s sweep
- **What the capture showed.** At 390 px the phone header's controls bunched beside the wordmark and left the far side empty, and the notification bell was an 8 px dot that read as a stray full stop. Chasing the geometry found the class underneath it.
- ★★ **Tailwind 4 has no `inset-inline-*` or `inset-block-*` utility.** It spells logical insets `start-*` / `end-*` (and `inset-x-*` / `inset-y-*`). Measured against the compiled stylesheet: every utility-shaped token in `src/` outside marketing is present **except four**, all in the shell — `inset-inline-0` (the phone tab bar, the toast viewport), `inset-inline-start-3` (the shell search glyph), `md:inset-inline-end-auto` (the toast viewport). Each compiled to nothing: **the fixed tab bar had no inline edges and shrink-wrapped its tabs instead of spanning the screen**, the search glyph had no offset, and the toast stack was unanchored. It is `DEC-108`'s class exactly — a class that reads as correct to anyone who knows the CSS property names, and that no type check, lint rule or test can see.
- ★ **A second defect surfaced through the gate that caught it.** The toast viewport is `fixed`, `z-40`, padded to clear the tab bar — and when EMPTY it was still an invisible box about 112 px tall over the `z-30` tab bar, with pointer events on, sitting over the middle tabs. The "at most one fixed bottom bar" assertion counted it the moment its inline edges started working.
- **Decision.** (1) The four tokens become `start-0 end-0`, `start-3` and `md:end-auto`. (2) The toast viewport is `empty:hidden` and `pointer-events-none`, each toast `pointer-events-auto`. (3) **The bell is the house `BellIcon`** at icon size on every width, a 44 px target, the unread count a small badge on its inline-end shoulder below `md`. (4) A spacer pushes the header's actions to the inline end on a phone. (5) **`tests/unit/logical-utilities.test.ts` refuses `inset-inline-*` and `inset-block-*` anywhere under `src/`**, comments stripped so the fix's own explanation cannot trip it — proven to fail on a planted `inset-inline-0`.
- **The owner's DEC-111 sweep, as delivered with it:** both shell menus on `ui/menu` (Radix) — closing on selection, on an outside press, on `Escape` with focus returned, one at a time; the account menu's sign-out a real POST submitted from outside the menu's portal; the tab bar at three tabs (`DEC-130`); `tests/e2e/shell-disclosures.spec.ts` asserting each behaviour on both projects, including that no menu survives a navigation.
- **Two edges remain open, in teammates' primitives, requested rather than worked around:** `ui/menu` renders `href` items as a plain `<a>` (a full reload, `console`'s file) and `ui/input` gives the search field no way to clear its glyph without pairing `ps-10` with the size's `px-4` (`sessions`' file). Both close in this wave.
- **Supersedes:** nothing. Extends `DEC-111` with the cause and `DEC-108` with a second gated class.
- **Documents changed:** `src/components/shell/**`, `src/components/ui/{toast,route-progress}.tsx`, `src/components/notifications/bell.tsx` (the lead as custodian, `DEC-130`), `STATUS.md`

---

## DEC-134 — Under the loading model a gated page's `notFound()` streams a 200 with `noindex`; the not-found page is Arabic everywhere under `/app`, and the proxy stays out of authorization

- **Date:** 2026-09-16 · **Decided by:** lead, from wave 6's first real e2e run of the admin console
- **What the run showed.** Every "a member gets a real 404" assertion under `/app` failed with **200**: `/app/admin`, `/app/admin/members`, `/app/admin/proposals`, and `/app/admin/moderation/comments` — a wave-7 route nobody touched — and so does the event page for a session that does not exist. Traced on a served build: each answers **200, `<meta name="robots" content="noindex">`, and the not-found UI**, and renders no data. On `/app/admin` that UI was **Next's built-in English page** («404 · This page could not be found.»), because no `not-found.tsx` sat above the static admin routes.
- **Cause — M9's loading model, not wave 6's screens.** `app/loading.tsx` (`b163873`) wraps every page under `/app` in a Suspense boundary, so the response has begun streaming — status committed — before any gate runs; Next 16 then renders the not-found boundary into the stream and injects `noindex` (`node_modules/next/dist/docs/01-app/02-guides/streaming.md`, "The HTTP contract"). The specs asserting a real 404 predate M9 and were not run against it. (An earlier reading during the wave blamed `console`'s layout-level gate; that layout did have a separate crash, fixed in `1f4fffe`, but the status code is the loading model's.)
- **Decision.**
  1. **A gated page under `/app` answers `notFound()` with the streamed contract — 200, `noindex`, the not-found page — and that is accepted.** The authorization is unchanged: the gate is in the DAL and the page renders nothing it guards. The alternatives were worse: **a role gate in `proxy.ts`** would reverse `DEC-036`'s "three jobs, none of them authorization" and copy the per-route admin/moderator map into a second place to drift; **removing the loading boundaries above gated pages** would undo `REQ-UIX-005` and the `DEC-087`/`DEC-091` coverage gate for a status code no member sees.
  2. **The e2e assertions change from "status is 404" to "the not-found page, with `noindex`, and none of the guarded content"** — which is what the requirement protects. The admin specs are `console`'s to rewrite.
  3. ★ **`src/app/[locale]/app/not-found.tsx`** (the lead's, beside `app/loading.tsx`) catches every `notFound()` under `/app` that has no nearer boundary — Arabic, `ui/route-error`, back to `/app`. It also covers the six dynamic segments the route-coverage allowlist still excused: **the not-found allowlist is 6 → 0.**
  4. A route that must return a real 404 status — a public one a crawler reads — keeps it the way `/s/[id]` and `/verify` do: before any Suspense boundary, or at the edge under `DEC-038`'s unconfigured gate. None under `/app` needs it.
- **Supersedes:** the "real 404" wording in the admin, moderation and proposal-queue specs written in waves 1–3.
- **Documents changed:** `src/app/[locale]/app/not-found.tsx`, `scripts/route-coverage-allowlist.json`, `STATUS.md`

---

## DEC-135 — A transition that re-renders the event page could hang forever: React 19.2 loses a ping, `ae7624e` exposed it, and every pending control now nudges

- **Date:** 2026-09-16 · **Decided by:** lead, from wave 6's real-build e2e run and a bisect
- **What the run showed.** On a production build, on a quiet machine: after «احجز مقعدك» the RSVP is in the database and the Server Action's whole response has arrived (303, `text/x-component`, ~192 KB). Yet in about **one press in three** the page never commits. The button stays busy past 80 s, the main thread is idle, no DOM mutation happens, and there is no further request and no console error. **Any later React update commits it at once** — one character typed in the composer. The same shape showed up as content's slow post keeping «نشر» busy, and as a deleted comment's tombstone that never appeared after `router.refresh()`.
- **Bisect** (8 presses per build, `tests/e2e`-style probe in the verification worktree): `73b0f3e`, `7593967`, `dd10fd7` and `496c937` are clean, 8/8 at ~105 ms. **`ae7624e`** (the event page on the system) sticks 3/8; `c4e7642` 5/8; HEAD 1/3, 5/8 and 3/6. None of these patches removed it: every `Suspense` → a Fragment; `redirect()` → `refresh()`; a plain button (no `useFormStatus`); unbound actions with hidden inputs; `ui/link` without its pending reporter; the calendar menu → plain text.
- **Cause, read from an instrumented `react-dom`** (`next/dist/compiled`, React 19.2.4, logging `handleThrow`, `attachPingListener` and `pingSuspendedRoot`):
  1. The transition render suspends `<article>` on a Flight chunk still `pending`.
  2. The render yields, the row is parsed, and the chunk becomes `resolved_model`.
  3. React resumes. `isThenableResolved` counts only `fulfilled`/`rejected`, so it unwinds and calls `attachPingListener`.
  4. Flight's `then()` initialises the chunk and **pings synchronously, inside the render**.
  5. The root is already `RootSuspendedWithDelay`, so `pingSuspendedRoot` neither restarts the render nor records the ping on it.
  6. `markRootSuspended` then clears `root.pingedLanes`, and nothing is scheduled.

  Both stuck presses end on exactly that attach→ping; the clean one has none. `markRootUpdated` clears `suspendedLanes` on any update — hence the typed character.
  - `ae7624e` did not add a bug. It turned the page's children into async server components, ~95 lazy rows in every action or refresh payload, and each is a chance for the race.
- **Decision.**
  1. ★ **`src/components/ui/pending-nudge.ts` — `usePendingNudge(pending)`.** While pending, it re-renders its own component every 300 ms, which un-suspends the root and lets the lost retry run. Measured with a 750 ms tick: **16 of 16 presses committed**, the would-be hangs at the first tick. A transition that commits normally never sees a tick.
  2. **`ui/submit-button` and `ui/link`'s pending reporter call it** — every form action and every link navigation on the system.
  3. **Every other transition that waits on server content calls it**: `content`'s comment composer and items (their `router.refresh()` moves into a tracked transition) and the materials and photo uploaders; `sessions`' filter sheet. Each track does its own files.
  4. **Not a restructure of the event page.** Making ~95 async server components synchronous would reverse the slot contract (`DEC-092`, `DEC-103`) across three tracks, and it only lowers the odds.
  5. **Not a Next/React upgrade inside a wave.** Whether a newer React keeps the ping is unverified. It is the owner's call, with the lockfile rule.
- **Remove when** the bundled React records a synchronous render-phase ping on a `RootSuspendedWithDelay` root. The e2e reserve test and the discussion review are the proof; delete the file and its callers together.
- **Supersedes:** `content`'s `setTimeout(…, 0)` (`44485b8`) and `afterPaint` (`4582b17`) explanations of the stuck «نشر». Both treated a symptom of this.
- **Documents changed:** `src/components/ui/{pending-nudge.ts,submit-button.tsx,route-progress.tsx}`, `tests/components/ui/pending-nudge.test.tsx`, `STATUS.md`

---

## DEC-136 — The owner takes the `react-dom` patch: `DEC-135`'s nudge is a workaround with an end date, and wave 7 opens by removing it

- **Date:** 2026-09-16 · **Decided by:** owner («apply sessions' one-line React patch and delete the workaround»), on the choice `DEC-135` left open
- **Decision.** `sessions`' one-line change to `pingSuspendedRoot` is applied through **`patch-package`**, and **`src/components/ui/pending-nudge.ts` and every caller are deleted in the same change**. The bug is reported upstream to React.

### Why the workaround could not simply stay

`DEC-135` established the cause: a transition suspends on a Flight chunk still `pending`; the chunk
resolves to `resolved_model`; React resumes, `isThenableResolved` counts only `fulfilled`/`rejected`,
so it unwinds and attaches a ping listener that never fires. **About one press in three of
«احجز مقعدك» never commits** — on a production build, on a quiet machine, with the RSVP already
written and the Server Action's whole response delivered.

`usePendingNudge` makes a lost ping harmless by forcing a later update. It does not make the ping
arrive. Every new pending control has to remember to adopt it, and **nothing fails when one
forgets** — the control simply hangs one press in three, on the action that matters most. A
workaround whose failure mode is silent and whose adoption is manual is a workaround with a short
shelf life.

### The blast radius, measured — this is why it is a task, not an edit

**21 files** reference the nudge today: 18 under `src/`, 3 under `tests/`. They span
`admin/{sessions,members,proposals,moderation}`, `ui/{submit-button,route-progress}`,
`{materials,photos,event,tasks,browse,search}` — **three tracks' ownership and the lead's**.
`patch-package` is **not** installed.

### The order, and it is not negotiable

1. **`patch-package` added**, lockfile regenerated **through Docker** (`npm run lockfile` — never a
   plain `npm install`; the npm-version trap has broken CI twice).
2. **The patch applied and the nudge deleted in one change**, so no state exists where a control has
   neither.
3. ★ **Verified against the bug's own shape.** It is **probabilistic**, so a single green run proves
   nothing: the bisect that found it used **8 presses per build** and the fix measured **16/16 at
   ~105 ms**. Reproduce that standard before the PR, on a production build, on a quiet machine.
4. The full gate set — `build`, `qa` 44/44, `visual` 0.000%, `db:reset` + `test:rls`, e2e.
5. **Reported upstream**, with the instrumented-`react-dom` reasoning from `DEC-135`.

★ **If the patch cannot be verified to that standard, the nudge stays and this entry is amended by a
follow-up.** Reverting to a silent 1-in-3 hang on the product's primary action is not an acceptable
outcome of a tidying change.

### And the exit

When a React or Next release carries the fix, the patch is dropped and the pin removed. `DEC-135`'s
diagnosis is the record of why the patch existed, so a later reader does not restore a workaround
whose cause is gone.

- **Supersedes:** `DEC-135`'s open choice. The diagnosis stands unchanged.
- **Documents changed:** `STATUS.md`, `docs/plan/notes/wave-7-lead.md`

---

## DEC-137 — Wave 7 is the remaining member and staff routes on the M9 system, with the check-in switch built on the screens it lives on; `console` becomes opus

- **Date:** 2026-09-16 · **Decided by:** owner (the wave-7 brief: «about eighteen routes, four teammates», `checkin`'s screens and switch together, `console` promoted to opus, six admin routes the lead names), the file-level map by the lead
- **Supersedes:** `DEC-130`'s wave-6 map as the map in force (kept in `CLAUDE.md` as the record); `DEC-085`'s placement of `src/app/[locale]/app/me/layout.tsx` with the lead; the lead's hold on `src/lib/dal/members.ts` and `messages/*/profile.json`; `DEC-130`'s presentation-only transfer of `components/checkin/{rsvp-panel,attendance-outcome}.tsx` and `components/calendar/add-to-calendar.tsx`, which ends.

### Task one came first, and it held

`DEC-136` was executed before anyone spawned, in one commit (`7d50e64`): `patch-package` added through the
Docker lockfile, `patches/next+16.2.10.patch` applied to the four client builds of the `react-dom` Next
vendors, and `ui/pending-nudge` deleted with all 21 files that referenced it. **Verified at the bug's own
standard on this machine, on production builds, back to back:** nudge deleted and `react-dom` unpatched —
the probe hung **9 of 16** presses; patched — **16 of 16, twice, at ~104 ms**. The probe is now
`tests/e2e/reserve-probe.spec.ts`, and `tests/unit/react-dom-ping-patch.test.ts` fails when the patch is
not installed (proven red on the unpatched copy). `DEC-136` needs no amendment.

### The measure — `DEC-130`'s, with the capture made checkable

A route is done when (1) `node scripts/ui-reach.mjs --wave7` shows it reaching an **M9** primitive
(strict) and (2) a 390 px RTL capture exists **at the path its row cites** — `.qa-shots/rtl/wave7-<track>-<route>-<state>.png`
in the main checkout, phone project, `390 × 844` — from a production build the row names by commit, opened
by the lead, with the spec that regenerates it named in the row. Wave 6 lost an hour to captures taken in a
verification worktree that never reached the cited path; so every review spec honours `E2E_SHOTS_DIR`, and a
worktree run points it at the main checkout. **Baseline on `7d50e64`: 4 of 23 strict** (check-in, both
propose pages, the admin layout — the floor, not the bar).

### The routes, by owner

| Owner | Routes / work |
|---|---|
| **lead** | task one (above) · `global-error` resolved by a test on a production build · `ui/splash`'s LCP measurement (`16` §7.2) · `REQ-EVT-010` reconciled with the pipeline · the upstream report of `DEC-135` · promotion, gates, the PR |
| **`checkin`** (sonnet) | `/app/sessions/[id]/check-in` · `/app/sessions/[id]/host` · ★ `/app/admin/sessions/[id]/attendance` — **and** the switch with its ceiling (`REQ-CHK-015`, `016`), the admin's removal with its reversal (`REQ-CHK-017`), walk-ins as a publishing setting (`REQ-CHK-010`, `DEC-117`, `DEC-118`) |
| **`sessions`** (opus) | `/app/propose` · `/app/propose/[id]` · ★ `/app/sessions/[id]/rate` · `/s/[id]` · ★ `/app/members/[id]` · ★ `/app/leaderboards` |
| **`content`** (sonnet) | ★ all seven `/app/me` routes, as one hub (`16` §6.5) |
| **`console`** (★ opus) | the admin rail's fourteen-group IA (`16` §6.7) · `/app/admin/moderation/comments` · `/app/admin/moderation/photos` · `/app/admin/venues` · `/app/admin/categories` · `/app/admin/companies` · `/app/admin/settings` |

### Why these six admin routes, and not the other thirteen

- **`moderation/{comments,photos}`** complete the moderation group whose third queue wave 6 rebuilt, and
  the dashboard's «يحتاج انتباهك» links straight into them; they also carry wave 6's one uncaptured state,
  the populated photo-report card.
- **`venues`, `categories`, `companies`** are one list pattern three times — `DataTable`'s phone card stack
  with a create/edit form — so they cost one design and complete the org-setup group; **`settings`**
  completes «الإعدادات», and its numerals field is already gone (`DEC-124`).
- **Not chosen:** `sessions/[id]/schedule` — its artboard is `DEC-075`'s two-tab re-cut, which needs `0084`
  (not this wave); rebuilding it now means rebuilding it twice. `sessions/[id]/attendance` — `checkin`'s this
  wave (below). `audit`, `exports`, `scoring`, `recognition`, `reminders` — wave 8. `designer/**`,
  `templates/**`, `sessions/[id]/certificates` — `designer`'s, M12. `emails` — `notify`'s, M12. `branding` —
  `branding`'s.

### `checkin`'s surface, and the two admin screens it reaches

- ★ **`admin/sessions/[id]/attendance` transfers to `checkin`.** `REQ-CHK-017`'s removal is an act on that
  screen (SCR-044) and its hard half — a compensating `reversal` entry on an append-only ledger with its own
  idempotency key, and `revoke_certificate()` for an issued certificate — is `checkin`'s design. The screen
  and the feature travel together, which is the brief's rule and wave 6's lesson.
- ★ **`admin/sessions/[id]/schedule` is transferred feature-only**: `checkin` adds the walk-in field and its
  parameter to `schedule-form.tsx`, `actions.ts` and `state.ts`, and nothing else. **It cannot wait for the
  re-cut**: `DEC-117` removes the host view's toggle, so a wave that removes the toggle without adding the
  field leaves an admin on a live product no way to set walk-ins at all.
- **What `checkin`'s plan must settle before code, and bring to the lead rather than decide:** (a) the
  check-in window, because `REQ-CHK-004` and `REQ-SES-005` close it when the session ends «including when an
  admin completes it early», and `0078` made the code live-only, while `DEC-116` extends the tail to
  `ends_at + 2 h`; (b) what a removal does to everything else attendance granted beyond points and the
  certificate — the rating right, photo upload, streaks, badges, levels, no-show evaluation; (c) how a late
  `award_points` or `issue_certificates` finds its check-in gone.

### Three contracts, published in the owner's note on day one

1. **`checkin` → `sessions`:** `schedule_session()`'s new signature; `sessions` threads the parameter through
   `lib/dal/sessions.ts`.
2. **`checkin` → `sessions`:** the switch as a DTO field and a predicate; `sessions` wires the event page's
   check-in link from it.
3. **`checkin` → `content`:** the reversal entry's `action_key`, key shape and reason; `content` renders it in
   `me/points` as an entry, never a number that quietly changed.

### One writer per file — JSON and specs included

Wave 6 held the rule for source and primitives; this wave extends it to the two kinds of file that had
several readers and no named writer. **A screen's strings move with the screen** — `checkin` moves the
attendance and walk-in strings from `admin.json` into `checkin.json`, `sessions` moves the public profile's
from `profile.json` into a new `members.json` — and the old keys are deleted by the file's owner on request.
**A spec has one writer**; the lead holds the specs that span routes of several tracks or of none this wave
(`a11y`, `budgets`, `second-org`, `session`, `shell-*`, `notify-screens`, `certificates`, `reserve-probe`, …).
**"Add-only"** on another track's DAL module means a new exported function or a new optional DTO field behind
`requireSession()` — never a changed signature, select, filter or gate.

### Found while gating task one, and carried

`proposal-materials.spec.ts:140` (a strict locator resolving to two elements) and `tasks.spec.ts:143` (the
event page's tasks section absent for the member the spec seeds) fail **identically on a build of `main`
(`f4bfb82`)**, so they are wave-6 debt, not task one's: the first goes to `sessions` (whose spec it is this
wave), the second to `content`, each to decide whether the spec or the product is wrong.

- **Documents changed:** `CLAUDE.md` (the wave-7 map; `patches/**` lead-only), `.claude/agents/*.md` (all ten), `STATUS.md` (the checklist), `scripts/ui-reach.mjs` (`--wave7`)
