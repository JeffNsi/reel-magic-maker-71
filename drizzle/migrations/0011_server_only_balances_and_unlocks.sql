-- Server-only coin balances, VIP status and episode unlocks — part 1 of 2.
--
-- Forward-only and idempotent: safe to run more than once, keeps every row.
-- Part 1 is safe to apply while the current app code is live:
--   * profiles: only trusted server code may change balances or VIP status.
--   * unlock_episode(): one atomic, server-only transaction that checks free
--     access, VIP entitlement or coin payment before granting an unlock.
--   * user_unlocked_episodes: records what each new unlock cost.
-- Part 2 (0012) removes direct unlock inserts from browsers. It must be
-- applied only after the app code that calls unlock_episode() is deployed.

-- 1. profiles: no writes from browser roles ------------------------------------
-- A column-level REVOKE has no effect while the table-level privilege exists,
-- so the table-level write privileges themselves are removed. Reads stay.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Defence in depth: even if a write privilege is ever granted again, browser
-- roles cannot change coin balances or VIP status. Trusted code runs as
-- service_role, or as the owner inside a SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION public.guard_profile_entitlements()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.paid_coins <> 0 OR NEW.is_vip OR NEW.vip_until IS NOT NULL THEN
      RAISE EXCEPTION 'profile entitlements are server-managed'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.paid_coins IS DISTINCT FROM OLD.paid_coins
     OR NEW.bonus_coins IS DISTINCT FROM OLD.bonus_coins
     OR NEW.is_vip IS DISTINCT FROM OLD.is_vip
     OR NEW.vip_until IS DISTINCT FROM OLD.vip_until THEN
    RAISE EXCEPTION 'profile entitlements are server-managed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_entitlements ON public.profiles;
CREATE TRIGGER profiles_guard_entitlements
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_entitlements();

-- 2. user_unlocked_episodes: record what each unlock cost ------------------------
-- Existing rows keep their data; they get 0 / 0 / NULL (method unknown).
ALTER TABLE public.user_unlocked_episodes
  ADD COLUMN IF NOT EXISTS charged_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charged_paid integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unlock_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'user_unlocked_episodes_charge_valid'
       AND conrelid = 'public.user_unlocked_episodes'::regclass
  ) THEN
    ALTER TABLE public.user_unlocked_episodes
      ADD CONSTRAINT user_unlocked_episodes_charge_valid CHECK (
        charged_bonus >= 0
        AND charged_paid >= 0
        AND (unlock_method IS NULL OR unlock_method IN ('free', 'vip', 'coins'))
        AND (unlock_method IS NULL OR unlock_method = 'coins'
             OR charged_bonus + charged_paid = 0)
      );
  END IF;
END;
$$;

-- 3. unlock_episode(): the only way to grant an unlock --------------------------
-- Returns a status instead of raising, so nothing is changed unless the
-- status is 'unlocked'. Statuses: unlocked, already_unlocked, not_enough_coins,
-- vip_only, episode_not_found, episode_unavailable, profile_not_found, invalid.
CREATE OR REPLACE FUNCTION public.unlock_episode(_user uuid, _episode uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prof record;
  ep record;
  vip_active boolean;
  method text;
  cost integer;
  take_bonus integer;
  take_paid integer;
BEGIN
  IF _user IS NULL OR _episode IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  -- Lock the buyer's profile: concurrent or repeated requests from the same
  -- user run one after another, so a double click can never charge twice.
  SELECT p.id, p.paid_coins, p.bonus_coins, p.is_vip, p.vip_until
    INTO prof
    FROM public.profiles p
   WHERE p.id = _user
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'profile_not_found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_unlocked_episodes u
     WHERE u.user_id = _user AND u.episode_id = _episode
  ) THEN
    RETURN jsonb_build_object(
      'status', 'already_unlocked',
      'charged_bonus', 0, 'charged_paid', 0,
      'paid_coins', prof.paid_coins, 'bonus_coins', prof.bonus_coins);
  END IF;

  SELECT e.id, e.is_free, e.coin_cost, e.hidden, d.is_vip_only
    INTO ep
    FROM public.episodes e
    JOIN public.dramas d ON d.id = e.drama_id
   WHERE e.id = _episode;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'episode_not_found');
  END IF;

  -- A hidden episode is out of the catalogue: nobody can pay for something
  -- they cannot see. Existing unlocks are untouched.
  IF ep.hidden THEN
    RETURN jsonb_build_object(
      'status', 'episode_unavailable',
      'paid_coins', prof.paid_coins, 'bonus_coins', prof.bonus_coins);
  END IF;

  vip_active := prof.is_vip AND (prof.vip_until IS NULL OR prof.vip_until > now());

  -- Same order of rules as before: free first, then VIP, then VIP-only
  -- series are refused, then coins.
  IF ep.is_free THEN
    method := 'free';
  ELSIF vip_active THEN
    method := 'vip';
  ELSIF ep.is_vip_only THEN
    RETURN jsonb_build_object(
      'status', 'vip_only',
      'paid_coins', prof.paid_coins, 'bonus_coins', prof.bonus_coins);
  ELSE
    method := 'coins';
  END IF;

  cost := CASE WHEN method = 'coins' THEN greatest(ep.coin_cost, 0) ELSE 0 END;
  IF prof.bonus_coins + prof.paid_coins < cost THEN
    RETURN jsonb_build_object(
      'status', 'not_enough_coins', 'cost', cost,
      'paid_coins', prof.paid_coins, 'bonus_coins', prof.bonus_coins);
  END IF;

  -- Bonus coins are spent first, then paid coins (as spend_coins does).
  take_bonus := least(greatest(prof.bonus_coins, 0), cost);
  take_paid := cost - take_bonus;

  -- The unique (user_id, episode_id) key is the last line of defence: a
  -- duplicate raises here and rolls back the whole transaction, charge included.
  INSERT INTO public.user_unlocked_episodes
    (user_id, episode_id, charged_bonus, charged_paid, unlock_method)
  VALUES (_user, _episode, take_bonus, take_paid, method);

  IF cost > 0 THEN
    UPDATE public.profiles
       SET bonus_coins = bonus_coins - take_bonus,
           paid_coins = paid_coins - take_paid
     WHERE id = _user;
  END IF;

  RETURN jsonb_build_object(
    'status', 'unlocked', 'method', method,
    'charged_bonus', take_bonus, 'charged_paid', take_paid,
    'paid_coins', prof.paid_coins - take_paid,
    'bonus_coins', prof.bonus_coins - take_bonus);
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_episode(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_episode(uuid, uuid) TO service_role;
