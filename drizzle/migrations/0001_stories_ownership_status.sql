ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'queued';

UPDATE public.stories s SET user_id = d.user_id
FROM public.director_sessions d
WHERE s.director_session_id = d.id AND s.user_id IS NULL AND d.user_id IS NOT NULL;

UPDATE public.stories s SET status = CASE
  WHEN EXISTS (SELECT 1 FROM public.story_scenes sc WHERE sc.story_id = s.id)
   AND NOT EXISTS (
     SELECT 1 FROM public.story_scenes sc
     LEFT JOIN public.generations g ON g.id = sc.generation_id
     WHERE sc.story_id = s.id AND (g.id IS NULL OR g.status <> 'completed'))
  THEN 'ready'
  WHEN EXISTS (
     SELECT 1 FROM public.story_scenes sc
     JOIN public.generations g ON g.id = sc.generation_id
     WHERE sc.story_id = s.id AND g.status = 'failed')
  THEN 'failed'
  ELSE 'queued' END;

ALTER TABLE public.stories ADD CONSTRAINT stories_status_check
  CHECK (status IN ('queued','generating','ready','failed'));
CREATE INDEX IF NOT EXISTS stories_user_created_idx ON public.stories (user_id, created_at);

CREATE POLICY "Owners read their films" ON public.stories
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.film_daily_quota (
  user_id uuid NOT NULL,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
GRANT ALL ON public.film_daily_quota TO service_role;
ALTER TABLE public.film_daily_quota ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_film_slot(_user uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  INSERT INTO public.film_daily_quota (user_id, day, count)
  VALUES (_user, current_date, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET count = film_daily_quota.count + 1
  WHERE film_daily_quota.count < 3
  RETURNING true INTO ok;
  RETURN coalesce(ok, false);
END $$;

CREATE OR REPLACE FUNCTION public.release_film_slot(_user uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.film_daily_quota SET count = greatest(count - 1, 0)
  WHERE user_id = _user AND day = current_date;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_film_slot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_film_slot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_film_slot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_film_slot(uuid) TO service_role;