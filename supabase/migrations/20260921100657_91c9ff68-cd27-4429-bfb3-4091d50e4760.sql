CREATE TABLE public.generation_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  batch_index integer NOT NULL DEFAULT 0,
  surface text NOT NULL,
  model text NOT NULL,
  model_label text NOT NULL,
  prompt text NOT NULL DEFAULT '',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  media jsonb NOT NULL DEFAULT '{}'::jsonb,
  aspect_ratio text NOT NULL DEFAULT '9:16',
  request_id text,
  status text NOT NULL DEFAULT 'queued',
  queue_position integer,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  video_url text,
  error_message text,
  error_category text,
  favourite boolean NOT NULL DEFAULT false,
  deadline_at timestamp with time zone NOT NULL DEFAULT now() + interval '10 minutes',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generation_runs TO authenticated;
GRANT ALL ON public.generation_runs TO service_role;

ALTER TABLE public.generation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their own runs"
  ON public.generation_runs FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX generation_runs_user_created_idx ON public.generation_runs (user_id, created_at DESC);
CREATE INDEX generation_runs_open_idx ON public.generation_runs (user_id, status) WHERE status IN ('queued', 'processing');

CREATE TRIGGER generation_runs_set_updated_at
  BEFORE UPDATE ON public.generation_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();