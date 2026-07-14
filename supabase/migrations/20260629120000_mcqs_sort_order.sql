-- Preserve bulk-import order for MCQ Manager listings.
-- Adds a stable per-row sort_order column for public.mcqs and backfills it
-- from the existing created_at sequence so historical rows keep their
-- current displayed order. Safe, idempotent, no data loss, no RLS change.

ALTER TABLE public.mcqs
  ADD COLUMN IF NOT EXISTS sort_order BIGINT;

UPDATE public.mcqs AS m
SET sort_order = sub.rn
FROM (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY chapter_id ORDER BY created_at, id) AS rn
  FROM public.mcqs
) AS sub
WHERE m.id = sub.id
  AND m.sort_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_mcqs_chapter_sort_order
  ON public.mcqs (chapter_id, sort_order);
