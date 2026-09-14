ALTER TABLE public.director_sessions
  ADD COLUMN IF NOT EXISTS film_model jsonb,
  ADD COLUMN IF NOT EXISTS breakthrough text;