CREATE TABLE public.project_trade_requirements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  trade text NOT NULL,
  required_count integer NOT NULL DEFAULT 1 CHECK (required_count >= 1),
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (project_id, trade)
);

GRANT SELECT ON public.project_trade_requirements TO authenticated;
GRANT ALL ON public.project_trade_requirements TO service_role;

ALTER TABLE public.project_trade_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view trade requirements" ON public.project_trade_requirements FOR SELECT TO authenticated USING (true);

CREATE TRIGGER set_project_trade_requirements_updated_at BEFORE UPDATE ON public.project_trade_requirements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_project_trade_requirements_project ON public.project_trade_requirements(project_id);