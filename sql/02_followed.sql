-- ══════════════════════════════════════════════════════════════
-- ENERGY SYSTEM — Partage de personnages entre membres
-- À coller dans : Supabase Dashboard > SQL Editor > New query
-- ══════════════════════════════════════════════════════════════

-- ── 1. Colonne share_code sur characters ──────────────────────

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS share_code TEXT UNIQUE;

UPDATE public.characters
  SET share_code = upper(substr(md5(random()::text), 1, 8))
  WHERE share_code IS NULL;

CREATE OR REPLACE FUNCTION public.generate_share_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  new_code TEXT;
  done BOOL := FALSE;
BEGIN
  WHILE NOT done LOOP
    new_code := upper(substr(md5(random()::text), 1, 8));
    done := TRUE;
    BEGIN
      NEW.share_code := new_code;
    EXCEPTION WHEN unique_violation THEN
      done := FALSE;
    END;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_share_code ON public.characters;
CREATE TRIGGER set_share_code
  BEFORE INSERT ON public.characters
  FOR EACH ROW
  WHEN (NEW.share_code IS NULL)
  EXECUTE FUNCTION public.generate_share_code();


-- ── 2. Table followed_characters ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.followed_characters (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  followed_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, character_id)
);

CREATE INDEX IF NOT EXISTS followed_user_idx
  ON public.followed_characters(user_id);


-- ── 3. RLS ────────────────────────────────────────────────────

ALTER TABLE public.followed_characters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "followed_select_own" ON public.followed_characters;
CREATE POLICY "followed_select_own"
  ON public.followed_characters FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "followed_insert_own" ON public.followed_characters;
CREATE POLICY "followed_insert_own"
  ON public.followed_characters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "followed_delete_own" ON public.followed_characters;
CREATE POLICY "followed_delete_own"
  ON public.followed_characters FOR DELETE
  USING (auth.uid() = user_id);
