ALTER TYPE public.candidate_status ADD VALUE IF NOT EXISTS 'Passed' AFTER 'Practical Test';

ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS photo_path text;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS photo_source text;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_passport_number_unique
  ON public.candidates (upper(btrim(passport_number)))
  WHERE passport_number IS NOT NULL AND btrim(passport_number) <> '';