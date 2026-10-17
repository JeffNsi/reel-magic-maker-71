CREATE UNIQUE INDEX generations_one_inflight_per_scene ON public.generations (story_id, scene_number) WHERE status IN ('queued','processing') AND story_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.refund_generation(_generation uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  claimed_count integer;
  credited_count integer;
BEGIN
  WITH claimed AS (
    UPDATE public.generations
       SET refunded = true
     WHERE id = _generation
       AND refunded = false
       AND charged_bonus + charged_paid > 0
       AND status = 'failed'
       AND video_url IS NULL
    RETURNING user_id, charged_bonus, charged_paid
  ), credited AS (
    UPDATE public.profiles p
       SET bonus_coins = p.bonus_coins + c.charged_bonus,
           paid_coins = p.paid_coins + c.charged_paid
      FROM claimed c
     WHERE p.id = c.user_id
    RETURNING p.id
  )
  SELECT (SELECT count(*) FROM claimed), (SELECT count(*) FROM credited)
    INTO claimed_count, credited_count;

  IF claimed_count <> credited_count THEN
    RAISE EXCEPTION 'Generation refund owner profile missing';
  END IF;
  RETURN credited_count = 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.refund_generation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_generation(uuid) TO service_role;