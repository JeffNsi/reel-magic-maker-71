ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coins_spent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS episode_id uuid;

ALTER TABLE public.episodes
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS source_generation_id uuid REFERENCES public.generations(id) ON DELETE SET NULL;

ALTER TABLE public.episodes ALTER COLUMN video_url DROP NOT NULL;

ALTER TABLE public.generations
  ADD CONSTRAINT generations_episode_id_fkey FOREIGN KEY (episode_id) REFERENCES public.episodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS generations_user_idx ON public.generations(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS episodes_source_generation_idx ON public.episodes(source_generation_id);