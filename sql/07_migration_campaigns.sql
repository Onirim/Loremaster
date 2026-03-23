-- ══════════════════════════════════════════════════════════════
-- ENERGY SYSTEM — Migration : Campagnes
-- À exécuter dans l'éditeur SQL de Supabase
-- ══════════════════════════════════════════════════════════════

-- 1. Table principale des campagnes
CREATE TABLE IF NOT EXISTS campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  is_public        BOOLEAN NOT NULL DEFAULT FALSE,
  share_code       CHAR(8),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les lookups fréquents
CREATE INDEX IF NOT EXISTS campaigns_user_id_idx    ON campaigns(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_share_code_idx ON campaigns(share_code) WHERE share_code IS NOT NULL;

-- 2. Items d'une campagne (références aux entités par share_code)
CREATE TABLE IF NOT EXISTS campaign_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  item_type     TEXT NOT NULL CHECK (item_type IN ('char', 'chr', 'doc')),
  share_code    CHAR(8) NOT NULL,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, item_type, share_code)
);

CREATE INDEX IF NOT EXISTS campaign_items_campaign_id_idx ON campaign_items(campaign_id);

-- 3. Abonnements joueurs aux campagnes
CREATE TABLE IF NOT EXISTS followed_campaigns (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  followed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS followed_campaigns_user_id_idx ON followed_campaigns(user_id);

-- 4. Génération automatique du share_code à l'insertion/update is_public
CREATE OR REPLACE FUNCTION generate_campaign_share_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code CHAR(8);
  attempts INT := 0;
BEGIN
  -- Génère un code seulement si is_public passe à TRUE et qu'il n'y en a pas encore
  IF NEW.is_public = TRUE AND (OLD.share_code IS NULL OR OLD.is_public = FALSE) THEN
    LOOP
      new_code := upper(substring(md5(random()::text) from 1 for 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM campaigns WHERE share_code = new_code);
      attempts := attempts + 1;
      IF attempts > 100 THEN RAISE EXCEPTION 'Could not generate unique share_code'; END IF;
    END LOOP;
    NEW.share_code := new_code;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS campaigns_share_code_trigger ON campaigns;
CREATE TRIGGER campaigns_share_code_trigger
  BEFORE INSERT OR UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION generate_campaign_share_code();

-- 5. RLS (Row Level Security)
ALTER TABLE campaigns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE followed_campaigns ENABLE ROW LEVEL SECURITY;

-- campaigns : le propriétaire voit tout, les autres voient seulement les publiques
DROP POLICY IF EXISTS campaigns_owner   ON campaigns;
DROP POLICY IF EXISTS campaigns_public  ON campaigns;
CREATE POLICY campaigns_owner  ON campaigns FOR ALL    USING (user_id = auth.uid());
CREATE POLICY campaigns_public ON campaigns FOR SELECT USING (is_public = TRUE);

-- campaign_items : lecture si propriétaire OU si la campagne est publique
DROP POLICY IF EXISTS campaign_items_owner  ON campaign_items;
DROP POLICY IF EXISTS campaign_items_public ON campaign_items;
CREATE POLICY campaign_items_owner  ON campaign_items FOR ALL
  USING (EXISTS (SELECT 1 FROM campaigns WHERE id = campaign_id AND user_id = auth.uid()));
CREATE POLICY campaign_items_public ON campaign_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM campaigns WHERE id = campaign_id AND is_public = TRUE));

-- followed_campaigns : chaque joueur gère ses propres abonnements
DROP POLICY IF EXISTS followed_campaigns_self ON followed_campaigns;
CREATE POLICY followed_campaigns_self ON followed_campaigns FOR ALL
  USING (user_id = auth.uid());
