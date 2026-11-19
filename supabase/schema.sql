-- =====================================================================
-- Personal Finance App — Supabase schema (safe to re-run)
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. users — profile row linked 1:1 to auth.users
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  name        text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. categories
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references public.users (id) on delete cascade,
  name     text not null check (char_length(name) between 1 and 50),
  type     text not null check (type in ('income', 'expense')),
  constraint categories_user_name_type_key unique (user_id, name, type),
  -- Lets transactions reference (id, user_id) so a user can't attach someone else's category.
  constraint categories_id_user_key unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- 3. transactions
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  category_id  uuid,
  amount       numeric(14, 2) not null check (amount > 0),
  type         text not null check (type in ('income', 'expense')),
  date         date not null default current_date,
  description  text check (description is null or char_length(description) <= 200),
  created_at   timestamptz not null default now(),
  -- Category must belong to the same user. Deleting the category only clears category_id.
  constraint transactions_category_fkey
    foreign key (category_id, user_id)
    references public.categories (id, user_id)
    on delete set null (category_id)
);

-- Main dashboard / monthly query: WHERE user_id = ? AND date BETWEEN ? ORDER BY date DESC
-- (A btree index can be scanned in both directions, so it also serves ORDER BY date DESC.)
drop index if exists public.transactions_user_date_idx;  -- old name used by an earlier version of this script
create index if not exists idx_transactions_user_date on public.transactions (user_id, date);
-- Supports the FK and lookups by category.
create index if not exists transactions_category_idx on public.transactions (category_id);

-- Transaction type must match its category type (an "expense" can't use the "Salary" category).
create or replace function public.check_transaction_category_type()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cat_type text;
begin
  if new.category_id is not null then
    select type into cat_type from public.categories where id = new.category_id;
    if cat_type is null then
      raise exception 'Category not found' using errcode = '23503';
    elsif cat_type <> new.type then
      raise exception 'Category type (%) does not match transaction type (%)', cat_type, new.type
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_category_type_check on public.transactions;
create trigger transactions_category_type_check
  before insert or update of category_id, type on public.transactions
  for each row execute function public.check_transaction_category_type();

-- ---------------------------------------------------------------------
-- 4. ai_insights — written ONLY by the Edge Function (service role)
-- ---------------------------------------------------------------------
create table if not exists public.ai_insights (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  period          text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),  -- 'YYYY-MM'
  spending_score  int  not null check (spending_score between 1 and 100),
  suggestions     jsonb not null,  -- { "analysis": "...", "tips": ["...", "...", "..."] }
  created_at      timestamptz not null default now()
);

create index if not exists ai_insights_user_period_idx
  on public.ai_insights (user_id, period, created_at desc);

-- ---------------------------------------------------------------------
-- 5. ai_requests — rate-limit log for the AI Edge Function.
--    Users can only read it, so they can't delete rows to get past the limit.
-- ---------------------------------------------------------------------
create table if not exists public.ai_requests (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.users (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  created_at  timestamptz not null default now()
);

create index if not exists ai_requests_user_created_idx on public.ai_requests (user_id, created_at desc);

-- Atomically checks the limits and, if allowed, records a new request.
--   * cooldown: at least p_cooldown_seconds since the user's last request (any status)
--   * daily cap: at most p_daily_limit non-failed requests in the last 24 hours
-- Returns: allowed, reason ('ok' | 'cooldown' | 'daily_limit'), retry_after (seconds), request_id
create or replace function public.claim_ai_request(
  p_user_id uuid,
  p_cooldown_seconds int default 60,
  p_daily_limit int default 10
)
returns table (allowed boolean, reason text, retry_after int, request_id bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  last_at     timestamptz;
  used_today  int;
  oldest_at   timestamptz;
  new_id      bigint;
begin
  -- Serialize concurrent calls for the same user (e.g. double-tap) so both can't pass the check.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select max(r.created_at) into last_at
  from ai_requests r where r.user_id = p_user_id;

  if last_at is not null and last_at > now() - make_interval(secs => p_cooldown_seconds) then
    return query select false, 'cooldown'::text,
      greatest(1, ceil(extract(epoch from (last_at + make_interval(secs => p_cooldown_seconds) - now())))::int),
      null::bigint;
    return;
  end if;

  select count(*), min(r.created_at) into used_today, oldest_at
  from ai_requests r
  where r.user_id = p_user_id and r.status <> 'failed' and r.created_at > now() - interval '24 hours';

  if used_today >= p_daily_limit then
    return query select false, 'daily_limit'::text,
      greatest(1, ceil(extract(epoch from (oldest_at + interval '24 hours' - now())))::int),
      null::bigint;
    return;
  end if;

  insert into ai_requests (user_id) values (p_user_id) returning id into new_id;
  return query select true, 'ok'::text, 0, new_id;
end;
$$;

-- Only the service role (the Edge Function) may call it.
revoke all on function public.claim_ai_request(uuid, int, int) from public, anon, authenticated;
grant execute on function public.claim_ai_request(uuid, int, int) to service_role;

-- =====================================================================
-- Row Level Security — each user sees only their own data
-- =====================================================================
alter table public.users        enable row level security;
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;
alter table public.ai_insights  enable row level security;
alter table public.ai_requests  enable row level security;

-- users: read + update own profile (rows are created by the signup trigger)
drop policy if exists "users: own row"    on public.users;
drop policy if exists "users: select own" on public.users;
drop policy if exists "users: update own" on public.users;
create policy "users: select own" on public.users
  for select to authenticated using ((select auth.uid()) = id);
create policy "users: update own" on public.users
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- categories: full CRUD on own rows
drop policy if exists "categories: own rows" on public.categories;
create policy "categories: own rows" on public.categories
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- transactions: full CRUD on own rows
drop policy if exists "transactions: own rows" on public.transactions;
create policy "transactions: own rows" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ai_insights: read-only for users (the service role bypasses RLS to insert)
drop policy if exists "ai_insights: own rows"   on public.ai_insights;
drop policy if exists "ai_insights: select own" on public.ai_insights;
create policy "ai_insights: select own" on public.ai_insights
  for select to authenticated using ((select auth.uid()) = user_id);

-- ai_requests: read-only for users
drop policy if exists "ai_requests: select own" on public.ai_requests;
create policy "ai_requests: select own" on public.ai_requests
  for select to authenticated using ((select auth.uid()) = user_id);

-- =====================================================================
-- Signup trigger: create profile + default categories
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.categories (user_id, name, type) values
    (new.id, 'Salary',        'income'),
    (new.id, 'Freelance',     'income'),
    (new.id, 'Bonus',         'income'),
    (new.id, 'Other Income',  'income'),
    (new.id, 'Food & Drinks', 'expense'),
    (new.id, 'Transport',     'expense'),
    (new.id, 'Bills',         'expense'),
    (new.id, 'Shopping',      'expense'),
    (new.id, 'Entertainment', 'expense'),
    (new.id, 'Health',        'expense'),
    (new.id, 'Education',     'expense'),
    (new.id, 'Other Expense', 'expense')
  on conflict (user_id, name, type) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
