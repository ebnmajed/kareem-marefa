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
- **Decision 6 — parity is 28 of 28 on all four export paths** on the local converter, goldens unchanged through the whole wave: the identity override held at every seam.
- **Decision 7 — the `ImpersonationBanner`** is real on the platform shell and on `/no-access` (the lead's wiring), which under DEC-055 is every screen a break-glass session can reach; the stop control is a client component because ending the session removes the org from the NEXT token and the current one lives 900 s.
- **Left open, named:** the terminal handling for a deleted subject in `build_data_export`, `delete_org`, `expire_impersonation` and `anonymise_members` (a job whose row is gone retries 25 times today; `platform` did not confirm the change before shutdown — the Launch session's first worker item, `render_variant`'s warn-and-return is the pattern); DEC-055's option A (a fourth session state so a break-glass session browses the org's screens); the check-in budget (DEC-055); `data_export_requests.storage_path` (drop once the fixture writes `payload`); the two font ids on the kit, unbound (DEC-053); STORY-NFR-005's load test; the QR scan and the ICS-in-Outlook checks and the real-device pass, the owner's at Launch; Sentry as the `AlertSink` transport at Launch.
- **Working rules** added to `TEAM.md` §5 (wave 4): a reset leaves Kong pointing at the old Auth container — the reset script probes and restarts it; the brand override is composed before the fingerprint, never at render time; a lead's fixture row fires a teammate's history trigger; `(f()).*` evaluates a composite function once per column; a budget the framework's baseline cannot meet is a plan number, not a gate; **a screen is "complete and unverified in the browser" until a real session walks it on a real build** — the shell can redirect before any page code runs, and only an e2e that asserts the final URL sees it; a job whose subject is gone returns, it does not retry twenty-five times.
- **Supersedes:** `worker/src/index.ts`'s 60 s poll (DEC-034's comment stands as the rationale for a long interval; 15 s is the measured compromise); nothing else.
- **Documents changed:** `TEAM.md` §5, `STATUS.md` (the Launch handoff), `worker/src/index.ts`, `src/app/[locale]/app/layout.tsx`

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
