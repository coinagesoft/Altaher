CREATE TABLE public.project_employee_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  employee_number text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, candidate_id),
  UNIQUE (project_id, employee_number)
);
GRANT SELECT ON public.project_employee_numbers TO authenticated;
GRANT ALL ON public.project_employee_numbers TO service_role;
ALTER TABLE public.project_employee_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view employee numbers" ON public.project_employee_numbers FOR SELECT TO authenticated USING (true);
CREATE TRIGGER project_employee_numbers_updated_at BEFORE UPDATE ON public.project_employee_numbers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.project_employee_numbers (project_id, candidate_id, employee_number, created_by)
SELECT current_project_id, id, employee_number, created_by FROM public.candidates
WHERE employee_number IS NOT NULL AND btrim(employee_number) <> '' AND current_project_id IS NOT NULL
ON CONFLICT DO NOTHING;
ALTER TABLE public.candidates DROP CONSTRAINT IF EXISTS candidates_employee_number_key;
ALTER TABLE public.candidates ADD COLUMN duplicate_checked_of uuid;