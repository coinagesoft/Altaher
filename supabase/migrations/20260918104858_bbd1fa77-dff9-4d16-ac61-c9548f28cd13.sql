ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS rr_start_date date,
  ADD COLUMN IF NOT EXISTS rr_days integer;