-- Stand-in for the Lovable Cloud (Supabase) objects that migrations 0011 and
-- 0012 touch, mirroring the live catalog checked on 2026-11-06:
--   * roles and Supabase's default privileges (anon and authenticated get ALL
--     on new tables and functions unless revoked),
--   * auth.users, auth.uid() and the SECURITY DEFINER handle_new_user trigger,
--   * profiles, dramas, episodes and user_unlocked_episodes with the live
--     columns, keys, RLS policies and grants, including the earlier
--     column-level REVOKE on profiles exactly as it was applied.
-- spend_coins / refund_coins come from the real migration 0002.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- profiles (supabase/migrations/20260913160028 + later column changes)
CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  paid_coins integer NOT NULL DEFAULT 0,
  bonus_coins integer NOT NULL DEFAULT 210,
  is_vip boolean NOT NULL DEFAULT false,
  vip_until timestamptz,
  last_checkin_date date,
  checkin_streak integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- supabase/migrations/20260913174634, as applied (no effect on its own):
REVOKE UPDATE (paid_coins, bonus_coins, is_vip, vip_until) ON public.profiles FROM authenticated;

CREATE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- dramas / episodes / unlocks
CREATE TABLE public.dramas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  cover_url text NOT NULL,
  tags text[],
  is_vip_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dramas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dramas are publicly readable" ON public.dramas
  FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.generations (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY);

CREATE TABLE public.episodes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  drama_id uuid NOT NULL REFERENCES public.dramas(id) ON DELETE CASCADE,
  episode_number integer NOT NULL,
  title text,
  video_url text,
  coin_cost integer NOT NULL DEFAULT 20,
  is_free boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  storage_path text,
  source_generation_id uuid REFERENCES public.generations(id) ON DELETE SET NULL
);
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;
REVOKE SELECT ON public.episodes FROM anon, authenticated;
CREATE POLICY "Anonymous cannot read episodes" ON public.episodes FOR SELECT TO anon USING (false);
CREATE POLICY "Authenticated cannot read episodes" ON public.episodes
  FOR SELECT TO authenticated USING (false);

CREATE TABLE public.user_unlocked_episodes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, episode_id)
);
ALTER TABLE public.user_unlocked_episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own unlocks" ON public.user_unlocked_episodes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users create own unlocks" ON public.user_unlocked_episodes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
