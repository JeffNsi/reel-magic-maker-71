-- Remove the view and its helper function
DROP VIEW IF EXISTS public.episodes_public;
DROP FUNCTION IF EXISTS public.can_watch_episode(uuid);

-- Remove the old wide-open policy
DROP POLICY IF EXISTS "Episodes are publicly readable" ON public.episodes;

-- Ensure service role has full access
GRANT ALL ON public.episodes TO service_role;

-- Explicitly deny anonymous/authenticated table reads (policies will enforce this once added)
REVOKE SELECT ON public.episodes FROM anon;
REVOKE SELECT ON public.episodes FROM authenticated;

-- Add restrictive policies for authenticated and anonymous users
CREATE POLICY "Authenticated cannot read episodes" ON public.episodes FOR SELECT TO authenticated USING (false);
CREATE POLICY "Anonymous cannot read episodes" ON public.episodes FOR SELECT TO anon USING (false);
