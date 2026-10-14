CREATE TABLE public.universe_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'applied',
  film_id uuid,
  film_title text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  fingerprint text NOT NULL DEFAULT '',
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version)
);
GRANT SELECT ON public.universe_versions TO authenticated;
GRANT ALL ON public.universe_versions TO service_role;
ALTER TABLE public.universe_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own universe" ON public.universe_versions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX universe_versions_user_idx ON public.universe_versions (user_id, version DESC);
ALTER TABLE public.director_sessions ADD COLUMN IF NOT EXISTS universe_carry jsonb;