-- 0169 · wave 20 (DEC-216 §2.2, REQ-UIX-078, STORY-UIX-061) — the week's seen mark.
--
-- The owner ruled on 2026-10-02 that the board's new first window, «هذا الأسبوع», is
-- summed LIVE from `points_ledger` at read time — no `leaderboard_kind` value, no
-- snapshot, no scheduled job. A live sum keeps no record of last week's ranks, so the
-- movement beside a rank is «منذ زيارتك الأخيرة», read against the member's own seen
-- mark: the same cursor moment 4 already animates against (0162).
--
-- `member_seen_marks` is one row per member with a column pair per board, so the
-- reuse is a pair for the week, mirroring `monthly_period` / `monthly_rank` exactly:
-- the period is the first day of the week the rank was seen in, so a rank seen last
-- week is never compared with this week's.
--
-- ★ No new grant, and that is checked, not assumed (invariant 6). The grant at 0162:66
-- is TABLE-level — `grant select, insert, update on public.member_seen_marks to
-- authenticated` — and a table-level privilege covers every column, including columns
-- added after it. The own-row policies (`member_seen_marks_{select,insert,update}_own`)
-- are row predicates and name neither column. `service_role` still gets nothing; the
-- worker never reads or writes this table. `tests/rls/scoring-seen.test.ts` proves a
-- member writes and reads their own weekly pair and nobody else's.
--
-- ★ No timestamp, as 0162 requires: a period is a date the rank belongs to, not a
-- record of when someone looked.
--
-- Anonymisation is unchanged: `anonymise_members()` deletes the whole row (0162), so
-- the new pair leaves with it.
--
-- `mark_board_seen()` (0163) does not learn the week here — it refuses an unknown
-- board, `weekly` among them, and teaching it is `scoring`'s, in the wave that builds
-- the board. Until then nothing writes these columns.
--
-- Additive for `main`: two nullable columns, no default, no backfill. `main`'s app
-- selects the columns it names and its worker never touches the table, so both do
-- nothing different on this schema.

alter table public.member_seen_marks
  add column weekly_period date,
  add column weekly_rank   int check (weekly_rank > 0);
