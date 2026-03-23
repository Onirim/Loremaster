-- ══════════════════════════════════════════════════════════════
-- ENERGY SYSTEM — Système de tags
-- À coller dans : Supabase Dashboard > SQL Editor > New query
-- ══════════════════════════════════════════════════════════════

-- ── 1. Table tags ─────────────────────────────────────────────
-- Un tag appartient à un utilisateur et a un nom unique par user.

CREATE TABLE IF NOT EXISTS public.tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#5c6070',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, name)   -- un utilisateur ne peut pas avoir deux tags du même nom
);

CREATE INDEX IF NOT EXISTS tags_user_id_idx ON public.tags(user_id);


-- ── 2. Table character_tags (liaison) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.character_tags (
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  tag_id       UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (character_id, tag_id)
);

CREATE INDEX IF NOT EXISTS character_tags_character_idx ON public.character_tags(character_id);
CREATE INDEX IF NOT EXISTS character_tags_tag_idx ON public.character_tags(tag_id);


-- ── 3. RLS ────────────────────────────────────────────────────

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_tags ENABLE ROW LEVEL SECURITY;

-- Tags : lecture, création, modification, suppression = propriétaire uniquement
DROP POLICY IF EXISTS "tags_select_own" ON public.tags;
CREATE POLICY "tags_select_own" ON public.tags FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tags_insert_own" ON public.tags;
CREATE POLICY "tags_insert_own" ON public.tags FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tags_update_own" ON public.tags;
CREATE POLICY "tags_update_own" ON public.tags FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tags_delete_own" ON public.tags;
CREATE POLICY "tags_delete_own" ON public.tags FOR DELETE USING (auth.uid() = user_id);

-- character_tags : accessible si le personnage appartient à l'utilisateur
DROP POLICY IF EXISTS "character_tags_select" ON public.character_tags;
CREATE POLICY "character_tags_select" ON public.character_tags FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.characters c
    WHERE c.id = character_id AND c.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "character_tags_insert" ON public.character_tags;
CREATE POLICY "character_tags_insert" ON public.character_tags FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.characters c
    WHERE c.id = character_id AND c.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "character_tags_delete" ON public.character_tags;
CREATE POLICY "character_tags_delete" ON public.character_tags FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.characters c
    WHERE c.id = character_id AND c.user_id = auth.uid()
  ));

-- ══════════════════════════════════════════════════════════════
