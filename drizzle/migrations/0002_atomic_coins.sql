CREATE OR REPLACE FUNCTION public.spend_coins(_user uuid, _cost int)
RETURNS TABLE(bonus_spent int, paid_spent int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH old AS (
    SELECT id, bonus_coins AS b
      FROM public.profiles
     WHERE id = _user AND _cost > 0 AND bonus_coins + paid_coins >= _cost
     FOR UPDATE
  )
  UPDATE public.profiles p
     SET bonus_coins = p.bonus_coins - least(old.b, _cost),
         paid_coins  = p.paid_coins  - (_cost - least(old.b, _cost))
    FROM old
   WHERE p.id = old.id
  RETURNING least(old.b, _cost)::int, (_cost - least(old.b, _cost))::int;
$$;

CREATE OR REPLACE FUNCTION public.refund_coins(_user uuid, _bonus int, _paid int)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles
     SET bonus_coins = bonus_coins + greatest(_bonus, 0),
         paid_coins  = paid_coins  + greatest(_paid, 0)
   WHERE id = _user;
$$;

REVOKE EXECUTE ON FUNCTION public.spend_coins(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_coins(uuid, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_coins(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_coins(uuid, int, int) TO service_role;

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charged_bonus int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charged_paid int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded boolean NOT NULL DEFAULT false;

ALTER TABLE public.episodes
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;