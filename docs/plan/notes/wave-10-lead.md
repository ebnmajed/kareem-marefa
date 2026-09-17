You are the **wave-10 lead** for كريم معرفة. Wave 9 is merged (PR #26), `0100`–`0122` are live on
production, and **a session can span several days**: `ENT-session_days` sits under seven tables, check-in
is per day, materials, tasks and photos belong to the session or to one day, and points and the
certificate follow attendance of every day. A one-day session — nearly every session — behaves exactly as
it did before, and the existing suites proved it with their assertions unmodified.

★ **Before anything else, confirm two things the owner was asked to do after the merge**, from
`STATUS.md`'s wave-9 block: that **the Railway worker is on the merge commit** (its push trigger has never
fired on its own — `DEC-157` says what the old worker gets wrong on a multi-day session, and `0121` is why
the one unrecoverable part cannot happen), and that **the security statement of `DEC-152` was run**
(`0103` carries it, so a pushed schema has it either way). If either is unknown, ask the owner once.

**Read in this order.** `docs/plan/STATUS.md` — the **START HERE** block, then the wave-9 record, syncs 1
to 4. Then `DECISIONS.md` **`DEC-150` … `DEC-158`** — the wave-9 contracts are now facts about the
schema, and `DEC-158` is a correction you should read as a warning about reading half a file. Then
`CLAUDE.md`, `TEAM.md` §1–§3, `16-ui-redesign.md` §11 (the email studio), and `01-prd.md`'s
`REQ-SUR-001` … `009` and `REQ-NTF-009` … `014`.

## STEP 0 — a gate, not a step

The wave-10 ownership map into `CLAUDE.md` and **all ten `.claude/agents/*.md`**, and the wave's
checklist into `STATUS.md`. Cut `wave-10/<name>` from `main`; draft PR at the first push. Migrations
start at **`0123`**. ★ **`event` has not run since wave 2** and most of its surface moved to `content` and
`sessions` in waves 6 and 7 — its agent file is eight waves stale, and the survey is written against it.
Decide who builds the survey **before** writing the map, not while.

## The wave — two features that were deferred twice, and what wave 9 sized for you

| | |
|---|---|
| **The survey** | `REQ-SUR-001` … `009`. One screen with the rating and **two decorrelated writes** (`REQ-SUR-004`, `009`) — the requirement that shapes the schema, so design it before any table. Results are staff-only with a minimum-count withhold on **every** question type. ★ `REQ-SUR-002`'s text in `01` writes the scale in Arabic-Indic digits; **`DEC-124` wins** — «مقياس 1–5» |
| **The email studio** | `REQ-NTF-009` … `014`, `16` §11. Read §11.2 first: mail clients are the constraint, and the block model exists because of them. `/app/admin/emails` was rebuilt in wave 8 **around what it does today** precisely so this wave replaces its content and not its frame |
| **Certificates, re-issued** | ★ sized in wave 9 (`DEC-153`): `certificates` is unique per session, member and kind, and `issue_certificate()` returns the existing row **even when it is revoked** — so a member removed and re-added never gets a new one. A partial unique index, a second serial, and **two rows per member** on SCR-045 and `/app/me/certificates`. `designer` |
| **A multi-day poster's date** | row L6 of wave 9, deliberately not built: a new binding is a new library seed (`DEC-149` §3). Today a three-day workshop's poster shows the first day's date — true, and incomplete. `designer` |
| **A proposal's own material** | shows its row and never its version or pages: three policies `inner join sessions`, and a proposal's material has none. Predates `DEC-121`; found by `content` in wave 9 and left alone on purpose |

## What wave 9 taught that is not in the code

1. ★ **Write the owner's migration order EARLY, because writing it is an audit.** Reading `main`'s worker
   job by job against the new schema found the one thing in the merge → Railway window that could not be
   taken back (a presenter paid three times onto an append-only ledger). It was found on the last
   afternoon; it should have been found at sync 1.
2. ★ **A schema-only rehearsal cannot show what a backfill does to rows.** Build a bare Postgres at the
   last pushed migration, **commit** `main`'s own RLS fixture plus the shapes it lacks, apply the wave's
   files, and compare every pre-existing column of every row (`DEC-157`). It takes twenty minutes.
3. **The caller audit is mechanical**: every `.rpc()` in `main`'s `src/` parsed with its argument names and
   resolved against the new catalogue by PostgREST's own rule. 75 of 75 is a sentence you can put in
   front of the owner; «I checked the callers» is not.
4. ★ **An optional parameter that changes meaning when omitted needs a guard test.** `PhaseInput.days` was
   optional so that nothing one-day had to change — and four readers silently omitted it, including the
   public card. `session-phase-reads-days.test.ts` is the pattern: read the source, fail the new reader.
5. ★ **Open every capture at readable size, in bands.** A full-page file downscaled to fit is unreadable,
   and the height is itself a finding: a 23,780 px capture was eight open forms. Four of wave 9's defects
   had no failing assertion and were found only by looking.
6. **`ui-lint` is not in the teammates' task hook.** Tell every track that ships a screen to run
   `npm run ui-lint` before it commits; CI's design-system job is otherwise where they learn.
7. **Read the enqueue sites, not just the crontab** (`DEC-158`). The lead wrote a wrong sentence into an
   append-only log from half a file.
8. The real-worker run is one script: local keys from `supabase status -o env`, a refusal for any
   non-local URL, `node worker/dist/index.js`; specs gate on `E2E_WORKER=1`; the clock is moved by
   shifting `session_days` — **and what is already recorded must age with its day**, or a member's own
   yesterday overlaps their today (`wave9-three-day-workshop.spec.ts` has the reasoning).
9. ★ **The demonstrable must start from EMPTY and run on a production build.** Wave 9's found three
   defects that every suite had passed: a Server Component handing an inline closure to a
   `"use client"` chip — «Event handlers cannot be passed to Client Component props», a crash that
   **only a real build can produce**, because jsdom renders everything client-side; a brand-new
   workshop that could not take a day's material, because every fixture seeded content and none met
   the empty state; and an added day reading «لم يُحدَّد بعد» above its own end time. Keep the
   server's words with `STUBBED_SERVER_LOG=<file>`.
10. **A lead's «nit» is a change request against a contract somebody wrote.** Asking `sessions` to move
    one «·» broke two wave-7 specs that pinned it on purpose; the untouched suite caught it and the
    nit was withdrawn. Read `git log -S` on a string before asking anyone to change it.
11. Under `/app`, **every page-level locator comes from `#main`** (`DEC-145`'s orphaned streaming
    segment duplicates ids on desktop), `<summary>` is not `role="button"` to Playwright, and a toast
    asserted by text needs `{ exact: true }` — the live region repeats it with a prefix.
12. **The full e2e run fails ten-odd specs under load and none alone** — «An invalid response was
    received from the upstream server» is Kong under two parallel projects, and `budgets` measures
    the machine. Re-run the failures alone before reading them; a failure on BOTH projects is real.

## Not this wave

**Anything under `src/app/[locale]/(marketing)/`** and the components it renders — frozen until M13, with
`DEC-126`'s «تسجيل الدخول», `chapter.tsx`'s eleven glyphs and the accessibility and performance closing
passes. **`A14`'s recurring series** is still not multi-day sessions and still not scheduled. The studio's
M12 mechanics beyond what the email studio needs.

## Carried

- ★ **Railway's push trigger** — the standing post-merge step stays in `STATUS` until the owner fixes the
  dashboard setting. No session changes it.
- The owner's two canvas contrast questions (`DEC-123`) — asked in waves 8 and 9, unanswered; the app
  ships the passing tokens. **Do not ask a third time in a brief; ask in the PR.**
- `bookmarks:237` on Next 16.3.5; break-glass opening no org screen (`DEC-055` C); `REQ-NTF-007`'s
  editable required fields and `REQ-NTF-008`'s bounce webhook (the second belongs with the email studio);
  recognition edits writing no audit row; `DEC-145`'s orphaned streaming segment, which wave 9 met again
  as a strict-mode duplicate in an e2e.

## Definition of done

The usual — `tsc`, `lint` zero errors (**grep for `problems`**), `npm test`, `npm run test:rls` from a clean
reset, e2e, `qa` 44/44, `visual` 0.000 %, `parity`, `ui-lint`, Arabic authored in `messages/ar/` first,
`<bdi>` on every interpolated value, Western numerals everywhere, a 390 px RTL capture at its cited path
that **you opened yourself, in bands**. For a wave with migrations: the owner's order, the caller audit and
the data-shaped rehearsal in `STATUS` **before** the PR is marked ready.

## How it ends

`STATUS.md` updated, PR open, **the owner merges**; migrations are pushed before the merge; ★ Railway is
checked by hand after it. Do not start wave 11.
