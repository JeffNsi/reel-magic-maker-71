-- Canonical film truth: editable, versioned, server-managed.

CREATE TABLE public.film_canon_characters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  canonical_id text NOT NULL,
  name text NOT NULL DEFAULT ''::text,
  age text NOT NULL DEFAULT ''::text,
  appearance text NOT NULL DEFAULT ''::text,
  face text NOT NULL DEFAULT ''::text,
  hair text NOT NULL DEFAULT ''::text,
  skin text NOT NULL DEFAULT ''::text,
  body text NOT NULL DEFAULT ''::text,
  height text NOT NULL DEFAULT ''::text,
  build text NOT NULL DEFAULT ''::text,
  personality text NOT NULL DEFAULT ''::text,
  expression_profile text NOT NULL DEFAULT ''::text,
  locks jsonb NOT NULL DEFAULT '{"identity":true,"face":true,"hair":true,"skin":true,"body":true,"wardrobe":false,"accessories":false}'::jsonb,
  continuity_constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (story_id, canonical_id)
);

CREATE TABLE public.film_canon_environments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  canonical_id text NOT NULL,
  name text NOT NULL DEFAULT ''::text,
  architecture text NOT NULL DEFAULT ''::text,
  layout text NOT NULL DEFAULT ''::text,
  furniture text NOT NULL DEFAULT ''::text,
  materials text NOT NULL DEFAULT ''::text,
  palette text NOT NULL DEFAULT ''::text,
  lighting text NOT NULL DEFAULT ''::text,
  props jsonb NOT NULL DEFAULT '[]'::jsonb,
  continuity_constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (story_id, canonical_id)
);

CREATE TABLE public.film_canon_wardrobe (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  canonical_id text NOT NULL,
  character_canonical_id text NOT NULL,
  description text NOT NULL DEFAULT ''::text,
  accessories text NOT NULL DEFAULT ''::text,
  from_scene integer,
  changed_in_scene integer,
  reason text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (story_id, canonical_id)
);

CREATE TABLE public.film_canon_props (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  canonical_id text NOT NULL,
  name text NOT NULL DEFAULT ''::text,
  appearance text NOT NULL DEFAULT ''::text,
  owner_canonical_id text,
  location text NOT NULL DEFAULT ''::text,
  state text NOT NULL DEFAULT ''::text,
  scene_number integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (story_id, canonical_id)
);

CREATE TABLE public.film_canon_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  subject_canonical_id text NOT NULL,
  kind text NOT NULL,
  storage_path text NOT NULL,
  prompt text NOT NULL DEFAULT ''::text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (story_id, subject_type, subject_canonical_id, kind, version)
);

CREATE TABLE public.film_canon_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  subject_canonical_id text NOT NULL,
  version integer NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX film_canon_characters_story_idx ON public.film_canon_characters(story_id);
CREATE INDEX film_canon_environments_story_idx ON public.film_canon_environments(story_id);
CREATE INDEX film_canon_wardrobe_story_idx ON public.film_canon_wardrobe(story_id);
CREATE INDEX film_canon_props_story_idx ON public.film_canon_props(story_id);
CREATE INDEX film_canon_assets_story_idx ON public.film_canon_assets(story_id);
CREATE INDEX film_canon_versions_story_idx ON public.film_canon_versions(story_id, subject_type, subject_canonical_id);

GRANT ALL ON public.film_canon_characters TO service_role;
GRANT ALL ON public.film_canon_environments TO service_role;
GRANT ALL ON public.film_canon_wardrobe TO service_role;
GRANT ALL ON public.film_canon_props TO service_role;
GRANT ALL ON public.film_canon_assets TO service_role;
GRANT ALL ON public.film_canon_versions TO service_role;

ALTER TABLE public.film_canon_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_canon_environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_canon_wardrobe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_canon_props ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_canon_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_canon_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Canon characters are managed server-side only" ON public.film_canon_characters FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "Canon environments are managed server-side only" ON public.film_canon_environments FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "Canon wardrobe is managed server-side only" ON public.film_canon_wardrobe FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "Canon props are managed server-side only" ON public.film_canon_props FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "Canon assets are managed server-side only" ON public.film_canon_assets FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "Canon versions are managed server-side only" ON public.film_canon_versions FOR SELECT TO anon, authenticated USING (false);

CREATE TRIGGER film_canon_characters_set_updated_at BEFORE UPDATE ON public.film_canon_characters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER film_canon_environments_set_updated_at BEFORE UPDATE ON public.film_canon_environments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER film_canon_wardrobe_set_updated_at BEFORE UPDATE ON public.film_canon_wardrobe FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER film_canon_props_set_updated_at BEFORE UPDATE ON public.film_canon_props FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER film_canon_assets_set_updated_at BEFORE UPDATE ON public.film_canon_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();