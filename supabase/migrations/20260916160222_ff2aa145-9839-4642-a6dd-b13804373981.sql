CREATE TABLE public.clip_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL REFERENCES public.story_scenes(id) ON DELETE CASCADE,
  buyer_email text,
  buyer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL,
  reference text,
  amount numeric NOT NULL DEFAULT 29,
  currency text NOT NULL DEFAULT 'SEK',
  status text NOT NULL DEFAULT 'pending',
  environment text NOT NULL DEFAULT 'sandbox',
  delivery_token text NOT NULL,
  paid_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX clip_purchases_reference_key ON public.clip_purchases (reference) WHERE reference IS NOT NULL;
CREATE INDEX clip_purchases_scene_idx ON public.clip_purchases (scene_id);

GRANT ALL ON public.clip_purchases TO service_role;

ALTER TABLE public.clip_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clip purchases are managed server-side only"
ON public.clip_purchases FOR SELECT TO authenticated, anon USING (false);

CREATE TRIGGER clip_purchases_set_updated_at
BEFORE UPDATE ON public.clip_purchases
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();