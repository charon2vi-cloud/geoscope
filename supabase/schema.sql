-- ============================================================================
-- GeoScope chat — Supabase schema, security policies and server-side logic
-- Run once in the Supabase dashboard (SQL editor). Safe to re-run.
--
-- Security model
--   * Row Level Security is ON for every table.
--   * Clients can only SELECT messages and public profile fields.
--   * Every write goes through a SECURITY DEFINER function that validates and
--     sanitises its input, so no client can insert/update/delete rows directly.
--   * The functions are callable by the `authenticated` role only.
--   * Rate limit: one message per second per user (serialised with an advisory
--     lock, so it holds under concurrent requests); 30 reports per day per user.
--   * Retention: only the newest 2,000 messages per country room are kept.
--   * Auto-ban: 15 reports in 1 day → 24 h, 50 in 7 days → 7 days,
--     80 in 30 days → 30 days. Reports are counted as distinct reporters so a
--     single account cannot ban somebody on its own.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles --
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default 'Explorer' check (char_length(display_name) between 1 and 40),
  avatar_url    text check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 500)),
  banned_until  timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles are readable" on public.profiles;
create policy "profiles are readable"
  on public.profiles for select
  to anon, authenticated
  using (true);
-- no insert / update / delete policies: only the trigger below writes here

-- Create the profile row when a user signs up (name + avatar from the Google metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name   text := coalesce(new.raw_user_meta_data ->> 'full_name',
                            new.raw_user_meta_data ->> 'name',
                            split_part(coalesce(new.email, ''), '@', 1),
                            'Explorer');
  v_avatar text := coalesce(new.raw_user_meta_data ->> 'avatar_url',
                            new.raw_user_meta_data ->> 'picture');
begin
  v_name := left(btrim(regexp_replace(v_name, '[[:cntrl:]]', '', 'g')), 40);
  if v_name = '' then v_name := 'Explorer'; end if;
  if v_avatar is null or v_avatar !~ '^https://' then v_avatar := null; end if;

  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, v_name, left(v_avatar, 500))
  on conflict (id) do update
    set display_name = excluded.display_name,
        avatar_url   = excluded.avatar_url;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- messages --
create table if not exists public.messages (
  id             bigint generated always as identity primary key,
  country        char(2) not null check (country ~ '^[A-Z]{2}$'),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  author_name    text not null,
  author_avatar  text,
  body           text not null check (char_length(body) between 1 and 500),
  created_at     timestamptz not null default now()
);
create index if not exists messages_country_id_idx      on public.messages (country, id desc);
create index if not exists messages_user_created_idx    on public.messages (user_id, created_at desc);
alter table public.messages enable row level security;

drop policy if exists "messages are readable" on public.messages;
create policy "messages are readable"
  on public.messages for select
  to anon, authenticated
  using (true);
-- no insert / update / delete policies: use send_message()

-- ----------------------------------------------------------- reports, bans --
create table if not exists public.reports (
  id                bigint generated always as identity primary key,
  message_id        bigint not null references public.messages (id) on delete cascade,
  reported_user_id  uuid not null references public.profiles (id) on delete cascade,
  reporter_id       uuid not null references public.profiles (id) on delete cascade,
  reason            text check (reason is null or char_length(reason) <= 200),
  created_at        timestamptz not null default now(),
  unique (message_id, reporter_id)
);
create index if not exists reports_reported_created_idx on public.reports (reported_user_id, created_at desc);
create index if not exists reports_reporter_created_idx on public.reports (reporter_id, created_at desc);
alter table public.reports enable row level security;   -- no policies: RPC only

create table if not exists public.bans (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  reason      text not null,
  until       timestamptz not null,
  created_at  timestamptz not null default now()
);
alter table public.bans enable row level security;      -- no policies: RPC only

-- ------------------------------------------------------- RPC: send_message --
create or replace function public.send_message(p_country text, p_body text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_body    text;
  v_profile public.profiles%rowtype;
  v_last    timestamptz;
  v_id      bigint;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_country is null or p_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid_country' using errcode = '22023';
  end if;

  -- sanitise: line breaks/tabs become spaces, other control characters are dropped,
  -- whitespace collapsed, trimmed, length capped. Text is stored as plain text; the
  -- client renders it with textContent, never as HTML.
  v_body := regexp_replace(coalesce(p_body, ''), '[\n\r\t]', ' ', 'g');
  v_body := regexp_replace(v_body, '[[:cntrl:]]', '', 'g');
  v_body := btrim(regexp_replace(v_body, '\s+', ' ', 'g'));
  if char_length(v_body) = 0 then
    raise exception 'empty_message' using errcode = '22023';
  end if;
  if char_length(v_body) > 500 then
    raise exception 'message_too_long' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'profile_missing' using errcode = '42501';
  end if;
  if v_profile.banned_until is not null and v_profile.banned_until > now() then
    raise exception 'banned_until:%', to_char(v_profile.banned_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      using errcode = '42501';
  end if;

  -- rate limit: 1 message / second / user, serialised per user
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  select max(created_at) into v_last from public.messages where user_id = v_uid;
  if v_last is not null and v_last > now() - interval '1 second' then
    raise exception 'rate_limited' using errcode = '53400';
  end if;

  insert into public.messages (country, user_id, author_name, author_avatar, body)
  values (p_country, v_uid, v_profile.display_name, v_profile.avatar_url, v_body)
  returning id into v_id;

  -- retention: keep only the newest 2,000 messages of this room
  delete from public.messages
   where country = p_country
     and id < (select id from public.messages
                where country = p_country
                order by id desc
                offset 2000 limit 1);

  return v_id;
end;
$$;
revoke all on function public.send_message(text, text) from public, anon;
grant execute on function public.send_message(text, text) to authenticated;

-- ----------------------------------------------------- RPC: report_message --
create or replace function public.report_message(p_message_id bigint, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_msg        public.messages%rowtype;
  v_day        int;
  v_week       int;
  v_month      int;
  v_until      timestamptz;
  v_reason     text;
  v_my_reports int;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  select * into v_msg from public.messages where id = p_message_id;
  if not found then
    raise exception 'message_not_found' using errcode = '22023';
  end if;
  if v_msg.user_id = v_uid then
    raise exception 'cannot_report_self' using errcode = '22023';
  end if;

  -- reporter abuse guard: at most 30 reports per day per account
  select count(*) into v_my_reports
    from public.reports
   where reporter_id = v_uid and created_at > now() - interval '1 day';
  if v_my_reports >= 30 then
    raise exception 'rate_limited' using errcode = '53400';
  end if;

  insert into public.reports (message_id, reported_user_id, reporter_id, reason)
  values (p_message_id, v_msg.user_id, v_uid,
          nullif(left(btrim(regexp_replace(coalesce(p_reason, ''), '[[:cntrl:]]', '', 'g')), 200), ''))
  on conflict (message_id, reporter_id) do nothing;

  -- thresholds (distinct reporters)
  select count(distinct reporter_id) into v_day   from public.reports where reported_user_id = v_msg.user_id and created_at > now() - interval '1 day';
  select count(distinct reporter_id) into v_week  from public.reports where reported_user_id = v_msg.user_id and created_at > now() - interval '7 days';
  select count(distinct reporter_id) into v_month from public.reports where reported_user_id = v_msg.user_id and created_at > now() - interval '30 days';

  if v_month >= 80 then
    v_until := now() + interval '30 days'; v_reason := '80 reports in 30 days';
  elsif v_week >= 50 then
    v_until := now() + interval '7 days';  v_reason := '50 reports in 7 days';
  elsif v_day >= 15 then
    v_until := now() + interval '1 day';   v_reason := '15 reports in 1 day';
  end if;

  if v_until is not null then
    update public.profiles
       set banned_until = greatest(coalesce(banned_until, now()), v_until)
     where id = v_msg.user_id;
    insert into public.bans (user_id, reason, until) values (v_msg.user_id, v_reason, v_until);
  end if;

  return jsonb_build_object('ok', true, 'day', v_day, 'week', v_week, 'month', v_month, 'banned', v_until is not null);
end;
$$;
revoke all on function public.report_message(bigint, text) from public, anon;
grant execute on function public.report_message(bigint, text) to authenticated;

-- ----------------------------------------------------------- RPC: my_status --
create or replace function public.my_status()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object('banned_until', p.banned_until, 'display_name', p.display_name)
    from public.profiles p
   where p.id = auth.uid();
$$;
revoke all on function public.my_status() from public, anon;
grant execute on function public.my_status() to authenticated;

-- ------------------------------------------------------------------ realtime --
-- Broadcast message inserts to open rooms (RLS still applies to every subscriber).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
