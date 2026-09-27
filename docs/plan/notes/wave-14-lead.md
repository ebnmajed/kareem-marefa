You are the **wave-14 lead** for كريم معرفة. Wave 13 is merged (PR #30, `7a66690`), `0152`–`0154` are
live, the worker is current, and there are **no open PRs and no wave map in force**. `main` is at
`00f687d`. Migrations start at **`0155`**; the next decision number is **`DEC-180`**.

**Read in this order.** `docs/plan/STATUS.md`'s START HERE and the wave-13 block, above all its
*Carried — not this wave*. Then `DECISIONS.md` **`DEC-093`** in full — it governs one of this wave's
four rows and is the thing most implementations of it get wrong — then `DEC-176` … `DEC-179`.
Then `01-prd.md`'s **`REQ-PRF-001`**, **`REQ-PRF-008`** … **`REQ-PRF-011`**, **`REQ-ADM-021`**,
**`REQ-EVT-009`** … **`REQ-EVT-015`**, `15-backlog.md`'s **`STORY-PRF-005`** and **`STORY-ADM-009`**,
`CLAUDE.md`, `TEAM.md` §1–§3.

---

## ★★ Measured first, and two of the owner's four items are not what they look like

| The owner's item | What the tree says | Verdict |
|---|---|---|
| 5 · «Clicking on 'kareem marefa' navigates to the marketing page not the home page» | `wordmark.tsx:31` hardcodes `href="/"`. **Five consumers**, and two of them are `header.tsx` and `footer.tsx`, which the **frozen marketing routes render** | Real. **Not a one-line fix** — see below |
| 6 · «Users avatars/photos aren't being pulled from google» | ★ **They are.** `0005:124` reads `coalesce(v_meta->>'avatar_url', v_meta->>'picture')` into `members.avatar_url` on every sign-in; `0004:243` holds the column, `0004:305` grants select on it; `comments.ts:123` and `ratings.ts:260` read it and it **already renders** on comment items and rating rows | ★ **The diagnosis is wrong, the observation is right.** ONE line discards it: `app/[locale]/app/layout.tsx:199`, `avatarUrl={null}` |
| 4 · the photo gallery with a lightbox | `REQ-EVT-009` … `015` cover upload gating, EXIF stripping, takedown, moderation and live counts — **not one of them is a gallery or a lightbox** | **Genuinely new scope.** It needs a new `REQ-EVT-*` |
| — · photo downloads | **`REQ-ADM-021`** is written and traced to `STORY-ADM-009`, **M11**, with `JOB-zip_session_photos` as the 35th job | Specified, **never built** — as `REQ-DSG-027` was |

★ **Do not rebuild the avatar pipeline.** Google's picture is captured, stored, granted and rendered.
`ui/avatar.tsx` is complete — initials over a tint hashed on the **member id** (not the name, so a
spelling correction does not change the colour), and it is `REQ-PRF-009`, done. The shell is the only
liar in the chain.

★ **`REQ-PRF-008`'s other half is NOT this wave.** A member *uploading* their own picture — sniffed on
content, EXIF-stripped, 96 px and 192 px WebP derivatives through the content pipeline, moderatable,
with `REQ-PRF-010`'s takedown reverting to initials and `REQ-PRF-011`'s anonymisation deleting the
object — is a real M10 story that never ran. Name it in every agent file. This wave wires up the
Google-sourced avatar and nothing more.

## ★★ The trap in row 3, and it is `DEC-093`'s

The owner asked for photos «navigable through them». **The obvious implementation is a swipe, and a
swipe is a dragging movement.** `SC 2.5.7` (AA, WCAG 2.2) requires a single-pointer, non-dragging
path for any function operated by dragging — and `DEC-093` already enumerated five such places and
ruled each one. **This is the sixth.** So: tap targets for previous and next, always visible, never
only a swipe; the swipe is the enhancement. `DEC-093`'s own sentence applies unchanged — *a studio
that is fully keyboard-operable and drag-only by pointer fails 2.5.7 while passing every other test
this plan proposes.* Wave 13's `wave13-designer-studio-taps.spec.ts` is the pattern: **a Playwright
case that drives the whole lightbox with `page.click()` alone.**

★ **And the grid crops.** `gallery.tsx:157` is `aspect-square … object-cover` — every photograph is
cut to a square in the tile. That is **the same defect class as the poster** (`REQ-UIX-026`, wave 12),
in a different file, and the owner has already ruled on it once: a designed artefact cut by a crop is
worse than empty space beside it. A photograph is not a designed artefact, so the tile may keep a
crop **if it is deliberate and written down** — but the lightbox must show the whole frame, and the
tile's crop should be focal-aware or square-cropped on purpose, not by default.

## STEP 0 — a gate, not a step

`DEC-180` logging the scope and the new `REQ-EVT-*` for the gallery, the **wave-14 ownership map** into
`CLAUDE.md` and **all ten `.claude/agents/*.md`**, and the checklist into `STATUS.md`. `DEC-085`.
Cut `wave-14/photos-and-polish` from `main`; draft PR at the first push.

## The wave map

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | `DEC-180`, the map, the ten agent files, `01`/`04`/`09`/`14`/`15` · ★ **the wordmark** (`REQ-UIX-*`, new or cited): an additive `href` prop defaulting to `/`, the app shell passing `/app`, **and `qa:contract` + `visual` unmoved** · ★ **the avatar**, one line plus whatever `requireSession()`'s DTO must expose · the audit action and the job registration in `0155` · the demonstrable specs · gates, `STATUS`, the PR | the lead-only paths, `supabase/migrations/**` from `0155`, `src/components/{wordmark,header,footer}.tsx`, `src/app/[locale]/app/layout.tsx`, `src/lib/dal/session.ts`, `src/components/shell/**`, the lead's fifteen `ui/` files, `src/app/globals.css`, `worker/src/index.ts`, `messages/*/{ui,app,marketing}.json`, `tests/e2e/wave14-{demo,lead}-*.spec.ts`. **Custodian** of every unspawned track |
| `content` | ★ **opus** | ★ **the gallery and the lightbox** (the new REQ): a tap opens the photograph whole, previous/next are **tap targets**, Escape and the backdrop close it, focus returns to the tile that opened it, and it is built on the lead's `ui/dialog` · ★ **`REQ-ADM-021`**: a per-photo download for any viewer who may see the photograph, **«تنزيل الكل»** for staff through a new **`JOB-zip_session_photos`** that writes a zip to storage and notifies when ready, and **every download audited** · the served file is the EXIF-stripped one, which is the only one there is (`REQ-EVT-012`) | `src/components/{photos,viewer,materials,tasks}/**`, `src/lib/dal/{photos,materials,tasks}.ts`, `src/app/api/upload/**`, `src/lib/storage/**`, new `src/app/api/photos/**`, `worker/src/content/**`, `worker/src/tasks/{convert_document,render_pages,process_photo}.ts` and a new `zip_session_photos.ts`, its nine `ui/` primitives, `messages/*/{photos,materials,tasks}.json`, `supabase/proposed/content/**`, its tests, new `tests/e2e/wave14-content-*.spec.ts`, its note |
| `console` | sonnet | the moderation queue's photo download (`admin-moderation.ts:246` already signs a URL and must go through the audited route instead), and the staff entry point for «تنزيل الكل» wherever the album belongs; the 390 px and accessibility review of both | `src/app/[locale]/app/admin/**` except `sessions/**`, `designer`, `templates`, `branding`, `emails`, `surveys`; `src/app/api/admin/**` except `branding` and `emails`; `src/lib/dal/admin*.ts`; `src/components/admin/**`; its six `ui/` primitives; `messages/*/admin.json`; `supabase/proposed/console/**`; its tests; its note |

**Contracts, published before anyone builds:**

1. ★ **`content` → everyone — one audited download route, and wave 13 already built the precedent.**
   `record_export_download()` (`0152`) audits **export artifacts**, keyed by the artifact's document.
   **Photos are a different bucket with a different read policy**, so they need their own signer and
   their own audit subject — but **the route shape is settled**: a link to a route that writes the
   audit row and then redirects to a short-lived signed URL. **Never a bare signed URL in page data
   and never a plain `<a download>`** — `DEC-177` established that a pre-signed link writes no audit
   row on the click, and this wave must not reintroduce it.
2. **Lead → `content` — the zip's storage path and the job's registration.** The path goes through the
   one builder (`lib/storage/**`, `content`'s); the task registration in `worker/src/index.ts` and its
   crontab entry are the lead's. `11`'s job table gains the 35th job, and the lead writes it.
3. **Lead → `console` — the audit action names**, so both tracks write the same strings.

## The wordmark is the delicate row, and it is the lead's

`Wordmark` is rendered by `header.tsx` and `footer.tsx`, which **`/`, `/ar`, `/en` and `/ar/register`
render**. Invariant 1 was re-cut by `DEC-167`, not deleted: those routes' URLs, registration behaviour
and accessibility floor never regress, and their appearance moves **only** through a `DECISIONS.md`
entry and a re-baselined capture in the same commit.

So: the change is **additive** — a new optional `href` prop defaulting to `/`, so every existing
consumer is byte-identical — and the app shell is the only caller that passes anything else.
★ **`qa:contract` and `visual` must be unchanged, not re-baselined.** If either moves, the change was
not additive and you have broken something. That is the row's acceptance criterion.

## Not this wave — name each in every agent file

`REQ-PRF-008`'s member-uploaded picture (M10, `STORY-PRF-005`) · deleting a session with its awarded
points — **wave 15's whole subject**, and it needs a clear field because `points_ledger` is
append-only with `service_role` revoked at three layers · the gamification layer (wave 12's computed
pending DTO is its foundation — **build nothing of it**) · the prose pass · `DEC-100`'s motion system ·
live poster thumbnails before export (`REQ-DSG-029`'s carry) · the stale email-studio test · the
«still generating» line's placement on phones · everything under `(marketing)/**` beyond the
wordmark's additive prop · recurring series (`A14`).

## Definition of done

The usual — `tsc`, `lint` zero errors (**grep for `problems`**), `npm test`, `test:rls`, e2e,
`qa:contract` **and** `qa:appearance`, `visual`, `parity`, `policy-diff`, `trace`,
**`ui-lint --strict` with no allowlist**. Arabic authored in `messages/ar/` first, `<bdi>` on every
interpolated value, Western numerals only (`DEC-124`).

**And four this wave adds:**

1. ★★ **The `SC 2.5.7` gate for the lightbox** — a Playwright case that opens a photograph, moves
   forward and back through every one, and closes it, using **`page.click()` alone**, no
   `mouse.down/move/up`, asserting the displayed photograph changed each time. `DEC-093`'s sixth place.
2. ★ **`qa:contract` and `visual` unmoved by the wordmark row.** Not re-baselined — unmoved.
3. ★ **A member with a Google photo sees it in the account menu; a member without sees initials.**
   Both at 390 px, both captured. The second is `REQ-PRF-009` and it must not regress.
4. ★ **An album download never runs inside a request** (`REQ-ADM-021`'s acceptance). Prove it with
   the real worker: staff press «تنزيل الكل», the response returns immediately, the job writes the
   zip, the notification arrives, and the zip contains the EXIF-stripped files and no others.

## How it ends

`STATUS.md` updated, PR open, **the owner merges** — and if this wave carries migrations, the owner
rehearses against a production schema dump, **pushes, then merges**, then reconnects Railway.
★ **Railway's push trigger has needed a manual `railway service source connect` after EIGHT
consecutive merges.** The durable fix is the dashboard's Settings → Source. It is the last thing in
this project still done by hand, and it is worth saying so again.

★ **One thing the owner is doing in parallel:** the member walk-through on production — RSVP, check
in, the pending acknowledgement, completion, the certificate and its QR on paper. It has never been
done by a person. **If it turns something up, it arrives as a measured row in `STATUS` before you
spawn anyone, not as a bug report later.** Ask the owner before Step 0 whether it found anything.
