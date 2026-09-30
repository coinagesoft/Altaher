ALTER TYPE public.candidate_status ADD VALUE IF NOT EXISTS 'Practical Test' AFTER 'Interview';

ALTER TABLE public.candidates DROP CONSTRAINT IF EXISTS candidates_rating_check;
ALTER TABLE public.candidates ADD CONSTRAINT candidates_rating_check CHECK (rating >= 0 AND rating <= 10);
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS interview_rating numeric;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS practical_rating numeric;

ALTER TABLE public.projects ALTER COLUMN required_headcount SET DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.candidate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  event text NOT NULL,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.candidate_history TO authenticated;
GRANT ALL ON public.candidate_history TO service_role;
ALTER TABLE public.candidate_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view candidate history" ON public.candidate_history FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS candidate_history_candidate_idx ON public.candidate_history(candidate_id, created_at DESC);