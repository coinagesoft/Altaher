CREATE TYPE public.app_role AS ENUM ('Data Entry', 'Recruiter', 'Project Coordinator', 'Mobilisation Executive', 'Admin');
CREATE TYPE public.candidate_status AS ENUM ('Available', 'Assigned', 'Shortlisted', 'Interview', 'Selected', 'Rejected', 'Medical', 'Visa', 'Mobilisation', 'On Site', 'R&R', 'EOC');
CREATE TYPE public.document_category AS ENUM ('candidate', 'project');
CREATE TYPE public.requirement_stage AS ENUM ('Assigned', 'Shortlisted', 'Interview', 'Selected', 'Medical', 'Visa', 'Mobilisation');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE POLICY "Staff view own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'Admin'));
CREATE POLICY "Admins assign roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'Admin'));
CREATE POLICY "Admins update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'Admin')) WITH CHECK (public.has_role(auth.uid(), 'Admin'));

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client text NOT NULL,
  start_date date NOT NULL,
  required_headcount integer NOT NULL CHECK (required_headcount > 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view projects" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins create projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'Admin') AND created_by = auth.uid());
CREATE POLICY "Admins update projects" ON public.projects FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'Admin')) WITH CHECK (public.has_role(auth.uid(), 'Admin'));
CREATE POLICY "Admins delete projects" ON public.projects FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'Admin'));

CREATE TABLE public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_number text NOT NULL UNIQUE,
  name text NOT NULL,
  email text,
  phone text,
  skills text[] NOT NULL DEFAULT '{}',
  experience_years numeric(5,2) NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
  rating numeric(3,2) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  status public.candidate_status NOT NULL DEFAULT 'Available',
  current_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  passport_number text,
  passport_expiry date,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.candidates TO authenticated;
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view candidates" ON public.candidates FOR SELECT TO authenticated USING (true);

CREATE TABLE public.candidate_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  text text NOT NULL CHECK (length(trim(text)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.candidate_remarks TO authenticated;
GRANT ALL ON public.candidate_remarks TO service_role;
ALTER TABLE public.candidate_remarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view remarks" ON public.candidate_remarks FOR SELECT TO authenticated USING (true);

CREATE TABLE public.document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text GENERATED ALWAYS AS (lower(trim(name))) STORED,
  category public.document_category NOT NULL,
  created_by uuid NOT NULL,
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_name, category)
);
GRANT SELECT ON public.document_types TO authenticated;
GRANT ALL ON public.document_types TO service_role;
ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view document types" ON public.document_types FOR SELECT TO authenticated USING (true);

CREATE TABLE public.project_stage_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage public.requirement_stage NOT NULL,
  document_type_id uuid NOT NULL REFERENCES public.document_types(id),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, stage, document_type_id)
);
GRANT SELECT ON public.project_stage_requirements TO authenticated;
GRANT ALL ON public.project_stage_requirements TO service_role;
ALTER TABLE public.project_stage_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view requirements" ON public.project_stage_requirements FOR SELECT TO authenticated USING (true);

CREATE TABLE public.candidate_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  document_type_id uuid NOT NULL REFERENCES public.document_types(id),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  expiry_date date,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.candidate_documents TO authenticated;
GRANT ALL ON public.candidate_documents TO service_role;
ALTER TABLE public.candidate_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view document records" ON public.candidate_documents FOR SELECT TO authenticated USING (true);

CREATE TABLE public.travel_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES public.candidates(id) ON DELETE CASCADE,
  flight_date date NOT NULL,
  flight_number text NOT NULL,
  departure_airport text NOT NULL,
  arrival_airport text NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.travel_details TO authenticated;
GRANT ALL ON public.travel_details TO service_role;
ALTER TABLE public.travel_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view travel" ON public.travel_details FOR SELECT TO authenticated USING (true);

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  action text NOT NULL,
  previous_status public.candidate_status,
  new_status public.candidate_status,
  actor_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view audit" ON public.audit_events FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER set_user_roles_updated_at BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_candidates_updated_at BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_document_types_updated_at BEFORE UPDATE ON public.document_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_travel_updated_at BEFORE UPDATE ON public.travel_details FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.claim_initial_admin()
RETURNS public.app_role LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(9182601);
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles) THEN RAISE EXCEPTION 'Initial administrator already exists'; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (auth.uid(), 'Admin');
  RETURN 'Admin';
END $$;
GRANT EXECUTE ON FUNCTION public.claim_initial_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_role(_roles public.app_role[])
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = ANY(_roles)) THEN RAISE EXCEPTION 'Forbidden'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.add_candidate(_candidate_number text, _name text, _email text, _phone text, _skills text[], _experience_years numeric, _rating numeric, _passport_number text DEFAULT NULL, _passport_expiry date DEFAULT NULL)
RETURNS public.candidates LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.candidates;
BEGIN
  PERFORM public.assert_role(ARRAY['Data Entry','Admin']::public.app_role[]);
  INSERT INTO public.candidates(candidate_number,name,email,phone,skills,experience_years,rating,status,passport_number,passport_expiry,created_by)
  VALUES (trim(_candidate_number),trim(_name),nullif(trim(_email),''),nullif(trim(_phone),''),coalesce(_skills,'{}'),_experience_years,_rating,'Available',nullif(trim(_passport_number),''),_passport_expiry,auth.uid()) RETURNING * INTO _row;
  INSERT INTO public.audit_events(candidate_id,action,new_status,actor_id) VALUES (_row.id,'Candidate created','Available',auth.uid());
  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.add_candidate(text,text,text,text,text[],numeric,numeric,text,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_candidate_details(_candidate_id uuid, _name text, _email text, _phone text, _skills text[], _experience_years numeric, _rating numeric, _passport_number text DEFAULT NULL, _passport_expiry date DEFAULT NULL)
RETURNS public.candidates LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.candidates;
BEGIN
  PERFORM public.assert_role(ARRAY['Data Entry','Admin']::public.app_role[]);
  UPDATE public.candidates SET name=trim(_name),email=nullif(trim(_email),''),phone=nullif(trim(_phone),''),skills=coalesce(_skills,'{}'),experience_years=_experience_years,rating=_rating,passport_number=nullif(trim(_passport_number),''),passport_expiry=_passport_expiry WHERE id=_candidate_id RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Candidate not found'; END IF;
  INSERT INTO public.audit_events(candidate_id,action,actor_id) VALUES (_candidate_id,'Candidate details updated',auth.uid());
  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.update_candidate_details(uuid,text,text,text,text[],numeric,numeric,text,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.append_candidate_remark(_candidate_id uuid, _text text)
RETURNS public.candidate_remarks LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.candidate_remarks;
BEGIN
  PERFORM public.assert_role(ARRAY['Data Entry','Recruiter','Project Coordinator','Mobilisation Executive','Admin']::public.app_role[]);
  INSERT INTO public.candidate_remarks(candidate_id,author_id,text) VALUES (_candidate_id,auth.uid(),trim(_text)) RETURNING * INTO _row;
  INSERT INTO public.audit_events(candidate_id,action,actor_id,details) VALUES (_candidate_id,'Remark appended',auth.uid(),jsonb_build_object('remark_id',_row.id));
  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.append_candidate_remark(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_candidate_document(_candidate_id uuid, _document_type_id uuid, _file_name text, _storage_path text, _expiry_date date DEFAULT NULL)
RETURNS public.candidate_documents LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.candidate_documents;
BEGIN
  PERFORM public.assert_role(ARRAY['Data Entry','Project Coordinator','Mobilisation Executive','Admin']::public.app_role[]);
  INSERT INTO public.candidate_documents(candidate_id,document_type_id,file_name,storage_path,expiry_date,uploaded_by) VALUES (_candidate_id,_document_type_id,_file_name,_storage_path,_expiry_date,auth.uid()) RETURNING * INTO _row;
  UPDATE public.document_types SET usage_count=usage_count+1 WHERE id=_document_type_id;
  INSERT INTO public.audit_events(candidate_id,action,actor_id,details) VALUES (_candidate_id,'Document uploaded',auth.uid(),jsonb_build_object('document_id',_row.id,'file_name',_file_name));
  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.record_candidate_document(uuid,uuid,text,text,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_candidate_to_project(_candidate_id uuid, _project_id uuid)
RETURNS public.candidates LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.candidates;
BEGIN
  PERFORM public.assert_role(ARRAY['Recruiter','Admin']::public.app_role[]);
  UPDATE public.candidates SET status='Assigned',current_project_id=_project_id WHERE id=_candidate_id AND status='Available' AND current_project_id IS NULL RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Candidate is not available'; END IF;
  INSERT INTO public.audit_events(candidate_id,project_id,action,previous_status,new_status,actor_id) VALUES (_candidate_id,_project_id,'Candidate assigned to project','Available','Assigned',auth.uid());
  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.assign_candidate_to_project(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.change_candidate_stage(_candidate_id uuid, _next public.candidate_status)
RETURNS public.candidates LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _current public.candidate_status; _role public.app_role; _row public.candidates; _project uuid; _allowed boolean := false;
BEGIN
  SELECT role INTO _role FROM public.user_roles WHERE user_id=auth.uid();
  SELECT status,current_project_id INTO _current,_project FROM public.candidates WHERE id=_candidate_id FOR UPDATE;
  IF _role='Admin' THEN _allowed := _current<>_next;
  ELSIF _role='Project Coordinator' THEN
    _allowed := (_current='Assigned' AND _next='Shortlisted') OR (_current='Shortlisted' AND _next IN ('Interview','Available')) OR (_current='Interview' AND _next IN ('Medical','Available')) OR (_current='On Site' AND _next IN ('R&R','Available')) OR (_current='R&R' AND _next IN ('On Site','Available'));
  ELSIF _role='Mobilisation Executive' THEN
    _allowed := (_current='Medical' AND _next='Visa') OR (_current='Visa' AND _next='Mobilisation') OR (_current='Mobilisation' AND _next='On Site');
  END IF;
  IF NOT _allowed THEN RAISE EXCEPTION 'Forbidden stage transition'; END IF;
  IF _next IN ('Visa','Mobilisation','On Site') AND EXISTS (
    SELECT 1 FROM public.project_stage_requirements r WHERE r.project_id=_project AND r.stage=_current::text::public.requirement_stage
    AND NOT EXISTS (SELECT 1 FROM public.candidate_documents d WHERE d.candidate_id=_candidate_id AND d.document_type_id=r.document_type_id)
  ) THEN RAISE EXCEPTION 'Required documents are incomplete'; END IF;
  UPDATE public.candidates SET status=_next,current_project_id=CASE WHEN _next='Available' THEN NULL ELSE current_project_id END WHERE id=_candidate_id RETURNING * INTO _row;
  INSERT INTO public.audit_events(candidate_id,project_id,action,previous_status,new_status,actor_id) VALUES (_candidate_id,_project,CASE WHEN _next='Available' AND _current IN ('Shortlisted','Interview') THEN 'Candidate rejected and returned to Available' WHEN _next='Available' THEN 'Candidate marked EOC and returned to Available' ELSE 'Candidate stage changed' END,_current,_next,auth.uid());
  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.change_candidate_stage(uuid,public.candidate_status) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_travel_details(_candidate_id uuid,_flight_date date,_flight_number text,_departure text,_arrival text)
RETURNS public.travel_details LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.travel_details;
BEGIN
  PERFORM public.assert_role(ARRAY['Mobilisation Executive','Admin']::public.app_role[]);
  INSERT INTO public.travel_details(candidate_id,flight_date,flight_number,departure_airport,arrival_airport,updated_by) VALUES (_candidate_id,_flight_date,upper(trim(_flight_number)),upper(trim(_departure)),upper(trim(_arrival)),auth.uid()) ON CONFLICT(candidate_id) DO UPDATE SET flight_date=excluded.flight_date,flight_number=excluded.flight_number,departure_airport=excluded.departure_airport,arrival_airport=excluded.arrival_airport,updated_by=auth.uid() RETURNING * INTO _row;
  INSERT INTO public.audit_events(candidate_id,action,actor_id,details) VALUES (_candidate_id,'Travel details updated',auth.uid(),jsonb_build_object('flight_date',_flight_date,'flight_number',_flight_number));
  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.set_travel_details(uuid,date,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_stage_requirement(_project_id uuid,_stage public.requirement_stage,_document_name text,_category public.document_category DEFAULT 'candidate')
RETURNS public.project_stage_requirements LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _role public.app_role; _type_id uuid; _row public.project_stage_requirements;
BEGIN
  SELECT role INTO _role FROM public.user_roles WHERE user_id=auth.uid();
  IF _role NOT IN ('Recruiter','Project Coordinator','Mobilisation Executive','Admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _role='Recruiter' AND _stage<>'Assigned' THEN RAISE EXCEPTION 'Forbidden stage'; END IF;
  IF _role='Project Coordinator' AND _stage NOT IN ('Shortlisted','Interview','Selected') THEN RAISE EXCEPTION 'Forbidden stage'; END IF;
  IF _role='Mobilisation Executive' AND _stage NOT IN ('Medical','Visa','Mobilisation') THEN RAISE EXCEPTION 'Forbidden stage'; END IF;
  INSERT INTO public.document_types(name,category,created_by) VALUES (trim(_document_name),_category,auth.uid()) ON CONFLICT(normalized_name,category) DO UPDATE SET name=public.document_types.name RETURNING id INTO _type_id;
  INSERT INTO public.project_stage_requirements(project_id,stage,document_type_id,created_by) VALUES (_project_id,_stage,_type_id,auth.uid()) ON CONFLICT(project_id,stage,document_type_id) DO UPDATE SET project_id=excluded.project_id RETURNING * INTO _row;
  UPDATE public.document_types SET usage_count=(SELECT count(*) FROM public.project_stage_requirements WHERE document_type_id=_type_id) WHERE id=_type_id;
  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.add_stage_requirement(uuid,public.requirement_stage,text,public.document_category) TO authenticated;

CREATE OR REPLACE FUNCTION public.deactivate_document_type(_document_type_id uuid)
RETURNS public.document_types LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.document_types;
BEGIN
  PERFORM public.assert_role(ARRAY['Admin']::public.app_role[]);
  UPDATE public.document_types SET is_active=false WHERE id=_document_type_id RETURNING * INTO _row;
  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.deactivate_document_type(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.assert_role(public.app_role[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_role(public.app_role[]) TO authenticated, service_role;