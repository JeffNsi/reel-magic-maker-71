CREATE TABLE public.director_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  idea text NOT NULL,
  style text NOT NULL DEFAULT 'cinematic',
  status text NOT NULL DEFAULT 'interviewing',
  understanding text NOT NULL DEFAULT '',
  confidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  film_bible jsonb,
  blueprint text,
  question_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.director_sessions TO service_role;
ALTER TABLE public.director_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Director sessions are managed server-side only"
  ON public.director_sessions FOR SELECT TO authenticated, anon USING (false);

CREATE TABLE public.director_turns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  director_session_id uuid NOT NULL REFERENCES public.director_sessions(id) ON DELETE CASCADE,
  position integer NOT NULL,
  question text NOT NULL,
  dimension text NOT NULL DEFAULT '',
  answer text NOT NULL DEFAULT '',
  skipped boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX director_turns_session_position_idx
  ON public.director_turns (director_session_id, position);

GRANT ALL ON public.director_turns TO service_role;
ALTER TABLE public.director_turns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Director turns are managed server-side only"
  ON public.director_turns FOR SELECT TO authenticated, anon USING (false);

ALTER TABLE public.generations
  ADD COLUMN director_session_id uuid REFERENCES public.director_sessions(id) ON DELETE SET NULL;

CREATE TRIGGER set_director_sessions_updated_at
  BEFORE UPDATE ON public.director_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_director_turns_updated_at
  BEFORE UPDATE ON public.director_turns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();