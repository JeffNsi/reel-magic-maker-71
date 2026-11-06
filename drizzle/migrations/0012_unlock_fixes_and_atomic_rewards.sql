-- Fixes to 0011 and atomic rewards.
--
-- 0011 is already applied live and is not edited; this migration replaces its
-- two functions forward-only. Idempotent: safe to run more than once, keeps
-- every row. Safe to apply before the matching app code is published: the
-- functions keep their names and signatures, the new function and table are
-- additive, and the stricter profile guard only affects browser roles, which
-- no current code path uses to create profiles.
--
--   1. Browser roles can never create a profile, so they cannot grant
--      themselves any starting balance — bonus coins included — even if an
--      INSERT privilege is ever restored. Sign-up keeps working: profiles are
--      created by handle_new_user(), which runs as its owner.
--   2. unlock_episode() checks VIP expiry against the wall clock taken after
--      the profile lock is acquired, not the transaction start time.
--   3. unlock_episode() rejects for insufficient coins only when the method is
--      coins and the cost is positive: free episodes and valid VIP access are
--      never blocked by a negative historical balance.
--   4. reward_events + claim_daily_checkin(): the daily reward is decided and
--      credited in one transaction with the profile row locked, a unique event
--      per user and UTC day (replay protection) and an atomic increment, so
--      concurrent requests cannot double-claim or overwrite other balance
--      changes. Service role only.

-- 1. Profiles: created by sign-up only -----------------------------------------
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
    RAISE EXCEPTION 'profiles are created by sign-up only'
      USING ERRCODE = '42501';
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

-- 2 + 3. unlock_episode(): wall-clock VIP expiry, balance check only for coins --
CREATE OR REPLACE FUNCTION public.unlock_episode(_user uuid, _episode uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prof record;
  ep record;
  checked_at timestamptz;
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

  -- Wall-clock time taken after the lock: a request that waited for the lock
  -- past the moment VIP ended must not still count as VIP.
  checked_at := clock_timestamp();

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

  vip_active := prof.is_vip AND (prof.vip_until IS NULL OR prof.vip_until > checked_at);

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

  -- Only a positive coin price can be refused for lack of coins.
  IF method = 'coins' AND cost > 0 AND prof.bonus_coins + prof.paid_coins < cost THEN
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

-- 4. reward_events: one row per credited reward ---------------------------------
-- event_id is unique per user and source. A daily check-in uses the UTC date.
-- There is deliberately no 'ad' source: ad rewards stay off until a provider
-- verifies each viewing server-side, and adding that source needs a migration.
CREATE TABLE IF NOT EXISTS public.reward_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source text NOT NULL,
  event_id text NOT NULL,
  bonus_coins integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reward_events_source_valid CHECK (source IN ('daily_checkin')),
  CONSTRAINT reward_events_event_id_valid CHECK (length(event_id) BETWEEN 1 AND 200),
  CONSTRAINT reward_events_amount_valid CHECK (bonus_coins >= 0),
  CONSTRAINT reward_events_once UNIQUE (user_id, source, event_id)
);
ALTER TABLE public.reward_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reward_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.reward_events TO service_role;

-- claim_daily_checkin(): the only way to claim the daily reward. _rewards is
-- the reward per streak day, passed by the server (one source of truth with the
-- rewards page). Returns a status instead of raising: claimed (with the reward
-- and the updated profile), already_claimed, profile_not_found or invalid.
-- Nothing changes unless the status is claimed.
CREATE OR REPLACE FUNCTION public.claim_daily_checkin(_user uuid, _rewards integer[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prof record;
  today date;
  streak integer;
  reward integer;
  event_row uuid;
  updated jsonb;
BEGIN
  IF _user IS NULL OR _rewards IS NULL OR cardinality(_rewards) = 0
     OR array_position(_rewards, NULL) IS NOT NULL
     OR EXISTS (SELECT 1 FROM unnest(_rewards) AS r(amount) WHERE r.amount < 0) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  -- Lock the profile: concurrent claims run one after another.
  SELECT p.id, p.last_checkin_date, p.checkin_streak
    INTO prof
    FROM public.profiles p
   WHERE p.id = _user
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'profile_not_found');
  END IF;

  -- The UTC day by the wall clock after the lock (as the app counts days).
  today := (clock_timestamp() AT TIME ZONE 'UTC')::date;

  IF prof.last_checkin_date = today THEN
    RETURN jsonb_build_object('status', 'already_claimed');
  END IF;

  -- Same streak rule as before: continue after yesterday, otherwise restart.
  streak := CASE
    WHEN prof.last_checkin_date = today - 1
      THEN greatest(1, least(cardinality(_rewards), prof.checkin_streak + 1))
    ELSE 1
  END;
  reward := _rewards[streak];

  INSERT INTO public.reward_events (user_id, source, event_id, bonus_coins)
  VALUES (_user, 'daily_checkin', today::text, reward)
  ON CONFLICT ON CONSTRAINT reward_events_once DO NOTHING
  RETURNING id INTO event_row;
  IF event_row IS NULL THEN
    RETURN jsonb_build_object('status', 'already_claimed');
  END IF;

  -- Atomic increment: never overwrites a concurrent purchase, charge or refund.
  UPDATE public.profiles p
     SET last_checkin_date = today,
         checkin_streak = streak,
         bonus_coins = p.bonus_coins + reward
   WHERE p.id = _user
  RETURNING to_jsonb(p) INTO updated;

  RETURN jsonb_build_object('status', 'claimed', 'reward', reward, 'profile', updated);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_checkin(uuid, integer[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_checkin(uuid, integer[]) TO service_role;
