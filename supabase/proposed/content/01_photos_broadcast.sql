-- supabase/proposed/content/01_photos_broadcast.sql
--
-- REQ-EVT-010, as amended by DEC-139 — a photo takes its place in the
-- uploader's own gallery without a reload once processing completes.
-- `photos.ts`'s own comment already names the fact this closes: a `photos`
-- row is only ever inserted already stripped (`0037`'s own
-- `check (exif_stripped)` constraint), so the INSERT itself is the moment a
-- photo becomes visible — there is no separate "now published" transition
-- to track.
--
-- Reuses the EXACT `session:{session_id}` topic and RLS
-- `comments_broadcast()`/`reactions_broadcast()` (0016) already established
-- (03 §7.3/§7.4) — no new topic, no new realtime.messages policy. A member
-- already subscribed for comments on this session's event page receives
-- this too; nothing new to authorise.
--
-- Serves: REQ-EVT-010, DEC-139
-- 03 §8.2 row this proves (tests/rls/photos-broadcast.test.ts):
--   TRG-photos_broadcast.session_topic — an INSERT on photos broadcasts
--     {id, sessionId, uploaderId} on session:{session_id}, event 'INSERT'.

create function public.photos_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'sessionId', new.session_id,
      'uploaderId', new.uploader_id
    ),
    'INSERT',
    'session:' || new.session_id::text
  );
  return new;
end $$;

create trigger photos_broadcast after insert on public.photos
  for each row execute function public.photos_broadcast();
