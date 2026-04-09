-- ══════════════════════════════════════════════════════════════
-- CAMPLY — Partage des marqueurs de carte (map_layers)
-- Migration à appliquer APRÈS 15_map_markers.sql
-- ══════════════════════════════════════════════════════════════
--
-- Modèle choisi :
--   Chaque utilisateur possède UNE couche de marqueurs (map_layer).
--   Il peut la rendre publique via un share_code.
--   Les autres joueurs s'y abonnent et voient les marqueurs
--   en lecture seule superposés à leur propre carte.
--   Une couche peut être incluse dans une campagne (type 'map').
-- ══════════════════════════════════════════════════════════════


-- ── 1. Ajouter share_code + is_public sur map_markers ─────────
-- On ajoute les colonnes de partage directement sur la table
-- existante plutôt que de créer une table intermédiaire,
-- car chaque marqueur appartient à un utilisateur identifié
-- et les abonnés voient TOUS les marqueurs d'un propriétaire.

ALTER TABLE public.map_markers
  ADD COLUMN IF NOT EXISTS is_public  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS share_code TEXT    UNIQUE;

-- Index pour la recherche par code
CREATE INDEX IF NOT EXISTS map_markers_share_code_idx
  ON public.map_markers(share_code) WHERE share_code IS NOT NULL;


-- ── 2. Table map_layers ───────────────────────────────────────
-- Représente la "couche de marqueurs" partageable d'un utilisateur.
-- Un utilisateur n'en possède qu'une (UNIQUE user_id).
-- Elle regroupe tous ses marqueurs publics sous un seul code.

CREATE TABLE IF NOT EXISTS public.map_layers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '',        -- ex: "Carte de Théodric"
  description TEXT NOT NULL DEFAULT '',
  is_public   BOOLEAN NOT NULL DEFAULT FALSE,
  share_code  TEXT UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)   -- une seule couche par utilisateur
);

CREATE INDEX IF NOT EXISTS map_layers_user_id_idx   ON public.map_layers(user_id);
CREATE INDEX IF NOT EXISTS map_layers_public_idx    ON public.map_layers(is_public) WHERE is_public = TRUE;

-- Trigger updated_at
DROP TRIGGER IF EXISTS on_map_layers_updated ON public.map_layers;
CREATE TRIGGER on_map_layers_updated
  BEFORE UPDATE ON public.map_layers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Génération automatique du share_code lors du passage en public
DROP TRIGGER IF EXISTS set_map_layer_share_code ON public.map_layers;
CREATE TRIGGER set_map_layer_share_code
  BEFORE INSERT ON public.map_layers
  FOR EACH ROW
  WHEN (NEW.share_code IS NULL)
  EXECUTE FUNCTION public.generate_share_code();


-- ── 3. Table followed_map_layers ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.followed_map_layers (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  layer_id     UUID NOT NULL REFERENCES public.map_layers(id) ON DELETE CASCADE,
  followed_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY  (user_id, layer_id)
);

CREATE INDEX IF NOT EXISTS followed_map_layers_user_idx ON public.followed_map_layers(user_id);


-- ── 4. RLS ────────────────────────────────────────────────────

ALTER TABLE public.map_layers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followed_map_layers ENABLE ROW LEVEL SECURITY;

-- map_layers : propriétaire voit tout ; autres voient les publiques
DROP POLICY IF EXISTS "map_layers_select"      ON public.map_layers;
DROP POLICY IF EXISTS "map_layers_select_anon" ON public.map_layers;
DROP POLICY IF EXISTS "map_layers_insert"      ON public.map_layers;
DROP POLICY IF EXISTS "map_layers_update"      ON public.map_layers;
DROP POLICY IF EXISTS "map_layers_delete"      ON public.map_layers;

CREATE POLICY "map_layers_select" ON public.map_layers FOR SELECT
  USING (auth.uid() = user_id OR is_public = TRUE);

CREATE POLICY "map_layers_select_anon" ON public.map_layers FOR SELECT
  TO anon USING (is_public = TRUE);

CREATE POLICY "map_layers_insert" ON public.map_layers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "map_layers_update" ON public.map_layers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "map_layers_delete" ON public.map_layers FOR DELETE
  USING (auth.uid() = user_id);

-- followed_map_layers : chaque joueur gère ses propres abonnements
DROP POLICY IF EXISTS "followed_map_layers_all" ON public.followed_map_layers;
CREATE POLICY "followed_map_layers_all" ON public.followed_map_layers FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ── 5. RLS sur map_markers : exposer les marqueurs publics ────
-- Les marqueurs d'une couche publique sont lisibles par tous
-- (authentifiés ou non) dès lors que la couche est publique.

DROP POLICY IF EXISTS "map_markers_all_own"        ON public.map_markers;
DROP POLICY IF EXISTS "map_markers_select_followed" ON public.map_markers;
DROP POLICY IF EXISTS "map_markers_select_anon"     ON public.map_markers;

-- Propriétaire : lecture + écriture complète
CREATE POLICY "map_markers_all_own" ON public.map_markers FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Abonnés authentifiés : lecture des marqueurs des couches publiques suivies
CREATE POLICY "map_markers_select_followed" ON public.map_markers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.map_layers ml
      JOIN   public.followed_map_layers fml ON fml.layer_id = ml.id
      WHERE  ml.user_id   = map_markers.user_id
        AND  ml.is_public = TRUE
        AND  fml.user_id  = auth.uid()
    )
  );

-- Anonymes : lecture des marqueurs appartenant à une couche publique
CREATE POLICY "map_markers_select_anon" ON public.map_markers FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.map_layers ml
      WHERE  ml.user_id   = map_markers.user_id
        AND  ml.is_public = TRUE
    )
  );


-- ── 6. Intégration campagnes ──────────────────────────────────
-- Le type 'map' est déjà supporté par campaign_items (colonne
-- item_type TEXT CHECK (item_type IN ('char','chr','doc'))).
-- On étend la contrainte pour accepter 'map'.

ALTER TABLE public.campaign_items
  DROP CONSTRAINT IF EXISTS campaign_items_item_type_check;

ALTER TABLE public.campaign_items
  ADD CONSTRAINT campaign_items_item_type_check
  CHECK (item_type IN ('char', 'chr', 'doc', 'map'));


-- ── 7. Intégration transfer_item ──────────────────────────────
-- Le transfert d'une couche de carte suit le même mécanisme
-- que pour les autres types. La fonction transfer_item sera
-- mise à jour côté JS (map.js) — aucune modification SQL
-- n'est nécessaire car map_layers a déjà user_id + share_code.

-- Pour que transfer_item puisse UPDATE map_layers, on crée
-- une version étendue de la fonction (remplace l'existante).

CREATE OR REPLACE FUNCTION public.transfer_item(
  p_item_type   TEXT,
  p_share_code  TEXT,
  p_to_username TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    UUID := auth.uid();
  v_target_id    UUID;
  v_item_id      UUID;
  v_item_user_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT id INTO v_target_id
  FROM public.profiles
  WHERE lower(username) = lower(trim(p_to_username))
  LIMIT 1;

  IF v_target_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  IF v_target_id = v_caller_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'same_user');
  END IF;

  -- ── CAS : personnage ────────────────────────────────────────
  IF p_item_type = 'char' THEN
    SELECT id, user_id INTO v_item_id, v_item_user_id
    FROM public.characters WHERE share_code = upper(trim(p_share_code)) LIMIT 1;
    IF v_item_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'item_not_found'); END IF;
    IF v_item_user_id <> v_caller_id THEN RETURN jsonb_build_object('ok', false, 'error', 'not_owner'); END IF;
    PERFORM public._cleanup_char_tags_on_transfer(v_item_id, v_caller_id);
    DELETE FROM public.followed_characters WHERE character_id = v_item_id AND user_id = v_caller_id;
    DELETE FROM public.followed_characters WHERE character_id = v_item_id AND user_id = v_target_id;
    UPDATE public.characters SET user_id = v_target_id, updated_at = NOW() WHERE id = v_item_id;
    INSERT INTO public.followed_characters (user_id, character_id) VALUES (v_caller_id, v_item_id) ON CONFLICT DO NOTHING;

  -- ── CAS : chronique ─────────────────────────────────────────
  ELSIF p_item_type = 'chr' THEN
    SELECT id, user_id INTO v_item_id, v_item_user_id
    FROM public.chronicles WHERE share_code = upper(trim(p_share_code)) LIMIT 1;
    IF v_item_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'item_not_found'); END IF;
    IF v_item_user_id <> v_caller_id THEN RETURN jsonb_build_object('ok', false, 'error', 'not_owner'); END IF;
    DELETE FROM public.followed_chronicles WHERE chronicle_id = v_item_id AND user_id = v_caller_id;
    DELETE FROM public.followed_chronicles WHERE chronicle_id = v_item_id AND user_id = v_target_id;
    UPDATE public.chronicles SET user_id = v_target_id, updated_at = NOW() WHERE id = v_item_id;
    INSERT INTO public.followed_chronicles (user_id, chronicle_id) VALUES (v_caller_id, v_item_id) ON CONFLICT DO NOTHING;

  -- ── CAS : document ──────────────────────────────────────────
  ELSIF p_item_type = 'doc' THEN
    SELECT id, user_id INTO v_item_id, v_item_user_id
    FROM public.documents WHERE share_code = upper(trim(p_share_code)) LIMIT 1;
    IF v_item_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'item_not_found'); END IF;
    IF v_item_user_id <> v_caller_id THEN RETURN jsonb_build_object('ok', false, 'error', 'not_owner'); END IF;
    PERFORM public._cleanup_doc_tags_on_transfer(v_item_id, v_caller_id);
    DELETE FROM public.followed_documents WHERE document_id = v_item_id AND user_id = v_caller_id;
    DELETE FROM public.followed_documents WHERE document_id = v_item_id AND user_id = v_target_id;
    UPDATE public.documents SET user_id = v_target_id, updated_at = NOW() WHERE id = v_item_id;
    INSERT INTO public.followed_documents (user_id, document_id) VALUES (v_caller_id, v_item_id) ON CONFLICT DO NOTHING;

  -- ── CAS : campagne ──────────────────────────────────────────
  ELSIF p_item_type = 'campaign' THEN
    SELECT id, user_id INTO v_item_id, v_item_user_id
    FROM public.campaigns WHERE share_code = upper(trim(p_share_code)) LIMIT 1;
    IF v_item_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'item_not_found'); END IF;
    IF v_item_user_id <> v_caller_id THEN RETURN jsonb_build_object('ok', false, 'error', 'not_owner'); END IF;
    DELETE FROM public.followed_campaigns WHERE campaign_id = v_item_id AND user_id = v_caller_id;
    DELETE FROM public.followed_campaigns WHERE campaign_id = v_item_id AND user_id = v_target_id;
    UPDATE public.campaigns SET user_id = v_target_id, updated_at = NOW() WHERE id = v_item_id;
    INSERT INTO public.followed_campaigns (user_id, campaign_id) VALUES (v_caller_id, v_item_id) ON CONFLICT DO NOTHING;

  -- ── CAS : couche de carte ────────────────────────────────────
  ELSIF p_item_type = 'map' THEN
    SELECT id, user_id INTO v_item_id, v_item_user_id
    FROM public.map_layers WHERE share_code = upper(trim(p_share_code)) LIMIT 1;
    IF v_item_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'item_not_found'); END IF;
    IF v_item_user_id <> v_caller_id THEN RETURN jsonb_build_object('ok', false, 'error', 'not_owner'); END IF;
    -- Transfère la couche ET tous ses marqueurs
    DELETE FROM public.followed_map_layers WHERE layer_id = v_item_id AND user_id = v_caller_id;
    DELETE FROM public.followed_map_layers WHERE layer_id = v_item_id AND user_id = v_target_id;
    UPDATE public.map_layers  SET user_id = v_target_id, updated_at = NOW() WHERE id = v_item_id;
    UPDATE public.map_markers SET user_id = v_target_id, updated_at = NOW() WHERE user_id = v_caller_id;
    INSERT INTO public.followed_map_layers (user_id, layer_id) VALUES (v_caller_id, v_item_id) ON CONFLICT DO NOTHING;

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_type');
  END IF;

  RETURN jsonb_build_object('ok', true, 'item_id', v_item_id, 'to_user_id', v_target_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_item(TEXT, TEXT, TEXT) TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- Résumé :
--  • map_layers    : couche partageable (1 par user), avec share_code
--  • followed_map_layers : abonnements joueurs
--  • map_markers RLS étendu pour exposer aux abonnés + anonymes
--  • campaign_items accepte désormais item_type = 'map'
--  • transfer_item étendu pour le type 'map'
-- ══════════════════════════════════════════════════════════════
