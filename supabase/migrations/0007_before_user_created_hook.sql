-- 0007 — the Before User Created hook. REQ-AUT-006, DEC-036.
--
-- "No account, member row or audit subject is created for a rejected
-- sign-in." Supabase Auth creates the auth user the moment Google returns,
-- before the app sees anything — so the only place that acceptance criterion
-- can be met is this hook, which runs BEFORE the user row exists and may
-- reject the sign-up. A Google account whose domain is on no active org's
-- list is refused here; the callback's own no_match path stays as defence in
-- depth for a list that changed in between.
--
-- It fails OPEN: any error inside returns the event unchanged, so a broken
-- hook produces an orphan auth user who lands on /no-access, never a sign-up
-- outage. Same three grants as the access token hook (0006).

create function public.before_user_created_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_email  text := lower(coalesce(event -> 'user' ->> 'email', ''));
  v_domain text;
begin
  if v_email = '' then
    return event;
  end if;
  v_domain := split_part(v_email, '@', 2);
  if exists (
    select 1
      from public.org_domains d
      join public.orgs o on o.id = d.org_id
     where lower(d.domain::text) = v_domain
       and o.status = 'active'
  ) then
    return event;
  end if;
  -- The message is an identifier the sign-in screen maps to Arabic copy
  -- that names no org and lists no domains (REQ-AUT-006).
  return jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'domain_not_allowed')
  );
exception
  when others then
    return event;
end $$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.before_user_created_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.before_user_created_hook(jsonb) from public, anon, authenticated;
grant select on public.org_domains, public.orgs to supabase_auth_admin;
