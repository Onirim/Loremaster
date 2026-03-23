-- ══════════════════════════════════════════════════════════════
-- ENERGY SYSTEM — Correction RLS profils + sync Discord
-- ══════════════════════════════════════════════════════════════

-- ── 1. Corrige les politiques RLS sur profiles ────────────────

DROP POLICY IF EXISTS "profiles_select_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_upsert_own"  ON public.profiles;

-- Lecture : son propre profil uniquement
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Lecture publique du username (pour l'affichage dans les partages)
CREATE POLICY "profiles_select_public" ON public.profiles
  FOR SELECT USING (true);

-- Insert : uniquement son propre profil
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Update : uniquement son propre profil
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);


-- ── 2. Met à jour les profils existants ───────────────────────

UPDATE public.profiles p
SET username = COALESCE(
  u.raw_user_meta_data->>'full_name',
  u.raw_user_meta_data->>'name',
  u.raw_user_meta_data->>'username',
  split_part(u.email, '@', 1)
)
FROM auth.users u
WHERE p.id = u.id;


-- ── 3. Corrige le trigger pour les nouvelles inscriptions ─────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO UPDATE
    SET username = COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1)
    );
  RETURN NEW;
END;
$$;

-- ══════════════════════════════════════════════════════════════
