-- Exactly-once, atomic crediting of coin and VIP purchases.
--
-- Forward-only, idempotent and additive: keeps every row and changes no
-- balance. Safe to apply before the matching app code is published (the
-- currently published code writes coin_purchases and profiles as service role,
-- which this does not restrict). Number 0013 is reserved for the post-deploy
-- unlock lock (ops/post-deploy/server_only_unlock_inserts.sql).
--
-- credit_coin_purchase() records the purchase and credits the buyer in one
-- transaction, with the buyer's profile row locked:
--   * a confirmed payment credits the right amount exactly once per payment
--     reference — repeated confirmations or webhooks return already_credited;
--   * balances are incremented, so concurrent purchases, unlocks, check-ins or
--     generation charges are never overwritten;
--   * if anything fails, nothing is recorded: a purchase can never be stored
--     as paid without its coins, and a retry credits it;
--   * a VIP purchase extends from the current end date when that is later
--     than now, otherwise from now.

-- 1. coin_purchases: what each purchase credited -------------------------------
-- NULL on rows created before this migration (unknown).
ALTER TABLE public.coin_purchases
  ADD COLUMN IF NOT EXISTS credited_paid integer,
  ADD COLUMN IF NOT EXISTS credited_bonus integer,
  ADD COLUMN IF NOT EXISTS vip_until_after timestamptz;

-- Browsers keep reading their own purchases; only the server writes them.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.coin_purchases FROM anon, authenticated;

-- 2. credit_coin_purchase(): the only way to credit a purchase ----------------
-- The coin amounts and VIP days come from the server's pack table (one source
-- of truth with the shop). Returns a status instead of raising: credited (with
-- the new balance), already_credited, reference_conflict, not_creditable,
-- profile_not_found or invalid. Nothing changes unless the status is credited.
CREATE OR REPLACE FUNCTION public.credit_coin_purchase(
  _user uuid,
  _reference text,
  _provider text,
  _pack text,
  _amount numeric,
  _currency text,
  _environment text,
  _paid_coins integer,
  _bonus_coins integer,
  _vip_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prof record;
  existing record;
  has_row boolean;
  checked_at timestamptz;
  new_until timestamptz;
  balance_after record;
BEGIN
  IF _user IS NULL OR _reference IS NULL OR length(_reference) NOT BETWEEN 1 AND 500
     OR _provider IS NULL OR length(_provider) = 0
     OR _pack IS NULL OR length(_pack) = 0
     OR _amount IS NULL OR _amount < 0
     OR _currency IS NULL OR _environment IS NULL
     OR _paid_coins IS NULL OR _paid_coins < 0
     OR _bonus_coins IS NULL OR _bonus_coins < 0
     OR _vip_days IS NULL OR _vip_days < 0
     OR _paid_coins + _bonus_coins + _vip_days = 0 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  -- Lock the buyer's profile: this purchase, other purchases, unlocks and
  -- check-ins for the same user run one after another.
  SELECT p.id, p.is_vip, p.vip_until
    INTO prof
    FROM public.profiles p
   WHERE p.id = _user
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'profile_not_found');
  END IF;

  -- Exactly once per payment reference.
  SELECT c.user_id, c.status
    INTO existing
    FROM public.coin_purchases c
   WHERE c.reference = _reference
   FOR UPDATE;
  has_row := FOUND;
  IF has_row THEN
    IF existing.user_id <> _user THEN
      RETURN jsonb_build_object('status', 'reference_conflict');
    END IF;
    IF existing.status = 'paid' THEN
      RETURN jsonb_build_object('status', 'already_credited');
    END IF;
    IF existing.status <> 'pending' THEN
      RETURN jsonb_build_object('status', 'not_creditable');
    END IF;
  END IF;

  checked_at := clock_timestamp();
  IF _vip_days > 0 THEN
    IF prof.is_vip AND prof.vip_until IS NULL THEN
      new_until := NULL; -- VIP without an end date stays without an end date
    ELSE
      new_until := greatest(checked_at, coalesce(prof.vip_until, checked_at))
        + make_interval(days => _vip_days);
    END IF;
  END IF;

  IF has_row THEN
    -- A pending row created when the checkout started: settle it.
    UPDATE public.coin_purchases c
       SET status = 'paid', provider = _provider, pack = _pack, amount = _amount,
           currency = _currency, environment = _environment,
           credited_paid = _paid_coins, credited_bonus = _bonus_coins,
           vip_until_after = new_until, updated_at = checked_at
     WHERE c.reference = _reference;
  ELSE
    INSERT INTO public.coin_purchases
      (user_id, reference, provider, pack, amount, currency, status, environment,
       credited_paid, credited_bonus, vip_until_after, updated_at)
    VALUES
      (_user, _reference, _provider, _pack, _amount, _currency, 'paid', _environment,
       _paid_coins, _bonus_coins, new_until, checked_at);
  END IF;

  -- Increment, never overwrite.
  UPDATE public.profiles p
     SET paid_coins = p.paid_coins + _paid_coins,
         bonus_coins = p.bonus_coins + _bonus_coins,
         is_vip = CASE WHEN _vip_days > 0 THEN true ELSE p.is_vip END,
         vip_until = CASE WHEN _vip_days > 0 THEN new_until ELSE p.vip_until END
   WHERE p.id = _user
  RETURNING p.paid_coins, p.bonus_coins, p.is_vip, p.vip_until INTO balance_after;

  RETURN jsonb_build_object(
    'status', 'credited',
    'paid_coins', balance_after.paid_coins, 'bonus_coins', balance_after.bonus_coins,
    'is_vip', balance_after.is_vip, 'vip_until', balance_after.vip_until);
END;
$$;

REVOKE ALL ON FUNCTION public.credit_coin_purchase(uuid, text, text, text, numeric, text, text, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_coin_purchase(uuid, text, text, text, numeric, text, text, integer, integer, integer)
  TO service_role;
