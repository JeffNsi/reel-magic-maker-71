create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  paid_coins integer not null default 0,
  bonus_coins integer not null default 20,
  is_vip boolean not null default false,
  vip_until timestamp with time zone,
  last_checkin_date date,
  checkin_streak integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

create policy "Users can read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "Users can update own profile" on public.profiles for update to authenticated using (id = auth.uid());


create table public.dramas (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  cover_url text not null,
  tags text[],
  is_vip_only boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

grant select on public.dramas to anon;
grant select on public.dramas to authenticated;
grant all on public.dramas to service_role;

alter table public.dramas enable row level security;

create policy "Dramas are publicly readable" on public.dramas for select to anon, authenticated using (true);


create table public.episodes (
  id uuid default gen_random_uuid() primary key,
  drama_id uuid references public.dramas(id) on delete cascade not null,
  episode_number integer not null,
  title text,
  video_url text not null,
  coin_cost integer not null default 20,
  is_free boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

grant select on public.episodes to anon;
grant select on public.episodes to authenticated;
grant all on public.episodes to service_role;

alter table public.episodes enable row level security;

create policy "Episodes are publicly readable" on public.episodes for select to anon, authenticated using (true);


create table public.user_unlocked_episodes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  episode_id uuid references public.episodes(id) on delete cascade not null,
  unlocked_at timestamp with time zone not null default now(),
  unique(user_id, episode_id)
);

grant select, insert on public.user_unlocked_episodes to authenticated;
grant all on public.user_unlocked_episodes to service_role;

alter table public.user_unlocked_episodes enable row level security;

create policy "Users read own unlocks" on public.user_unlocked_episodes for select to authenticated using (user_id = auth.uid());
create policy "Users create own unlocks" on public.user_unlocked_episodes for insert to authenticated with check (user_id = auth.uid());


create table public.my_list (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  drama_id uuid references public.dramas(id) on delete cascade not null,
  created_at timestamp with time zone not null default now(),
  unique(user_id, drama_id)
);

grant select, insert, delete on public.my_list to authenticated;
grant all on public.my_list to service_role;

alter table public.my_list enable row level security;

create policy "Users manage own list" on public.my_list for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());


create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();


create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger dramas_updated_at before update on public.dramas for each row execute function public.set_updated_at();
create trigger episodes_updated_at before update on public.episodes for each row execute function public.set_updated_at();


insert into public.dramas (title, description, cover_url, tags, is_vip_only) values
('Revenge in Heels', 'A betrayed heiress returns to reclaim her empire, one scandal at a time.', 'https://images.unsplash.com/photo-1518834107812-67b0b7c58411?w=600&h=900&fit=crop', ARRAY['Revenge','Billionaire','Forbidden'], false),
('The CEO''s Secret Bride', 'She married him for convenience, but his dark past refuses to stay buried.', 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=600&h=900&fit=crop', ARRAY['Romance','CEO','Secret'], true);


insert into public.episodes (drama_id, episode_number, title, video_url, coin_cost, is_free) values
((select id from public.dramas where title = 'Revenge in Heels'), 1, 'The Fall', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 0, true),
((select id from public.dramas where title = 'Revenge in Heels'), 2, 'The Comeback', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', 20, false),
((select id from public.dramas where title = 'Revenge in Heels'), 3, 'The Reckoning', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', 20, false),
((select id from public.dramas where title = 'The CEO''s Secret Bride'), 1, 'The Contract', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', 0, true),
((select id from public.dramas where title = 'The CEO''s Secret Bride'), 2, 'The Lie', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', 20, false),
((select id from public.dramas where title = 'The CEO''s Secret Bride'), 3, 'The Truth', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerSurprises.mp4', 20, false);
