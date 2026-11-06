-- Shortizereel Auto Engine, step 1 (migration 0009): post-production jobs, film exports, teaser candidates.
--
-- Additive only: no existing table, column, function or policy is changed.
-- Idempotent: safe to run twice (applied by hand, then again by the migrator).
-- Access: admins read through has_role(); every write goes through the server
-- (service_role). Browsers can never insert, update or delete these rows.
-- A subject is either one film (story_id) or one episode of a series
-- (drama_id + episode_number) assembled from several films, so long episodes
-- use the same tables as 20-second shorts.

-- 1. Post-production jobs: the queue the render worker claims from.
CREATE TABLE IF NOT EXISTS public.post_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('assemble', 'teaser')),
  subject_type text NOT NULL CHECK (subject_type IN ('film', 'episode')),
  story_id uuid NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  drama_id uuid NULL REFERENCES public.dramas(id) ON DELETE CASCADE,
  episode_number integer NULL CHECK (episode_number IS NULL OR episode_number > 0),
  manifest jsonb NOT NULL,
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  stage text NULL,
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  locked_by text NULL,
  lease_until timestamptz NULL,
  heartbeat_at timestamptz NULL,
  deadline_at timestamptz NULL,
  error_code text NULL,
  error_message text NULL,
  result jsonb NULL,
  requested_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_jobs_subject_shape CHECK (
    (subject_type = 'film' AND story_id IS NOT NULL AND drama_id IS NULL AND episode_number IS NULL)
    OR (subject_type = 'episode' AND drama_id IS NOT NULL AND episode_number IS NOT NULL)
  ),
  CONSTRAINT post_jobs_attempts_within_limit CHECK (attempts <= max_attempts),
  CONSTRAINT post_jobs_success_is_complete CHECK (
    status <> 'succeeded' OR (progress = 100 AND result IS NOT NULL AND finished_at IS NOT NULL)
  ),
  CONSTRAINT post_jobs_failure_is_explained CHECK (status <> 'failed' OR error_message IS NOT NULL)
);

-- The same input can never be queued, running or done twice. A failed or
-- cancelled job frees its key, so a deliberate new attempt can start fresh.
CREATE UNIQUE INDEX IF NOT EXISTS post_jobs_one_live_per_key
  ON public.post_jobs (idempotency_key)
  WHERE status IN ('queued', 'running', 'succeeded');
CREATE INDEX IF NOT EXISTS post_jobs_queue ON public.post_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS post_jobs_story ON public.post_jobs (story_id, created_at DESC);

-- 2. Film exports: one row per verified, uploaded render. A row only exists
-- once the files are stored and measured, so a failed export leaves no row.
CREATE TABLE IF NOT EXISTS public.film_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NULL REFERENCES public.post_jobs(id) ON DELETE SET NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('film', 'episode')),
  story_id uuid NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  drama_id uuid NULL REFERENCES public.dramas(id) ON DELETE CASCADE,
  episode_number integer NULL CHECK (episode_number IS NULL OR episode_number > 0),
  version integer NOT NULL CHECK (version > 0),
  manifest jsonb NOT NULL,
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  storage_bucket text NOT NULL DEFAULT 'videos' CHECK (storage_bucket = 'videos'),
  storage_prefix text NOT NULL CHECK (storage_prefix LIKE 'exports/%'),
  video_vertical_path text NOT NULL CHECK (video_vertical_path LIKE 'exports/%'),
  video_landscape_path text NULL CHECK (video_landscape_path IS NULL OR video_landscape_path LIKE 'exports/%'),
  thumbnail_path text NULL CHECK (thumbnail_path IS NULL OR thumbnail_path LIKE 'exports/%'),
  subtitles_path text NULL CHECK (subtitles_path IS NULL OR subtitles_path LIKE 'exports/%'),
  duration_ms integer NOT NULL CHECK (duration_ms > 0),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  has_voice boolean NOT NULL DEFAULT false,
  has_music boolean NOT NULL DEFAULT false,
  has_subtitles boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'approved', 'rejected', 'superseded')),
  approved_at timestamptz NULL,
  approved_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT film_exports_subject_shape CHECK (
    (subject_type = 'film' AND story_id IS NOT NULL AND drama_id IS NULL AND episode_number IS NULL)
    OR (subject_type = 'episode' AND drama_id IS NOT NULL AND episode_number IS NOT NULL)
  ),
  CONSTRAINT film_exports_approval_recorded CHECK (status <> 'approved' OR approved_at IS NOT NULL),
  CONSTRAINT film_exports_subtitles_stored CHECK (NOT has_subtitles OR subtitles_path IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS film_exports_film_version
  ON public.film_exports (story_id, version) WHERE subject_type = 'film';
CREATE UNIQUE INDEX IF NOT EXISTS film_exports_episode_version
  ON public.film_exports (drama_id, episode_number, version) WHERE subject_type = 'episode';

-- 3. Teaser candidates: proposed cuts of an export. A cut that shows the
-- reveal can be proposed or rejected, but never approved or rendered without
-- an explicit, recorded reveal approval.
CREATE TABLE IF NOT EXISTS public.teaser_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id uuid NOT NULL REFERENCES public.film_exports(id) ON DELETE CASCADE,
  job_id uuid NULL REFERENCES public.post_jobs(id) ON DELETE SET NULL,
  kind text NOT NULL
    CHECK (kind IN ('hook', 'suspense', 'emotional', 'action', 'mystery', 'cliffhanger', 'custom')),
  start_ms integer NOT NULL CHECK (start_ms >= 0),
  end_ms integer NOT NULL,
  scene_numbers integer[] NOT NULL DEFAULT '{}',
  score numeric(5, 2) NULL,
  reason text NULL,
  spoiler_risk text NOT NULL DEFAULT 'none' CHECK (spoiler_risk IN ('none', 'low', 'high')),
  includes_reveal boolean NOT NULL DEFAULT false,
  reveal_approved_at timestamptz NULL,
  reveal_approved_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NULL,
  caption text NULL,
  hashtags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate', 'approved', 'rejected', 'rendering', 'rendered', 'failed')),
  storage_bucket text NOT NULL DEFAULT 'shorts' CHECK (storage_bucket = 'shorts'),
  storage_path text NULL CHECK (storage_path IS NULL OR storage_path LIKE 'teasers/%'),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teaser_candidates_range CHECK (end_ms > start_ms),
  CONSTRAINT teaser_candidates_reveal_gate CHECK (
    NOT includes_reveal OR status IN ('candidate', 'rejected') OR reveal_approved_at IS NOT NULL
  ),
  CONSTRAINT teaser_candidates_rendered_stored CHECK (status <> 'rendered' OR storage_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS teaser_candidates_export ON public.teaser_candidates (export_id, status);

-- 4. updated_at, through the project's existing helper (not redefined here).
DROP TRIGGER IF EXISTS post_jobs_set_updated_at ON public.post_jobs;
CREATE TRIGGER post_jobs_set_updated_at BEFORE UPDATE ON public.post_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS film_exports_set_updated_at ON public.film_exports;
CREATE TRIGGER film_exports_set_updated_at BEFORE UPDATE ON public.film_exports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS teaser_candidates_set_updated_at ON public.teaser_candidates;
CREATE TRIGGER teaser_candidates_set_updated_at BEFORE UPDATE ON public.teaser_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Access: admin read-only for signed-in users, nothing for anonymous
-- visitors, full access for the server.
REVOKE ALL ON public.post_jobs, public.film_exports, public.teaser_candidates FROM anon, authenticated;
GRANT SELECT ON public.post_jobs, public.film_exports, public.teaser_candidates TO authenticated;
GRANT ALL ON public.post_jobs, public.film_exports, public.teaser_candidates TO service_role;

ALTER TABLE public.post_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teaser_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read post jobs" ON public.post_jobs;
CREATE POLICY "Admins can read post jobs"
ON public.post_jobs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can read film exports" ON public.film_exports;
CREATE POLICY "Admins can read film exports"
ON public.film_exports FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can read teaser candidates" ON public.teaser_candidates;
CREATE POLICY "Admins can read teaser candidates"
ON public.teaser_candidates FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
