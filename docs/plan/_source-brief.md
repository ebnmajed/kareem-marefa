# Planning Prompt — Multi-tenant Knowledge-Sharing Platform (SlideShare × Meetup for offline sessions)

Paste this whole document into Claude Code as the first message of a new session in an empty repository.

---

## 1. Your role and the job

You are the lead product architect for a new web application. Your job in this session is to produce a complete, implementation-ready **plan** — not application code. The plan covers the **entire product in one pass**: there is no MVP cut. Everything in scope below ships as one product; the roadmap only orders the build.

Write every planning document in **English**, as Markdown under `docs/plan/` in this repository, plus a `CLAUDE.md` at the repository root that captures the conventions you settle on so later coding sessions inherit them.

## 2. How to work

1. Read this entire prompt before writing anything.
2. The **Decisions** in §4 are final. Do not reopen, soften, or "improve" them.
3. The **Assumptions** in §5 are provisional defaults, used because the owner said "you decide" or did not specify. Carry each into `ASSUMPTIONS.md` under its ID. You may propose a better default, but only next to the original with a one-line rationale — never silently replace it.
4. Do **not** invent features. If something you need is missing and blocking, stop and ask — batch every blocking question into a single message before producing any documents. Non-blocking gaps go into `OPEN-QUESTIONS.md` with your recommended default, and you proceed on that default.
5. Prefer boring, proven choices. Each library or service you introduce needs a one-line justification and one named alternative.
6. Everything must be traceable: every entity, policy, screen, background job, and notification maps back to a numbered requirement in the PRD.
7. When finished, list every file you produced and every assumption you changed.

## 3. The product in one paragraph

A multi-tenant web platform where an organization's members share knowledge through **offline, in-person sessions**. A member submits a topic to present; an org admin reviews it, schedules a date and venue, designs a poster, and publishes it. Members RSVP (with capacity, waitlist, and deadlines), add the session to their calendar, complete reminder-only pre-session tasks, and download pre-reads. At the session, the presenter announces a time-limited check-in code; entering it is the only proof of attendance. The event page carries threaded comments, reactions, photos, and the presenter's materials (slides in an in-browser viewer, audio, video links, images). Attendance, presenting, ratings, and interaction earn points on an admin-configurable, auditable ledger, feeding individual, monthly, per-topic, and per-company leaderboards, badges, levels, streaks, and perks. Certificates (attendance, presenting, achievements) are generated from a visual certificate builder that shares its engine with the poster designer, delivered as PDF and email, and verifiable by unique ID and QR. Arabic is the first language with full RTL; English follows.

## 4. Decisions (final)

### 4.1 Tenancy and identity
- D1. Multi-tenant: many organizations ("orgs"), each with its own admins, members, content, scoring, and branding.
- D2. Only the platform super admin creates an org. No self-registration of orgs.
- D3. Orgs are fully isolated. No data, member, session, material, leaderboard, or search result is ever visible across orgs. Design RLS so cross-org reads are impossible, not merely hidden.
- D4. A user account belongs to exactly one org. There is no account that spans orgs.

### 4.2 Language and locale
- D5. Arabic is the launch language with full right-to-left layout. English is added later. Internationalization is built from day one: every UI string externalized, locale-aware dates and numbers, RTL-first CSS using logical properties, Arabic-first typography. Nothing in the layout may assume LTR.
- D6. Planning documents are written in English.

### 4.3 Roles
- D7. Platform level: **super admin**.
- D8. Org level: **org admin** (full control of the org) and **member** (default). See A1 for the moderator tier.
- D9. "Presenter" and "attendee" are per-session states of a member, not roles. A member can present one session and attend another. Hosting may be gated by a perk (see D48).

### 4.4 Sign-in and membership
- D10. Google sign-in is the authentication method at launch and is essential. Design the auth layer so other methods can be added later without schema changes.
- D11. Membership is gated by email domain: each org has an admin-managed list of **one or more allowed email domains**. A Google account whose domain is on an org's list is auto-provisioned as a member of that org on first sign-in. No invites at launch.

### 4.5 Profiles and companies
- D12. Each org admin maintains a **company list**. Every member's profile has a **company** field chosen from that list. Company drives the company leaderboard (D46).

### 4.6 Session lifecycle
- D13. A member proposes a **topic only**. The proposal never includes a date or venue.
- D14. An org admin reviews the proposal: approve, reject, or request changes. The admin sets date, time, venue, capacity, RSVP deadline, cancellation cutoff, certificate mode (D50), pre-session tasks, and the poster, then publishes.
- D15. All sessions are offline/in-person. There is no live-streaming or virtual attendance.
- D16. Sessions move through explicit states (see A6 for the proposed set) with an audit trail of every transition and who caused it.

### 4.7 Venues
- D17. Each org keeps an admin-managed venue list (name, address, map link, capacity, notes). A session may instead use a one-off custom venue entered inline.

### 4.8 RSVP rules
- D18. Per-session capacity limit.
- D19. Waitlist with automatic promotion when a spot opens; the promoted member is notified.
- D20. RSVP deadline, after which no new RSVPs are accepted.
- D21. Cancellation cutoff before the session; cancellations after it are recorded as late cancellations (and may cost points if the org enables that — D40).

### 4.9 Attendance verification
- D22. The presenter announces a **check-in code** in the room. An attendee enters it in the app to be marked attended. This is the sole automatic proof of attendance.
- D23. The code is valid only during the session window, expires when the session ends, is single-use per member, and attempts are rate-limited. See A7 for rotation and A8 for the manual backup.
- D24. Verified check-in is the only trigger for attendance-based points, attendee ratings, attendee certificates, and photo-upload rights.

### 4.10 Session materials (the SlideShare side)
- D25. Every uploaded item belongs to a session. There are no standalone uploads.
- D26. Supported items: PDF; PowerPoint and Keynote files; Google Slides and other external links; video links (YouTube and similar); images; voice/audio recordings.
- D27. Slides (PDF, PowerPoint, Keynote) are consumed in an **in-browser page-by-page viewer**. The presenter sets a per-item **allow download** toggle. Audio gets an in-page player, video links an embedded player, images a gallery; other links open externally.
- D28. Materials carry an availability flag: **before the session** (downloadables, pre-reads) or **after** (slides, recordings). Presenter and admin can add materials; the admin can remove any.

### 4.11 Pre-session tasks and downloadables
- D29. A session can list pre-session tasks of four kinds: read/download a material; fill a form or questionnaire; confirm a checklist item (e.g. bring a laptop); external task (install software, watch a video).
- D30. Tasks are **reminder-only**. Completion is not required for check-in and earns no points. See A9 for handling of form responses.

### 4.12 Event page interaction
- D31. Threaded comments (one level of replies), reactions, and uploads on every event page, plus "all the rest" expected of a social event page: edit/delete windows, report/flag, mention of other members, notification of replies.
- D32. Any member may comment and react at any time — before, during, and after the session.
- D33. Photo uploads on the event page are limited to checked-in attendees, the presenter(s), and admins.
- D34. Photos appear immediately; admins can remove them.

### 4.13 Ratings
- D35. After the session, checked-in attendees rate the session and presenter.
- D36. Ratings are **anonymous to the presenter** (aggregates only). **Org admins can see who rated what.**

### 4.14 Scoring engine
- D37. Points live on an append-only **ledger**: every change records the member, amount, reason, source event (e.g. check-in ID), actor, and timestamp. Members can see their own full history.
- D38. **Org admins configure point values per action**, including caps and cooldowns, with a full audit trail of configuration changes (who, when, old value, new value).
- D39. Both presenters and attendees earn points. The action catalogue and default values are in §5 (A10); the admin can change any of them.
- D40. **Negative points exist but are off by default**; the admin decides which actions (no-show after RSVP, late cancellation, removed comment or photo) cost points and how much.
- D41. Admins can adjust points manually with a mandatory reason; adjustments appear in the ledger and audit log.
- D42. Anti-gaming is built in: RSVP alone earns nothing; reactions/likes earn nothing; attendee points require a verified check-in; per-session caps on comments and photos; a per-attendee presenter bonus with a cap.

### 4.15 Leaderboards and recognition
- D43. Leaderboards: all-time, monthly/seasonal, and per-topic (category).
- D44. **Company leaderboard**: companies compete on aggregated member points within a period. See A11 for the fairness metric.
- D45. Points and leaderboards are scoped to the org.
- D46. Company comes from the profile field in D12.
- D47. Badges for achievements; levels/ranks with titles; streaks (e.g. three sessions in a month); all configurable by the org admin.
- D48. Perks tied to levels or badges: priority RSVP and the ability to host, at minimum; configurable.

### 4.16 Certificates
- D49. Recipients: checked-in attendees, presenters, and achievement holders (badge earners, leaderboard winners).
- D50. Certificate issuance is a **per-session setting chosen when the admin designs the session**: off; automatic when the session is marked completed; or admin review and release.
- D51. Output: PDF download; delivery by email; a **verification page reachable by unique ID and QR code** printed on the certificate.
- D52. Certificates are produced by a **visual certificate builder** with templates.

### 4.17 Posters and the visual designer
- D53. Every published session has a poster. Posters come from an **in-app visual designer with a templates library**, or the admin **uploads a finished poster**.
- D54. The poster designer and the certificate builder are **one shared designer engine** with separate template libraries. Templates support dynamic fields (session title, presenter name, date/time, venue, org logo, recipient name, certificate ID, QR) and Arabic/RTL text.
- D55. The system defines the required poster sizes and generates every needed variant from a single master design or upload. Size presets are in A12; export formats in A29.
- D66. **Shaping parity is a hard requirement**: Arabic text in every export (poster PNG/PDF, certificate PDF, slide page images) must render exactly as it does in the editor — cursive joining, ligatures, stacked diacritics, mixed Arabic/Latin/digits. An export pipeline that cannot guarantee this is disqualified. See §6 "Arabic typography and exports" and A28.
- D67. Template libraries exist at two levels: a platform-wide set managed by the super admin (D59) and per-org sets that org admins create by duplicating and customizing platform templates or building from blank. Templates are versioned; publishing a new version never alters posters or certificates already generated.
- D68. Every poster carries a QR code linking to the session's event page; every certificate carries its verification QR and ID (D51). Both are designer layers, not post-processing.

### 4.18 Notifications and calendar
- D56. Channels: **in-app** and **email**. No SMS, WhatsApp, or push at launch.
- D57. Add to calendar: **both** a downloadable ICS with Google/Outlook/Apple links **and** real Google Calendar sync via the Google Calendar API for members who connect their calendar. Changes to time or venue propagate to synced calendars; cancellations remove the event.

### 4.19 Visibility
- D58. Everything is members-only; sign-in is required. The only unauthenticated routes are sign-in, legal pages, and the certificate verification page (A13).

### 4.20 Admin consoles
- D59. **Super admin console**: create and suspend orgs, set the first org admin, manage allowed domains, view platform-level metrics, manage platform-wide template libraries.
- D60. **Org admin console**: dashboard (proposal pipeline, RSVPs vs check-ins, attendance rate, active members, top presenters, topics, and companies, points issued); sessions; venues; categories and tags; company list; members and roles; moderation queues (proposals, comments, photos, reports); scoring configuration; badges, levels, streaks, perks; certificate templates; poster templates; email templates; branding; reminder schedule; CSV exports; audit log.

### 4.21 Tech stack and hosting
- D61. Next.js (App Router, TypeScript, React Server Components, Server Actions and Route Handlers) on **Vercel**.
- D62. **Supabase cloud** (any region): Auth (Google provider), Postgres with Row Level Security on every table, Storage with bucket policies, Realtime, Edge Functions where they fit.
- D63. A small **Node background worker** for jobs that do not belong in request handlers: PowerPoint/Keynote → PDF → page-image rendering for the viewer; designer exports to PNG/PDF; certificate PDF generation; email sending; Google Calendar sync; scheduled reminders; session state transitions on a clock; leaderboard snapshots; streak evaluation. Choose a Postgres-backed queue so no extra infrastructure is needed. The worker image ships with the platform's Arabic fonts installed (so LibreOffice renders Arabic slides correctly) and with headless Chromium for designer exports (A28).
- D64. Responsive web first; installable PWA later. Make no choice that would block adding a PWA (service worker, manifest, push) afterward.
- D65. Start fresh — no conventions inherited from any existing codebase.

### 4.22 Out of scope (do not plan these)
Payments or ticketing; public/SEO discovery pages; cross-org anything; native mobile apps; live streaming or virtual attendance; SMS/WhatsApp/push notifications; Q&A or polling modules separate from comments; recurring session series (A14); multi-org accounts.

## 5. Assumptions (provisional — carry into `ASSUMPTIONS.md`)

- **A1 Moderator tier.** In addition to org admin and member, add an org **moderator**: moderation queues, event-day operations (view check-in status, manual attendance backup), removal of comments and photos. No settings, no scoring configuration, no member management, no session scheduling.
- **A2 Org resolution at sign-in.** The sign-in page is global. The Google email domain determines the org. If a domain appears on more than one org's list, the user picks the org once and the choice is permanent (D4).
- **A3 Profile fields.** Name and avatar from Google; company (required, from the org list); job title; short bio; topics of interest (from org categories). Profiles are visible to all members of the org.
- **A4 Proposal form fields.** Title, abstract, category, level (introductory / intermediate / advanced), target audience, expected duration, co-presenters (other members), optional draft materials, notes to admin. Admins may also create a session directly and assign a presenter.
- **A5 Co-presenters.** A session can have more than one presenter; all presenters earn presenter points and certificates.
- **A6 Session states.** `draft → submitted → in_review → changes_requested → approved → published → (full) → in_progress → completed → archived`, with `cancelled` reachable from any state after approval. The worker moves `published → in_progress` at start time and `in_progress → completed` at end time; admins can override either.
- **A7 Check-in code rotation.** The presenter's host view shows a 6-character code that rotates every 10 minutes (org-configurable) so a forwarded code goes stale quickly; the previous code stays valid for a 2-minute grace period.
- **A8 Manual attendance backup.** Admins and moderators can mark attendance manually with a mandatory reason; every manual mark is audited and flagged in exports.
- **A9 Form-type pre-session tasks.** Responses to form/questionnaire tasks are stored and visible to the presenter and admins, but completion is neither enforced nor scored (D30).
- **A10 Default scoring rulebook** (all values org-editable). Attendee: verified check-in 20; rating submitted 5; comment 2 (cap 5 per session); photo 3 (cap 5 per session); streak bonus 15 for three check-ins in a calendar month. Presenter: proposal accepted 10; session delivered 50; 2 per checked-in attendee (cap 60); 20 bonus if average session rating ≥ 4.0 with at least five ratings; 10 for uploading materials after the session. Zero for RSVP, reactions, and viewing. Negative actions exist in the catalogue at 0 by default (D40).
- **A11 Company leaderboard metric.** Show both total points and points per active member for each company, and rank on the metric the org admin selects (default: per active member, to keep large companies from winning by headcount).
- **A12 Poster and certificate size presets.** Poster master design at 1080×1350 (4:5). Auto-generated variants: square 1080×1080 (feeds, WhatsApp), story 1080×1920, landscape 1920×1080 (event-page hero, venue screens/TVs), open-graph 1200×630 (link previews in email and chat), print A4 at 300 dpi (2480×3508) and A3 (3508×4961). Each preset has a defined safe area; text and logos are auto-constrained to it. Certificate presets: A4 landscape (3508×2480) and A4 portrait at 300 dpi. Export formats, bleed, and color handling are in A29; the upload path is in A32.
- **A13 Verification page.** Public, unauthenticated, rate-limited. Shows only recipient name, certificate type, session title and date (or achievement name), org name, issue date, and valid/revoked status. Nothing else about the org is exposed.
- **A14 No recurring series.** Each session is scheduled individually.
- **A15 Discovery.** Admin-defined categories plus free-form tags; org-wide search across sessions and materials (title, abstract, tags, presenter, company) using Postgres full-text search with Arabic-aware normalization (tashkeel stripping, alef/yaa/taa-marbuta folding); filters by category, date, venue, level, presenter, company; personal bookmarks (no points).
- **A16 File limits** (org-configurable): documents 50 MB, audio 200 MB, images 20 MB, poster uploads 30 MB. Replacing a material keeps prior versions in a version list.
- **A17 Ratings structure.** Session 1–5 stars, presenter 1–5 stars, optional free text, one rating per attendee per session, editable for 14 days after completion.
- **A18 Realtime.** Comments, reactions, RSVP counts, and check-in counts update live via Supabase Realtime.
- **A19 Reminders.** Defaults: 7 days, 1 day, and 2 hours before the session; post-session rating prompt 1 hour after completion; org-configurable; each member controls their own notification preferences.
- **A20 Time and calendar.** Gregorian dates rendered with Arabic locale formatting; org default time zone Asia/Riyadh; all timestamps stored in UTC.
- **A21 UI kit.** Tailwind CSS with shadcn/ui, extended with Arabic-first tokens (fonts, line heights, logical spacing).
- **A22 Services.** Resend for transactional email; Sentry for errors; PostHog for product analytics (optional). Worker hosted on Railway or Fly.io — recommend one.
- **A23 Quality.** Vitest for unit tests, Playwright for end-to-end, GitHub Actions CI, environments dev/staging/prod with separate Supabase projects.
- **A24 Scale target.** Tens of orgs, hundreds to low thousands of members per org, tens of sessions per org per month; design to reach 10× that without re-architecture.
- **A25 Branding.** No brand yet. Neutral platform design tokens; each org sets its own logo and primary colors, which flow into templates, emails, and the UI accent.
- **A26 No data migration.** Greenfield; nothing to import.
- **A27 Template library baseline.** The platform ships with: **poster families** — talk, workshop (with a pre-session tasks strip), panel/roundtable (multi-presenter), community meetup/series, and a generic announcement — each with light and dark variants, themed from the org's brand kit (logo, primary and accent colors), laid out RTL-first with a mirrored LTR variant reserved for the later English locale; **certificate families** — attendance, presenter/speaker, and achievement — each in landscape and portrait, using formal Naskh-based type, with locked regions for the org logo, signature block, certificate ID, and QR. Every template declares its dynamic fields and its safe area per preset.
- **A28 Designer engine approach.** The editor is DOM/SVG-based, not a raster canvas, so the browser's own text stack shapes Arabic (raster-canvas libraries offer only basic RTL direction handling and their Node back-ends have known text limitations). Documents are stored as JSON layer trees (text, image, shape, QR, dynamic-field layers with position, size, rotation, opacity, z-order, and locking). Exports render the same document in headless Chromium inside the worker: screenshot at the exact pixel size for PNG variants, print-to-PDF with embedded fonts for print and certificates. This guarantees editor/export parity (D66). Fallback only if Chromium is rejected: a HarfBuzz-based shaping pipeline (harfbuzzjs) driving a raster renderer — heavier, and it must pass the same parity test suite. Fonts are self-hosted and identical in the editor, the worker, and the LibreOffice slide converter.
- **A29 Export formats.** Screen variants: PNG in sRGB at the exact preset pixel size, plus a WebP copy for in-app display; no JPEG unless an org enables it for size. Print variants: PDF at 300 dpi, RGB (no CMYK conversion at launch — note it as a print-shop caveat in the UI), 3 mm bleed, 5 mm safe margin, all fonts embedded, images at native resolution. Certificates: PDF (A4 landscape or portrait, fonts embedded, QR at a minimum 25 mm with a 4-module quiet zone, certificate ID printed as text next to it) plus a 1600 px-wide PNG preview for in-app display and email. Exports run as jobs with progress and status; every export is stored and reused until the source document or template changes.
- **A30 Typography system.** Arabic UI face: a variable sans-serif with full Arabic coverage (IBM Plex Sans Arabic or Noto Sans Arabic), self-hosted and subsetted, with a Kufi-style display face for headings and posters (Reem Kufi or Cairo) and a Naskh face for certificates (Amiri or Noto Naskh Arabic); Latin companions from the same families for the later English locale; fallback stacks declared everywhere. Rules: letter-spacing is always 0 on Arabic text; body line-height 1.7 and headings 1.4 (Arabic needs 10–15% more leading than Latin); base size 17 px on mobile because Arabic reads smaller at equal size; line boxes never clip stacked diacritics (no `overflow: hidden` on text lines); no justified text anywhere in the UI (kashida justification is unreliable in browsers) and manual kashida off by default in templates; template text boxes auto-fit because Arabic runs roughly 1.2× the length of English; mixed Arabic/Latin/digit strings are bidi-isolated; the numeral system (Western vs Arabic-Indic) is an org setting, default Western, applied consistently across UI, notifications, templates, and exports.
- **A31 Designer feature set.** Layers with alignment guides and snapping; org brand kit (logo, colors, fonts) injected into templates; safe-area and bleed overlays per preset; undo/redo; autosave; admin-locked regions; live preview of every variant while editing; dynamic-field preview with real session or recipient data; image upload with focal-point cropping; QR layer; export queue with status.
- **A32 Uploaded posters.** Minimum 1080 px on the short side; validated for type and size server-side. Missing variants are generated by smart-cropping around the master with safe margins; the admin can adjust the crop per variant before publishing.

## 6. Best practices to build into the plan

### Event pages and RSVP
- Date, time, venue (with map), presenter, and purpose are the first things on the page; one primary call to action (RSVP / Join waitlist / Cancel RSVP) placed in the mobile thumb zone.
- Show live capacity and waitlist position; state the RSVP deadline and cancellation cutoff plainly.
- Automatic reminders to non-responders and to confirmed attendees; every session change notifies attendees and updates synced calendars.
- Photos from previous sessions and the poster carry the page visually.

### Check-in integrity (the scoring system depends on it)
- Static, never-expiring codes can be scanned or shared before, after, or away from the event — so codes must be time-boxed and rotate, and all attendance-linked rewards must key off a verified check-in event, never off RSVP.
- Keep a fast manual backup (A8) for people whose phone fails, but audit it.
- Record arrival timestamps; expose RSVP-vs-attendance in admin reporting.

### Scoring design
- Reward effort and value in tiers; never reward volume or trivial actions (likes, views, bare RSVPs) — they fill leaderboards with noise and invite gaming.
- Use all four mechanics together: points (quantity), badges (specific achievements), levels/ranks (sustained commitment), leaderboards (visibility).
- Tie levels to real privileges; make early levels easy and later ones progressively harder; keep goals reachable.
- Leaderboards mainly motivate the top slice of members, so pair the all-time board with monthly/seasonal and per-topic boards so newcomers can win somewhere, and rotate competitive with non-competitive recognition (badges, streaks).
- Every point movement is explainable to the member from their own history.

### Responsive, mobile-first, Arabic-first UI
- Mobile-first: fluid grids, flexible media, breakpoints driven by content rather than device lists, container queries for components, fluid typography with `clamp()`.
- Thumb-zone placement for primary actions; bottom navigation on mobile; touch targets of at least 44 px; landscape support.
- RTL as the default rendering: CSS logical properties everywhere, mirrored directional icons, Arabic-optimized fonts with proper line height, correct bidi handling for mixed Arabic/English/number strings, RTL-aware carousels and steppers.
- Performance: responsive images (WebP/AVIF, `srcset`), lazy loading, viewer pages loaded progressively, Core Web Vitals budgets defined per key screen.
- Test on real devices before every release.

### Arabic typography and exports (hard requirements, not preferences)
- Never render Arabic through a raster-canvas text API for anything that leaves the app. Raster-canvas libraries have only basic RTL direction support and their Node back-ends carry known text-rendering limitations; correct Arabic needs a real shaping engine (the browser's text stack or HarfBuzz). Exports therefore go through headless Chromium (A28) or a HarfBuzz-based pipeline, never node-canvas text.
- Ship a **shaping parity test suite** run against every export path (poster PNG, poster PDF, certificate PDF, slide page images): the lam-alef ligature, stacked tashkeel on a single base, a mixed Arabic/English/number sentence, mirrored punctuation and brackets, a long word forcing a line break, a line with Western and Arabic-Indic numerals, and a template with text at its auto-fit limit. Compare editor screenshots to export output pixel-for-pixel within a tolerance.
- The same font files, with the same versions, are installed in the editor (web fonts), the worker's Chromium, and the worker's LibreOffice; a font drift between them breaks parity silently.
- Slides converted from PowerPoint/Keynote must be checked for Arabic fallback-font substitution; if a deck uses a font the worker lacks, the viewer shows a warning to the presenter and offers PDF upload instead.
- Typography rules from A30 (zero letter-spacing, generous leading, no clipped diacritics, no browser justification, consistent numerals, 1.2× length allowance) apply to the UI, notification templates, and designer templates alike.

### Security architecture on Next.js + Supabase
- Defense in depth: RLS at the database, schema validation (Zod) at every server action and route handler, Content Security Policy headers, Supabase Auth with the option of MFA later.
- Use a server-side Supabase client for all data operations; the browser client only for auth UI and Realtime subscriptions. Validate the session with `getUser`/`getClaims` on the server; never trust client-supplied role or org IDs.
- RLS on every table, including join tables, ledgers, and storage buckets; org isolation enforced by policy, not by application filters. The worker uses the service role only through a narrow, audited job interface.
- Rate-limit check-in attempts, certificate verification, and uploads. Scan uploads for type and size server-side.
- Immutable audit log for admin and moderator actions, scoring configuration changes, manual attendance marks, and point adjustments.

### Accessibility and privacy
- WCAG 2.2 AA: keyboard operability, visible focus, contrast, screen-reader labels in Arabic, captions for images, accessible viewer navigation.
- Data minimization and a documented retention policy; members can export their own data; org deletion cascades cleanly. Note Saudi PDPL obligations in the privacy document without assuming a specific hosting region.

## 7. Required deliverables (create exactly these files)

`docs/plan/`
1. `00-overview.md` — product summary, goals, personas (super admin, org admin, moderator, presenter, attendee), glossary, how the documents fit together.
2. `01-prd.md` — numbered functional requirements grouped by area (tenancy, auth, profiles, proposals, scheduling, RSVP, check-in, materials, tasks, event page, ratings, scoring, leaderboards, recognition, certificates, posters/designer, notifications, calendar, admin consoles), each with acceptance criteria; non-functional requirements; out-of-scope list.
3. `02-domain-model.md` — Mermaid ERD; every table with columns, types, constraints, indexes, and enums; a DDL sketch; the tenancy key on every table; the ledger, config-history, and audit tables; template/document model for the designer; state-machine diagrams for session, RSVP, proposal, certificate.
4. `03-permissions-rls.md` — role × resource × action matrix; per-table RLS policies (select/insert/update/delete) written out; Storage bucket policies; how roles are represented (claims vs table lookup) and why; one test case description per policy.
5. `04-architecture.md` — Next.js project structure (routes, server actions, components, i18n, design system); Supabase service usage; worker design, queue choice, job catalogue, retries, idempotency; environment and secrets; deployment topology; Google Calendar integration design; email pipeline; diagrams.
6. `05-scoring-engine.md` — action catalogue with default values (A10); ledger schema; configuration schema with a JSON example; caps, cooldowns, negative actions; idempotency and recomputation strategy; badges, levels, streaks, perks; leaderboard computation and snapshots (all-time, monthly, per-topic, per-company with A11); admin adjustment flow; member-facing history.
7. `06-visual-designer.md` — the shared designer engine: document/template/layer JSON model and its schema; the editor architecture (A28) and why raster canvas was rejected; dynamic fields and how session/recipient data binds to them; the template library baseline (A27), template versioning, and the platform-vs-org library model (D67); size presets and safe areas (A12); export pipeline and formats (A29) including job flow, caching, and storage layout; typography system and font hosting (A30); the feature set (A31); the upload path and variant generation (A32); QR layers for posters and certificates (D68); the shaping parity test suite from §6 with its sample strings and tolerance.
8. `07-content-pipeline.md` — upload flow, type validation, size limits (A16), storage layout, rendering jobs (PowerPoint/Keynote → PDF → page images and thumbnails), the page-by-page viewer, download control, versioning, audio/video/image handling, before/after availability.
9. `08-notifications-calendar.md` — notification matrix (trigger × channel × recipient × template), preference model, email templates list, reminder scheduling (A19), ICS generation and add-to-calendar links, Google Calendar sync lifecycle (connect, create, update, cancel, disconnect).
10. `09-sitemap-screens.md` — full sitemap; for every screen: purpose, roles, key components, states (empty/loading/error/full), primary action, mobile and desktop layout notes, RTL notes, realtime elements. Cover member app, presenter host view (including the live check-in code), org admin console, super admin console, certificate verification page.
11. `10-i18n-rtl.md` — i18n library choice and message structure, locale routing, RTL implementation rules, the typography system (A30) as design tokens, font loading and subsetting strategy, date/number/bidi handling including the org numeral setting, how English is added later (including the mirrored LTR template variants).
12. `11-background-jobs.md` — every job with trigger, inputs, outputs, schedule, failure handling, and observability.
13. `12-security-privacy.md` — threat model, the defense-in-depth layers, rate limits, audit log design, retention and deletion, PDPL notes, secrets handling.
14. `13-testing-quality.md` — test strategy per layer, RLS test plan, e2e scenarios for the critical paths (proposal → publish → RSVP → check-in → points → certificate), performance budgets, real-device matrix, CI pipeline.
15. `14-roadmap.md` — build order in milestones covering the whole product, dependencies between milestones, what is demonstrable at the end of each.
16. `15-backlog.md` — epics → stories with acceptance criteria and rough sizing, referencing PRD requirement numbers.
17. `ASSUMPTIONS.md` — every assumption from §5 by ID, plus any you added, each with status: kept / proposed alternative.
18. `OPEN-QUESTIONS.md` — non-blocking gaps with your chosen default.
19. `TRACEABILITY.md` — requirement → entities → policies → screens → jobs → stories.

Repository root
20. `CLAUDE.md` — the conventions you decided: stack and versions, folder layout, naming, i18n and RTL rules, data-access rules (server-side client only, RLS always on), validation rules, testing expectations, commit conventions, and a pointer to `docs/plan/`.

## 8. Quality bar

The plan is done when all of the following hold:
- Every decision in §4 is reflected somewhere in the PRD and traceable to entities, policies, screens, and stories.
- Every assumption in §5 appears in `ASSUMPTIONS.md` with a status, and none was changed silently.
- No table lacks an org key and an RLS policy set; no policy lacks a test case.
- The scoring engine can be reconfigured by an org admin without a deploy, and any point balance can be recomputed from the ledger.
- The designer engine serves both posters and certificates from one model; every poster variant in A12 is derivable from the master; every export format in A29 is specified with its pipeline.
- A shaping parity test suite is defined for every export path, and the plan names the single font set shared by the editor, the export renderer, and the slide converter (D66).
- Check-in, points, certificates, and photo rights all depend on the verified check-in event and nothing else.
- Every screen has mobile, desktop, and RTL notes; Arabic is the default in every example string.
- Nothing outside §4 and §5 was planned; §4.22 items appear only in the out-of-scope list.
- The roadmap covers the entire product with no "phase 2" bucket.
