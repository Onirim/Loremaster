-- ══════════════════════════════════════════════════════════════
-- Fix: sync_owner_tags RPC fails on ON CONFLICT(user_id, name)
-- because doc_tags had no matching unique constraint.
--
-- This migration:
--   1) Deduplicates doc_tags by (user_id, name)
--   2) Re-points links in document_tags / followed_document_tags
--   3) Adds the missing UNIQUE (user_id, name) constraint
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- Ensure any duplicate links created while remapping do not fail
CREATE TEMP TABLE _doc_tags_dedup AS
SELECT
  id,
  user_id,
  name,
  ROW_NUMBER() OVER (
    PARTITION BY user_id, name
    ORDER BY created_at NULLS LAST, id
  ) AS rn,
  FIRST_VALUE(id) OVER (
    PARTITION BY user_id, name
    ORDER BY created_at NULLS LAST, id
  ) AS keep_id
FROM public.doc_tags;

-- Repoint owner document tag links to the kept tag id
UPDATE public.document_tags dt
SET tag_id = d.keep_id
FROM _doc_tags_dedup d
WHERE dt.tag_id = d.id
  AND d.rn > 1
  AND dt.tag_id <> d.keep_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.document_tags dt2
    WHERE dt2.document_id = dt.document_id
      AND dt2.tag_id = d.keep_id
  );

-- Remove duplicates now made redundant by the remap
DELETE FROM public.document_tags dt
USING _doc_tags_dedup d
WHERE dt.tag_id = d.id
  AND d.rn > 1;

-- Repoint followed document tag links to the kept tag id
UPDATE public.followed_document_tags fdt
SET tag_id = d.keep_id
FROM _doc_tags_dedup d
WHERE fdt.tag_id = d.id
  AND d.rn > 1
  AND fdt.tag_id <> d.keep_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.followed_document_tags fdt2
    WHERE fdt2.user_id = fdt.user_id
      AND fdt2.document_id = fdt.document_id
      AND fdt2.tag_id = d.keep_id
  );

-- Remove duplicates now made redundant by the remap
DELETE FROM public.followed_document_tags fdt
USING _doc_tags_dedup d
WHERE fdt.tag_id = d.id
  AND d.rn > 1;

-- Delete duplicate tag rows, keeping one per (user_id, name)
DELETE FROM public.doc_tags t
USING _doc_tags_dedup d
WHERE t.id = d.id
  AND d.rn > 1;

-- Add missing uniqueness required by ON CONFLICT (user_id, name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doc_tags_user_id_name_key'
      AND conrelid = 'public.doc_tags'::regclass
  ) THEN
    ALTER TABLE public.doc_tags
      ADD CONSTRAINT doc_tags_user_id_name_key UNIQUE (user_id, name);
  END IF;
END $$;

COMMIT;
