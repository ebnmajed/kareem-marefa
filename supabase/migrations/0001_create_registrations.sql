create type public.registration_role as enum ('provider', 'attendee');
create type public.topic_category as enum ('technical', 'management', 'creative', 'experience');

create table public.registrations (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  name              text not null check (char_length(btrim(name)) between 2 and 100),
  email             text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'),
  role              public.registration_role not null,
  topic_title       text check (char_length(topic_title) <= 150),
  topic_description text check (char_length(topic_description) <= 600),
  topic_category    public.topic_category,
  locale            text not null default 'ar' check (locale in ('ar','en')),

  -- providers: title + category required, description optional; attendees: all null
  constraint provider_fields_present check (
    role <> 'provider' or (topic_title is not null and topic_category is not null)
  ),
  constraint attendee_fields_absent check (
    role <> 'attendee' or (topic_title is null and topic_description is null and topic_category is null)
  )
);

comment on table public.registrations is
  'Pre-launch interest registrations for the Kareem Marefa initiative. One row per (email, role).';

create unique index registrations_email_role_key on public.registrations (lower(email), role);

alter table public.registrations enable row level security;

create policy "anyone can register"
  on public.registrations
  for insert
  to anon
  with check (true);

-- No select/update/delete policies: deny by default. Belt and braces:
revoke select, update, delete on table public.registrations from anon, authenticated;
