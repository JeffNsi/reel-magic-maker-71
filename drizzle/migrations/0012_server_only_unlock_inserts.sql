-- Server-only episode unlocks — part 2 of 2.
--
-- Forward-only and idempotent. Apply ONLY after the app code that unlocks
-- through public.unlock_episode() (0011) is deployed: the previous code
-- inserted unlock rows with the signed-in user's own database session.
--
-- After this, browsers can still read their own unlocks, but every new unlock
-- goes through unlock_episode(), which checks free access, VIP entitlement or
-- coin payment in one transaction.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_unlocked_episodes FROM anon, authenticated;
DROP POLICY IF EXISTS "Users create own unlocks" ON public.user_unlocked_episodes;
