CREATE TABLE public.video_generations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt text NOT NULL,
  style text NOT NULL,
  aspect_ratio text NOT NULL DEFAULT '9:16',
  duration_seconds integer NOT NULL DEFAULT 5,
  provider text NOT NULL DEFAULT 'fal.ai',
  provider_task_id text,
  status text NOT NULL DEFAULT 'queued',
  video_url text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT, INSERT ON public.video_generations TO anon;
GRANT SELECT, INSERT ON public.video_generations TO authenticated;
GRANT ALL ON public.video_generations TO service_role;

ALTER TABLE public.video_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view generations" ON public.video_generations
FOR SELECT USING (true);

CREATE POLICY "Anyone can create generations" ON public.video_generations
FOR INSERT WITH CHECK (true);