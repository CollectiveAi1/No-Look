-- In The Zone: launch schema.
-- Security model: players own their profile and logs; nobody can write their own tier.
-- A checked-in migration is not proof of live security. After applying, run the
-- "direct request" checks in README.md against the deployed project.

create table public.drills (
  id text primary key,
  is_pro boolean not null default false
);
insert into public.drills (id, is_pro) values
  ('form-shooting', false),
  ('spot-up-5', false),
  ('elite-3pt-flow', true);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  muted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tier lives in its own table so that no profile update can ever touch it.
create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  updated_at timestamptz not null default now()
);

create table public.drill_logs (
  -- Generated on the device when the workout starts. Retries reuse it, so a
  -- workout can only ever be stored once.
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  drill_id text not null references public.drills (id),
  makes integer not null check (makes >= 0),
  misses integer not null check (misses >= 0),
  attempts integer generated always as (makes + misses) stored,
  shot_sequence text,
  feel_guess smallint check (feel_guess between 0 and 100),
  duration_seconds integer check (duration_seconds >= 0),
  started_at timestamptz,
  created_at timestamptz not null default now(),
  constraint drill_logs_not_empty check (makes + misses between 1 and 2000),
  constraint drill_logs_sequence_matches check (
    shot_sequence is null
    or (shot_sequence ~ '^[01]*$' and char_length(shot_sequence) = makes + misses)
  )
);
create index drill_logs_user_created on public.drill_logs (user_id, created_at desc);

-- One profile and one free entitlement per new account.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 40))
  on conflict (user_id) do nothing;
  insert into public.entitlements (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.drills enable row level security;
alter table public.profiles enable row level security;
alter table public.entitlements enable row level security;
alter table public.drill_logs enable row level security;

-- Start from nothing, then grant the narrow set each role needs.
revoke all on public.drills, public.profiles, public.entitlements, public.drill_logs from anon, authenticated;

grant select on public.drills to authenticated;
create policy drills_read on public.drills for select to authenticated using (true);

grant select on public.profiles to authenticated;
grant update (display_name, muted) on public.profiles to authenticated;
create policy profiles_read_own on public.profiles for select to authenticated using (user_id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Read-only for players. Tier changes come from the service role
-- (an admin action today, a verified payment webhook later).
grant select on public.entitlements to authenticated;
create policy entitlements_read_own on public.entitlements for select to authenticated using (user_id = auth.uid());

grant select, insert on public.drill_logs to authenticated;
create policy drill_logs_read_own on public.drill_logs for select to authenticated using (user_id = auth.uid());
create policy drill_logs_insert_own on public.drill_logs for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      not exists (select 1 from public.drills d where d.id = drill_id and d.is_pro)
      or exists (select 1 from public.entitlements e where e.user_id = auth.uid() and e.tier = 'pro')
    )
  );
-- No update or delete policy on drill_logs: a finished workout is immutable from the app.
