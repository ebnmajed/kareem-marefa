-- 0166_check_ins_host_broadcast.sql — proposed by `checkin` (supabase/proposed/checkin/01_host_broadcast.sql), promoted by the lead.
--
-- REQ-CHK-001 («the check-in count updates live», A18), REQ-UIX-062, DEC-209 §1.
--
-- `0016` authorised a private `host:{session_id}` topic for the host view — staff, or that session's
-- own presenters, and never another org (`realtime_host_select`) — and `src/lib/realtime/channel.ts`
-- exports `subscribeToHostTopic()` for it. Nothing ever SENT to it, so the host's count was a server
-- read, stale until a reload. This is the producer.
--
-- ★ A POKE, NOT A ROW. The payload is the day the change is on, and nothing about who: no member
-- id, no name, no arrival time. The screen answers a poke by asking the server again (`HostClock`,
-- coalesced), so the count on the wall has ONE definition — `getHostView()`'s — and this trigger
-- carries none of it. Even so the topic is staff-and-presenter only, because a stream of arrivals
-- is itself something `checkins_read` hides from a member (0016's own comment).
--
-- ★ SECURITY DEFINER: the rows are written by `check_in()` and `mark_checked_in_manually()` on a
-- member's or a moderator's behalf, and by `remove_check_in()`; `realtime.send()` writes
-- `realtime.messages`, which no client role may. Tested AS A MEMBER checking in
-- (`tests/rls/checkin-host-broadcast.test.ts`), not as the owner.
--
-- Fires on a new check-in and on a change to `removed_at` (REQ-CHK-017 — a removal lowers the count;
-- a re-add is an insert). Nothing else on the row moves the count.
--
-- Additive: no table, policy or grant; `main`'s app subscribes to nothing, so on this schema it does
-- exactly what it does today.
--
-- 03 §8.2 rows this proves:
--   TRG-check_ins_host_broadcast.poke        — a member's check-in pokes host:{session}, payload {dayId} only
--   TRG-check_ins_host_broadcast.removal     — a removal pokes it too
--   TRG-check_ins_host_broadcast.own_topic   — never another session's topic

create function public.check_ins_host_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('dayId', new.session_day_id),
    'check_in_count',
    'host:' || new.session_id::text,
    true
  );
  return null;
end $$;

revoke execute on function public.check_ins_host_broadcast() from public, anon, authenticated;

create trigger check_ins_host_broadcast
  after insert or update of removed_at on public.check_ins
  for each row execute function public.check_ins_host_broadcast();
