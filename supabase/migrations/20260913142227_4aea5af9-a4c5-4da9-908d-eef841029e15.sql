CREATE TABLE public.generations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL,
  idea text NOT NULL,
  style text NOT NULL,
  prompt_final text,
  fal_request_id text,
  status text NOT NULL DEFAULT 'queued',
  video_url text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX generations_session_id_idx ON public.generations (session_id);

GRANT ALL ON public.generations TO service_role;

ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER generations_updated_at
BEFORE UPDATE ON public.generations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TABLE IF EXISTS public.video_generations;
DROP TABLE IF EXISTS public.films;