-- Stop anonymous and authenticated users from reading the episodes table directly
REVOKE SELECT ON public.episodes FROM anon;
REVOKE SELECT ON public.episodes FROM authenticated;

-- Helper that returns true when the current session may watch the episode
CREATE OR REPLACE FUNCTION public.can_watch_episode(p_episode_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.episodes e
    WHERE e.id = p_episode_id
      AND (
        e.is_free = true
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.is_vip = true
            AND (p.vip_until IS NULL OR p.vip_until > now())
        )
        OR EXISTS (
          SELECT 1 FROM public.user_unlocked_episodes u
          WHERE u.episode_id = p_episode_id
            AND u.user_id = auth.uid()
        )
      )
  );
$$;

-- Public view: metadata for everyone, URLs only when access is allowed
CREATE OR REPLACE VIEW public.episodes_public AS
SELECT 
  e.id,
  e.drama_id,
  e.episode_number,
  e.title,
  e.coin_cost,
  e.is_free,
  e.created_at,
  e.updated_at,
  CASE WHEN public.can_watch_episode(e.id) THEN e.video_url ELSE NULL END AS video_url,
  CASE WHEN public.can_watch_episode(e.id) THEN e.storage_path ELSE NULL END AS storage_path
FROM public.episodes e;

-- Allow public metadata listing through the view
GRANT SELECT ON public.episodes_public TO anon, authenticated;
