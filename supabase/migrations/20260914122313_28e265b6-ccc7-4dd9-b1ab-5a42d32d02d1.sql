alter table public.stories
  add column if not exists director_session_id uuid,
  add column if not exists blueprint text;

alter table public.story_scenes
  add column if not exists credit_cost integer not null default 70,
  add column if not exists complexity integer,
  add column if not exists clarity_verdict text,
  add column if not exists clarity_note text,
  add column if not exists queued boolean not null default false,
  add column if not exists queue_position integer;

create table if not exists public.film_watchlist (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  story_id uuid not null references public.stories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, story_id)
);

grant select, insert, delete on public.film_watchlist to authenticated;
grant all on public.film_watchlist to service_role;

alter table public.film_watchlist enable row level security;