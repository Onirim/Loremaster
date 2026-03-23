-- ══════════════════════════════════════════════════════════════
-- ENERGY SYSTEM — Bucket Storage pour les illustrations
-- À coller dans : Supabase Dashboard > SQL Editor > New query
-- ══════════════════════════════════════════════════════════════

-- ── 1. Créer le bucket public ─────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'character-illustrations',
  'character-illustrations',
  true,                        -- bucket public : URLs directement accessibles
  3145728,                     -- limite 3 Mo par fichier
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;


-- ── 2. Politiques RLS Storage ─────────────────────────────────

-- Lecture publique : tout le monde peut voir les images
DROP POLICY IF EXISTS "illustrations_public_read" ON storage.objects;
CREATE POLICY "illustrations_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'character-illustrations');

-- Upload : uniquement les utilisateurs connectés,
-- dans leur propre dossier (user_id/)
DROP POLICY IF EXISTS "illustrations_insert_own" ON storage.objects;
CREATE POLICY "illustrations_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'character-illustrations'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Remplacement : un utilisateur peut remplacer ses propres images
DROP POLICY IF EXISTS "illustrations_update_own" ON storage.objects;
CREATE POLICY "illustrations_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'character-illustrations'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Suppression : un utilisateur peut supprimer ses propres images
DROP POLICY IF EXISTS "illustrations_delete_own" ON storage.objects;
CREATE POLICY "illustrations_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'character-illustrations'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ══════════════════════════════════════════════════════════════
-- Les images seront stockées sous la forme :
-- character-illustrations/{user_id}/{character_id}.{ext}
-- et accessibles via l'URL publique Supabase Storage.
-- ══════════════════════════════════════════════════════════════
