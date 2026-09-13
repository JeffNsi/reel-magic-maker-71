CREATE TABLE public.films (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt text NOT NULL,
  style text NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'queued',
  job_id text,
  video_path text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.films TO anon;
GRANT SELECT, INSERT ON public.films TO authenticated;
GRANT ALL ON public.films TO service_role;

ALTER TABLE public.films ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view films" ON public.films FOR SELECT USING (true);
CREATE POLICY "Anyone can create films" ON public.films FOR INSERT WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER films_updated_at BEFORE UPDATE ON public.films
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();