ALTER TABLE public.generation_runs
  ADD COLUMN IF NOT EXISTS story_id uuid REFERENCES public.stories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scene_id uuid REFERENCES public.story_scenes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS generation_runs_scene_idx ON public.generation_runs (scene_id, created_at DESC);