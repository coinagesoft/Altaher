CREATE TABLE public.candidate_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  end_reason text,
  final_status public.candidate_status,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.candidate_assignments TO authenticated;
GRANT ALL ON public.candidate_assignments TO service_role;

ALTER TABLE public.candidate_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view assignment history" ON public.candidate_assignments FOR SELECT TO authenticated USING (true);

CREATE TRIGGER set_candidate_assignments_updated_at BEFORE UPDATE ON public.candidate_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX candidate_assignments_candidate_idx ON public.candidate_assignments(candidate_id);
CREATE INDEX candidate_assignments_project_idx ON public.candidate_assignments(project_id);

ALTER TABLE public.candidate_documents ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

INSERT INTO public.candidate_assignments (candidate_id, project_id, assigned_at, created_by)
SELECT c.id, c.current_project_id, c.updated_at, c.created_by
FROM public.candidates c
WHERE c.current_project_id IS NOT NULL;