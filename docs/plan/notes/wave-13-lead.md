You are the **wave-13 lead** for كريم معرفة. Wave 12 is merged (PR #29, `750367f`), `0145`–`0151` are
live, the Railway worker is current, and there are **no open PRs and no wave map in force**.
Migrations start at **`0152`**; the next decision number is **`DEC-176`**.

**Read in this order.** `docs/plan/STATUS.md`'s START HERE and the wave-12 block. Then
`DECISIONS.md` **`DEC-077`** and **`DEC-093`** in full and slowly — they are half of this wave's
specification — then `DEC-172` … `DEC-175`. Then `01-prd.md`'s **`REQ-DSG-027` … `REQ-DSG-031`** and
`REQ-ADM-021`, `15-backlog.md`'s **`STORY-DSG-012`** and **`STORY-ADM-009`**, `16-ui-redesign.md`
**§10 in full** (lines 1327–1500), `CLAUDE.md`, `TEAM.md` §1–§3.

---

## ★★ Read this before you plan anything: almost none of this is new scope

The owner asked for three things. **Two of them are requirements that were written, traced to a
story and a milestone, and then never built.** Measured against the tree, not assumed:

| The owner's words | Already specified as | Milestone | Built? |
|---|---|---|---|
| «a simple download for the session's poster» | **`REQ-DSG-027`** — a **تنزيل** menu **on the event page and on the schedule screen**, staff and the session's own presenters, through the existing signer · `STORY-ADM-009` | **M11** | **No** |
| «a fully drag and drop visual editor … add images, logos, text, format the text» | **`REQ-DSG-028`** — drag, eight-handle resize, rotate, snapping, guides, arrow-key nudge, reorder, multi-select, group align/distribute · `STORY-DSG-012` | **M12** | **No** |
| «thorough research for the best practices and industry standard» | **`DEC-077`** (the industry pattern, designed in `16` §10) and **`DEC-093`** (the accessibility analysis) | — | **Done — see below** |
| per-session settings consolidated | — | — | **genuinely new** |

★ **M11's downloads and the whole of M12's *design* studio were never run.** Wave 10 built M12's
**email** studio only; the design studio's direct manipulation went onto the never-touch list of
wave 8, wave 9 and wave 10, and wave 11 touched it only to name its canvas. **This wave is the one
that stops deferring it.** Do not re-specify it; `REQ-DSG-028` is on disk and `trace` already
expects it.

---

## What is actually there — measured, not estimated

| | |
|---|---|
| Designer components | **2,490 lines, 14 files**; `editor.tsx` 585, `inspector.tsx` 333, `canvas.tsx` 200 |
| ★ Pointer handlers in all of `src/components/designer/` | **ZERO.** `onPointerDown`, `onMouseDown`, `onDrag`, `draggable`, `pointermove` — **not one match.** A layer is positioned by typing numbers into `<Field>` inputs and pressing align buttons. That is the entire interaction model |
| ★ The overlay that drag belongs in | **already built and already documented for it** — `canvas.tsx:23-25`: *«Interaction lives in the OVERLAY above it, in document coordinates scaled to fit. The iframe takes no pointer events at all, so there is no second event model to keep in step.»* It carries per-layer selection buttons today (`canvas.tsx:164-191`) |
| ★ The snapping maths | **already written** — `snap()` `presets.ts:357`, `snapTargets()` `:331`, `snapTargetsBlock()` `:342`, `alignLayer()` `arrange.ts:49`, `fitLayerToSafeArea()` `:66`, `reorderLayer()` `:97`. `editor.tsx` imports all seven and drives them **only from number entry** |
| The layer model | **5 kinds** — `text` · `image` · `shape` · `qr` · `dynamic_field` — each with frame, z, opacity, lock, hide, per-preset anchor/scale/focal; text carries font, align, colour token, autofit. **Everything the owner asked to add, the model already holds** |
| Export presets | **10** — 7 poster (`master` `square` `story` `landscape` `og` `a4` `a3`), 2 certificate, 1 shared master |
| ★ What a session's poster already renders | `regenerate_poster` calls `presetsFor('poster')` — **all 7 presets, PNG + WebP for the 5 screen sizes and PDF for `a4`/`a3` ≈ 12 artifacts per session.** They exist already. **The download is pure reach — nothing new is rendered** (`STORY-ADM-009` says exactly this) |
| The one signer | `signExportUrl()` — `src/lib/dal/designer.ts:547`, five-minute signed URL. **Its only consumer is the designer page.** `REQ-DSG-027`'s acceptance is *«the same signing function serves the designer's export panel and this menu; there is one»* — so this is wiring, not plumbing |
| A member's certificate | downloadable — `me/certificates/page.tsx:115`, `<a download>` on a signed URL |
| ★ The admin's certificates screen | **`/app/admin/sessions/[id]/certificates` has no download of any kind** — one `href` in 204 lines, a link back to schedule. The staff who issue the certificates cannot get the files |
| ★ The session's poster | **no download anywhere.** The only `.download(` in `lib/dal/posters.ts` is a server-side storage read inside `completeAssetUpload` |

**Where a session's settings live today — the scatter, named:**

| Setting | Screen |
|---|---|
| Scheduling · days · venue · walk-ins · **poster picker** · **presenters** (new, wave 12) · **certificate mode** | `/app/admin/sessions/[id]/schedule` — 164 lines and now holding six unrelated jobs |
| Attendance | `…/attendance` |
| Certificates — issue, hold, release | `…/certificates` |
| Survey | `…/survey` |
| **Materials · tasks · photos** | ★ **nowhere in admin at all** — only the member-facing event page `/app/sessions/[id]` |
| Poster **design** | `/app/admin/designer/[documentId]` — a different route tree |
| Poster/certificate **export** | the same designer route. **The only export surface in the product** |

★ The certificates screen's own comment (`page.tsx:31`) says it plainly: *«The mode is SHOWN here
and CHANGED on the schedule screen.»* That single sentence is the owner's complaint in the
codebase's own words.

★ **`04`'s canonical route table lists `sessions/[id]/schedule` and `sessions/[id]/survey` and
NOT `attendance` or `certificates`**, both of which ship. `DEC-083` says a route exists in `04`
before it exists in `src/`. Reconcile it in the same commit as the hub.

---

## The research the owner asked for — what is settled, and what is genuinely open

★★ **Do not re-derive `DEC-093`.** It is the best thing in this plan and it is the thing most
drag-and-drop editors get wrong:

> **`SC 2.5.7` Dragging Movements (AA, new in WCAG 2.2) is not `SC 2.1.1` Keyboard.** Any function
> operated by dragging must also be operable **by a single pointer without dragging** — a tap, path
> independent. *A studio that is fully keyboard-operable and drag-only by pointer fails 2.5.7 while
> passing every other test this plan proposes.* It exists for the touch user with a tremor, on a
> phone, with no keyboard — most of this product's population.

`DEC-093` then names all **five** places dragging appears and the non-dragging path for each, and
rules that **the inspector's numeric X/Y/W/H fields are the conformance path and may be demoted into
a collapsed accordion but never deleted.** A teammate who "cleans up" those fields breaks
conformance. Say so in their agent file.

`DEC-077` settles the shell: top bar (back, inline-renamable title, state chip, undo/redo, preview,
export menu), tabbed left rail, artboard, inspector accordion showing only the selected layer's
sections, variant strip of live thumbnails, checks as a persistent badge with click-to-select.

**What is actually open, and what the research should answer — commission it, narrowly:**

1. **Hit-testing and the pointer model on a rotated layer** — the overlay is in document coordinates
   × scale; rotation makes the hit area not the bounding box. How do Figma/Canva/Polotno resolve
   this, and what does it cost in an RTL document whose axes mirror?
2. **Snap tolerance and guide rendering.** `snap()` defaults to **8** — in *document* pixels on a
   1080-wide canvas, so at a phone's scale that is sub-pixel. Measure it before choosing.
3. **Marquee multi-select in RTL** — `DEC-093` says a marquee has **no** non-drag equivalent, so it
   must never be the only way to select more than one object. What is the taught alternative?
4. **Touch targets at 390 px.** Eight resize handles on a small layer fall under `SC 2.5.8`'s 24 px.
   `DEC-093` claims the *essential* exception for the handle affordance **only because** the numeric
   fields and align buttons provide the function. Verify that claim survives contact with a phone.
5. **Undo granularity for a drag** — one entry per gesture, not per pointermove, against the existing
   fifty-step undo.

Libraries: the engine is **not** replaceable (`DEC-017`, `DEC-048` — one renderer shared by editor,
worker and parity suite). Any library evaluated must sit **in the overlay only**. A library that
wants to own rendering is disqualified on sight; say which you evaluated and why in `DECISIONS.md`.

---

## STEP 0 — a gate, not a step

`DEC-176` logging the scope, the **wave-13 ownership map** into `CLAUDE.md` and **all ten
`.claude/agents/*.md`**, and the checklist into `STATUS.md`. `DEC-085`: *ownership lives in those
never-touch paragraphs or it does not exist.* Cut `wave-13/studio-and-session-settings` from `main`;
draft PR at the first push.

## The wave map

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | `DEC-176`, the map, the ten agent files, `01`/`04`/`09`/`14`/`15` · ★ **the download audit row** (`REQ-DSG-027`, `REQ-ADM-021`: *every download writes an audit row*) and any table change · ★ **the route table reconciled** — `attendance`, `certificates` and the hub into `04` · promotion from `0152` · the three demonstrable specs · gates, `STATUS`, the PR | the lead-only paths, `supabase/migrations/**` from `0152`, the lead's fifteen `ui/` files, `src/app/globals.css`, `src/components/shell/**`, `messages/*/{ui,app,auth}.json`, `tests/e2e/wave13-{demo,lead}-*.spec.ts`. **Custodian** of every unspawned track |
| `designer` | opus | ★ **`REQ-DSG-028` — direct manipulation in the overlay**: drag, eight-handle resize, rotate, snap + guides, arrow-key nudge, marquee, group align/distribute — **reusing the seven helpers already written**, with `DEC-093`'s non-dragging path for every one · ★ **`REQ-DSG-030`** — the focal dot **and** the nine-point grid (the grid alone must suffice) · whatever of **`REQ-DSG-031`**'s three-step issuance is not yet built (the preflight and estimate are) · ★ **the signer's DTO published on day one** (contract 1) | `packages/designer-runtime/**`, `src/components/designer/**`, `src/components/posters/**`, `src/app/[locale]/app/admin/{designer,templates}/**`, `src/app/[locale]/app/admin/sessions/[id]/certificates/**`, `src/app/api/{designer,fonts}/**`, `src/lib/dal/{designer,templates,posters,certificates,fonts}.ts`, `worker/src/render/**` + its four tasks, `scripts/parity/**` minus `goldens/`, `messages/*/{designer,templates,certificates}.json`, `supabase/proposed/designer/**`, its tests, new `tests/e2e/wave13-designer-*.spec.ts`, its note |
| `sessions` | opus | ★ **the session settings hub** — one place that answers «where do I change this session?», absorbing scheduling, presenters, the poster, materials, tasks, the certificate **mode** (moved off schedule, where its own screen says it lives wrongly) and the survey, **without a fifth orphan screen**: a sub-nav over the routes that exist · ★ **`REQ-DSG-027`'s تنزيل menu on the event page and the schedule/hub screen**, rendering `designer`'s DTO — it never calls storage itself | `src/app/[locale]/app/admin/sessions/**` except `[id]/certificates`, `src/app/[locale]/app/sessions/[id]/**` except `{check-in,host,rate}`, `src/components/{sessions,browse}/**`, `src/lib/dal/{sessions,proposals}.ts`, `messages/*/{sessions,proposals,schedule}.json`, `supabase/proposed/sessions/**`, its tests, new `tests/e2e/wave13-sessions-*.spec.ts`, its note |
| `console` | sonnet | the admin rail's entry for the hub; **`/app/admin/templates`**' card grid with منشور/مسودة, duplicate, usage count and the platform library as a separate read-only-until-copied section (`16` §10.3); the a11y and 390 px review of both | `src/app/[locale]/app/admin/**` except `sessions/**`, `designer`, `templates/{posters,certificates}` bodies, `branding`, `emails`, `surveys`; `src/components/admin/**`; its six `ui/` primitives; `messages/*/admin.json`; `supabase/proposed/console/**`; its tests; its note |

**Contracts, published before anyone builds:**

1. **`designer` → `sessions` — the download DTO.** One DAL function returning, per session, the ready
   artifacts with preset, format, bytes and a signed URL, plus the pending ones **as pending, never
   as a broken link** (`REQ-DSG-027`'s acceptance). `sessions` renders it and never touches storage
   or `signExportUrl()` directly. **There is one signer** — that is the requirement's own wording.
2. **`sessions` ↔ `designer` — the certificate mode.** It is written on the schedule screen today and
   read on the certificates screen. One writer after this wave; the other reads. Decide which at
   sync 1 and write it down.
3. **Lead — the audit row.** Both `REQ-DSG-027` and `REQ-ADM-021` require every download to be
   audited. `audit_log` is append-only with `service_role` revoked (invariant 9); the write goes
   through a definer function the lead lands.

---

## ★ The owner's ruling on «simple», and it beats the requirement's letter

`REQ-DSG-027` says *«lists every ready artifact»*. The owner said: **«Why would I ever need to export
a template with all the world's available formats, I just need a simple download.»** There are **12
artifacts per session poster**. A 12-row menu is the designer's export queue moved, which is the
thing being complained about.

**Build it as: one primary «تنزيل» giving the obvious file, with the other formats behind a
disclosure.** The requirement's intent — reach, one signer, pending shown as pending, refusal by
policy for anyone else — is met in full. Log the reading as part of `DEC-176` rather than leaving a
later reader to think the requirement was half-built.

## Not this wave — name each in every agent file's never-touch list

Deleting a session with its awarded points · the photo gallery and lightbox, and `REQ-ADM-021`'s
**«تنزيل الكل»** / `JOB-zip_session_photos` (**the poster menu is enough reach for one wave**) · the
wordmark link (`app/layout.tsx:160` imports the **marketing** `Wordmark`) · Google avatars
(`avatarUrl={null}`, `:199`) · the gamification layer · the prose pass (421 strings ≥ 60 chars) ·
`DEC-100`'s motion system · everything under `(marketing)/**` · recurring series (`A14`) ·
**replacing the renderer** (`DEC-017`, `DEC-048`).

## Definition of done

The usual — `tsc`, `lint` zero errors (**grep for `problems`**), `npm test`, `test:rls`, e2e,
`qa:contract` **and** `qa:appearance`, `visual`, `parity` (**goldens move only through a
lead-reviewed diff**), `policy-diff`, `trace`, **`ui-lint --strict` with no allowlist**. Arabic
authored in `messages/ar/` first, `<bdi>` on every interpolated value, Western numerals only.

**And four this wave adds:**

1. ★★ **The `SC 2.5.7` gate, which is the whole point of `DEC-093`:** a Playwright case that performs
   **every** studio operation — move, resize, rotate, reorder, focal point, multi-select,
   align/distribute — using **`page.click()` alone**, no `mouse.down/move/up`, and asserts the
   document changed. **axe will never catch this.** It is the acceptance criterion `REQ-DSG-028`
   already carries.
2. ★ **One unit test asserting an `ar` console and an `en` console store byte-identical documents for
   the same "align start"** (`STORY-DSG-012`). The overlay uses physical `left`/`top` computed from
   document geometry — **write the exemption down** so a later reader does not tidy it to logical
   properties and silently mirror the wrong axis.
3. ★ **The focal-point default is the geometric centre, so an untouched document derives identically
   and no parity golden moves** (`REQ-DSG-030`). Prove it — a golden that moves is a bug, not a
   re-baseline.
4. ★ **A staff member downloads a session's poster and a session's certificates from the session,
   at 390 px in Arabic, having never opened `/app/admin/designer`.** That is the owner's complaint,
   closed, and it closes with a capture.

## ★ Sizing, honestly

`STORY-DSG-012` is **L** and `STORY-ADM-009` is **M** in a backlog whose estimates predate the
redesign. Direct manipulation is the largest single piece of interaction work in the product, and
the hub touches four routes plus three content surfaces that have **no** admin screen today. **If
the wave has to shed something, shed the hub's materials/tasks/photos absorption and ship the
sub-nav over the four routes that exist** — the download and the studio are the owner's two named
complaints and neither is negotiable. Say in `STATUS` what you shed and why.

## How it ends

`STATUS.md` updated, PR open, **the owner merges** — and if this wave carries migrations, the owner
rehearses against a production schema dump, **pushes, then merges**, in that order, then checks
Railway by hand. ★ **Railway's push trigger has now needed a manual `railway service source connect`
after SEVEN consecutive merges.** The durable fix is the dashboard's Settings → Source, not the CLI.
Record it as a standing owner step again, and say it is the last thing in this project that is still
done by hand.
