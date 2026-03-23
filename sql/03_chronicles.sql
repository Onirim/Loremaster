-- ══════════════════════════════════════════════════════════════
-- ENERGY SYSTEM — Chroniques v2 (migration incluse)
-- À coller dans : Supabase Dashboard > SQL Editor > New query
-- ══════════════════════════════════════════════════════════════

-- ── 1. Nettoyage de l'ancien schéma ───────────────────────────

DROP TABLE IF EXISTS public.followed_chronicles CASCADE;
DROP TABLE IF EXISTS public.chronicles CASCADE;


-- ── 2. Table chronicles ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chronicles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                TEXT NOT NULL DEFAULT '',
  description          TEXT NOT NULL DEFAULT '',
  is_public            BOOLEAN NOT NULL DEFAULT FALSE,
  share_code           TEXT UNIQUE,
  illustration_url     TEXT NOT NULL DEFAULT '',
  illustration_position SMALLINT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chronicles_user_id_idx ON public.chronicles(user_id);
CREATE INDEX IF NOT EXISTS chronicles_public_idx  ON public.chronicles(is_public) WHERE is_public = TRUE;

DROP TRIGGER IF EXISTS on_chronicles_updated ON public.chronicles;
CREATE TRIGGER on_chronicles_updated
  BEFORE UPDATE ON public.chronicles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_chronicle_share_code ON public.chronicles;
CREATE TRIGGER set_chronicle_share_code
  BEFORE INSERT ON public.chronicles
  FOR EACH ROW
  WHEN (NEW.share_code IS NULL)
  EXECUTE FUNCTION public.generate_share_code();


-- ── 3. Table chronicle_entries ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chronicle_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chronicle_id UUID NOT NULL REFERENCES public.chronicles(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT '',
  content      TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS entries_chronicle_id_idx ON public.chronicle_entries(chronicle_id);

DROP TRIGGER IF EXISTS on_entries_updated ON public.chronicle_entries;
CREATE TRIGGER on_entries_updated
  BEFORE UPDATE ON public.chronicle_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.handle_entry_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.chronicles SET updated_at = NOW() WHERE id = NEW.chronicle_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_entry_touch_chronicle ON public.chronicle_entries;
CREATE TRIGGER on_entry_touch_chronicle
  AFTER INSERT OR UPDATE ON public.chronicle_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_entry_updated();


-- ── 4. Table followed_chronicles ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.followed_chronicles (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chronicle_id UUID NOT NULL REFERENCES public.chronicles(id) ON DELETE CASCADE,
  followed_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, chronicle_id)
);

CREATE INDEX IF NOT EXISTS followed_chronicles_user_idx ON public.followed_chronicles(user_id);


-- ── 5. RLS ────────────────────────────────────────────────────

ALTER TABLE public.chronicles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chronicle_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followed_chronicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chronicles_select"      ON public.chronicles;
CREATE POLICY "chronicles_select" ON public.chronicles FOR SELECT
  USING (auth.uid() = user_id OR is_public = TRUE);

DROP POLICY IF EXISTS "chronicles_select_anon" ON public.chronicles;
CREATE POLICY "chronicles_select_anon" ON public.chronicles FOR SELECT
  TO anon USING (is_public = TRUE);

DROP POLICY IF EXISTS "chronicles_insert" ON public.chronicles;
CREATE POLICY "chronicles_insert" ON public.chronicles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "chronicles_update" ON public.chronicles;
CREATE POLICY "chronicles_update" ON public.chronicles FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "chronicles_delete" ON public.chronicles;
CREATE POLICY "chronicles_delete" ON public.chronicles FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "entries_select" ON public.chronicle_entries;
CREATE POLICY "entries_select" ON public.chronicle_entries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.chronicles c
    WHERE c.id = chronicle_id
      AND (c.user_id = auth.uid() OR c.is_public = TRUE)
  ));

DROP POLICY IF EXISTS "entries_select_anon" ON public.chronicle_entries;
CREATE POLICY "entries_select_anon" ON public.chronicle_entries FOR SELECT
  TO anon
  USING (EXISTS (
    SELECT 1 FROM public.chronicles c
    WHERE c.id = chronicle_id AND c.is_public = TRUE
  ));

DROP POLICY IF EXISTS "entries_insert" ON public.chronicle_entries;
CREATE POLICY "entries_insert" ON public.chronicle_entries FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.chronicles c
    WHERE c.id = chronicle_id AND c.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "entries_update" ON public.chronicle_entries;
CREATE POLICY "entries_update" ON public.chronicle_entries FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.chronicles c
    WHERE c.id = chronicle_id AND c.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "entries_delete" ON public.chronicle_entries;
CREATE POLICY "entries_delete" ON public.chronicle_entries FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.chronicles c
    WHERE c.id = chronicle_id AND c.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "followed_chr_select" ON public.followed_chronicles;
CREATE POLICY "followed_chr_select" ON public.followed_chronicles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "followed_chr_insert" ON public.followed_chronicles;
CREATE POLICY "followed_chr_insert" ON public.followed_chronicles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "followed_chr_delete" ON public.followed_chronicles;
CREATE POLICY "followed_chr_delete" ON public.followed_chronicles FOR DELETE
  USING (auth.uid() = user_id);
