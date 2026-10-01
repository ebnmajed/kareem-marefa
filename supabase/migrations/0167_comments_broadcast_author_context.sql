-- 0167_comments_broadcast_author_context.sql — proposed by `content` (supabase/proposed/content/comments_broadcast_author_context.sql), promoted by the lead (DEC-209).
--
-- `SCR-012`'s discussion draws «name · company · time» on every comment and «· المُقدِّمة» beside a presenter
-- (`Event.dc.html:110-114`). The DAL's first paint can read both; a comment that arrives LIVE (`REQ-EVT-015`)
-- arrives through this payload, which carried neither — so a live comment would lack them until a reload.
--
-- ADD-ONLY: three keys join the payload; none is removed or renamed, so `main`'s client (which reads only the
-- keys it knew) is unchanged on this schema.
--   · `authorCompanyName` — `companies.name`, org-readable to every member already (`companies_read`);
--   · `authorTeamColor`   — `companies.team_color` (0160), `#rrggbb` or null; the client re-checks it;
--   · `authorIsPresenter` — an ACCEPTED presenter of the comment's session (`session_presenters`, org-readable).
-- Nothing about any other member is added, and no URL: `authorAvatarUrl` stays null (`0155`, `DEC-099`).
--
-- Re-created exactly as `0157` left it plus the three keys: `security definer`, `search_path = ''`, the same
-- topic. The trigger itself is untouched (it calls the function by name).
create or replace function public.comments_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row       record := coalesce(new, old);
  v_author    record;
  v_presents  boolean;
begin
  select m.display_name, m.avatar_version, c.name as company_name, c.team_color
    into v_author
    from public.members m
    left join public.companies c on c.id = m.company_id
   where m.id = v_row.author_id;
  select exists (
    select 1 from public.session_presenters sp
     where sp.session_id = v_row.session_id and sp.member_id = v_row.author_id and sp.accepted
  ) into v_presents;
  perform realtime.send(
    jsonb_build_object(
      'id', v_row.id,
      'sessionId', v_row.session_id,
      'parentId', v_row.parent_id,
      'authorId', v_row.author_id,
      'authorDisplayName', v_author.display_name,
      'authorAvatarUrl', null,
      'authorAvatarVersion', v_author.avatar_version,
      'authorCompanyName', v_author.company_name,
      'authorTeamColor', v_author.team_color,
      'authorIsPresenter', v_presents,
      'body', v_row.body,
      'mentions', to_jsonb(v_row.mentions),
      'createdAt', v_row.created_at,
      'editedAt', v_row.edited_at,
      'deletedAt', v_row.deleted_at
    ),
    tg_op,
    'session:' || v_row.session_id::text
  );
  return v_row;
end $$;
