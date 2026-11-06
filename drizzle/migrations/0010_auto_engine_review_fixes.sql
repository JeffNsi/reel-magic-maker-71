-- Shortizereel Auto Engine, step 1 review fixes (migration 0010).
--
-- Forward-only follow-up to 0009. 0009 is already applied to Lovable Cloud and
-- stays byte-for-byte unchanged; everything here builds on top of it.
-- Safe on the live database: it only adds columns, functions, triggers and
-- stricter rules to the three Auto Engine tables (empty when this was written)
-- and reads, never writes, any other table. Rules added as constraints are
-- checked by Postgres against existing rows, so a bad row can not survive it.
-- Idempotent: safe to run again, by hand and by the migrator.
-- F1–F11 refer to the eleven findings of the PR #1 review (Sourcery).

-- F1. Storage paths: one strict shape, no "." or ".." segments, every file
-- inside its own folder. Shared by the constraints below.
CREATE OR REPLACE FUNCTION public.auto_engine_is_safe_path(_path text, _root text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT _path IS NOT NULL
    AND _root IN ('exports', 'teasers')
    AND length(_path) <= 512
    AND _path ~ ('^' || _root || '(/[A-Za-z0-9_][A-Za-z0-9._-]{0,127})+/?$')
    AND position('..' IN _path) = 0
$$;

CREATE OR REPLACE FUNCTION public.auto_engine_is_export_file(_path text, _prefix text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT _path IS NULL
    OR (
      public.auto_engine_is_safe_path(_path, 'exports')
      AND right(_path, 1) <> '/'
      AND starts_with(_path, _prefix)
      AND length(_path) > length(_prefix)
    )
$$;

ALTER TABLE public.film_exports DROP CONSTRAINT IF EXISTS film_exports_paths_contained;
ALTER TABLE public.film_exports ADD CONSTRAINT film_exports_paths_contained CHECK (
  public.auto_engine_is_safe_path(storage_prefix, 'exports')
  AND right(storage_prefix, 1) = '/'
  AND video_vertical_path IS NOT NULL
  AND public.auto_engine_is_export_file(video_vertical_path, storage_prefix)
  AND public.auto_engine_is_export_file(video_landscape_path, storage_prefix)
  AND public.auto_engine_is_export_file(thumbnail_path, storage_prefix)
  AND public.auto_engine_is_export_file(subtitles_path, storage_prefix)
);

-- A teaser file lives in its export's own folder: teasers/<export_id>/…
ALTER TABLE public.teaser_candidates DROP CONSTRAINT IF EXISTS teaser_candidates_path_contained;
ALTER TABLE public.teaser_candidates ADD CONSTRAINT teaser_candidates_path_contained CHECK (
  storage_path IS NULL
  OR (
    public.auto_engine_is_safe_path(storage_path, 'teasers')
    AND right(storage_path, 1) <> '/'
    AND starts_with(storage_path, 'teasers/' || export_id::text || '/')
  )
);

-- F2. An episode is never tied to one film, so deleting a film can not take
-- an episode's job or export with it.
ALTER TABLE public.post_jobs DROP CONSTRAINT IF EXISTS post_jobs_subject_shape;
ALTER TABLE public.post_jobs ADD CONSTRAINT post_jobs_subject_shape CHECK (
  (subject_type = 'film' AND story_id IS NOT NULL AND drama_id IS NULL AND episode_number IS NULL)
  OR (subject_type = 'episode' AND story_id IS NULL AND drama_id IS NOT NULL AND episode_number IS NOT NULL)
);
ALTER TABLE public.film_exports DROP CONSTRAINT IF EXISTS film_exports_subject_shape;
ALTER TABLE public.film_exports ADD CONSTRAINT film_exports_subject_shape CHECK (
  (subject_type = 'film' AND story_id IS NOT NULL AND drama_id IS NULL AND episode_number IS NULL)
  OR (subject_type = 'episode' AND story_id IS NULL AND drama_id IS NOT NULL AND episode_number IS NOT NULL)
);

-- F4. The same cut (kind, subject, manifest and options) can only be live
-- once, whatever idempotency key the caller sends. jsonb stores options in a
-- canonical form, so key order does not create a "different" input.
ALTER TABLE public.post_jobs ADD COLUMN IF NOT EXISTS input_identity text
  GENERATED ALWAYS AS (
    kind || ':' || subject_type
      || ':' || coalesce(story_id::text, '-')
      || ':' || coalesce(drama_id::text, '-')
      || ':' || coalesce(episode_number::text, '-')
      || ':' || manifest_hash
      || ':' || md5(options::text)
  ) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS post_jobs_one_live_per_input
  ON public.post_jobs (input_identity)
  WHERE status IN ('queued', 'running', 'succeeded');

-- F5, F6, F7. One consistent read of everything a film's manifest needs: a
-- single SQL statement sees one snapshot, so a scene can not be relinked to a
-- new take between reading the scenes and reading the clips. It returns the
-- exact text spoken in each voice-over (narrateGeneration stores it in
-- generations.narration together with the audio) and the storage revision of
-- every clip and voice-over file, so a re-recorded voice changes the hash.
-- Server only: SECURITY DEFINER, executable by service_role alone.
CREATE OR REPLACE FUNCTION public.auto_engine_film_source(_story_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH story AS (
    SELECT s.id, s.title FROM public.stories s WHERE s.id = _story_id
  ), scenes AS (
    SELECT sc.id, sc.scene_number, sc.title, sc.narration, sc.generation_id
    FROM public.story_scenes sc
    WHERE sc.story_id = _story_id
  ), gens AS (
    SELECT g.id, g.story_id, g.status, g.video_url, g.voiceover_url, g.provider, g.narration, g.updated_at
    FROM public.generations g
    WHERE g.id IN (SELECT scenes.generation_id FROM scenes)
  )
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM story) THEN NULL ELSE jsonb_build_object(
    'story', (SELECT jsonb_build_object('id', story.id, 'title', story.title) FROM story),
    'scenes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', scenes.id,
        'scene_number', scenes.scene_number,
        'title', scenes.title,
        'narration', scenes.narration,
        'generation_id', scenes.generation_id
      ) ORDER BY scenes.scene_number, scenes.id)
      FROM scenes
    ), '[]'::jsonb),
    'generations', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id,
        'story_id', g.story_id,
        'status', g.status,
        'video_url', g.video_url,
        'voiceover_url', g.voiceover_url,
        'provider', g.provider,
        'spoken_text', CASE WHEN g.voiceover_url IS NULL THEN NULL ELSE g.narration END,
        'updated_at', g.updated_at,
        'clip_object', (
          SELECT jsonb_build_object(
            'version', o.version,
            'etag', o.metadata->>'eTag',
            'size', (o.metadata->>'size')::bigint,
            'updated_at', o.updated_at
          )
          FROM storage.objects o
          WHERE o.bucket_id = 'videos' AND o.name = g.video_url
            AND NOT coalesce(o.is_delete_marker, false)
          ORDER BY o.updated_at DESC NULLS LAST
          LIMIT 1
        ),
        'voice_object', (
          SELECT jsonb_build_object(
            'version', o.version,
            'etag', o.metadata->>'eTag',
            'size', (o.metadata->>'size')::bigint,
            'updated_at', o.updated_at
          )
          FROM storage.objects o
          WHERE o.bucket_id = 'videos' AND o.name = g.voiceover_url
            AND NOT coalesce(o.is_delete_marker, false)
          ORDER BY o.updated_at DESC NULLS LAST
          LIMIT 1
        )
      ) ORDER BY g.id)
      FROM gens g
    ), '[]'::jsonb)
  ) END
$$;

-- F8, F9. Film exports: content is immutable once recorded (a new render is a
-- new version), an approval is bound to the exact file and manifest it covers,
-- and the approver is required, must be an admin, and is kept even if that
-- account is later deleted (no foreign key that could erase it).
ALTER TABLE public.film_exports DROP CONSTRAINT IF EXISTS film_exports_approved_by_fkey;
ALTER TABLE public.film_exports ADD COLUMN IF NOT EXISTS approved_by_label text NULL;
ALTER TABLE public.film_exports ADD COLUMN IF NOT EXISTS approved_sha256 text NULL;
ALTER TABLE public.film_exports ADD COLUMN IF NOT EXISTS approved_manifest_hash text NULL;
ALTER TABLE public.film_exports DROP CONSTRAINT IF EXISTS film_exports_approval_bound;
ALTER TABLE public.film_exports ADD CONSTRAINT film_exports_approval_bound CHECK (
  status <> 'approved'
  OR (
    approved_at IS NOT NULL
    AND approved_by IS NOT NULL
    AND approved_sha256 = sha256
    AND approved_manifest_hash = manifest_hash
  )
);

CREATE OR REPLACE FUNCTION public.auto_engine_guard_film_export()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(
      NEW.subject_type, NEW.story_id, NEW.drama_id, NEW.episode_number, NEW.version,
      NEW.manifest, NEW.manifest_hash, NEW.storage_bucket, NEW.storage_prefix,
      NEW.video_vertical_path, NEW.video_landscape_path, NEW.thumbnail_path, NEW.subtitles_path,
      NEW.duration_ms, NEW.size_bytes, NEW.sha256,
      NEW.has_voice, NEW.has_music, NEW.has_subtitles, NEW.created_at
    ) IS DISTINCT FROM ROW(
      OLD.subject_type, OLD.story_id, OLD.drama_id, OLD.episode_number, OLD.version,
      OLD.manifest, OLD.manifest_hash, OLD.storage_bucket, OLD.storage_prefix,
      OLD.video_vertical_path, OLD.video_landscape_path, OLD.thumbnail_path, OLD.subtitles_path,
      OLD.duration_ms, OLD.size_bytes, OLD.sha256,
      OLD.has_voice, OLD.has_music, OLD.has_subtitles, OLD.created_at
    ) THEN
    RAISE EXCEPTION 'A film export is immutable; record a new version instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status <> 'approved') THEN
    IF NEW.approved_by IS NULL OR NOT public.has_role(NEW.approved_by, 'admin'::public.app_role) THEN
      RAISE EXCEPTION 'Only an admin can approve a film export.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF ROW(NEW.approved_at, NEW.approved_by, NEW.approved_by_label, NEW.approved_sha256, NEW.approved_manifest_hash)
       IS DISTINCT FROM ROW(NULL::timestamptz, NULL::uuid, NULL::text, NULL::text, NULL::text) THEN
      RAISE EXCEPTION 'Approval details are only recorded together with an approval.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF ROW(NEW.approved_at, NEW.approved_by, NEW.approved_by_label, NEW.approved_sha256, NEW.approved_manifest_hash)
        IS DISTINCT FROM ROW(OLD.approved_at, OLD.approved_by, OLD.approved_by_label, OLD.approved_sha256, OLD.approved_manifest_hash) THEN
    RAISE EXCEPTION 'A recorded approval can not be rewritten; approve again instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS film_exports_guard ON public.film_exports;
CREATE TRIGGER film_exports_guard BEFORE INSERT OR UPDATE ON public.film_exports
  FOR EACH ROW EXECUTE FUNCTION public.auto_engine_guard_film_export();

-- F8, F9, F10. Teaser candidates: every change to what a teaser shows or says
-- is a new content revision. An approval, and a reveal approval, covers one
-- revision only, needs an admin approver who is kept even if the account is
-- deleted, and can not be rewritten for the same revision. The cut must lie
-- inside its export.
ALTER TABLE public.teaser_candidates DROP CONSTRAINT IF EXISTS teaser_candidates_reveal_approved_by_fkey;
ALTER TABLE public.teaser_candidates ADD COLUMN IF NOT EXISTS content_revision integer NOT NULL DEFAULT 1;
ALTER TABLE public.teaser_candidates ADD COLUMN IF NOT EXISTS approved_revision integer NULL;
ALTER TABLE public.teaser_candidates ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL;
ALTER TABLE public.teaser_candidates ADD COLUMN IF NOT EXISTS approved_by uuid NULL;
ALTER TABLE public.teaser_candidates ADD COLUMN IF NOT EXISTS approved_by_label text NULL;
ALTER TABLE public.teaser_candidates ADD COLUMN IF NOT EXISTS reveal_approved_revision integer NULL;
ALTER TABLE public.teaser_candidates ADD COLUMN IF NOT EXISTS reveal_approved_by_label text NULL;

ALTER TABLE public.teaser_candidates DROP CONSTRAINT IF EXISTS teaser_candidates_revision_positive;
ALTER TABLE public.teaser_candidates ADD CONSTRAINT teaser_candidates_revision_positive CHECK (content_revision > 0);
ALTER TABLE public.teaser_candidates DROP CONSTRAINT IF EXISTS teaser_candidates_approval_bound;
ALTER TABLE public.teaser_candidates ADD CONSTRAINT teaser_candidates_approval_bound CHECK (
  status NOT IN ('approved', 'rendering', 'rendered')
  OR (approved_at IS NOT NULL AND approved_by IS NOT NULL AND approved_revision = content_revision)
);
ALTER TABLE public.teaser_candidates DROP CONSTRAINT IF EXISTS teaser_candidates_reveal_bound;
ALTER TABLE public.teaser_candidates ADD CONSTRAINT teaser_candidates_reveal_bound CHECK (
  NOT includes_reveal
  OR status IN ('candidate', 'rejected')
  OR (
    reveal_approved_at IS NOT NULL
    AND reveal_approved_by IS NOT NULL
    AND reveal_approved_revision = content_revision
  )
);

CREATE OR REPLACE FUNCTION public.auto_engine_guard_teaser()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  export_ms integer;
BEGIN
  SELECT e.duration_ms INTO export_ms FROM public.film_exports e WHERE e.id = NEW.export_id;
  IF export_ms IS NULL THEN
    RAISE EXCEPTION 'The teaser''s export does not exist.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.end_ms > export_ms THEN
    RAISE EXCEPTION 'The teaser ends at % ms, after its export ends at % ms.', NEW.end_ms, export_ms
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.content_revision := 1;
  ELSIF ROW(
      NEW.export_id, NEW.kind, NEW.start_ms, NEW.end_ms, NEW.scene_numbers, NEW.includes_reveal,
      NEW.spoiler_risk, NEW.title, NEW.caption, NEW.hashtags
    ) IS DISTINCT FROM ROW(
      OLD.export_id, OLD.kind, OLD.start_ms, OLD.end_ms, OLD.scene_numbers, OLD.includes_reveal,
      OLD.spoiler_risk, OLD.title, OLD.caption, OLD.hashtags
    ) THEN
    NEW.content_revision := OLD.content_revision + 1;
  ELSE
    NEW.content_revision := OLD.content_revision;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.approved_revision IS NOT NULL
     AND NEW.approved_revision IS NOT DISTINCT FROM OLD.approved_revision
     AND ROW(NEW.approved_at, NEW.approved_by, NEW.approved_by_label)
         IS DISTINCT FROM ROW(OLD.approved_at, OLD.approved_by, OLD.approved_by_label) THEN
    RAISE EXCEPTION 'A recorded approval can not be rewritten; approve the new revision instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.reveal_approved_revision IS NOT NULL
     AND NEW.reveal_approved_revision IS NOT DISTINCT FROM OLD.reveal_approved_revision
     AND ROW(NEW.reveal_approved_at, NEW.reveal_approved_by, NEW.reveal_approved_by_label)
         IS DISTINCT FROM ROW(OLD.reveal_approved_at, OLD.reveal_approved_by, OLD.reveal_approved_by_label) THEN
    RAISE EXCEPTION 'A recorded reveal approval can not be rewritten; approve the new revision instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.approved_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR ROW(NEW.approved_at, NEW.approved_by, NEW.approved_revision)
          IS DISTINCT FROM ROW(OLD.approved_at, OLD.approved_by, OLD.approved_revision))
     AND (NEW.approved_by IS NULL OR NOT public.has_role(NEW.approved_by, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Only an admin can approve a teaser.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reveal_approved_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR ROW(NEW.reveal_approved_at, NEW.reveal_approved_by, NEW.reveal_approved_revision)
          IS DISTINCT FROM ROW(OLD.reveal_approved_at, OLD.reveal_approved_by, OLD.reveal_approved_revision))
     AND (NEW.reveal_approved_by IS NULL OR NOT public.has_role(NEW.reveal_approved_by, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Only an admin can approve showing the reveal.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teaser_candidates_guard ON public.teaser_candidates;
CREATE TRIGGER teaser_candidates_guard BEFORE INSERT OR UPDATE ON public.teaser_candidates
  FOR EACH ROW EXECUTE FUNCTION public.auto_engine_guard_teaser();

-- Access to the new functions: the server only. Browsers can not call them.
REVOKE ALL ON FUNCTION public.auto_engine_is_safe_path(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_engine_is_export_file(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_engine_film_source(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_engine_guard_film_export() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_engine_guard_teaser() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_engine_is_safe_path(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_engine_is_export_file(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_engine_film_source(uuid) TO service_role;
