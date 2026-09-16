-- 0083 — the org scoring seed writes Western digits (DEC-124, DEC-143)
--
-- _seed_org_scoring() (0027, last re-created in 0081) seeds two strings with
-- Arabic-Indic digits: the streak_month rule's reason «سلسلة: ٣ حضور في الشهر»
-- and the rated_presenter badge's description «متوسط تقييم ٤.٥ فأعلى …».
-- DEC-124's sweep (0082, the code half) cleaned the message catalogue and the
-- formatters; it never read the strings a migration writes into rows, and
-- wave 7's first capture of /app/me/points showed «٣» to a member.
--
-- This re-creates the function with Western digits and nothing else changed,
-- so every org created from now on is right. It deliberately does NOT update
-- the rows existing orgs already hold: that is a data fix, and a data fix is
-- never a migration (CLAUDE.md, DEC-023, DEC-027). The scoped statement for
-- existing orgs is recorded in DEC-143 and run separately, read first.
--
-- Serves:  REQ-INT-006 (DEC-124), REQ-PTS-003
-- Cites:   0027 (_seed_org_scoring, orgs_seed_scoring), 0081 (its latest body)
-- 03 §8.2: no policy or grant changes — the revoke below restates 0081's.

create or replace function public._seed_org_scoring(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_level3 uuid; v_level4 uuid;
begin
  insert into public.scoring_rules (org_id, action_key, actor, points, enabled, cap_per_session, cooldown, reason_ar) values
    (p_org, 'check_in',           'attendee',  20, true, null, null,                    'تسجيل حضور مؤكَّد'),
    (p_org, 'rating_submitted',   'attendee',  5,  true, 1,    null,                    'تقييم جلسة'),
    (p_org, 'comment',            'attendee',  2,  true, 5,    interval '60 seconds',   'تعليق'),
    (p_org, 'photo',              'attendee',  3,  true, 5,    null,                    'صورة من الجلسة'),
    (p_org, 'streak_month',       'attendee',  15, true, null, null,                    'سلسلة: 3 حضور في الشهر'),
    (p_org, 'proposal_accepted',  'presenter', 10, true, null, null,                    'قبول مقترح'),
    (p_org, 'session_delivered',  'presenter', 50, true, null, null,                    'تقديم جلسة'),
    (p_org, 'attendee_bonus',     'presenter', 2,  true, 30,   null,                    'مكافأة لكل حاضر'),
    (p_org, 'rating_bonus',       'presenter', 20, true, 1,    null,                    'تقييم عالٍ للجلسة'),
    (p_org, 'materials_uploaded', 'presenter', 10, true, 1,    null,                    'رفع مواد الجلسة'),
    (p_org, 'no_show',            'attendee',  0,  true, null, null,                    'تغيّب بعد الحجز'),
    (p_org, 'late_cancellation',  'attendee',  0,  true, null, null,                    'إلغاء متأخر'),
    (p_org, 'comment_removed',    'attendee',  0,  true, null, null,                    'حُذف تعليق'),
    (p_org, 'photo_removed',      'attendee',  0,  true, null, null,                    'حُذفت صورة')
  on conflict (org_id, action_key) do nothing;

  insert into public.badges (org_id, key, name, description, rule, issues_certificate) values
    (p_org, 'first_check_in',  'أول حضور',            'أول تسجيل حضور موثّق',
       jsonb_build_object('metric', 'check_ins_count', 'gte', 1), false),
    (p_org, 'first_session',   'أول جلسة',             'أول جلسة تُقدَّم',
       jsonb_build_object('metric', 'sessions_delivered_count', 'gte', 1), false),
    (p_org, 'voice_heard',     'صوت مسموع',            'خمس جلسات تُقدَّم',
       jsonb_build_object('metric', 'sessions_delivered_count', 'gte', 5), true),
    (p_org, 'regular',         'حاضر دائم',            'عشرة تسجيلات حضور',
       jsonb_build_object('metric', 'check_ins_count', 'gte', 10), false),
    (p_org, 'monthly_streak',  'سلسلة الشهر',          'سلسلة شهرية كاملة',
       jsonb_build_object('metric', 'streak_awards_count', 'gte', 1), false),
    (p_org, 'trusted_opinion', 'رأي يُعتد به',          'عشرون تقييمًا',
       jsonb_build_object('metric', 'ratings_submitted_count', 'gte', 20), false),
    (p_org, 'rated_presenter', 'مُقدِّم مُقيَّم',        'متوسط تقييم 4.5 فأعلى على ثلاث جلسات على الأقل',
       jsonb_build_object('metric', 'presenter_rating_avg', 'gte', 4.5, 'min_sessions', 3), true),
    (p_org, 'annual',          'كريم المعرفة السنوي',  'تكريم سنوي',
       jsonb_build_object('metric', 'manual'), true)
  on conflict (org_id, key) do nothing;

  insert into public.levels (org_id, name, threshold_points, sort_order) values
    (p_org, 'مشارِك',       0,    1),
    (p_org, 'مشارِك نشِط',  100,  2),
    (p_org, 'صاحب أثر',     300,  3),
    (p_org, 'كريم معرفة',   700,  4),
    (p_org, 'سفير المعرفة', 1500, 5)
  on conflict (org_id, threshold_points) do nothing;

  select id into v_level3 from public.levels where org_id = p_org and sort_order = 3;
  select id into v_level4 from public.levels where org_id = p_org and sort_order = 4;

  insert into public.streak_rules (org_id, key, "window", required_count, bonus_points, enabled) values
    (p_org, 'monthly_3', interval '1 month', 3, 15, true)
  on conflict (org_id, key) do nothing;

  insert into public.perks (org_id, key, required_level_id, enabled) values
    (p_org, 'priority_rsvp', v_level3, false),
    (p_org, 'can_host',      v_level4, false)
  on conflict (org_id, key) do nothing;

  -- New — the three company rules (this migration). Defaults are seed
  -- values only, editable on /app/admin/scoring like every other rule:
  -- hosting 100 flat; attendance 1 point per 1% of the company's own
  -- active roster attended, capped at 100; presenting weighted higher
  -- (2 points per 1%, capped at 150) since presenting is the rarer act.
  -- min_active_members = 3 is this migration's recommended anti-gaming
  -- default (see the header) — a company with 1–2 active members earns
  -- nothing from the two percent rules until its roster grows.
  insert into public.company_scoring_rules
    (org_id, action_key, enabled, points, points_per_percent, cap_points, min_active_members, reason_ar) values
    (p_org, 'company_hosting',         true, 100,  null, null, null, 'استضافة جلسة'),
    (p_org, 'company_attendance_pct',  true, null, 1.00, 100,  3,    'نسبة حضور موظفي الشركة'),
    (p_org, 'company_presenting_pct',  true, null, 2.00, 150,  3,    'نسبة تقديم موظفي الشركة')
  on conflict (org_id, action_key) do nothing;
end $$;
revoke execute on function public._seed_org_scoring(uuid) from public, anon, authenticated;
