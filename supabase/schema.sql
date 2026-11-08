-- Gift Planner schema for Supabase
-- Run this in the Supabase SQL editor, then create a private storage bucket named gifts-media.

create extension if not exists pgcrypto;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  event_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  title text not null,
  notes text,
  source_type text not null check (source_type in ('text', 'link', 'image')),
  source_url text,
  image_path text,
  price numeric(10, 2),
  status text not null default 'idea' check (status in ('idea', 'gifted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists gifts_set_updated_at on public.gifts;
create trigger gifts_set_updated_at
before update on public.gifts
for each row
execute function public.set_updated_at();

alter table public.people enable row level security;
alter table public.events enable row level security;
alter table public.gifts enable row level security;

create policy "people_select_own" on public.people
for select using (auth.uid() = user_id);
create policy "people_insert_own" on public.people
for insert with check (auth.uid() = user_id);
create policy "people_update_own" on public.people
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "people_delete_own" on public.people
for delete using (auth.uid() = user_id);

create policy "events_select_own" on public.events
for select using (auth.uid() = user_id);
create policy "events_insert_own" on public.events
for insert with check (auth.uid() = user_id);
create policy "events_update_own" on public.events
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "events_delete_own" on public.events
for delete using (auth.uid() = user_id);

create policy "gifts_select_own" on public.gifts
for select using (auth.uid() = user_id);
create policy "gifts_insert_own" on public.gifts
for insert with check (auth.uid() = user_id);
create policy "gifts_update_own" on public.gifts
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "gifts_delete_own" on public.gifts
for delete using (auth.uid() = user_id);

-- Storage policies for private bucket: gifts-media
-- Create bucket first:
-- insert into storage.buckets (id, name, public) values ('gifts-media', 'gifts-media', false);

create policy "media_select_own" on storage.objects
for select
using (bucket_id = 'gifts-media' and auth.uid()::text = split_part(name, '/', 1));

create policy "media_insert_own" on storage.objects
for insert
with check (bucket_id = 'gifts-media' and auth.uid()::text = split_part(name, '/', 1));

create policy "media_update_own" on storage.objects
for update
using (bucket_id = 'gifts-media' and auth.uid()::text = split_part(name, '/', 1))
with check (bucket_id = 'gifts-media' and auth.uid()::text = split_part(name, '/', 1));

create policy "media_delete_own" on storage.objects
for delete
using (bucket_id = 'gifts-media' and auth.uid()::text = split_part(name, '/', 1));
