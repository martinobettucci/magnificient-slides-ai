-- Add generation_hints column to infographic_pages to store guidance for AI generation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'infographic_pages'
      AND column_name = 'generation_hints'
  ) THEN
    ALTER TABLE public.infographic_pages
      ADD COLUMN generation_hints text[] DEFAULT ARRAY[]::text[];
  END IF;
END
$$;
