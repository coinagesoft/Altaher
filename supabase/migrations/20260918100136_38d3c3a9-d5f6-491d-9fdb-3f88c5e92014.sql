ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS surname text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS place_of_birth text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS trade text,
  ADD COLUMN IF NOT EXISTS passport_issue_date date,
  ADD COLUMN IF NOT EXISTS passport_place_of_issue text;

UPDATE public.candidates SET trade = skills[1] WHERE trade IS NULL AND array_length(skills, 1) >= 1;

CREATE TABLE public.mobilisation_clearances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  medical_cleared boolean NOT NULL DEFAULT false,
  medical_date date,
  visa_cleared boolean NOT NULL DEFAULT false,
  visa_issue_date date,
  visa_expiry_date date,
  police_cleared boolean NOT NULL DEFAULT false,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, project_id)
);

GRANT SELECT ON public.mobilisation_clearances TO authenticated;
GRANT ALL ON public.mobilisation_clearances TO service_role;

ALTER TABLE public.mobilisation_clearances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view mobilisation clearances" ON public.mobilisation_clearances FOR SELECT TO authenticated USING (true);

CREATE TRIGGER set_mobilisation_clearances_updated_at BEFORE UPDATE ON public.mobilisation_clearances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();