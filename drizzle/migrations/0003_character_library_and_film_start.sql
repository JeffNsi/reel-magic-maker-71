CREATE TABLE public.characters (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 name text NOT NULL,
 description text NOT NULL DEFAULT '',
 traits jsonb NOT NULL DEFAULT '{}',
 reference_path text,
 idempotency_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id, idempotency_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO authenticated;
GRANT ALL ON public.characters TO service_role;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY characters_owner ON public.characters FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX characters_owner_name ON public.characters(user_id, lower(name));
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS character_id uuid REFERENCES public.characters(id) ON DELETE SET NULL;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS start_metadata jsonb;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS character_approved_at timestamptz;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS start_key uuid;
CREATE UNIQUE INDEX stories_owner_start_key ON public.stories(user_id, start_key) WHERE start_key IS NOT NULL;
CREATE OR REPLACE FUNCTION public.create_approved_character_film(_user uuid, _session uuid, _key uuid, _character uuid, _title text, _idea text, _setting text, _style text, _metadata jsonb, _scenes jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.characters; film uuid; canon_id text; item jsonb; pos integer := 0;
BEGIN
 SELECT id INTO film FROM public.stories WHERE user_id = _user AND start_key = _key;
 IF film IS NOT NULL THEN RETURN film; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_user::text || _key::text, 0));
 SELECT id INTO film FROM public.stories WHERE user_id = _user AND start_key = _key;
 IF film IS NOT NULL THEN RETURN film; END IF;
 SELECT * INTO c FROM public.characters WHERE id = _character AND user_id = _user;
 IF NOT FOUND THEN RAISE EXCEPTION 'Character not found'; END IF;
 IF jsonb_array_length(_scenes) NOT IN (5,12,20,40) THEN RAISE EXCEPTION 'Invalid scene count'; END IF;
 IF NOT public.claim_film_slot(_user) THEN RAISE EXCEPTION 'Daily film limit reached'; END IF;
 canon_id := 'CHAR_' || replace(c.id::text, '-', '_');
 INSERT INTO public.stories(session_id, user_id, theme, title, logline, setting, style, characters, blueprint, character_id, start_metadata, character_approved_at, start_key)
 VALUES(_session, _user, left(_idea,200), _title, _idea, _setting, _style, jsonb_build_array(jsonb_build_object('name',c.name,'look',c.description)), _idea, c.id, _metadata, now(), _key) RETURNING id INTO film;
 FOR item IN SELECT value FROM jsonb_array_elements(_scenes) LOOP
  pos := pos + 1;
  INSERT INTO public.story_scenes(story_id, scene_number, title, idea, narration, credit_cost, truth)
  VALUES(film, pos, item->>'title', item->>'idea', coalesce(item->>'narration',''), 14, item->'truth');
 END LOOP;
 INSERT INTO public.film_canon_characters(story_id, canonical_id, name, appearance, face, hair, skin, body, height, build, locks)
 VALUES(film, canon_id, c.name, c.description, coalesce(c.traits->>'face',''), coalesce(c.traits->>'hair',''), coalesce(c.traits->>'skin',''), coalesce(c.traits->>'body',''), coalesce(c.traits->>'height',''), coalesce(c.traits->>'build',''), '{"identity":true,"face":true,"hair":true,"skin":true,"body":true}');
 IF c.reference_path IS NOT NULL THEN
 INSERT INTO public.film_canon_assets(story_id,subject_type,subject_canonical_id,kind,storage_path,prompt,version)
 VALUES(film,'character',canon_id,'front',c.reference_path,'Creator uploaded reference',1);
 END IF;
 RETURN film;
END; $$;
REVOKE ALL ON FUNCTION public.create_approved_character_film(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_approved_character_film(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb) TO service_role;