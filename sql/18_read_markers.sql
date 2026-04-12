-- ══════════════════════════════════════════════════════════════
-- Camply — Read markers persistants (DB)
-- Stocke l'état lu/non-lu par utilisateur pour contenus suivis.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.read_markers (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('character', 'document', 'chronicle', 'chronicle_entry')),
  content_id   UUID NOT NULL,
  parent_id    UUID,
  read_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, content_type, content_id)
);

CREATE INDEX IF NOT EXISTS read_markers_user_idx ON public.read_markers(user_id);
CREATE INDEX IF NOT EXISTS read_markers_parent_idx ON public.read_markers(parent_id) WHERE parent_id IS NOT NULL;

ALTER TABLE public.read_markers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_markers_select_own" ON public.read_markers;
CREATE POLICY "read_markers_select_own"
  ON public.read_markers FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "read_markers_insert_own" ON public.read_markers;
CREATE POLICY "read_markers_insert_own"
  ON public.read_markers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "read_markers_update_own" ON public.read_markers;
CREATE POLICY "read_markers_update_own"
  ON public.read_markers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "read_markers_delete_own" ON public.read_markers;
CREATE POLICY "read_markers_delete_own"
  ON public.read_markers FOR DELETE
  USING (auth.uid() = user_id);
