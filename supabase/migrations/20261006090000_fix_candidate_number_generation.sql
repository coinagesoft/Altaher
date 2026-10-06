-- Atomically allocate automatically generated candidate numbers.
-- The previous SELECT MAX(...) + 1 implementation was race-prone.

CREATE SEQUENCE IF NOT EXISTS public.candidate_number_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1;

DO $$
DECLARE
  max_candidate_number bigint;
BEGIN
  SELECT COALESCE(
    MAX((substring(candidate_number from '^C-([0-9]+)$'))::bigint),
    0
  )
  INTO max_candidate_number
  FROM public.candidates
  WHERE candidate_number ~* '^C-[0-9]+$';

  IF max_candidate_number > 0 THEN
    PERFORM setval('public.candidate_number_seq', max_candidate_number, true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.next_candidate_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'C-' || lpad(nextval('public.candidate_number_seq')::text, 4, '0');
$$;

GRANT EXECUTE ON FUNCTION public.next_candidate_number() TO authenticated;
