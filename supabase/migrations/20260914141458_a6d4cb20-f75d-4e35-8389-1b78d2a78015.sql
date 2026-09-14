ALTER TABLE public.story_scenes ADD COLUMN IF NOT EXISTS truth jsonb;
ALTER TABLE public.director_sessions ADD COLUMN IF NOT EXISTS creative_truth jsonb;