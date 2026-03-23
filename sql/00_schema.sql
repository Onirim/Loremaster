-- ══════════════════════════════════════════════════════════════
-- ENERGY SYSTEM — Schéma Supabase
-- À coller dans : Supabase Dashboard > SQL Editor > New query
-- ══════════════════════════════════════════════════════════════


-- ── 1. Table profiles ─────────────────────────────────────────
-- Créée automatiquement à chaque inscription via un trigger.
-- Liée à auth.users (UUID Supabase Auth).

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger : crée automatiquement un profil à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 2. Table characters ───────────────────────────────────────
-- Chaque personnage appartient à un utilisateur (user_id).
-- Les données du personnage sont stockées en JSONB (data).
-- is_public = true permet le partage via lien.

CREATE TABLE IF NOT EXISTS public.characters (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  rank       SMALLINT NOT NULL DEFAULT 5,
  is_public  BOOLEAN NOT NULL DEFAULT FALSE,
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour retrouver rapidement les personnages d'un utilisateur
CREATE INDEX IF NOT EXISTS characters_user_id_idx ON public.characters(user_id);
-- Index pour les personnages publics
CREATE INDEX IF NOT EXISTS characters_public_idx ON public.characters(is_public) WHERE is_public = TRUE;

-- Trigger : met à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_characters_updated ON public.characters;
CREATE TRIGGER on_characters_updated
  BEFORE UPDATE ON public.characters
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ── 3. Row Level Security (RLS) ───────────────────────────────
-- RLS activé sur les deux tables.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

-- profiles : chaque utilisateur lit et modifie uniquement son profil
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- characters : lecture
--   → ses propres personnages (privés ou publics)
--   → les personnages publics d'autrui
DROP POLICY IF EXISTS "characters_select" ON public.characters;
CREATE POLICY "characters_select"
  ON public.characters FOR SELECT
  USING (
    auth.uid() = user_id       -- propriétaire
    OR is_public = TRUE        -- ou partagé publiquement
  );

-- characters : insertion uniquement pour soi-même
DROP POLICY IF EXISTS "characters_insert" ON public.characters;
CREATE POLICY "characters_insert"
  ON public.characters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- characters : modification uniquement de ses propres personnages
DROP POLICY IF EXISTS "characters_update" ON public.characters;
CREATE POLICY "characters_update"
  ON public.characters FOR UPDATE
  USING (auth.uid() = user_id);

-- characters : suppression uniquement de ses propres personnages
DROP POLICY IF EXISTS "characters_delete" ON public.characters;
CREATE POLICY "characters_delete"
  ON public.characters FOR DELETE
  USING (auth.uid() = user_id);


-- ── 4. Accès public en lecture seule aux personnages publics ──
-- Permet aux utilisateurs non connectés de voir un personnage
-- partagé via lien (is_public = true), sans compte requis.

DROP POLICY IF EXISTS "characters_select_public_anon" ON public.characters;
CREATE POLICY "characters_select_public_anon"
  ON public.characters FOR SELECT
  TO anon
  USING (is_public = TRUE);


-- ══════════════════════════════════════════════════════════════
-- C'est tout ! Les tables sont prêtes.
-- Retournez dans l'application pour tester l'inscription.
-- ══════════════════════════════════════════════════════════════
