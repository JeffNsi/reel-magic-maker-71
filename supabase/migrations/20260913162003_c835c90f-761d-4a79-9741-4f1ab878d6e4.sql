CREATE TABLE IF NOT EXISTS public.stories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL,
  theme text NOT NULL DEFAULT '',
  style text NOT NULL DEFAULT 'cinematic',
  title text NOT NULL DEFAULT '',
  logline text NOT NULL DEFAULT '',
  characters jsonb NOT NULL DEFAULT '[]'::jsonb,
  setting text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.story_scenes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  scene_number integer NOT NULL,
  title text NOT NULL DEFAULT '',
  idea text NOT NULL DEFAULT '',
  narration text NOT NULL DEFAULT '',
  generation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, scene_number)
);

CREATE INDEX IF NOT EXISTS stories_session_idx ON public.stories(session_id);
CREATE INDEX IF NOT EXISTS story_scenes_story_idx ON public.story_scenes(story_id);

ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS story_id uuid;
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS scene_number integer;
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS voiceover_url text;
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS narration text;
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS music_track text;

GRANT ALL ON public.stories TO service_role;
GRANT ALL ON public.story_scenes TO service_role;

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_scenes ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS stories_set_updated_at ON public.stories;
CREATE TRIGGER stories_set_updated_at BEFORE UPDATE ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS story_scenes_set_updated_at ON public.story_scenes;
CREATE TRIGGER story_scenes_set_updated_at BEFORE UPDATE ON public.story_scenes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();