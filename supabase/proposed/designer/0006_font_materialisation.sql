-- designer (wave 3, M6) — the Google Fonts materialisation flow.
-- Follows 0062.
--
-- Serves:  02 §4.13 (ENT-fonts), 03 §5.9 (`fonts`: read by every member,
--          `parity_status` written by the job only — no new policy here)
--          REQ-DSG-016, REQ-DSG-017, A39, 11 §2.5 (JOB-materialise_font,
--          key `font:{family}:{style}:{weight}`)
-- Cites:   DEC-007 (choose freely, then FREEZE), DEC-049, D66
--
-- 03 §8.2 ROWS THIS FILE NEEDS:
--   | `POL-fonts.materialise.admin` | An org admin requests a family and one job is enqueued with 11 §2.5's key; a moderator is refused. |
--   | `POL-fonts.record.worker` | `record_font()` is service_role only; an admin calling it is refused. |
--   | `POL-fonts.gate` | A font recorded as `failed` carries the report naming which checks failed, and stays unselectable. |
--
-- ★ THE POINT OF THE WHOLE FLOW (06 §7.2): the choice is free and then it is
-- FROZEN. The binary is downloaded ONCE, hashed, stored in our own bucket
-- and pinned by that hash — never hot-linked, because Google's dynamically
-- subset slices are not byte-stable and the editor and the worker would
-- fetch different bytes on different days with nothing erroring.
--
-- And a font becomes selectable ONLY at `parity_status = 'passed'`. A face
-- with partial GSUB or mark coverage renders Latin perfectly and silently
-- breaks lam-alef and stacked tashkeel; a Latin smoke test passes it. The
-- gate is `packages/designer-runtime/src/font-gate.ts`, whose checks are
-- comparative rather than golden-based because a new font has never been
-- rendered and has nothing to compare against except properties every
-- correct Arabic face has.

-- Who asked for it, so a failure can be reported back to them, and so two
-- orgs asking for the same family share the one binary rather than racing.
alter table public.fonts
  add column requested_by_org uuid references public.orgs(id) on delete set null,
  add column requested_at     timestamptz not null default now();

comment on column public.fonts.requested_by_org is
  'The org whose admin materialised this family. The FONT is platform-wide and shared by hash (REQ-DSG-016, DEC-049); this only records who asked, so a failed gate can be reported to them.';

create function public.request_font(
  p_family text,
  p_style  text default 'normal',
  p_weight int  default 400
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.auth_org_id();
begin
  if v_org is null or not public.is_org_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_family is null or char_length(btrim(p_family)) between 0 and 0 then
    raise exception 'bad_family' using errcode = '22023';
  end if;
  if p_style not in ('normal', 'italic') or p_weight not between 100 and 900 then
    raise exception 'bad_face' using errcode = '22023';
  end if;

  -- Already materialised and passing: nothing to download, and the font is
  -- platform-wide, so the asking org can simply use it.
  if exists (select 1 from public.fonts f
              where f.family = p_family and f.style = p_style and f.weight = p_weight
                and f.parity_status = 'passed') then
    return;
  end if;

  -- 11 §2.5's key, verbatim. A second request for the same face MOVES the
  -- pending job rather than downloading the binary twice.
  perform public.enqueue_job(
    'materialise_font',
    jsonb_build_object('family', p_family, 'style', p_style, 'weight', p_weight, 'org_id', v_org),
    'font:' || p_family || ':' || p_style || ':' || p_weight::text,
    null, 'render', 3
  );

  perform public.write_audit(v_org, 'design.font_requested', 'font', null, null,
                             jsonb_build_object('family', p_family, 'style', p_style, 'weight', p_weight));
end $$;
revoke execute on function public.request_font(text, text, int) from public, anon;
grant  execute on function public.request_font(text, text, int) to authenticated;

/** The worker's one door. `fonts` grants no write to any client role (03
 *  §5.9: parity_status is written by the job only), so this is the whole
 *  interface — and it is the only place a font can become selectable. */
create function public.record_font(
  p_family        text,
  p_style         text,
  p_weight        int,
  p_source        text,
  p_storage_path  text,
  p_sha256        text,
  p_subsets       text[],
  p_parity_status text,
  p_parity_report jsonb default null,
  p_org           uuid default null
) returns public.fonts
language plpgsql security definer set search_path = '' as $$
declare v_row public.fonts;
begin
  -- UPDATE first, then INSERT — NOT `on conflict do update`. Postgres
  -- evaluates a CHECK against the PROPOSED insert tuple before the conflict
  -- arbiter runs, so re-recording a face with `{latin}` and `passed` would
  -- fail `fonts_arabic_to_pass` on a row that the DO UPDATE was about to
  -- merge into something that satisfies it. Found by the test that asserts
  -- a re-run widens the subsets.
  update public.fonts f
     set parity_status = p_parity_status,
         parity_report = coalesce(p_parity_report, f.parity_report),
         -- The subsets are a property of the BYTES, so a re-run may only
         -- widen what we know about them, never narrow it.
         subsets = (select array(select distinct unnest(f.subsets || coalesce(p_subsets, '{}'))))
   where f.sha256 = p_sha256
   returning * into v_row;

  if found then
    return v_row;
  end if;

  insert into public.fonts (family, style, weight, source, storage_path, sha256, subsets,
                            parity_status, parity_report, requested_by_org)
  values (p_family, p_style, p_weight, p_source, p_storage_path, p_sha256, coalesce(p_subsets, '{}'),
          p_parity_status, p_parity_report, p_org)
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.record_font(text, text, int, text, text, text, text[], text, jsonb, uuid) from public, anon, authenticated;
grant  execute on function public.record_font(text, text, int, text, text, text, text[], text, jsonb, uuid) to service_role;
