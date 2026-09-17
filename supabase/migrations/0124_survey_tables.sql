-- 0124 — the survey's tables: nine tables, one enum, one setting. Tables only.
--
-- Serves: REQ-SUR-001 … REQ-SUR-009, REQ-NFR-001 · DEC-074, DEC-094, DEC-160 §3
--         (the storage contract), DEC-161 (sync 1's rulings).
-- Author: the lead (row L2 — «tables are the lead's; behaviour is the tracks'»),
--         from `event`'s plan, `docs/plan/notes/event.md` «Wave 10 plan» §1.
--         Every function, trigger and job that reads or writes these tables is
--         `event`'s and arrives in later files; this one creates nothing that runs.
--
-- ★ THE CONTRACT THIS FILE IS THE SHAPE OF (DEC-160 §3).
--   A stored response names no member. `survey_responses` and `survey_answers`
--   carry NO member, NO check-in, NO rating and NO TIMESTAMP COLUMN OF ANY KIND,
--   and no foreign-key path out of either reaches `members`. «One member, one
--   response» (REQ-SUR-003) lives in `survey_participations (survey_id,
--   member_id)` — the register — which carries no answer and no time, and has no
--   surrogate id on purpose: there is no participation id that a later mistake
--   could ever write onto a response. The register says who answered; the box
--   says what was answered; nothing says which.
--
--   `tests/rls/survey-structure.test.ts` (`event`'s) asserts all of that over the
--   catalogue, so a column added to either table next year fails the suite.
--   ANYONE ADDING A COLUMN TO `survey_responses` OR `survey_answers`: read
--   DEC-160 §3 first. `created_at` is not a harmless convention here.
--
-- POSTURE, per table (invariant 5; 03 §5.6f):
--   · the six AUTHORING tables — `select` for the org's STAFF (REQ-SUR-005's
--     audience; a template is not an answer). No write policy: every write
--     renumbers a whole ordered set, which a policy cannot do atomically, so the
--     writes are `event`'s definer RPCs. A member never selects them — the rate
--     screen reads a survey through one function with one audience test.
--   · the REGISTER and the BOX (`survey_participations`, `survey_responses`,
--     `survey_answers`) — RLS enabled, NO POLICY AND NO GRANT, for every client
--     role and for `service_role`. This is DEC-160 §3.3 stated in the one place
--     it cannot be forgotten: results leave the database through one definer
--     function that applies the withhold, so `xmin` and `ctid` are never
--     readable either. Documented beside `retention_periods` in 02 §7 and 03 —
--     a policy that grants nobody anything would be a decorative row that a later
--     «just add a staff select» would quietly amend (DEC-161).
--
-- «BY CONSTRUCTION» (wave 9's habit): an answer can only name a question OF ITS
--   OWN SURVEY and an option OF ITS OWN QUESTION — composite foreign keys, as
--   `0100` did for a day of its own session. `survey_answers.survey_id` exists
--   for that and names a survey, never a person.
--
-- THE MINIMUM HAS A FLOOR. `org_settings.survey_min_responses` is its own
--   setting (the rating's minimum hides a session from its PRESENTER; this one
--   hides respondents from STAFF, who can already read the attendance list) and
--   it cannot go below 3: a minimum an org can set to 1 is REQ-SUR-006 switched
--   off while the screen promises members otherwise. No test lowers it — a test
--   reaches «drawn» by storing three responses. No column grant this wave: no
--   screen edits it, and the grant arrives with the screen that does.
--
-- ADDITIVE (wave 10's rule): nothing `main` reads is touched. Nine new tables,
--   one new enum, one new column with a default. `sessions` does not change —
--   «a session with no survey» is the absence of a `surveys` row, not a flag.
--
-- 03 §8.2 rows (each proven by `event`'s suites at the promotion of its files):
--   | `POL-survey_templates.staff_read` | Staff of the org read its templates, questions and options; a plain member and the other org's staff read none; no client role writes any of the three directly. |
--   | `POL-surveys.staff_read` | Staff of the org read a session's survey, its questions and options; a plain member, the session's presenter as such, and the other org's staff read none; no client role writes directly. |
--   | `POL-survey_participations.no_client_select` | RLS enabled, no policy, no grant: `anon`, a member, the presenter, a moderator, an admin and `service_role` are each refused `42501`. |
--   | `POL-survey_responses.no_client_select` | The same, for the box. |
--   | `POL-survey_answers.no_client_select` | The same, for the answers. |
--   | `POL-survey.structure` | Generated over the catalogue: no member, check-in, rating or timestamp column on `survey_responses` or `survey_answers`; no timestamp column on `survey_participations`; no foreign-key path from a response or an answer to `members`. |
--   | `POL-org_settings.survey_min_responses.floor` | The minimum cannot be set below 3 by any role. |

create type public.survey_question_kind as enum ('scale_1_5', 'single_choice', 'multi_choice', 'free_text');

comment on type public.survey_question_kind is
  'REQ-SUR-002: the four question types, in the order SCR-065 offers them.';

-- ═══════════════════════════════════════════════════════════════════════════
-- The authoring side — a template an org reuses (REQ-SUR-001, REQ-SUR-002).
-- ═══════════════════════════════════════════════════════════════════════════
create table public.survey_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- two templates named the same are indistinguishable in the attach picker
  constraint survey_templates_org_title_key unique (org_id, title)
);
create trigger survey_templates_updated_at before update on public.survey_templates
  for each row execute function public.set_updated_at();

create table public.survey_template_questions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  template_id  uuid not null references public.survey_templates(id) on delete cascade,
  position     int  not null check (position >= 1),
  kind         public.survey_question_kind not null,
  prompt       text not null check (char_length(btrim(prompt)) between 1 and 300),
  -- the safe default is «optional»
  required     boolean not null default false,
  -- Deferred, so one statement may renumber a whole set (REQ-SUR-002: «order is
  -- authored and preserved»).
  constraint survey_template_questions_position_key unique (template_id, position) deferrable initially deferred
);
create index survey_template_questions_org_template_idx on public.survey_template_questions (org_id, template_id, position);

create table public.survey_template_options (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  question_id  uuid not null references public.survey_template_questions(id) on delete cascade,
  position     int  not null check (position >= 1),
  label        text not null check (char_length(btrim(label)) between 1 and 120),
  constraint survey_template_options_position_key unique (question_id, position) deferrable initially deferred
);
create index survey_template_options_org_question_idx on public.survey_template_options (org_id, question_id, position);

-- ═══════════════════════════════════════════════════════════════════════════
-- The copy attached to a session (REQ-SUR-001, SCR-064). Editing a template
-- never rewrites a survey members have answered: these rows ARE the survey, and
-- the two `source_*` columns are provenance, never read to render a question.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.surveys (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  -- ONE survey per session (REQ-SUR-001, DEC-074) — `unique` is that sentence.
  session_id          uuid not null unique references public.sessions(id) on delete cascade,
  -- `set null`: deleting a template never deletes a survey that was answered.
  source_template_id  uuid references public.survey_templates(id) on delete set null,
  title               text not null check (char_length(btrim(title)) between 1 and 200),
  -- A STAFF action's time; the table names no member. SCR-064 shows it only when
  -- it is later than the session's completion, to read a low rate honestly.
  attached_at         timestamptz not null default now()
);
create index surveys_org_idx on public.surveys (org_id);

create table public.survey_questions (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  survey_id           uuid not null references public.surveys(id) on delete cascade,
  position            int  not null check (position >= 1),
  kind                public.survey_question_kind not null,
  prompt              text not null check (char_length(btrim(prompt)) between 1 and 300),
  required            boolean not null default false,
  source_question_id  uuid references public.survey_template_questions(id) on delete set null,
  constraint survey_questions_position_key unique (survey_id, position) deferrable initially deferred,
  -- the target of the composite key below: an answer names a question of ITS OWN survey
  constraint survey_questions_survey_id_id_key unique (survey_id, id)
);
create index survey_questions_org_survey_idx on public.survey_questions (org_id, survey_id, position);

create table public.survey_question_options (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  question_id  uuid not null references public.survey_questions(id) on delete cascade,
  position     int  not null check (position >= 1),
  label        text not null check (char_length(btrim(label)) between 1 and 120),
  constraint survey_question_options_position_key unique (question_id, position) deferrable initially deferred,
  -- the target of the composite key below: an answer names an option of ITS OWN question
  constraint survey_question_options_question_id_id_key unique (question_id, id)
);
create index survey_question_options_org_question_idx on public.survey_question_options (org_id, question_id, position);

-- ═══════════════════════════════════════════════════════════════════════════
-- ★ THE REGISTER — who has answered. No answer, no time, no surrogate id.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.survey_participations (
  org_id     uuid not null references public.orgs(id) on delete cascade,
  survey_id  uuid not null references public.surveys(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  primary key (survey_id, member_id)
);
create index survey_participations_org_idx on public.survey_participations (org_id);

comment on table public.survey_participations is
  'DEC-160 §3: the REGISTER. «One member, one response» lives here and only here. No timestamp and no surrogate id, on purpose — it must not say WHEN, and nothing may ever be able to carry its id onto a response. Selectable by no client role.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ★ THE BOX — what was answered. No member, no check-in, no rating, NO TIMESTAMP.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.survey_responses (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  survey_id  uuid not null references public.surveys(id) on delete cascade,
  -- the target of the composite key below
  constraint survey_responses_survey_id_id_key unique (survey_id, id)
);
create index survey_responses_org_idx on public.survey_responses (org_id);

comment on table public.survey_responses is
  'DEC-160 §3: the BOX. A random id, an org and a survey — AND NOTHING ELSE, EVER. No member, no check-in, no rating and no timestamp of any kind; no foreign-key path from here reaches members. Written only by the jittered job; selectable by no client role. Do not add created_at.';

create table public.survey_answers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  -- names a SURVEY, never a person; it exists so the two composite keys below can
  -- say «a question, and a response, of the same survey» by construction.
  survey_id    uuid not null,
  response_id  uuid not null,
  question_id  uuid not null,
  scale_value  smallint check (scale_value is null or scale_value between 1 and 5),
  -- one row per chosen option: a multi_choice answer is N rows
  option_id    uuid,
  -- the same ceiling a rating's comment has
  text_value   text check (text_value is null or char_length(text_value) between 1 and 2000),
  -- an answer is exactly one of the three shapes
  constraint survey_answers_one_shape check (num_nonnulls(scale_value, option_id, text_value) = 1),
  constraint survey_answers_response_fkey foreign key (survey_id, response_id)
    references public.survey_responses (survey_id, id) on delete cascade,
  constraint survey_answers_question_fkey foreign key (survey_id, question_id)
    references public.survey_questions (survey_id, id) on delete cascade,
  -- MATCH SIMPLE: not checked while option_id is null, which is a scale or a text answer
  constraint survey_answers_option_fkey foreign key (question_id, option_id)
    references public.survey_question_options (question_id, id) on delete cascade
);
-- one scale or text answer per question; one row per chosen option, never twice
create unique index survey_answers_single_key on public.survey_answers (response_id, question_id) where option_id is null;
create unique index survey_answers_option_key on public.survey_answers (response_id, question_id, option_id) where option_id is not null;
create index survey_answers_question_idx on public.survey_answers (question_id);
create index survey_answers_org_idx on public.survey_answers (org_id);

comment on table public.survey_answers is
  'DEC-160 §3: one value of one response to one question of its own survey. No member and no timestamp; selectable by no client role. Results leave through one definer function that applies the withhold (REQ-SUR-006).';

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS, policies, grants (invariants 5 and 6).
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.survey_templates          enable row level security;
alter table public.survey_template_questions enable row level security;
alter table public.survey_template_options   enable row level security;
alter table public.surveys                   enable row level security;
alter table public.survey_questions          enable row level security;
alter table public.survey_question_options   enable row level security;
alter table public.survey_participations     enable row level security;
alter table public.survey_responses          enable row level security;
alter table public.survey_answers            enable row level security;

revoke all on public.survey_templates          from anon, authenticated, service_role;
revoke all on public.survey_template_questions from anon, authenticated, service_role;
revoke all on public.survey_template_options   from anon, authenticated, service_role;
revoke all on public.surveys                   from anon, authenticated, service_role;
revoke all on public.survey_questions          from anon, authenticated, service_role;
revoke all on public.survey_question_options   from anon, authenticated, service_role;
revoke all on public.survey_participations     from anon, authenticated, service_role;
revoke all on public.survey_responses          from anon, authenticated, service_role;
revoke all on public.survey_answers            from anon, authenticated, service_role;

-- The six authoring tables: the org's staff read; nobody writes directly.
create policy "survey_templates_read_staff" on public.survey_templates for select to authenticated
  using (org_id = public.auth_org_id() and public.is_staff());
create policy "survey_template_questions_read_staff" on public.survey_template_questions for select to authenticated
  using (org_id = public.auth_org_id() and public.is_staff());
create policy "survey_template_options_read_staff" on public.survey_template_options for select to authenticated
  using (org_id = public.auth_org_id() and public.is_staff());
create policy "surveys_read_staff" on public.surveys for select to authenticated
  using (org_id = public.auth_org_id() and public.is_staff());
create policy "survey_questions_read_staff" on public.survey_questions for select to authenticated
  using (org_id = public.auth_org_id() and public.is_staff());
create policy "survey_question_options_read_staff" on public.survey_question_options for select to authenticated
  using (org_id = public.auth_org_id() and public.is_staff());

grant select on public.survey_templates          to authenticated;
grant select on public.survey_template_questions to authenticated;
grant select on public.survey_template_options   to authenticated;
grant select on public.surveys                   to authenticated;
grant select on public.survey_questions          to authenticated;
grant select on public.survey_question_options   to authenticated;

-- The register and the box: NO policy and NO grant, on purpose (DEC-160 §3.3).

-- ═══════════════════════════════════════════════════════════════════════════
-- The minimum — its own setting, with a floor.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.org_settings
  add column survey_min_responses int not null default 3
    constraint org_settings_survey_min_responses_floor check (survey_min_responses between 3 and 50);

comment on column public.org_settings.survey_min_responses is
  'REQ-SUR-006: below this many stored responses NOTHING about a survey leaves the database, the count included. Floor 3 — an org cannot switch the withhold off (DEC-161).';
