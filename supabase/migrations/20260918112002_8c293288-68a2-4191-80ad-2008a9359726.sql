alter table public.stories
  add column if not exists share_slug text unique,
  add column if not exists shared_at timestamptz;

create index if not exists stories_share_slug_idx on public.stories (share_slug) where share_slug is not null;