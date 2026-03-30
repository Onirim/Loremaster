-- ══════════════════════════════════════════════════════════════
-- ENERGY SYSTEM — Patch : abonnement automatique après transfert
-- Après un transfert, l'ancien propriétaire est automatiquement
-- abonné à l'objet qu'il vient de céder.
-- À coller dans : Supabase Dashboard > SQL Editor > New query
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.transfer_item(
  p_item_type   TEXT,   -- 'char' | 'chr' | 'doc' | 'campaign'
  p_share_code  TEXT,   -- code de partage de l'objet
  p_to_username TEXT    -- nom d'utilisateur du destinataire
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

  -- 1. L'appelant doit être connecté
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- 2. Résoudre le destinataire
  SELECT id INTO v_target_id
  FROM public.profiles
  WHERE lower(username) = lower(trim(p_to_username))
  LIMIT 1;

  IF v_target_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  -- 3. Pas de transfert vers soi-même
  IF v_target_id = v_caller_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'same_user');
  END IF;

  -- ── CAS : personnage ────────────────────────────────────────
  IF p_item_type = 'char' THEN

    SELECT id, user_id INTO v_item_id, v_item_user_id
    FROM public.characters
    WHERE share_code = upper(trim(p_share_code))
    LIMIT 1;

    IF v_item_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'item_not_found');
    END IF;
    IF v_item_user_id <> v_caller_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
    END IF;

    -- Nettoyer les tags orphelins AVANT le transfert
    PERFORM public._cleanup_char_tags_on_transfer(v_item_id, v_caller_id);

    -- Supprimer l'abonnement éventuel de l'ancien proprio (évite le doublon)
    DELETE FROM public.followed_characters
    WHERE character_id = v_item_id AND user_id = v_caller_id;

    -- Transférer
    UPDATE public.characters
    SET user_id = v_target_id, updated_at = NOW()
    WHERE id = v_item_id;

    -- Abonner automatiquement l'ancien propriétaire
    -- (l'objet est maintenant public sinon il ne pouvait pas être transféré)
    INSERT INTO public.followed_characters (user_id, character_id)
    VALUES (v_caller_id, v_item_id)
    ON CONFLICT DO NOTHING;

  -- ── CAS : chronique ─────────────────────────────────────────
  ELSIF p_item_type = 'chr' THEN

    SELECT id, user_id INTO v_item_id, v_item_user_id
    FROM public.chronicles
    WHERE share_code = upper(trim(p_share_code))
    LIMIT 1;

    IF v_item_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'item_not_found');
    END IF;
    IF v_item_user_id <> v_caller_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
    END IF;

    -- Supprimer l'abonnement éventuel de l'ancien proprio (évite le doublon)
    DELETE FROM public.followed_chronicles
    WHERE chronicle_id = v_item_id AND user_id = v_caller_id;

    -- Transférer
    UPDATE public.chronicles
    SET user_id = v_target_id, updated_at = NOW()
    WHERE id = v_item_id;

    -- Abonner automatiquement l'ancien propriétaire
    INSERT INTO public.followed_chronicles (user_id, chronicle_id)
    VALUES (v_caller_id, v_item_id)
    ON CONFLICT DO NOTHING;

  -- ── CAS : document ──────────────────────────────────────────
  ELSIF p_item_type = 'doc' THEN

    SELECT id, user_id INTO v_item_id, v_item_user_id
    FROM public.documents
    WHERE share_code = upper(trim(p_share_code))
    LIMIT 1;

    IF v_item_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'item_not_found');
    END IF;
    IF v_item_user_id <> v_caller_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
    END IF;

    -- Nettoyer les doc_tags orphelins
    PERFORM public._cleanup_doc_tags_on_transfer(v_item_id, v_caller_id);

    -- Supprimer l'abonnement éventuel de l'ancien proprio (évite le doublon)
    DELETE FROM public.followed_documents
    WHERE document_id = v_item_id AND user_id = v_caller_id;

    -- Transférer
    UPDATE public.documents
    SET user_id = v_target_id, updated_at = NOW()
    WHERE id = v_item_id;

    -- Abonner automatiquement l'ancien propriétaire
    INSERT INTO public.followed_documents (user_id, document_id)
    VALUES (v_caller_id, v_item_id)
    ON CONFLICT DO NOTHING;

  -- ── CAS : campagne ──────────────────────────────────────────
  ELSIF p_item_type = 'campaign' THEN

    SELECT id, user_id INTO v_item_id, v_item_user_id
    FROM public.campaigns
    WHERE share_code = upper(trim(p_share_code))
    LIMIT 1;

    IF v_item_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'item_not_found');
    END IF;
    IF v_item_user_id <> v_caller_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
    END IF;

    -- Supprimer l'abonnement éventuel de l'ancien proprio (évite le doublon)
    DELETE FROM public.followed_campaigns
    WHERE campaign_id = v_item_id AND user_id = v_caller_id;

    -- Transférer
    UPDATE public.campaigns
    SET user_id = v_target_id, updated_at = NOW()
    WHERE id = v_item_id;

    -- Abonner automatiquement l'ancien propriétaire
    INSERT INTO public.followed_campaigns (user_id, campaign_id)
    VALUES (v_caller_id, v_item_id)
    ON CONFLICT DO NOTHING;

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_type');
  END IF;

  RETURN jsonb_build_object('ok', true, 'item_id', v_item_id, 'to_user_id', v_target_id);
END;
$$;

-- Les GRANT existants sont conservés
GRANT EXECUTE ON FUNCTION public.transfer_item(TEXT, TEXT, TEXT) TO authenticated;
