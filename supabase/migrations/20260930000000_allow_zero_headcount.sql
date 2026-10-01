ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_required_headcount_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_required_headcount_check CHECK (required_headcount >= 0);