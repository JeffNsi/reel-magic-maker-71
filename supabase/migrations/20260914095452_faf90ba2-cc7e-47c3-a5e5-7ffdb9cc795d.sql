ALTER TABLE public.director_sessions
  ADD COLUMN IF NOT EXISTS evolution jsonb,
  ADD COLUMN IF NOT EXISTS recommendation jsonb,
  ADD COLUMN IF NOT EXISTS breakthroughs jsonb NOT NULL DEFAULT '[]'::jsonb;