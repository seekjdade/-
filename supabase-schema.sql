create extension if not exists pgcrypto;

create table if not exists public.eat_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  created_at timestamptz not null default now(),
  constraint eat_users_username_unique unique (username),
  constraint eat_users_username_len check (char_length(username) between 2 and 24)
);

create table if not exists public.eat_restaurants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.eat_users(id) on delete cascade,
  org text not null check (org in ('daily', 'team')),
  name text not null,
  food text not null default '',
  cuisine text not null default '',
  price numeric,
  signature text not null default '',
  attachment jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.eat_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.eat_users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eat_lists_name_len check (char_length(name) between 1 and 40)
);

alter table public.eat_restaurants
  add column if not exists list_id uuid references public.eat_lists(id) on delete set null;

create index if not exists eat_restaurants_user_org_idx
  on public.eat_restaurants(user_id, org, created_at desc);

create index if not exists eat_lists_user_idx
  on public.eat_lists(user_id, created_at asc);

create index if not exists eat_restaurants_user_list_idx
  on public.eat_restaurants(user_id, list_id, created_at desc);

create table if not exists public.eat_share_lists (
  id uuid primary key default gen_random_uuid(),
  share_code text not null unique,
  owner_user_id uuid not null references public.eat_users(id) on delete cascade,
  owner_username text not null,
  org text not null check (org in ('daily', 'team')),
  list_id uuid references public.eat_lists(id) on delete set null,
  list_name text not null default '',
  restaurants jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists eat_share_lists_owner_idx
  on public.eat_share_lists(owner_user_id, created_at desc);

create table if not exists public.eat_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.eat_users(id) on delete cascade,
  share_list_id uuid not null references public.eat_share_lists(id) on delete cascade,
  share_code text not null,
  created_at timestamptz not null default now(),
  constraint eat_collections_user_share_unique unique (user_id, share_list_id)
);

create index if not exists eat_collections_user_idx
  on public.eat_collections(user_id, created_at desc);

alter table public.eat_users enable row level security;
alter table public.eat_lists enable row level security;
alter table public.eat_restaurants enable row level security;
alter table public.eat_share_lists enable row level security;
alter table public.eat_collections enable row level security;

drop policy if exists "eat_users_anon_all" on public.eat_users;
drop policy if exists "eat_lists_anon_all" on public.eat_lists;
drop policy if exists "eat_restaurants_anon_all" on public.eat_restaurants;
drop policy if exists "eat_share_lists_anon_all" on public.eat_share_lists;
drop policy if exists "eat_collections_anon_all" on public.eat_collections;

create policy "eat_users_anon_all"
  on public.eat_users for all
  to anon
  using (true)
  with check (true);

create policy "eat_lists_anon_all"
  on public.eat_lists for all
  to anon
  using (true)
  with check (true);

create policy "eat_restaurants_anon_all"
  on public.eat_restaurants for all
  to anon
  using (true)
  with check (true);

create policy "eat_share_lists_anon_all"
  on public.eat_share_lists for all
  to anon
  using (true)
  with check (true);

create policy "eat_collections_anon_all"
  on public.eat_collections for all
  to anon
  using (true)
  with check (true);
