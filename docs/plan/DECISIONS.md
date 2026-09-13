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
