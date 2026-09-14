-- content, follow-up — wires REQ-EVT-012's uploader notice now that
-- public.notify() is promoted (0026). `photo_takedowns_hide()` (0037) hides
-- the photo instantly by trigger, before any human sees the request; this
-- adds the notice in the SAME trigger, in the SAME transaction, so the two
-- properties REQ-EVT-012 asks for — instant hide, and the uploader told
-- without being told who asked — are one atomic write, not two.
--
-- Serves:  REQ-EVT-012 ("The uploader is notified that the photo was hidden
--          pending review, without being told who asked")
-- Cites:   0026 (public.notify(p_org, p_member, p_category, p_payload, p_key));
--          08 §1 lists `MSG-photo_hidden` as category `moderation`,
--          in-app only, non-optional — a member cannot switch this off,
--          matching "the cost of a wrong instant hide is far below the cost
--          of a wrong delay" (07 §9.3).
--
-- 03 §8.2 row this adds:
--   | `RPC-photo_takedowns_hide.notifies` | Inserting a takedown writes an
--     in-app `MSG-photo_hidden` notification to the photo's uploader, whose
--     payload names the photo and session but never the requester. |
--
-- The requester is deliberately absent from the payload and from every
-- column read here beyond what routes the notice (org, uploader, session) —
-- REQ-EVT-012 is explicit that the uploader is not told who asked.
create or replace function public.photo_takedowns_hide() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id uuid;
  v_uploader_id uuid;
  v_session_id uuid;
begin
  update public.photos
     set hidden_at = now(), hidden_reason = 'takedown_requested'
   where id = new.photo_id and hidden_at is null
  returning org_id, uploader_id, session_id into v_org_id, v_uploader_id, v_session_id;

  if v_org_id is not null then
    perform public.notify(
      v_org_id,
      v_uploader_id,
      'moderation',
      jsonb_build_object('photo_id', new.photo_id, 'session_id', v_session_id),
      'MSG-photo_hidden'
    );
  end if;

  return new;
end $$;
