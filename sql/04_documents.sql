-- ══════════════════════════════════════════════════════════════
-- ENERGY SYSTEM — Documents
-- À coller dans : Supabase Dashboard > SQL Editor > New query
-- ══════════════════════════════════════════════════════════════

-- ── 1. Table documents ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL DEFAULT '',
  content               TEXT NOT NULL DEFAULT '',
  is_public             BOOLEAN NOT NULL DEFAULT FALSE,
  share_code            TEXT UNIQUE,
  illustration_url      TEXT NOT NULL DEFAULT '',
  illustration_position SMALLINT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_user_id_idx ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS documents_public_idx  ON public.documents(is_public) WHERE is_public = TRUE;

DROP TRIGGER IF EXISTS on_documents_updated ON public.documents;
CREATE TRIGGER on_documents_updated
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_document_share_code ON public.documents;
CREATE TRIGGER set_document_share_code
  BEFORE INSERT ON public.documents
  FOR EACH ROW
  WHEN (NEW.share_code IS NULL)
  EXECUTE FUNCTION public.generate_share_code();


-- ── 2. Table followed_documents ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.followed_documents (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  followed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, document_id)
);

CREATE INDEX IF NOT EXISTS followed_documents_user_idx ON public.followed_documents(user_id);

CREATE OR REPLACE FUNCTION public.guard_document_shared_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
    NEW.user_id := OLD.user_id;
    NEW.is_public := OLD.is_public;
    NEW.share_code := OLD.share_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_document_shared_update ON public.documents;
CREATE TRIGGER guard_document_shared_update
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_document_shared_update();


-- ── 3. RLS ────────────────────────────────────────────────────

ALTER TABLE public.documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followed_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents_select"      ON public.documents;
CREATE POLICY "documents_select" ON public.documents FOR SELECT
  USING (auth.uid() = user_id OR is_public = TRUE);

DROP POLICY IF EXISTS "documents_select_anon" ON public.documents;
CREATE POLICY "documents_select_anon" ON public.documents FOR SELECT
  TO anon USING (is_public = TRUE);

DROP POLICY IF EXISTS "documents_insert" ON public.documents;
CREATE POLICY "documents_insert" ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "documents_update" ON public.documents;
CREATE POLICY "documents_update" ON public.documents FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.followed_documents fd
      WHERE fd.document_id = id AND fd.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.followed_documents fd
      WHERE fd.document_id = id AND fd.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "documents_delete" ON public.documents;
CREATE POLICY "documents_delete" ON public.documents FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "followed_doc_select" ON public.followed_documents;
CREATE POLICY "followed_doc_select" ON public.followed_documents FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "followed_doc_insert" ON public.followed_documents;
CREATE POLICY "followed_doc_insert" ON public.followed_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "followed_doc_delete" ON public.followed_documents;
CREATE POLICY "followed_doc_delete" ON public.followed_documents FOR DELETE
  USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
