ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS contact_no_2 text,
  ADD COLUMN IF NOT EXISTS ex_site_1 text;